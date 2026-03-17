import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { updateWorkshopSchema } from "@/lib/validations";
import { canManageCoachData, getApiActor, isPrivilegedRole } from "@/lib/authorization";
import { validateDateChange, MINIMUM_LEAD_TIME_DAYS } from "@/lib/lead-time-validator";
import { chargeCancellationFee } from "@/services/stripe";
import { buildWorkshopVariables, interpolateContent, rewriteIdentityFields } from "@/lib/template-interpolation";

const DEFAULT_CANCELLATION_FEE_CENTS = 50000;

interface CancellationRequestPayload {
  chargeCancellationFee?: boolean;
  waiveCancellationFee?: boolean;
  waiveReason?: string;
  stripeCustomerId?: string;
  stripePaymentMethodId?: string;
  cancellationFeeCents?: number;
  acknowledgeFee?: boolean;
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

// Fields coaches are allowed to edit on their own workshops
const COACH_EDITABLE_FIELDS = new Set([
  "title", "description", "categoryId", "format", "eventDate", "eventTime",
  "timezone", "venueName", "venueAddress", "venueInstructions", "virtualLink",
]);

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const actor = await getApiActor();
    if (!actor) {
      return NextResponse.json({ success: false, error: "Authentication required" }, { status: 401 });
    }

    const isPrivileged = isPrivilegedRole(actor.role);
    const isCoach = actor.role === "COACH";

    if (!isPrivileged && !isCoach) {
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

    // Coaches can only patch their own workshop
    if (isCoach && existing.coachId !== actor.coachId) {
      return NextResponse.json({ success: false, error: "Workshop not found" }, { status: 404 });
    }

    const data = validation.data;

    // Coaches cannot edit pricing fields
    if (isCoach) {
      const forbiddenFields = Object.keys(data).filter(
        (k) => !COACH_EDITABLE_FIELDS.has(k) && data[k as keyof typeof data] !== undefined
      );
      if (forbiddenFields.length > 0) {
        return NextResponse.json(
          { success: false, error: `Coaches cannot edit: ${forbiddenFields.join(", ")}` },
          { status: 403 }
        );
      }
    }

    if (data.eventDate) {
      const dateChangeValidation = validateDateChange(
        existing.eventDate,
        new Date(data.eventDate),
        existing.format
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
        ...(data.categoryId !== undefined && { categoryId: data.categoryId || null }),
        ...(data.format && { format: data.format }),
        ...(data.duration && { duration: data.duration }),
        ...(data.eventDate && { eventDate: new Date(data.eventDate) }),
        ...(data.eventTime !== undefined && { eventTime: data.eventTime }),
        ...(data.timezone && { timezone: data.timezone }),
        ...(data.venueName !== undefined && { venueName: data.venueName }),
        ...(data.venueAddress !== undefined && {
          venueAddress: data.venueAddress || null
        }),
        ...(data.venueInstructions !== undefined && {
          venueInstructions: data.venueInstructions,
        }),
        ...(data.virtualLink !== undefined && {
          virtualLink: data.virtualLink || null,
        }),
        // Admin-only fields
        ...(!isCoach && data.geoTargetAreas !== undefined && { geoTargetAreas: data.geoTargetAreas }),
        ...(!isCoach && data.excludedClients !== undefined && { excludedClients: data.excludedClients }),
        ...(!isCoach && data.isFree !== undefined && { isFree: data.isFree }),
        ...(!isCoach && data.priceCents !== undefined && { priceCents: data.priceCents }),
        ...(!isCoach && data.maxAttendees !== undefined && { maxAttendees: data.maxAttendees }),
      },
      include: {
        coach: true,
        workshopType: true,
      },
    });

    // R4B: Sync landing page content when logistics fields change
    const syncFields = ["eventDate", "eventTime", "timezone", "virtualLink", "venueName", "venueAddress"] as const;
    const hasRelevantChange = syncFields.some((f) => data[f] !== undefined);
    let landingPageSyncWarning: string | undefined;
    if (hasRelevantChange) {
      try {
        const variables = await buildWorkshopVariables(id);
        if (variables) {
          const landingPages = await db.landingPage.findMany({ where: { workshopId: id }, select: { id: true, content: true } });
          for (const page of landingPages) {
            if (!page.content) continue;
            let updated = interpolateContent(page.content, variables);
            updated = rewriteIdentityFields(updated, variables);
            await db.landingPage.update({ where: { id: page.id }, data: { content: updated } });
          }
        }
      } catch (syncError) {
        console.error("[R4B] Landing page sync failed (non-blocking):", syncError);
        landingPageSyncWarning = "Landing page content sync failed — please refresh landing pages manually.";
      }
    }

    return NextResponse.json({
      success: true,
      data: workshop,
      message: "Workshop updated successfully",
      ...(landingPageSyncWarning ? { warning: landingPageSyncWarning } : {}),
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

    const { id } = await params;

    const existing = await db.workshop.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json(
        { success: false, error: "Workshop not found" },
        { status: 404 }
      );
    }

    // JV-28: Allow coaches to cancel their own workshops
    if (!isPrivilegedRole(actor.role) && !canManageCoachData(actor, existing.coachId)) {
      return NextResponse.json({ success: false, error: "Forbidden" }, { status: 403 });
    }

    // Prevent cancellation of already canceled or completed workshops
    if (existing.status === "CANCELED" || existing.status === "COMPLETED") {
      return NextResponse.json(
        { success: false, error: `Cannot cancel a workshop with status: ${existing.status}` },
        { status: 400 }
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
      } else if (cancellationRequest.acknowledgeFee) {
        // JV-28: Coach acknowledges the fee — cancellation proceeds, fee billed separately
        cancellationFee.amountCents = DEFAULT_CANCELLATION_FEE_CENTS;
      } else {
        return NextResponse.json(
          {
            success: false,
            error: `Cancellation within ${MINIMUM_LEAD_TIME_DAYS} days requires cancellation fee handling`,
            cancellationFee,
            daysUntilEvent,
            feeAmountCents: DEFAULT_CANCELLATION_FEE_CENTS,
          },
          { status: 400 }
        );
      }
    }

    // Soft delete by setting status to CANCELED
    await db.workshop.update({
      where: { id },
      data: { status: "CANCELED" },
    });

    return NextResponse.json({
      success: true,
      message: "Workshop canceled successfully",
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
