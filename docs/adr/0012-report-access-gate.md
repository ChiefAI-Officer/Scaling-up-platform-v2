# Report viewing goes through a Report access gate

- **Status:** Proposed (2026-06-20). Design accepted via `/improve-codebase-architecture` →
  `/grill-with-docs` (Q1–Q5); **implementation pending user greenlight** (the build is on Hold).
  Full plan: [plans/report-access-gate-plan.md](../../plans/report-access-gate-plan.md). Glossary
  term: **Report access gate** in [CONTEXT.md](../../CONTEXT.md). Relates to
  [ADR-0007](0007-results-report-is-canonical-per-respondent-view.md) (per-respondent report),
  [ADR-0010](0010-assessment-reports-have-two-types-scored-and-qualitative.md) (report-type dispatch),
  and [ADR-0011](0011-group-report-aggregation-cohort-and-access-model.md) (group report access).

## Context

Both assessment report-viewing routes — the per-respondent **Results report**
(`/assessments/[id]/respondents/[respondentId]/report`) and the campaign **Aggregate report**
(`/assessments/[id]/report`) — hand-roll the same cross-cutting request protocol inline in their
`page.tsx`: resolve the actor, (group only) check the feature flag, rate-limit with a fail-closed
`notFound()` on exceed but fail-*open* on a limiter outage, run the authorized loader, turn a
denial into an enumeration-safe 404, write an audit row, and emit view metrics.

This protocol had **no seam** — it was copy-pasted across the two routes. The proof it was the
wrong shape: the *same* bug shipped to production **twice, once per route** — the fail-closed
rate-limit guard tested a stale Next digest (`NEXT_NOT_FOUND`) instead of Next 16's
`NEXT_HTTP_ERROR_FALLBACK;404`, so the `notFound()` was swallowed by the guard's own catch and the
rate-limit silently did nothing (PR #71 fixed the per-respondent copy; the group copy was fixed
separately). The two copies had also **drifted**: group audits fail-closed with IP/UA via a direct
`db.auditLog.create`; per-respondent audited fail-*open* via `logAudit` and captured no IP/UA. Group
emits structured `assessment.group_report.*` metrics; per-respondent emitted ad-hoc `console.info`.
The per-respondent rate-limit key was IP-only (`report:${ip}`), sharing one bucket across every
coach behind a NAT. Adding a third report surface would have copied the protocol — and the next
Next.js upgrade that moves the digest constant would be a multi-site hunt-and-swallow.

## Decision

1. **One Report access gate (`viewReport`) owns the cross-cutting protocol; the loader owns
   authorization; the page owns rendering.** The gate runs the ordered envelope (no-actor policy →
   flag gate → rate-limit → load → audit) and returns the loader's discriminated outcome to the
   page. The two loaders (`getRespondentReport`, `getCampaignGroupReport`) are **not modified** —
   they keep their domain authorization (`canManageCampaign` / `canViewGroupReport`).

2. **The gate is dependency-injected** (`{ rateLimiter, auditSink, emitMetric }`, with
   `defaultReportGateDeps()` for the pages). The injected interface is the test surface, so the
   protocol — the exact rate-limit fail-closed/`unstable_rethrow` dance that broke twice — becomes a
   unit test against fakes, in one place, for every surface.

3. **Outcome interpretation is a single `classify(o) => ReportDisposition`**
   (`"ok" | "forbidden" | "not-found" | "passthrough"`); the gate switches exhaustively. This
   replaced three interdependent boolean callbacks (`isOk`/`isForbidden`/`emitAuthzDeny`) whose
   interaction had *already* produced a false-`authz_deny`-on-a-nonexistent-entity bug in review. The
   disposition enum makes that class structurally impossible. (`ReportDisposition` is implementation
   plumbing — deliberately **not** a CONTEXT.md term.)

4. **Two adapters** (`viewRespondentReport`, `viewGroupReport`) pre-bind per-surface policy
   (key shape, no-actor policy, flag gate, loader, `classify`, `auditOf`). Two adapters make the
   seam real rather than hypothetical.

5. **Fail-closed audit + IP/UA, unified across both surfaces.** The per-respondent report moves from
   fail-open to fail-closed (an audit-write failure re-raises; nothing renders) and now records
   IP/UA — adopting the policy the group report already runs in production. It is still client PII.

6. **Metric seam (truthful by construction).** The **gate** emits only the request-*ending* events
   it decides — `rate_limited`, `authz_deny`, `render_failure`, `audit_failure`. The **page** emits
   the success-*render* events — `view` (rich, surface-specific), `degraded`/`orphan_submission`
   (group), and the `not_applicable`/`empty` panel signals — because only the page knows what it
   rendered, and the gate returns *before* render. Markers stay per-surface namespaced:
   `assessment.group_report.*` is preserved byte-for-byte (consumed by `/admin/observability`);
   per-respondent gets `assessment.respondent_report.*`; a `surface` field is the structured
   discriminator. `forbidden → authz_deny` and `not-found → silent` hold uniformly across surfaces.

7. **The per-respondent rate-limit key is strengthened** from IP-only to
   `report:${actorKey}:${campaignId}:${respondentId}:${ip}` (matching the group key shape), so one
   busy egress IP can no longer rate-limit-starve unrelated coaches. The group key is unchanged.

8. **Ships dark — no feature flag, no posture knob.** Rollback is `git revert` + Vercel
   promote-previous. A flag would add a permanent branch to the very module built to *remove*
   branching, and the one new failure mode (fail-closed audit on respondent) already runs in prod on
   the group report.

9. **Scope is the two canonical `(report)` pages only.** The deprecated raw `/result` API
   (`assessment.report.old_result_api.hit`) is out of scope — it is Phase-1-deprecated and slated for
   Phase-2 deletion, not migration onto the gate.

## Consequences

- **Positive:** the rate-limit / fail-closed-audit / `unstable_rethrow` protocol lives in one place
  — the next Next.js digest change is a one-line fix, not a multi-site swallow; the twice-shipped bug
  class is killed and pinned by a unit test. The per-respondent surface gains fail-closed audit,
  IP/UA, structured metrics, and a correct rate-limit key by *construction*, not by remembering to
  copy. A future report surface (cohort export, coach share-link) inherits the whole protocol as a
  third adapter. No schema change; no feature flag; clean revert.
- **Negative / accepted trade-offs:**
  - A generic higher-order gate adds one layer of indirection vs two inlined routes — accepted,
    because the deletion test favors it: inlining would re-duplicate the exact protocol that broke
    twice.
  - The fail-closed audit flip is a *new* failure mode on the per-respondent surface (an audit-write
    outage now blocks a coach's view of their own client's report). Mitigated by the proven group
    precedent, the immediately-visible `audit_failure`/`render_failure` metrics, and revert-based
    rollback.
  - The stronger rate-limit key resets every in-flight per-IP throttle once on deploy (no Redis
    migration). Self-heals on the next window; disclosed in the PR.

## Alternatives considered

- **A narrow rate-limit-only helper** (extract just the `unstable_rethrow` dance) — rejected: kills
  the exact recurring bug but leaves the audit-posture and metric drift duplicated across the two
  routes.
- **A full gate that also renders the non-OK panels** — rejected: the `empty`/`notApplicable`
  outcomes render bespoke, surface-specific panels; folding them behind one interface would make the
  gate shallow and leaky. The gate hands those outcomes back as `passthrough` for the page to render.
- **Normalizing both loaders to a common outcome type** — rejected: it would require modifying the
  loaders (a settled "do not touch" constraint) or a normalization layer; a per-adapter `classify`
  callback is cheaper and keeps the loaders untouched.
- **Three boolean discriminators** (`isOk`/`isForbidden`/`emitAuthzDeny`) — rejected: their
  interaction already produced a false-positive security signal in review; a single exhaustive
  `classify` removes the interdependency.
- **A feature-flag (or narrow `REPORT_AUDIT_FAIL_OPEN` kill-switch) rollout** — rejected: this is a
  refactor, not a feature; a flag adds a permanent two-path branch to a module whose purpose is to
  collapse branches, and the group report has no such knob (asymmetry). Revert is the rollback.
- **Gate-emitted `view` metric** — rejected: the gate returns before render, so a gate `view` would
  be semantically false and would either lose group's rich `view` fields or double-count. `view` is
  page-owned.
