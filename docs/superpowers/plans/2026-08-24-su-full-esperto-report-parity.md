# Scaling Up Full Jeff-Directed Cosmetic Parity Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Apply only Jeff's recording-backed cosmetic requests to the Scaling Up Full landscape report, copying the ESPERTO TOC and Profile, populating available report facts, and preserving all existing assessment logic.

**Architecture:** Reuse the current report model, renderer, page shell, charts, recommendation text, and scoped CSS. Make only the minimum page-sequence, markup, copy, and styling changes required by the directive matrix; do not introduce a new report framework or visual system. Deliver through one isolated branch and one PR, then squash-merge it as one production commit.

**Tech Stack:** TypeScript, React, Next.js, Jest/Testing Library, scoped CSS, existing server/browser PDF capture, Prisma migration safety gate.

**Spec:** `docs/superpowers/specs/2026-08-24-su-full-esperto-report-parity-design.md`

**Execution status:** Implemented and visually approved on 2026-08-25; awaiting the user-selected branch integration path.

## Global Constraints

- Execute from a clean worktree based on latest `origin/main`; the current checkout contains unrelated work.
- Use worktree path `/tmp/su-full-esperto-cosmetic-parity`; run Jest/ESLint/build commands from its `src/` app root and Git commands from the worktree root.
- Branch name: `codex/su-full-esperto-cosmetic-parity`.
- The local August 24 video is authoritative for speaker attribution and screen context.
- Only the TOC and Your Profile receive literal ESPERTO-copy treatment.
- Introduction, chapter openers, detail pages, and Conclusion follow their separate directive-matrix instructions.
- Use **ESPERTO**, never the Fathom transcription variants.
- Do not modify questions, schema, migrations, scoring, growth-phase boundaries, peer vectors, or recommendation selection.
- Preserve `question.recommendation` output exactly for the same frozen fixture.
- Preserve the current cover, pinned authored preface, pinned authored CTA, and Appendix A data.
- No new compass, card system, storyboard, findings engine, report framework, feature flag, or dependency.
- No feature-code edit or commit until the corrected side-by-side visual gate has explicit user approval.
- Use task-level commits for review, then squash-merge the single PR into one production commit.
- Do not push, open a PR, merge, or deploy without user authorization.

## File Map

**Primary implementation:**

- `src/src/lib/assessments/su-full-landscape-report.ts` - current page sequence and frozen report presentation model
- `src/src/components/assessments/su-full-landscape/SuFullLandscapeReport.tsx` - cover, preface, TOC, Introduction, Profile, openers, details, Conclusion, Appendix dispatch
- `src/src/components/assessments/su-full-landscape/SuFullLandscapeCharts.tsx` - existing You/Peers chart markup
- `src/src/styles/su-report.css` - report-scoped print/browser styling and domain tokens

**Tests and capture contracts:**

- `src/src/__tests__/lib/assessments/su-full-landscape-report.test.ts`
- `src/src/__tests__/components/assessments/su-full-landscape-report.test.tsx`
- `src/src/__tests__/components/assessments/su-full-landscape-browser.test.tsx`
- `src/src/__tests__/components/assessments/su-full-peer-render.test.tsx`
- `src/scripts/capture-su-full-landscape-report.tsx`
- `src/scripts/capture-report-html-peers-previews.tsx`
- `src/src/__tests__/scripts/capture-su-full-landscape-report.test.ts`
- `src/src/__tests__/scripts/capture-report-html-peers-previews.test.ts`

**No new production file is planned.** Keep copy constants and small presentation calculations in the existing report component unless the file cannot pass lint/readability review.

---

### Task 0: Corrected side-by-side visual gate

**Files:**

- Read: August 24 recording, Fathom transcript, ESPERTO PDF, brand guide
- Generate outside tracked code: `src/output/su-full-esperto-cosmetic-parity/mockups/`
- Do not modify: production source files

**Interfaces:**

- Consumes: the recording-backed directive matrix in the spec
- Produces: explicit user approval or a concrete list of visual corrections

- [ ] **Step 1: Confirm the rejected mock is excluded**

Record in the mock review note that `output/pdf/su-full-esperto-visual-direction/Scaling-Up-Full-Visual-Mockups.pdf` is rejected and is not a source.

- [ ] **Step 2: Build the TOC comparison**

Place ESPERTO page 3 on the left. On the right, reproduce its hierarchy, indentation, five-domain graphic, colors, and page-number alignment with the current report labels/numbers. Do not reinterpret the circular graphic.

- [ ] **Step 3: Build the Profile comparison**

Place ESPERTO page 5 on the left. On the right, reproduce its grouped colored table and right-side commentary placement using a real authorized Scaling Up Full fixture.

- [ ] **Step 4: Build the non-copy comparisons**

Create four additional pairs:

1. ESPERTO page 4 versus an Introduction populated only with allowed fields.
2. ESPERTO page 7 versus a People opener with the source text block and current chart.
3. ESPERTO page 8 versus an existing `question.recommendation` in matching orange/dark-orange treatment.
4. ESPERTO page 25 versus result-populated Conclusion text followed by the existing authored CTA.

- [ ] **Step 5: Label copy boundaries**

Add one label beneath each pair:

- `COPY DIRECTIVE` for TOC and Profile only.
- `POPULATE FROM EXISTING REPORT DATA` for Introduction and Conclusion.
- `ADD SOURCE TEXT + BRAND COLOR` for the opener.
- `PRESERVE DYNAMIC TEXT; RESTYLE ONLY` for the detail page.

- [ ] **Step 6: Present and wait**

Present the six comparison pairs in one review. Do not begin Task 1 until the user explicitly approves them.

Expected: the user can see that no broad overhaul or invented design language remains.

---

### Task 1: Remove only the rejected pages and renumber truthfully

**Files:**

- Modify: `src/src/lib/assessments/su-full-landscape-report.ts`
- Modify: `src/src/components/assessments/su-full-landscape/SuFullLandscapeReport.tsx`
- Test: `src/src/__tests__/lib/assessments/su-full-landscape-report.test.ts`
- Test: `src/src/__tests__/components/assessments/su-full-landscape-report.test.tsx`

**Interfaces:**

- Consumes: `RespondentReport.reportHtml?.introductionHtml`
- Produces: a sequential `SuFullLandscapePage[]` with no `peer-dashboard` kind

- [ ] **Step 1: Create the implementation worktree**

Read `superpowers:using-git-worktrees`, fetch `origin`, and create `/tmp/su-full-esperto-cosmetic-parity` on `codex/su-full-esperto-cosmetic-parity` from latest `origin/main`. Re-read `AGENTS.md`, `CONTEXT.md`, newest four changelog entries, and the approved spec.

- [ ] **Step 2: Write failing page-sequence tests**

Add assertions through `buildSuFullLandscapeReportModel`:

```ts
expect(authoredModel.pages).toHaveLength(25);
expect(authoredModel.pages.map((page) => page.number)).toEqual(
  Array.from({ length: 25 }, (_, index) => index + 1),
);
expect(authoredModel.pages.some((page) => page.kind === "preface")).toBe(true);
expect(authoredModel.pages.map((page) => page.kind)).not.toContain("peer-dashboard");

expect(noPrefaceModel.pages).toHaveLength(24);
expect(noPrefaceModel.pages.map((page) => page.number)).toEqual(
  Array.from({ length: 24 }, (_, index) => index + 1),
);
expect(noPrefaceModel.pages.some((page) => page.kind === "preface")).toBe(false);
```

- [ ] **Step 3: Run the model test and observe failure**

Run:

```bash
cd /tmp/su-full-esperto-cosmetic-parity/src
npx jest src/__tests__/lib/assessments/su-full-landscape-report.test.ts --runInBand
```

Expected: FAIL because the current model always emits 26 pages and includes `peer-dashboard`.

- [ ] **Step 4: Implement the minimum page-list change**

Replace the fixed page array with one local content-aware function. Remove `peer-dashboard` from the union and assign numbers after optional-preface filtering:

```ts
type SuFullLandscapePageContent =
  | Readonly<{ kind: "cover" | "preface" | "contents" | "introduction" | "profile" | "conclusion" }>
  | Readonly<{ kind: "chapter"; chapterKey: SuFullLandscapeChapterKey }>
  | Readonly<{ kind: "detail"; chapterKey: SuFullLandscapeChapterKey; questionKeys: readonly string[] }>
  | Readonly<{ kind: "appendix" }>;

export type SuFullLandscapePage = SuFullLandscapePageContent & Readonly<{ number: number }>;

function pages(hasAuthoredPreface: boolean): readonly SuFullLandscapePage[] {
  const logicalPages: SuFullLandscapePageContent[] = [
    { kind: "cover" },
    ...(hasAuthoredPreface ? [{ kind: "preface" } as const] : []),
    { kind: "contents" },
    { kind: "introduction" },
    { kind: "profile" },
    // Existing chapter/detail groups in their current order.
    { kind: "conclusion" },
    { kind: "appendix" },
  ];

  return logicalPages.map((page, index) => ({ ...page, number: index + 1 }));
}
```

Call it with `Boolean(report.reportHtml?.introductionHtml)` from model construction. Keep the existing chapter/detail grouping exactly.

- [ ] **Step 5: Remove renderer fallbacks**

Delete `PrefacePage`, `PeerDashboardPage`, and the `peer-dashboard` switch case. Keep `CustomHtmlPage` unchanged for a real authored preface.

- [ ] **Step 6: Add renderer assertions**

```ts
expect(screen.queryByRole("heading", { name: "Welcome" })).not.toBeInTheDocument();
expect(screen.queryByRole("heading", { name: "Peers and comparisons" })).not.toBeInTheDocument();
expect(screen.getByLabelText("Verne Harnish preface")).toBeInTheDocument();
```

Use the existing Edition 6 marker from the fixture rather than inventing a production marker.

- [ ] **Step 7: Run both suites**

```bash
npx jest \
  src/__tests__/lib/assessments/su-full-landscape-report.test.ts \
  src/__tests__/components/assessments/su-full-landscape-report.test.tsx \
  --runInBand
```

Expected: PASS with 25 authored pages, 24 null-preface pages, and no removed surfaces.

- [ ] **Step 8: Commit**

```bash
cd /tmp/su-full-esperto-cosmetic-parity
git add src/src/lib/assessments/su-full-landscape-report.ts \
  src/src/components/assessments/su-full-landscape/SuFullLandscapeReport.tsx \
  src/src/__tests__/lib/assessments/su-full-landscape-report.test.ts \
  src/src/__tests__/components/assessments/su-full-landscape-report.test.tsx
git commit -m "fix(report): remove rejected Scaling Up Full pages"
```

---

### Task 2: Copy the ESPERTO TOC and Your Profile only

**Files:**

- Modify: `src/src/components/assessments/su-full-landscape/SuFullLandscapeReport.tsx`
- Modify: `src/src/styles/su-report.css`
- Test: `src/src/__tests__/components/assessments/su-full-landscape-report.test.tsx`

**Interfaces:**

- Consumes: `model.pages`, `model.chapters`, `model.profileRows`, `model.strongestChapter`, `model.weakestChapter`
- Produces: TOC and Profile markup matching ESPERTO pages 3 and 5

- [ ] **Step 1: Write failing TOC structure tests**

Require the exact hierarchy Jeff reviewed:

```ts
const contents = screen.getByRole("region", { name: "Table of contents" });
expect(within(contents).getByText("Introduction")).toBeInTheDocument();
expect(within(contents).getByText("Your Profile")).toBeInTheDocument();
expect(within(contents).getByText("People")).toHaveClass("su-full-toc-domain--people");
expect(within(contents).getByText("Your Employees")).toHaveClass("su-full-toc-subsection");
expect(within(contents).getByLabelText("Five Scaling Up decisions")).toBeInTheDocument();
```

Also assert that displayed page numbers agree with `model.pages`; do not retain old 26-page literals.

- [ ] **Step 2: Write failing Profile structure tests**

```ts
const profile = screen.getByRole("region", { name: "Your profile" });
expect(within(profile).getByTestId("profile-domain-people")).toHaveClass("is-people");
expect(within(profile).getByTestId("profile-result-commentary")).toHaveTextContent(
  model.strongestChapter.label,
);
expect(within(profile).getByTestId("profile-result-commentary")).toHaveTextContent(
  model.weakestChapter.label,
);
```

- [ ] **Step 3: Run the renderer test and observe failure**

```bash
npx jest src/__tests__/components/assessments/su-full-landscape-report.test.tsx --runInBand
```

Expected: FAIL because current TOC/Profile are plain tables/lists without copied ESPERTO composition.

- [ ] **Step 4: Implement the copied TOC composition**

Recreate ESPERTO page 3 inside `ContentsPage`:

- Introduction and Your Profile first
- Five numbered domain groups
- Indented subsection labels beneath each domain
- Conclusion and Appendix last
- Source-like five-decision circular graphic recreated as inline semantic SVG
- Page numbers looked up from `model.pages`

Pass `model` into `ContentsPage`. Use an inline SVG labelled `Five Scaling Up decisions`; do not introduce a reusable visualization framework.

- [ ] **Step 5: Implement the copied Profile composition**

Keep current score values but reproduce ESPERTO page 5:

- Colored grouped table at left
- You, Peers, and deviation columns
- Result commentary at right

Build commentary directly from existing model values:

```ts
const strongestRelative = [...model.profileRows]
  .sort((a, b) => b.deviation - a.deviation || a.stableKey.localeCompare(b.stableKey))[0];
const weakestRelative = [...model.profileRows]
  .sort((a, b) => a.deviation - b.deviation || a.stableKey.localeCompare(b.stableKey))[0];
```

Render neutral sentences naming strongest/focus chapter and the two relative subsections. Do not infer readiness or business quality.

- [ ] **Step 6: Add only source-faithful CSS**

Reproduce ESPERTO alignment, indentation, colored group bands, table density, and right commentary column using existing domain variables. Do not add cards, gradients, a new compass, or unrelated decoration.

- [ ] **Step 7: Run the renderer test**

```bash
npx jest src/__tests__/components/assessments/su-full-landscape-report.test.tsx --runInBand
```

Expected: PASS with source-faithful TOC/Profile structure and live values.

- [ ] **Step 8: Commit**

```bash
cd /tmp/su-full-esperto-cosmetic-parity
git add src/src/components/assessments/su-full-landscape/SuFullLandscapeReport.tsx \
  src/src/styles/su-report.css \
  src/src/__tests__/components/assessments/su-full-landscape-report.test.tsx
git commit -m "feat(report): copy ESPERTO contents and profile layouts"
```

---

### Task 3: Populate Introduction and add the requested opener text

**Files:**

- Modify: `src/src/components/assessments/su-full-landscape/SuFullLandscapeReport.tsx`
- Modify: `src/src/styles/su-report.css`
- Test: `src/src/__tests__/components/assessments/su-full-landscape-report.test.tsx`

**Interfaces:**

- Consumes: `RespondentReport`, `model.growthPhase`, `model.scaleUpScore`, existing peer provenance, chapter questions
- Produces: available-data Introduction and five source-text chapter openers

- [ ] **Step 1: Write failing Introduction tests**

Use fixtures with and without optional freelance data:

```ts
expect(screen.getByText(report.respondentName, { exact: false })).toBeInTheDocument();
expect(screen.getByText(report.companyName, { exact: false })).toBeInTheDocument();
expect(screen.getByText(/56 full-time equivalent/i)).toBeInTheDocument();
expect(screen.getByText(/9 freelance/i)).toBeInTheDocument();
expect(screen.getByText(/Phase 3/i)).toBeInTheDocument();
expect(screen.getByText(/ScaleUp Score.*73/i)).toBeInTheDocument();
```

For the missing-data fixture:

```ts
expect(screen.queryByText(/undefined|null|not provided/i)).not.toBeInTheDocument();
expect(screen.queryByText(/years old|entrepreneur for|partners|international revenue/i)).not.toBeInTheDocument();
```

- [ ] **Step 2: Write failing opener tests**

```ts
for (const label of ["People", "Strategy", "Execution", "Cash", "You"]) {
  expect(screen.getByTestId(`chapter-narrative-${label.toLowerCase()}`)).not.toBeEmptyDOMElement();
}
expect(screen.queryByText(/years experience as an entrepreneur/i)).not.toBeInTheDocument();
expect(screen.queryByText(/partner\(s\)/i)).not.toBeInTheDocument();
```

- [ ] **Step 3: Run the renderer test and observe failure**

```bash
npx jest src/__tests__/components/assessments/su-full-landscape-report.test.tsx --runInBand
```

Expected: FAIL because the current Introduction and opener copy are abbreviated.

- [ ] **Step 4: Add one generic raw-number reader**

Replace the single-purpose FTE reader with a minimal function used only for the two existing background keys:

```ts
function rawNumberAnswer(rawAnswers: unknown, stableKey: "Q_FTE_CONTRACT" | "Q_FREELANCE"): number | null {
  if (!Array.isArray(rawAnswers)) return null;
  const answer = rawAnswers.find(
    (candidate) => candidate !== null
      && typeof candidate === "object"
      && (candidate as Record<string, unknown>).stableKey === stableKey,
  ) as Record<string, unknown> | undefined;
  return answer && typeof answer.value === "number" && Number.isFinite(answer.value)
    ? answer.value
    : null;
}
```

- [ ] **Step 5: Populate the Introduction**

Use the allowed six-part sequence in the spec. Conditionally render the freelance sentence. Use `GROWTH_PHASE_NARRATIVES` already represented by `model.growthPhase`; do not recompute phase or reproduce ESPERTO formula claims.

- [ ] **Step 6: Extract the exact source opener blocks**

Run these read-only commands against the supplied ESPERTO PDF:

```bash
pdftotext -f 7 -l 7 -layout '/Users/diushianstand/Scaling-up-platform-v2/From Jeff/APP_scaling up assessemnt/APP_scaling up assessemnt/ScalingUp_report_John CEOExec_2026-05-01T08_13_18-04_00.pdf' -
pdftotext -f 11 -l 11 -layout '/Users/diushianstand/Scaling-up-platform-v2/From Jeff/APP_scaling up assessemnt/APP_scaling up assessemnt/ScalingUp_report_John CEOExec_2026-05-01T08_13_18-04_00.pdf' -
pdftotext -f 14 -l 14 -layout '/Users/diushianstand/Scaling-up-platform-v2/From Jeff/APP_scaling up assessemnt/APP_scaling up assessemnt/ScalingUp_report_John CEOExec_2026-05-01T08_13_18-04_00.pdf' -
pdftotext -f 19 -l 19 -layout '/Users/diushianstand/Scaling-up-platform-v2/From Jeff/APP_scaling up assessemnt/APP_scaling up assessemnt/ScalingUp_report_John CEOExec_2026-05-01T08_13_18-04_00.pdf' -
pdftotext -f 21 -l 21 -layout '/Users/diushianstand/Scaling-up-platform-v2/From Jeff/APP_scaling up assessemnt/APP_scaling up assessemnt/ScalingUp_report_John CEOExec_2026-05-01T08_13_18-04_00.pdf' -
```

Copy the left-column explanatory paragraphs into the existing `CHAPTER_COPY` constant. For People/Strategy, substitute `report.respondentName` only where the source uses the respondent name. For You, omit the right-column sentence requiring experience and partner count.

- [ ] **Step 7: Preserve the existing opener chart**

Pass `report` or `respondentName` to `ChapterPage` only as needed for the source copy. Keep `SuFullVerticalPeerChart` and its data unchanged.

- [ ] **Step 8: Apply source-faithful two-column opener CSS**

Match the ESPERTO opener proportions: explanatory text left, existing results/chart right, domain color accent. Do not add other visual components.

- [ ] **Step 9: Run the renderer test**

```bash
npx jest src/__tests__/components/assessments/su-full-landscape-report.test.tsx --runInBand
```

Expected: PASS with populated Introduction and all five requested text blocks.

- [ ] **Step 10: Commit**

```bash
cd /tmp/su-full-esperto-cosmetic-parity
git add src/src/components/assessments/su-full-landscape/SuFullLandscapeReport.tsx \
  src/src/styles/su-report.css \
  src/src/__tests__/components/assessments/su-full-landscape-report.test.tsx
git commit -m "feat(report): populate introduction and section text"
```

---

### Task 4: Restyle details without changing text and populate Conclusion

**Files:**

- Modify if required: `src/src/components/assessments/su-full-landscape/SuFullLandscapeCharts.tsx`
- Modify: `src/src/components/assessments/su-full-landscape/SuFullLandscapeReport.tsx`
- Modify: `src/src/styles/su-report.css`
- Test: `src/src/__tests__/components/assessments/su-full-landscape-report.test.tsx`
- Test: `src/src/__tests__/components/assessments/su-full-peer-render.test.tsx`

**Interfaces:**

- Consumes: unchanged `question.recommendation`, existing chapter color variables, existing strongest/weakest/closest/largest model fields, pinned `conclusionHtml`
- Produces: domain-colored details and result-populated Conclusion followed by authored CTA

- [ ] **Step 1: Lock recommendation identity before styling**

For a frozen fixture, read the expected string from the frozen model before rendering and assert exact equality afterward:

```ts
const expectedFrozenRecommendationQ01 = model.chapters
  .flatMap((chapter) => chapter.questions)
  .find((question) => question.stableKey === "Q01")?.recommendation;
expect(expectedFrozenRecommendationQ01).toEqual(expect.any(String));

expect(screen.getByTestId("su-full-landscape-detail-Q01").querySelector(
  ".su-full-landscape-feedback",
)?.textContent).toBe(expectedFrozenRecommendationQ01);
```

Add the same assertion after rendering the finished component. Do not use a substring assertion.

- [ ] **Step 2: Write failing color-pair tests**

Require explicit You/Peers classes and domain context:

```ts
expect(screen.getByTestId("su-full-detail-you-Q01")).toHaveClass("is-people");
expect(screen.getByTestId("su-full-detail-peers-Q01")).toHaveClass("is-people");
```

- [ ] **Step 3: Write failing Conclusion tests**

```ts
expect(screen.getByText(/ScaleUp Score/i)).toHaveTextContent("73");
expect(screen.getByText(/strongest/i)).toHaveTextContent(model.strongestChapter.label);
expect(screen.getByText(/focus/i)).toHaveTextContent(model.weakestChapter.label);
expect(screen.getByLabelText("Scaling Up Full next steps")).toBeInTheDocument();
expect(screen.queryByText(/biggest challenge|percentile|industry comparison/i)).not.toBeInTheDocument();
```

- [ ] **Step 4: Run tests and observe failure**

```bash
npx jest \
  src/__tests__/components/assessments/su-full-landscape-report.test.tsx \
  src/__tests__/components/assessments/su-full-peer-render.test.tsx \
  --runInBand
```

Expected: recommendation identity passes before styling; new color/Conclusion structure assertions fail.

- [ ] **Step 5: Apply Jeff's dark/light domain colors**

Use existing variables only:

```css
.su-full-landscape-report .su-report-detailed-bar--you {
  background: var(--chapter-line-color);
}

.su-full-landscape-report .su-report-detailed-bar--peers {
  background: var(--chapter-peer-color);
  border: 1px solid var(--chapter-line-color);
}
```

Use current selector names where they differ. Preserve explicit You/Peers labels.

- [ ] **Step 6: Populate the Conclusion minimally**

Keep the existing ScaleUp Score and strongest/focus statements. Add one neutral sentence for `model.closestQuestions` and one for `model.largestGapQuestions`. Then render `conclusionHtml` unchanged. Do not create a new conclusion helper or findings subsystem.

- [ ] **Step 7: Run tests and verify recommendation identity remains exact**

```bash
npx jest \
  src/__tests__/components/assessments/su-full-landscape-report.test.tsx \
  src/__tests__/components/assessments/su-full-peer-render.test.tsx \
  --runInBand
```

Expected: PASS; frozen recommendation text remains exactly identical.

- [ ] **Step 8: Commit**

```bash
cd /tmp/su-full-esperto-cosmetic-parity
git add src/src/components/assessments/su-full-landscape/SuFullLandscapeCharts.tsx \
  src/src/components/assessments/su-full-landscape/SuFullLandscapeReport.tsx \
  src/src/styles/su-report.css \
  src/src/__tests__/components/assessments/su-full-landscape-report.test.tsx \
  src/src/__tests__/components/assessments/su-full-peer-render.test.tsx
git commit -m "style(report): match ESPERTO detail colors and conclusion density"
```

---

### Task 5: Update capture contracts, compare every page, and run the full gate

**Files:**

- Modify: `src/scripts/capture-su-full-landscape-report.tsx`
- Modify: `src/scripts/capture-report-html-peers-previews.tsx`
- Modify: `src/src/__tests__/scripts/capture-su-full-landscape-report.test.ts`
- Modify: `src/src/__tests__/scripts/capture-report-html-peers-previews.test.ts`
- Modify: `src/src/__tests__/components/assessments/su-full-landscape-browser.test.tsx`
- Modify before an authorized push: `CLAUDE.md`
- Modify before an authorized push: `plans/CHANGELOG.md`

**Interfaces:**

- Consumes: finished report renderer and the approved side-by-side mock
- Produces: verified 25-page Edition 6 PDF, verified 24-page null-preface PDF, and one squash-ready PR

- [ ] **Step 1: Replace obsolete page-count assertions**

Use fixture-aware expectations:

```ts
const expectedPageCount = report.reportHtml?.introductionHtml ? 25 : 24;
expect(renderedPages).toHaveLength(expectedPageCount);
expect(renderedPageNumbers).toEqual(
  Array.from({ length: expectedPageCount }, (_, index) => index + 1),
);
```

Update only assertions/filenames affected by removal of the generic Welcome and Peers dashboard.

- [ ] **Step 2: Run capture and browser suites**

```bash
npx jest \
  src/__tests__/components/assessments/su-full-landscape-browser.test.tsx \
  src/__tests__/scripts/capture-su-full-landscape-report.test.ts \
  src/__tests__/scripts/capture-report-html-peers-previews.test.ts \
  --runInBand
```

Expected: PASS with no blank or duplicate sheets.

- [ ] **Step 3: Generate visual artifacts**

Use the environment switches documented by the current tests:

```bash
SU_FULL_LANDSCAPE_VISUAL_ARTIFACTS=1 npx jest \
  src/__tests__/components/assessments/su-full-landscape-browser.test.tsx \
  --runInBand
```

If `origin/main` names a different switch, use the test's documented switch.

- [ ] **Step 4: Perform the directive-by-directive visual comparison**

Check every page, with focused comparison on:

- Cover unchanged
- Authored preface unchanged
- TOC copied from ESPERTO page 3
- Introduction populated only from available data
- Profile copied from ESPERTO page 5
- No standalone Peers dashboard
- Five opener text blocks and correct domain colors
- Dynamic detail recommendations unchanged
- Conclusion populated and authored CTA unchanged
- Appendix content unchanged

Reject any new visual element not traceable to Jeff's directive matrix.

- [ ] **Step 5: Run all targeted report suites**

```bash
npx jest \
  src/__tests__/lib/assessments/su-full-landscape-report.test.ts \
  src/__tests__/components/assessments/su-full-landscape-report.test.tsx \
  src/__tests__/components/assessments/su-full-landscape-browser.test.tsx \
  src/__tests__/components/assessments/su-full-peer-render.test.tsx \
  src/__tests__/scripts/capture-su-full-landscape-report.test.ts \
  src/__tests__/scripts/capture-report-html-peers-previews.test.ts \
  --runInBand
```

Expected: all targeted suites pass.

- [ ] **Step 6: Run repository gates**

```bash
npx eslint \
  src/lib/assessments/su-full-landscape-report.ts \
  src/components/assessments/su-full-landscape/SuFullLandscapeReport.tsx \
  src/components/assessments/su-full-landscape/SuFullLandscapeCharts.tsx \
  src/__tests__/lib/assessments/su-full-landscape-report.test.ts \
  src/__tests__/components/assessments/su-full-landscape-report.test.tsx \
  src/__tests__/components/assessments/su-full-landscape-browser.test.tsx \
  src/__tests__/components/assessments/su-full-peer-render.test.tsx \
  scripts/capture-su-full-landscape-report.tsx \
  scripts/capture-report-html-peers-previews.tsx \
  src/__tests__/scripts/capture-su-full-landscape-report.test.ts \
  src/__tests__/scripts/capture-report-html-peers-previews.test.ts
node scripts/check-migration-safety.mjs
CI=true npx next build --turbopack
git diff --check
```

Expected: lint, migration safety, build, and whitespace checks pass.

- [ ] **Step 7: Audit the final scope**

```bash
git diff --name-only origin/main...HEAD
git diff origin/main...HEAD | rg -n \
  'schema.prisma|migrations/|seed-scaling-up-full-assessment|scoring|peer.*vector|phase.*boundary'
```

Expected: the changed-file list is limited to the report, tests/capture scripts, CSS, and required SoT docs. The prohibited-scope search is empty.

- [ ] **Step 8: Update SoT only before an authorized push**

Update the `CLAUDE.md` `LAST_UPDATED_ISO`/`LAST_UPDATED_SLUG` anchor and brief status prose. Prepend the detailed implementation/test record to `plans/CHANGELOG.md`. Keep `CLAUDE.md` within its word budget.

- [ ] **Step 9: Commit capture and SoT changes**

```bash
cd /tmp/su-full-esperto-cosmetic-parity
git add src/scripts/capture-su-full-landscape-report.tsx \
  src/scripts/capture-report-html-peers-previews.tsx \
  src/src/__tests__/scripts/capture-su-full-landscape-report.test.ts \
  src/src/__tests__/scripts/capture-report-html-peers-previews.test.ts \
  src/src/__tests__/components/assessments/su-full-landscape-browser.test.tsx \
  CLAUDE.md plans/CHANGELOG.md
git commit -m "test(report): verify Jeff-directed cosmetic parity"
```

- [ ] **Step 10: Request final visual approval**

Present the complete 25-page PDF with the six approved side-by-side comparisons. Do not push until the user approves the finished artifact.

- [ ] **Step 11: Deliver one squash-ready PR when authorized**

Push `codex/su-full-esperto-cosmetic-parity`, open one PR titled `Report: apply Jeff-directed ESPERTO cosmetic changes`, wait for Build and Migration Safety Gate, and use squash merge so `main` receives one commit.

- [ ] **Step 12: Verify production after authorized merge**

```bash
curl -sS https://scaling-up-platform-v2.vercel.app/api/health
npx vercel ls 2>&1 | head -5
```

Expected: deployment Ready, health healthy, and the live Edition 6 report matches the approved 25-page artifact.

---

## Final PR Checklist

- [ ] One report-only PR marked for squash merge
- [ ] TOC and Profile are the only literal copy treatments
- [ ] Introduction/Conclusion use available data only
- [ ] Opener text added without new layouts or systems
- [ ] Dynamic `question.recommendation` text proven unchanged
- [ ] Cover, authored preface, authored CTA, and Appendix preserved
- [ ] Generic Welcome and standalone Peers dashboard removed
- [ ] 25-page Edition 6 and 24-page null-preface variants verified
- [ ] No question, schema, scoring, phase, peer-vector, or recommendation changes
- [ ] Corrected visual gate and final complete PDF both approved
- [ ] Targeted tests, ESLint, migration safety, and Turbopack build results recorded
