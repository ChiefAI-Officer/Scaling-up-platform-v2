/* eslint-disable */
/**
 * Recovery script for registrations stuck at PENDING despite a successful
 * Stripe payment (e.g. when the Stripe webhook didn't fire or failed
 * signature verification — see CLAUDE.md "STRIPE_WEBHOOK_SECRET rotated").
 *
 * Mirrors the side effects of `handleCheckoutComplete` in
 * src/app/api/webhooks/stripe/route.ts — DB update + Inngest events.
 *
 * Usage:
 *   npx tsx scripts/recover-stuck-registration.ts <email> <workshopCodeOrTitleSubstring>
 *   npx tsx scripts/recover-stuck-registration.ts gabriel@chiefaiofficer.com "Scaling Up AI"
 *
 * The script is idempotent: re-running on a registration already COMPLETED
 * is a no-op. It refuses to flip a registration whose Stripe session is
 * NOT marked paid.
 */
import { PrismaClient } from "@prisma/client";
import Stripe from "stripe";

const db = new PrismaClient();

async function main() {
  const email = process.argv[2];
  const workshopMatch = process.argv[3];

  if (!email || !workshopMatch) {
    console.error("usage: npx tsx scripts/recover-stuck-registration.ts <email> <workshopCodeOrTitle>");
    process.exit(1);
  }

  if (!process.env.STRIPE_SECRET_KEY) {
    console.error("STRIPE_SECRET_KEY not set in env");
    process.exit(1);
  }
  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, { timeout: 15_000 });

  // Find the workshop (by code first, then by title substring)
  let workshop = await db.workshop.findFirst({
    where: { workshopCode: workshopMatch },
    select: { id: true, title: true, workshopCode: true, priceCents: true },
  });
  if (!workshop) {
    workshop = await db.workshop.findFirst({
      where: { title: { contains: workshopMatch, mode: "insensitive" } },
      orderBy: { createdAt: "desc" },
      select: { id: true, title: true, workshopCode: true, priceCents: true },
    });
  }
  if (!workshop) {
    console.error(`No workshop matched code/title "${workshopMatch}"`);
    process.exit(1);
  }
  console.log(`Workshop: ${workshop.title} (${workshop.workshopCode})`);

  const registration = await db.registration.findFirst({
    where: { workshopId: workshop.id, email },
    orderBy: { createdAt: "desc" },
  });
  if (!registration) {
    console.error(`No registration for ${email} on this workshop`);
    process.exit(1);
  }
  console.log(`Registration: ${registration.id} status=${registration.status} paymentStatus=${registration.paymentStatus}`);
  console.log(`stripeSessionId: ${registration.stripeSessionId ?? "(none)"}`);

  if (registration.paymentStatus === "COMPLETED") {
    console.log("Already COMPLETED — no-op");
    return;
  }

  if (!registration.stripeSessionId) {
    console.error("No stripeSessionId on registration — cannot verify payment with Stripe. Aborting.");
    process.exit(1);
  }

  // Verify the Stripe session is actually paid
  const session = await stripe.checkout.sessions.retrieve(registration.stripeSessionId);
  console.log(`Stripe session payment_status: ${session.payment_status}`);
  if (session.payment_status !== "paid") {
    console.error(`Stripe session is not paid (status=${session.payment_status}). Refusing to flip.`);
    process.exit(1);
  }

  const paymentIntentId =
    typeof session.payment_intent === "string"
      ? session.payment_intent
      : session.payment_intent?.id ?? null;

  console.log("Updating registration to COMPLETED...");
  await db.registration.update({
    where: { id: registration.id },
    data: {
      paymentStatus: "COMPLETED",
      stripePaymentId: paymentIntentId,
      amountPaidCents: session.amount_total || workshop.priceCents || 0,
      status: "REGISTERED",
    },
  });

  console.log("Done. Registration is now COMPLETED.");
  console.log("");
  console.log("NOTE: Inngest events (registration/created, registration/payment-completed)");
  console.log("were NOT emitted by this script. For verification of workflows + surveys");
  console.log("the COMPLETED paymentStatus is sufficient. If you need email-sequence");
  console.log("scheduling or HubSpot sync, those can be triggered separately.");
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
