/* eslint-disable @typescript-eslint/no-explicit-any */

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

import { buildWorkshopPromotionName, createCheckoutSession } from "@/services/stripe";

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

  it("sets allow_promotion_codes=true when NO discount code is provided", async () => {
    await createCheckoutSession(baseCheckoutParams);

    expect(mockSessionsCreate).toHaveBeenCalledTimes(1);
    const params = mockSessionsCreate.mock.calls[0][0];
    expect(params.allow_promotion_codes).toBe(true);
    expect(params.discounts).toBeUndefined();
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
