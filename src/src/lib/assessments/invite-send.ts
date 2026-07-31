/**
 * Assessment v7.6 — shared per-recipient invite-create + send (Wave D, R1-M6).
 *
 * The SINGLE source of truth for turning a campaign + a list of recipients into
 * sent AssessmentInvitation rows. Called from BOTH:
 *   - the manual POST /api/assessment-campaigns/[id]/invite route (late-add / resend), and
 *   - the Wave-D auto-send Inngest fan-out (a later task), in ≤ INVITE_BATCH_CAP chunks.
 *
 * Design for testability mirrors the lead-outbox drainer: the logic is pure of
 * globals — `db` and the mailer are injected as `deps` — so both an API route
 * and an Inngest step wire their own concrete implementations.
 *
 * Per-recipient idempotency ledger = AssessmentInvitation.status:
 *   - new recipient (no row)        → create PENDING → send → flip SENT     ("sent")
 *   - existing PENDING (re-sendable) → re-key fresh token → send → flip SENT ("sent")
 *   - existing SENT/VIEWED/SUBMITTED → NO-OP, never re-sent                  ("already-invited")
 *   - existing revoked (revokedAt)   → NO-OP                                 ("already-invited")
 *   - SMTP throw                     → row left PENDING (retry via /resend)  ("send-failed")
 *
 * Token rules preserved verbatim from the original route: a fresh raw token is
 * generated + hashed for every create/re-key; only PENDING rows are re-keyed
 * here (SENT/VIEWED already hold a live token — bump those via /resend without
 * rotating). expiresAt = campaign.closeAt ?? now + 90 days.
 */
import {
  generateRawToken,
  hashToken,
} from "@/lib/assessments/invitation-tokens";
import {
  classifyInvitationSendError,
  confirmStableInvitationToken,
  markStableInvitationTokenUncertain,
  quarantineRejectedStableInvitationToken,
  reconcileRejectedStableInvitationToken,
  registerNewOriginalToken,
  removeRegisteredStableInvitationToken,
  retryStableInvitationOperation,
  stageStableInvitationToken,
  type StableTokenDb,
  type StagedStableToken,
} from "@/lib/assessments/stable-invitation-tokens";

const NINETY_DAYS_MS = 90 * 24 * 60 * 60 * 1000;

/** Max recipients per call. Callers (the fan-out) chunk larger sets into ≤25. */
export const INVITE_BATCH_CAP = 25;

export type InviteSendStatus = "sent" | "already-invited" | "send-failed";

/** Minimal invitation-row shape returned by create/update + read by findMany. */
interface InvitationRow {
  id: string;
  expiresAt: Date;
}
interface ExistingInvitationRow {
  id: string;
  respondentId: string;
  status: string;
  revokedAt: Date | null;
}

/** Narrow Prisma surface — only the AssessmentInvitation ops this lib uses. */
export interface InviteSendDb {
  assessmentInvitation: {
    findMany(args: unknown): Promise<ExistingInvitationRow[]>;
    create(args: unknown): Promise<InvitationRow>;
    update(args: unknown): Promise<InvitationRow>;
  };
}

/** Mailer payload — exactly the payload `sendAssessmentInvitationEmail` accepts. */
export interface InviteEmailInput {
  invitation: { id: string; expiresAt: Date };
  respondent: { id: string; firstName: string; lastName: string; email: string };
  campaign: { id: string; name: string; alias: string; closeAt: Date | null };
  template: { alias: string; invitationSubject: string; invitationBodyMarkdown: string };
  /** Per-campaign full-HTML invitation override (#20) — REPLACES the shell when non-empty (+ flag on). */
  invitationBodyHtml?: string | null;
  organizationName: string | null;
  coachName: string | null;
  templateName: string | null;
  rawToken: string;
  baseUrl: string;
  /**
   * Wave P — invitation-email chrome variant (coach logo + larger CTA).
   * Callers evaluate `isInviteEmailChromeEnabled` once per send; the mailer
   * never reads the flag. Defaults to "legacy" (byte-identical output).
   */
  chrome?: "legacy" | "waveP";
  /** Wave P — coach logo (creator coach ?? org owner profileImage). Only rendered under chrome:"waveP" + https gate. */
  coachLogoUrl?: string | null;
}

/** Mailer call — exactly the payload `sendAssessmentInvitationEmail` accepts. */
export type InviteMailer = (data: InviteEmailInput) => Promise<void>;

export interface PreparedInviteEmail {
  send(): Promise<void>;
}

export interface StableOriginalTokenAdapter {
  stageExistingOriginal(input: {
    invitationId: string;
    tokenHash: string;
    expiresAt: Date;
  }): Promise<StagedStableToken>;
  registerOriginal(input: {
    invitationId: string;
    tokenHash: string;
  }): Promise<{ tokenId: string }>;
  confirm(input: {
    tokenId: string;
    invitationId: string;
    confirmedAt: Date;
  }): Promise<void>;
  uncertain(tokenId: string): Promise<void>;
  removeRegistered(tokenId: string): Promise<void>;
  rollbackRejected(staged: StagedStableToken): Promise<void>;
  reconcileRejected(staged: StagedStableToken): Promise<void>;
}

export interface RejectedCleanupAuditInput {
  campaignId: string;
  respondentId: string;
  invitationId: string;
  tokenId: string;
  disposition:
    | "DEFINITE_REJECTION_QUARANTINE_EXHAUSTED"
    | "DEFINITE_REJECTION_RECONCILIATION_EXHAUSTED";
}

export class StableInvitationCleanupAuditError extends Error {
  constructor() {
    super("Failed to persist stable invitation cleanup audit.");
    this.name = "StableInvitationCleanupAuditError";
  }
}

export class StableInvitationQuarantineError extends Error {
  constructor() {
    super("Failed to quarantine a definitely rejected invitation token.");
    this.name = "StableInvitationQuarantineError";
  }
}

export function createStableOriginalTokenAdapter(
  stableDb: StableTokenDb,
): StableOriginalTokenAdapter {
  return {
    stageExistingOriginal: (input) =>
      stageStableInvitationToken(stableDb, {
        invitationId: input.invitationId,
        newTokenHash: input.tokenHash,
        expiresAt: input.expiresAt,
        source: "ORIGINAL",
      }),
    registerOriginal: (input) => registerNewOriginalToken(stableDb, input),
    confirm: (input) =>
      confirmStableInvitationToken(stableDb, {
        ...input,
        reminder: false,
      }),
    uncertain: (tokenId) =>
      markStableInvitationTokenUncertain(stableDb, tokenId),
    removeRegistered: (tokenId) =>
      removeRegisteredStableInvitationToken(stableDb, tokenId),
    rollbackRejected: (staged) =>
      quarantineRejectedStableInvitationToken(stableDb, staged),
    reconcileRejected: (staged) =>
      reconcileRejectedStableInvitationToken(stableDb, staged),
  };
}

export interface SendInvitesDeps {
  db: InviteSendDb;
  sendEmail: InviteMailer;
  prepareEmail?: (data: InviteEmailInput) => PreparedInviteEmail;
  stableTokens?: StableOriginalTokenAdapter;
  persistRejectedCleanupAudit?: (
    input: RejectedCleanupAuditInput,
  ) => Promise<void>;
  /** Injectable clock (defaults to real now) — used for the fallback expiresAt. */
  now?: () => Date;
}

/** One recipient to invite — the participant's active respondent. */
export interface InviteRecipient {
  respondentId: string;
  respondent: {
    id: string;
    firstName: string;
    lastName: string;
    email: string;
  };
}

export interface SendInvitesInput {
  campaign: {
    id: string;
    name: string;
    alias: string;
    closeAt: Date | null;
    /** Per-campaign overrides (null → fall back to template defaults). */
    invitationSubject: string | null;
    invitationBodyMarkdown: string | null;
    /** Per-campaign full-HTML invitation override (#20) — REPLACES the shell when non-empty (+ flag on). */
    invitationBodyHtml?: string | null;
    template: {
      alias: string;
      invitationSubject: string;
      invitationBodyMarkdown: string;
    };
  };
  recipients: InviteRecipient[];
  baseUrl: string;
  organizationName?: string | null;
  coachName?: string | null;
  templateName?: string | null;
  /**
   * Wave P — invitation-email chrome variant, evaluated ONCE per send by the
   * caller (flag: `isInviteEmailChromeEnabled({ organizationId, templateId })`).
   * Defaults to "legacy".
   */
  chrome?: "legacy" | "waveP";
  /** Wave P — coach logo (creator coach ?? org owner profileImage; mirrors resolveCoachName). */
  coachLogoUrl?: string | null;
  stableLinksEnabled?: boolean;
}

export interface SendInvitesResult {
  /** respondentIds successfully created/re-keyed + emailed + flipped SENT. */
  sent: string[];
  /** respondentIds already in a terminal/in-flight state — no-op. */
  skipped: string[];
  /** respondentIds whose row write or SMTP send failed (row left PENDING). */
  failed: string[];
  /** Full per-recipient ledger, preserving the route's response shape. */
  results: Array<{ respondentId: string; status: InviteSendStatus }>;
}

/**
 * Create/send invitations for up to INVITE_BATCH_CAP recipients.
 *
 * Throws when `recipients.length > INVITE_BATCH_CAP` — the caller is responsible
 * for chunking (the fan-out calls this in ≤25 chunks; the route rejects >25
 * with a 400 before calling, to surface the limit to the UI).
 */
export async function sendInvitesBatch(
  deps: SendInvitesDeps,
  input: SendInvitesInput
): Promise<SendInvitesResult> {
  const { db, sendEmail } = deps;
  const now = deps.now ?? (() => new Date());
  const { campaign, recipients, baseUrl } = input;
  const organizationName = input.organizationName ?? null;
  const coachName = input.coachName ?? null;
  const templateName = input.templateName ?? null;
  const chrome = input.chrome ?? "legacy";
  const coachLogoUrl = input.coachLogoUrl ?? null;

  if (input.stableLinksEnabled && (!deps.stableTokens || !deps.prepareEmail)) {
    throw new Error(
      "Stable invitation dependencies are required when stable links are enabled.",
    );
  }

  if (recipients.length > INVITE_BATCH_CAP) {
    throw new Error(
      `Invite batch of ${recipients.length} exceeds INVITE_BATCH_CAP (${INVITE_BATCH_CAP}); caller must chunk.`
    );
  }

  const sent: string[] = [];
  const skipped: string[] = [];
  const failed: string[] = [];
  const results: Array<{ respondentId: string; status: InviteSendStatus }> = [];
  const recordFailure = (respondentId: string) => {
    failed.push(respondentId);
    results.push({ respondentId, status: "send-failed" });
  };

  if (recipients.length === 0) {
    return { sent, skipped, failed, results };
  }

  // Load existing invitation rows for this campaign + the target subset.
  const existing = await db.assessmentInvitation.findMany({
    where: {
      campaignId: campaign.id,
      respondentId: { in: recipients.map((r) => r.respondentId) },
    },
  });
  const existingByRespondentId = new Map(
    existing.map((row) => [row.respondentId, row])
  );

  const expiresAt = campaign.closeAt ?? new Date(now().getTime() + NINETY_DAYS_MS);

  for (const recipient of recipients) {
    const respondent = recipient.respondent;
    const prior = existingByRespondentId.get(recipient.respondentId);

    // Existing row: only PENDING is re-sendable here. SENT/VIEWED/SUBMITTED
    // already hold a live token (use /resend to bump those without rotating),
    // and a revoked row must never be re-sent. Both → already-invited no-op.
    if (prior && prior.status !== "PENDING") {
      skipped.push(recipient.respondentId);
      results.push({ respondentId: recipient.respondentId, status: "already-invited" });
      continue;
    }
    if (prior && prior.revokedAt) {
      skipped.push(recipient.respondentId);
      results.push({ respondentId: recipient.respondentId, status: "already-invited" });
      continue;
    }

    const rawToken = generateRawToken();
    const tokenHash = hashToken(rawToken);
    const parentTokenHash =
      input.stableLinksEnabled && !prior
        ? hashToken(generateRawToken())
        : tokenHash;

    let invitationRow: InvitationRow;
    try {
      if (prior) {
        if (input.stableLinksEnabled) {
          invitationRow = { id: prior.id, expiresAt };
        } else {
          // Re-key the PENDING row with a fresh token + refreshed expiresAt.
          invitationRow = await db.assessmentInvitation.update({
            where: { id: prior.id },
            data: { tokenHash, expiresAt, status: "PENDING" },
            select: { id: true, expiresAt: true },
          });
        }
      } else {
        invitationRow = await db.assessmentInvitation.create({
          data: {
            campaignId: campaign.id,
            respondentId: recipient.respondentId,
            tokenHash: parentTokenHash,
            status: "PENDING",
            expiresAt,
          },
          select: { id: true, expiresAt: true },
        });
      }
    } catch (writeErr) {
      if (input.stableLinksEnabled) {
        console.error("[invite-send] failed to write invitation row", {
          respondentId: recipient.respondentId,
          disposition: "INVITATION_WRITE_FAILED",
        });
      } else {
        console.error("[invite-send] failed to write invitation row", writeErr);
      }
      recordFailure(recipient.respondentId);
      continue;
    }

    const emailInput: InviteEmailInput = {
      invitation: invitationRow,
      respondent: {
        id: respondent.id,
        firstName: respondent.firstName,
        lastName: respondent.lastName,
        email: respondent.email,
      },
      campaign: {
        id: campaign.id,
        name: campaign.name,
        alias: campaign.alias,
        closeAt: campaign.closeAt,
      },
      template: {
        alias: campaign.template.alias,
        invitationSubject:
          campaign.invitationSubject ?? campaign.template.invitationSubject,
        invitationBodyMarkdown:
          campaign.invitationBodyMarkdown ?? campaign.template.invitationBodyMarkdown,
      },
      invitationBodyHtml: campaign.invitationBodyHtml ?? null,
      organizationName,
      coachName,
      templateName,
      rawToken,
      baseUrl,
      chrome,
      coachLogoUrl,
    };

    if (input.stableLinksEnabled) {
      let prepared: PreparedInviteEmail;
      try {
        prepared = deps.prepareEmail!(emailInput);
      } catch {
        console.error("[invite-send] email preparation failed", {
          respondentId: recipient.respondentId,
          invitationId: invitationRow.id,
          disposition: "PREPARATION_FAILED",
        });
        recordFailure(recipient.respondentId);
        continue;
      }
      let stableToken: StagedStableToken | { tokenId: string };
      try {
        stableToken = await deps.stableTokens!.stageExistingOriginal({
          invitationId: invitationRow.id,
          tokenHash,
          expiresAt,
        });
      } catch {
        console.error("[invite-send] stable token staging failed", {
          respondentId: recipient.respondentId,
          invitationId: invitationRow.id,
          disposition: "STAGING_FAILED",
        });
        recordFailure(recipient.respondentId);
        continue;
      }
      try {
        await prepared.send();
      } catch (sendError) {
        const disposition = classifyInvitationSendError(sendError);
        if (disposition === "UNCERTAIN") {
          try {
            await deps.stableTokens!.uncertain(stableToken.tokenId);
          } catch {
            console.error("[invite-send] post-send failure transition failed", {
              respondentId: recipient.respondentId,
              invitationId: invitationRow.id,
              disposition: "UNCERTAIN_STATE_PERSIST_FAILED",
            });
          }
        } else {
          const stagedRejectedToken = stableToken as StagedStableToken;
          const quarantined = await retryStableInvitationOperation(() =>
            deps.stableTokens!.rollbackRejected(stagedRejectedToken),
          );
          if (!quarantined) {
            console.error("[invite-send] rejected-token quarantine exhausted", {
              respondentId: recipient.respondentId,
              invitationId: invitationRow.id,
              disposition: "DEFINITE_REJECTION_QUARANTINE_EXHAUSTED",
              attempts: 3,
            });
            const auditInput: RejectedCleanupAuditInput = {
              campaignId: campaign.id,
              respondentId: recipient.respondentId,
              invitationId: invitationRow.id,
              tokenId: stableToken.tokenId,
              disposition: "DEFINITE_REJECTION_QUARANTINE_EXHAUSTED",
            };
            const persistAudit = deps.persistRejectedCleanupAudit;
            const auditPersisted =
              persistAudit !== undefined &&
              (await retryStableInvitationOperation(() => persistAudit(auditInput)));
            if (!auditPersisted) {
              throw new StableInvitationCleanupAuditError();
            }
            throw new StableInvitationQuarantineError();
          }

          const reconciled = await retryStableInvitationOperation(() =>
            deps.stableTokens!.reconcileRejected(stagedRejectedToken),
          );
          if (!reconciled) {
            console.error(
              "[invite-send] rejected-token reconciliation exhausted",
              {
                respondentId: recipient.respondentId,
                invitationId: invitationRow.id,
                disposition:
                  "DEFINITE_REJECTION_RECONCILIATION_EXHAUSTED",
                attempts: 3,
              },
            );
            const auditInput: RejectedCleanupAuditInput = {
              campaignId: campaign.id,
              respondentId: recipient.respondentId,
              invitationId: invitationRow.id,
              tokenId: stableToken.tokenId,
              disposition:
                "DEFINITE_REJECTION_RECONCILIATION_EXHAUSTED",
            };
            const persistAudit = deps.persistRejectedCleanupAudit;
            const auditPersisted =
              persistAudit !== undefined &&
              (await retryStableInvitationOperation(() =>
                persistAudit(auditInput),
              ));
            if (!auditPersisted) {
              throw new StableInvitationCleanupAuditError();
            }
          }
        }
        console.error("[invite-send] provider handoff failed", {
          respondentId: recipient.respondentId,
          invitationId: invitationRow.id,
          disposition,
        });
        recordFailure(recipient.respondentId);
        continue;
      }
      try {
        await deps.stableTokens!.confirm({
          tokenId: stableToken.tokenId,
          invitationId: invitationRow.id,
          confirmedAt: now(),
        });
      } catch {
        console.error("[invite-send] stable token confirmation failed", {
          respondentId: recipient.respondentId,
          invitationId: invitationRow.id,
          disposition: "CONFIRM_PERSIST_FAILED",
        });
      }
      try {
        await db.assessmentInvitation.update({
          where: { id: invitationRow.id },
          data: { status: "SENT", sentAt: now() },
        });
      } catch {
        console.error("[invite-send] parent status update failed", {
          respondentId: recipient.respondentId,
          invitationId: invitationRow.id,
          disposition: "PARENT_STATUS_WRITE_FAILED",
        });
        recordFailure(recipient.respondentId);
        continue;
      }
      sent.push(recipient.respondentId);
      results.push({ respondentId: recipient.respondentId, status: "sent" });
      continue;
    }

    try {
      await sendEmail(emailInput);

      await db.assessmentInvitation.update({
        where: { id: invitationRow.id },
        data: { status: "SENT", sentAt: now() },
      });
      sent.push(recipient.respondentId);
      results.push({ respondentId: recipient.respondentId, status: "sent" });
    } catch (sendErr) {
      console.error(
        "[invite-send] SMTP send failed",
        { respondentId: recipient.respondentId, invitationId: invitationRow.id },
        sendErr
      );
      // Leave the row PENDING — caller can retry via /resend or re-invite.
      recordFailure(recipient.respondentId);
    }
  }

  return { sent, skipped, failed, results };
}
