/**
 * Inngest Function: Assessment Scheduled-Send Cron (Wave D auto-send backstop).
 *
 * Runs every 3 minutes (matching the existing assessment cron cadence) and does
 * two things, both of which emit the fan-out event `ASSESSMENT_SEND_INVITES_EVENT`
 * (the fan-out's CAS claim makes every emit idempotent — a redundant emit is a
 * harmless no-op):
 *
 *   1. DUE SWEEP — the trigger for future-dated ("When the campaign opens")
 *      campaigns. Finds DRAFT/ACTIVE + ON_OPEN campaigns whose openAt has passed
 *      and that have not yet been claimed or sent, and emits the fan-out for each.
 *      (IMMEDIATELY campaigns are sent on activation by the API path, not here.)
 *
 *   2. STALE-CLAIM RECOVERY — a self-heal for a dead/stalled fan-out run. A run
 *      that crashed mid-flight leaves inviteSendStartedAt set (the CAS claim) but
 *      invitesSentAt null, and stops updating inviteSendHeartbeatAt. Once the
 *      heartbeat is older than STALE_MS we reset the claim (so the fan-out can
 *      re-claim) and re-emit the fan-out.
 *
 * ---------------------------------------------------------------------------
 * Why reset+re-emit can't double-send
 * ---------------------------------------------------------------------------
 *   - The fan-out is `concurrency: { key: campaignId, limit: 1 }`. If the
 *     original run is somehow still alive, the re-emitted run serializes behind
 *     it (never runs in parallel). If the original is truly dead, freeing the
 *     claim lets the re-emit re-claim and finish the remaining batches.
 *   - `sendInvitesBatch` skips any AssessmentInvitation already in
 *     SENT/VIEWED/SUBMITTED, so already-delivered invites are never re-sent.
 *   - The reset `updateMany` is guarded on the SAME stale predicate (incl.
 *     `invitesSentAt IS NULL`), so a run that completed between our read and
 *     our write matches 0 rows → we do NOT re-emit (count === 0 ⇒ skip).
 *
 * SEC-M5: the emitted event payload is `{ campaignId }` ONLY — never tokens,
 * emails, or URLs. The fan-out re-loads everything from the DB.
 *
 * Design for testability mirrors `drainLeadOutbox` / `runInviteFanout`: the
 * sweep lives in the pure `runScheduledSendSweep(deps)` (db, sendEvent, clock,
 * and flag checks all injected), and the Inngest fn is a thin wrapper.
 */

import { inngest } from "@/inngest/client";
import { db } from "@/lib/db";
import { ASSESSMENT_SEND_INVITES_EVENT } from "@/inngest/functions/assessment-invite-fanout";
import {
  waveDAutoSendEnabled,
  assessmentSendsPaused,
} from "@/lib/assessments/wave-d-feature-flags";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/**
 * A claimed run is considered DEAD once its last heartbeat (or, if it never
 * wrote one, its claim time) is older than this. 10 minutes is well beyond a
 * normal fan-out: the largest batch is ≤25 emails and the fn heartbeats before
 * each batch, so a healthy multi-batch run ticks far more frequently than this.
 */
export const STALE_MS = 10 * 60 * 1000;

/** Bounded page size so a backlog can't blow up a single cron tick. */
export const DUE_PAGE_SIZE = 100;
export const STALE_PAGE_SIZE = 100;

// ---------------------------------------------------------------------------
// Injected surfaces
// ---------------------------------------------------------------------------

/** A row from the stale-claim scan. */
interface StaleClaimRow {
  id: string;
  inviteSendStartedAt: Date | string | null;
  inviteSendHeartbeatAt: Date | string | null;
}

/** Narrow Prisma surface this sweep drives on AssessmentCampaign. */
export interface ScheduledSendSweepDb {
  assessmentCampaign: {
    findMany(args: unknown): Promise<unknown[]>;
    updateMany(args: unknown): Promise<{ count: number }>;
  };
}

export interface ScheduledSendSweepDeps {
  db: ScheduledSendSweepDb;
  /** Emits the fan-out event. `inngest.send` in prod. */
  sendEvent: (event: {
    name: typeof ASSESSMENT_SEND_INVITES_EVENT;
    data: { campaignId: string };
  }) => Promise<unknown>;
  /** Global kill-switch check. */
  isPaused: () => boolean;
  /** Wave-D auto-send flag check. */
  isAutoSendEnabled: () => boolean;
  /** Injectable clock. */
  now: () => Date;
}

export interface ScheduledSendSweepResult {
  dueEmitted: number;
  staleRecovered: number;
}

// ---------------------------------------------------------------------------
// Pure sweep
// ---------------------------------------------------------------------------

function toDate(v: Date | string | null): Date | null {
  return v === null ? null : v instanceof Date ? v : new Date(v);
}

export async function runScheduledSendSweep(
  deps: ScheduledSendSweepDeps,
): Promise<ScheduledSendSweepResult> {
  // 1. Short-circuit — kill switch / dark-launch gate. Do NOT touch the DB.
  if (deps.isPaused() || !deps.isAutoSendEnabled()) {
    return { dueEmitted: 0, staleRecovered: 0 };
  }

  const now = deps.now();

  // 2. DUE SWEEP — future-dated ON_OPEN campaigns whose openAt has passed and
  //    that are not yet claimed or sent. NO SCHEDULED status exists — the gate
  //    is inviteTiming=ON_OPEN + openAt<=now (the campaign can be DRAFT or
  //    ACTIVE). The partial index idx_campaign_due_unsent backs this.
  const due = (await deps.db.assessmentCampaign.findMany({
    where: {
      status: { in: ["DRAFT", "ACTIVE"] },
      inviteTiming: "ON_OPEN",
      openAt: { lte: now },
      invitesSentAt: null,
      inviteSendStartedAt: null,
      deletedAt: null,
    },
    select: { id: true },
    take: DUE_PAGE_SIZE,
  })) as Array<{ id: string }>;

  let dueEmitted = 0;
  for (const c of due) {
    await deps.sendEvent({
      name: ASSESSMENT_SEND_INVITES_EVENT,
      data: { campaignId: c.id },
    });
    dueEmitted++;
  }

  // 3. STALE-CLAIM RECOVERY — claimed (inviteSendStartedAt set) but not yet
  //    completed (invitesSentAt null) and not deleted. We over-fetch the
  //    claimed set (the staleness comparison against the heartbeat is in JS,
  //    since "heartbeat older than (now - STALE_MS) OR null" isn't a clean
  //    single Prisma filter) and decide per-row.
  const claimed = (await deps.db.assessmentCampaign.findMany({
    where: {
      inviteSendStartedAt: { not: null },
      invitesSentAt: null,
      deletedAt: null,
    },
    select: {
      id: true,
      inviteSendStartedAt: true,
      inviteSendHeartbeatAt: true,
    },
    take: STALE_PAGE_SIZE,
  })) as StaleClaimRow[];

  const staleCutoff = now.getTime() - STALE_MS;

  let staleRecovered = 0;
  for (const row of claimed) {
    const heartbeat = toDate(row.inviteSendHeartbeatAt);
    // Heartbeat-null handling: a claim that never wrote a heartbeat is judged
    // by its claim time instead, so an immediately-dead run is still recovered.
    const liveness = heartbeat ?? toDate(row.inviteSendStartedAt);
    if (liveness === null) {
      // Defensive: a claimed row with no claim time shouldn't exist. Skip.
      continue;
    }
    if (liveness.getTime() >= staleCutoff) {
      // Fresh — a live (possibly slow) run owns this. Leave it.
      continue;
    }

    // Reset the claim, GUARDED on the same stale predicate (incl. invitesSentAt
    // null) so we never reset a run that just completed or was re-claimed
    // between our read and this write. count === 0 ⇒ raced ⇒ do NOT re-emit.
    const reset = await deps.db.assessmentCampaign.updateMany({
      where: {
        id: row.id,
        inviteSendStartedAt: { not: null },
        invitesSentAt: null,
        deletedAt: null,
      },
      data: { inviteSendStartedAt: null },
    });

    if (reset.count === 0) {
      continue;
    }

    await deps.sendEvent({
      name: ASSESSMENT_SEND_INVITES_EVENT,
      data: { campaignId: row.id },
    });
    staleRecovered++;
  }

  return { dueEmitted, staleRecovered };
}

// ---------------------------------------------------------------------------
// Inngest cron function — thin wrapper around runScheduledSendSweep
// ---------------------------------------------------------------------------

export const assessmentScheduledSendCron = inngest.createFunction(
  { id: "assessment-scheduled-send-cron" },
  { cron: "*/3 * * * *" },
  async ({ step }) => {
    return step.run("scheduled-send-sweep", () =>
      runScheduledSendSweep({
        db: db as unknown as ScheduledSendSweepDb,
        sendEvent: (event) => inngest.send(event),
        isPaused: assessmentSendsPaused,
        isAutoSendEnabled: waveDAutoSendEnabled,
        now: () => new Date(),
      }),
    );
  },
);
