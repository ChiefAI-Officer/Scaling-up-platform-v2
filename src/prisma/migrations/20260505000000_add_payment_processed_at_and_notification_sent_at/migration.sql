-- Stripe webhook fix (May 2026): function-level idempotency marker for the
-- new processPaymentCompleted Inngest function. NULL = side effects pending.
-- See plan v5 (looks-like-we-have-typed-dawn.md) for context.
ALTER TABLE "registrations" ADD COLUMN "paymentProcessedAt" TIMESTAMP(3);

-- Stripe webhook fix (May 2026): atomic claim for at-most-once paid
-- confirmation email. Pre-empted before SMTP send; rolled back on SMTP error
-- so Inngest can retry the step.
ALTER TABLE "registrations" ADD COLUMN "notificationSentAt" TIMESTAMP(3);

-- Indexes power the recovery script's filter
-- (paymentStatus = 'COMPLETED' AND paymentProcessedAt IS NULL).
CREATE INDEX "registrations_paymentProcessedAt_idx" ON "registrations"("paymentProcessedAt");
CREATE INDEX "registrations_notificationSentAt_idx" ON "registrations"("notificationSentAt");
