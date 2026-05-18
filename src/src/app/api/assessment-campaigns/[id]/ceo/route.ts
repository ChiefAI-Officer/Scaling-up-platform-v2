/**
 * Assessment v7.6 — Set CEO designation post-create.
 *
 * Lets coaches mark a single participant as the CEO after the campaign has
 * been created (the wizard sets it on initial submit). Mirrors the
 * transaction in `participants/route.ts` line 175-218: clear all
 * `isCEO=true` first, then set the chosen one — guarantees the "at most one
 * CEO per campaign" partial-unique-index invariant.
 *
 * Body:
 *   { participantId: string | null }
 *     - string → the AssessmentCampaignParticipant.id to mark as CEO
 *     - null   → clear all CEO designation (no CEO selected)
 *
 * Status outcomes:
 *   - 401 unauthenticated
 *   - 404 not found / not yours (canManageCampaign auth-fail hidden)
 *   - 404 participantId not on this campaign
 *   - 409 CAMPAIGN_CLOSED — cannot change CEO on a CLOSED campaign
 *   - 200 { ceoParticipantId: string | null }
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

const SetCeoBodySchema = z.object({
  participantId: z.string().min(1).nullable(),
});

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const rateLimit = await withRateLimit(request, RateLimits.standard);
    if (!rateLimit.allowed) {
      return NextResponse.json(
        { success: false, error: "Too many requests" },
        { status: 429, headers: rateLimit.headers },
      );
    }

    const actor = await getApiActor();
    if (!actor) {
      return NextResponse.json(
        { success: false, error: "Authentication required" },
        { status: 401 },
      );
    }

    const { id: campaignId } = await params;

    const allowed = await canManageCampaign(
      asAccessDb(db),
      actor,
      campaignId,
      "write",
    );
    if (!allowed) {
      return NextResponse.json(
        { success: false, error: "Campaign not found" },
        { status: 404 },
      );
    }

    const rawBody = await request.json().catch(() => ({}));
    const parsed = SetCeoBodySchema.safeParse(rawBody);
    if (!parsed.success) {
      return NextResponse.json(
        {
          success: false,
          error: "Invalid request body",
          details: parsed.error.flatten(),
        },
        { status: 400 },
      );
    }

    const { participantId } = parsed.data;

    const campaign = await db.assessmentCampaign.findUnique({
      where: { id: campaignId },
      select: { status: true },
    });
    if (!campaign) {
      return NextResponse.json(
        { success: false, error: "Campaign not found" },
        { status: 404 },
      );
    }
    if (campaign.status === "CLOSED") {
      return NextResponse.json(
        { success: false, error: "CAMPAIGN_CLOSED" },
        { status: 409 },
      );
    }

    // Verify the participant belongs to this campaign before we touch any rows.
    if (participantId !== null) {
      const participant = await db.assessmentCampaignParticipant.findUnique({
        where: { id: participantId },
        select: { campaignId: true },
      });
      if (!participant || participant.campaignId !== campaignId) {
        return NextResponse.json(
          { success: false, error: "Participant not found on this campaign" },
          { status: 404 },
        );
      }
    }

    const previousCeo =
      await db.assessmentCampaignParticipant.findFirst({
        where: { campaignId, isCEO: true },
        select: { id: true },
      });

    await db.$transaction(async (tx) => {
      // Always clear first to honor the partial-unique-index invariant
      // (at most one isCEO=true row per campaign).
      await tx.assessmentCampaignParticipant.updateMany({
        where: { campaignId, isCEO: true },
        data: { isCEO: false },
      });
      if (participantId !== null) {
        await tx.assessmentCampaignParticipant.update({
          where: { id: participantId },
          data: { isCEO: true },
        });
      }
    });

    await logAudit({
      entityType: "AssessmentCampaignParticipant",
      entityId: campaignId,
      action: "UPDATE",
      performedBy: actor.email ?? actor.userId,
      changes: {
        ceoChanged: true,
        previousCeoParticipantId: previousCeo?.id ?? null,
        currentCeoParticipantId: participantId,
      },
    });

    return NextResponse.json({
      success: true,
      data: { ceoParticipantId: participantId },
    });
  } catch (error) {
    console.error("[campaign-ceo] unexpected error", error);
    return NextResponse.json(
      { success: false, error: "Internal server error" },
      { status: 500 },
    );
  }
}
