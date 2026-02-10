-- Weekly Evaluation Audit Queries (Scaling Up v2)
-- Run these queries once per week against production/staging snapshots.

-- 1) Registration success rate over trailing 7 days
SELECT
  COUNT(*) FILTER (WHERE "createdAt" >= NOW() - INTERVAL '7 days') AS registrations_7d,
  COUNT(*) FILTER (
    WHERE "createdAt" >= NOW() - INTERVAL '7 days'
      AND "status" = 'CONFIRMED'
  ) AS confirmed_7d,
  ROUND(
    (
      COUNT(*) FILTER (
        WHERE "createdAt" >= NOW() - INTERVAL '7 days'
          AND "status" = 'CONFIRMED'
      )::numeric
      /
      NULLIF(
        COUNT(*) FILTER (WHERE "createdAt" >= NOW() - INTERVAL '7 days'),
        0
      )
    ) * 100,
    2
  ) AS registration_success_rate_pct
FROM "registrations";

-- 2) Pending approvals older than 24 hours (SLA breach candidates)
SELECT
  "id",
  "type",
  "coachId",
  "requestedAt",
  NOW() - "requestedAt" AS age
FROM "approval_queue"
WHERE "status" = 'PENDING'
  AND "requestedAt" < NOW() - INTERVAL '24 hours'
ORDER BY "requestedAt" ASC;

-- 3) HubSpot sync freshness drift (>24h since coach sync)
SELECT
  "id",
  "email",
  "syncedAt",
  NOW() - "syncedAt" AS lag
FROM "coaches"
WHERE "syncedAt" IS NULL
   OR "syncedAt" < NOW() - INTERVAL '24 hours'
ORDER BY "syncedAt" NULLS FIRST;

-- 4) Workshop lock-rule adherence (events in next 48h that are not locked)
SELECT
  "id",
  "title",
  "eventDate",
  "isLocked",
  "status"
FROM "workshops"
WHERE "eventDate" BETWEEN NOW() AND NOW() + INTERVAL '48 hours'
  AND "status" NOT IN ('CANCELLED', 'COMPLETED')
  AND "isLocked" = FALSE
ORDER BY "eventDate" ASC;

-- 5) Revenue drift baseline from internal DB (compare externally in Stripe dashboard)
SELECT
  COALESCE(SUM("amountPaidCents"), 0) AS total_paid_cents,
  COUNT(*) AS paid_registration_count
FROM "registrations"
WHERE "paymentStatus" = 'COMPLETED';
