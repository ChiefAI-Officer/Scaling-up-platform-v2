import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getApiActor, canManageCoachData } from "@/lib/auth/authorization";
import { evaluateApproval } from "@/lib/approval-engine";
import { runAutoBuild } from "@/lib/auto-build-service";

/**
 * POST /api/workshops/[id]/resubmit
 * Resubmit a denied workshop for approval. Coach-scoped.
 * Resets status to REQUESTED and creates a new ApprovalQueue entry.
 */
export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const actor = await getApiActor();
    if (!actor) {
      return NextResponse.json(
        { success: false, error: "Authentication required" },
        { status: 401 }
      );
    }

    const { id: workshopId } = await params;

    const workshop = await db.workshop.findUnique({
      where: { id: workshopId },
      include: {
        coach: true,
        workshopType: true,
      },
    });

    if (!workshop) {
      return NextResponse.json(
        { success: false, error: "Workshop not found" },
        { status: 404 }
      );
    }

    if (!canManageCoachData(actor, workshop.coachId)) {
      return NextResponse.json(
        { success: false, error: "Workshop not found" },
        { status: 404 }
      );
    }

    // Only allow resubmission for info-requested/canceled workshops
    if (!["CANCELED", "INFO_REQUESTED", "DENIED"].includes(workshop.status)) {
      return NextResponse.json(
        {
          success: false,
          error: `Cannot resubmit a workshop with status "${workshop.status}". Only denied or canceled workshops can be resubmitted.`,
        },
        { status: 400 }
      );
    }

    // Reset status to REQUESTED
    await db.workshop.update({
      where: { id: workshopId },
      data: { status: "REQUESTED" },
    });

    // Create a new approval queue entry
    const coachName = `${workshop.coach.firstName} ${workshop.coach.lastName}`;
    const result = await evaluateApproval({
      type: "WORKSHOP_REQUEST",
      coachId: workshop.coachId,
      coachEmail: workshop.coach.email,
      workshopId: workshop.id,
      workshopTypeSlug: workshop.workshopType?.slug,
      details: `Resubmission of workshop "${workshop.title}" (previously denied)`,
      requestedBy: coachName,
    });

    // If auto-approved, run auto-build inline (creates pages, assigns workflows, advances status)
    if (result.autoApproved) {
      try {
        await runAutoBuild(workshopId);
      } catch (err) {
        console.error("[AUTO-BUILD] Resubmit auto-approval build failed:", err);
        // Fallback: at least set the status
        await db.workshop.update({
          where: { id: workshopId },
          data: { status: "AWAITING_APPROVAL" },
        });
      }
    }

    return NextResponse.json({
      success: true,
      message: result.autoApproved
        ? "Workshop resubmitted and auto-approved"
        : "Workshop resubmitted for review",
      autoApproved: result.autoApproved,
      approvalId: result.approvalId,
    });
  } catch (error) {
    console.error("Error resubmitting workshop:", error);
    return NextResponse.json(
      { success: false, error: "Failed to resubmit workshop" },
      { status: 500 }
    );
  }
}
