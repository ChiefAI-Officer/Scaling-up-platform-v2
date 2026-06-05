# The branded per-respondent Results report is the canonical view of a completion; the raw answer view is retired (phased), and an individual report is distinct from a cohort report

A coach/admin reviewing a completed assessment sees a **branded, printable per-respondent Results report** instead of the raw answer (`stableKey`) view. The raw inline view and the raw `…/result` JSON API are **retired in a phased rollout**. An individual Results report shows only that respondent's own data; cohort/team comparison is a **separate** Aggregate/group report, out of scope here.

## Context

Coaches/admins reviewed completions via `AssessmentResultView`, which rendered raw `stableKey → value → achieved` rows in the generic blue app theme. Jeff (an admin) objected: *"When I look at the assessments people have completed I see the raw data. I want to see the PDF that gets sent to them"* (Slack 2026-06-05). His reference is Esperto, which ships a polished, branded per-respondent **PDF** per completion. We are building a branded **web** Results report with browser Print-to-PDF (design: `docs/specs/v7.6/13`, plan `13a`). The decision was grilled (`/grill-with-docs`, 8 resolutions) and adversarially reviewed (claudex, 3 rounds → hardening H1–H17).

## Considered options

- **Add the report *alongside* the raw view (two doors)** — rejected: Jeff would still see raw data via the old toggle; it doesn't address the complaint, just adds a second surface.
- **Replace the raw view with the report (chosen)** — the report becomes the canonical results surface; the raw `stableKey` view + its API are retired so a coach never sees raw keys again.
- **One combined individual + cohort report (with team-average columns)** — rejected: it conflates an *individual* report with a *cohort/group* report. Esperto keeps them separate (distinct "personal", "group", and "self-comparison" PDFs); a team-average also adds a new computation and n=1 edge cases. The individual report shows only the respondent's own per-item average; cohort comparison is a separate, later feature.
- **Big-bang retirement of the raw view + API in one deploy** — rejected (claudex round-3 H13): with no feature-flag framework and direct-to-prod deploys, a single bad release would strand *all* result review. Chosen instead: **phased** — Phase 1 ships the report additively (raw view de-emphasized, `/result` deprecated + hit-logged); Phase 2 (a separate release) removes them once the deprecated-`/result` hit counter reads zero.

## Consequences

- The branded Results report is the canonical view; the raw inline view + the raw `/result` API are retired **in Phase 2**, gated on telemetry (H7/H13). Until then both remain for version-skew safety.
- The report is **per individual** and shows only that respondent's data (own per-item average) — **no team/cohort average**. A cohort Aggregate/group report (Esperto's "group"/"self-comparison") is explicitly out of scope; do not add team-comparison columns to the individual report.
- The report is **invited-only** (public/anonymous submissions are `respondentId = null`), **coach/admin-gated** (privileged roles + the owning coach, via `getApiActor()` + `canManageCampaign("read")` — never `requireCoach()`, which would block admins), **authorized + fetched in one transaction**, **audited** (`AuditLog.action` is a free-form String, so a `VIEW_REPORT`/`EXPORT` value needs no migration), **provenance-stamped**, and served **`no-store` + rate-limited** (it is PII).
- The report **adapts to each template's scoring shape** (ratings always; checklist checks only when `passThreshold > 0`; overall headline keyed on `tierMetric`; neutral tiers show "Submitted") and renders an **"Additional responses"** section for TEXT/NUMBER/MULTI_CHOICE answers, so retiring the raw view never hides non-slider answers.
- **Zero schema migrations** — all data closes via wider Prisma `select` clauses and frozen `ScoreResult` reads; nothing is re-scored.
- A future reader should not "restore" the raw `stableKey` view or add a team-average to the individual report assuming they were forgotten — both were deliberate (see this ADR + spec 13). The companion brand-scope decision is ADR-0005; ≥1-tier is ADR-0002; multi-type questions ADR-0003; section intro copy ADR-0004.
