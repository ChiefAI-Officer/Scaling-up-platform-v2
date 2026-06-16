/**
 * Inngest Function: Assessment Invite Fan-Out (Wave D auto-send engine).
 *
 * Sends a campaign's invitations in durable, ≤25-recipient batches. Safe under
 * replay / concurrency (never double-sends) and aborts cleanly if the campaign
 * is deleted or sends are paused mid-flight.
 *
 * ---------------------------------------------------------------------------
 * Why this is double-defended against double-send (R1-H2, SEC-M5)
 * ---------------------------------------------------------------------------
 *   1. Per-campaign concurrency = 1 (Inngest `concurrency: { key, limit: 1 }`):
 *      two runs for the SAME campaignId can never execute in parallel, so the
 *      read-then-act window inside `sendInvitesBatch` cannot interleave.
 *   2. CAS claim (`updateMany` guarded on inviteSendStartedAt/invitesSentAt/
 *      deletedAt all null): a replay or redundant cron emit that arrives after
 *      a run already claimed/finished sees count=0 → early no-op return.
 *   3. Per-recipient ledger: each batch step is durably memoized by Inngest
 *      (a replay won't re-run a COMPLETED step), and `sendInvitesBatch` itself
 *      skips any AssessmentInvitation already in SENT/VIEWED/SUBMITTED.
 *
 * ---------------------------------------------------------------------------
 * Claim / abort / release semantics
 * ---------------------------------------------------------------------------
 *   - CLAIM: CAS sets inviteSendStartedAt = now. count=0 → already
 *     claimed/sent/deleted → return early.
 *   - DELETE (deletedAt set, at pre-flight OR mid-run): ABORT and DO NOT
 *     release the claim. The campaign is gone; leaving inviteSendStartedAt set
 *     prevents any later run from picking it up. invitesSentAt stays null.
 *   - PAUSE / FLAG-OFF (at pre-flight): ABORT and RELEASE the claim
 *     (inviteSendStartedAt → null) so a later run (after un-pause / flag-flip)
 *     can re-claim and send. invitesSentAt stays null.
 *   - PAUSE / DELETE mid-run (between batches): ABORT the remaining batches.
 *     Already-sent batches stay sent (partial send is acceptable; the rest can
 *     resume — pause leaves the claim, the stale-claim cron recovers it).
 *   - COMPLETE: all batches done → set invitesSentAt = now (+ flip ON_OPEN
 *     DRAFT → ACTIVE).
 *
 * SEC-M5: the trigger event payload is `{ campaignId }` ONLY — never tokens,
 * emails, or URLs. Everything is re-loaded from the DB inside the run.
 *
 * Design for testability mirrors `drainLeadOutbox` / `sendInvitesBatch`: the
 * orchestration lives in the pure `runInviteFanout(deps, input)` (db, mailer,
 * clock, flag checks, and the step runner are all injected), and the Inngest
 * fn is a thin wrapper.
 */

import { inngest } from "@/inngest/client";
import { db } from "@/lib/db";
import { sendAssessmentInvitationEmail } from "@/services/notifications";
import { resolveCoachName } from "@/lib/assessments/invitation-email";
import {
  sendInvitesBatch as realSendInvitesBatch,
  INVITE_BATCH_CAP,
  type InviteMailer,
  type SendInvitesDeps,
  type SendInvitesInput,
  type SendInvitesResult,
} from "@/lib/assessments/invite-send";
import {
  waveDAutoSendEnabled,
  assessmentSendsPaused,
} from "@/lib/assessments/wave-d-feature-flags";
import { ASSESSMENT_SEND_INVITES_EVENT } from "./assessment-invite-fanout-event";

// ---------------------------------------------------------------------------
// Event
// ---------------------------------------------------------------------------

/**
 * Trigger event. Payload is `{ campaignId }` ONLY (SEC-M5).
 *
 * Re-exported (imported above) from a side-effect-free constants module so
 * non-Inngest callers — e.g. the campaign-create route's post-commit emit —
 * can import the name WITHOUT evaluating this function definition.
 */
export { ASSESSMENT_SEND_INVITES_EVENT };

export interface FanoutInput {
  campaignId: string;
}

// ---------------------------------------------------------------------------
// Injected surfaces
// ---------------------------------------------------------------------------

/** The campaign row the fan-out loads (+ relations needed to render emails). */
interface FanoutCampaignRow {
  id: string;
  name: string;
  alias: string;
  closeAt: Date | null;
  status: string;
  inviteTiming: string;
  deletedAt: Date | null;
  invitationSubject: string | null;
  invitationBodyMarkdown: string | null;
  invitationBodyHtml: string | null;
  template: {
    name: string;
    invitationSubject: string;
    invitationBodyMarkdown: string;
  };
  organization: {
    name: string | null;
    owner: { firstName: string; lastName: string } | null;
  } | null;
  creatorCoach: { firstName: string; lastName: string } | null;
  participants: Array<{
    respondentId: string;
    respondent: {
      id: string;
      firstName: string;
      lastName: string;
      email: string;
      deletedAt: Date | null;
    } | null;
  }>;
}

/** Narrow Prisma surface this fan-out drives on AssessmentCampaign. */
export interface FanoutCampaignDb {
  assessmentCampaign: {
    updateMany(args: unknown): Promise<{ count: number }>;
    findUnique(args: unknown): Promise<FanoutCampaignRow | null>;
  };
}

export interface InviteFanoutDeps {
  db: FanoutCampaignDb;
  /** The real per-recipient invitation mailer. */
  sendEmail: InviteMailer;
  /** Shared per-recipient create+send (injected so tests can stub it). */
  sendInvitesBatch?: (
    deps: SendInvitesDeps,
    input: SendInvitesInput,
  ) => Promise<SendInvitesResult>;
  /** Global kill-switch check. */
  isPaused: () => boolean;
  /** Wave-D auto-send flag check. */
  isAutoSendEnabled: () => boolean;
  /** Injectable clock. */
  now: () => Date;
  /** Durable step runner — `step.run` in prod, `(name, fn) => fn()` in tests. */
  runStep: <T>(name: string, fn: () => T | Promise<T>) => Promise<T>;
  /** Absolute base URL for invitation links (APP_URL). */
  baseUrl: string;
}

export type FanoutResult =
  | { claimed: false }
  | {
      claimed: true;
      aborted: true;
      reason:
        | "not-found"
        | "deleted"
        | "paused"
        | "flag-off"
        | "deleted-mid-run"
        | "paused-mid-run";
    }
  | { claimed: true; aborted: false; sent: number; batches: number };

// ---------------------------------------------------------------------------
// Pure orchestration
// ---------------------------------------------------------------------------

function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    out.push(items.slice(i, i + size));
  }
  return out;
}

export async function runInviteFanout(
  deps: InviteFanoutDeps,
  input: FanoutInput,
): Promise<FanoutResult> {
  const { campaignId } = input;
  const now = deps.now();
  const sendBatch = deps.sendInvitesBatch ?? realSendInvitesBatch;

  // -------------------------------------------------------------------------
  // 1. CAS claim — at most one run ever proceeds past here for a campaign.
  // -------------------------------------------------------------------------
  const claim = await deps.runStep("claim", () =>
    deps.db.assessmentCampaign.updateMany({
      where: {
        id: campaignId,
        inviteSendStartedAt: null,
        invitesSentAt: null,
        deletedAt: null,
      },
      data: { inviteSendStartedAt: now },
    }),
  );

  if (claim.count === 0) {
    // Already claimed / already sent / deleted → idempotent no-op.
    return { claimed: false };
  }

  // -------------------------------------------------------------------------
  // 2. Pre-flight guards (after claim).
  // -------------------------------------------------------------------------
  const loaded = await deps.runStep("preflight-load", () =>
    deps.db.assessmentCampaign.findUnique({
      where: { id: campaignId },
      include: {
        template: {
          select: {
            name: true,
            invitationSubject: true,
            invitationBodyMarkdown: true,
          },
        },
        organization: {
          select: {
            name: true,
            owner: { select: { firstName: true, lastName: true } },
          },
        },
        creatorCoach: { select: { firstName: true, lastName: true } },
        participants: {
          include: {
            respondent: {
              select: {
                id: true,
                firstName: true,
                lastName: true,
                email: true,
                deletedAt: true,
              },
            },
          },
        },
      },
    }),
  );

  // Campaign vanished after claim (race / hard delete). Nothing to release that
  // matters — leave whatever row state exists; abort.
  if (!loaded) {
    return { claimed: true, aborted: true, reason: "not-found" };
  }

  // FIX 1 (CRITICAL): real Inngest JSON-serializes every step.run return, so
  // every Date read back from `preflight-load` is actually an ISO STRING. Most
  // notably `closeAt` flows into sendInvitesBatch as `expiresAt` AND into the
  // mailer, which calls `closeAt.toLocaleDateString(...)` — a TypeError on a
  // string for any campaign with closeAt set. Rehydrate every Date field at the
  // step boundary (repo convention — see process-payment-completed.ts).
  const rehydrateDate = (v: Date | string | null): Date | null =>
    v === null ? null : new Date(v as unknown as string);
  const campaign = {
    ...loaded,
    closeAt: rehydrateDate(loaded.closeAt),
    deletedAt: rehydrateDate(loaded.deletedAt),
    participants: loaded.participants.map((p) => ({
      ...p,
      respondent: p.respondent
        ? {
            ...p.respondent,
            deletedAt: rehydrateDate(p.respondent.deletedAt),
          }
        : null,
    })),
  };

  // Deleted → abort, DO NOT release (leave the claim so nothing re-picks it up).
  if (campaign.deletedAt) {
    return { claimed: true, aborted: true, reason: "deleted" };
  }

  // Paused or flag OFF → abort + RELEASE the claim so a later run can pick it up.
  if (deps.isPaused()) {
    await releaseClaim(deps, campaignId);
    return { claimed: true, aborted: true, reason: "paused" };
  }
  if (!deps.isAutoSendEnabled()) {
    await releaseClaim(deps, campaignId);
    return { claimed: true, aborted: true, reason: "flag-off" };
  }

  // -------------------------------------------------------------------------
  // 3. Build recipient set + chunk into ≤ INVITE_BATCH_CAP.
  // -------------------------------------------------------------------------
  const recipients = campaign.participants
    .filter((p) => p.respondent && p.respondent.deletedAt === null)
    .map((p) => ({
      respondentId: p.respondentId,
      respondent: {
        id: p.respondent!.id,
        firstName: p.respondent!.firstName,
        lastName: p.respondent!.lastName,
        email: p.respondent!.email,
      },
    }));

  const coachName = resolveCoachName(
    campaign.creatorCoach ?? null,
    campaign.organization?.owner ?? null,
  );
  const organizationName = campaign.organization?.name ?? null;
  const templateName = campaign.template?.name ?? null;

  const batches = chunk(recipients, INVITE_BATCH_CAP);

  // -------------------------------------------------------------------------
  // 4. Send each chunk in its own durable step.
  // -------------------------------------------------------------------------
  // Aggregate per-recipient outcomes across ALL batches so completion can
  // distinguish "made progress" from "nothing got through" (FIX 2).
  let totalSent = 0;
  let totalAlready = 0;
  let totalFailed = 0;
  for (let i = 0; i < batches.length; i++) {
    const batch = batches[i];

    // Re-check delete + pause BEFORE each batch — abort remaining if either
    // flipped mid-run (R1-M7 / SEC-M5). Already-sent batches stay sent.
    const fresh = await deps.runStep(`recheck-${i + 1}`, () =>
      deps.db.assessmentCampaign.findUnique({
        where: { id: campaignId },
        select: { deletedAt: true },
      } as unknown as Parameters<
        FanoutCampaignDb["assessmentCampaign"]["findUnique"]
      >[0]),
    );
    if (fresh?.deletedAt) {
      return { claimed: true, aborted: true, reason: "deleted-mid-run" };
    }
    if (deps.isPaused()) {
      return { claimed: true, aborted: true, reason: "paused-mid-run" };
    }

    // Heartbeat: prove this run is alive so the stale-claim cron can tell a
    // dead run apart from a slow one. id-scoped updateMany (no count read).
    // FIX 3: write a FRESH deps.now() per batch — a single captured value makes
    // a slow-but-alive multi-batch run indistinguishable from a dead one and
    // defeats the stale-claim cron.
    await deps.runStep(`heartbeat-${i + 1}`, () =>
      deps.db.assessmentCampaign.updateMany({
        where: { id: campaignId },
        data: { inviteSendHeartbeatAt: deps.now() },
      }),
    );

    const result = await deps.runStep(`send-batch-${i + 1}`, () =>
      sendBatch(
        { db: deps.db as unknown as SendInvitesDeps["db"], sendEmail: deps.sendEmail, now: deps.now },
        {
          campaign: {
            id: campaign.id,
            name: campaign.name,
            alias: campaign.alias,
            closeAt: campaign.closeAt,
            invitationSubject: campaign.invitationSubject,
            invitationBodyMarkdown: campaign.invitationBodyMarkdown,
            invitationBodyHtml: campaign.invitationBodyHtml,
            template: {
              invitationSubject: campaign.template.invitationSubject,
              invitationBodyMarkdown: campaign.template.invitationBodyMarkdown,
            },
          },
          recipients: batch,
          baseUrl: deps.baseUrl,
          organizationName,
          coachName,
          templateName,
        },
      ),
    );
    totalSent += result.sent.length;
    totalAlready += result.skipped.length;
    totalFailed += result.failed.length;
  }

  // -------------------------------------------------------------------------
  // 5. Completion (FIX 2) — distinguish "made progress" from "total outage".
  // -------------------------------------------------------------------------
  // `sendInvitesBatch` swallows per-recipient SMTP failures (returns failed[],
  // never throws). If EVERY recipient failed (zero sent, zero already-SENT, ≥1
  // failed) nothing reached anyone — marking sent here would falsely complete
  // the campaign AND, because invitesSentAt would be set, the CAS claim could
  // never fire again → permanently un-reclaimable with zero emails delivered.
  // So: release the claim and throw, letting Inngest retry / the cron re-claim.
  // A PARTIAL failure (some sent, some failed) still completes — the bad
  // addresses stay PENDING and are resendable via /resend (avoids forever-stuck
  // on one bad address).
  const madeProgress = totalSent > 0 || totalAlready > 0;
  if (!madeProgress && totalFailed > 0) {
    await releaseClaim(deps, campaignId);
    throw new Error(
      `Assessment invite fan-out for campaign ${campaignId} delivered zero ` +
        `invitations (${totalFailed} failed, 0 sent) — releasing claim for retry.`,
    );
  }

  // Mark sent — set invitesSentAt REGARDLESS (completion is real progress).
  const flipToActive =
    campaign.inviteTiming === "ON_OPEN" && campaign.status === "DRAFT";

  await deps.runStep("mark-sent", () =>
    deps.db.assessmentCampaign.updateMany({
      where: {
        id: campaignId,
        // FIX 4: status-guard the DRAFT→ACTIVE flip so an admin who moved the
        // campaign out of DRAFT mid-run isn't flipped back to ACTIVE. Only
        // applied when we intend to flip — invitesSentAt is set unconditionally
        // by the separate release-status-less write below when no flip applies,
        // OR carried on this guarded write when it does (the DRAFT guard can
        // only fail if the admin already moved it out of DRAFT, in which case
        // the follow-up unguarded write still records invitesSentAt).
        ...(flipToActive ? { status: "DRAFT" } : {}),
      },
      data: {
        invitesSentAt: now,
        ...(flipToActive ? { status: "ACTIVE" } : {}),
      },
    }),
  );

  // FIX 4 (cont.): if we attempted a status-guarded flip, the guarded write
  // above is a no-op when the campaign is no longer DRAFT — which would also
  // drop invitesSentAt. Record invitesSentAt unconditionally so completion is
  // never lost just because the flip was guarded out.
  if (flipToActive) {
    await deps.runStep("mark-sent-fallback", () =>
      deps.db.assessmentCampaign.updateMany({
        where: { id: campaignId, invitesSentAt: null },
        data: { invitesSentAt: now },
      }),
    );
  }

  return { claimed: true, aborted: false, sent: totalSent, batches: batches.length };
}

/** Release the CAS claim so a later run can re-pick the campaign up. */
async function releaseClaim(
  deps: InviteFanoutDeps,
  campaignId: string,
): Promise<void> {
  await deps.runStep("release-claim", () =>
    deps.db.assessmentCampaign.updateMany({
      where: { id: campaignId },
      data: { inviteSendStartedAt: null },
    }),
  );
}

// ---------------------------------------------------------------------------
// Inngest function — thin wrapper around runInviteFanout
// ---------------------------------------------------------------------------

export const assessmentInviteFanout = inngest.createFunction(
  {
    id: "assessment-invite-fanout",
    // Per-campaign concurrency = 1: Inngest serializes runs for the same
    // campaignId so the read-then-act window in sendInvitesBatch can never
    // interleave. Primary defense against double-send (R1-H2).
    concurrency: { key: "event.data.campaignId", limit: 1 },
    retries: 3,
  },
  { event: ASSESSMENT_SEND_INVITES_EVENT },
  async ({ event, step }) => {
    const { campaignId } = event.data;

    return runInviteFanout(
      {
        db: db as unknown as FanoutCampaignDb,
        sendEmail: sendAssessmentInvitationEmail,
        isPaused: assessmentSendsPaused,
        isAutoSendEnabled: waveDAutoSendEnabled,
        now: () => new Date(),
        // Inngest's step.run serializes the return value (Jsonify), so its
        // inferred type differs from the runner's generic T. The values we read
        // back (claim count, campaign row, deletedAt) are JSON-safe, so cast.
        runStep: <T>(name: string, fn: () => T | Promise<T>) =>
          step.run(name, fn) as Promise<T>,
        baseUrl: process.env.APP_URL ?? "http://localhost:3000",
      },
      { campaignId },
    );
  },
);
