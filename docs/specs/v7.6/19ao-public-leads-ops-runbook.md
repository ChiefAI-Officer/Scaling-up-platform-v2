# Spec 19ao — Public leads operations runbook

## Default state

Public leads ships dark. Keep `WAVE_PUBLIC_LEADS_ENABLED=0`,
`PUBLIC_LEADS_REFERRAL_KEYS_ISSUED=0`, and
`PUBLIC_LEADS_POLICY_APPROVED=0` until the retention owner approves the policy,
the distributed limiter is load-tested, and the migration/backfill receipts are
reviewed. The atomic outbox lease hotfix is independent and always on.

## Expand and cut over the outbox

1. Apply the additive migrations.
2. Pause both the event and cron assessment-email drainers.
3. Wait at least the configured SMTP hard timeout plus lease margin and confirm
   there are no active `SENDING` rows with an unexpired lease.
4. Deploy one release SHA containing every lease-aware producer and consumer.
5. Confirm the production SMTP host, credentials, from-address, Scaling Up
   recipient, and Inngest signing/event keys.
6. Resume the drainers and verify claim, send, retry, reclaim, dead-letter, and
   oldest-queue-age signals.

This worker is roll-forward only. Rollback means pause, quarantine, fix, deploy
forward, and resume. Never deploy a consumer below the lease compatibility
floor.

## Canary

1. Record the approved policy version, retention days, and deletion mode.
2. Configure the Redis limiter and load-test the campaign/IP and
   campaign/email budgets. Set the HMAC secrets and encrypted-export key.
3. Set conservative global/per-campaign HELD caps and exercise a Redis outage.
   HELD release requires a live Redis `PING`; the readiness flag alone never
   releases mail, and a failed release attempt returns the row to `HELD`.
4. Issue opaque keys only for the approved Coach-ID cohort, record the issuance
   audit, then set `PUBLIC_LEADS_REFERRAL_KEYS_ISSUED=1`.
5. Set `WAVE_PUBLIC_LEADS_CANARY_COACH_IDS` without enabling the global flag.
6. Smoke: valid/invalid link, same-mailbox suppression, taker/team singular
   delivery, list/search/date filter, exact-owner report denial, export
   generation/download, admin ownership, deactivation, and kill.

The daily retention worker applies the approved cutoff in bounded batches,
first overlays any immutable export-manifest rows, cancels and fences pending
mail, then removes the retained contact/answer/result payload while preserving
the non-PII submission tombstone and audit receipt. List, report, and export
queries independently enforce the same cutoff so an overdue row is not exposed
while waiting for the worker.

## Abort and kill

Set `WAVE_PUBLIC_LEADS_KILL=1` and redeploy. Post-issuance parsing remains on,
but coach presentation and notification stop. Cancel feature-provenance Coach
rows, invalidate their lease tokens, purge their rendered bodies, and record
the database-backed global send-fence generation. The worker synchronizes that
fence before claiming and refuses new Coach claims while blocked. Do not report mail quiesced until every active lease
has terminated or the transport-bound timeout has elapsed; record any SMTP call
already in flight as a possible exposure.

Re-enabling never revives cancelled Coach rows. Replay is an audited operation
that re-renders from the frozen submission and reauthorizes the current owner.

## Export incidents

Exports are immutable manifests with revocation overlays. Rotate the AES key by
incrementing `PUBLIC_LEADS_EXPORT_KEY_VERSION` while retaining the preceding key
outside the app until every artifact using it has expired. On actor, Coach,
policy, or retention revocation, abort active jobs and deny downloads. Never
serve an artifact when its key version, expiry, owner, or policy check fails.
Generation checkpoints each encrypted batch and rechecks actor, Coach, policy,
and retention before continuing; a transient retry resumes at the durable
`nextSortOrder` rather than rebuilding from row zero.

## Historical backfill

Create the frozen evidence artifact, have its digest approved out of band, then
apply that exact artifact:

```bash
node scripts/public-leads-backfill.mjs mappings.json --manifest-out=approved.json
node scripts/public-leads-backfill.mjs approved.json --apply --approved-digest=<digest>
```

The digest includes the observed Coach email/status/expiry and submission
eligibility, not just operator-supplied IDs. Apply revalidates that evidence
and writes one idempotent audit checkpoint per 100-row batch.

## Required launch evidence

- Owner-approved retention/deletion/copy record
- Migration safety output and database backup receipt
- Redis atomic-quota load test and outage/HELD-cap test
- Simultaneous event/cron lease test, stale reclaim, and dead-letter replay
- Backfill dry-run manifest and separately approved apply receipt (or approved
  no-backfill decision)
- Desktop/mobile/report/email visual receipts
- Targeted Jest, ESLint, full Jest, and Turbopack build receipts
- Alert-delivery and dashboard/query smoke
- Measured kill/quiescence time and production release/flag verification
