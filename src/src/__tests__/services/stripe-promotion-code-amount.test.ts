/**
 * ENH-MAY6-7: createWorkshopPromotionCode supports dollar-amount coupons
 * (amount_off + currency) in addition to percent_off.
 */

const mockCouponsCreate = jest.fn();
const mockPromotionCodesCreate = jest.fn();
const mockPromotionCodesList = jest.fn();

jest.mock("stripe", () => {
    return jest.fn().mockImplementation(() => ({
        coupons: { create: mockCouponsCreate },
        promotionCodes: {
            create: mockPromotionCodesCreate,
            list: mockPromotionCodesList,
        },
    }));
});

process.env.STRIPE_SECRET_KEY = "sk_test_fake";

import { createWorkshopPromotionCode } from "@/services/stripe";

describe("createWorkshopPromotionCode — dollar amount coupons (ENH-MAY6-7)", () => {
    beforeEach(() => {
        jest.clearAllMocks();
        mockPromotionCodesList.mockResolvedValue({ data: [] });
        mockCouponsCreate.mockResolvedValue({ id: "coupon_123" });
        mockPromotionCodesCreate.mockResolvedValue({ id: "promo_456" });
    });

    it("PERCENT mode: passes percent_off to Stripe, not amount_off", async () => {
        await createWorkshopPromotionCode({
            workshopCode: "WS-2026-A1B2",
            workshopTitle: "Test Workshop",
            code: "HALF",
            discountType: "PERCENT",
            discountPercent: 50,
            singleUse: false,
        });

        expect(mockCouponsCreate).toHaveBeenCalledTimes(1);
        const call = mockCouponsCreate.mock.calls[0][0];
        expect(call.percent_off).toBe(50);
        expect(call.amount_off).toBeUndefined();
        expect(call.currency).toBeUndefined();
    });

    it("AMOUNT mode: passes amount_off + currency to Stripe", async () => {
        await createWorkshopPromotionCode({
            workshopCode: "WS-2026-A1B2",
            workshopTitle: "Test Workshop",
            code: "TWENTY",
            discountType: "AMOUNT",
            discountAmountCents: 2000,
            singleUse: false,
        });

        expect(mockCouponsCreate).toHaveBeenCalledTimes(1);
        const call = mockCouponsCreate.mock.calls[0][0];
        expect(call.amount_off).toBe(2000);
        expect(call.currency).toBe("usd");
        expect(call.percent_off).toBeUndefined();
    });

    it("PERCENT without discountPercent throws", async () => {
        await expect(
            createWorkshopPromotionCode({
                workshopCode: "WS-2026-A1B2",
                workshopTitle: "Test",
                code: "BAD",
                discountType: "PERCENT",
                singleUse: false,
            })
        ).rejects.toThrow();
    });

    it("AMOUNT without discountAmountCents throws", async () => {
        await expect(
            createWorkshopPromotionCode({
                workshopCode: "WS-2026-A1B2",
                workshopTitle: "Test",
                code: "BAD",
                discountType: "AMOUNT",
                singleUse: false,
            })
        ).rejects.toThrow();
    });
});
