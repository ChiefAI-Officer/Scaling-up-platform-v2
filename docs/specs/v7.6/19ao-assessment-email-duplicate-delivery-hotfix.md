# Spec 19ao — Assessment email duplicate-delivery hotfix

> Status: APPROVED by the user on 2026-07-30 after grill and Claudex review.
> Scope: narrow delivery-safety correction; this is not a rebuild of Referred
> Results or its coach/admin UI.

## Evidence

A public assessment submission produced three messages in one mailbox:

- one legitimate taker-results copy;
- one legitimate Referring coach notification, because the verified coach
  mailbox matched the taker's mailbox;
- a duplicate delivery of that coach-role outbox row when the event and cron
  workers overlapped.

The first two were distinct recipient-role decisions. The third was a worker
race. This hotfix addresses both causes without erasing the audit trail.

## Approved decisions

1. Event and cron use one atomic PostgreSQL lease claim for every assessment
   email role. A claim changes a due row to `SENDING`, increments attempts, and
   installs a unique token in the same `FOR UPDATE SKIP LOCKED` statement.
2. Claim eligibility, expiry, and lease deadlines use the database clock.
3. Completion, requeue, and terminal failure are token-guarded. Terminal
   failure and its dead-letter audit are one transaction.
4. Delivery is at-least-once. If SMTP accepts a message but `SENT` persistence
   fails, the worker does not intentionally requeue it. It emits a structured
   uncertainty log even if the database audit path is unavailable.
5. If the taker and verified Referring coach normalize to the same mailbox,
   send the taker copy only. Retain an empty `CANCELLED` coach-role row with
   reason `SAME_MAILBOX_AS_TAKER`. This exception supersedes Spec 16 §3 only
   for that collision.
6. Old and new workers must be quiesced during cutover. A rolling deployment or
   flag change alone is not a safe handoff.

## Non-goals

- No changes to Referred Results ownership, listing, reporting, or privacy.
- No CSV export or new lead-management UI.
- No claim of exactly-once SMTP delivery.
- No activation of the reserved provenance or generation columns added by the
  already-applied expand migration.

## Acceptance gates

- Two concurrent real PostgreSQL claimers can produce only one lease for one
  due row.
- Event and cron share the same environment-scoped SMTP concurrency budget.
- All recipient roles use the atomic claim.
- Same-mailbox submissions retain one taker row and one cancelled coach row.
- A failed `SENT` write never deliberately requeues or resends the row.
- Terminal failure and dead-letter audit commit or roll back together.
- Targeted tests, focused PostgreSQL integration, migration safety, lint, and
  Turbopack build pass.
- Cutover follows `docs/runbooks/assessment-email-lease-cutover.md`; the code PR
  remains draft until the operational checks are ready.
