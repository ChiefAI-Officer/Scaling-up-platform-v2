# Assessment email lease worker cutover

This runbook changes the shared assessment-email outbox from an unguarded
`PENDING` scan to atomic `SENDING` leases. It is intentionally a two-release
expand/cutover because old and new workers must not drain the queue together.

## Expand state

Migration `20260730040000_add_assessment_outbox_leases` was applied to
production on 2026-07-30. It is additive and old workers ignore its columns.
The later overlapping migration `20260730050000_add_public_leads_dark_data`
failed before applying a step, was marked rolled back, and `prisma migrate
status` subsequently reported the production ledger healthy.

## Cut over to the lease worker

Before pausing anything:

- confirm the focused PostgreSQL lease-race CI check passed;
- confirm the focused PostgreSQL mixed-row contention exercise passes. It races four
  workers over `QUICK_ASSESSMENT_LEAD`, `ASSESSMENT_RESULTS`, and
  `COACH_COMPLETION` rows and fails on duplicate delivery or an undrained row
  type. Its SMTP sink is intentionally fake and it invokes the worker seam
  directly; it does not prove Inngest scheduling, Azure's account-specific rate
  quota, or the 30-minute pending-age budget;
- confirm the cutover does not add an email category or increase intended
  delivery volume. This release keeps the existing Azure Communication Services
  provider, caps the two workers behind one environment-scoped concurrency
  queue, and suppresses a known duplicate path. The account-specific Azure send
  quota and provider-backed load exercise remain follow-up capacity work, not a
  launch blocker for this traffic-reducing hotfix. Inngest concurrency limits
  active steps, not sends per minute, so do not describe it as provider rate
  limiting.

1. Pause both Inngest functions:
   `quick-assessment-lead-email` and `quick-assessment-lead-email-cron`.
2. Verify both functions have zero active runs. Wait at least the maximum old
   invocation duration after the final run disappears.
3. Verify there are no `SENDING` rows:

   ```sql
   SELECT count(*)
   FROM assessment_email_outbox
   WHERE status = 'SENDING';
   ```

   The old worker never writes `SENDING`, so a non-zero count means a new worker
   has already run or a prior cutover was incomplete. Stop and investigate.
4. Deploy the lease-worker release while both functions remain paused.
5. Resume `quick-assessment-lead-email-cron`, then resume
   `quick-assessment-lead-email`.
6. Run two controlled public-submission checks:
   - a taker whose verified Referring coach is a different mailbox receives the
     taker copy, and the coach receives exactly one notification;
   - a taker whose verified Referring coach normalizes to the same mailbox
     receives one message, while the coach-role outbox row is `CANCELLED` with
     reason `SAME_MAILBOX_AS_TAKER`.
   Use only explicitly approved test mailboxes. If none are available during the
   cutover window, do not invent recipients or submit production forms; instead,
   verify health plus organic outbox/audit transitions and record the controlled
   recipient test as an immediate follow-up.
7. Inspect outbox and audit state for the controlled submissions. Confirm no
   unexpected `SENDING` rows remain and investigate any
   `ASSESSMENT_EMAIL_DELIVERY_UNCERTAIN` audit immediately.

## Roll back the worker

1. Pause both functions and wait for active runs to finish.
2. Do not resume the old worker while any row is `SENDING`. An old worker
   ignores those rows.
3. For every remaining `SENDING` row, determine whether delivery is confirmed.
   Requeue only rows confirmed unsent. A row whose SMTP outcome is unknown
   requires operator review because retrying can duplicate delivery.
4. Redeploy the old worker only after the `SENDING` count is zero, then resume
   cron followed by the event function.

Rolling application instances or feature flags alone do not establish this
quiescence boundary.
