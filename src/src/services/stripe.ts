import Stripe from "stripe";

// Create Stripe client lazily to avoid build errors when key is not set
let stripeClient: Stripe | null = null;

function getStripeClient(): Stripe {
  if (!stripeClient) {
    if (!process.env.STRIPE_SECRET_KEY) {
      throw new Error("STRIPE_SECRET_KEY is not set");
    }
    stripeClient = new Stripe(process.env.STRIPE_SECRET_KEY);
  }
  return stripeClient;
}

interface CreateCheckoutSessionParams {
  workshopId: string;
  workshopTitle: string;
  priceCents: number;
  registrationId: string;
  customerEmail: string;
  successUrl: string;
  cancelUrl: string;
}

export async function createCheckoutSession({
  workshopId,
  workshopTitle,
  priceCents,
  registrationId,
  customerEmail,
  successUrl,
  cancelUrl,
}: CreateCheckoutSessionParams): Promise<Stripe.Checkout.Session> {
  const stripe = getStripeClient();
  const session = await stripe.checkout.sessions.create({
    payment_method_types: ["card"],
    line_items: [
      {
        price_data: {
          currency: "usd",
          product_data: {
            name: workshopTitle,
            description: `Registration for ${workshopTitle}`,
          },
          unit_amount: priceCents,
        },
        quantity: 1,
      },
    ],
    mode: "payment",
    success_url: successUrl,
    cancel_url: cancelUrl,
    customer_email: customerEmail,
    metadata: {
      workshopId,
      registrationId,
    },
  });

  return session;
}

export async function createProductAndPrice(
  workshopId: string,
  workshopTitle: string,
  priceCents: number
): Promise<{ productId: string; priceId: string }> {
  const stripe = getStripeClient();
  const product = await stripe.products.create({
    name: workshopTitle,
    metadata: {
      workshopId,
    },
  });

  const price = await stripe.prices.create({
    product: product.id,
    unit_amount: priceCents,
    currency: "usd",
  });

  return {
    productId: product.id,
    priceId: price.id,
  };
}

export async function processRefund(paymentIntentId: string): Promise<Stripe.Refund> {
  const stripe = getStripeClient();
  const refund = await stripe.refunds.create({
    payment_intent: paymentIntentId,
  });

  return refund;
}

export function constructWebhookEvent(
  payload: string | Buffer,
  signature: string
): Stripe.Event {
  if (!process.env.STRIPE_WEBHOOK_SECRET) {
    throw new Error("STRIPE_WEBHOOK_SECRET is not set");
  }

  const stripe = getStripeClient();
  return stripe.webhooks.constructEvent(
    payload,
    signature,
    process.env.STRIPE_WEBHOOK_SECRET
  );
}

// ============================================
// V2: Cancellation & Refund Logic
// ============================================

/**
 * Charge a cancellation fee to a coach
 * Requires the coach's Stripe Customer ID or a specific Payment Method ID.
 */
export async function chargeCancellationFee(
  customerId: string,
  paymentMethodId: string,
  amountCents: number = 50000 // Default $500.00
): Promise<Stripe.PaymentIntent> {
  const stripe = getStripeClient();

  try {
    const paymentIntent = await stripe.paymentIntents.create({
      amount: amountCents,
      currency: "usd",
      customer: customerId,
      payment_method: paymentMethodId,
      off_session: true, // Charge is initiated by system/admin, not user in flow
      confirm: true,     // Immediately confirm
      description: "Workshop Cancellation Fee",
      metadata: {
        type: "cancellation_fee"
      }
    });

    return paymentIntent;
  } catch (error) {
    console.error("Stripe cancellation charge failed:", error);
    // Handle "authentication_required" if off_session fails
    throw error;
  }
}

/**
 * Process a refund with logic to cap at a maximum covered amount.
 * Useful for cases where Scaling Up covers a portion of a refund or there's a limit.
 */
export async function processRefundWithOverage(
  paymentIntentId: string,
  maxCoveredCents: number = 25000
): Promise<Stripe.Refund> {
  const stripe = getStripeClient();

  // 1. Retrieve the PaymentIntent to check the original amount
  const paymentIntent = await stripe.paymentIntents.retrieve(paymentIntentId);
  const chargeAmount = paymentIntent.amount;

  // 2. Determine refund amount (min of charge vs maxCovered)
  const refundAmount = Math.min(chargeAmount, maxCoveredCents);

  // 3. Create Refund
  const refund = await stripe.refunds.create({
    payment_intent: paymentIntentId,
    amount: refundAmount,
    metadata: {
      type: "managed_refund",
      original_amount: chargeAmount.toString(),
      max_covered: maxCoveredCents.toString()
    }
  });

  return refund;
}

/**
 * Create an Invoice item (e.g. for custom work or manual fees)
 */
export async function createInvoiceItem(
  customerId: string,
  amountCents: number,
  description: string
): Promise<Stripe.InvoiceItem> {
  const stripe = getStripeClient();

  return await stripe.invoiceItems.create({
    customer: customerId,
    amount: amountCents,
    currency: "usd",
    description: description
  });
}
