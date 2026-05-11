-- Q-MAY6-1: refund-needed digest. Operator (admin/staff) marks paid registrations
-- as refunded after processing the refund manually in Stripe dashboard.
-- stripeRefundId is the operator-provided evidence ("re_..."), required at
-- mark-refunded time (POST validates format /^re_[A-Za-z0-9]{14,}$/).
-- paymentStatus is flipped to "REFUNDED" in the same atomic update so Financials
-- and any other "active paid registration" surface stops counting the row.

ALTER TABLE "registrations" ADD COLUMN "refundedAt" TIMESTAMP(3);
ALTER TABLE "registrations" ADD COLUMN "refundedBy" TEXT;
ALTER TABLE "registrations" ADD COLUMN "stripeRefundId" TEXT;
