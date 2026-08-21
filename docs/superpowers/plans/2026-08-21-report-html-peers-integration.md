# Report HTML and Phase-Aware Peers Integration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Integrate the dark report-content editor with merged phase-aware Peers while preserving generated respondent truth, adding a real full-report preview, and enforcing the 26-page Scaling Up Full layout.

**Architecture:** Merge exact `main` commit `5917d923` into the clean report-authoring branch, then preserve Peers validation as the authoritative generated report path. Keep report HTML as two sanitized version-level regions, but make the Scaling Up Full conclusion compositional rather than replacing the respondent summary. Add an admin-only deterministic preview route that builds representative reports through production scoring/rendering and a bounded sanitizer contract that rejects content likely to escape a fixed physical page.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript, Prisma, Zod, sanitize-html, Jest/Testing Library, Playwright, Poppler (`pdfinfo`, `pdftotext`), Turbopack.

**Spec:** `docs/superpowers/specs/2026-08-21-report-html-peers-integration-design.md`

## Global Constraints

- Base this branch on exact merged Peers commit `5917d923a483ce6e422438f4a35e8d3b46903d65`.
- Preserve phase-aware Peers source/hash/phase/value validation and fail-closed corrupt-report behavior.
- Preserve current/historical plain-language disclosures and omit internal engineering language from respondent-facing output.
- Preserve editable peer averages for non-Scaling-Up assessments and the read-only Scaling Up Full `Peer comparisons` card.
- Authored closing content must never erase the page-25 ScaleUp Score and strongest/focus summary.
- Scaling Up Full remains exactly 26 DOM pages and 26 physical PDF pages for every accepted authoring case.
- Report HTML stays default-off; no environment, publication, lifecycle, campaign, or Production data mutation.
- Implement every behavior test-first and commit each task independently.

---

### Task 1: Integrate exact merged Peers main

**Files:**
- Modify by merge: `CLAUDE.md`
- Modify by merge: `plans/CHANGELOG.md`
- Modify by merge: `src/src/__tests__/lib/assessments/respondent-report.test.ts`
- Modify by merge: `src/src/app/(public)/org-survey/[campaignAlias]/submit/route.ts`
- Modify by merge: `src/src/components/assessments/su-full-landscape/SuFullLandscapeReport.tsx`
- Verify: `src/src/components/admin/template-editor/SettingsTab.tsx`
- Verify: `src/src/__tests__/components/admin/template-editor/settings-tab.test.tsx`
- Verify: `src/src/__tests__/components/assessments/su-full-landscape-report.test.tsx`

**Interfaces:**
- Consumes: Peers merge `5917d923`, `buildSuFullPeerDisclosureModel`, `SuFullLandscapeReportModel.peerProvenance`, `buildSuFullPeerPresentation`, `SafeReportHtmlFragment`.
- Produces: one conflict-free branch containing both the committed report-HTML authoring work and the exact merged Peers contracts for Tasks 2–4.

- [ ] **Step 1: Record the pre-merge baseline and merge exact main**

Run:

```bash
git rev-parse HEAD
git merge --no-ff 5917d923a483ce6e422438f4a35e8d3b46903d65
```

Expected: conflicts only in the files identified by the preflight merge-tree receipt; do not abort the merge.

- [ ] **Step 2: Resolve generated-report conflicts in favor of both contracts**

Resolve `SuFullLandscapeReport.tsx` so it retains:

```tsx
import { buildSuFullPeerDisclosureModel } from "@/lib/assessments/su-full-peer-disclosure";
import { ReportHtmlSection } from "@/components/assessments/ReportHtmlSection";
import type { SafeReportHtmlFragment } from "@/lib/assessments/report-html";
```

Keep `PeerSnapshotDisclosure`, `peerProvenance` on every detail page, `.su-full-landscape-feedback` without a `Frozen feedback` heading, and the existing report-HTML page seams. Do not restore the old mutable `PEER_DISCLOSURE` or `benchmarkUpdatedAt` copy.

- [ ] **Step 3: Resolve submission and report-loading conflicts without weakening Peers**

In the submit route, preserve both:

```ts
computeScoreResult(versionParsed.data, scoredQuestions, rawAnswers, {
  recommendationPhase: phase.number,
});
```

and the report-HTML snapshot fields already threaded into the stored result/report. Preserve the 61-row peer completeness checks, invited duplicate 409 behavior, and the existing version-level report HTML load.

- [ ] **Step 4: Resolve Settings and documentation truthfully**

Keep the Scaling Up Full read-only card:

```tsx
<h2 className="wf-card-title">Peer comparisons</h2>
<p>Peer comparisons for Scaling Up Full are selected automatically for each report based on the phase shown in that report.</p>
```

Merge both top changelog entries without rewriting historical evidence. Update the current report-HTML entry only where its pre-Peers claims are stale.

- [ ] **Step 5: Run the integration-focused test gate**

Run from `src/`:

```bash
./node_modules/.bin/jest \
  src/__tests__/components/admin/template-editor/settings-tab.test.tsx \
  src/__tests__/components/assessments/su-full-landscape-report.test.tsx \
  src/__tests__/lib/assessments/su-full-peer-presentation.test.ts \
  src/__tests__/lib/assessments/respondent-report.test.ts \
  src/__tests__/app/org-survey/submit.test.ts \
  --runInBand
```

Expected: all suites pass with Scaling Up Full Q01 at 6.6 for Phase 4 and no editable Scaling Up Full peer averages.

- [ ] **Step 6: Commit the merge resolution**

```bash
git add -- \
  CLAUDE.md \
  plans/CHANGELOG.md \
  src/src/__tests__/lib/assessments/respondent-report.test.ts \
  'src/src/app/(public)/org-survey/[campaignAlias]/submit/route.ts' \
  src/src/components/assessments/su-full-landscape/SuFullLandscapeReport.tsx
git commit
```

Expected: a merge commit whose second parent is `5917d923`.

---

### Task 2: Protect the conclusion and enforce fixed-page authoring limits

**Files:**
- Modify: `src/src/lib/assessments/report-html-sanitizer.ts`
- Modify: `src/src/lib/assessments/report-html.ts`
- Modify: `src/src/components/admin/template-editor/ReportsTab.tsx`
- Modify: `src/src/components/assessments/su-full-landscape/SuFullLandscapeReport.tsx`
- Modify: `src/src/styles/su-report.css`
- Test: `src/src/__tests__/lib/assessments/report-html-sanitizer.test.ts`
- Test: `src/src/__tests__/lib/assessments/report-html.test.ts`
- Test: `src/src/__tests__/components/admin/template-editor/ReportsTab.test.tsx`
- Test: `src/src/__tests__/components/assessments/su-full-landscape-report.test.tsx`

**Interfaces:**
- Consumes: `SafeReportHtmlFragment`, `prepareReportHtmlForStorage`, `ReportHtmlSection`, `SuFullLandscapeReport` and merged Peers model from Task 1.
- Produces: `REPORT_HTML_LIMITS`, position-aware `sanitizeReportHtmlFragment(raw, position)`, protected page-25 composition, and exact admin copy used by Task 3.

- [ ] **Step 1: Write failing conclusion and copy tests**

Add a Scaling Up Full test with custom closing content and assert page 25 contains all of:

```ts
expect(page25).toHaveTextContent("ScaleUp Score");
expect(page25).toHaveTextContent("55 / 100");
expect(page25).toHaveTextContent("Your strongest chapter is");
expect(page25).toHaveTextContent("Your focus chapter is");
expect(page25).toHaveTextContent("Custom closing message");
expect(page25).not.toHaveTextContent("Choose one priority from the feedback");
```

Update Reports-tab tests to demand the exact approved copy from the spec and reject the old `Add HTML before and after` wording.

- [ ] **Step 2: Write failing guardrail tests**

Export and pin:

```ts
export const REPORT_HTML_LIMITS = {
  introduction: { rawCharacters: 12_000, textCharacters: 2_200, elements: 64, depth: 8, images: 1, tables: 1, tableRows: 8 },
  conclusion: { rawCharacters: 12_000, textCharacters: 900, elements: 36, depth: 6, images: 1, tables: 1, tableRows: 6 },
} as const;
```

Add one over-limit test per dimension and position. Add CSS sanitizer cases that prove negative lengths, viewport units, explicit dimensions, grid, flex, and image width/height attributes are removed while headings, links, lists, one image, and one bounded table survive.

- [ ] **Step 3: Run RED**

```bash
./node_modules/.bin/jest \
  src/__tests__/lib/assessments/report-html-sanitizer.test.ts \
  src/__tests__/lib/assessments/report-html.test.ts \
  src/__tests__/components/admin/template-editor/ReportsTab.test.tsx \
  src/__tests__/components/assessments/su-full-landscape-report.test.tsx \
  --runInBand
```

Expected: failures for replace-all conclusion behavior, 100,000-character UI/server limits, and unbounded structure/style acceptance.

- [ ] **Step 4: Implement position-aware sanitizer limits**

Change the sanitizer signature to:

```ts
export function sanitizeReportHtmlFragment(
  raw: string,
  position: "introduction" | "conclusion",
): SanitizeReportHtmlResult;
```

After allowlist sanitization, tokenize sanitized start/end tags to calculate element count, maximum stack depth, image count, table count, and row count. Calculate visible text with a tag-free sanitize pass and collapsed whitespace. Return `ok: false`, empty `html`, and a field-appropriate plain-language `issue` when any limit is exceeded. Update storage/load callers to pass the matching position.

- [ ] **Step 5: Narrow layout styles and component limits**

Replace the length regex with non-negative, non-viewport units. Remove authored dimension styles and grid/flex display. Remove image `width` and `height` attributes. Set both textareas to:

```tsx
maxLength={REPORT_HTML_LIMITS[position].rawCharacters}
```

and render the matching 12,000 counter.

- [ ] **Step 6: Compose page 25 instead of replacing it**

Render page 25 in this order:

```tsx
{beforeConclusion}
<h2>Conclusion</h2>
<p><strong>ScaleUp Score</strong> {scaleUpScore(model.scaleUpScore)}</p>
<p>Your strongest chapter is {model.strongestChapter.label}; your focus chapter is {model.weakestChapter.label}.</p>
{report.reportHtml?.conclusionHtml ? (
  <ReportHtmlSection position="conclusion" html={report.reportHtml.conclusionHtml} />
) : (
  <DefaultNextSteps report={report} contactEmail={contactEmail} />
)}
```

Keep Welcome replacement on page 2. Add a landscape-specific custom-content class that removes the generic nested 44px/48px padding while retaining overflow wrapping and image containment.

- [ ] **Step 7: Run GREEN and lint**

Run the RED command again, then:

```bash
./node_modules/.bin/eslint -- \
  src/lib/assessments/report-html-sanitizer.ts \
  src/lib/assessments/report-html.ts \
  src/components/admin/template-editor/ReportsTab.tsx \
  src/components/assessments/su-full-landscape/SuFullLandscapeReport.tsx
```

Expected: all focused tests and ESLint pass.

- [ ] **Step 8: Commit**

```bash
git add -- \
  src/src/lib/assessments/report-html-sanitizer.ts \
  src/src/lib/assessments/report-html.ts \
  src/src/components/admin/template-editor/ReportsTab.tsx \
  src/src/components/assessments/su-full-landscape/SuFullLandscapeReport.tsx \
  src/src/styles/su-report.css \
  src/src/__tests__/lib/assessments/report-html-sanitizer.test.ts \
  src/src/__tests__/lib/assessments/report-html.test.ts \
  src/src/__tests__/components/admin/template-editor/ReportsTab.test.tsx \
  src/src/__tests__/components/assessments/su-full-landscape-report.test.tsx
git commit -m "fix: protect authored report boundaries"
```

---

### Task 3: Replace fragment previews with the exact full report

**Files:**
- Create: `src/src/lib/assessments/report-html-preview.ts`
- Create: `src/src/app/(dashboard)/admin/assessments/templates/[id]/versions/[versionId]/preview-report/page.tsx`
- Create: `src/src/__tests__/lib/assessments/report-html-preview.test.ts`
- Create: `src/src/__tests__/app/report-html-preview-page.test.tsx`
- Modify: `src/src/components/admin/template-editor/ReportsTab.tsx`
- Modify: `src/src/components/admin/template-editor/TabbedShell.tsx`
- Modify: `src/src/__tests__/components/admin/template-editor/ReportsTab.test.tsx`
- Modify: `src/src/__tests__/components/admin/template-editor/tabbed-shell-panels.wave-ed10.test.tsx`

**Interfaces:**
- Consumes: saved `SafeReportHtml`, `TemplateVersionForScoringSchema`, `computeScoreResult`, `buildSuFullPeerPresentation`, existing deterministic `buildReportStylePreviewReport`, `BrandedReport`, and Task 2 copy/limits.
- Produces: `buildReportHtmlPreviewReport(input)` and the admin-only full preview URL consumed by `ReportsTab`.

- [ ] **Step 1: Write failing preview-model tests**

Define:

```ts
export interface ReportHtmlPreviewInput {
  template: { id: string; alias: string; name: string };
  version: { id: string; questions: unknown; sections: unknown; scoringConfig: unknown; reportConfig: unknown };
  peerReference: "current" | "historical";
}

export function buildReportHtmlPreviewReport(
  input: ReportHtmlPreviewInput,
): RespondentReport;
```

Tests must prove the Scaling Up Full current model contains 61 scored rows, recommendation phase 4, complete peer snapshot/values, `Phase 4 · Delegation`, and saved safe report HTML. Historical must omit the snapshot and all peer row fields, build the historical presentation, and expose `Historical benchmark`. Both use synthetic identities and never accept a submission/campaign/respondent input.

- [ ] **Step 2: Write failing route authorization and ownership tests**

Mock `requireAdmin` and `db.assessmentTemplate.findUnique`. Assert authorization happens before the query, mismatched version ownership calls `notFound`, and a valid version renders `BrandedReport` with the exact saved report content. Assert `peerReference=historical` is ignored for non-Scaling-Up templates.

- [ ] **Step 3: Write failing editor tests**

Demand one `Full report preview` card, no `report-html-preview-introduction` or `report-html-preview-conclusion`, a current preview link, a historical Scaling Up Full link, and disabled links plus the exact dirty helper while unsaved changes exist.

- [ ] **Step 4: Run RED**

```bash
./node_modules/.bin/jest \
  src/__tests__/lib/assessments/report-html-preview.test.ts \
  src/__tests__/app/report-html-preview-page.test.tsx \
  src/__tests__/components/admin/template-editor/ReportsTab.test.tsx \
  src/__tests__/components/admin/template-editor/tabbed-shell-panels.wave-ed10.test.tsx \
  --runInBand
```

Expected: missing model/route, fragment previews still present, and missing preview URLs/dirty behavior.

- [ ] **Step 5: Build representative reports through production scoring**

Validate the stored scoring shape with `TemplateVersionForScoringSchema`. Create deterministic answers for every stored question, using 12 for `Q_FTE_CONTRACT`, an in-range deterministic value for every slider, the first option for multiple choice, and a short synthetic answer for required text. Call:

```ts
computeScoreResult(parsed.data, parsed.data.questions, answers, {
  allowMissingRequired: true,
  recommendationPhase: 4,
});
```

For historical Scaling Up Full, clone the result without `peerBenchmarkSnapshot` and without `peerValue` on every row. Build `suFullPeerPresentation` from the completed report. For other aliases, reuse `buildReportStylePreviewReport("scored", "normal")` and replace only identity, exact saved report HTML, and requested template name/alias.

- [ ] **Step 6: Implement the admin-only route**

Fetch only the requested template/version fields after `requireAdmin()`. Apply `loadSafeReportHtml(version.reportConfig)`, call `buildReportHtmlPreviewReport`, and render the full `BrandedReport` inside `ReportStyleScope` with the production report styles imported. Add a `data-testid="report-html-full-preview"` root and a `data-print-hidden` banner that identifies representative content without entering PDF output.

- [ ] **Step 7: Replace fragment previews in the Reports tab**

Pass these props from `TabbedShell`:

```tsx
previewHref={`/admin/assessments/templates/${template.id}/versions/${version.id}/preview-report`}
historicalPreviewHref={template.alias === "scaling-up-full" ? `${previewHref}?peerReference=historical` : null}
previewDisabled={Boolean(dirtyFlags.reportConfig)}
```

Remove `previewValue` and the two isolated `ReportHtmlSection` preview boxes. Keep editing fields and the generated-report protection card.

- [ ] **Step 8: Run GREEN, lint, and commit**

Run the RED command again, ESLint every changed TS/TSX file, then:

```bash
git add -- \
  src/src/lib/assessments/report-html-preview.ts \
  'src/src/app/(dashboard)/admin/assessments/templates/[id]/versions/[versionId]/preview-report/page.tsx' \
  src/src/components/admin/template-editor/ReportsTab.tsx \
  src/src/components/admin/template-editor/TabbedShell.tsx \
  src/src/__tests__/lib/assessments/report-html-preview.test.ts \
  src/src/__tests__/app/report-html-preview-page.test.tsx \
  src/src/__tests__/components/admin/template-editor/ReportsTab.test.tsx \
  src/src/__tests__/components/admin/template-editor/tabbed-shell-panels.wave-ed10.test.tsx
git commit -m "feat: preview the complete authored report"
```

---

### Task 4: Prove the combined report visually and close pre-PR gates

**Files:**
- Modify: `src/src/__tests__/components/assessments/su-full-landscape-browser.test.tsx`
- Create: `src/scripts/capture-report-html-peers-previews.tsx`
- Create: `src/src/__tests__/scripts/capture-report-html-peers-previews.test.ts`
- Modify: `src/output/report-html-authoring/README.md` or replace it with the final combined receipt
- Modify: `plans/CHANGELOG.md`
- Modify: `CLAUDE.md`

**Interfaces:**
- Consumes: Tasks 1–3 exact renderer, authoring limits, current/historical report preview model, and full-report route/UI contract.
- Produces: the ten-case visual/PDF matrix, durable verification receipt, final clean branch, and PR-ready evidence.

- [ ] **Step 1: Write the browser/PDF matrix before changing capture code**

Define five authoring cases (`default`, `welcome-only`, `closing-only`, `both`, `long`) crossed with `current` and `historical`. The long case contains 2,100 visible Welcome characters and 850 visible Closing characters, below the 2,200/900 limits. For every case assert:

```ts
expect(await page.locator("[data-testid^='su-full-landscape-page-']").count()).toBe(26);
expect(pdfinfo).toMatch(/^Pages:\s+26$/m);
expect(horizontalOverflow.offenders).toEqual([]);
expect(authoredContentOutsidePhysicalPage).toEqual([]);
```

Also assert current contains `Phase 4 · Delegation`, historical contains `Historical benchmark`, page 25 always retains `55 / 100` and strongest/focus copy, and output rejects internal engineering terms.

- [ ] **Step 2: Run the focused matrix RED or mutation proof**

Use `apply_patch` to change only `REPORT_HTML_LIMITS.conclusion.textCharacters` from `900` to `800`, run the matrix, and record the expected long-current and long-historical failures. Use `apply_patch` immediately afterward to restore `900`; never use a destructive checkout/reset command.

- [ ] **Step 3: Implement the capture script**

Use the same ten fixtures and exact production markup/CSS. Save desktop page-2/page-25 screenshots, mobile page-2/page-25 screenshots, and full PDFs under `src/output/report-html-peers-integration/`. Clean only that task-owned output directory before recapture; leave all sibling output untouched.

- [ ] **Step 4: Run and visually inspect all artifacts**

Run:

```bash
REPORT_HTML_PEERS_VISUAL_ARTIFACTS=1 ./node_modules/.bin/jest src/__tests__/components/assessments/su-full-landscape-browser.test.tsx --runInBand
./node_modules/.bin/tsx scripts/capture-report-html-peers-previews.tsx
```

Inspect at least default/current, both/current, long/current, both/historical, and long/historical desktop, mobile, page-25, and PDF artifacts. Record exact paths and any ruling in the report.

- [ ] **Step 5: Run focused integration suites**

Run every changed test file plus the Peers Task 7 matrix and all report-HTML authoring suites. Expected: zero failures and zero snapshots changed unless explicitly reviewed.

- [ ] **Step 6: Run final repository gates**

From `src/`:

```bash
./node_modules/.bin/jest --runInBand
npm run generate:scaling-up-full-phase-peers
git diff --exit-code -- src/lib/assessments/su-full-phase-peer-catalogue.ts
node scripts/check-migration-safety.mjs
CI=true ./node_modules/.bin/next build --turbopack
```

Run changed-path ESLint with the exact zsh expansion:

```zsh
typeset -a report_paths report_rel_paths
report_paths=("${(@f)$(git -C .. diff --name-only 5917d923a483ce6e422438f4a35e8d3b46903d65...HEAD -- 'src/**/*.ts' 'src/**/*.tsx')}")
for report_path in "${report_paths[@]}"; do
  report_rel_paths+=("${report_path#src/}")
done
./node_modules/.bin/eslint -- "${report_rel_paths[@]}"
```

From the repository root:

```bash
git diff --check
```

Also run `src/__tests__/lint/changelog-freshness.test.ts` after documentation changes.

- [ ] **Step 7: Update durable evidence and commit**

Update the top report-HTML changelog entry with exact test/build/page counts, the combined visual matrix, full-preview behavior, page-25 protection, and guardrail limits. Update the `CLAUDE.md` freshness anchor/prose without exceeding its word budget.

```bash
git add -- \
  CLAUDE.md \
  plans/CHANGELOG.md \
  docs/superpowers/specs/2026-08-21-report-html-peers-integration-design.md \
  docs/superpowers/plans/2026-08-21-report-html-peers-integration.md \
  src/scripts/capture-report-html-peers-previews.tsx \
  src/src/__tests__/scripts/capture-report-html-peers-previews.test.ts \
  src/src/__tests__/components/assessments/su-full-landscape-browser.test.tsx
git commit -m "docs: verify report authoring with phase peers"
```

- [ ] **Step 8: Run final whole-branch review and prepare the separate PR**

Generate the complete merge-base-to-HEAD review package, dispatch the final standards/spec reviewer, address its one allowed fix wave, and re-run the affected gates. The branch may be pushed and a separate draft PR opened only after the review is clean. Do not activate the report-HTML feature or publish any assessment version.
