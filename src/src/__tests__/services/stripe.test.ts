// Mock Stripe before importing the module under test
const mockSessionsCreate = jest.fn();
const mockPromotionCodesList = jest.fn();

jest.mock("stripe", () => {
  return jest.fn().mockImplementation(() => ({
    checkout: {
      sessions: {
        create: mockSessionsCreate,
      },
    },
    promotionCodes: {
      list: mockPromotionCodesList,
    },
  }));
});

// Set STRIPE_SECRET_KEY so getStripeClient() doesn't throw
process.env.STRIPE_SECRET_KEY = "sk_test_fake";

import {
  buildWorkshopPromotionName,
  createCheckoutSession,
  StripeDiscountCodeError,
} from "@/services/stripe";

const baseCheckoutParams = {
  workshopId: "ws-1",
  workshopTitle: "Test Workshop",
  priceCents: 50000,
  registrationId: "reg-1",
  customerEmail: "test@example.com",
  successUrl: "https://example.com/success",
  cancelUrl: "https://example.com/cancel",
};

describe("createCheckoutSession — allow_promotion_codes vs discounts", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockSessionsCreate.mockResolvedValue({
      id: "cs_test_123",
      url: "https://checkout.stripe.com/test",
    });
  });

  it("does NOT set allow_promotion_codes and omits discounts key when no discount code (BUG-MAY6-4)", async () => {
    await createCheckoutSession(baseCheckoutParams);

    expect(mockSessionsCreate).toHaveBeenCalledTimes(1);
    const params = mockSessionsCreate.mock.calls[0][0];
    // BUG-MAY6-4 Path B: Stripe-hosted promo entry must be disabled to
    // prevent any active code in our Stripe account from being typed at checkout
    expect(params.allow_promotion_codes).toBeFalsy();
    // Key must be ABSENT (not undefined) so Stripe doesn't trip on the shape
    expect("discounts" in params).toBe(false);
  });

  it("rejects code when workshop allowlist is empty (BUG-MAY6-4 cross-workshop leak guard)", async () => {
    // Repro: Workshop A has coupon "HALF". Workshop B has no coupons.
    // Coach-side allowedPromotionCodeIds for Workshop B comes through as []
    // because Workshop.coupons is empty. Without the fix, the membership check
    // is skipped entirely and ANY active code in our Stripe account is accepted.
    mockPromotionCodesList.mockResolvedValue({
      data: [
        {
          id: "promo_workshop_a_half",
          active: true,
          times_redeemed: 0,
          max_redemptions: null,
          expires_at: null,
        },
      ],
    });

    await expect(
      createCheckoutSession({
        ...baseCheckoutParams,
        discountCode: "HALF",
        allowedPromotionCodeIds: [],
      })
    ).rejects.toThrow(StripeDiscountCodeError);

    // Session must not have been created
    expect(mockSessionsCreate).not.toHaveBeenCalled();
  });

  it("rejects code when workshop allowlist excludes the matched promo ID (regression guard)", async () => {
    mockPromotionCodesList.mockResolvedValue({
      data: [
        {
          id: "promo_workshop_a_half",
          active: true,
          times_redeemed: 0,
          max_redemptions: null,
          expires_at: null,
        },
      ],
    });

    await expect(
      createCheckoutSession({
        ...baseCheckoutParams,
        discountCode: "HALF",
        allowedPromotionCodeIds: ["promo_workshop_b_save"],
      })
    ).rejects.toThrow(StripeDiscountCodeError);

    expect(mockSessionsCreate).not.toHaveBeenCalled();
  });

  it("accepts code when workshop allowlist includes the matched promo ID (regression guard for valid path)", async () => {
    mockPromotionCodesList.mockResolvedValue({
      data: [
        {
          id: "promo_workshop_a_half",
          active: true,
          times_redeemed: 0,
          max_redemptions: null,
          expires_at: null,
        },
      ],
    });

    await createCheckoutSession({
      ...baseCheckoutParams,
      discountCode: "HALF",
      allowedPromotionCodeIds: ["promo_workshop_a_half"],
    });

    expect(mockSessionsCreate).toHaveBeenCalledTimes(1);
    const params = mockSessionsCreate.mock.calls[0][0];
    expect(params.discounts).toEqual([{ promotion_code: "promo_workshop_a_half" }]);
    expect(params.allow_promotion_codes).toBeFalsy();
  });

  it("does NOT set allow_promotion_codes when discounts are applied (Stripe rejects both)", async () => {
    // Mock Stripe returning a valid promotion code for "TEST50"
    mockPromotionCodesList.mockResolvedValue({
      data: [
        {
          id: "promo_test50",
          active: true,
          times_redeemed: 0,
          max_redemptions: null,
          expires_at: null,
        },
      ],
    });

    await createCheckoutSession({
      ...baseCheckoutParams,
      discountCode: "TEST50",
      allowedPromotionCodeIds: ["promo_test50"],
    });

    expect(mockSessionsCreate).toHaveBeenCalledTimes(1);
    const params = mockSessionsCreate.mock.calls[0][0];
    // discounts should be set
    expect(params.discounts).toEqual([{ promotion_code: "promo_test50" }]);
    // allow_promotion_codes must NOT be true when discounts is present
    expect(params.allow_promotion_codes).not.toBe(true);
  });
});

describe("buildWorkshopPromotionName", () => {
  it("keeps short workshop names unchanged", () => {
    expect(buildWorkshopPromotionName("Growth Workshop", "SAVE25")).toBe(
      "Growth Workshop (SAVE25)"
    );
  });

  it("truncates long workshop names to Stripe's 40-character limit", () => {
    const result = buildWorkshopPromotionName(
      "Scaling Up to Finish Strong Virtual Workshop",
      "MR217534"
    );

    expect(result.length).toBeLessThanOrEqual(40);
    expect(result.endsWith("(MR217534)")).toBe(true);
  });

  it("falls back to a truncated code when the suffix alone is too long", () => {
    const result = buildWorkshopPromotionName(
      "Workshop",
      "ABCDEFGHIJKLMNOPQRSTUVWXYZ1234567890LONGCODE"
    );

    expect(result.length).toBe(40);
  });
});
