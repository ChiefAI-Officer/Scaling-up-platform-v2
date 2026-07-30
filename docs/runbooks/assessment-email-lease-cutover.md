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

## Cutover receipt

Completed on 2026-07-30:

- PR #250 squash-merged as `d4df6db1`; Vercel production deployment
  `dpl_94JiUEjjpDrwpg4ng6a2oEAxef6R` reached Ready and owned both production
  aliases.
- Both functions were paused and showed no active runs. The final old cron run
  ended at 17:12:02 PST; the five-minute default Vercel execution window elapsed
  before the database gate.
- Before deploy/resume, the outbox had 23 `SENT` rows, zero `PENDING`, zero
  `SENDING`, and no recent delivery-uncertainty audit.
- The Vercel integration did not automatically update the five-day-old Inngest
  app configuration, so the canonical production `/api/inngest` endpoint was
  manually resynced at 17:24:43 PST while both functions remained paused.
- Both functions then showed the shared environment-scoped concurrency key with
  limit four. Cron resumed first and its 17:27:00 run completed in one second;
  the event function resumed afterward.
- Post-cutover health was `200` with healthy database/auth posture. The outbox
  remained 23 `SENT`, zero in-flight, zero recent failures, and zero recent
  delivery-uncertainty audits. Vercel had no error-level production logs after
  the new deployment timestamp.
- Controlled submissions were not run because no test recipients were
  explicitly approved. The different-mailbox and same-mailbox acceptance cases
  remain immediate follow-up checks.

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
