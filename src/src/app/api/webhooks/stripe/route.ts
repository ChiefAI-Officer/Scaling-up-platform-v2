import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { constructWebhookEvent } from "@/services/stripe";
import { inngest } from "@/inngest/client";
import Stripe from "stripe";

// Stripe webhook fix (May 2026): pin runtime + extend timeout. Heavy work
// is offloaded to the processPaymentCompleted Inngest function so this
// handler stays well under 2s; the maxDuration=30 is a safety margin.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

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

      // NOTE: checkout.session.expired must be enabled in the Stripe Dashboard webhook settings
      case "checkout.session.expired": {
        const session = event.data.object as Stripe.Checkout.Session;
        const { registrationId } = session.metadata || {};
        if (registrationId) {
          await db.registration.updateMany({
            where: { id: registrationId, paymentStatus: "PENDING" },
            data: { status: "CANCELLED", paymentStatus: "CANCELLED" },
          });
          console.log(`Cancelled PENDING registration ${registrationId} due to expired checkout session`);
        }
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

/**
 * Stripe webhook fix (May 2026, v5):
 * Slim handler — verifies the payment in DB and emits two Inngest events.
 * All slow side effects (HubSpot, SMTP+ICS) are handled by the
 * processPaymentCompleted Inngest function with retries + idempotency.
 *
 * Idempotency:
 *  - Skip emit ONLY when paymentProcessedAt is set (truly done).
 *  - paymentStatus=COMPLETED with paymentProcessedAt=NULL is the casualty
 *    class from the Apr 30 outage and MUST emit the event so side effects
 *    are processed.
 */
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
      firstName: true,
      workshopId: true,
      paymentStatus: true,
      status: true,
      stripePaymentId: true,
      paymentProcessedAt: true,
    },
  });

  if (!existing) {
    console.warn(`Registration not found for webhook session ${session.id}: ${registrationId}`);
    return;
  }

  // Never re-instate a cancelled registration
  if (existing.status === "CANCELLED") {
    console.log(`Skipping checkout completion for CANCELLED registration ${registrationId}`);
    return;
  }

  // v5 idempotency: skip ONLY when side effects are truly done.
  if (existing.paymentProcessedAt) {
    console.log(`paymentProcessedAt set — skipping emit for registration ${registrationId}`);
    return;
  }

  // Fresh PENDING → COMPLETED transition: update payment fields and emit
  // registration/created (drives existing scheduleEmailSequence). Stripe
  // retries land here with paymentStatus already COMPLETED, which means we
  // skip the update + registration/created emit but still emit the
  // payment-completed event below to trigger missing side effects.
  const justTransitioned = existing.paymentStatus !== "COMPLETED";
  if (justTransitioned) {
    await db.registration.update({
      where: { id: registrationId },
      data: {
        paymentStatus: "COMPLETED",
        stripePaymentId: paymentIntentId,
        amountPaidCents: session.amount_total || 0,
        status: "REGISTERED",
      },
    });

    try {
      await inngest.send({
        name: "registration/created",
        data: {
          registrationId: existing.id,
          workshopId: existing.workshopId,
          email: existing.email,
          firstName: existing.firstName,
        },
      });
    } catch (error) {
      console.error("Failed to publish registration/created event:", error);
    }
  }

  // Always emit registration/payment-completed when paymentProcessedAt is null.
  // Inngest function handles HubSpot sync, strict notification, and marks
  // paymentProcessedAt at the end. This is the casualty-class recovery path:
  // even on Stripe retries (where existing.paymentStatus is already COMPLETED),
  // we re-emit so missed side effects from the Apr 30 outage get processed.
  try {
    await inngest.send({
      name: "registration/payment-completed",
      data: { registrationId, source: "checkout.session.completed" },
    });
  } catch (error) {
    console.error("Failed to publish registration/payment-completed event:", error);
  }

  console.log(`Payment completed for registration: ${registrationId}`);
}

/**
 * Fallback handler for payment_intent.succeeded events. Same v5 semantics
 * as handleCheckoutComplete; checkout.session.completed is the canonical
 * trigger but if Stripe sends payment_intent.succeeded first/instead, this
 * picks it up safely.
 */
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
      firstName: true,
      workshopId: true,
      paymentStatus: true,
      status: true,
      stripePaymentId: true,
      paymentProcessedAt: true,
    },
  });

  if (!existing) {
    console.warn(`Registration not found for payment_intent.succeeded ${paymentIntent.id}: ${registrationId}`);
    return;
  }

  if (existing.status === "CANCELLED") {
    console.log(`Skipping payment_intent.succeeded for CANCELLED registration ${registrationId}`);
    return;
  }

  if (existing.paymentProcessedAt) {
    console.log(`paymentProcessedAt set — skipping emit for registration ${registrationId}`);
    return;
  }

  const justTransitioned = existing.paymentStatus !== "COMPLETED";
  if (justTransitioned) {
    await db.registration.update({
      where: { id: registrationId },
      data: {
        paymentStatus: "COMPLETED",
        stripePaymentId: paymentIntent.id,
        amountPaidCents: paymentIntent.amount_received || paymentIntent.amount || 0,
        status: "REGISTERED",
      },
    });

    try {
      await inngest.send({
        name: "registration/created",
        data: {
          registrationId: existing.id,
          workshopId: existing.workshopId,
          email: existing.email,
          firstName: existing.firstName,
        },
      });
    } catch (error) {
      console.error("Failed to publish registration/created event (payment_intent):", error);
    }
  }

  try {
    await inngest.send({
      name: "registration/payment-completed",
      data: { registrationId, source: "payment_intent.succeeded" },
    });
  } catch (error) {
    console.error("Failed to publish registration/payment-completed event (payment_intent):", error);
  }

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
