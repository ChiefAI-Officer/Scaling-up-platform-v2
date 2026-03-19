import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { updateWorkshopSchema } from "@/lib/validations";
import { canManageCoachData, getApiActor, isPrivilegedRole } from "@/lib/authorization";
import { validateDateChange, MINIMUM_LEAD_TIME_DAYS } from "@/lib/lead-time-validator";
import { chargeCancellationFee } from "@/services/stripe";
import { buildWorkshopVariables, interpolateContent, rewriteIdentityFields } from "@/lib/template-interpolation";
import { sendCustomPriceChangeEmail } from "@/services/notifications";

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

// Fields coaches are allowed to edit on their own workshops.
// priceCents and pricingTierId are included here so they don't get a 403 —
// but the PATCH handler intercepts them and routes to CUSTOM_PRICING approval
// instead of updating the workshop directly.
const COACH_EDITABLE_FIELDS = new Set([
  "title", "description", "categoryId", "format", "eventDate", "eventTime",
  "timezone", "venueName", "venueAddress", "venueInstructions", "virtualLink",
  "priceCents", "pricingTierId", "customPricingNotes",
]);

// Pricing fields that trigger an approval flow instead of a direct update
const COACH_PRICING_FIELDS = new Set(["priceCents", "pricingTierId"]);

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
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const body = await request.json() as any;
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

    // Coaches cannot edit fields outside their allowed set
    if (isCoach) {
      // Check raw body keys (not Zod-transformed data) — Zod defaults would
      // inject isFree/maxAttendees even when not sent, causing false 403s.
      const forbiddenFields = Object.keys(body).filter(
        (k) => !COACH_EDITABLE_FIELDS.has(k) && body[k] !== undefined
      );
      if (forbiddenFields.length > 0) {
        return NextResponse.json(
          { success: false, error: `Coaches cannot edit: ${forbiddenFields.join(", ")}` },
          { status: 403 }
        );
      }
    }

    // FIG-007: When a coach submits pricing fields, intercept and create a
    // CUSTOM_PRICING ApprovalQueue entry instead of updating the workshop directly.
    if (isCoach) {
      const hasPricingChange = Object.keys(data).some(
        (k) => COACH_PRICING_FIELDS.has(k) && data[k as keyof typeof data] !== undefined
      );

      if (hasPricingChange) {
        // Resolve new priceCents: either direct value or from the selected tier
        let newPriceCents = data.priceCents ?? existing.priceCents ?? 0;
        if (data.pricingTierId && data.pricingTierId !== existing.pricingTierId) {
          const tier = await db.pricingTier.findUnique({
            where: { id: data.pricingTierId },
            select: { amountCents: true },
          });
          if (tier) {
            newPriceCents = tier.amountCents;
          }
        }

        const oldPriceCents = existing.priceCents ?? 0;
        const notes = typeof body.customPricingNotes === "string" ? body.customPricingNotes : undefined;

        // Fetch the coach record for the email
        const coachRecord = await db.coach.findUnique({
          where: { id: existing.coachId },
          select: { firstName: true, lastName: true, email: true },
        });
        const coachName = coachRecord
          ? `${coachRecord.firstName} ${coachRecord.lastName}`.trim()
          : actor.email;

        // Create CUSTOM_PRICING approval queue entry
        await db.approvalQueue.create({
          data: {
            type: "CUSTOM_PRICING",
            workshopId: existing.id,
            coachId: existing.coachId,
            requestedBy: actor.email,
            requestData: JSON.stringify({
              oldPriceCents,
              newPriceCents,
              pricingTierId: data.pricingTierId ?? existing.pricingTierId,
              customPricingNotes: notes,
              requestedBy: actor.email,
            }),
            notes: notes ?? null,
          },
        });

        // Fire-and-forget email notification to admin
        sendCustomPriceChangeEmail({
          adminEmail: process.env.ADMIN_EMAIL || "admin@scalingup.com",
          coachName,
          workshopTitle: existing.title,
          workshopCode: existing.workshopCode ?? "",
          workshopId: existing.id,
          oldPriceCents,
          newPriceCents,
          customPricingNotes: notes,
        }).catch((err: unknown) => console.error("[FIG-007] sendCustomPriceChangeEmail failed:", err));

        return NextResponse.json(
          {
            success: true,
            pendingApproval: true,
            message: "Price change submitted for admin approval",
          },
          { status: 202 }
        );
      }
    }

    if (data.eventDate) {
      // FIG-009: Bypass lead-time check when coach edits during INFO_REQUESTED flow
      const shouldValidateDateChange = !(isCoach && existing.status === "INFO_REQUESTED");

      if (shouldValidateDateChange) {
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
