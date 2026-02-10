import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { updateWorkshopSchema } from "@/lib/validations";
import { canManageCoachData, getApiActor, isPrivilegedRole } from "@/lib/authorization";
import { validateDateChange, MINIMUM_LEAD_TIME_DAYS } from "@/lib/lead-time-validator";
import { chargeCancellationFee } from "@/services/stripe";

const DEFAULT_CANCELLATION_FEE_CENTS = 50000;

interface CancellationRequestPayload {
  chargeCancellationFee?: boolean;
  waiveCancellationFee?: boolean;
  waiveReason?: string;
  stripeCustomerId?: string;
  stripePaymentMethodId?: string;
  cancellationFeeCents?: number;
}

async function parseCancellationRequest(
  request: NextRequest
): Promise<CancellationRequestPayload> {
  const raw = await request.text();
  if (!raw || raw.trim().length === 0) {
    return {};
  }

  try {
    return JSON.parse(raw) as CancellationRequestPayload;
  } catch {
    throw new Error("Invalid JSON payload");
  }
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const actor = await getApiActor();
    if (!actor) {
      return NextResponse.json({ success: false, error: "Authentication required" }, { status: 401 });
    }

    const { id } = await params;

    const workshopAccess = await db.workshop.findUnique({
      where: { id },
      select: { id: true, coachId: true },
    });

    if (!workshopAccess) {
      return NextResponse.json(
        { success: false, error: "Workshop not found" },
        { status: 404 }
      );
    }

    if (!canManageCoachData(actor, workshopAccess.coachId)) {
      // Return not found to avoid leaking existence across coaches.
      return NextResponse.json(
        { success: false, error: "Workshop not found" },
        { status: 404 }
      );
    }

    const workshop = await db.workshop.findUnique({
      where: { id },
      include: {
        coach: true,
        workshopType: true,
        registrations: {
          orderBy: { createdAt: "desc" },
        },
        campaigns: true,
        tasks: {
          orderBy: { createdAt: "desc" },
        },
        landingPages: {
          select: {
            id: true,
            template: true,
            slug: true,
            status: true,
          },
        },
      },
    });

    if (!workshop) {
      return NextResponse.json(
        { success: false, error: "Workshop not found" },
        { status: 404 }
      );
    }

    return NextResponse.json({ success: true, data: workshop });
  } catch (error) {
    console.error("Error fetching workshop:", error);
    return NextResponse.json(
      { success: false, error: "Failed to fetch workshop" },
      { status: 500 }
    );
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const actor = await getApiActor();
    if (!actor) {
      return NextResponse.json({ success: false, error: "Authentication required" }, { status: 401 });
    }
    if (!isPrivilegedRole(actor.role)) {
      return NextResponse.json({ success: false, error: "Forbidden" }, { status: 403 });
    }

    const { id } = await params;
    const body = await request.json();
    const validation = updateWorkshopSchema.safeParse(body);

    if (!validation.success) {
      return NextResponse.json(
        { success: false, error: validation.error.issues },
        { status: 400 }
      );
    }

    const existing = await db.workshop.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json(
        { success: false, error: "Workshop not found" },
        { status: 404 }
      );
    }

    const data = validation.data;
    if (data.eventDate) {
      const dateChangeValidation = validateDateChange(
        existing.eventDate,
        new Date(data.eventDate)
      );

      if (!dateChangeValidation.valid || dateChangeValidation.requiresApproval) {
        return NextResponse.json(
          {
            success: false,
            error:
              dateChangeValidation.reason ||
              "Date change requires manual approval",
            requiresApproval: dateChangeValidation.requiresApproval,
            leadTimeDays: dateChangeValidation.leadTimeDays,
          },
          { status: dateChangeValidation.requiresApproval ? 409 : 400 }
        );
      }
    }

    const workshop = await db.workshop.update({
      where: { id },
      data: {
        ...(data.title && { title: data.title }),
        ...(data.description !== undefined && { description: data.description }),
        ...(data.format && { format: data.format }),
        ...(data.duration && { duration: data.duration }),
        ...(data.eventDate && { eventDate: new Date(data.eventDate) }),
        ...(data.eventTime !== undefined && { eventTime: data.eventTime }),
        ...(data.timezone && { timezone: data.timezone }),
        ...(data.venueName !== undefined && { venueName: data.venueName }),
        ...(data.venueAddress !== undefined && {
          venueAddress: data.venueAddress ? JSON.stringify(data.venueAddress) : null
        }),
        ...(data.parkingInstructions !== undefined && {
          parkingInstructions: data.parkingInstructions,
        }),
        ...(data.virtualPlatform !== undefined && {
          virtualPlatform: data.virtualPlatform,
        }),
        ...(data.virtualLink !== undefined && {
          virtualLink: data.virtualLink || null,
        }),
        ...(data.isFree !== undefined && { isFree: data.isFree }),
        ...(data.priceCents !== undefined && { priceCents: data.priceCents }),
        ...(data.earlyBirdPriceCents !== undefined && {
          earlyBirdPriceCents: data.earlyBirdPriceCents,
        }),
        ...(data.earlyBirdDeadline !== undefined && {
          earlyBirdDeadline: data.earlyBirdDeadline
            ? new Date(data.earlyBirdDeadline)
            : null,
        }),
        ...(data.maxAttendees !== undefined && { maxAttendees: data.maxAttendees }),
      },
      include: {
        coach: true,
        workshopType: true,
      },
    });

    return NextResponse.json({
      success: true,
      data: workshop,
      message: "Workshop updated successfully",
    });
  } catch (error) {
    console.error("Error updating workshop:", error);
    return NextResponse.json(
      { success: false, error: "Failed to update workshop" },
      { status: 500 }
    );
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const actor = await getApiActor();
    if (!actor) {
      return NextResponse.json({ success: false, error: "Authentication required" }, { status: 401 });
    }
    if (!isPrivilegedRole(actor.role)) {
      return NextResponse.json({ success: false, error: "Forbidden" }, { status: 403 });
    }

    const { id } = await params;

    const existing = await db.workshop.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json(
        { success: false, error: "Workshop not found" },
        { status: 404 }
      );
    }

    let cancellationRequest: CancellationRequestPayload;
    try {
      cancellationRequest = await parseCancellationRequest(request);
    } catch {
      return NextResponse.json(
        { success: false, error: "Invalid JSON payload" },
        { status: 400 }
      );
    }

    const now = Date.now();
    const daysUntilEvent = Math.floor(
      (existing.eventDate.getTime() - now) / (1000 * 60 * 60 * 24)
    );
    const cancellationFeeRequired =
      daysUntilEvent >= 0 && daysUntilEvent < MINIMUM_LEAD_TIME_DAYS;
    const cancellationFee = {
      required: cancellationFeeRequired,
      charged: false,
      waived: false,
      amountCents: 0,
      paymentIntentId: null as string | null,
    };

    if (cancellationFeeRequired) {
      if (cancellationRequest.waiveCancellationFee) {
        cancellationFee.waived = true;
      } else if (cancellationRequest.chargeCancellationFee) {
        if (
          !cancellationRequest.stripeCustomerId ||
          !cancellationRequest.stripePaymentMethodId
        ) {
          return NextResponse.json(
            {
              success: false,
              error:
                "stripeCustomerId and stripePaymentMethodId are required when charging cancellation fee",
            },
            { status: 400 }
          );
        }

        const requestedAmount = cancellationRequest.cancellationFeeCents;
        const amountCents =
          typeof requestedAmount === "number" &&
          Number.isFinite(requestedAmount) &&
          requestedAmount > 0
            ? Math.round(requestedAmount)
            : DEFAULT_CANCELLATION_FEE_CENTS;

        try {
          const paymentIntent = await chargeCancellationFee(
            cancellationRequest.stripeCustomerId,
            cancellationRequest.stripePaymentMethodId,
            amountCents
          );
          cancellationFee.charged = true;
          cancellationFee.amountCents = amountCents;
          cancellationFee.paymentIntentId = paymentIntent.id;
        } catch (error) {
          console.error("Cancellation fee charge failed:", error);
          return NextResponse.json(
            {
              success: false,
              error: "Failed to charge cancellation fee",
            },
            { status: 502 }
          );
        }
      } else {
        return NextResponse.json(
          {
            success: false,
            error: `Cancellation within ${MINIMUM_LEAD_TIME_DAYS} days requires cancellation fee handling`,
            cancellationFee,
          },
          { status: 400 }
        );
      }
    }

    // Soft delete by setting status to CANCELLED
    await db.workshop.update({
      where: { id },
      data: { status: "CANCELLED" },
    });

    return NextResponse.json({
      success: true,
      message: "Workshop cancelled successfully",
      cancellationFee,
    });
  } catch (error) {
    console.error("Error deleting workshop:", error);
    return NextResponse.json(
      { success: false, error: "Failed to delete workshop" },
      { status: 500 }
    );
  }
}
