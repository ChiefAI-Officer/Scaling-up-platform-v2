/**
 * Assessment v7.6 — Campaign close (DRAFT|ACTIVE → CLOSED) — Task I.
 *
 * Terminal-state transition for both deliberate close (ACTIVE → CLOSED)
 * and draft discard (DRAFT → CLOSED). There is no CANCELED state in
 * v7.6; CLOSED is the single terminal state.
 *
 * Body:
 *   { reason?: string }  // optional, trimmed, ≤ 500 chars, audit-logged
 *
 * Status outcomes:
 *   - 401 unauthenticated
 *   - 404 not found OR not yours (auth-fail hidden — Task F pattern)
 *   - 409 ALREADY_CLOSED if campaign is already in CLOSED
 *   - 400 zod body schema rejected
 *   - 200 success, returns { id, status, closedAt }
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { getApiActor } from "@/lib/auth/authorization";
import {
  asAccessDb,
  canManageCampaign,
} from "@/lib/assessments/access-control";
import { logAudit } from "@/lib/audit";
import { RateLimits, withRateLimit } from "@/lib/rate-limit";

const CloseBodySchema = z.object({
  reason: z
    .string()
    .trim()
    .max(500, "Reason must be 500 characters or fewer")
    .optional(),
});

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

    // Parse the body. Treat any parse failure (missing body, empty body,
    // bad JSON) as `{}` — the schema's reason field is optional. Only
    // reject if a well-formed body fails the schema (e.g. reason > 500
    // chars), to avoid masking real auth/404 outcomes behind a 400.
    let rawBody: unknown = {};
    try {
      rawBody = await request.json();
    } catch {
      rawBody = {};
    }
    const parsed = CloseBodySchema.safeParse(rawBody);
    if (!parsed.success) {
      return NextResponse.json(
        {
          success: false,
          error: parsed.error.issues[0]?.message ?? "Invalid body",
        },
        { status: 400 }
      );
    }
    const reason = parsed.data.reason ?? null;

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
      select: { id: true, status: true },
    });
    if (!campaign) {
      return NextResponse.json(
        { success: false, error: "Campaign not found" },
        { status: 404 }
      );
    }
    if (campaign.status === "CLOSED") {
      return NextResponse.json(
        { success: false, code: "ALREADY_CLOSED" },
        { status: 409 }
      );
    }

    const fromStatus = campaign.status;
    const now = new Date();
    const updated = await db.assessmentCampaign.update({
      where: { id: campaignId },
      data: { status: "CLOSED" },
      select: { id: true, status: true },
    });

    await logAudit({
      entityType: "AssessmentCampaign",
      entityId: campaign.id,
      action: "CLOSE",
      performedBy: actor.email,
      changes: {
        fromStatus,
        toStatus: "CLOSED",
        reason,
      },
    });

    return NextResponse.json({
      success: true,
      data: {
        id: updated.id,
        status: updated.status,
        closedAt: now.toISOString(),
      },
    });
  } catch (error) {
    console.error("Error closing campaign:", error);
    return NextResponse.json(
      { success: false, error: "Failed to close campaign" },
      { status: 500 }
    );
  }
}
