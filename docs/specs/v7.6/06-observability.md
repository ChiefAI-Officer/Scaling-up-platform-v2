# Deploy-Time Observability — Assessment Tool v7.6

**Spec ref**: v7.6, locked May 15-16 2026 (Jeff impromptu meeting + 3 rounds of Codex adversarial review)
**Status**: Locked. Future revisions land here, NOT in PLAN.md or another spec file.
**Cross-references**: [02-service-layer-rules](./02-service-layer-rules.md), [04-deploy-runbook](./04-deploy-runbook.md), [05-wireframes-wave5](./05-wireframes-wave5.md)

---

## Locked decisions implemented in this file

- **Decision 5** — NEW admin aggregate reporting dashboard (the dashboard itself is wireframed in [05-wireframes-wave5](./05-wireframes-wave5.md); this file covers the metric / alert plumbing behind the deploy-time observability dashboard at `/admin/observability`).
- **Decision 8** — Admin aggregate dashboard MVP. The `assessment.aggregate.query.duration_ms` metric below is what the alert gate watches.

## Why this exists (Round 3 M-3)

The v7.6 amendment changes access-control surface enough that a silent regression is plausible (intersection over-restricts; ownership transfer corrupts campaign attribution; seed misses the AccessGroup link). Without metrics + alerts, on-call learns from user reports — too late. v7.6 deploy MUST land with the following observability gates.

## Metrics (7 total)

Surfaced via Vercel Analytics / Inngest events / structured stdout logs scraped by the existing log aggregator:

1. **`assessment.access.evaluate.outcome`** — counter labeled by `outcome ∈ {ALLOW, DENY}` × `reason ∈ {NO_GROUPS, EMPTY_INTERSECTION, GROUP_ARCHIVED, NOT_CERTIFIED, ADMIN_BYPASS}` × `policyVersion`. 5% sample for ALLOW, 100% for DENY.

2. **`assessment.access.change.outcome`** — counter labeled by `op ∈ {ADD_COACH, REMOVE_COACH, ADD_TEMPLATE, REMOVE_TEMPLATE, ARCHIVE_GROUP, UNDELETE_GROUP, HARD_DELETE_GROUP, FORCE_ZERO}` × `outcome ∈ {OK, BLOCKED_ZERO_ACCESS, SERIALIZATION_RETRY, AUDIT_FAIL}`.

3. **`assessment.org.transfer.outcome`** — counter labeled by `outcome ∈ {OK, BLOCKED_TEMPLATE_ACCESS, BLOCKED_LOCK_TIMEOUT, RETAINED_CLOSED_CAMPAIGNS}`.

4. **`assessment.seed.duration_ms`** — histogram per seed run (Rockefeller and any future template seeds). Labels: `state ∈ {A,B,C,D,E,F}`.

5. **`assessment.seed.result`** — counter labeled by state (`A,B,C,D,E,F`).

6. **`assessment.fingerprint.outcome`** — counter labeled by `outcome ∈ {MATCH, MISMATCH, MISSING_EXPECTED_HOST}`.

7. **`assessment.aggregate.query.duration_ms`** — p50/p95/p99 latency on the per-template aggregate dashboard.

Plus a sampled gauge:

- **`assessment.certified_zero_effective_template_count`** — gauge sampled by the post-deploy verification script, ALSO refreshed by an Inngest cron (`every-15-min`) so the value stays current.

(The gauge is counted as one of the seven metrics in the deploy dashboard acceptance criterion below; the cardinality split above lists it separately for engineering clarity.)

## Alert gates (6 total)

Configured via the existing `notifications.ts` SMTP path to `coach@scalingup.com` until a real alerting backend lands; v1.5 may switch to Slack/PagerDuty.

1. **`assessment.access.change.outcome{outcome="AUDIT_FAIL"} > 0` (any)** — page on-call. Audit-write failure is a data-integrity event.

2. **`assessment.fingerprint.outcome{outcome="MISMATCH"} > 0` (any)** — page on-call. Operator attempted a prod command against wrong DB.

3. **`assessment.seed.result{state="C"|"E"|"F"} > 0` (any)** — page on-call. Seed hit an error state.

4. **`assessment.access.evaluate.outcome{outcome="DENY",reason="EMPTY_INTERSECTION"} > 5/min sustained 10 min`** — paged warning. Hot signal that a group change zeroed out a cohort.

5. **`assessment.certified_zero_effective_template_count > N`** where `N = 0 after bootstrap step completes` — paged warning. The bootstrap runbook step is incomplete.

6. **`assessment.aggregate.query.duration_ms p95 > 2000ms`** — paged warning. v1 scale should keep aggregate well below 2s; sustained breach means we need the v1.5 materialized view sooner.

## Deploy dashboard

Simple HTML page at `/admin/observability` (admin-only, behind `canAccessAggregateReport`) shows the above metrics for the last 24h as a single-screen rollup. v1 ships static; v1.5 can wire to a real time-series UI.

## Acceptance criterion (the deploy-completion gate)

The deploy runbook (see [04-deploy-runbook](./04-deploy-runbook.md)) does not consider the deploy COMPLETE until the operator confirms the dashboard renders all 7 metrics AND no alert gate is currently firing. Otherwise rollback per the PITR checkpoint.

---

**Decision provenance**: see `plans/history/v6-v7.5-archive.md` for the full Codex Round changelogs that produced this spec.
