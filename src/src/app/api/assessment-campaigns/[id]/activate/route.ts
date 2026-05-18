/**
 * Assessment v7.6 — Campaign activation (DRAFT → ACTIVE).
 *
 * Validates:
 *  - status === DRAFT
 *  - at least 1 participant
 *  - template aggregationMode === CEO_ONLY → exactly 1 isCEO=true participant
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

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
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

    const { id: campaignId } = await params;
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

    const campaign = await db.assessmentCampaign.findUnique({
      where: { id: campaignId },
      include: {
        template: { select: { id: true, aggregationMode: true } },
        participants: {
          select: { id: true, isCEO: true },
        },
      },
    });
    if (!campaign) {
      return NextResponse.json(
        { success: false, error: "Campaign not found" },
        { status: 404 }
      );
    }
    if (campaign.status !== "DRAFT") {
      return NextResponse.json(
        { success: false, error: "Campaign must be in DRAFT to activate" },
        { status: 409 }
      );
    }

    if (campaign.participants.length === 0) {
      return NextResponse.json(
        { success: false, error: "Campaign must have at least one participant" },
        { status: 409 }
      );
    }

    if (campaign.template.aggregationMode === "CEO_ONLY") {
      const ceoCount = campaign.participants.filter((p) => p.isCEO).length;
      if (ceoCount !== 1) {
        return NextResponse.json(
          {
            success: false,
            error:
              "CEO_ONLY templates require exactly one CEO participant assigned",
          },
          { status: 409 }
        );
      }
    }

    const updated = await db.assessmentCampaign.update({
      where: { id: campaignId },
      data: { status: "ACTIVE" },
    });

    await logAudit({
      entityType: "AssessmentCampaign",
      entityId: campaignId,
      action: "UPDATE",
      performedBy: actor.email,
      changes: { status: "ACTIVE" },
    });

    return NextResponse.json({ success: true, data: updated });
  } catch (error) {
    console.error("Error activating campaign:", error);
    return NextResponse.json(
      { success: false, error: "Failed to activate campaign" },
      { status: 500 }
    );
  }
}
