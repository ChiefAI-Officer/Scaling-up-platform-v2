-- MR-21: Add coupons field to Workshop for multi-coupon support
ALTER TABLE "Workshop" ADD COLUMN IF NOT EXISTS "coupons" TEXT NOT NULL DEFAULT '[]';
