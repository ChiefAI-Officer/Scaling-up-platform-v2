import { z } from "zod";

export interface WorkshopCouponRecord {
  code: string;
  discountPercent: number;
  singleUse: boolean;
  stripeCouponId?: string | null;
  stripePromotionCodeId?: string | null;
}

const workshopCouponSchema = z.object({
  code: z
    .string()
    .trim()
    .min(1, "Coupon code is required")
    .max(64, "Coupon code is too long")
    .transform((value) => value.toUpperCase()),
  discountPercent: z.coerce
    .number()
    .int("Discount percent must be a whole number")
    .min(1, "Discount percent must be at least 1")
    .max(100, "Discount percent cannot exceed 100"),
  singleUse: z.preprocess(
    (value) => value === true || value === "true",
    z.boolean()
  ),
  stripeCouponId: z.string().optional().nullable(),
  stripePromotionCodeId: z.string().optional().nullable(),
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
