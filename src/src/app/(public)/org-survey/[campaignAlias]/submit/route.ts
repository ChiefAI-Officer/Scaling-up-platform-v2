/**
 * Assessment v7.6 — INVITED-mode submission (Task D).
 *
 * Cookie-bearing submit endpoint. Validates v6.6 strict-answer rules,
 * scores via `scoreSubmission`, writes AssessmentSubmission + flips the
 * AssessmentInvitation row to SUBMITTED in a single transaction with a
 * Postgres-level row lock (`SELECT … FOR UPDATE`) to defeat the double-
 * submit race.
 *
 * Lifecycle gate on every call — re-read invitation + campaign from DB.
 * Cookie is just an identifier; expiresAt on the cookie is not trusted.
 *
 * Error codes (HTTP 400 unless noted):
 *   EMPTY_ANSWERS, UNKNOWN_STABLE_KEY, MISSING_REQUIRED_KEY,
 *   DUPLICATE_STABLE_KEY, INVALID_TYPE, NON_INTEGER, OUT_OF_RANGE,
 *   INVALID_SCORING_CONFIG
 * 401 — no session cookie
 * 404 — session points at a vanished invitation
 * 409 — double-submit (status === SUBMITTED at lock time)
 * 410 — lifecycle gate failed
 */
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { getInvitationSession } from "@/lib/assessments/invitation-cookie";
import {
  scoreSubmission,
  ScoringValidationError,
  TemplateVersionForScoringSchema,
  type Answer,
} from "@/lib/assessments/scoring";
import { logAudit } from "@/lib/audit";
import {
  waveDResultsEmailEnabled,
  waveDCoachNotifyEnabled,
  assessmentSendsPaused,
} from "@/lib/assessments/wave-d-feature-flags";
import { isResultsEmailApproved } from "@/lib/assessments/results-email-approval";
import {
  buildRespondentReportFromSubmission,
  buildReportEmailHtml,
} from "@/lib/assessments/report-email";
import {
  buildResultsEmailHtml,
  buildCoachNotifyEmail,
} from "@/lib/assessments/results-email";

const NO_STORE_HEADERS = { "Cache-Control": "no-store" } as const;

const AnswerInputSchema = z.object({
  stableKey: z.string().min(1),
  value: z.unknown(),
});

const SubmitBodySchema = z.object({
  answers: z.array(AnswerInputSchema),
});

function gateFailed(): NextResponse {
  return NextResponse.json(
    { success: false, error: "This survey is no longer available." },
    { status: 410, headers: NO_STORE_HEADERS }
  );
}

/** An outbox row ready to INSERT — fully RENDERED (subject + bodyHtml), missing
 *  only the submissionId (assigned inside the tx once the submission exists).
 *  R3-M3: rendering produces these BEFORE the transaction opens, so the heavy
 *  HTML assembly never runs while the submission row lock is held. */
interface PreparedOutboxRow {
  recipientEmail: string;
  recipientRole: "RESPONDENT" | "OWNING_COACH";
  emailType: "ASSESSMENT_RESULTS" | "COACH_COMPLETION";
  subject: string;
  bodyHtml: string;
}

interface EnqueueArgs {
  campaign: {
    id: string;
    accessMode: string;
    sendResultsToRespondent: boolean;
    notifyCoachOnCompletion: boolean;
    createdByCoachId: string | null;
    creatorCoach: { email: string } | null;
    version: { sections: unknown; questions: unknown; scoringConfig: unknown };
    template: {
      name: string;
      alias: string;
      resultsEmailSubject: string | null;
      resultsEmailBodyMarkdown: string | null;
      resultsEmailContentApproved: boolean;
      resultsEmailContentApprovedHash: string | null;
    } | null;
  };
  respondent: { email: string; firstName: string; lastName: string } | null;
  respondentId: string;
  scoreResult: unknown;
  /** The submitted answers ({ stableKey, value }[]) — persisted to
   *  submission.answers; the qualitative report renders them back. */
  rawAnswers: unknown;
  /** The submission's real timestamp (same instant the invitation flips to
   *  SUBMITTED). NOT a placeholder new Date(). */
  submittedAt: Date;
}

/**
 * Builds the Wave D results (#15) + coach-notify (#16) outbox rows for an
 * INVITED submission — RENDERING ONLY, no DB. (R3-M3) This runs BEFORE the
 * submit transaction opens, so the heavy report-HTML assembly never executes
 * while the submission row lock is held; the tx merely INSERTs the prepared
 * rows (stamped with the submissionId).
 *
 * Each email is independently gated and independently guarded: a render failure
 * for one is swallowed (that email is dropped) so the submission itself — and
 * the other email — are unaffected. Returns 0–2 fully-rendered rows. PURE.
 */
function buildWaveDOutboxRows({
  campaign,
  respondent,
  respondentId,
  scoreResult,
  rawAnswers,
  submittedAt,
}: EnqueueArgs): PreparedOutboxRow[] {
  const rows: PreparedOutboxRow[] = [];

  // Global kill switch — nothing is enqueued while sends are paused.
  if (assessmentSendsPaused()) return rows;

  const isInvited = campaign.accessMode === "INVITED";

  // ── #15 RESPONDENT results ────────────────────────────────────────────────
  const template = campaign.template;
  const respondentEmail = respondent?.email?.trim();
  if (
    isInvited &&
    campaign.sendResultsToRespondent &&
    waveDResultsEmailEnabled() &&
    template !== null &&
    isResultsEmailApproved(template) &&
    respondentEmail
  ) {
    try {
      const report = buildRespondentReportFromSubmission({
        result: scoreResult as never,
        publicTaker: {
          firstName: respondent?.firstName ?? "",
          lastName: respondent?.lastName ?? "",
          email: respondentEmail,
        },
        assessmentName: template.name,
        templateAlias: template.alias,
        campaignLabel: null,
        sections: campaign.version.sections,
        questions: campaign.version.questions,
        scoringConfig: campaign.version.scoringConfig,
        rawAnswers,
        submittedAt,
        submissionId: "", // not interpolated into the body; FK set at INSERT
        referringCoachEmail: null,
      });
      const { bodyHtml: reportHtml, renderError } = buildReportEmailHtml({
        report,
        recipientRole: "TAKER_COPY",
      });
      // M4: buildReportEmailHtml never throws — on a qualitative body-render
      // failure it degrades to a safe body + a renderError signal. Surface it
      // (the submission still succeeds) so the fallback is diagnosable.
      // TODO(wave-e T13): emit assessment.report.render.failure metric
      if (renderError) {
        console.error(
          `[assessment-submit] #15 report render fell back (campaignId=${campaign.id} template=${template.alias} recipientRole=RESPONDENT):`,
          renderError
        );
      }
      const bodyHtml = buildResultsEmailHtml({
        bodyMarkdown: template.resultsEmailBodyMarkdown ?? "",
        reportHtml,
      });
      rows.push({
        recipientEmail: respondentEmail,
        recipientRole: "RESPONDENT",
        emailType: "ASSESSMENT_RESULTS",
        subject: template.resultsEmailSubject ?? "Your assessment results",
        bodyHtml,
      });
    } catch (err) {
      // Do NOT abort the submission — drop this email only.
      console.error("[assessment-submit] #15 results render skipped:", err);
    }
  }

  // ── #16 OWNING_COACH notify ───────────────────────────────────────────────
  const coachEmail = campaign.creatorCoach?.email?.trim();
  if (
    campaign.notifyCoachOnCompletion &&
    waveDCoachNotifyEnabled() &&
    campaign.createdByCoachId &&
    coachEmail
  ) {
    try {
      const { subject, bodyHtml } = buildCoachNotifyEmail({
        appUrl: process.env.APP_URL ?? "",
        campaignId: campaign.id,
        respondentId,
        assessmentName: campaign.template?.name ?? "an assessment",
      });
      rows.push({
        recipientEmail: coachEmail,
        recipientRole: "OWNING_COACH",
        emailType: "COACH_COMPLETION",
        subject,
        bodyHtml,
      });
    } catch (err) {
      console.error("[assessment-submit] #16 coach-notify render skipped:", err);
    }
  }

  return rows;
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ campaignAlias: string }> }
) {
  try {
    const { campaignAlias } = await params;
    const session = await getInvitationSession(campaignAlias);

    if (!session.invitationId || session.campaignAlias !== campaignAlias) {
      return NextResponse.json(
        { success: false, error: "Session not found" },
        { status: 401, headers: NO_STORE_HEADERS }
      );
    }

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json(
        { success: false, error: "Invalid JSON body" },
        { status: 400, headers: NO_STORE_HEADERS }
      );
    }
    const parsed = SubmitBodySchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: "Malformed answers payload" },
        { status: 400, headers: NO_STORE_HEADERS }
      );
    }
    const { answers } = parsed.data;

    if (answers.length === 0) {
      return NextResponse.json(
        { success: false, error: "EMPTY_ANSWERS" },
        { status: 400, headers: NO_STORE_HEADERS }
      );
    }

    const invitationId = session.invitationId;

    try {
      // ── Phase 1 (no lock, no tx): read → gate → score → RENDER emails ──────
      // R3-M3: the heavy report-HTML assembly runs HERE, BEFORE the transaction
      // opens, so it never executes while the submission row lock is held. The
      // tx below re-locks, re-validates the gates/conflict, and merely INSERTs
      // these pre-rendered rows. Versions are immutable once published, so the
      // ScoreResult computed here is deterministic and re-used for the write.
      const invitation = await db.assessmentInvitation.findUnique({
        where: { id: invitationId },
        include: {
          // Wave D #15: the respondent's email is the #15 recipient.
          respondent: {
            select: { email: true, firstName: true, lastName: true },
          },
          campaign: {
            include: {
              // Wave D: per-campaign send toggles + the owning coach (#16).
              creatorCoach: { select: { email: true } },
              version: {
                select: {
                  id: true,
                  questions: true,
                  sections: true,
                  scoringConfig: true,
                },
              },
              // Wave D #15: admin-authored results email + approval gate.
              template: {
                select: {
                  name: true,
                  alias: true,
                  resultsEmailSubject: true,
                  resultsEmailBodyMarkdown: true,
                  resultsEmailContentApproved: true,
                  resultsEmailContentApprovedHash: true,
                },
              },
            },
          },
        },
      });

      if (!invitation || invitation.campaign.alias !== campaignAlias) {
        return NextResponse.json(
          { success: false, error: "Invitation not found" },
          { status: 404, headers: NO_STORE_HEADERS }
        );
      }

      const nowPre = new Date();
      // SEC-M6: a soft-deleted campaign is no longer available.
      const preGateFailed =
        invitation.campaign.deletedAt !== null ||
        invitation.revokedAt !== null ||
        nowPre >= invitation.expiresAt ||
        invitation.campaign.status !== "ACTIVE" ||
        nowPre < invitation.campaign.openAt ||
        (invitation.campaign.closeAt !== null &&
          nowPre >= invitation.campaign.closeAt);
      if (preGateFailed) return gateFailed();
      if (invitation.status === "SUBMITTED") {
        return NextResponse.json(
          { success: false, error: "Already submitted" },
          { status: 409, headers: NO_STORE_HEADERS }
        );
      }

      // Build the scoring input — pass ALL question types; Phase B
      // scoreSubmission skips non-SLIDER_LIKERT answers gracefully.
      const allQuestions = invitation.campaign.version.questions as Array<
        Record<string, unknown>
      >;
      const versionParsed = TemplateVersionForScoringSchema.safeParse({
        questions: allQuestions,
        sections: invitation.campaign.version.sections,
        scoringConfig: invitation.campaign.version.scoringConfig,
      });
      if (!versionParsed.success) {
        return NextResponse.json(
          { success: false, error: "Template version schema invalid" },
          { status: 500, headers: NO_STORE_HEADERS }
        );
      }
      const rawAnswers: Answer[] = answers.map((a) => ({
        stableKey: a.stableKey,
        value: a.value,
      }));
      // scoreSubmission may throw ScoringValidationError → caught by outer catch.
      const scoreResult = scoreSubmission(versionParsed.data, rawAnswers);

      // Single instant shared by the report's submittedAt + the invitation's
      // SUBMITTED stamp, so the emailed report date matches the DB row.
      const submittedAt = new Date();

      // RENDER 0–2 outbox rows OUTSIDE the tx (the lock-free, CPU-heavy step).
      const preparedRows = buildWaveDOutboxRows({
        campaign: invitation.campaign,
        respondent: invitation.respondent,
        respondentId: invitation.respondentId,
        scoreResult,
        rawAnswers,
        submittedAt,
      });

      // ── Phase 2 (locked tx): re-validate → create submission → INSERT rows ─
      const result = await db.$transaction(async (tx) => {
        // SELECT FOR UPDATE on the invitation row — Postgres-level lock to
        // prevent concurrent submit races for the same invitation.
        await tx.$executeRaw`SELECT id FROM assessment_invitations WHERE id = ${invitationId} FOR UPDATE`;

        // Re-read the gate-relevant fields UNDER the lock (the Phase-1 read was
        // unlocked; a concurrent submit / revoke / close could have raced).
        const locked = await tx.assessmentInvitation.findUnique({
          where: { id: invitationId },
          select: {
            status: true,
            revokedAt: true,
            expiresAt: true,
            campaignId: true,
            respondentId: true,
            campaign: {
              select: {
                alias: true,
                deletedAt: true,
                status: true,
                openAt: true,
                closeAt: true,
              },
            },
          },
        });

        if (!locked || locked.campaign.alias !== campaignAlias) {
          return { kind: "not-found" as const };
        }
        const now = new Date();
        if (
          locked.campaign.deletedAt !== null ||
          locked.revokedAt !== null ||
          now >= locked.expiresAt ||
          locked.campaign.status !== "ACTIVE" ||
          now < locked.campaign.openAt ||
          (locked.campaign.closeAt !== null && now >= locked.campaign.closeAt)
        ) {
          return { kind: "gate" as const };
        }
        if (locked.status === "SUBMITTED") {
          return { kind: "conflict" as const };
        }

        const submission = await tx.assessmentSubmission.create({
          data: {
            campaignId: locked.campaignId,
            respondentId: locked.respondentId,
            invitationId,
            answers: rawAnswers as unknown as object, // ALL answers stored
            result: scoreResult as unknown as object,
          },
          select: { id: true },
        });

        // ── Wave D: INSERT the pre-rendered outbox rows IN-TX (transactional
        // outbox). The submission + its outbox rows commit atomically; the
        // double-submit 409 above guarantees exactly-once. Each INSERT is
        // guarded so a write failure for one email NEVER rolls back the
        // submission — it is simply skipped (the unique [submissionId,
        // recipientRole] keeps it idempotent on replay).
        for (const row of preparedRows) {
          try {
            await tx.assessmentEmailOutbox.create({
              data: {
                submissionId: submission.id,
                recipientEmail: row.recipientEmail,
                recipientRole: row.recipientRole,
                emailType: row.emailType,
                subject: row.subject,
                bodyHtml: row.bodyHtml,
              },
            });
          } catch (err) {
            console.error(
              `[assessment-submit] outbox enqueue skipped (${row.recipientRole}):`,
              err
            );
          }
        }

        await tx.assessmentInvitation.update({
          where: { id: invitationId },
          data: { status: "SUBMITTED", submittedAt },
        });

        return {
          kind: "ok" as const,
          submissionId: submission.id,
          invitationId,
          campaignId: locked.campaignId,
        };
      });

      if (result.kind === "not-found") {
        return NextResponse.json(
          { success: false, error: "Invitation not found" },
          { status: 404, headers: NO_STORE_HEADERS }
        );
      }
      if (result.kind === "gate") return gateFailed();
      if (result.kind === "conflict") {
        return NextResponse.json(
          { success: false, error: "Already submitted" },
          { status: 409, headers: NO_STORE_HEADERS }
        );
      }

      await logAudit({
        entityType: "AssessmentSubmission",
        entityId: result.submissionId,
        action: "CREATE",
        performedBy: `invitation:${result.invitationId}`,
        changes: {
          campaignId: result.campaignId,
          invitationId: result.invitationId,
        },
      });

      return NextResponse.json(
        { success: true, data: { submissionId: result.submissionId } },
        { status: 200, headers: NO_STORE_HEADERS }
      );
    } catch (err) {
      if (err instanceof ScoringValidationError) {
        return NextResponse.json(
          { success: false, error: err.code, details: err.details },
          { status: 400, headers: NO_STORE_HEADERS }
        );
      }
      throw err;
    }
  } catch (error) {
    console.error("[assessment-submit] error:", error);
    return NextResponse.json(
      { success: false, error: "Failed to submit answers" },
      { status: 500, headers: NO_STORE_HEADERS }
    );
  }
}
