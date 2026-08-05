# Assessment email intent reconciliation

## Safety boundary

This runbook operates the forward-only invited-results delivery-intent contract.
`AssessmentEmailDeliveryIntent` is a durable obligation ledger;
`AssessmentEmailOutbox` remains the only SMTP queue. The exact recipient,
subject, and HTML are frozen when a submission commits. They are never edited,
rerendered, reconstructed, or replaced during reconciliation.

The legacy auditor reports only `UNVERIFIABLE_CANDIDATE` records from a
closed-open time window. It is read-only evidence, not a recovery queue. There
is no production replay, backfill, apply mapping, or manual-write procedure in
this runbook. Any such operation requires a separately approved evidence
artifact and production operating plan.

All SQL below is read-only, parameterized, and projects only counts, times,
roles, statuses, and allowlisted reasons. Do not add mailbox, subject, HTML,
answers, result, or raw-error columns.

## Deployment and activation

1. Provision `ASSESSMENT_EMAIL_INTENT_REVIEW_TOKEN_SECRET` in the normal
   protected secret store for each target environment before exercising or
   enabling the intent path. Generate a cryptographically random value of at
   least 32 characters. Use a separate value for local development,
   non-production, and production; do not copy a lower-environment secret into
   production or reuse the production secret elsewhere. Never place the value
   in source control, deployment output, tickets, chat, shell history, or
   operator logs.
2. In each target deployment context, verify only that the secret is present
   and meets the minimum length. This preflight prints no secret bytes:

   ```text
   node -e 'const value=process.env.ASSESSMENT_EMAIL_INTENT_REVIEW_TOKEN_SECRET;if(!value||value.length<32){console.error("review-token secret missing or shorter than 32 characters");process.exit(1)};console.log("review-token secret configured with minimum length")'
   ```

   A missing or short secret is a stop condition. Run this gate before the
   non-production exercise and again against the protected production
   environment before enabling intent creation.
3. Deploy the additive schema while
   `ASSESSMENT_EMAIL_DELIVERY_INTENTS_ENABLED=false`. Leave
   `ASSESSMENT_SENDS_PAUSED` in its current approved state.
4. Confirm the table exists and the unresolved queue is empty with the
   read-only empty-queue query below. A non-empty result before activation is a
   stop condition: investigate provenance; do not delete rows.
5. Outside production, exercise submission commit, post-commit event dispatch,
   the three-minute scheduled scan, HELD review, exact frozen release,
   cancellation, duplicate-outbox convergence, and 30-day expiry. Confirm that
   payload-bearing columns purge on handoff, cancellation, and expiry.
6. Enable `ASSESSMENT_EMAIL_DELIVERY_INTENTS_ENABLED` through the normal
   protected environment/deployment process and redeploy. Monitor every signal
   and threshold in this runbook.
7. To roll back route selection, set the flag false and redeploy. New
   submissions return to the legacy direct-outbox route.

Rotating `ASSESSMENT_EMAIL_INTENT_REVIEW_TOKEN_SECRET` immediately invalidates
all outstanding review tokens. After rotation, operators must reopen each HELD
intent detail to write a fresh detail-view audit and obtain a token bound to
the newly reviewed version and current facts. Rotation does not alter intent or
outbox state.

Disabling the route-selection flag does **not** strand intents already created.
The event function and scheduled reconciler must remain deployed: the flag
chooses how new submissions persist email obligations; it is not a worker kill
switch. Existing `PENDING` and `HELD` intents remain authoritative until
handoff, authorized cancellation, or absolute expiry.

`ASSESSMENT_SENDS_PAUSED` blocks automatic handoff and operator release. It
does not block intent creation or expiry. Global pause therefore never extends
the immutable `createdAt + 30 days` deadline.

### Read-only empty-queue check

Bind `:as_of` to an operator-recorded UTC timestamp and run in a read-only
transaction:

```sql
BEGIN TRANSACTION READ ONLY;

SELECT "status", COUNT(*)::bigint AS "intentCount"
FROM "assessment_email_delivery_intents"
WHERE "status" IN ('PENDING', 'HELD')
GROUP BY "status"
ORDER BY "status";

COMMIT;
```

Before first activation, this must return no rows. Never “empty” the queue with
a write.

## Monitoring queries

For each observation, bind the UTC `:as_of` parameter once and retain it with
the result. These examples assume the client safely binds named parameters; do
not interpolate user-provided strings.

### PENDING and HELD counts

```sql
SELECT "status", COUNT(*)::bigint AS "intentCount"
FROM "assessment_email_delivery_intents"
WHERE "status" IN ('PENDING', 'HELD')
GROUP BY "status"
ORDER BY "status";
```

### Oldest due PENDING age

```sql
SELECT
  COUNT(*)::bigint AS "duePendingCount",
  FLOOR(EXTRACT(EPOCH FROM (
    :as_of::timestamptz - MIN("nextAttemptAt")
  )))::bigint AS "oldestDueAgeSeconds"
FROM "assessment_email_delivery_intents"
WHERE "status" = 'PENDING'
  AND "nextAttemptAt" <= :as_of::timestamptz;
```

Alert when the oldest due PENDING age exceeds **10 minutes (600 seconds)**.

### Unresolved payloads with less than 24 hours remaining

```sql
SELECT
  "status",
  COUNT(*)::bigint AS "intentCount",
  MIN("expiresAt") AS "nextExpiryAt"
FROM "assessment_email_delivery_intents"
WHERE "status" IN ('PENDING', 'HELD')
  AND "expiresAt" > :as_of::timestamptz
  AND "expiresAt" < :as_of::timestamptz + INTERVAL '24 hours'
GROUP BY "status"
ORDER BY "status";
```

Alert when **any** unresolved payload has less than 24 hours remaining.

### HELD intents by primary reason and recipient role

```sql
SELECT
  "holdReason",
  "recipientRole",
  COUNT(*)::bigint AS "intentCount",
  MIN("heldAt") AS "oldestHeldAt"
FROM "assessment_email_delivery_intents"
WHERE "status" = 'HELD'
GROUP BY "holdReason", "recipientRole"
ORDER BY "holdReason", "recipientRole";
```

For secondary reason distribution, use the allowlisted JSON array only:

```sql
SELECT
  reason."code" AS "holdReason",
  intent."recipientRole",
  COUNT(*)::bigint AS "intentCount"
FROM "assessment_email_delivery_intents" AS intent
CROSS JOIN LATERAL jsonb_array_elements_text(
  COALESCE(intent."holdReasons", '[]'::jsonb)
) AS reason("code")
WHERE intent."status" = 'HELD'
GROUP BY reason."code", intent."recipientRole"
ORDER BY reason."code", intent."recipientRole";
```

### RETRY_EXHAUSTED

```sql
SELECT
  "recipientRole",
  COUNT(*)::bigint AS "intentCount",
  MIN("heldAt") AS "oldestHeldAt"
FROM "assessment_email_delivery_intents"
WHERE "status" = 'HELD'
  AND "holdReason" = 'RETRY_EXHAUSTED'
GROUP BY "recipientRole"
ORDER BY "recipientRole";
```

Alert immediately when any `RETRY_EXHAUSTED` row exists.

### Expiries during the previous 24 hours

```sql
SELECT
  "recipientRole",
  COUNT(*)::bigint AS "expiredCount"
FROM "assessment_email_delivery_intents"
WHERE "status" = 'EXPIRED'
  AND "resolvedAt" >= :as_of::timestamptz - INTERVAL '24 hours'
  AND "resolvedAt" < :as_of::timestamptz
GROUP BY "recipientRole"
ORDER BY "recipientRole";
```

Review an expiry count above zero every day. This is distinct from the
approaching-expiry alert.

### Successful handoffs during the previous 24 hours

```sql
SELECT
  "recipientRole",
  "resolutionReasonCode",
  COUNT(*)::bigint AS "handoffCount"
FROM "assessment_email_delivery_intents"
WHERE "status" = 'HANDED_OFF'
  AND "resolvedAt" >= :as_of::timestamptz - INTERVAL '24 hours'
  AND "resolvedAt" < :as_of::timestamptz
GROUP BY "recipientRole", "resolutionReasonCode"
ORDER BY "recipientRole", "resolutionReasonCode";
```

### Existing-outbox-won outcomes during the previous 24 hours

```sql
SELECT
  "recipientRole",
  COUNT(*)::bigint AS "existingOutboxWonCount"
FROM "assessment_email_delivery_intents"
WHERE "status" = 'HANDED_OFF'
  AND "resolutionReasonCode" = 'EXISTING_OUTBOX_WON'
  AND "resolvedAt" >= :as_of::timestamptz - INTERVAL '24 hours'
  AND "resolvedAt" < :as_of::timestamptz
GROUP BY "recipientRole"
ORDER BY "recipientRole";
```

## Structured-log checks

Search only allowlisted structured fields. Never broaden a query to print raw
exception objects or payload fields.

Event fast-path dispatch failure example:

```text
message:"[assessment-submit] delivery-intent event dispatch failed"
| fields timestamp, submissionId, campaignId, invitationId, errorName
| count by 3m
```

Investigate when event-dispatch failures persist for **two cron intervals
(6 minutes)**. The scheduled scan is the bounded repair path, so first confirm
that `assessment-email-intent-reconciliation-cron` runs every three minutes
and that oldest due PENDING age remains below 10 minutes.

Reconciliation latency example using the Inngest function-run structured
fields:

```text
functionId:("assessment-email-intent-reconciliation" OR
            "assessment-email-intent-reconciliation-cron")
status:"completed"
| fields timestamp, functionId, runId, durationMs
| stats count(), p50(durationMs), p95(durationMs), max(durationMs) by 5m
```

Correlate elevated duration with the sanitized deferred-transaction log:

```text
message:"[assessment-email-intent] reconciliation transaction deferred"
| fields timestamp, intentId, submissionId, errorClass, bookkeeping
| count by errorClass, bookkeeping, 5m
```

The log contract contains IDs and stable error classes only. Do not search for
or export recipient, subject, HTML, answers, results, or raw error messages.

## Operator response

Only ADMIN and STAFF may inspect or resolve HELD intents. Coaches cannot
trigger retroactive delivery.

- **Global pause:** leave `ASSESSMENT_SENDS_PAUSED` enabled while investigating.
  New intents continue to commit; handoff and release remain blocked; expiry
  continues. Track the 24-hour deadline alert closely.
- **HELD review:** inspect the audited detail view and current allowlisted drift
  reasons. Do not edit or rerender. If evidence is incomplete, leave the row
  held and escalate before its deadline.
- **Release:** after authorized review, choose only
  `DRIFT_REVIEWED_SEND_FROZEN`. Release sends the exact stored bytes and
  rechecks global pause, version, review-token facts, expiry, integrity,
  schema, provenance, and duplicate/terminal outbox guards.
- **Cancellation:** choose an allowlisted cancellation reason only when
  delivery is no longer authorized. Cancellation is permanent, audited, and
  purges the stored payload.
- **Expiry:** an unresolved intent expires and purges at its absolute 30-day
  deadline even during global pause. Treat every expiry as an operational
  incident for daily review; do not recreate the payload.
- **RETRY_EXHAUSTED:** keep the row held, inspect stable error classes and
  infrastructure health, and resolve through normal release or cancellation
  only after authority is established.
- **Source rollback:** disabling the route flag is safe while the reconciler
  remains deployed. Removing the event/cron reconciler requires operational
  quiescence and read-only proof that no `PENDING` or `HELD` row can be
  stranded. If unresolved rows exist, keep the reconciler deployed.

## Legacy read-only audit

The auditor requires the explicit intent-first rollout boundary:

```text
npx tsx scripts/audit-legacy-assessment-email-gaps.ts \
  --since=<optional-canonical-ISO> \
  --until=<required-canonical-ISO-rollout-boundary>
```

Do not execute this command against production as part of implementation or
deployment. Its closed-open window is `submittedAt >= since` (when supplied)
and `submittedAt < until`. Every output report and candidate is classified
`UNVERIFIABLE_CANDIDATE`; output contains only record IDs, missing
`RESPONDENT`/`OWNING_COACH` roles, counts, and allowlisted current-evidence
codes. It cannot prove historical payload provenance or recipient authority
and provides no replay, backfill, mapping, or write mode.
