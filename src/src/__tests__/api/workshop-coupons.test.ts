jest.mock("next/server", () => ({
  NextResponse: {
    json: (body: unknown, init?: ResponseInit) =>
      new Response(JSON.stringify(body), {
        status: init?.status || 200,
        headers: init?.headers,
      }),
  },
}));

jest.mock("@/lib/auth/authorization", () => ({
  getApiActor: jest.fn(),
  isPrivilegedRole: jest.fn((role: string) => role === "ADMIN" || role === "STAFF"),
  canManageCoachData: jest.fn(() => true),
}));

jest.mock("@/lib/db", () => ({
  db: {
    workshop: {
      findUnique: jest.fn(),
      update: jest.fn(),
    },
    auditLog: {
      create: jest.fn(),
    },
    pricingTier: {
      findUnique: jest.fn(),
    },
    approvalQueue: {
      create: jest.fn(),
    },
    landingPage: {
      findMany: jest.fn().mockResolvedValue([]),
    },
  },
}));

jest.mock("@/lib/templates/template-interpolation", () => ({
  buildWorkshopVariables: jest.fn().mockResolvedValue(null),
  interpolateContent: jest.fn((c: unknown) => c),
  rewriteIdentityFields: jest.fn((c: unknown) => c),
}));

jest.mock("@/services/notifications", () => ({
  sendCustomPriceChangeEmail: jest.fn().mockResolvedValue(undefined),
}));

jest.mock("@/services/stripe", () => ({
  chargeCancellationFee: jest.fn(),
  createWorkshopPromotionCode: jest.fn(),
}));

import { getApiActor } from "@/lib/auth/authorization";
import { db } from "@/lib/db";
import { createWorkshopPromotionCode } from "@/services/stripe";
import { PATCH } from "@/app/api/workshops/[id]/route";

const mockWorkshop = {
  id: "w1",
  coachId: "c1",
  workshopCode: "WS-2026-TEST",
  status: "PRE_EVENT",
  title: "Test Workshop",
  coupons: "[]",
  eventDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
  isFree: false,
  priceCents: 10000,
  pricingTierId: null,
};

function buildRequest(body: unknown): Request {
  return new Request("http://localhost/api/workshops/w1", {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("PATCH /api/workshops/[id] — coupon editing", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (db.workshop.findUnique as jest.Mock).mockResolvedValue(mockWorkshop);
    (db.workshop.update as jest.Mock).mockResolvedValue({ ...mockWorkshop });
    (db.auditLog.create as jest.Mock).mockResolvedValue({});
    (createWorkshopPromotionCode as jest.Mock).mockResolvedValue({
      couponId: "co_default",
      stripeCouponId: null,
      stripePromotionCodeId: null,
    });
  });

  it("admin PATCH with valid coupons array saves as JSON string", async () => {
    (getApiActor as jest.Mock).mockResolvedValue({ role: "ADMIN", coachId: null });
    const coupons = [{ code: "SAVE20", discountPercent: 20, singleUse: false }];

    const req = buildRequest({ coupons });
    const res = await PATCH(req as unknown as import("next/server").NextRequest, {
      params: Promise.resolve({ id: "w1" }),
    });

    expect(res.status).toBe(200);
    const updateCall = (db.workshop.update as jest.Mock).mock.calls[0][0];
    const stored = JSON.parse(updateCall.data.coupons);
    expect(stored).toHaveLength(1);
    // ENH-MAY6-7: schema transform appends discountType=PERCENT to legacy-shape coupons.
    // Stripe sync IDs (null/null in this test — the default mock returns nulls) are
    // merged onto the record before persistence.
    expect(stored[0]).toMatchObject({
      code: "SAVE20",
      discountPercent: 20,
      discountType: "PERCENT",
      singleUse: false,
    });
  });

  it("admin PATCH with invalid coupon (negative discount) returns 400", async () => {
    (getApiActor as jest.Mock).mockResolvedValue({ role: "ADMIN", coachId: null });
    const coupons = [{ code: "BAD", discountPercent: -5, singleUse: false }];

    const req = buildRequest({ coupons });
    const res = await PATCH(req as unknown as import("next/server").NextRequest, {
      params: Promise.resolve({ id: "w1" }),
    });

    expect(res.status).toBe(400);
  });

  it("persists stripePromotionCodeId returned by Stripe into Workshop.coupons", async () => {
    (getApiActor as jest.Mock).mockResolvedValue({ role: "ADMIN", coachId: null });
    (createWorkshopPromotionCode as jest.Mock).mockResolvedValue({
      couponId: "co_TEST",
      stripePromotionCodeId: "promo_FAKE_123",
      stripeCouponId: "co_FAKE_456",
    });

    const coupons = [
      { code: "SAVE20", discountType: "PERCENT", discountPercent: 20, singleUse: false },
    ];

    const req = buildRequest({ coupons });
    const res = await PATCH(req as unknown as import("next/server").NextRequest, {
      params: Promise.resolve({ id: "w1" }),
    });

    expect(res.status).toBe(200);

    // The final stored coupons must include the Stripe IDs so checkout-time
    // validation can match the redeemed promo code against the workshop allowlist.
    const updateCalls = (db.workshop.update as jest.Mock).mock.calls;
    const lastCall = updateCalls[updateCalls.length - 1][0];
    const stored = JSON.parse(lastCall.data.coupons);
    expect(stored).toHaveLength(1);
    expect(stored[0]).toMatchObject({
      code: "SAVE20",
      stripePromotionCodeId: "promo_FAKE_123",
    });
  });

  it("reuses existing stripePromotionCodeId when coupon economic shape is unchanged", async () => {
    (getApiActor as jest.Mock).mockResolvedValue({ role: "ADMIN", coachId: null });
    // Workshop already has a synced coupon with a Stripe ID stored.
    const previouslySyncedCoupon = {
      code: "SAVE20",
      discountType: "PERCENT" as const,
      discountPercent: 20,
      singleUse: false,
      stripePromotionCodeId: "promo_EXISTING",
      stripeCouponId: "co_EXISTING",
    };
    (db.workshop.findUnique as jest.Mock).mockResolvedValue({
      ...mockWorkshop,
      coupons: JSON.stringify([previouslySyncedCoupon]),
    });

    // Re-save the SAME coupon (no economic change). Stripe must NOT be re-called
    // (would orphan a new promo code in Stripe on every re-save).
    const req = buildRequest({
      coupons: [
        { code: "SAVE20", discountType: "PERCENT", discountPercent: 20, singleUse: false },
      ],
    });
    const res = await PATCH(req as unknown as import("next/server").NextRequest, {
      params: Promise.resolve({ id: "w1" }),
    });

    expect(res.status).toBe(200);
    expect(createWorkshopPromotionCode as jest.Mock).not.toHaveBeenCalled();

    // The existing Stripe IDs are carried forward into the new persisted row.
    const updateCall = (db.workshop.update as jest.Mock).mock.calls[0][0];
    const stored = JSON.parse(updateCall.data.coupons);
    expect(stored[0]).toMatchObject({
      code: "SAVE20",
      stripePromotionCodeId: "promo_EXISTING",
      stripeCouponId: "co_EXISTING",
    });
  });

  it("recreates Stripe promotion code when coupon economic shape changes", async () => {
    (getApiActor as jest.Mock).mockResolvedValue({ role: "ADMIN", coachId: null });
    (createWorkshopPromotionCode as jest.Mock).mockResolvedValue({
      couponId: "co_NEW",
      stripeCouponId: "co_NEW",
      stripePromotionCodeId: "promo_NEW_222",
    });

    // Workshop already has SAVE20 at 20% — user edits it to 30%.
    (db.workshop.findUnique as jest.Mock).mockResolvedValue({
      ...mockWorkshop,
      coupons: JSON.stringify([
        {
          code: "SAVE20",
          discountType: "PERCENT",
          discountPercent: 20,
          singleUse: false,
          stripePromotionCodeId: "promo_OLD",
          stripeCouponId: "co_OLD",
        },
      ]),
    });

    const req = buildRequest({
      coupons: [
        { code: "SAVE20", discountType: "PERCENT", discountPercent: 30, singleUse: false },
      ],
    });
    const res = await PATCH(req as unknown as import("next/server").NextRequest, {
      params: Promise.resolve({ id: "w1" }),
    });

    expect(res.status).toBe(200);
    // Stripe must be called to create a fresh promotion code for the new percent.
    expect(createWorkshopPromotionCode as jest.Mock).toHaveBeenCalledTimes(1);
    const updateCall = (db.workshop.update as jest.Mock).mock.calls[0][0];
    const stored = JSON.parse(updateCall.data.coupons);
    expect(stored[0]).toMatchObject({
      code: "SAVE20",
      discountPercent: 30,
      stripePromotionCodeId: "promo_NEW_222",
    });
  });

  it("coach PATCH with coupons is ignored (coupons not saved)", async () => {
    (getApiActor as jest.Mock).mockResolvedValue({ role: "COACH", coachId: "c1" });
    // Set status to REQUESTED so coach is not blocked by the PRE_EVENT lockdown
    (db.workshop.findUnique as jest.Mock).mockResolvedValue({
      ...mockWorkshop,
      status: "REQUESTED",
    });
    const coupons = [{ code: "HACK", discountPercent: 100, singleUse: false }];

    const req = buildRequest({ coupons });
    const res = await PATCH(req as unknown as import("next/server").NextRequest, {
      params: Promise.resolve({ id: "w1" }),
    });

    // Coach sending "coupons" (not in COACH_EDITABLE_FIELDS) → 403
    expect(res.status).toBe(403);
  });
});
