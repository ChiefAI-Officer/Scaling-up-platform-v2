/**
 * Assessment v7.6 — GET /api/assessment-campaigns/[id]/respondents/[respondentId]/result (Task F).
 *
 * Returns the frozen ScoreResult cache for a single respondent's
 * submission, plus the version's sections + scoringConfig so the
 * renderer has tier labels + section display names available without
 * a second fetch.
 *
 * Lazy-loaded by the campaign detail UI when a coach clicks "View results".
 *
 * Auth:
 *   - 401 if not authenticated.
 *   - 404 if canManageCampaign(actor, id, "read") === false.
 *   - 404 if no submission exists for this respondent in this campaign.
 *
 * Returns 404 (not 403) on auth-fail per the same "ID enumeration" rationale
 * as the respondents list endpoint.
 */
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getApiActor } from "@/lib/auth/authorization";
import {
  asAccessDb,
  canManageCampaign,
} from "@/lib/assessments/access-control";

export async function GET(
  _request: NextRequest,
  {
    params,
  }: { params: Promise<{ id: string; respondentId: string }> }
) {
  try {
    const actor = await getApiActor();
    if (!actor) {
      return NextResponse.json(
        { success: false, error: "Authentication required" },
        { status: 401 }
      );
    }

    const { id: campaignId, respondentId } = await params;

    const allowed = await canManageCampaign(
      asAccessDb(db),
      actor,
      campaignId,
      "read"
    );
    if (!allowed) {
      return NextResponse.json(
        { success: false, error: "Campaign not found" },
        { status: 404 }
      );
    }

    // DEPRECATION (Task 5, Phase 1): the branded report
    // (/assessments/[id]/respondents/[respondentId]/report) is now the PRIMARY
    // way coaches/admins view a completed submission. This raw-result API + its
    // inline AssessmentResultView are kept as a Phase-1 fallback only. This
    // structured marker gates the Phase-2 removal on real usage telemetry — once
    // this stops firing in prod, the route + inline view can be deleted.
    console.info(
      JSON.stringify({
        marker: "assessment.report.old_result_api.hit",
        campaignId,
        respondentId,
      })
    );

    const submission = await db.assessmentSubmission.findFirst({
      where: { campaignId, respondentId },
      select: {
        id: true,
        submittedAt: true,
        result: true,
        respondent: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
            jobTitle: true,
          },
        },
        campaign: {
          select: {
            id: true,
            version: {
              select: {
                id: true,
                sections: true,
                scoringConfig: true,
                questions: true,
              },
            },
          },
        },
      },
    });

    if (!submission) {
      return NextResponse.json(
        { success: false, error: "Submission not found" },
        { status: 404 }
      );
    }

    // #21 — the inline "Raw Data" view showed question CODES (e.g. q1_1)
    // instead of question text. Build a stableKey → label map so the view can
    // render the human-readable question. Mirrors the first-wins dup-guard in
    // lib/assessments/respondent-report.ts. version.questions is Prisma JSON
    // (an array of { stableKey, label, type, … }) — guard for shape.
    const rawQuestions: unknown[] = Array.isArray(
      submission.campaign.version.questions
    )
      ? (submission.campaign.version.questions as unknown[])
      : [];
    const questionByKey: Record<string, string> = {};
    for (const q of rawQuestions) {
      if (!q || typeof q !== "object") continue;
      const { stableKey, label } = q as Record<string, unknown>;
      if (typeof stableKey !== "string" || typeof label !== "string") continue;
      // First-wins on duplicate stableKey.
      if (Object.prototype.hasOwnProperty.call(questionByKey, stableKey)) {
        continue;
      }
      questionByKey[stableKey] = label;
    }

    return NextResponse.json({
      success: true,
      data: {
        submissionId: submission.id,
        submittedAt: submission.submittedAt,
        respondent: submission.respondent,
        result: submission.result,
        questionByKey,
        version: {
          sections: submission.campaign.version.sections,
          scoringConfig: submission.campaign.version.scoringConfig,
        },
      },
    });
  } catch (error) {
    console.error("Error fetching respondent result:", error);
    return NextResponse.json(
      { success: false, error: "Failed to fetch respondent result" },
      { status: 500 }
    );
  }
}
