# Scaling Up Self Comparison Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add the Coach-only Scaling Up Self Comparison picker and printable Focus-versus-Earlier HTML report without adding a Team-over-time report or a second renderer.

**Architecture:** Reuse Wave RC's frozen-submission identity, authorization, chronology, and comparison model through a Summary Reporting adapter that bypasses only Wave RC's separate rollout flags after the owning Summary capability has been authorized. Build a strict Self Comparison projection over the approved Scaling Up Full landscape model, then expose it through a Coach-only picker and enumeration-safe HTML route with the existing print/PDF controls.

**Tech Stack:** Next.js 15 App Router, React 19, TypeScript, Prisma 5, Radix Dialog/Dropdown, Jest + Testing Library, server-rendered HTML/CSS print path.

**Spec:** `docs/superpowers/specs/2026-08-30-scaling-self-comparison-design.md`

## Global Constraints

- One Focus personal report plus one Earlier personal report for the same person; never Team/cohort/campaign-average comparison.
- Earlier `submittedAt` must be strictly before Focus.
- Focus belongs to the selected Campaign's designated CEO Participant.
- Cross-version pairs require exact `Q01`-`Q61` Slider Likert 0-10 compatibility and canonical section identity.
- Focus supplies wording, recommendations, open responses, current score, and Peers; Earlier supplies previous scores only.
- Approved server-rendered HTML is canonical; do not extend `@react-pdf` or create a Blob artifact.
- Use only the existing Summary Reporting capability/kill resolution. Do not add, edit, read, or deploy environment values.
- No schema migration, Admin mount, Production-data write, report email, sharing, or generated-report history UI.
- Ordinary group/report markup remains unchanged when Summary Reporting is unavailable or Self Comparison is absent.
- Fixed review point: `cdafe24603c7c92648befc4a5f13d7ccbf01fc6d`.

---

### Task 0: Completed mandatory preflight and audit

**Files:**
- Source handoff read from shared root: `tmp/handoffs/HANDOFF-B3-comparison.md`
- Authoritative instructions read from git object: `git show origin/main:CLAUDE.md`
- Audit recorded in: `docs/superpowers/specs/2026-08-30-scaling-self-comparison-design.md`

- [x] **Step 1: Fetch and verify `origin/main`**

Verified `origin/main` at `cdafe24603c7c92648befc4a5f13d7ccbf01fc6d`.

- [x] **Step 2: Preserve the dirty shared checkout and branch from the fixed point**

Created isolated worktree `.worktrees/b3-summary-report-comparison` on `codex/b3-summary-report-comparison` from exact `origin/main`.

- [x] **Step 3: Read authoritative instructions and claim the row**

Read `CLAUDE.md` from the git object, then claimed GH #261 at issue comment `5468169237` before design or code.

- [x] **Step 4: Audit Wave RC and the source artifact before feature code**

Recorded reusable and missing substrate in spec section 3 and visually inspected source pages 1, 5, 7, and 26-31 from the supplied Self Comparison PDF.

---

### Task 1: Summary adapter over Wave RC

**Files:**
- Modify: `src/src/lib/assessments/report-comparison.ts`
- Modify: `src/src/__tests__/lib/assessments/report-comparison.test.ts`

**Interfaces:**
- Produces: `listSummarySelfComparisonCandidates(db, viewer, focus): Promise<CandidateOutcome>`.
- Produces: `loadSummarySelfComparison(db, viewer, focus, earlierSubmissionId): Promise<ComparisonOutcome>`.
- Preserves: existing `listReportComparisonCandidates` and `loadReportComparison` Wave RC flag semantics byte-for-byte.
- Preserves: generic Wave RC DTOs without Scaling-specific shape flags or added respondent PII.

- [ ] **Step 1: Write failing service tests for Summary ownership and unchanged Wave RC flags**

Assert:

- the Summary adapter lists/loads an eligible same-person Earlier report while all `WAVE_RC_*` variables are absent;
- cross-member and Earlier-after-Focus pairs return `invalid`;
- an unauthorized Earlier campaign returns `invalid`;
- the existing Wave RC public functions remain unavailable when their rollout is off;
- returned candidates retain the existing presentation-safe Campaign/date/version/import facts without widening the generic DTO.

- [ ] **Step 2: Run the service test and verify RED**

Run: `npx jest src/__tests__/lib/assessments/report-comparison.test.ts --runInBand`

Expected: FAIL because the Summary adapter exports do not exist.

- [ ] **Step 3: Extract one internal policy-aware execution path**

Keep one internal list/load implementation. Existing Wave RC exports pass the current rollout/focus predicates; new Summary exports pass an already-authorized policy that skips only the Wave RC environment predicates. All live identity, source-state, dual-campaign access, and transaction checks remain shared.

```ts
export async function listSummarySelfComparisonCandidates(
  db: ReportComparisonDb,
  viewer: Extract<ReportComparisonViewer, { kind: "operator" }>,
  focus: ReportComparisonFocus,
): Promise<CandidateOutcome>;

export async function loadSummarySelfComparison(
  db: ReportComparisonDb,
  viewer: Extract<ReportComparisonViewer, { kind: "operator" }>,
  focus: ReportComparisonFocus,
  earlierSubmissionId: string,
): Promise<ComparisonOutcome>;
```

- [ ] **Step 4: Run the comparison service suite and commit**

Run: `npx jest src/__tests__/lib/assessments/report-comparison.test.ts --runInBand`

Expected: PASS.

Commit: `feat: adapt report comparison for summary reports`

---

### Task 2: Strict Self Comparison projection

**Files:**
- Create: `src/src/lib/assessments/su-full-self-comparison.ts`
- Create: `src/src/__tests__/fixtures/su-full-self-comparison.ts`
- Create: `src/src/__tests__/lib/assessments/su-full-self-comparison.test.ts`

**Interfaces:**
- Consumes: `SuFullLandscapeReportModel` and a compatible `ReportComparisonModel`.
- Produces: `buildSuFullSelfComparisonModel({ focus, comparison }): SuFullSelfComparisonModel | null`.
- Produces: ordered profile, question, Appendix B, and Appendix C rows with no Team concept.
- Produces: Summary-specific compatibility validation without changing `ReportComparisonModel`.

- [ ] **Step 1: Write the golden fixture from independent literals**

Build 61 literal current/previous/peer values without calling production aggregation helpers. Use different values for each decision so swapped columns are detectable. Give the Focus and Earlier candidates distinct Campaign labels/dates and one respondent name.

- [ ] **Step 2: Write a failing golden projection test**

Assert:

- exactly 61 main questions with current/previous/peer and `current - previous`;
- ten subsection profile rows and five chapter rows with independently calculated previous means;
- Appendix B has exactly two named rows and four decision columns;
- Appendix C has exactly 51 rows (`Q01`-`Q45`, `Q56`-`Q61`) and `average === (focus + earlier) / 2`;
- Focus values must exactly match the landscape model;
- exact keys must be `Q01`-`Q61`, every status must be comparable, baseline section keys must match the ten canonical sections, and missing/non-finite/mismatched values return `null`.

```ts
const model = buildSuFullSelfComparisonModel({ focus, comparison });
expect(model?.questions).toHaveLength(61);
expect(model?.appendixC.map((row) => row.stableKey)).not.toContain("Q46");
expect(model?.appendixC).toHaveLength(51);
expect(model?.appendixB.rows.map((row) => row.label)).toEqual(["CEO score", "John Adams"]);
```

- [ ] **Step 3: Run the projection test and verify RED**

Run: `npx jest src/__tests__/lib/assessments/su-full-self-comparison.test.ts --runInBand`

Expected: FAIL because the module does not exist.

- [ ] **Step 4: Implement the minimal pure projection**

Export explicit immutable types for question rows, profile rows, decision rows, and Appendix C rows. Derive means from the independent question series, never from cross-version aggregate deltas. Deep-freeze or clone outputs consistently with `su-full-landscape-report.ts`.

- [ ] **Step 5: Run the projection test and verify GREEN**

Run: `npx jest src/__tests__/lib/assessments/su-full-self-comparison.test.ts --runInBand`

Expected: PASS.

- [ ] **Step 6: Commit**

Commit: `feat: build self comparison report model`

---

### Task 3: Approved HTML Self Comparison report

**Files:**
- Modify: `src/src/components/assessments/su-full-landscape/SuFullLandscapeCharts.tsx`
- Modify: `src/src/components/assessments/su-full-landscape/SuFullLandscapeReport.tsx`
- Modify: `src/src/app/globals.css`
- Create: `src/src/__tests__/components/assessments/su-full-self-comparison-report.test.tsx`
- Modify: `src/src/__tests__/components/assessments/su-full-landscape-report.test.tsx`

**Interfaces:**
- Consumes: optional `selfComparison?: SuFullSelfComparisonModel` on `SuFullLandscapeReport`.
- Preserves: current no-comparison render exactly when the prop is absent.
- Produces: print pages for cover/profile/body/Appendices A-B-C and accessible current/previous/peer descriptions.

- [ ] **Step 1: Write a failing semantic render test**

Render the golden Focus report with `selfComparison`. Assert:

- cover contains `Self Comparison`, one respondent name, and both periods;
- profile headers are `Focus`, `Earlier`, `Peers`, `Dev from Earlier`, `Dev from Peers`;
- exactly 61 `data-self-comparison-question` nodes exist;
- question Q46 includes Focus/Earlier/Peers in the main body;
- legend contains `Score of Previous` and `Score of Peers`;
- Appendix A does not render Earlier;
- Appendix B and the four Appendix C page groups render exact fixture values;
- scoped profile/appendix headers and legends contain no secondary series or source-role label `Team` / `Team avg`; legitimate `Leadership Team` instrument content remains.

- [ ] **Step 2: Write a failing preservation test**

Render the ordinary landscape report without `selfComparison` and assert the existing DOM snapshot/key headings remain unchanged, including `You`, `Peers`, `Deviation`, and the existing Appendix A.

- [ ] **Step 3: Run the component suites and verify RED**

Run: `npx jest src/__tests__/components/assessments/su-full-self-comparison-report.test.tsx src/__tests__/components/assessments/su-full-landscape-report.test.tsx --runInBand`

Expected: Self Comparison suite FAIL; ordinary suite remains PASS.

- [ ] **Step 4: Generalize charts with an optional Previous series**

Add optional previous values/labels while keeping the existing JSX branch untouched when absent. The accessible text explicitly names Focus, Earlier, and Peers.

- [ ] **Step 5: Add variant-aware landscape page content**

Branch only where the visual semantics differ:

- cover subtitle and periods;
- profile columns/commentary;
- overview/detail comparison series;
- Appendix B named decision table;
- Appendix C four fixed groups: People, Strategy, Execution, Cash + Internal Communication.

Appendix A must continue to receive no Earlier series.

- [ ] **Step 6: Add scoped responsive/print CSS**

Use existing `su-full-landscape-*` tokens and domain classes. Add only `.su-full-self-comparison-*` selectors needed for five-column profile tables and compact Appendix grids. No hard-coded semantic-state colors and no generic unscoped selectors.

- [ ] **Step 7: Run component and browser suites and commit**

Run: `npx jest src/__tests__/components/assessments/su-full-self-comparison-report.test.tsx src/__tests__/components/assessments/su-full-landscape-report.test.tsx src/__tests__/components/assessments/su-full-landscape-browser.test.tsx --runInBand`

Expected: PASS.

Commit: `feat: render self comparison in approved html report`

---

### Task 4: Candidate API and two-source picker

**Files:**
- Create: `src/src/app/api/assessment-campaigns/[id]/summary-reports/self-comparison-candidates/route.ts`
- Create: `src/src/lib/assessments/summary-reports/self-comparison-access.ts`
- Create: `src/src/components/assessments/SelfComparisonPicker.tsx`
- Create: `src/src/__tests__/api/assessment-self-comparison-candidates.test.ts`
- Create: `src/src/__tests__/lib/assessments/summary-reports/self-comparison-access.test.ts`
- Create: `src/src/__tests__/components/assessments/self-comparison-picker.test.tsx`

**Interfaces:**
- API input: `GET .../self-comparison-candidates?focusSubmissionId=<opaque>`; the server derives the respondent.
- API output: `{ candidates: ReportComparisonCandidate[] }` or enumeration-safe 404/503.
- Produces: `listAuthorizedSelfComparisonCandidates(...)` behind the same Coach-only destination/capability/CEO-Focus envelope the report loader uses.
- Picker input: destination Campaign facts plus current completed CEO Focus candidates projected from `CampaignRespondentRow[]`.
- Picker output: opens exact HTML route only after two selections.

- [ ] **Step 1: Write failing route tests**

Mock only auth/rate-limit/service public seams. Assert flag-off, non-Coach, missing actor, unavailable destination capability/access, and non-CEO Focus return 404; malformed query returns 400; eligible request calls `listAuthorizedSelfComparisonCandidates`; service outage returns 503; success returns no-store JSON candidates.

- [ ] **Step 2: Run route test and verify RED**

Run: `npx jest src/__tests__/api/assessment-self-comparison-candidates.test.ts --runInBand`

Expected: FAIL because the route does not exist.

- [ ] **Step 3: Implement the minimal rate-limited candidate route**

Resolve the existing Summary Reporting state before auth, require a strict Zod query, and delegate destination capability/access plus Focus Campaign/CEO/respondent derivation to the shared Coach-only envelope. Serialize Date values to ISO strings without exposing normalized email.

- [ ] **Step 4: Write failing picker tests**

Assert loading, no completed CEO, no Earlier candidate, failed load, preselected sole Focus, selection summary, disabled generation, and exact `window.open` URL. Also assert the explanatory line: `This compares the CEO's own results over time, not the company average.`

- [ ] **Step 5: Run picker test and verify RED**

Run: `npx jest src/__tests__/components/assessments/self-comparison-picker.test.tsx --runInBand`

Expected: FAIL because the component does not exist.

- [ ] **Step 6: Implement the narrow responsive picker**

Use the existing Dialog and Button components, native labelled selects, visible provenance, `role="status"` for async state, and an alert for failure. Abort stale fetches when Focus or open state changes. Generate with a plain explicit `window.open(url, "_blank", "noopener,noreferrer")` action; do not prefetch report PII.

- [ ] **Step 7: Run route/picker tests and commit**

Run: `npx jest src/__tests__/api/assessment-self-comparison-candidates.test.ts src/__tests__/components/assessments/self-comparison-picker.test.tsx --runInBand`

Expected: PASS.

Commit: `feat: add self comparison source picker`

---

### Task 5: Enumeration-safe HTML report route

**Files:**
- Create: `src/src/app/(report)/assessments/[id]/self-comparison/page.tsx`
- Create: `src/src/__tests__/app/assessment-self-comparison-report-page.test.tsx`
- Modify: `src/src/__tests__/lib/assessments/summary-reports/self-comparison-access.test.ts`

**Interfaces:**
- Consumes: destination Campaign ID plus `focus` and `earlier` query values.
- Produces: `loadAuthorizedSelfComparison(...)` discriminated `ok | not-found` result containing Focus report, peer presentation, and strict Self Comparison model.
- Produces: HTML page with `PrintReportButton` and `SuFullLandscapeReport selfComparison={model}`.

- [ ] **Step 1: Write failing access-loader tests**

Assert:

- Summary flag/capability unavailable → `not-found` before source reads;
- non-Coach actor → `not-found` even if generic report access could pass;
- Focus not bound to the destination CEO Participant → `not-found`;
- duplicate, cross-member, later, unauthorized, or incompatible pair → `not-found`;
- valid pair loads the Focus report/peer presentation and returns the strict projection;
- no source answer text appears in errors/metrics.

- [ ] **Step 2: Run access test and verify RED**

Run: `npx jest src/__tests__/lib/assessments/summary-reports/self-comparison-access.test.ts --runInBand`

Expected: FAIL because the loader does not exist.

- [ ] **Step 3: Implement the loader as the single authorization envelope**

Keep route code thin. The loader rechecks Summary state, Coach role, capability, destination access, Focus CEO binding, Wave RC Summary comparison, then enters the existing `viewRespondentReport` report-access gate for rate limiting, no-store/audit protocol, and the Focus Results report before peer resolution and strict projection. Require the gated report provenance submission ID to equal Focus. Return only `not-found` for any rejected source fact.

- [ ] **Step 4: Write failing page tests**

Assert missing parameters and loader `not-found` call `notFound`; success writes `VIEW_SUMMARY_SELF_COMPARISON`, renders both print actions via `PrintReportButton`, emits no Team comparison-series labels, and uses a Focus/Earlier export filename.

- [ ] **Step 5: Run page test and verify RED**

Run: `npx jest src/__tests__/app/assessment-self-comparison-report-page.test.tsx --runInBand`

Expected: FAIL because the page does not exist.

- [ ] **Step 6: Implement the dynamic no-store page**

Export `dynamic = "force-dynamic"` and `revalidate = 0`, resolve actor, call the loader, write strict audit facts limited to campaign/submission IDs and report kind, and render the approved HTML report.

- [ ] **Step 7: Run access/page tests and commit**

Run: `npx jest src/__tests__/lib/assessments/summary-reports/self-comparison-access.test.ts src/__tests__/app/assessment-self-comparison-report-page.test.tsx --runInBand`

Expected: PASS.

Commit: `feat: serve authorized self comparison report`

---

### Task 6: Third Coach dropdown entry and flag-off preservation

**Files:**
- Modify: `src/src/lib/assessments/summary-reports/registry.ts`
- Modify: `src/src/components/assessments/CampaignDetail.tsx`
- Modify: `src/src/__tests__/lib/assessments/summary-reports/registry-and-flags.test.ts`
- Modify: `src/src/__tests__/components/assessments/campaign-detail-summary-reports.test.tsx`

**Interfaces:**
- Consumes: existing `summaryReporting.implementedTypes` and `initialRespondents`.
- Produces: dropdown order Group report, Condensed report when implemented, Comparison report; B3 adds only Comparison.
- Preserves: existing single anchor when `summaryReporting` is null and Admin's absence of the capability.

- [ ] **Step 1: Write failing registry/dropdown tests**

Assert Self Comparison is implemented with roles Focus 1/1 and Earlier 1/1; the Coach dropdown renders Group first and Comparison third catalog position; clicking Comparison opens the picker; flag-off/non-capability markup remains the exact existing `View group report` anchor; Admin fixtures receive no Summary capability.

- [ ] **Step 2: Run the suites and verify RED**

Run: `npx jest src/__tests__/lib/assessments/summary-reports/registry-and-flags.test.ts src/__tests__/components/assessments/campaign-detail-summary-reports.test.tsx --runInBand`

Expected: FAIL because Self Comparison is not implemented or mounted.

- [ ] **Step 3: Enable the registry entry and mount the picker**

Set only `SCALING_SELF_COMPARISON.implemented = true`. Render a non-prefetching dropdown button from the server-provided implemented type, close the Radix menu, then open `SelfComparisonPicker` with current completed CEO rows. Do not add any client-side flag inference.

- [ ] **Step 4: Run dropdown, picker, capability, and Admin-host suites**

Run: `npx jest src/__tests__/lib/assessments/summary-reports/registry-and-flags.test.ts src/__tests__/components/assessments/campaign-detail-summary-reports.test.tsx src/__tests__/components/assessments/self-comparison-picker.test.tsx --runInBand`

Expected: PASS.

- [ ] **Step 5: Commit**

Commit: `feat: add comparison to coach report dropdown`

---

### Task 7: Source-of-truth hygiene, full verification, and visual gate

**Files:**
- Modify: `CLAUDE.md`
- Modify: `plans/CHANGELOG.md`
- Possibly modify: implementation/test files only for review findings

**Interfaces:**
- Produces: same-PR implementation receipt that says implemented/open PR, not merged/deployed.
- Produces: reproducible visual evidence outside tracked source under `tmp/b3-self-comparison-review/`.

- [ ] **Step 1: Update SoT documents accurately**

Update only the `LAST_UPDATED_ISO`/`LAST_UPDATED_SLUG` anchor plus brief Project Context prose in `CLAUDE.md`; prepend a full `plans/CHANGELOG.md` entry describing one-person semantics, reuse boundary, tests, no config/data changes, and current not-merged/not-deployed status.

- [ ] **Step 2: Run all focused suites**

Run the comparison model/service, strict projection, landscape component/browser, picker, API, route, registry, campaign dropdown, and respondent report suites in one `--runInBand` invocation.

Expected: all pass, zero failures.

- [ ] **Step 3: Run the full repository suite**

Run: `npm test -- --runInBand`

Expected: all suites/tests pass.

- [ ] **Step 4: Run migration safety**

Run: `node scripts/check-migration-safety.mjs`

Expected: all migration checks pass; no migration is added.

- [ ] **Step 5: Run ESLint on every changed JS/TS/TSX file**

Run: `npx eslint <all changed .ts/.tsx files>`

Expected: zero warnings and zero errors.

- [ ] **Step 6: Run the exact requested build**

Run: `CI=true npm run build`

Expected: exit 0 with TypeScript and every static page generated.

- [ ] **Step 7: Render and inspect the report visually**

Use the repository's existing browser/render harness with the golden Focus/Earlier fixture. Capture desktop report pages and the picker at desktop and mobile widths under `tmp/b3-self-comparison-review/`. Compare cover, profile, one chapter, one detail page, Appendix A, Appendix B, and all Appendix C groups against the supplied 31-page source. Verify no clipping, orphan spill page, horizontal overflow, Team label, unreadable five-column table, or missing Previous contour.

- [ ] **Step 8: Commit final docs/fixes**

Commit: `docs: record self comparison implementation`

---

### Task 8: PR and independent review loop

**Files:**
- Review range: `cdafe24603c7c92648befc4a5f13d7ccbf01fc6d...HEAD`
- Spec source: `docs/superpowers/specs/2026-08-30-scaling-self-comparison-design.md`

- [ ] **Step 1: Verify branch freshness and inspect final diff**

Run: `git fetch origin`, verify `git merge-base cdafe246 HEAD` equals `cdafe246`, separately report whether `origin/main` advanced from `cdafe246`, run `git diff --check` and `git status --short`, and inspect `git diff cdafe246...HEAD`.

- [ ] **Step 2: Push and open the PR**

Push `codex/b3-summary-report-comparison` and open a PR referencing GH #387 and the active #261 claim. State explicitly: one person then-vs-now; no Team comparison; no environment/config/Production-data change; not merged/deployed.

- [ ] **Step 3: Run two-axis independent code review**

Dispatch the code-review skill's Standards and Spec reviewers against fixed point `cdafe246` and this spec. Fix every Critical/Important finding; assess Minor findings explicitly.

- [ ] **Step 4: Re-run affected checks and commit fixes**

For every change, rerun its focused test plus changed-file ESLint. Before the final push, rerun the complete focused matrix and `CI=true npm run build` if runtime code changed.

- [ ] **Step 5: Repeat review until clear**

Run the same two axes on the updated HEAD. Do not merge. Report the PR URL, check status, review result, remaining external gates, and keep the #261 claim held until merge/closeout.
