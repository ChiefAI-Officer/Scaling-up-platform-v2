# Spec 17 Wave F #22 — CEO / Group Report — Ops Runbook

> Launch / canary / kill-switch / rollback / observability for the campaign group
> report. Companion to [17f design](17f-wave-f-group-report-design.md) +
> [ADR-0011](../../adr/0011-group-report-aggregation-cohort-and-access-model.md).

## Scope (READ FIRST)

The group report is surfaced for the **Leadership Vision Alignment (LVA)** assessment
**only** (Jeff, 2026-06-18: *"we don't need aggregate on all reports… just the one"* →
*"Just LVA"*). The generic **scored** group engine (Rockefeller / Five-Dysfunctions) is
**built but intentionally NOT surfaced** — a non-LVA campaign shows no entry link and the
route returns `notApplicable`/404 (no model build, no audit). To surface another template
later, add its alias to `GROUP_REPORT_ALIASES` in
`src/src/lib/assessments/wave-f-flags.ts` (single source of truth — gates both the loader
and the entry point) and re-test.

## What ships

- New read-only route `/(report)/assessments/[id]/report` (campaign-level group report).
- A "View group report" link on `CampaignDetail` (LVA, INVITED, authorized only).
- Additive: **no migration** (`isCEO` already exists; `AuditLog.action` is a free-form
  String — `GROUP_REPORT_VIEW` added to the typed union only).

## Launch order (flag-flip — the surface is default-OFF)

The route + entry point are gated by `isGroupReportEnabled` (default-OFF) + the LVA alias
gate + `canViewGroupReport` (current active coach + org owner + template access; admin/staff
bypass). Merging changes nothing live.

1. **Canary** — set `WAVE_F_GROUP_REPORT_CANARY` on Vercel **Production** to a comma list of
   coach IDs / org IDs / campaign IDs (e.g. the SU team's own coach id), redeploy. Only those
   see the link / can open the route; everyone else still gets 404.
2. **Verify on canary** (see Smoke below).
3. **Global launch** — set `WAVE_F_GROUP_REPORT_ENABLED=1` on Production, redeploy. All
   authorized coaches on LVA INVITED campaigns now see it.

## Kill-switch (instant disable, no code change)

Remove/zero `WAVE_F_GROUP_REPORT_ENABLED` **and** clear `WAVE_F_GROUP_REPORT_CANARY` on
Production, redeploy. Both surfaces vanish: the entry link disappears and the route returns
404 (`isGroupReportEnabled` → false → `notFound()` before any load/audit). Nothing else is
affected (read-only; no data mutated, no email sent).

## Rollback

- **Instant disable:** the kill-switch above (preferred for an operational issue).
- **Code rollback:** revert the PR + Vercel **promote-previous** (Wave C/E style). Because the
  feature is additive + read-only, promote-previous is clean — no data to reconcile, no
  migration to undo.

## Observability

Structured markers `assessment.group_report.*` are emitted (see
`src/src/lib/assessments/group-report-metrics.ts`), surfaced on **`/admin/observability`**:

| Event | Meaning | Watch for |
|---|---|---|
| `view` (+ `latencyMs`) | a report rendered (ok) | p95 latency creep on large cohorts |
| `rate_limited` | per-actor+campaign+IP limit hit before load | a spike = scraping/enumeration attempt |
| `authz_deny` | loader returned `forbidden` | a spike = probing by unauthorized coaches |
| `not_applicable` | PUBLIC or non-LVA campaign | informational |
| `empty` | INVITED LVA, 0 completions | informational |
| `audit_failure` | `GROUP_REPORT_VIEW` write threw (fail-closed → request 500s) | **ALERT** — DB/audit outage; views are being blocked |
| `render_failure` | load/render threw | **ALERT** — 5xx on the report |
| `degraded` / `orphan_submission` | malformed answers skipped / orphaned submitters included | a spike = data-quality issue (imports / manual edits) |

Markers are PII-free + low-cardinality (role / counts / latency only — never names/answers).
**Alert gates:** page on sustained `audit_failure` or `render_failure`; warn on a
`rate_limited` or `authz_deny` spike.

### Audit-failure response

`GROUP_REPORT_VIEW` is written **fail-closed** (a write failure throws → the report does NOT
render). An `audit_failure` spike therefore means audit writes are failing (DB issue) AND
coaches can't view reports. Triage the DB/audit-log write path; the kill-switch will stop the
500s while you investigate.

## Post-rollback / post-launch smoke

1. As a canary/authorized coach, open an **LVA INVITED** campaign with ≥1 completed
   submission → the group report renders (cover, "as of" line, matrix/rating/obstacles/free-
   text), and exactly one `GROUP_REPORT_VIEW` audit row is written (check `/admin/observability`
   or AuditLog).
2. Open a **Rockefeller / scored** INVITED campaign → **no** "View group report" link, and a
   direct hit on its `/assessments/<id>/report` returns the "invited campaigns only / not
   available" state (no audit). (Confirms the LVA-only gate + the dormant scored engine.)
3. A **PUBLIC** campaign → no link, route `notApplicable`.
4. After kill-switch → the LVA link disappears + the route 404s.

## Load / capacity

The aggregation is in-memory over a campaign's completed submissions (leadership teams ~3–15;
the rate-limit + the LVA-only gate bound exposure). For a large imported LVA campaign, verify
p95 render latency on `/admin/observability` and that the column/free-text/PDF presentation
stays readable (the financial-matrix column cap + verbatim truncation are a renderer/mockup-
time concern — currently the renderer shows all; revisit if a real campaign exceeds ~8
respondents).

## Deferred / recommended adjacent hardening (NOT blockers for this wave)

1. **Participant-delete TOCTOU + `ON DELETE SET NULL` orphan risk** (claudex R2-HIGH-2): the
   participant-delete route's submission-check is a non-transactional pre-check and the
   invitation FK is `ON DELETE SET NULL`, so a concurrent submit can orphan a completed
   response. The group loader is already orphan-robust (includes + flags such submissions), so
   no report-side data is lost — but the underlying race is worth fixing (lock the re-check in
   a tx, or switch hard-delete → revoke/soft-delete).
2. **Per-respondent report route shares the stale-notFound-digest rate-limit bug** found in the
   T8 review: `…/respondents/[respondentId]/report/page.tsx` guards its rate-limit catch on
   `err.message === "NEXT_NOT_FOUND"`, which never matches Next 16's real digest
   (`NEXT_HTTP_ERROR_FALLBACK;404`) — so that route's rate-limit is currently ineffective
   (authz still holds; it's an ineffective control, not a hole). Fix with `unstable_rethrow`
   there too (the group route was fixed this wave).
3. Persisted/freeze-on-close group report snapshot (the report is on-demand; provenance "as of"
   sets the expectation — a saved snapshot is a future ask, not v1).
