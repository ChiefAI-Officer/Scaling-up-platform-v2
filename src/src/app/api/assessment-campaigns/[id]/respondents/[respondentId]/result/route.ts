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

    return NextResponse.json({
      success: true,
      data: {
        submissionId: submission.id,
        submittedAt: submission.submittedAt,
        respondent: submission.respondent,
        result: submission.result,
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
