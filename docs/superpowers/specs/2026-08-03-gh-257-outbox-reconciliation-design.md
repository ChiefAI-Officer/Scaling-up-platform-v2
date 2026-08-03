# GH #257 — Invited-results outbox reconciliation design

**Status:** Approved in conversation on 2026-08-03; design only
**Issue:** [GH #257](https://github.com/ChiefAI-Officer/Scaling-up-platform-v2/issues/257)
**Branch:** `codex/257-outbox-reconciliation`
**Fixed point:** `origin/main` at `6983c1f1050be06e95a736be8f228d30ad13f200`
**Related:** PRs
[#263](https://github.com/ChiefAI-Officer/Scaling-up-platform-v2/pull/263),
[#264](https://github.com/ChiefAI-Officer/Scaling-up-platform-v2/pull/264),
[#265](https://github.com/ChiefAI-Officer/Scaling-up-platform-v2/pull/265),
[#286](https://github.com/ChiefAI-Officer/Scaling-up-platform-v2/pull/286),
and [ADR-0030](../../adr/0030-assessment-email-delivery-is-at-least-once-with-an-atomic-lease.md)

## 1. Problem statement

The invited assessment submit route prepares up to two rendered emails:

- `RESPONDENT` / `ASSESSMENT_RESULTS`; and
- `OWNING_COACH` / `COACH_COMPLETION`.

It inserts those rows into `AssessmentEmailOutbox` inside the submission
transaction. PR #263 proved the real PostgreSQL behavior:

- a failure that reaches PostgreSQL aborts the transaction, so the submission
  does not commit; and
- only a positively identified pre-database failure can be swallowed while
  leaving the transaction committable.

PR #264 now rethrows the database case and logs the narrower pre-database case
honestly. That completed the transaction-semantics and diagnosability work.

The residual is that a positively identified pre-database outbox failure can
still leave a committed submission with no row to retry. The existing outbox
worker cannot recover something that was never persisted.

Reconstruction from current records is unsafe. A submission retains frozen
answers and result data, but it does not retain every submission-time email
input: exact recipient identity, template copy and approval, campaign owner,
campaign/template/version identity, rendered bytes, or renderer provenance.
Those values can drift after submission. Rebuilding from current state could
send different content to a different recipient under a different approval.

## 2. Goals

1. Persist a durable, idempotent expectation for each invited-results email
   that was valid and successfully rendered at submission time.
2. Preserve the exact submission-time recipient, subject, rendered HTML, and
   provenance until the existing outbox owns the single retained copy.
3. Reauthorize against current authoritative state before automatic
   materialization.
4. Hold, rather than rerender or silently discard, an intent when relevant
   authorization state has drifted.
5. Make event and scheduled reconciliation converge safely under concurrency.
6. Preserve `(submissionId, recipientRole)` idempotency across both the intent
   ledger and the existing outbox.
7. Give ADMIN and STAFF operators only two audited held-intent actions:
   release the exact frozen payload or cancel it permanently.
8. Bound held-payload retention to 30 days.
9. Keep ADR-0030's lease, SMTP, retry, and terminal-delivery contract
   unchanged.
10. Treat pre-deployment submissions as read-only audit candidates, never as
    automatically recoverable work.

## 3. Non-goals

- Provider delivery or SMTP redesign.
- Changes to ADR-0030 lease claiming, completion, requeue, uncertainty, or
  terminal-failure semantics.
- Invitation, results-email, coach-notification, or branded-report copy.
- Rerendering a frozen recovery intent from current data.
- Broad production replay or backfill.
- Automatic repair of pre-deployment submissions.
- Recovery for public-quiz or unrelated outbox roles.
- Repair of a submission-time render failure. If no valid frozen payload was
  produced, no recovery intent exists.
- Production writes during design, implementation, or verification unless a
  later operating plan receives separate explicit approval.

## 4. Approved product decisions

### 4.1 Freeze, then reauthorize

The system preserves the original payload and provenance. Before automatic
materialization, it compares the submission-time authorization snapshot with
current authoritative records. Drift moves the intent to `HELD`. The system
never silently rerenders from current state.

### 4.2 Event fast path plus bounded scheduled scan

A post-commit event requests immediate reconciliation. A scheduled scan is the
durable backstop for missed events and transient failures. Both invoke the same
service and neither sends SMTP.

### 4.3 Forward-only automation

Only submissions created after this contract is enabled are automatically
reconciled. Historical candidates lack the frozen intent snapshot and require
separate evidence, approval, and an operating plan.

### 4.4 Held-intent controls

ADMIN and STAFF may:

- release the exact frozen payload after reviewing drift; or
- cancel the intent permanently.

They may not edit, rerender, substitute a recipient, or reconstruct current
content.

### 4.5 Single-copy retention

The intent owns the frozen recipient, subject, and body only until:

- an outbox row durably owns them;
- an operator cancels the intent; or
- a held intent expires.

The intent payload is purged in the same transaction as that transition.
Existing outbox behavior then purges `bodyHtml` after `SENT` or terminal
`FAILED`. A held intent expires 30 days after `heldAt`.

## 5. Architecture

### 5.1 Dedicated recovery-intent ledger

Add an `AssessmentEmailRecoveryIntent` model with one row per expected
`(submissionId, recipientRole)`.

The logical fields are:

| Field group | Purpose |
| --- | --- |
| Identity | `id`, `submissionId`, `campaignId`, `invitationId`, `respondentId`, `recipientRole`, `emailType` |
| Frozen payload | nullable `recipientEmail`, `subject`, and `bodyHtml` |
| Integrity | `payloadHash`, `snapshotSchemaVersion`, `rendererContractVersion` |
| Provenance | structured `authorizationSnapshot` and `contentProvenance` |
| State | `status`, integer `version`, `holdReason`, `attempts`, `nextAttemptAt`, `heldAt`, `expiresAt` |
| Resolution | optional `materializedOutboxId`, `resolvedAt`, `resolvedBy`, and `resolutionReasonCode` |
| Timestamps | `createdAt`, `updatedAt` |

Required constraints and indexes:

- unique `(submissionId, recipientRole)`;
- index `(status, nextAttemptAt, createdAt, id)` for bounded pending scans;
- index `(status, heldAt, id)` for held expiry; and
- foreign key from the intent to `AssessmentSubmission` with the same lifecycle
  expectations as the existing outbox relation.

Statuses are application-allowlisted strings:

- `PENDING`
- `HELD`
- `MATERIALIZED`
- `CANCELLED`
- `EXPIRED`

No long-lived `PROCESSING` or lease state is required. Reconciliation performs
no network I/O and holds a PostgreSQL row lock only for the short
reauthorize-and-materialize transaction.

### 5.2 Durability boundary

The intent becomes part of the definition of a successful submission.

After the existing Phase-2 invitation lock:

1. Recompute the existing per-role fingerprint from locked state.
2. Drop any prepared row whose Phase-1 and Phase-2 fingerprints differ, exactly
   as the route does today.
3. Create the submission and its 0–2 remaining intents atomically.

If the submission-plus-intent write fails, including a pre-database validation
failure, the submission does not commit and remains retryable. This is
intentional. Once an email is expected, committing without either a delivery
row or its durable intent would recreate GH #257.

Outbox materialization happens after the submission commits. A failure in that
second stage cannot roll back or erase the submission because the intent
remains.

An intent is not created when:

- the global assessment-send pause prevented preparation;
- the role's Wave-D feature flag or campaign toggle was off;
- the results-email approval gate failed;
- a recipient was unavailable;
- Phase-1 rendering failed; or
- Phase-2 fingerprint revalidation rejected the prepared row.

Those cases were never expected rows under the locked submission-time contract.

### 5.3 Payload integrity and provenance

`payloadHash` is a SHA-256 digest over one canonical tuple:

```text
[
  snapshotSchemaVersion,
  recipientRole,
  emailType,
  recipientEmail,
  subject,
  bodyHtml
]
```

The canonical form is JSON with fixed field order and no implicit
normalization. Writers, validators, operator release, and tests use the same
shared function.

`authorizationSnapshot` is structured, versioned data used for later
reauthorization. `contentProvenance` explains what produced the frozen bytes.
It includes the template and version identity, template alias, report type,
results-email approval hash when applicable, renderer contract version, and
deployment or source commit identifier. The initial
`snapshotSchemaVersion` and `rendererContractVersion` are both `1`.

Snapshot version `1` contains these exact authorization facts:

- common: campaign, invitation, respondent, template, and version IDs;
  campaign access mode, stored status, and soft-delete state; expected
  post-commit invitation status; invitation revocation state; recipient role;
  email type; and the accepted Phase-2 fingerprint;
- respondent results: canonical recipient mailbox derived from the exact
  frozen recipient with the existing `normalizeMailbox` helper,
  `sendResultsToRespondent`, the Wave-D results feature key and enabled state,
  template alias, results-email approval boolean, and approved content hash;
  and
- coach notification: canonical recipient mailbox derived the same way,
  `notifyCoachOnCompletion`, the Wave-D coach-notify feature key and enabled
  state, owning Coach ID, and owning Coach email.

Provenance also retains a canonical `renderInputHash` over the exact
submission-time report-model inputs. The hash function uses stable key
ordering; raw answers, result content, names, and other render inputs are not
copied into provenance.

When an intent materializes, its provenance populates the existing outbox
`authorizationProvenance` and `contentProvenance` fields. The ADR-0030 worker
does not interpret those fields as a send fence; they are evidence only. The
implementation updates ADR-0030's descriptive provenance paragraph to record
that these fields are populated while explicitly leaving its lease and
delivery semantics unchanged.

## 6. Reconciliation flow

### 6.1 Triggers

After a successful invited submission commit, emit an ID-only event containing
`submissionId`. Event submission failure:

- does not change the successful HTTP response;
- logs only IDs and a stable error classification; and
- leaves the scheduled scan responsible for recovery.

The scheduled function runs every three minutes, matching the existing
assessment outbox cadence. It processes a bounded oldest-due page. The event
path may filter by `submissionId`; both paths call the same reconciliation
service.

The fixed invocation budgets are:

- at most 10 intents per event invocation;
- at most 50 intents per scheduled invocation; and
- a 45-second invocation budget.

### 6.2 Pending reconciliation transaction

For each due `PENDING` intent:

1. Select and lock it with `FOR UPDATE SKIP LOCKED`.
2. Check for any existing `AssessmentEmailOutbox` row with the same
   `(submissionId, recipientRole)`.
3. If any row exists, regardless of status, mark the intent `MATERIALIZED`,
   record that outbox ID, and purge the intent payload. Do not alter the
   existing outbox row.
4. If no row exists, evaluate the reauthorization contract.
5. If reauthorization passes, create one `PENDING` outbox row from the exact
   frozen fields, copy provenance, then mark the intent `MATERIALIZED` and
   purge its payload in the same transaction.
6. If reauthorization detects deterministic drift or an integrity problem,
   move the intent to `HELD`, set `heldAt`, set `expiresAt` to 30 days later,
   and persist one stable hold code.

An existing outbox row always wins, including:

- due `PENDING`;
- leased `SENDING`;
- `SENT`;
- terminal `FAILED`; or
- `CANCELLED`.

Reconciliation never reopens, replaces, resets, or duplicates those rows.

### 6.3 Transient errors

An unexpected transient database or infrastructure failure rolls back the
materialization attempt. A separate guarded update:

- increments `attempts`;
- records only a stable, non-PII error class;
- sets exponential-backoff `nextAttemptAt`; and
- moves the intent to `HELD` with `RETRY_EXHAUSTED` after five failed attempts.

If the database is too unavailable to record that update, the intent remains
`PENDING`; the cron will encounter it again. Logs must not persist raw
exception bodies because driver and query errors can contain sensitive values.

### 6.4 Global pause

`ASSESSMENT_SENDS_PAUSED` is an operational defer, not authorization drift.
While it is active:

- automatic reconciliation leaves intents `PENDING`;
- attempts do not increment; and
- operator release is rejected.

Once the pause clears, the next event or cron scan resumes normal work. The
role-specific feature flag becoming disabled is different: that is
authorization drift and produces `FEATURE_DISABLED`.

## 7. Reauthorization contract

Reauthorization compares frozen submission-time facts with current
authoritative records. It never rebuilds the payload.

### 7.1 Common integrity

All roles require:

- the submission still exists;
- its campaign, invitation, and respondent links match the frozen IDs;
- the campaign remains `INVITED`;
- the invitation is `SUBMITTED`;
- the invitation still belongs to the same campaign and respondent;
- the invitation was not revoked after submission;
- campaign soft-delete and stored status match the snapshot;
- template ID, template alias, and pinned version ID match the snapshot;
- recipient role and email type match the intent;
- the intent schema and renderer contract versions are supported;
- the canonical payload hash matches; and
- no existing outbox row owns `(submissionId, recipientRole)`.

Natural time passage is not drift. Reconciliation does not fail merely because
the unchanged campaign `closeAt` or invitation `expiresAt` is now in the past.
It detects mutation of stored lifecycle state, not the movement of the clock
after a valid submission.

### 7.2 Respondent results

`RESPONDENT` / `ASSESSMENT_RESULTS` additionally requires:

- current respondent email normalizes to the frozen canonical mailbox;
- `sendResultsToRespondent` still matches the enabled snapshot;
- `WAVE_D_RESULTS_EMAIL_ENABLED` remains enabled;
- the current template is still approved;
- current subject and body still derive to the approved content hash; and
- that approval hash equals the frozen approval hash.

The exact subject and body sent remain the frozen fields even when all checks
pass.

### 7.3 Coach notification

`OWNING_COACH` / `COACH_COMPLETION` additionally requires:

- `notifyCoachOnCompletion` still matches the enabled snapshot;
- `WAVE_D_COACH_NOTIFY_ENABLED` remains enabled;
- current `createdByCoachId` equals the frozen Coach ID; and
- the current owning Coach email normalizes to the frozen canonical mailbox.

Ownership transfer or Coach-email change therefore requires operator review.

### 7.4 Stable hold codes

The initial allowlist is:

- `CAMPAIGN_DELETED`
- `CAMPAIGN_STATUS_CHANGED`
- `INVITATION_REVOKED`
- `IDENTITY_LINK_CHANGED`
- `RESPONDENT_EMAIL_CHANGED`
- `COACH_OWNER_CHANGED`
- `COACH_EMAIL_CHANGED`
- `TEMPLATE_CHANGED`
- `VERSION_CHANGED`
- `APPROVAL_REVOKED`
- `APPROVAL_HASH_CHANGED`
- `FEATURE_DISABLED`
- `PAYLOAD_INTEGRITY_FAILED`
- `SCHEMA_UNSUPPORTED`
- `RETRY_EXHAUSTED`

When more than one check fails, the service records a deterministic primary
code and may retain an ordered, allowlisted code array in non-PII metadata.
Tests pin the ordering so dashboards and operator decisions remain stable.

## 8. Operator controls

### 8.1 Surface

Add a narrow recovery queue under the existing admin assessment area.

The list is paginated and shows:

- age and held-expiry time;
- role and email type;
- masked recipient;
- stable hold reason;
- campaign, template, and submission identifiers; and
- provenance summary.

The detail view shows:

- the full frozen recipient and subject;
- a safely sandboxed HTML preview;
- payload hash and provenance;
- submission-time authorization facts;
- current authoritative facts; and
- the exact drift comparison.

Responses containing payload or recipient data use private, no-store caching
and no-referrer policy. The preview must not inject the frozen HTML into the
admin document; it uses a sandboxed, scriptless boundary.

There is no Coach-facing recovery UI.

### 8.2 Authorization and mutation contract

Only authenticated `ADMIN` and `STAFF` actors may view details, release, or
cancel. Mutations require:

- standard rate limiting;
- a validated, allowlisted operator reason code;
- an `expectedVersion` concurrency sentinel that must equal the intent's
  integer `version`;
- mandatory audit persistence in the same transaction; and
- private, no-store responses.

Every state transition increments `version`. The allowed release reason is
`DRIFT_REVIEWED_SEND_FROZEN`. Cancellation reasons are
`DELIVERY_NO_LONGER_AUTHORIZED`, `RECIPIENT_SUPERSEDED`,
`CAMPAIGN_RETIRED`, `DUPLICATE_CONFIRMED`, and `POLICY_DECISION`. There is no
free-text reason field that could persist recipient data or email content.

If the audit write fails, the release or cancellation rolls back.

### 8.3 Release

Release is an explicit acceptance of the reviewed drift. It does not rerun the
normal reauthorization comparison, but it must recheck:

- status is still `HELD`;
- the intent has not expired;
- `ASSESSMENT_SENDS_PAUSED` is off;
- schema version and renderer contract remain supported;
- payload hash still validates; and
- no outbox row exists for `(submissionId, recipientRole)`.

If no outbox row exists, release atomically:

1. creates a `PENDING` outbox row from the exact frozen fields;
2. copies provenance;
3. writes the release audit;
4. marks the intent `MATERIALIZED`; and
5. purges the intent recipient, subject, and body.

If a competing outbox row exists, release sends nothing. It records the
existing row as the winner, audits that resolution, marks the intent
`MATERIALIZED`, and purges the duplicate payload.

### 8.4 Cancellation

Cancellation atomically:

1. verifies the held status and concurrency sentinel;
2. writes the cancellation audit with the operator's reason;
3. marks the intent `CANCELLED`; and
4. purges recipient, subject, and body.

Cancellation never creates or changes an outbox row.

### 8.5 Expiry

The scheduled function expires held intents whose `expiresAt` has passed. It
atomically marks them `EXPIRED`, writes an ID-only expiry audit, and purges the
payload. Expiry has no release path.

After any terminal resolution, the intent retains only:

- IDs;
- role and email type;
- payload hash;
- versioned provenance;
- reason codes;
- timestamps; and
- operator identity and non-PII resolution reason.

## 9. Audit and observability

Audit and logs never include recipient addresses, subjects, rendered HTML,
answers, raw exception bodies, or other payload content.

Suggested audit actions:

- `ASSESSMENT_EMAIL_RECOVERY_HELD`
- `ASSESSMENT_EMAIL_RECOVERY_MATERIALIZED`
- `ASSESSMENT_EMAIL_RECOVERY_RELEASED`
- `ASSESSMENT_EMAIL_RECOVERY_CANCELLED`
- `ASSESSMENT_EMAIL_RECOVERY_EXPIRED`

The audit metadata is limited to intent, submission, campaign, invitation, and
outbox IDs; role; email type; stable reason codes; payload hash; attempts;
schema and renderer versions; and operator identity.

Required operational signals:

- `PENDING` count and oldest age;
- `HELD` count and oldest age;
- holds grouped by reason and role;
- retry-exhausted count;
- expiry count;
- post-commit event-dispatch failures;
- reconciliation latency;
- successful materializations; and
- existing-outbox-won resolutions.

The project has no metrics backend for this path. Initial observability
therefore uses structured logs and documented read-only database queries. The
implementation plan and runbook define the exact query thresholds and operator
response for each required signal.

## 10. Rollout and rollback

### 10.1 Route-selection flag

Add a default-off route-selection flag,
`ASSESSMENT_EMAIL_RECOVERY_INTENTS_ENABLED`.

- Off: new submissions retain the current direct-outbox path.
- On: new invited submissions use the intent-first path.

The flag chooses how new expectations are persisted. It is not a delivery
authorization fact and is not part of per-intent reauthorization.

The scheduled reconciler continues processing already-created intents
regardless of the route-selection flag. Only `ASSESSMENT_SENDS_PAUSED` pauses
materialization. This prevents rollback from stranding intents created while
the new path was enabled.

### 10.2 Deployment sequence

1. Apply the additive table and index migration with the new route path off.
2. Verify schema and empty-queue health using read-only checks.
3. Exercise submission, event, scheduled, held, release, cancel, and expiry
   behavior outside production.
4. Enable the intent-first route and redeploy.
5. Monitor pending age, holds, retries, expiries, and the existing outbox
   delivery signals.

Rollback disables the route-selection flag and redeploys. New submissions then
use the legacy direct-outbox path while the deployed reconciler finishes
already-created intents. A source rollback that removes the reconciler requires
operational quiescence and proof that no `PENDING` or `HELD` intents would be
stranded.

## 11. Legacy audit boundary

A separate read-only auditor may identify pre-deployment submissions that
appear, from current records, to lack invited-results outbox roles.

Its contract is deliberately limited:

- label every result an `UNVERIFIABLE_CANDIDATE`;
- emit IDs, current-state reason evidence, and aggregate counts only;
- do not render or reconstruct payloads;
- do not infer an original Coach or respondent recipient from mutable current
  identity;
- do not emit an apply-ready mapping;
- provide no write, replay, or backfill mode; and
- do not run against production as part of the implementation PR.

Any historical repair requires a separately approved evidence artifact that
identifies payload provenance, recipient authority, expected role, and
operator controls. It also requires a separate production operating plan.

## 12. Verification strategy

### 12.1 Pure contract tests

- Canonical payload hash and mutation detection.
- Snapshot schema parsing and unsupported-version handling.
- Every common and role-specific reauthorization outcome.
- Deterministic ordering when multiple drift reasons apply.
- Global-pause defer versus feature-disabled hold.
- State transition and payload-purge invariants.
- Thirty-day held expiry.

### 12.2 Submit-route and service tests

- Zero, one, or two intents follow the existing locked fingerprint decision.
- No intent is created for a gate-off or render-failure case.
- Submission and expected intents commit atomically.
- Intent persistence failure leaves the invitation retryable and creates no
  submission.
- Event dispatch happens only after commit and carries `submissionId` only.
- Event dispatch failure does not change the successful submit response.
- Transient retry and fifth-attempt hold behavior.

### 12.3 Operator route and component tests

- ADMIN and STAFF access; Coach and unauthenticated denial.
- Rate limiting, private no-store responses, and no-referrer policy.
- Masked list data versus authorized detail data.
- Required reason and optimistic-concurrency enforcement.
- No edit, rerender, or recipient-substitution input.
- Payload hash, schema, pause, expiry, and duplicate guards on release.
- Audit failure rolls back release, cancellation, and expiry.
- Sandboxed preview isolation.

### 12.4 Real PostgreSQL integration tests

- Submission-plus-intent atomicity.
- Concurrent event and cron reconciliation yields one outbox row.
- Concurrent operator release and automatic reconciliation yield one outbox
  row.
- `FOR UPDATE SKIP LOCKED` prevents duplicate ownership.
- Every existing outbox status wins without mutation.
- Outbox creation, intent resolution, audit, and payload purge commit or roll
  back together.
- Unique `(submissionId, recipientRole)` constraints hold in both tables.

### 12.5 Regression gates

- PR #263 real-PostgreSQL transaction-semantics proof remains green.
- PR #264 enqueue-failure classification tests remain green.
- ADR-0030 claim, lease, completion, uncertainty, and terminal-failure tests
  remain green without semantic edits.
- Targeted invited-submit, report-email, and results-email suites pass.
- Migration safety, Prisma validation/generation, changed-file ESLint,
  `git diff --check`, and the repository production build pass.

## 13. Acceptance criteria

The design is correctly implemented when:

1. Every successfully committed, expected invited-results email has either an
   outbox row or one durable recovery intent.
2. Automatic reconciliation never rerenders or substitutes current content.
3. Relevant drift always holds with an allowlisted reason.
4. Event loss and cron overlap cannot duplicate an outbox row.
5. Existing outbox rows in every status remain unchanged and authoritative.
6. Materialization, resolution, audit, and intent-payload purge are atomic.
7. Only ADMIN and STAFF can release or cancel held work.
8. Operator release sends the exact frozen bytes and respects pause,
   integrity, expiry, and duplicate guards.
9. Held payload is purged after materialization, cancellation, or 30-day
   expiry.
10. Pre-deployment gaps remain read-only, unverifiable candidates unless a
    separate repair is explicitly approved.
11. ADR-0030 delivery behavior is unchanged.
12. No production replay, backfill, or manual data write occurs as part of this
    work.
