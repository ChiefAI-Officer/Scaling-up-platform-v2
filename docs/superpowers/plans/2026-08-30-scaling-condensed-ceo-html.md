# Scaling Up Condensed CEO HTML Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a Coach-only, one-click, two-page Condensed CEO HTML report to B1's Scaling Up Full report dropdown.

**Architecture:** Resolve the current campaign CEO server-side, build a frozen renderer-independent snapshot from the stored personal result, and render it with the existing Scaling Up landscape HTML page/chart primitives. Keep the existing Summary Reporting capability, report access gate, audit posture, print actions, and plain-anchor semantics; do not add a PDF renderer or wizard integration.

**Tech Stack:** Next.js 16 server components, React 19, TypeScript, Prisma 5, Jest/Testing Library, Tailwind/report CSS, Playwright/Chromium print-to-PDF.

**Spec:** `docs/superpowers/specs/2026-08-30-scaling-condensed-ceo-html-design.md`

## Global Constraints

- Base every change on `cdafe24603c7c92648befc4a5f13d7ccbf01fc6d`.
- Do not change any environment variable, feature flag, schema, migration, or Production data.
- Condensed is one click with no picker, wizard, candidates request, generated-artifact lifecycle, or `@react-pdf` code.
- Fetch and render CEO data only; never fetch or expose Team submissions for this report.
- Preserve B1's byte-identical legacy button when Summary Reporting capability is absent.
- Every production behavior begins with a focused failing test and an observed expected failure.

---

### Task 1: Harvest the pure 61-score model

**Files:**
- Create: `src/src/lib/assessments/summary-reports/scaling-condensed-ceo-model.ts`
- Create: `src/src/__tests__/lib/assessments/summary-reports/scaling-condensed-ceo-model.test.ts`
- Create: `src/src/__tests__/fixtures/summary-reports/scaling-condensed-ceo-golden.ts`

**Interfaces:**
- Consumes: `RespondentReport`, `SU_FULL_LANDSCAPE_CHAPTERS`, `SU_FULL_LANDSCAPE_SECTIONS`, and `buildSuFullPeerPresentationResult`.
- Produces: `buildScalingCondensedCeoModel(report): {kind:"ok"; model: ScalingCondensedCeoModel} | {kind:"invalid"; code:"condensed_source_incomplete"}`.

- [x] **Step 1: Write the golden fixture and failing model tests**

Use the literal artifact score sequence and assert the desired API:

```ts
export const CONDENSED_GOLDEN_CURRENT_SCORES = [
  6, 7, 7, 7, 8, 8, 8, 8, 7, 8, 8, 8, 8,
  8, 8, 8, 8, 8, 8, 8,
  8, 8, 8, 9, 7, 8, 10, 8, 9, 9, 9, 9, 9, 9, 9, 9, 9, 9, 9, 9,
  9, 9, 9, 9, 9,
  9, 9, 5, 7, 7, 9, 9, 8, 9, 8, 9, 9, 9, 9, 9, 9,
] as const;
```

Tests cover ordered Q01-Q61 output, `13/7/20/5/16` groups, exact current/peer values, zero preservation, missing/invalid values, section drift, invalid peer provenance, and absence of remarks/recommendations.

- [x] **Step 2: Run the model test and observe RED**

Run: `PATH="/opt/homebrew/opt/node@20/bin:$PATH" npx jest src/__tests__/lib/assessments/summary-reports/scaling-condensed-ceo-model.test.ts --runInBand`

Expected: FAIL because `scaling-condensed-ceo-model` does not exist.

- [x] **Step 3: Implement the minimal pure projection**

Add the prior branch's validated projection without renderer or wizard imports. The output row is exactly:

```ts
type CondensedQuestion = {
  stableKey: string;
  label: string;
  you: number;
  peers: number;
};
```

- [x] **Step 4: Run the model test and observe GREEN**

Run the Step 2 command. Expected: PASS.

- [x] **Step 5: Commit the self-contained model cycle**

```bash
git add src/src/lib/assessments/summary-reports/scaling-condensed-ceo-model.ts src/src/__tests__/lib/assessments/summary-reports/scaling-condensed-ceo-model.test.ts src/src/__tests__/fixtures/summary-reports/scaling-condensed-ceo-golden.ts
git commit -m "feat: model condensed CEO scores"
```

### Task 2: Resolve and freeze the current CEO snapshot

**Files:**
- Create: `src/src/lib/assessments/summary-reports/scaling-condensed-ceo-snapshot.ts`
- Create: `src/src/__tests__/lib/assessments/summary-reports/scaling-condensed-ceo-snapshot.test.ts`

**Interfaces:**
- Consumes: `ApiActor`, `canViewGroupReport`, `resolveSummaryReportingState`, `buildStoredRespondentReport`, and Task 1's model builder.
- Produces: `getScalingCondensedCeoSnapshot(db, actor, campaignId, generatedAt, env): Promise<ScalingCondensedCeoResult>`.

- [x] **Step 1: Write failing snapshot tests with a narrow fake transaction DB**

Exercise these observable branches:

```ts
expect(result.kind).toBe("ok");
expect(result.snapshot.model.groups.flatMap(group => group.questions)).toHaveLength(61);
expect(participantFindFirst).toHaveBeenCalledWith(expect.objectContaining({
  where: { campaignId: "campaign-1", isCEO: true },
}));
expect(submissionFindFirst).toHaveBeenCalledWith(expect.objectContaining({
  where: expect.objectContaining({ campaignId: "campaign-1", respondentId: "respondent-ceo" }),
}));
```

Also assert disabled/killed, forbidden, unsupported/public/unpublished, no CEO, CEO not submitted, incomplete result, and that no `findMany` Team-submission query exists.

- [x] **Step 2: Run the snapshot test and observe RED**

Run: `PATH="/opt/homebrew/opt/node@20/bin:$PATH" npx jest src/__tests__/lib/assessments/summary-reports/scaling-condensed-ceo-snapshot.test.ts --runInBand`

Expected: FAIL because the snapshot loader does not exist.

- [x] **Step 3: Implement one repeatable-read CEO-only snapshot loader**

The successful frozen shape is:

```ts
export interface ScalingCondensedCeoSnapshot {
  schemaVersion: 1;
  reportType: "SCALING_CONDENSED_CEO";
  generatedAt: string;
  destination: { campaignId: string; campaignName: string; assessmentName: string; companyName: string; versionId: string; versionLabel: string };
  source: { participantId: string; submissionId: string; respondentName: string; submittedAt: string };
  model: ScalingCondensedCeoModel;
  provenance: { coachLogoUrl: string | null; coachName: string | null; peer: ScalingCondensedCeoModel["peerProvenance"] };
}
```

Do not copy the prior multi-campaign `sources` picker or raw Team source payload.

- [x] **Step 4: Run snapshot and existing group-access suites and observe GREEN**

Run: `PATH="/opt/homebrew/opt/node@20/bin:$PATH" npx jest src/__tests__/lib/assessments/summary-reports/scaling-condensed-ceo-snapshot.test.ts src/__tests__/lib/auth/can-view-group-report.test.ts --runInBand`

Expected: PASS.

- [x] **Step 5: Commit the snapshot cycle**

```bash
git add src/src/lib/assessments/summary-reports/scaling-condensed-ceo-snapshot.ts src/src/__tests__/lib/assessments/summary-reports/scaling-condensed-ceo-snapshot.test.ts
git commit -m "feat: resolve condensed CEO snapshot"
```

### Task 3: Render the canonical two-page HTML report

**Files:**
- Create: `src/src/components/assessments/ScalingCondensedCeoReport.tsx`
- Modify: `src/src/styles/su-report.css`
- Create: `src/src/__tests__/components/assessments/scaling-condensed-ceo-report.test.tsx`

**Interfaces:**
- Consumes: `ScalingCondensedCeoSnapshot`, `SuFullLandscapePage`, `SuFullVerticalPeerChart`, and `CoachLogo`.
- Produces: `<ScalingCondensedCeoReport snapshot={snapshot} responsiveEnabled={boolean} />`.

- [x] **Step 1: Write the failing golden DOM test**

Assert exactly two `[data-page-number]` sections, `Condensed version`, five charts, 61 unique Q rows with literal scores and peers, Coach byline chrome, and absence of `Team`, `Narrative`, `Profile`, `Conclusion`, `Appendix B`, `Appendix C`, `Remarks`, and `Verbatims`.

- [x] **Step 2: Run the component test and observe RED**

Run: `PATH="/opt/homebrew/opt/node@20/bin:$PATH" npx jest src/__tests__/components/assessments/scaling-condensed-ceo-report.test.tsx --runInBand`

Expected: FAIL because the component does not exist.

- [x] **Step 3: Implement the two-page composition using existing HTML primitives**

The root must remain in the approved renderer family:

```tsx
<div className="su-public-brand su-report su-full-landscape su-condensed-ceo">
  <SuFullLandscapePage number={1} variant="cover" footerBrand={snapshot.provenance}>...</SuFullLandscapePage>
  <SuFullLandscapePage number={2} variant="appendix" footerBrand={snapshot.provenance}>...</SuFullLandscapePage>
</div>
```

Add only Condensed-specific cover/print selectors that the existing landscape classes cannot express.

- [x] **Step 4: Run component plus existing landscape suites and observe GREEN**

Run: `PATH="/opt/homebrew/opt/node@20/bin:$PATH" npx jest src/__tests__/components/assessments/scaling-condensed-ceo-report.test.tsx src/__tests__/components/assessments/su-full-landscape-report.test.tsx src/__tests__/components/assessments/su-full-peer-render.test.tsx --runInBand`

Expected: PASS.

- [x] **Step 5: Commit the HTML composition cycle**

```bash
git add src/src/components/assessments/ScalingCondensedCeoReport.tsx src/src/styles/su-report.css src/src/__tests__/components/assessments/scaling-condensed-ceo-report.test.tsx
git commit -m "feat: render condensed CEO HTML report"
```

### Task 4: Add the gated report route and shared access protocol

**Files:**
- Create: `src/src/lib/assessments/condensed-ceo-report-access-gate.ts`
- Create: `src/src/app/(report)/assessments/[id]/report/condensed/page.tsx`
- Create: `src/src/__tests__/app/condensed-ceo-report-route.test.tsx`
- Modify: `src/src/__tests__/middleware.test.ts`

**Interfaces:**
- Consumes: Task 2 loader, Task 3 component, `viewReport`, `defaultReportGateDeps`, `PrintReportButton`, group metrics.
- Produces: `/assessments/[id]/report/condensed` and `viewCondensedCeoReport(...)`.

- [x] **Step 1: Write failing route/gate tests**

Prove disabled/forbidden 404 behavior, fail-closed audit, clean no-CEO/no-submission/incomplete panels, successful `GROUP_REPORT_VIEW` audit with `kind:"condensed-ceo"`, both print actions, and no-store middleware coverage.

- [x] **Step 2: Run the route tests and observe RED**

Run: `PATH="/opt/homebrew/opt/node@20/bin:$PATH" npx jest src/__tests__/app/condensed-ceo-report-route.test.tsx src/__tests__/middleware.test.ts --runInBand`

Expected: FAIL because the route/adapter do not exist.

- [x] **Step 3: Implement the adapter and server page**

Use the existing gate ordering and audit action. The page renders actions only for `ok`; clean unavailable outcomes return before the action bar.

- [x] **Step 4: Run Condensed and existing group route suites and observe GREEN**

Run: `PATH="/opt/homebrew/opt/node@20/bin:$PATH" npx jest src/__tests__/app/condensed-ceo-report-route.test.tsx src/__tests__/app/group-report-route.test.tsx src/__tests__/middleware.test.ts --runInBand`

Expected: PASS.

- [x] **Step 5: Commit the route cycle**

```bash
git add src/src/lib/assessments/condensed-ceo-report-access-gate.ts 'src/src/app/(report)/assessments/[id]/report/condensed/page.tsx' src/src/__tests__/app/condensed-ceo-report-route.test.tsx src/src/__tests__/middleware.test.ts
git commit -m "feat: serve condensed CEO report"
```

### Task 5: Add the B1 dropdown entry without wizard integration

**Files:**
- Modify: `src/src/lib/assessments/summary-reports/registry.ts`
- Modify: `src/src/components/assessments/CampaignDetail.tsx`
- Modify: `src/src/__tests__/lib/assessments/summary-reports/registry-and-flags.test.ts`
- Modify: `src/src/__tests__/components/assessments/campaign-detail-summary-reports.test.tsx`

**Interfaces:**
- Consumes: B1 `summaryReporting.implementedTypes` and `groupReportHref`.
- Produces: the second `Condensed CEO` plain anchor to `${groupReportHref}/condensed`.

- [x] **Step 1: Write failing registry/dropdown tests**

Assert `implemented:true`, `rendererVersion:"scaling-condensed-ceo-html-v1"`, Group first, Condensed second, both `target="_blank"`, Condensed is a native anchor, and capability-null markup matches the existing single-button snapshot/expectations.

- [x] **Step 2: Run the registry/dropdown tests and observe RED**

Run: `PATH="/opt/homebrew/opt/node@20/bin:$PATH" npx jest src/__tests__/lib/assessments/summary-reports/registry-and-flags.test.ts src/__tests__/components/assessments/campaign-detail-summary-reports.test.tsx --runInBand`

Expected: FAIL because Condensed is unavailable and absent from the dropdown.

- [x] **Step 3: Implement the minimal catalog and plain-anchor entry**

Do not modify `SummaryReportWizard`, candidates APIs, POST schemas, create lifecycle, artifact routes, or PDF renderer dispatch.

- [x] **Step 4: Run capability, dropdown, portal, and Admin suites and observe GREEN**

Run: `PATH="/opt/homebrew/opt/node@20/bin:$PATH" npx jest src/__tests__/lib/assessments/summary-reports/registry-and-flags.test.ts src/__tests__/components/assessments/campaign-detail-summary-reports.test.tsx src/__tests__/app/portal-campaign-detail-publish-gate.test.tsx src/__tests__/app/admin-campaign-detail-page.test.tsx --runInBand`

Expected: PASS.

- [x] **Step 5: Commit the dropdown cycle**

```bash
git add src/src/lib/assessments/summary-reports/registry.ts src/src/components/assessments/CampaignDetail.tsx src/src/__tests__/lib/assessments/summary-reports/registry-and-flags.test.ts src/src/__tests__/components/assessments/campaign-detail-summary-reports.test.tsx
git commit -m "feat: add condensed report dropdown entry"
```

### Task 6: SoT, full verification, visual proof, and review loop

**Files:**
- Modify: `CLAUDE.md`
- Modify: `plans/CHANGELOG.md`
- Modify: `docs/superpowers/specs/2026-08-30-scaling-condensed-ceo-html-design.md` only if implementation evidence changes the contract.
- Modify: `docs/superpowers/plans/2026-08-30-scaling-condensed-ceo-html.md` checkbox state as work completes.

**Interfaces:**
- Consumes: all completed tasks.
- Produces: verified fixed-point diff and PR-ready evidence.

- [x] **Step 1: Update SoT in the same branch**

Prepend a non-launch implementation entry to `plans/CHANGELOG.md`; update the `CLAUDE.md` anchor/prose without claiming merge, deployment, activation, or Production verification.

- [x] **Step 2: Run focused and complete Jest verification**

```bash
PATH="/opt/homebrew/opt/node@20/bin:$PATH" npx jest \
  src/__tests__/lib/assessments/summary-reports/scaling-condensed-ceo-model.test.ts \
  src/__tests__/lib/assessments/summary-reports/scaling-condensed-ceo-snapshot.test.ts \
  src/__tests__/components/assessments/scaling-condensed-ceo-report.test.tsx \
  src/__tests__/app/condensed-ceo-report-route.test.tsx \
  src/__tests__/components/assessments/campaign-detail-summary-reports.test.tsx \
  --runInBand
PATH="/opt/homebrew/opt/node@20/bin:$PATH" npm run test -- --runInBand
```

Expected: all suites pass with zero failures.

- [x] **Step 3: Run migration, lint, and build gates (exact wrapper safely blocked before compilation by absent `DIRECT_URL`; direct Turbopack gate passed)**

```bash
PATH="/opt/homebrew/opt/node@20/bin:$PATH" node scripts/check-migration-safety.mjs
PATH="/opt/homebrew/opt/node@20/bin:$PATH" npx eslint <every changed .ts/.tsx file>
PATH="/opt/homebrew/opt/node@20/bin:$PATH" CI=true npm run build
```

Expected: exit 0 for every command.

- [x] **Step 4: Produce and inspect the local two-page browser PDF**

Use an isolated fixture/dev server and Chromium `page.pdf({landscape:true, printBackground:true})`, then run `pdfinfo`, `pdftotext`, and `pdftoppm`. Require exactly two pages, 61 Q rows with peer labels, no excluded content, and visually inspect both PNGs against Jeff's supplied two-page source.

- [ ] **Step 5: Commit verification/SoT receipts**

```bash
git add CLAUDE.md plans/CHANGELOG.md docs/superpowers/specs/2026-08-30-scaling-condensed-ceo-html-design.md docs/superpowers/plans/2026-08-30-scaling-condensed-ceo-html.md
git commit -m "docs: record condensed CEO implementation"
```

- [ ] **Step 6: Run two-axis fixed-point review and fix findings**

Review `git diff cdafe246...HEAD` against repository standards and the B2 spec in separate passes. For each actionable finding, add a failing regression test when behavior changes, implement the smallest fix, rerun affected checks, commit, and repeat both review axes until clear.

- [ ] **Step 7: Push and open the protected PR**

Push `codex/b2-condensed-ceo-html`, create a PR to `main` with the test/build/visual receipts and explicit no-env/no-Production-data statement, wait for hosted checks, inspect review threads, and continue the review loop. Do not merge.

## Plan self-review

- Spec coverage: every B2 acceptance item maps to Tasks 1-5; gates, visual comparison, SoT, PR, and review loop map to Task 6.
- Placeholder scan: no `TBD`, `TODO`, deferred implementation instruction, or unspecified test body remains.
- Type consistency: the model feeds the snapshot, the snapshot feeds the HTML component/page, and the dropdown targets the page's exact route.
- Scope: Comparison, other report families, saved history UI, wizard changes, server PDF rendering, environment changes, and Production mutations remain excluded.
