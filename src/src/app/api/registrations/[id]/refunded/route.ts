/**
 * POST /api/registrations/[id]/refunded — mark a paid registration as refunded
 * after the operator has processed the refund manually in Stripe dashboard.
 *
 * Q-MAY6-1 (digest page) + Round 2 H1 (flip paymentStatus) + Round 2 M2
 * (eligibility-guarded atomic update) + Round 3 H2 (stripeRefundId evidence).
 *
 * The refund queue cannot drop a row without proof of an actual Stripe refund.
 * The operator pastes the `re_...` ID from the Stripe dashboard; the route
 * Zod-validates the shape, then flips paymentStatus=REFUNDED in the same
 * atomic updateMany so Financials and any other "active paid registration"
 * surface stops counting the row.
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { getApiActor, isPrivilegedRole } from "@/lib/auth/authorization";

const refundedSchema = z.object({
  // Stripe refund IDs are "re_" + at least 14 alphanumeric chars in practice.
  stripeRefundId: z
    .string()
    .regex(/^re_[A-Za-z0-9]{14,}$/, "stripeRefundId must look like 're_...'"),
});

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const actor = await getApiActor();
  if (!actor) {
    return NextResponse.json(
      { success: false, error: "Authentication required" },
      { status: 401 },
    );
  }
  if (!isPrivilegedRole(actor.role)) {
    return NextResponse.json(
      { success: false, error: "Forbidden" },
      { status: 403 },
    );
  }

  const { id } = await params;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const body = (await request.json().catch(() => ({}))) as any;
  const parsed = refundedSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { success: false, error: parsed.error.issues },
      { status: 400 },
    );
  }

  const result = await db.registration.updateMany({
    where: {
      id,
      paymentStatus: "COMPLETED",
      refundedAt: null,
      workshop: { status: "CANCELED" },
    },
    data: {
      refundedAt: new Date(),
      refundedBy: actor.userId,
      stripeRefundId: parsed.data.stripeRefundId,
      paymentStatus: "REFUNDED",
    },
  });

  if (result.count === 0) {
    return NextResponse.json(
      {
        success: false,
        error:
          "Registration is not eligible for refund (already refunded, not paid, or workshop not canceled)",
      },
      { status: 409 },
    );
  }

  await db.auditLog.create({
    data: {
      entityType: "Registration",
      entityId: id,
      action: "MARK_REFUNDED",
      performedBy: actor.userId,
      changes: JSON.stringify({ stripeRefundId: parsed.data.stripeRefundId }),
    },
  });

  return NextResponse.json({ success: true });
}
