import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { updateWorkshopSchema } from "@/lib/validations";
import { canManageCoachData, getApiActor, isPrivilegedRole } from "@/lib/auth/authorization";
import { validateDateChange, MINIMUM_LEAD_TIME_DAYS } from "@/lib/workshops/lead-time-validator";
import { chargeCancellationFee, createWorkshopPromotionCode } from "@/services/stripe";
import { buildWorkshopVariables, interpolateContent, rewriteIdentityFields } from "@/lib/templates/template-interpolation";
import { sendCustomPriceChangeEmail } from "@/services/notifications";
import { formatApprovalMessage } from "@/lib/approvals/approval-thread";
import { parseStoredWorkshopCoupons, parseWorkshopCouponsInput, serializeWorkshopCoupons } from "@/lib/workshops/workshop-coupons";
import { inngest } from "@/inngest/client";
import { parseDurationHours } from "@/lib/ics-generator";
import { cancelWorkflowExecutions } from "@/lib/workflows/workflow-service";

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
          where: { paymentStatus: { not: "PENDING" } },
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

    // Extract and validate coupons before Zod parse (Zod schema would strip them)
    let parsedCoupons: ReturnType<typeof parseWorkshopCouponsInput> | undefined;
    if (body.coupons !== undefined && isPrivilegedRole(actor.role)) {
      try {
        parsedCoupons = parseWorkshopCouponsInput(body.coupons);
      } catch {
        return NextResponse.json({ success: false, error: "Invalid coupon data" }, { status: 400 });
      }
    }

    // Normalize null → undefined before Zod validation: the schema uses .optional()
    // which accepts undefined but not null. Null values in PATCH payloads (sent by
    // the frontend to represent "empty optional field") would fail with a type error.
    // The Prisma update already applies || null patterns to handle DB clearing.
    const bodyForValidation = Object.fromEntries(
      Object.entries(body as Record<string, unknown>).map(([k, v]) => [k, v === null ? undefined : v])
    );
    const validation = updateWorkshopSchema.safeParse(bodyForValidation);

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

    // Fix #2: Post-approval lockdown — coaches cannot edit approved workshops
    if (isCoach) {
      const LOCKED_STATUSES = new Set(["PRE_EVENT", "POST_EVENT", "COMPLETED"]);
      if (LOCKED_STATUSES.has(existing.status)) {
        return NextResponse.json({
          success: false,
          error: "This workshop is approved and locked. Contact admin for changes.",
        }, { status: 403 });
      }
    }

    const data = validation.data;

    // Detect date/time change before update (compare against existing values)
    const dateChanged =
      (data.eventDate !== undefined &&
        data.eventDate?.toISOString() !== existing.eventDate?.toISOString()) ||
      (data.eventTime !== undefined && data.eventTime !== existing.eventTime);

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
        // BUG-06–08: seed the coach's initial message via Prisma nested write
        // so the approval thread is complete from creation.
        await db.approvalQueue.create({
          data: {
            type: "CUSTOM_PRICING",
            workshopId: existing.id,
            coachId: existing.coachId,
            requestedBy: actor.email,
            requestData: JSON.stringify({
              oldPriceCents,
              newPriceCents,
              workshopTitle: existing.title,
              workshopEventDate: existing.eventDate.toISOString(),
              pricingTierId: data.pricingTierId ?? existing.pricingTierId,
              customPricingNotes: notes,
              requestedBy: actor.email,
            }),
            notes: notes ?? null,
            messages: {
              create: [
                {
                  from: "COACH",
                  text: formatApprovalMessage({
                    type: "REQUEST",
                    amountCents: newPriceCents,
                    note: notes,
                  }),
                },
              ],
            },
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
      // Privileged roles (ADMIN + STAFF) can set past dates (retroactive imports); coaches cannot.
      if (!isPrivileged && new Date(data.eventDate) < new Date()) {
        return NextResponse.json(
          { success: false, error: "Event date cannot be in the past" },
          { status: 400 }
        );
      }

      // Admins bypass all lead-time checks; coaches bypass only in INFO_REQUESTED/DENIED flow (FIG-009)
      const shouldValidateDateChange =
        !isPrivilegedRole(actor.role) &&
        !(isCoach && ["INFO_REQUESTED", "DENIED"].includes(existing.status));

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

    // Sync coupons to Stripe BEFORE writing to DB so the returned
    // stripePromotionCodeId can be persisted in the same workshop.update.
    // Without this the checkout-time validator can't match redeemed codes
    // against the workshop allowlist (validation reads stripePromotionCodeId
    // from Workshop.coupons).
    const stripeErrors: string[] = [];
    if (parsedCoupons !== undefined) {
      if (!existing.workshopCode) {
        if (parsedCoupons.length > 0) {
          stripeErrors.push("Workshop code is missing — coupons saved to DB but not synced to Stripe.");
        }
      } else if (parsedCoupons.length > 0) {
        // Reuse existing Stripe IDs when the coupon's economic shape is unchanged,
        // so re-saving the workshop doesn't orphan a new promotion code in Stripe
        // on every PATCH.
        const previousCoupons = parseStoredWorkshopCoupons(existing.coupons);
        const previousByCode = new Map(previousCoupons.map((c) => [c.code, c]));

        const results = await Promise.allSettled(
          parsedCoupons.map(async (coupon) => {
            const previous = previousByCode.get(coupon.code);
            const economicShapeMatches =
              previous &&
              previous.stripePromotionCodeId &&
              previous.discountType === coupon.discountType &&
              previous.discountPercent === coupon.discountPercent &&
              previous.discountAmountCents === coupon.discountAmountCents &&
              previous.singleUse === coupon.singleUse;
            if (economicShapeMatches) {
              return {
                stripeCouponId: previous.stripeCouponId ?? null,
                stripePromotionCodeId: previous.stripePromotionCodeId ?? null,
              };
            }
            return createWorkshopPromotionCode({
              workshopCode: existing.workshopCode ?? "",
              workshopTitle: existing.title,
              code: coupon.code,
              discountType: coupon.discountType,
              discountPercent: coupon.discountPercent,
              discountAmountCents: coupon.discountAmountCents,
              singleUse: coupon.singleUse,
            });
          })
        );

        parsedCoupons = parsedCoupons.map((coupon, i) => {
          const result = results[i];
          if (result.status === "fulfilled") {
            return {
              ...coupon,
              stripeCouponId: result.value.stripeCouponId ?? null,
              stripePromotionCodeId: result.value.stripePromotionCodeId ?? null,
            };
          }
          const msg = `Coupon "${coupon.code}" failed to sync to Stripe: ${(result.reason as Error)?.message ?? "unknown error"}`;
          console.error("[coupon-sync]", msg);
          stripeErrors.push(msg);
          return coupon;
        });
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
        // Coupon codes (admin/staff only, validated above)
        ...(parsedCoupons !== undefined && { coupons: serializeWorkshopCoupons(parsedCoupons) }),
      },
      include: {
        coach: true,
        workshopType: true,
      },
    });

    // R4B: Sync landing page content when logistics fields change
    const syncFields = ["title", "description", "eventDate", "eventTime", "timezone", "virtualLink", "venueName", "venueAddress"] as const;
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

    // Emit Inngest event — awaited so the HTTP call to Inngest completes
    // before the serverless function shuts down. The Inngest function then
    // runs asynchronously in its own invocation with retries.
    if (dateChanged && !isCoach && workshop.coach) {
      try {
        await inngest.send({
          name: "workshop/date-changed",
          data: { workshopId: workshop.id },
        });
      } catch (err) {
        console.error("[PATCH /workshops] Failed to emit workshop/date-changed:", err);
        // Non-blocking: workshop update still succeeds.
      }
    }

    return NextResponse.json({
      success: true,
      data: workshop,
      message: "Workshop updated successfully",
      ...(landingPageSyncWarning ? { warning: landingPageSyncWarning } : {}),
      ...(stripeErrors.length > 0 && { stripeErrors }),
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

    // Fix #2: Post-approval lockdown — coaches cannot cancel approved workshops
    if (!isPrivilegedRole(actor.role)) {
      const COACH_LOCKED_STATUSES = new Set(["PRE_EVENT", "POST_EVENT", "COMPLETED"]);
      if (COACH_LOCKED_STATUSES.has(existing.status)) {
        return NextResponse.json({
          success: false,
          error: "Approved workshops cannot be cancelled by coaches. Contact admin.",
        }, { status: 403 });
      }
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

    // Soft delete by setting status to CANCELED and canceling pending workflow executions
    await db.$transaction(async (tx) => {
      await tx.workshop.update({
        where: { id },
        data: { status: "CANCELED" },
      });
      await cancelWorkflowExecutions(id, tx);
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
