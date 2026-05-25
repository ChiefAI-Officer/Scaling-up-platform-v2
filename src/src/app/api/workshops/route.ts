import { NextRequest, NextResponse } from "next/server";
import { ZodError } from "zod";
import { db } from "@/lib/db";
import { createWorkshopSchema } from "@/lib/validations";
import { generateSlug } from "@/lib/utils";
import { getApiActor, isPrivilegedRole } from "@/lib/auth/authorization";
import { validateLeadTime } from "@/lib/workshops/lead-time-validator";
import { generateUniqueWorkshopCode } from "@/lib/workshops/workshop-code";
import { sendWorkshopRequestedEmail } from "@/services/notifications";
import { parseWorkshopCouponsInput, serializeWorkshopCoupons } from "@/lib/workshops/workshop-coupons";
import { createWorkshopPromotionCode } from "@/services/stripe";
import { inngest } from "@/inngest/client";

function normalizeOptionalString(value: unknown): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function parseOptionalPercentage(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) {
    if (value > 0 && value <= 100) {
      return Math.round(value);
    }
    return undefined;
  }

  if (typeof value !== "string") {
    return undefined;
  }

  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed <= 0 || parsed > 100) {
    return undefined;
  }

  return parsed;
}

export async function GET(request: NextRequest) {
  try {
    const actor = await getApiActor();
    if (!actor) {
      return NextResponse.json({ success: false, error: "Authentication required" }, { status: 401 });
    }

    const searchParams = request.nextUrl.searchParams;
    const status = searchParams.get("status");
    const requestedCoachId = searchParams.get("coachId");
    const parsedPage = parseInt(searchParams.get("page") || "1", 10);
    const parsedPageSize = parseInt(searchParams.get("pageSize") || "20", 10);
    const page = Number.isFinite(parsedPage) && parsedPage > 0 ? parsedPage : 1;
    const pageSize =
      Number.isFinite(parsedPageSize) && parsedPageSize > 0
        ? Math.min(100, parsedPageSize)
        : 20;

    const where: { status?: string; coachId?: string } = {};
    if (status) {
      where.status = status;
    }

    if (isPrivilegedRole(actor.role)) {
      if (requestedCoachId) {
        where.coachId = requestedCoachId;
      }
    } else {
      if (!actor.coachId) {
        return NextResponse.json({ success: false, error: "Coach profile required" }, { status: 403 });
      }

      if (requestedCoachId && requestedCoachId !== actor.coachId) {
        return NextResponse.json({ success: false, error: "Forbidden" }, { status: 403 });
      }

      where.coachId = actor.coachId;
    }

    const [workshops, total] = await Promise.all([
      db.workshop.findMany({
        where,
        include: {
          coach: true,
          workshopType: true,
          _count: {
            select: { registrations: true },
          },
        },
        orderBy: { eventDate: "asc" },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      db.workshop.count({ where }),
    ]);

    return NextResponse.json({
      success: true,
      data: workshops,
      pagination: {
        page,
        pageSize,
        total,
        totalPages: Math.ceil(total / pageSize),
      },
    });
  } catch (error) {
    console.error("Error fetching workshops:", error);
    return NextResponse.json(
      { success: false, error: "Failed to fetch workshops" },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const actor = await getApiActor();
    if (!actor) {
      return NextResponse.json({ success: false, error: "Authentication required" }, { status: 401 });
    }
    if (!isPrivilegedRole(actor.role)) {
      return NextResponse.json({ success: false, error: "Forbidden" }, { status: 403 });
    }

    const body = await request.json();
    const validation = createWorkshopSchema.safeParse(body);

    if (!validation.success) {
      return NextResponse.json(
        { success: false, error: validation.error.issues },
        { status: 400 }
      );
    }

    const data = validation.data;
    const isDuoWorkshop = body.isDuoWorkshop === true || body.isDuoWorkshop === "true";
    const secondaryCoachId = normalizeOptionalString(body.secondaryCoachId);
    const eventEndTime = normalizeOptionalString(body.eventEndTime);
    const couponCode = normalizeOptionalString(body.couponCode);
    const couponDiscountPercent = parseOptionalPercentage(body.couponDiscountPercent);
    let requestedCoupons;
    try {
      requestedCoupons = parseWorkshopCouponsInput(body.coupons, {
        code: couponCode,
        discountPercent: couponDiscountPercent,
      });
    } catch (error) {
      if (error instanceof SyntaxError || error instanceof ZodError) {
        return NextResponse.json(
          {
            success: false,
            error: error instanceof ZodError ? error.issues : "Invalid coupons payload",
          },
          { status: 400 }
        );
      }
      throw error;
    }

    if (isDuoWorkshop && !secondaryCoachId) {
      return NextResponse.json(
        { success: false, error: "Secondary coach is required for duo workshops" },
        { status: 400 }
      );
    }

    if (secondaryCoachId && secondaryCoachId === data.coachId) {
      return NextResponse.json(
        { success: false, error: "Coach 2 must be different from the primary coach" },
        { status: 400 }
      );
    }

    const leadTimeValidation = validateLeadTime(
      new Date(data.eventDate),
      data.format
    );
    // Admins bypass all lead-time and past-date restrictions (for retroactive imports).
    // Coaches and staff are still subject to both the past-date and minimum lead-time checks.
    if (!leadTimeValidation.valid && !isPrivilegedRole(actor.role)) {
      return NextResponse.json(
        {
          success: false,
          error: leadTimeValidation.reason || "Invalid event date",
          requiresApproval: leadTimeValidation.requiresApproval,
          leadTimeDays: leadTimeValidation.leadTimeDays,
          requiredLeadTimeDays: leadTimeValidation.requiredLeadTimeDays,
        },
        { status: leadTimeValidation.requiresApproval ? 409 : 400 }
      );
    }

    // FIG-011: Virtual workshops must have a meeting link
    if (data.format === "VIRTUAL" && !data.virtualLink) {
      return NextResponse.json(
        { success: false, error: "Meeting link is required for virtual workshops" },
        { status: 400 }
      );
    }

    // Verify coach exists and is eligible
    const coach = await db.coach.findUnique({
      where: { id: data.coachId },
      include: {
        certifications: {
          where: { workshopTypeId: data.workshopTypeId },
        },
      },
    });

    if (!coach) {
      return NextResponse.json(
        { success: false, error: "Coach not found" },
        { status: 404 }
      );
    }

    // Check certification status
    const certification = coach.certifications[0];
    if (!certification || certification.status !== "ACTIVE") {
      return NextResponse.json(
        {
          success: false,
          error: "Coach is not certified for this workshop type",
        },
        { status: 400 }
      );
    }

    // Verify workshop type exists
    const workshopType = await db.workshopType.findUnique({
      where: { id: data.workshopTypeId },
    });

    if (!workshopType) {
      return NextResponse.json(
        { success: false, error: "Workshop type not found" },
        { status: 404 }
      );
    }

    let secondaryCoachSnapshot:
      | {
          id: string;
          firstName: string;
          lastName: string;
          email: string;
          profileImage: string | null;
          company: string | null;
        }
      | null = null;

    if (secondaryCoachId) {
      const secondaryCoach = await db.coach.findUnique({
        where: { id: secondaryCoachId },
        select: {
          id: true,
          firstName: true,
          lastName: true,
          email: true,
          profileImage: true,
          company: true,
        },
      });

      if (!secondaryCoach) {
        return NextResponse.json(
          { success: false, error: "Secondary coach not found" },
          { status: 404 }
        );
      }

      secondaryCoachSnapshot = secondaryCoach;
    }

    // JV-16: Resolve category from categoryId or fall back to body.category enum
    let category: "AI" | "EXIT_AND_VALUATION" = "AI";
    let resolvedCategoryId: string | null = null;

    if (data.categoryId) {
      const cat = await db.category.findUnique({ where: { id: data.categoryId } });
      if (cat) {
        resolvedCategoryId = cat.id;
        // Map slug to enum for backward compat
        category = cat.slug.includes("exit") || cat.slug.includes("valuation")
          ? "EXIT_AND_VALUATION"
          : "AI";
      }
    } else if (body.category === "EXIT_AND_VALUATION") {
      category = "EXIT_AND_VALUATION";
    }

    // JV-17: Resolve pricing tier
    let resolvedPricingTierId: string | null = null;
    if (data.pricingTierId) {
      const tier = await db.pricingTier.findUnique({ where: { id: data.pricingTierId } });
      if (tier) {
        resolvedPricingTierId = tier.id;
      }
    }

    // JV-03: Generate unique workshop code
    const workshopCode = await generateUniqueWorkshopCode(
      async (code) => !!(await db.workshop.findUnique({ where: { workshopCode: code }, select: { id: true } }))
    );

    let persistedCoupons = [];
    try {
      persistedCoupons =
        requestedCoupons.length > 0
          ? await Promise.all(
              requestedCoupons.map(async (coupon) => {
                const stripeRecord = await createWorkshopPromotionCode({
                  workshopCode,
                  workshopTitle: data.title,
                  code: coupon.code,
                  // ENH-MAY6-7: discriminated discount type — PERCENT vs AMOUNT.
                  discountType: coupon.discountType,
                  discountPercent: coupon.discountPercent,
                  discountAmountCents: coupon.discountAmountCents,
                  singleUse: coupon.singleUse,
                });

                return {
                  ...coupon,
                  stripeCouponId: stripeRecord.stripeCouponId,
                  stripePromotionCodeId: stripeRecord.stripePromotionCodeId,
                };
              })
            )
          : [];
    } catch (error) {
      const stripeKeySet = !!process.env.STRIPE_SECRET_KEY;
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error(
        `Failed to create Stripe promotion codes: stripeKeySet=${stripeKeySet} error=${errorMessage}`,
        error
      );
      return NextResponse.json(
        {
          success: false,
          error: stripeKeySet
            ? "Failed to create discount codes. Please try again or contact support."
            : "Stripe is not configured. Please set STRIPE_SECRET_KEY in environment variables.",
        },
        { status: 502 }
      );
    }

    const workshop = await db.workshop.create({
      data: {
        coachId: data.coachId,
        workshopTypeId: data.workshopTypeId,
        workshopCode,
        title: data.title,
        description: data.description,
        category,
        categoryId: resolvedCategoryId,
        pricingTierId: resolvedPricingTierId,
        termsAcceptedAt: new Date(),
        format: data.format,
        duration: data.duration || "full-day",
        eventDate: new Date(data.eventDate),
        eventTime: data.eventTime,
        timezone: data.timezone,
        venueName: data.venueName,
        venueAddress: data.venueAddress ?? null,
        venueInstructions: data.venueInstructions,
        virtualLink: data.virtualLink || null,
        geoTargetAreas: data.geoTargetAreas,
        excludedClients: data.excludedClients,
        isFree: data.isFree,
        priceCents: data.priceCents,
        coupons: serializeWorkshopCoupons(persistedCoupons),
        maxAttendees: data.maxAttendees,
        status: isPrivilegedRole(actor.role) ? "AWAITING_APPROVAL" : "REQUESTED",
      },
      include: {
        coach: true,
        workshopType: true,
      },
    });

    // Generate landing page slug
    const slug = generateSlug(data.title, workshop.id);
    await db.workshop.update({
      where: { id: workshop.id },
      data: { landingPageSlug: slug },
    });

    if (isDuoWorkshop || secondaryCoachSnapshot || eventEndTime || couponCode || couponDiscountPercent) {
      await db.automationTask.create({
        data: {
          workshopId: workshop.id,
          taskType: "WORKSHOP_SETUP_METADATA",
          status: "PENDING",
          inputData: JSON.stringify({
            isDuoWorkshop,
            secondaryCoachId: secondaryCoachSnapshot?.id ?? secondaryCoachId ?? null,
            secondaryCoach: secondaryCoachSnapshot
              ? {
                  id: secondaryCoachSnapshot.id,
                  name: `${secondaryCoachSnapshot.firstName} ${secondaryCoachSnapshot.lastName}`,
                  title: secondaryCoachSnapshot.company || "Scaling Up Certified Coach",
                  photo: secondaryCoachSnapshot.profileImage,
                }
              : null,
            schedule: {
              startTime: data.eventTime ?? null,
              endTime: eventEndTime ?? null,
            },
            coupons: persistedCoupons,
          }),
        },
      });
    }

    // Create approval queue entry so admin can approve from /admin/approvals
    // (triggers auto-build pipeline on approval)
    await db.approvalQueue.create({
      data: {
        type: "WORKSHOP_REQUEST",
        status: "PENDING",
        coachId: data.coachId,
        workshopId: workshop.id,
        requestedBy: `${coach.firstName} ${coach.lastName}`,
        requestData: JSON.stringify({
          workshopTitle: workshop.title,
          workshopCode,
          format: data.format,
          eventDate: data.eventDate,
          createdVia: "ADMIN_DASHBOARD",
        }),
      },
    });

    // Admin/staff bypass: immediately trigger auto-build (skips approval queue)
    if (isPrivilegedRole(actor.role)) {
      try {
        await inngest.send({
          name: "workshop/approved",
          data: { approvalId: "", workshopId: workshop.id, coachId: workshop.coachId },
        });
        console.log(`[INNGEST] workshop/approved emitted for admin-created workshop=${workshop.id}`);
      } catch (err) {
        // Non-fatal: auto-build can be manually triggered from admin if needed
        console.error("[INNGEST] Failed to emit workshop/approved for admin workshop:", err);
      }
    }

    // Send workshop requested notification (non-blocking)
    sendWorkshopRequestedEmail({
      coachEmail: coach.email,
      coachName: `${coach.firstName} ${coach.lastName}`,
      workshopTitle: workshop.title,
      workshopId: workshop.id,
      linkedinUrl: coach.linkedinUrl,
    }).catch((err) => console.error("Failed to send workshop requested email:", err));

    return NextResponse.json(
      {
        success: true,
        data: {
          ...workshop,
          landingPageSlug: slug,
          workshopSetup: {
            isDuoWorkshop,
            secondaryCoachId: secondaryCoachSnapshot?.id ?? secondaryCoachId ?? null,
            coupons: persistedCoupons,
          },
        },
        message: "Workshop created successfully",
      },
      { status: 201 }
    );
  } catch (error) {
    console.error("Error creating workshop:", error);
    return NextResponse.json(
      { success: false, error: "Failed to create workshop" },
      { status: 500 }
    );
  }
}
