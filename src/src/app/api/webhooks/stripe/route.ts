import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { constructWebhookEvent } from "@/services/stripe";
import { createOrUpdateContact } from "@/services/hubspot";
import Stripe from "stripe";

export async function POST(request: NextRequest) {
  if (!process.env.STRIPE_WEBHOOK_SECRET) {
    console.error(
      "[Stripe Webhook] STRIPE_WEBHOOK_SECRET is not set — add it to your environment variables"
    );
    return NextResponse.json({ error: "Webhook misconfigured" }, { status: 503 });
  }

  try {
    const body = await request.text();
    const signature = request.headers.get("stripe-signature");

    if (!signature) {
      return NextResponse.json(
        { error: "Missing stripe-signature header" },
        { status: 400 }
      );
    }

    const event = constructWebhookEvent(body, signature);

    console.log(`Stripe webhook received: ${event.id} (${event.type})`);

    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object as Stripe.Checkout.Session;
        await handleCheckoutComplete(session);
        break;
      }

      case "payment_intent.succeeded": {
        const paymentIntent = event.data.object as Stripe.PaymentIntent;
        await handlePaymentIntentSucceeded(paymentIntent);
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
    if (error instanceof Stripe.errors.StripeSignatureVerificationError) {
      return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
    }
    console.error("[Stripe Webhook] Unexpected error:", error);
    return NextResponse.json(
      { error: "Webhook handler failed" },
      { status: 500 }
    );
  }
}

interface RegistrationWithWorkshopForSync {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  company: string | null;
  jobTitle: string | null;
  phone: string | null;
  workshop: {
    title: string;
    eventDate: Date;
    coach: {
      firstName: string;
      lastName: string;
    };
  };
}

async function syncRegistrationToHubSpot(
  registration: RegistrationWithWorkshopForSync,
  registrationId: string
) {
  if (!process.env.HUBSPOT_ACCESS_TOKEN) {
    console.warn("HUBSPOT_ACCESS_TOKEN is not set; skipping HubSpot sync");
    return;
  }

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

    await db.registration.update({
      where: { id: registrationId },
      data: { hubspotContactId },
    });

    console.log(`HubSpot contact synced: ${hubspotContactId}`);
  } catch (error) {
    console.error("Failed to sync to HubSpot:", error);
    // Don't fail the webhook - HubSpot sync can be retried
  }
}

async function handleCheckoutComplete(session: Stripe.Checkout.Session) {
  const { registrationId } = session.metadata || {};
  const paymentIntentId =
    typeof session.payment_intent === "string"
      ? session.payment_intent
      : session.payment_intent?.id || null;

  if (!registrationId) {
    console.error("No registrationId in session metadata");
    return;
  }

  const existing = await db.registration.findUnique({
    where: { id: registrationId },
    select: {
      id: true,
      email: true,
      paymentStatus: true,
      stripePaymentId: true,
    },
  });

  if (!existing) {
    console.warn(`Registration not found for webhook session ${session.id}: ${registrationId}`);
    return;
  }

  if (
    existing.paymentStatus === "COMPLETED" &&
    existing.stripePaymentId &&
    paymentIntentId &&
    existing.stripePaymentId === paymentIntentId
  ) {
    console.log(`Duplicate checkout.session.completed ignored for registration ${registrationId}`);
    return;
  }

  // Update registration with payment info
  const registration = await db.registration.update({
    where: { id: registrationId },
    data: {
      paymentStatus: "COMPLETED",
      stripePaymentId: paymentIntentId,
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

  await syncRegistrationToHubSpot(registration, registrationId);

  console.log(`Payment completed for registration: ${registrationId}`);
}

async function handlePaymentIntentSucceeded(paymentIntent: Stripe.PaymentIntent) {
  const { registrationId } = paymentIntent.metadata || {};
  if (!registrationId) {
    console.log(`Payment intent ${paymentIntent.id} has no registrationId metadata; skipping.`);
    return;
  }

  const existing = await db.registration.findUnique({
    where: { id: registrationId },
    select: {
      id: true,
      email: true,
      paymentStatus: true,
      stripePaymentId: true,
    },
  });

  if (!existing) {
    console.warn(`Registration not found for payment_intent.succeeded ${paymentIntent.id}: ${registrationId}`);
    return;
  }

  if (
    existing.paymentStatus === "COMPLETED" &&
    existing.stripePaymentId &&
    existing.stripePaymentId === paymentIntent.id
  ) {
    console.log(`Duplicate payment_intent.succeeded ignored for registration ${registrationId}`);
    return;
  }

  const registration = await db.registration.update({
    where: { id: registrationId },
    data: {
      paymentStatus: "COMPLETED",
      stripePaymentId: paymentIntent.id,
      amountPaidCents: paymentIntent.amount_received || paymentIntent.amount || 0,
      status: "CONFIRMED",
    },
    include: {
      workshop: {
        include: {
          coach: true,
        },
      },
    },
  });

  await syncRegistrationToHubSpot(registration, registrationId);
  console.log(`Payment intent succeeded for registration: ${registrationId}`);
}

async function handlePaymentFailed(paymentIntent: Stripe.PaymentIntent) {
  const { registrationId } = paymentIntent.metadata || {};

  if (!registrationId) {
    console.error("No registrationId in payment intent metadata");
    return;
  }

  const existing = await db.registration.findUnique({
    where: { id: registrationId },
    select: {
      id: true,
      paymentStatus: true,
    },
  });

  if (!existing) {
    console.warn(`Registration not found for failed payment ${paymentIntent.id}: ${registrationId}`);
    return;
  }

  // Don't downgrade a completed payment on out-of-order webhook delivery.
  if (existing.paymentStatus === "COMPLETED") {
    console.log(`Ignoring payment_intent.payment_failed for already-completed registration ${registrationId}`);
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
