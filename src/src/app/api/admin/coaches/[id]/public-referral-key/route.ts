import { randomBytes } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { getApiActor } from "@/lib/auth/authorization";
import { resolvePublicLeadsState } from "@/lib/assessments/public-leads-state";

const BodySchema = z.object({
  action: z.enum(["ENSURE", "ROTATE", "REVOKE"]),
});

function newReferralKey() {
  return randomBytes(24).toString("base64url");
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const actor = await getApiActor();
  if (actor?.role !== "ADMIN") {
    return NextResponse.json(
      { success: false, error: "Not found" },
      { status: 404 },
    );
  }
  const parsed = BodySchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json(
      { success: false, error: "Invalid action" },
      { status: 400 },
    );
  }
  const { id } = await params;
  const state = resolvePublicLeadsState(process.env, { coachId: id });
  if (
    !state.policyVersion ||
    process.env.PUBLIC_LEADS_REFERRAL_KEYS_ISSUED !== "1"
  ) {
    return NextResponse.json(
      { success: false, error: "Referral-key issuance is not approved" },
      { status: 409 },
    );
  }

  const result = await db.$transaction(async (tx) => {
    const coach = await tx.coach.findFirst({
      where: {
        id,
        deletedAt: null,
        certificationStatus: "ACTIVE",
        OR: [
          { certificationExpiry: null },
          { certificationExpiry: { gt: new Date() } },
        ],
      },
      select: { id: true },
    });
    if (!coach) return undefined;

    const active = await tx.coachReferralKey.findFirst({
      where: { coachId: id, revokedAt: null },
      orderBy: { createdAt: "desc" },
    });
    if (parsed.data.action === "REVOKE") {
      await tx.coachReferralKey.updateMany({
        where: { coachId: id, revokedAt: null },
        data: { revokedAt: new Date() },
      });
    } else if (parsed.data.action === "ROTATE" || !active) {
      if (active) {
        await tx.coachReferralKey.updateMany({
          where: { coachId: id, revokedAt: null },
          data: { revokedAt: new Date() },
        });
      }
      await tx.coachReferralKey.create({
        data: { coachId: id, key: newReferralKey() },
      });
    }
    const current = await tx.coachReferralKey.findFirst({
      where: { coachId: id, revokedAt: null },
      select: { key: true },
      orderBy: { createdAt: "desc" },
    });
    await tx.auditLog.create({
      data: {
        entityType: "Coach",
        entityId: id,
        action: "UPDATE",
        performedBy: actor.email,
        changes: JSON.stringify({
          kind: "public-referral-key",
          action: parsed.data.action,
          hasActiveKey: current !== null,
        }),
      },
    });
    return { key: current?.key ?? null };
  });
  if (result === undefined) {
    return NextResponse.json(
      { success: false, error: "Not found" },
      { status: 404 },
    );
  }
  return NextResponse.json({
    success: true,
    data: { referralKey: result.key },
  });
}
