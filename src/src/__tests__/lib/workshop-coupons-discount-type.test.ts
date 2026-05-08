/**
 * ENH-MAY6-7: coupon dollar amounts. Schema accepts either percent OR amount,
 * with backwards compat for the legacy { code, discountPercent } shape.
 */

import {
    parseWorkshopCouponsInput,
    parseStoredWorkshopCoupons,
} from "@/lib/workshops/workshop-coupons";

describe("ENH-MAY6-7: workshop coupon discountType (PERCENT vs AMOUNT)", () => {
    it("legacy shape (no discountType) parses as PERCENT", () => {
        const parsed = parseWorkshopCouponsInput([
            { code: "HALF", discountPercent: 50, singleUse: false },
        ]);
        expect(parsed).toHaveLength(1);
        expect(parsed[0].code).toBe("HALF");
        expect(parsed[0].discountType).toBe("PERCENT");
        expect(parsed[0].discountPercent).toBe(50);
    });

    it("explicit PERCENT shape parses with discountPercent", () => {
        const parsed = parseWorkshopCouponsInput([
            {
                code: "HALF",
                discountType: "PERCENT",
                discountPercent: 50,
                singleUse: false,
            },
        ]);
        expect(parsed[0].discountType).toBe("PERCENT");
        expect(parsed[0].discountPercent).toBe(50);
        expect(parsed[0].discountAmountCents).toBeUndefined();
    });

    it("AMOUNT shape parses with discountAmountCents", () => {
        const parsed = parseWorkshopCouponsInput([
            {
                code: "TWENTY",
                discountType: "AMOUNT",
                discountAmountCents: 2000,
                singleUse: false,
            },
        ]);
        expect(parsed[0].discountType).toBe("AMOUNT");
        expect(parsed[0].discountAmountCents).toBe(2000);
        expect(parsed[0].discountPercent).toBeUndefined();
    });

    it("AMOUNT without discountAmountCents is rejected", () => {
        expect(() =>
            parseWorkshopCouponsInput([
                { code: "BAD", discountType: "AMOUNT", singleUse: false },
            ])
        ).toThrow();
    });

    it("PERCENT without discountPercent is rejected", () => {
        expect(() =>
            parseWorkshopCouponsInput([
                { code: "BAD", discountType: "PERCENT", singleUse: false },
            ])
        ).toThrow();
    });

    it("AMOUNT with non-positive cents is rejected", () => {
        expect(() =>
            parseWorkshopCouponsInput([
                {
                    code: "BAD",
                    discountType: "AMOUNT",
                    discountAmountCents: 0,
                    singleUse: false,
                },
            ])
        ).toThrow();
    });

    it("parseStoredWorkshopCoupons: legacy stored row reads back as PERCENT", () => {
        const stored = JSON.stringify([
            { code: "HALF", discountPercent: 50, singleUse: false },
        ]);
        const parsed = parseStoredWorkshopCoupons(stored);
        expect(parsed[0].discountType).toBe("PERCENT");
        expect(parsed[0].discountPercent).toBe(50);
    });

    it("parseStoredWorkshopCoupons: AMOUNT row reads back correctly", () => {
        const stored = JSON.stringify([
            {
                code: "TWENTY",
                discountType: "AMOUNT",
                discountAmountCents: 2000,
                singleUse: false,
            },
        ]);
        const parsed = parseStoredWorkshopCoupons(stored);
        expect(parsed[0].discountType).toBe("AMOUNT");
        expect(parsed[0].discountAmountCents).toBe(2000);
    });
});
