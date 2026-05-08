import { z } from "zod";

// ENH-MAY6-7: discriminated discount type. Legacy rows (no discountType) read
// back as PERCENT for backwards compatibility.
export type WorkshopCouponDiscountType = "PERCENT" | "AMOUNT";

export interface WorkshopCouponRecord {
  code: string;
  discountType: WorkshopCouponDiscountType;
  discountPercent?: number;
  discountAmountCents?: number;
  singleUse: boolean;
  stripeCouponId?: string | null;
  stripePromotionCodeId?: string | null;
}

const workshopCouponSchema = z
  .object({
    code: z
      .string()
      .trim()
      .min(1, "Coupon code is required")
      .max(64, "Coupon code is too long")
      .transform((value) => value.toUpperCase()),
    // discountType is optional in input — defaults to PERCENT for legacy rows.
    discountType: z.enum(["PERCENT", "AMOUNT"]).optional(),
    discountPercent: z.coerce
      .number()
      .int("Discount percent must be a whole number")
      .min(1, "Discount percent must be at least 1")
      .max(100, "Discount percent cannot exceed 100")
      .optional(),
    discountAmountCents: z.coerce
      .number()
      .int("Discount amount must be a whole number of cents")
      .min(1, "Discount amount must be at least 1 cent")
      .optional(),
    singleUse: z.preprocess(
      (value) => value === true || value === "true",
      z.boolean()
    ),
    stripeCouponId: z.string().optional().nullable(),
    stripePromotionCodeId: z.string().optional().nullable(),
  })
  .superRefine((coupon, ctx) => {
    // Resolve effective discountType: explicit, else infer from which field is set.
    const type =
      coupon.discountType ??
      (coupon.discountAmountCents !== undefined ? "AMOUNT" : "PERCENT");

    if (type === "PERCENT") {
      if (coupon.discountPercent === undefined) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["discountPercent"],
          message: "PERCENT coupons must specify discountPercent",
        });
      }
    } else {
      // AMOUNT
      if (coupon.discountAmountCents === undefined) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["discountAmountCents"],
          message: "AMOUNT coupons must specify discountAmountCents",
        });
      }
    }
  })
  .transform((coupon) => {
    const type =
      coupon.discountType ??
      (coupon.discountAmountCents !== undefined ? "AMOUNT" : "PERCENT");
    return {
      ...coupon,
      discountType: type as WorkshopCouponDiscountType,
    };
  });

const workshopCouponsSchema = z
  .array(workshopCouponSchema)
  .max(20, "No more than 20 coupons can be attached to a workshop")
  .superRefine((coupons, ctx) => {
    const seen = new Set<string>();

    coupons.forEach((coupon, index) => {
      if (seen.has(coupon.code)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: [index, "code"],
          message: "Coupon codes must be unique per workshop",
        });
        return;
      }

      seen.add(coupon.code);
    });
  });

function parseJsonArray(raw: string): unknown[] {
  const parsed = JSON.parse(raw);
  if (!Array.isArray(parsed)) {
    throw new SyntaxError("Coupons payload must be a JSON array");
  }
  return parsed;
}

export function parseWorkshopCouponsInput(
  rawCoupons: unknown,
  legacyCoupon?: { code?: string | null; discountPercent?: number | null }
): WorkshopCouponRecord[] {
  const combined: unknown[] = [];

  if (Array.isArray(rawCoupons)) {
    combined.push(...rawCoupons);
  } else if (typeof rawCoupons === "string" && rawCoupons.trim().length > 0) {
    combined.push(...parseJsonArray(rawCoupons));
  }

  if (legacyCoupon?.code && legacyCoupon.discountPercent) {
    combined.push({
      code: legacyCoupon.code,
      discountPercent: legacyCoupon.discountPercent,
      singleUse: false,
    });
  }

  return workshopCouponsSchema.parse(combined);
}

export function parseStoredWorkshopCoupons(
  rawCoupons: string | null | undefined
): WorkshopCouponRecord[] {
  if (!rawCoupons || rawCoupons.trim().length === 0) {
    return [];
  }

  try {
    const parsed = parseJsonArray(rawCoupons);
    const result = workshopCouponsSchema.safeParse(parsed);
    return result.success ? result.data : [];
  } catch {
    return [];
  }
}

export function serializeWorkshopCoupons(
  coupons: WorkshopCouponRecord[]
): string {
  return JSON.stringify(coupons);
}
