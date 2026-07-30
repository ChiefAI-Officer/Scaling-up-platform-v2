import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import {
  getApiActor,
  isPrivilegedRole,
} from "@/lib/auth/authorization";
import { RateLimits, withRateLimit } from "@/lib/rate-limit";

function enabled(value: string | undefined): boolean {
  return value === "1" || value?.toLowerCase() === "true";
}

export async function POST(request: NextRequest) {
  const rate = await withRateLimit(request, RateLimits.standard);
  if (!rate.allowed) {
    return NextResponse.json(
      { success: false, error: "Too many requests" },
      { status: 429, headers: rate.headers },
    );
  }
  const actor = await getApiActor();
  if (!actor || !isPrivilegedRole(actor.role)) {
    return NextResponse.json(
      { success: false, error: "Not found" },
      { status: 404 },
    );
  }
  if (enabled(process.env.WAVE_PUBLIC_LEADS_KILL)) {
    return NextResponse.json(
      { success: false, error: "KILL_FLAG_STILL_ENABLED" },
      { status: 409 },
    );
  }

  const outcome = await db.$transaction(async (tx) => {
    const fence = await tx.publicLeadDeliveryFence.findUnique({
      where: { id: "global" },
    });
    if (!fence?.blocked) return { status: "ALREADY_CLEAR" } as const;
    if (!fence.quiescedAt) return { status: "NOT_QUIESCED" } as const;
    const activeLeases = await tx.assessmentEmailOutbox.count({
      where: {
        featureKey: "PUBLIC_LEADS",
        recipientRole: "REFERRING_COACH",
        status: "SENDING",
        leaseExpiresAt: { gt: new Date() },
      },
    });
    if (activeLeases > 0) return { status: "NOT_QUIESCED" } as const;

    const cleared = await tx.publicLeadDeliveryFence.update({
      where: { id: fence.id },
      data: {
        blocked: false,
        blockedAt: null,
        quiescedAt: null,
        generation: { increment: 1 },
      },
    });
    await tx.auditLog.create({
      data: {
        entityType: "PublicLeadDeliveryFence",
        entityId: fence.id,
        action: "PUBLIC_LEAD_MAIL_FENCE_CLEARED",
        performedBy: actor.email,
        changes: JSON.stringify({
          priorGeneration: fence.generation,
          generation: cleared.generation,
          priorQuiescedAt: fence.quiescedAt,
        }),
      },
    });
    return { status: "CLEARED", generation: cleared.generation } as const;
  });

  if (outcome.status === "NOT_QUIESCED") {
    return NextResponse.json(
      { success: false, error: outcome.status },
      { status: 409 },
    );
  }
  return NextResponse.json({ success: true, ...outcome });
}
