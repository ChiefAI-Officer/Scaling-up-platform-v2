---
status: accepted
---

# Assessment email delivery is at-least-once with an atomic sending lease

Assessment outbox delivery uses an atomic database lease so only one worker may
actively send a row at a time. The event and cron paths share the same claim:
`FOR UPDATE SKIP LOCKED` selects a due row, the same statement moves it to
`SENDING`, increments its attempt count, and installs a unique lease token.
Completion and failure transitions require that token. This removes the
ordinary event-versus-cron race that caused duplicate coach notifications.

Delivery remains **at-least-once**. SMTP cannot atomically commit with the
database, so a process may still stop after SMTP accepts a message but before
the row is recorded as `SENT`. The worker retries the `SENT` write without
resending; if persistence still fails, or an expired lease is recovered, it
writes an explicit delivery-uncertainty audit signal. It does not claim to
prevent every duplicate after a crash.

Terminal failure and its dead-letter audit are one database transaction.
Same-mailbox taker/coach suppression retains a `CANCELLED` Referring coach row
with empty content, so the recipient-role decision is visible without sending
a second copy.

The additive schema also contains feature, provenance, and generation columns.
[ADR-0031](./0031-assessment-email-obligations-use-a-dedicated-intent-ledger.md)
now populates those fields when an Email Delivery Intent hands off to the
outbox. They remain evidence only: neither ADR makes them an active worker
send-fence contract. Safe worker cutover and rollback therefore require
operational quiescence as documented in the assessment email lease cutover
runbook.

The approved behavior and cutover gates are recorded in Spec 19ao,
`docs/specs/v7.6/19ao-assessment-email-duplicate-delivery-hotfix.md`.
