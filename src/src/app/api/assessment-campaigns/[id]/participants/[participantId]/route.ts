/**
 * Assessment v7.6 — DELETE /api/assessment-campaigns/[id]/participants/[participantId] (Task L).
 *
 * Removes a participant from a campaign after creation. Used by the
 * `/portal/assessments/[id]` UI when a coach needs to drop someone who
 * left the org or who was added in error.
 *
 * Rules:
 *   - 401 unauthenticated.
 *   - 404 if canManageCampaign denies (auth-fail hidden).
 *   - 404 if the participant row doesn't exist or isn't on this campaign.
 *   - 409 if the participant already has a submission row — once results
 *         are recorded they are immutable; coaches must Close the campaign
 *         instead of removing individual respondents.
 *   - 204 success.
 *
 * The schema has NO cascade FKs on AssessmentCampaignParticipant /
 * AssessmentInvitation / AssessmentSubmission. We delete the
 * participant row + matching invitation row in a single transaction.
 * Submission rows are guarded by the 409 above — if they exist we don't
 * delete the participant at all. (Defense-in-depth: the txn order also
 * checks for submissions inside the txn before deleting.)
 */
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getApiActor } from "@/lib/auth/authorization";
import {
  asAccessDb,
  canManageCampaign,
} from "@/lib/assessments/access-control";
import { logAudit } from "@/lib/audit";
import { RateLimits, withRateLimit } from "@/lib/rate-limit";

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; participantId: string }> }
) {
  try {
    const rateLimit = await withRateLimit(request, RateLimits.standard);
    if (!rateLimit.allowed) {
      return NextResponse.json(
        { success: false, error: "Too many requests" },
        { status: 429, headers: rateLimit.headers }
      );
    }

    const actor = await getApiActor();
    if (!actor) {
      return NextResponse.json(
        { success: false, error: "Authentication required" },
        { status: 401 }
      );
    }

    const { id: campaignId, participantId } = await params;

    const allowed = await canManageCampaign(
      asAccessDb(db),
      actor,
      campaignId,
      "write"
    );
    if (!allowed) {
      return NextResponse.json(
        { success: false, error: "Campaign not found" },
        { status: 404 }
      );
    }

    const participant = await db.assessmentCampaignParticipant.findUnique({
      where: { id: participantId },
      select: {
        id: true,
        campaignId: true,
        respondentId: true,
      },
    });
    if (!participant || participant.campaignId !== campaignId) {
      return NextResponse.json(
        { success: false, error: "Participant not found" },
        { status: 404 }
      );
    }

    // Guard against removing a participant who has already submitted —
    // their results are immutable and must remain in the dataset.
    const submission = await db.assessmentSubmission.findFirst({
      where: {
        campaignId,
        respondentId: participant.respondentId,
      },
      select: { id: true },
    });
    if (submission) {
      return NextResponse.json(
        {
          success: false,
          code: "ALREADY_SUBMITTED",
          error:
            "This respondent has already submitted. Their results are locked — close the campaign instead.",
        },
        { status: 409 }
      );
    }

    // No cascade FKs in the schema — delete invitation + participant in
    // a single transaction. Submissions are guarded above.
    await db.$transaction(async (tx) => {
      await tx.assessmentInvitation.deleteMany({
        where: {
          campaignId,
          respondentId: participant.respondentId,
        },
      });
      await tx.assessmentCampaignParticipant.delete({
        where: { id: participantId },
      });
    });

    await logAudit({
      entityType: "AssessmentCampaignParticipant",
      entityId: participantId,
      action: "DELETE",
      performedBy: actor.email,
      changes: {
        campaignId,
        respondentId: participant.respondentId,
      },
    });

    // Use NextResponse.json so the route mirrors the rest of the API
    // (the mocked NextResponse in jest only exposes .json). An empty body
    // is still effectively "no content".
    return NextResponse.json({ success: true }, { status: 204 });
  } catch (error) {
    console.error("Error removing participant:", error);
    return NextResponse.json(
      { success: false, error: "Failed to remove participant" },
      { status: 500 }
    );
  }
}
