import Stripe from "stripe";

// Create Stripe client lazily to avoid build errors when key is not set
let stripeClient: Stripe | null = null;

function getStripeClient(): Stripe {
  if (!stripeClient) {
    if (!process.env.STRIPE_SECRET_KEY) {
      throw new Error("STRIPE_SECRET_KEY is not set");
    }
    stripeClient = new Stripe(process.env.STRIPE_SECRET_KEY, {
      timeout: 15_000, // 15-second timeout for all Stripe API calls
    });
  }
  return stripeClient;
}

interface CreateCheckoutSessionParams {
  workshopId: string;
  workshopTitle: string;
  priceCents: number;
  registrationId: string;
  customerEmail: string;
  discountCode?: string;
  allowedPromotionCodeIds?: string[];
  successUrl: string;
  cancelUrl: string;
}

interface CreateWorkshopPromotionCodeParams {
  workshopCode: string;
  workshopTitle: string;
  code: string;
  discountPercent: number;
  singleUse: boolean;
}

export class StripeDiscountCodeError extends Error {
  constructor(message: string = "Discount code is invalid or expired") {
    super(message);
    this.name = "StripeDiscountCodeError";
  }
}

const STRIPE_COUPON_NAME_MAX_LENGTH = 40;

export function buildWorkshopPromotionName(
  workshopTitle: string,
  code: string
): string {
  const normalizedTitle = workshopTitle.trim().replace(/\s+/g, " ");
  const normalizedCode = code.trim().toUpperCase();
  const suffix = ` (${normalizedCode})`;

  if (suffix.length >= STRIPE_COUPON_NAME_MAX_LENGTH) {
    return normalizedCode.slice(0, STRIPE_COUPON_NAME_MAX_LENGTH);
  }

  const maxTitleLength = STRIPE_COUPON_NAME_MAX_LENGTH - suffix.length;
  return `${normalizedTitle.slice(0, maxTitleLength).trimEnd()}${suffix}`;
}

function isPromotionCodeRedeemable(code: Stripe.PromotionCode): boolean {
  if (!code.active) {
    return false;
  }

  if (typeof code.max_redemptions === "number" && code.times_redeemed >= code.max_redemptions) {
    return false;
  }

  if (typeof code.expires_at === "number" && code.expires_at * 1000 <= Date.now()) {
    return false;
  }

  return true;
}

export async function createCheckoutSession({
  workshopId,
  workshopTitle,
  priceCents,
  registrationId,
  customerEmail,
  discountCode,
  allowedPromotionCodeIds,
  successUrl,
  cancelUrl,
}: CreateCheckoutSessionParams): Promise<Stripe.Checkout.Session> {
  const stripe = getStripeClient();
  const normalizedDiscountCode = discountCode?.trim();
  let discounts: Stripe.Checkout.SessionCreateParams.Discount[] | undefined;

  if (normalizedDiscountCode) {
    const promotionCodeLookup = await stripe.promotionCodes.list({
      code: normalizedDiscountCode,
      active: true,
      limit: 10,
    });

    const promotionCode = promotionCodeLookup.data.find((item) => {
      if (!isPromotionCodeRedeemable(item)) {
        return false;
      }

      if (
        Array.isArray(allowedPromotionCodeIds) &&
        allowedPromotionCodeIds.length > 0 &&
        !allowedPromotionCodeIds.includes(item.id)
      ) {
        return false;
      }

      return true;
    });

    if (!promotionCode) {
      throw new StripeDiscountCodeError();
    }

    discounts = [{ promotion_code: promotionCode.id }];
  }

  const metadata: Record<string, string> = {
    workshopId,
    registrationId,
  };
  if (normalizedDiscountCode) {
    metadata.discountCode = normalizedDiscountCode;
  }

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
    ...(discounts ? {} : { allow_promotion_codes: true }),
    discounts,
    success_url: successUrl,
    cancel_url: cancelUrl,
    customer_email: customerEmail,
    metadata,
  });

  return session;
}

export async function createWorkshopPromotionCode({
  workshopCode,
  workshopTitle,
  code,
  discountPercent,
  singleUse,
}: CreateWorkshopPromotionCodeParams): Promise<{
  stripeCouponId: string;
  stripePromotionCodeId: string;
}> {
  const stripe = getStripeClient();

  // Check if promotion code already exists (handles retries after partial failures)
  const existing = await stripe.promotionCodes.list({
    code,
    active: true,
    limit: 1,
  });

  if (existing.data.length > 0 && isPromotionCodeRedeemable(existing.data[0])) {
    const promo = existing.data[0];
    const couponRef = promo.promotion.coupon;
    return {
      stripeCouponId: couponRef ? (typeof couponRef === "string" ? couponRef : couponRef.id) : "",
      stripePromotionCodeId: promo.id,
    };
  }

  const coupon = await stripe.coupons.create({
    percent_off: discountPercent,
    duration: "once",
    name: buildWorkshopPromotionName(workshopTitle, code),
    metadata: {
      workshopCode,
      promotionCode: code,
    },
  });

  const promotionCode = await stripe.promotionCodes.create({
    promotion: {
      type: "coupon",
      coupon: coupon.id,
    },
    code,
    max_redemptions: singleUse ? 1 : undefined,
    metadata: {
      workshopCode,
      promotionCode: code,
      singleUse: String(singleUse),
    },
  });

  return {
    stripeCouponId: coupon.id,
    stripePromotionCodeId: promotionCode.id,
  };
}

export async function retrieveCheckoutSession(
  sessionId: string
): Promise<Stripe.Checkout.Session> {
  const stripe = getStripeClient();
  return stripe.checkout.sessions.retrieve(sessionId);
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
    if (process.env.NODE_ENV === "production") {
      throw new Error("STRIPE_WEBHOOK_SECRET is not configured. Refusing to process webhook in production without signature verification.");
    }
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
