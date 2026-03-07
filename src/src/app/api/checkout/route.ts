import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { createCheckoutSession, StripeDiscountCodeError } from "@/services/stripe";
import { z } from "zod";
import { RateLimits, withRateLimit } from "@/lib/rate-limit";
import { parseStoredWorkshopCoupons } from "@/lib/workshop-coupons";

const checkoutSchema = z.object({
  registrationId: z.string().min(1, "Registration ID is required"),
  discountCode: z.preprocess(
    (value) => {
      if (typeof value !== "string") {
        return undefined;
      }

      const trimmed = value.trim();
      return trimmed.length > 0 ? trimmed : undefined;
    },
    z.string().max(64, "Discount code is too long").optional()
  ),
});

export async function POST(request: NextRequest) {
  try {
    const rateLimit = await withRateLimit(request, RateLimits.registration);
    if (!rateLimit.allowed) {
      return NextResponse.json(
        { success: false, error: "Too many requests. Please try again shortly." },
        { status: 429, headers: rateLimit.headers }
      );
    }

    const body = await request.json();
    const validation = checkoutSchema.safeParse(body);

    if (!validation.success) {
      return NextResponse.json(
        { success: false, error: validation.error.issues },
        { status: 400, headers: rateLimit.headers }
      );
    }

    const { registrationId, discountCode } = validation.data;

    const registration = await db.registration.findUnique({
      where: { id: registrationId },
      include: {
        workshop: {
          include: {
            workshopType: true,
          },
        },
      },
    });

    if (!registration) {
      return NextResponse.json(
        { success: false, error: "Registration not found" },
        { status: 404, headers: rateLimit.headers }
      );
    }

    if (registration.workshop.isFree) {
      return NextResponse.json(
        { success: false, error: "This workshop is free, no payment required" },
        { status: 400, headers: rateLimit.headers }
      );
    }

    if (registration.paymentStatus === "COMPLETED") {
      return NextResponse.json(
        { success: false, error: "Payment already completed" },
        { status: 400, headers: rateLimit.headers }
      );
    }

    const appUrl = process.env.APP_URL || "http://localhost:3000";
    const priceCents = registration.workshop.priceCents || 0;
    if (priceCents <= 0) {
      return NextResponse.json(
        { success: false, error: "Workshop pricing is not configured" },
        { status: 400, headers: rateLimit.headers }
      );
    }

    const session = await createCheckoutSession({
      workshopId: registration.workshop.id,
      workshopTitle: registration.workshop.title,
      priceCents,
      registrationId: registration.id,
      customerEmail: registration.email,
      discountCode,
      allowedPromotionCodeIds: parseStoredWorkshopCoupons(
        registration.workshop.coupons
      )
        .map((coupon) => coupon.stripePromotionCodeId)
        .filter((value): value is string => typeof value === "string" && value.length > 0),
      successUrl: `${appUrl}/registration/success?session_id={CHECKOUT_SESSION_ID}`,
      cancelUrl: registration.workshop.landingPageSlug
        ? `${appUrl}/workshop/${registration.workshop.landingPageSlug}?cancelled=true`
        : `${appUrl}/`,
    });

    // Save session ID to registration
    await db.registration.update({
      where: { id: registrationId },
      data: { stripeSessionId: session.id },
    });

    if (!session.url) {
      return NextResponse.json(
        { success: false, error: "Failed to initialize checkout session" },
        { status: 500, headers: rateLimit.headers }
      );
    }

    return NextResponse.json({
      success: true,
      data: {
        sessionId: session.id,
        url: session.url,
      },
    }, { headers: rateLimit.headers });
  } catch (error) {
    if (error instanceof StripeDiscountCodeError) {
      return NextResponse.json(
        { success: false, error: error.message },
        { status: 400 }
      );
    }

    console.error("Error creating checkout session:", error);
    return NextResponse.json(
      { success: false, error: "Failed to create checkout session" },
      { status: 500 }
    );
  }
}
