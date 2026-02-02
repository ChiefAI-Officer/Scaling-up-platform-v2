import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { createCheckoutSession } from "@/services/stripe";
import { z } from "zod";

const checkoutSchema = z.object({
  registrationId: z.string().min(1, "Registration ID is required"),
});

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const validation = checkoutSchema.safeParse(body);

    if (!validation.success) {
      return NextResponse.json(
        { success: false, error: validation.error.issues },
        { status: 400 }
      );
    }

    const { registrationId } = validation.data;

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
        { status: 404 }
      );
    }

    if (registration.workshop.isFree) {
      return NextResponse.json(
        { success: false, error: "This workshop is free, no payment required" },
        { status: 400 }
      );
    }

    if (registration.paymentStatus === "COMPLETED") {
      return NextResponse.json(
        { success: false, error: "Payment already completed" },
        { status: 400 }
      );
    }

    const appUrl = process.env.APP_URL || "http://localhost:3000";
    const priceCents = registration.workshop.priceCents || 0;

    const session = await createCheckoutSession({
      workshopId: registration.workshop.id,
      workshopTitle: registration.workshop.title,
      priceCents,
      registrationId: registration.id,
      customerEmail: registration.email,
      successUrl: `${appUrl}/registration/success?session_id={CHECKOUT_SESSION_ID}`,
      cancelUrl: `${appUrl}/workshop/${registration.workshop.landingPageSlug}?cancelled=true`,
    });

    // Save session ID to registration
    await db.registration.update({
      where: { id: registrationId },
      data: { stripeSessionId: session.id },
    });

    return NextResponse.json({
      success: true,
      data: {
        sessionId: session.id,
        url: session.url,
      },
    });
  } catch (error) {
    console.error("Error creating checkout session:", error);
    return NextResponse.json(
      { success: false, error: "Failed to create checkout session" },
      { status: 500 }
    );
  }
}
