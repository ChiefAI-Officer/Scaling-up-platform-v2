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

/** Narrow shape of the tx client used for the in-tx outbox enqueue. The real
 *  Prisma transaction client is structurally assignable to this (its create has
 *  a wider, generic signature); we only call the one method. */
type OutboxTx = {
  assessmentEmailOutbox: {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    create: (args: { data: any }) => Promise<unknown>;
  };
};

interface EnqueueArgs {
  submissionId: string;
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
      resultsEmailSubject: string | null;
      resultsEmailBodyMarkdown: string | null;
      resultsEmailContentApproved: boolean;
      resultsEmailContentApprovedHash: string | null;
    } | null;
  };
  respondent: { email: string; firstName: string; lastName: string } | null;
  respondentId: string;
  scoreResult: unknown;
}

/**
 * Enqueues the Wave D results (#15) + coach-notify (#16) outbox rows for an
 * INVITED submission, inside the submit transaction.
 *
 * Each email is independently gated and independently guarded: a render failure
 * for one is swallowed (the email is skipped) so the submission itself — and the
 * other email — still commit. Idempotency comes from the
 * @@unique([submissionId, recipientRole]) constraint.
 */
async function enqueueWaveDEmails(
  tx: OutboxTx,
  { submissionId, campaign, respondent, respondentId, scoreResult }: EnqueueArgs
): Promise<void> {
  // Global kill switch — nothing is enqueued while sends are paused.
  if (assessmentSendsPaused()) return;

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
        campaignLabel: null,
        sections: campaign.version.sections,
        questions: campaign.version.questions,
        scoringConfig: campaign.version.scoringConfig,
        submittedAt: new Date(),
        submissionId: "",
        referringCoachEmail: null,
      });
      const { bodyHtml: reportHtml } = buildReportEmailHtml({
        report,
        recipientRole: "TAKER_COPY",
      });
      const bodyHtml = buildResultsEmailHtml({
        bodyMarkdown: template.resultsEmailBodyMarkdown ?? "",
        reportHtml,
      });
      await tx.assessmentEmailOutbox.create({
        data: {
          submissionId,
          recipientEmail: respondentEmail,
          recipientRole: "RESPONDENT",
          emailType: "ASSESSMENT_RESULTS",
          subject: template.resultsEmailSubject ?? "Your assessment results",
          bodyHtml,
        },
      });
    } catch (err) {
      // Do NOT roll back the submission — skip this email only.
      console.error("[assessment-submit] #15 results enqueue skipped:", err);
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
      await tx.assessmentEmailOutbox.create({
        data: {
          submissionId,
          recipientEmail: coachEmail,
          recipientRole: "OWNING_COACH",
          emailType: "COACH_COMPLETION",
          subject,
          bodyHtml,
        },
      });
    } catch (err) {
      console.error("[assessment-submit] #16 coach-notify enqueue skipped:", err);
    }
  }
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
      const result = await db.$transaction(async (tx) => {
        // SELECT FOR UPDATE on the invitation row — Postgres-level lock to
        // prevent concurrent submit races for the same invitation.
        await tx.$executeRaw`SELECT id FROM assessment_invitations WHERE id = ${invitationId} FOR UPDATE`;

        const invitation = await tx.assessmentInvitation.findUnique({
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
          return { kind: "not-found" as const };
        }

        const now = new Date();
        // SEC-M6: a soft-deleted campaign is no longer available.
        if (invitation.campaign.deletedAt !== null) {
          return { kind: "gate" as const };
        }
        if (invitation.revokedAt !== null) return { kind: "gate" as const };
        if (now >= invitation.expiresAt) return { kind: "gate" as const };
        if (invitation.campaign.status !== "ACTIVE") {
          return { kind: "gate" as const };
        }
        if (now < invitation.campaign.openAt) {
          return { kind: "gate" as const };
        }
        if (
          invitation.campaign.closeAt !== null &&
          now >= invitation.campaign.closeAt
        ) {
          return { kind: "gate" as const };
        }
        if (invitation.status === "SUBMITTED") {
          return { kind: "conflict" as const };
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
          return { kind: "schema-error" as const };
        }
        const rawAnswers: Answer[] = answers.map((a) => ({
          stableKey: a.stableKey,
          value: a.value,
        }));
        const scoreResult = scoreSubmission(versionParsed.data, rawAnswers);

        const submission = await tx.assessmentSubmission.create({
          data: {
            campaignId: invitation.campaignId,
            respondentId: invitation.respondentId,
            invitationId: invitation.id,
            answers: rawAnswers as unknown as object, // ALL answers stored
            result: scoreResult as unknown as object,
          },
          select: { id: true },
        });

        // ── Wave D: enqueue 0–2 outbox rows IN-TX (transactional outbox).
        // The submission + its outbox rows commit atomically; the double-submit
        // 409 above guarantees exactly-once. Each enqueue is guarded so a render
        // failure for one email NEVER rolls back the submission — it is simply
        // skipped (the unique [submissionId, recipientRole] keeps it idempotent).
        await enqueueWaveDEmails(tx, {
          submissionId: submission.id,
          campaign: invitation.campaign,
          respondent: invitation.respondent,
          respondentId: invitation.respondentId,
          scoreResult,
        });

        await tx.assessmentInvitation.update({
          where: { id: invitation.id },
          data: { status: "SUBMITTED", submittedAt: new Date() },
        });

        return {
          kind: "ok" as const,
          submissionId: submission.id,
          invitationId: invitation.id,
          campaignId: invitation.campaignId,
        };
      });

      if (result.kind === "not-found") {
        return NextResponse.json(
          { success: false, error: "Invitation not found" },
          { status: 404, headers: NO_STORE_HEADERS }
        );
      }
      if (result.kind === "schema-error") {
        return NextResponse.json(
          { success: false, error: "Template version schema invalid" },
          { status: 500, headers: NO_STORE_HEADERS }
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
