# Wireframe 23 — Admin Aggregate Report (per-template dashboard, v1 MVP)

**Spec ref**: v7.6 Wave 5, locked May 15-17 2026 (Jeff impromptu meeting + 3 rounds of Codex adversarial review). Implements **Decision 5** (NEW admin aggregate reporting dashboard) and **Decision 8** (MVP shape: template + version selector only, NO filters / NO placeholders on day 1).
**Status**: Locked for Jeff review. Implementation contract for future subagent dispatches.
**Paired HTML**: [`src/public/wireframes-phase2/admin/23-admin-aggregate-report.html`](../../../src/public/wireframes-phase2/admin/23-admin-aggregate-report.html)
**Service-layer dependencies**: `canAccessAggregateReport` (admin/staff only), `getAggregateReport(templateId, versionId)`, `compareVersions(versionA, versionB)` (v1.5 deferred). See `docs/specs/v7.6/02-service-layer-rules.md` and `docs/specs/v7.6/06-observability.md`.

---

## Layout

Wave 2 admin chrome with the sidebar's "Aggregate Report" entry highlighted as active. Breadcrumb: `Admin / Aggregate Reporting`.

Page body, top to bottom:

1. **Page header.** Title `Aggregate Report` + subtitle "Per-template, per-version aggregate statistics across all submissions in the platform. Admin-only — coaches and respondents never see this view."
2. **Yellow anonymity banner.** Verbatim copy: "Admin bypasses CEO_ONLY anonymity in aggregate. Coaches and respondents still respect `aggregationMode` (see `docs/specs/v7.6/02-service-layer-rules.md` · `canAccessAggregateReport`). This dashboard is gated to `ADMIN` / `STAFF` roles only."
3. **Selectors row — TWO selectors only.** Single card containing two side-by-side dropdowns:
   - **Template** (dropdown): Rockefeller Habits Checklist (selected) / Vision Alignment / Quarterly Strategic Priorities v2 / Scaling Up Assessment.
   - **Version** (dropdown): default is the latest published version, labeled `v1 (enUS) — published Apr 12, 2026 — current` plus a green `CURRENT` pill below the dropdown. Hint text below explains the default behavior. Second option in the mock is `v0 (enUS) — draft (no published submissions)` to illustrate that drafts appear but draw no data.
   - **No time-range chip. No group filter. No org filter. No date pickers.** Per locked decision 8.
4. **Top stat cards** — 5-up grid: Total submissions / Organizations / Avg countAchieved / Avg overallTotal / Avg overallAverage. Each card is a label-on-top + large numeric value + small subtitle.
5. **Two-column card grid** — Tier histogram (left) + Per-section means table (right).
   - **Tier histogram.** Three rows: Low (red), OK (amber), Great (green). Each row has a tier-label / horizontal bar / count + percentage. Bars scaled to max bucket.
   - **Per-section means table.** Columns: Section (with monospace key alias) / Avg score (out of 12) / Avg per question (0–3 scale). 10 rows for Rockefeller S1–S10.
6. **Submissions over time** — single-card sparkline. Inline SVG line+area chart spanning ~30 data points. Footer line shows first-submission date, last-submission date, and trend percentage. Subtitle calls out "MVP shape — non-interactive trend. Time-range chip + filters deferred to v1.5."
7. **"What's NOT in v1 MVP" callout** (blue info banner): "time-range filter, AccessGroup filter, per-organization breakdown table, cross-version comparison view, peer benchmark overlays. All deferred to v1.5. The current dashboard returns frozen stats from `getAggregateReport(templateId, versionId)` across ALL orgs and ALL time per locked decision 8."
8. **Service-layer surface card** (dashed border): `getAggregateReport` return shape, `canAccessAggregateReport` (admin-only), version-boundary contract (aggregation per `AssessmentTemplateVersion`, NOT cross-version), observability alert gate (`assessment.aggregate.query.duration_ms` p95 > 2000ms → page).
9. **End note.** Restates the v1 MVP rule: 2 selectors, no filters, no placeholder cards for v1.5.

## Mock data

**Selected template:** Rockefeller Habits Checklist. **Selected version:** v1 (enUS), published Apr 12, 2026, marked CURRENT.

**Top stat cards:**

| Metric | Value |
|--------|-------|
| Total submissions | 144 (across all time) |
| Organizations | 38 (distinct orgs) |
| Avg countAchieved | 28.5 / 40 |
| Avg overallTotal | 87.6 / 120 |
| Avg overallAverage | 2.19 / 3 |

**Tier histogram:**

| Tier  | Count | Percentage | Color  |
|-------|-------|------------|--------|
| Low   | 12    | 8%         | red    |
| OK    | 45    | 31%        | amber  |
| Great | 87    | 60%        | green  |

(Counts sum to 144 = total submissions.)

**Per-section means (Rockefeller S1–S10):**

| Section            | Alias         | Avg score | Avg per question |
|--------------------|---------------|-----------|------------------|
| S1 — People        | people        | 8.4 / 12  | 2.10             |
| S2 — Strategy      | strategy      | 7.2 / 12  | 1.80             |
| S3 — Execution     | execution     | 9.6 / 12  | 2.40             |
| S4 — Cash          | cash          | 8.0 / 12  | 2.00             |
| S5 — Core Values   | core-values   | 9.2 / 12  | 2.30             |
| S6 — Core Purpose  | core-purpose  | 8.8 / 12  | 2.20             |
| S7 — BHAG          | bhag          | 7.6 / 12  | 1.90             |
| S8 — Sandbox       | sandbox       | 8.0 / 12  | 2.00             |
| S9 — Brand Promise | brand-promise | 9.0 / 12  | 2.25             |
| S10 — KPIs         | kpis          | 9.8 / 12  | 2.45             |

**Submissions over time trend:** First submission Apr 14, 2026; last submission May 16, 2026; trend +162% over 30 days.

## Acceptance criteria

- [ ] Page renders the yellow wireframe banner citing v7.6 spec ref + the "v1 MVP: TWO selectors only" reminder.
- [ ] Sidebar has "Aggregate Report" highlighted as active; breadcrumb reads `Admin / Aggregate Reporting`.
- [ ] **ONLY 2 selectors on day 1.** Template dropdown + Version dropdown. NO time-range chip. NO group filter. NO org filter. NO date pickers anywhere on the page.
- [ ] Version dropdown defaults to the latest published version and labels it `CURRENT` via a green pill.
- [ ] The 5 top stat cards render with the exact values listed above.
- [ ] Tier histogram shows 3 bars (Low/OK/Great) with the exact counts (12/45/87) and percentages (8%/31%/60%).
- [ ] Per-section means table shows all 10 Rockefeller sections with the exact values listed above.
- [ ] Submissions-over-time sparkline is non-interactive (no hover tooltips, no time-range zoom) — MVP shape only.
- [ ] "What's NOT in v1 MVP" callout is visually distinct (info-blue palette) and explicitly enumerates: time-range filter, AccessGroup filter, per-organization breakdown table, cross-version comparison view, peer benchmark overlays.
- [ ] Service-layer surface card mentions `getAggregateReport`, `canAccessAggregateReport` (admin-only), version-boundary contract, and the `assessment.aggregate.query.duration_ms` observability gate.
- [ ] End note reaffirms the day-1 rule: 2 selectors, no filters, no placeholders.
- [ ] Renders cleanly at 1280×800 with Tailwind CDN + `_shared.css`.
- [ ] Aggregation is per `AssessmentTemplateVersion` (version is mandatory), NEVER per template across versions in v1.

## Implementation surface

- Files this drives when implemented:
  - `src/src/app/(dashboard)/admin/aggregate/page.tsx` (dashboard server component)
  - `src/src/components/aggregate/aggregate-report-view.tsx` (client component with selector state)
  - `src/src/components/aggregate/tier-histogram.tsx`
  - `src/src/components/aggregate/section-means-table.tsx`
  - `src/src/components/aggregate/submissions-sparkline.tsx`
  - `src/src/lib/assessments/aggregate-report.ts` (`getAggregateReport(templateId, versionId)` server function)
  - `src/src/app/api/aggregate-reports/[templateId]/[versionId]/route.ts` (GET, admin-only)
- Spec cross-refs:
  - `docs/specs/v7.6/02-service-layer-rules.md` — `canAccessAggregateReport` (admin/staff only), `aggregationMode` (admin bypasses CEO_ONLY in aggregate)
  - `docs/specs/v7.6/06-observability.md` — `assessment.aggregate.query.duration_ms` p95 alert gate at 2000ms
  - `docs/specs/v7.6/05-wireframes-wave5.md` — Decision 5 + Decision 8 (MVP shape: 2 selectors, no filters)
  - `docs/specs/v7.6/07-bootstrap-runbook.md` — seed produces the Rockefeller v1 (enUS) template + version that this dashboard reports on

---

**Decision provenance**: see `plans/history/v6-v7.5-archive.md` for the full Codex Round changelogs that produced this spec.
