/**
 * Admin Public Campaigns — Publish (DRAFT → ACTIVE).
 *
 * POST /api/admin/public-campaigns/[id]/publish
 *   Transitions a PUBLIC DRAFT campaign to ACTIVE.
 *   Admin/STAFF-only. Coaches are forbidden.
 *
 * Error codes:
 *   404 — campaign not found
 *   400 NOT_PUBLIC — campaign is not a PUBLIC campaign
 *   409 ALREADY_ACTIVE — campaign already ACTIVE (idempotent-friendly message)
 *   409 ALREADY_CLOSED — campaign is CLOSED
 *
 * Spec ref: docs/specs/v7.6/13-assessment-brand-and-results-report.md
 */

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getApiActor, isPrivilegedRole } from "@/lib/auth/authorization";
import { logAudit } from "@/lib/audit";
import { RateLimits, withRateLimit } from "@/lib/rate-limit";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    // 1. Rate limit
    const rateLimit = await withRateLimit(request, RateLimits.standard);
    if (!rateLimit.allowed) {
      return NextResponse.json(
        { success: false, error: "Too many requests" },
        { status: 429, headers: rateLimit.headers }
      );
    }

    // 2. Auth — admin/STAFF only; coaches forbidden
    const actor = await getApiActor();
    if (!actor) {
      return NextResponse.json(
        { success: false, error: "Authentication required" },
        { status: 401 }
      );
    }
    if (!isPrivilegedRole(actor.role)) {
      return NextResponse.json(
        { success: false, error: "Forbidden: admin or staff required" },
        { status: 403 }
      );
    }

    const { id } = await params;

    // 3. Load campaign
    const campaign = await db.assessmentCampaign.findUnique({
      where: { id },
      select: { id: true, status: true, accessMode: true },
    });
    if (!campaign) {
      return NextResponse.json(
        { success: false, error: "Campaign not found" },
        { status: 404 }
      );
    }

    // 4. Guard: must be a PUBLIC campaign
    if (campaign.accessMode !== "PUBLIC") {
      return NextResponse.json(
        { success: false, error: "NOT_PUBLIC" },
        { status: 400 }
      );
    }

    // 5. Guard: idempotent — already ACTIVE
    if (campaign.status === "ACTIVE") {
      return NextResponse.json(
        { success: false, error: "ALREADY_ACTIVE" },
        { status: 409 }
      );
    }

    // 6. Guard: CLOSED is terminal
    if (campaign.status === "CLOSED") {
      return NextResponse.json(
        { success: false, error: "ALREADY_CLOSED" },
        { status: 409 }
      );
    }

    // 7. Transition to ACTIVE
    const updated = await db.assessmentCampaign.update({
      where: { id },
      data: { status: "ACTIVE" },
    });

    // 8. Audit
    await logAudit({
      entityType: "AssessmentCampaign",
      entityId: id,
      action: "UPDATE",
      performedBy: actor.email,
      changes: {
        status: "DRAFT->ACTIVE",
        accessMode: "PUBLIC",
      },
    });

    return NextResponse.json({
      success: true,
      data: { id: updated.id, status: "ACTIVE" },
    });
  } catch (error) {
    console.error("Error publishing public campaign:", error);
    return NextResponse.json(
      { success: false, error: "Internal server error" },
      { status: 500 }
    );
  }
}
