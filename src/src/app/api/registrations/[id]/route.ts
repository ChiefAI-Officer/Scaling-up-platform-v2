import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { canManageCoachData, getApiActor } from "@/lib/authorization";
import { processRefund } from "@/services/stripe";

const attendanceSchema = z.object({
  attended: z.boolean(),
});

/**
 * DELETE /api/registrations/[id]
 * Directly unregister an attendee. Coach-scoped (coach or admin).
 * Paid coach removals must go through the admin-review removal-request flow.
 */
export async function DELETE(
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

    const { id: registrationId } = await params;

    const registration = await db.registration.findUnique({
      where: { id: registrationId },
      include: {
        workshop: {
          select: { id: true, coachId: true, title: true },
        },
      },
    });

    if (!registration) {
      return NextResponse.json(
        { success: false, error: "Registration not found" },
        { status: 404 }
      );
    }

    if (!canManageCoachData(actor, registration.workshop.coachId)) {
      return NextResponse.json(
        { success: false, error: "Registration not found" },
        { status: 404 }
      );
    }

    if (registration.status === "CANCELLED") {
      return NextResponse.json(
        { success: false, error: "Registration is already cancelled" },
        { status: 400 }
      );
    }

    const isPaidRegistration = registration.paymentStatus === "COMPLETED";
    const isCoachActor = actor.role === "COACH";
    if (isPaidRegistration && isCoachActor) {
      return NextResponse.json(
        {
          success: false,
          error: "Paid registrations require admin review before removal",
        },
        { status: 409 }
      );
    }

    // If payment was completed and we have a Stripe payment ID, issue refund
    let refundId: string | null = null;
    if (
      isPaidRegistration &&
      registration.stripePaymentId
    ) {
      try {
        const refund = await processRefund(registration.stripePaymentId);
        refundId = refund.id;
      } catch (error) {
        console.error("Stripe refund failed for registration:", registrationId, error);
        return NextResponse.json(
          {
            success: false,
            error: "Failed to process refund. Please try again or contact support.",
          },
          { status: 502 }
        );
      }
    }

    // Update registration status
    await db.registration.update({
      where: { id: registrationId },
      data: {
        status: "CANCELLED",
        paymentStatus:
          registration.paymentStatus === "COMPLETED" ? "REFUNDED" : registration.paymentStatus,
      },
    });

    return NextResponse.json({
      success: true,
      message: "Registration cancelled successfully",
      refundId,
    });
  } catch (error) {
    console.error("Error unregistering attendee:", error);
    return NextResponse.json(
      { success: false, error: "Failed to unregister attendee" },
      { status: 500 }
    );
  }
}

/**
 * PATCH /api/registrations/[id]
 * Toggle attendance for a registration. Coach-scoped (coach or admin).
 */
export async function PATCH(
  request: NextRequest,
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

    const { id: registrationId } = await params;

    const bodyValidation = attendanceSchema.safeParse(await request.json());
    if (!bodyValidation.success) {
      return NextResponse.json(
        { success: false, error: "Invalid request body", details: bodyValidation.error.issues },
        { status: 400 }
      );
    }

    const registration = await db.registration.findUnique({
      where: { id: registrationId },
      include: {
        workshop: {
          select: { id: true, coachId: true },
        },
      },
    });

    if (!registration) {
      return NextResponse.json(
        { success: false, error: "Registration not found" },
        { status: 404 }
      );
    }

    if (!canManageCoachData(actor, registration.workshop.coachId)) {
      return NextResponse.json(
        { success: false, error: "Registration not found" },
        { status: 404 }
      );
    }

    const { attended } = bodyValidation.data;

    const updated = await db.registration.update({
      where: { id: registrationId },
      data: {
        attended,
        attendedAt: attended ? new Date() : null,
      },
    });

    return NextResponse.json({
      success: true,
      data: {
        id: updated.id,
        attended: updated.attended,
        attendedAt: updated.attendedAt,
      },
    });
  } catch (error) {
    console.error("Error updating attendance:", error);
    return NextResponse.json(
      { success: false, error: "Failed to update attendance" },
      { status: 500 }
    );
  }
}
