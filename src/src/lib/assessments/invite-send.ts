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

/** Mailer call — exactly the payload `sendAssessmentInvitationEmail` accepts. */
export type InviteMailer = (data: {
  invitation: { id: string; expiresAt: Date };
  respondent: { id: string; firstName: string; lastName: string; email: string };
  campaign: { id: string; name: string; alias: string; closeAt: Date | null };
  template: { invitationSubject: string; invitationBodyMarkdown: string };
  /** Per-campaign full-HTML invitation override (#20) — REPLACES the shell when non-empty (+ flag on). */
  invitationBodyHtml?: string | null;
  organizationName: string | null;
  coachName: string | null;
  templateName: string | null;
  rawToken: string;
  baseUrl: string;
}) => Promise<void>;

export interface SendInvitesDeps {
  db: InviteSendDb;
  sendEmail: InviteMailer;
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
      invitationSubject: string;
      invitationBodyMarkdown: string;
    };
  };
  recipients: InviteRecipient[];
  baseUrl: string;
  organizationName?: string | null;
  coachName?: string | null;
  templateName?: string | null;
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

  if (recipients.length > INVITE_BATCH_CAP) {
    throw new Error(
      `Invite batch of ${recipients.length} exceeds INVITE_BATCH_CAP (${INVITE_BATCH_CAP}); caller must chunk.`
    );
  }

  const sent: string[] = [];
  const skipped: string[] = [];
  const failed: string[] = [];
  const results: Array<{ respondentId: string; status: InviteSendStatus }> = [];

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

    let invitationRow: InvitationRow;
    try {
      if (prior) {
        // Re-key the PENDING row with a fresh token + refreshed expiresAt.
        invitationRow = await db.assessmentInvitation.update({
          where: { id: prior.id },
          data: { tokenHash, expiresAt, status: "PENDING" },
          select: { id: true, expiresAt: true },
        });
      } else {
        invitationRow = await db.assessmentInvitation.create({
          data: {
            campaignId: campaign.id,
            respondentId: recipient.respondentId,
            tokenHash,
            status: "PENDING",
            expiresAt,
          },
          select: { id: true, expiresAt: true },
        });
      }
    } catch (writeErr) {
      console.error("[invite-send] failed to write invitation row", writeErr);
      failed.push(recipient.respondentId);
      results.push({ respondentId: recipient.respondentId, status: "send-failed" });
      continue;
    }

    try {
      await sendEmail({
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
      });

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
      failed.push(recipient.respondentId);
      results.push({ respondentId: recipient.respondentId, status: "send-failed" });
    }
  }

  return { sent, skipped, failed, results };
}
