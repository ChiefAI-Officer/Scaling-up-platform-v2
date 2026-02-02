import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { constructWebhookEvent } from "@/services/stripe";
import { createOrUpdateContact } from "@/services/hubspot";
import Stripe from "stripe";

export async function POST(request: NextRequest) {
  try {
    const body = await request.text();
    const signature = request.headers.get("stripe-signature");

    if (!signature) {
      return NextResponse.json(
        { error: "Missing stripe-signature header" },
        { status: 400 }
      );
    }

    let event: Stripe.Event;
    try {
      event = constructWebhookEvent(body, signature);
    } catch (err) {
      console.error("Webhook signature verification failed:", err);
      return NextResponse.json(
        { error: "Invalid signature" },
        { status: 400 }
      );
    }

    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object as Stripe.Checkout.Session;
        await handleCheckoutComplete(session);
        break;
      }

      case "payment_intent.succeeded": {
        const paymentIntent = event.data.object as Stripe.PaymentIntent;
        console.log("Payment succeeded:", paymentIntent.id);
        break;
      }

      case "payment_intent.payment_failed": {
        const paymentIntent = event.data.object as Stripe.PaymentIntent;
        await handlePaymentFailed(paymentIntent);
        break;
      }

      default:
        console.log(`Unhandled event type: ${event.type}`);
    }

    return NextResponse.json({ received: true });
  } catch (error) {
    console.error("Webhook error:", error);
    return NextResponse.json(
      { error: "Webhook handler failed" },
      { status: 500 }
    );
  }
}

async function handleCheckoutComplete(session: Stripe.Checkout.Session) {
  const { registrationId } = session.metadata || {};

  if (!registrationId) {
    console.error("No registrationId in session metadata");
    return;
  }

  // Update registration with payment info
  const registration = await db.registration.update({
    where: { id: registrationId },
    data: {
      paymentStatus: "COMPLETED",
      stripePaymentId: session.payment_intent as string,
      amountPaidCents: session.amount_total || 0,
      status: "CONFIRMED",
    },
    include: {
      workshop: {
        include: {
          workshopType: true,
          coach: true,
        },
      },
    },
  });

  // Sync to HubSpot
  try {
    const hubspotContactId = await createOrUpdateContact({
      email: registration.email,
      firstname: registration.firstName,
      lastname: registration.lastName,
      company: registration.company || undefined,
      jobtitle: registration.jobTitle || undefined,
      phone: registration.phone || undefined,
      workshop_name: registration.workshop.title,
      workshop_date: registration.workshop.eventDate.toISOString(),
      coach_name: `${registration.workshop.coach.firstName} ${registration.workshop.coach.lastName}`,
    });

    // Update registration with HubSpot contact ID
    await db.registration.update({
      where: { id: registrationId },
      data: { hubspotContactId },
    });

    console.log(`HubSpot contact synced: ${hubspotContactId}`);
  } catch (error) {
    console.error("Failed to sync to HubSpot:", error);
    // Don't fail the webhook - HubSpot sync can be retried
  }

  console.log(`Payment completed for registration: ${registrationId}`);
}

async function handlePaymentFailed(paymentIntent: Stripe.PaymentIntent) {
  const { registrationId } = paymentIntent.metadata || {};

  if (!registrationId) {
    console.error("No registrationId in payment intent metadata");
    return;
  }

  // Update registration status
  await db.registration.update({
    where: { id: registrationId },
    data: {
      paymentStatus: "PENDING",
    },
  });

  console.log(`Payment failed for registration: ${registrationId}`);
}
