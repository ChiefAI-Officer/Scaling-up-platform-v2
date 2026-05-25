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
            campaign: {
              include: {
                version: {
                  select: {
                    id: true,
                    questions: true,
                    sections: true,
                    scoringConfig: true,
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
