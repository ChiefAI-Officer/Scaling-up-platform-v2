# Scaling Up Full Esperto-faithful Landscape Report Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the shipped Scaling Up Full Classic peer-report presentation with the approved, truthful, Esperto-faithful 26-page A4 landscape report while retaining the live 61-row peer and frozen-feedback plumbing.

**Architecture:** Keep the resolver and `SuFullPeerPresentation` unchanged. Add a pure composition builder that validates and maps the frozen report into 26 deterministic page descriptors, then render those descriptors through a dedicated `SuFullLandscapeReport` and focused chart/page components. `LegacyClassicReport` dispatches to the dedicated renderer only when both the peer payload and composition model are complete; every invalid case preserves the current generic Classic fallback.

**Tech Stack:** Next.js 16, React 19, TypeScript 5, Jest 30, Testing Library, CSS print media, Playwright/Chromium PDF capture, Poppler visual inspection.

**Spec:** `docs/superpowers/specs/2026-08-17-su-full-esperto-faithful-landscape-report-design.md`

## Global Constraints

- Scope is `scaling-up-full` + `CLASSIC` + complete `SuFullPeerPresentation` only.
- Reuse the current governed DB rows; do not change benchmark data, scoring, answers, or feedback bands.
- Render one solid peer contour only; never render team or previous-assessment series.
- Preserve the disclosure that peers are not matched to company size, growth phase, geography, or industry.
- Growth phase comes only from frozen `Q_FTE_CONTRACT` through `computeGrowthPhase`; omit it when invalid.
- Produce exactly 26 physical A4 landscape pages with the approved page and Q01-Q61 allocation.
- Use Scaling Up Platform branding and original/product-owned prose; no Esperto/TCPDF attribution or unsupported endorsements.
- Keep the existing complete-set fail-soft fallback.
- Use TDD for every behavior change and commit after every independently reviewable task.
- Before push, run targeted Jest, ESLint on changed files, migration safety, and `CI=true npx next build --turbopack` from `src/`.
- Before Production release, update `CLAUDE.md` freshness anchors and prepend `plans/CHANGELOG.md`.
- Main requires an approving review; merge through a PR and verify Vercel Production before end-user smoke testing.

---

## File map

- Create `src/src/lib/assessments/su-full-landscape-report.ts`: canonical chapter/page constants, composition types, validation, aggregates, gap summaries, and growth-phase derivation.
- Create `src/src/__tests__/lib/assessments/su-full-landscape-report.test.ts`: pure 26-page and failure-contract tests.
- Create `src/src/__tests__/fixtures/su-full-landscape.ts`: canonical ten-section, 61-question frozen fixture with long feedback and FTE driver.
- Create `src/src/components/assessments/su-full-landscape/SuFullLandscapeCharts.tsx`: accessible vertical contour and detailed paired-bar primitives.
- Create `src/src/components/assessments/su-full-landscape/SuFullLandscapePages.tsx`: page shell plus opening, chapter, detail, conclusion, and appendix page components.
- Create `src/src/components/assessments/su-full-landscape/SuFullLandscapeReport.tsx`: 26-page renderer/orchestrator.
- Create `src/src/__tests__/components/assessments/su-full-landscape-report.test.tsx`: DOM, ordering, chart-series, disclosure, and fallback tests.
- Modify `src/src/components/assessments/BrandedReport.tsx`: early Classic Scaling Up Full landscape dispatch with generic fallback.
- Modify `src/src/styles/su-report.css`: `.su-full-landscape` screen and fixed A4 print system.
- Modify `src/src/__tests__/components/assessments/su-full-peer-render.test.tsx`: replace obsolete “no contour” assertions with the new renderer contract while retaining generic fallback coverage.
- Create `src/scripts/capture-su-full-landscape-report.tsx`: deterministic Chromium PDF capture using the canonical fixture.
- Create `src/src/__tests__/scripts/capture-su-full-landscape-report.test.ts`: capture-script contract test.
- Modify `CLAUDE.md`: Production SoT freshness anchors and current report state.
- Modify `plans/CHANGELOG.md`: implementation, validation, PR, deploy, and smoke receipts.

---

### Task 1: Canonical 26-page composition model

**Files:**
- Create: `src/src/__tests__/fixtures/su-full-landscape.ts`
- Create: `src/src/__tests__/lib/assessments/su-full-landscape-report.test.ts`
- Create: `src/src/lib/assessments/su-full-landscape-report.ts`

**Interfaces:**
- Consumes: `RespondentReport`, `SuFullPeerPresentation`, `computeGrowthPhase(number)`.
- Produces: `buildSuFullLandscapeReportModel(input): SuFullLandscapeReportModel | null`, `SU_FULL_LANDSCAPE_PAGE_GROUPS`, `SU_FULL_LANDSCAPE_CHAPTERS`, and the discriminated `SuFullLandscapePage` union.

- [ ] **Step 1: Create a canonical frozen fixture**

Create a ten-section fixture with canonical ranges and domains:

```ts
export const LANDSCAPE_SECTION_RANGES = [
  ["S_PEOPLE_YE", "Your Employees", "people", 1, 8],
  ["S_PEOPLE_CC", "Company Culture", "people", 9, 13],
  ["S_STRATEGY", "Strategy", "strategy", 14, 20],
  ["S_EXEC_LT", "Leadership Team", "execution", 21, 24],
  ["S_EXEC_OP", "Operational Processes", "execution", 25, 29],
  ["S_EXEC_SM", "Sales and Marketing", "execution", 30, 34],
  ["S_EXEC_SIT", "Scalability, Innovation and Technology", "execution", 35, 40],
  ["S_CASH", "Cash", "cash", 41, 45],
  ["S_YOU_LEAD", "Your Leadership", "you", 46, 55],
  ["S_YOU_IC", "Internal Communication", "you", 56, 61],
] as const;

export function completeSuFullLandscapeReport(): RespondentReport;
export function completeSuFullLandscapePresentation(
  report?: RespondentReport,
): SuFullPeerPresentation;
```

Use `Q_FTE_CONTRACT = 12`, values cycling 0-10, benchmark values from `SU_FULL_QUESTION_BENCHMARKS`, and a deliberately long feedback string so print density is exercised.

- [ ] **Step 2: Write failing pure-model tests**

Cover exact pages and allocation:

```ts
const model = buildSuFullLandscapeReportModel({ report, presentation });
expect(model).not.toBeNull();
expect(model!.pages).toHaveLength(26);
expect(model!.pages.map((page) => page.number)).toEqual(
  Array.from({ length: 26 }, (_, index) => index + 1),
);
expect(detailKeys(model!)).toEqual(keys("Q01", "Q61"));
expect(new Set(detailKeys(model!)).size).toBe(61);
expect(chapterPageNumbers(model!)).toEqual([7, 11, 14, 19, 21]);
expect(model!.pages[25].kind).toBe("appendix");
```

Also assert page groups `8: Q01-Q06`, `9: Q07-Q08`, `10: Q09-Q13`, `12: Q14-Q19`, `13: Q20`, `15: Q21-Q24`, `16: Q25-Q29`, `17: Q30-Q34`, `18: Q35-Q40`, `20: Q41-Q45`, `22: Q46-Q51`, `23: Q52-Q55`, and `24: Q56-Q61`; five chapter groupings; averages/gaps; Phase 2 for FTE 12; null phase for invalid FTE; and `null` for missing/duplicate/unknown keys or section/domain maps.

- [ ] **Step 3: Run the tests and verify RED**

Run from `src/`:

```bash
npx jest src/__tests__/lib/assessments/su-full-landscape-report.test.ts --runInBand
```

Expected: FAIL because the module and exported builder do not exist.

- [ ] **Step 4: Implement the pure composition model**

Define these stable interfaces:

```ts
export type SuFullLandscapeChapterKey =
  | "people" | "strategy" | "execution" | "cash" | "you";

export type SuFullLandscapeQuestion = SuFullPeerQuestionComparison & Readonly<{
  sectionStableKey: string;
  sectionLabel: string;
  gap: number;
}>;

export type SuFullLandscapeProfileRow = Readonly<{
  stableKey: string;
  label: string;
  chapterKey: SuFullLandscapeChapterKey;
  youAverage: number;
  peersAverage: number;
  deviation: number;
}>;

export type SuFullLandscapeChapter = Readonly<{
  key: SuFullLandscapeChapterKey;
  label: string;
  sections: readonly SuFullPeerSectionComparison[];
  questions: readonly SuFullLandscapeQuestion[];
  youAverage: number;
  peersAverage: number;
}>;

export type SuFullLandscapePage =
  | Readonly<{ number: number; kind: "cover" | "preface" | "contents" | "introduction" | "profile" | "peer-dashboard" | "conclusion" }>
  | Readonly<{ number: number; kind: "chapter"; chapterKey: SuFullLandscapeChapterKey }>
  | Readonly<{ number: number; kind: "detail"; chapterKey: SuFullLandscapeChapterKey; questionKeys: readonly string[] }>
  | Readonly<{ number: 26; kind: "appendix" }>;

export type SuFullLandscapeReportModel = Readonly<{
  benchmarkUpdatedAt: string;
  growthPhase: GrowthPhase | null;
  chapters: readonly SuFullLandscapeChapter[];
  profileRows: readonly SuFullLandscapeProfileRow[];
  pages: readonly SuFullLandscapePage[];
  strongestChapter: SuFullLandscapeChapter;
  weakestChapter: SuFullLandscapeChapter;
  closestQuestions: readonly SuFullLandscapeQuestion[];
  largestGapQuestions: readonly SuFullLandscapeQuestion[];
}>;
```

Validate canonical keys/sections before deriving anything. Freeze returned arrays/objects. Use stable-key constants, not array offsets from the incoming payload. Calculate chapter and section averages, signed deviations, and question gaps in this pure layer; React only formats them. Extract numeric `Q_FTE_CONTRACT` from frozen raw answers and call `computeGrowthPhase`; do not treat missing phase as model failure.

- [ ] **Step 5: Run pure-model tests and existing peer-builder tests**

```bash
npx jest src/__tests__/lib/assessments/su-full-landscape-report.test.ts src/__tests__/lib/assessments/su-full-peer-presentation.test.ts --runInBand
```

Expected: PASS.

- [ ] **Step 6: Commit Task 1**

```bash
git add src/src/lib/assessments/su-full-landscape-report.ts src/src/__tests__/lib/assessments/su-full-landscape-report.test.ts src/src/__tests__/fixtures/su-full-landscape.ts
git commit -m "feat(assessments): compose SU Full landscape report"
```

---

### Task 2: Accessible vertical contour and paired-bar primitives

**Files:**
- Create: `src/src/components/assessments/su-full-landscape/SuFullLandscapeCharts.tsx`
- Extend test: `src/src/__tests__/components/assessments/su-full-landscape-report.test.tsx`

**Interfaces:**
- Consumes: `SuFullLandscapeQuestion`, `SuFullLandscapeChapterKey`.
- Produces: `SuFullVerticalPeerChart`, `SuFullDetailPairedBars`, and `chapterColorClass(key)`.

- [ ] **Step 1: Write failing chart tests**

Assert one row per question, visible respondent score, semantic hidden peer score, exactly one `<polyline>`, no dotted/previous/team series, and detail order:

```ts
expect(within(vertical).getAllByRole("listitem")).toHaveLength(13);
expect(vertical.querySelectorAll("polyline")).toHaveLength(1);
expect(vertical.querySelector("[stroke-dasharray]")).toBeNull();
expect(within(vertical).getByText("Score of Peers")).toBeVisible();

const detail = screen.getByTestId("su-landscape-detail-bars-Q01");
expect(detail).toHaveTextContent("You");
expect(detail).toHaveTextContent("Peers");
expect(detail.querySelectorAll(".su-full-landscape-bar-fill")).toHaveLength(2);
```

- [ ] **Step 2: Run the chart tests and verify RED**

```bash
npx jest src/__tests__/components/assessments/su-full-landscape-report.test.tsx --runInBand
```

Expected: FAIL because the chart components do not exist.

- [ ] **Step 3: Implement chart primitives**

`SuFullVerticalPeerChart` renders semantic rows and one view-box SVG. Compute points deterministically:

```ts
const y = rowIndex * ROW_HEIGHT + ROW_HEIGHT / 2;
const x = PLOT_LEFT + clamp(question.peers, 0, 10) / 10 * PLOT_WIDTH;
const points = questions.map((q, i) => `${peerX(q)},${rowY(i)}`).join(" ");
```

Set `aria-hidden="true"` on the SVG. Add `sr-only` text per row: `You X.X. Peers Y.Y.` `SuFullDetailPairedBars` uses square-ended tracks, chapter-colored `You`, a lighter chapter tint for `Peers`, and visible values.

- [ ] **Step 4: Run chart tests and accessibility regression**

```bash
npx jest src/__tests__/components/assessments/su-full-landscape-report.test.tsx src/__tests__/components/assessments/su-full-peer-render.test.tsx --runInBand
```

Expected: chart tests PASS; obsolete “no SVG/path” expectation remains RED for Task 4 integration and is not weakened silently.

- [ ] **Step 5: Commit Task 2**

```bash
git add src/src/components/assessments/su-full-landscape/SuFullLandscapeCharts.tsx src/src/__tests__/components/assessments/su-full-landscape-report.test.tsx
git commit -m "feat(assessments): add SU Full vertical peer charts"
```

---

### Task 3: Dedicated 26-page landscape renderer

**Files:**
- Create: `src/src/components/assessments/su-full-landscape/SuFullLandscapePages.tsx`
- Create: `src/src/components/assessments/su-full-landscape/SuFullLandscapeReport.tsx`
- Extend test: `src/src/__tests__/components/assessments/su-full-landscape-report.test.tsx`

**Interfaces:**
- Consumes: `RespondentReport`, `SuFullLandscapeReportModel`, chart primitives.
- Produces: `<SuFullLandscapeReport report model contactEmail? />` rendering exactly 26 `.su-full-landscape-page` elements.

- [ ] **Step 1: Write failing page-contract tests**

Render the dedicated component and assert:

```ts
const pages = screen.getAllByTestId(/^su-full-landscape-page-/);
expect(pages).toHaveLength(26);
expect(pages.map((page) => page.dataset.pageNumber)).toEqual(
  Array.from({ length: 26 }, (_, i) => String(i + 1)),
);
for (const number of [7, 11, 14, 19, 21]) {
  expect(screen.getByTestId(`su-full-landscape-page-${number}`))
    .toHaveTextContent("Score of Peers");
}
expect(screen.getByTestId("su-full-landscape-page-26").querySelectorAll("polyline"))
  .toHaveLength(5);
expect(screen.getAllByTestId(/^su-full-landscape-detail-Q/)).toHaveLength(61);
```

Also assert page 4 includes Phase 2 from FTE 12, page 5 includes `You`, `Peers`, `Deviation`, page 6 contains the truthful disclosure/update date, pages 8-24 keep each question's bars before feedback, page 25 contains the score and next-step content, and no Esperto/TCPDF attribution occurs anywhere.

- [ ] **Step 2: Run renderer tests and verify RED**

```bash
npx jest src/__tests__/components/assessments/su-full-landscape-report.test.tsx --runInBand
```

Expected: FAIL because the page components do not exist.

- [ ] **Step 3: Implement the page shell and opening pages**

Create a shared page shell:

```tsx
export function SuFullLandscapePage({ number, chapterKey, children }: Props) {
  return (
    <section
      className={`su-full-landscape-page${chapterKey ? ` is-${chapterKey}` : ""}`}
      data-testid={`su-full-landscape-page-${number}`}
      data-page-number={number}
    >
      <header className="su-full-landscape-page-header" aria-hidden="true">
        <span className="is-people" />
        <span className="is-strategy" />
        <span className="is-execution" />
        <span className="is-cash" />
        <span className="is-you" />
      </header>
      <main className="su-full-landscape-page-body">{children}</main>
      <footer className="su-full-landscape-page-footer">
        <span>Scaling Up Assessment</span>
        <span aria-label={`Page ${number}`}>{number}</span>
      </footer>
    </section>
  );
}
```

Implement pages 1-6 with platform-owned copy. Page 6 may show only supported aggregates and gaps from the model; include no matched-cohort claims.

- [ ] **Step 4: Implement chapter, detail, conclusion, and appendix pages**

Map `model.pages` exhaustively. Chapter pages use `SuFullVerticalPeerChart`; detail pages resolve only their declared `questionKeys` and render question -> paired bars -> frozen feedback; Appendix A renders all five chapter charts. Throw only inside the dedicated renderer for an impossible discriminant; upstream composition validation prevents it in normal use.

- [ ] **Step 5: Run renderer and pure-model tests**

```bash
npx jest src/__tests__/components/assessments/su-full-landscape-report.test.tsx src/__tests__/lib/assessments/su-full-landscape-report.test.ts --runInBand
```

Expected: PASS.

- [ ] **Step 6: Commit Task 3**

```bash
git add src/src/components/assessments/su-full-landscape/SuFullLandscapePages.tsx src/src/components/assessments/su-full-landscape/SuFullLandscapeReport.tsx src/src/__tests__/components/assessments/su-full-landscape-report.test.tsx
git commit -m "feat(assessments): render 26-page SU Full landscape report"
```

---

### Task 4: Classic dispatch and fail-soft regression

**Files:**
- Modify: `src/src/components/assessments/BrandedReport.tsx`
- Modify: `src/src/__tests__/components/assessments/su-full-peer-render.test.tsx`
- Modify: `src/src/__tests__/components/assessments/branded-report.test.tsx`
- Modify: `src/src/__tests__/components/assessments/report-style-renderers.test.tsx`

**Interfaces:**
- Consumes: `buildSuFullLandscapeReportModel` and `SuFullLandscapeReport`.
- Produces: Classic-only dedicated dispatch; all non-ready paths retain `LegacyClassicReport` generic markup.

- [ ] **Step 1: Write failing dispatch tests**

Assert a complete Classic Scaling Up Full peer report renders
`su-full-landscape-report`, not `su-full-peer-sequence` or generic
`report-sections`. Assert absent/null/invalid peer payload, composition failure,
non-Classic styles, and non-Scaling-Up aliases do not render the landscape.

- [ ] **Step 2: Run dispatch tests and verify RED**

```bash
npx jest src/__tests__/components/assessments/su-full-peer-render.test.tsx src/__tests__/components/assessments/branded-report.test.tsx src/__tests__/components/assessments/report-style-renderers.test.tsx --runInBand
```

Expected: FAIL on the new landscape assertions.

- [ ] **Step 3: Add the dedicated dispatch**

At the start of the Classic path, build the model only after the existing alias/style/peer checks:

```tsx
const landscapeModel = suFullPeers
  ? buildSuFullLandscapeReportModel({ report, presentation: suFullPeers })
  : null;
if (landscapeModel) {
  return (
    <SuFullLandscapeReport
      report={report}
      model={landscapeModel}
      contactEmail={contactEmail}
    />
  );
}
```

Remove only the now-unreachable `SuFullPeerComparison` render branch. Preserve the generic section/recommendation path for `landscapeModel === null`.

- [ ] **Step 4: Update obsolete UI assertions precisely**

Replace the old “no SVG/path/connected contour” assertion with:

- exactly five chapter opener polylines plus five Appendix A polylines;
- every polyline has no `stroke-dasharray`;
- all 61 detail blocks retain paired bars and frozen feedback; and
- generic fallback still contains no landscape contour.

- [ ] **Step 5: Run all affected report tests**

```bash
npx jest src/__tests__/components/assessments/su-full-landscape-report.test.tsx src/__tests__/components/assessments/su-full-peer-render.test.tsx src/__tests__/components/assessments/branded-report.test.tsx src/__tests__/components/assessments/report-style-renderers.test.tsx src/__tests__/components/assessments/org-survey-onscreen-results.test.tsx --runInBand
```

Expected: PASS.

- [ ] **Step 6: Commit Task 4**

```bash
git add src/src/components/assessments/BrandedReport.tsx src/src/__tests__/components/assessments/su-full-peer-render.test.tsx src/src/__tests__/components/assessments/branded-report.test.tsx src/src/__tests__/components/assessments/report-style-renderers.test.tsx
git commit -m "feat(assessments): activate SU Full landscape renderer"
```

---

### Task 5: A4 landscape CSS and deterministic PDF capture

**Files:**
- Modify: `src/src/styles/su-report.css`
- Create: `src/scripts/capture-su-full-landscape-report.tsx`
- Create: `src/src/__tests__/scripts/capture-su-full-landscape-report.test.ts`
- Extend test: `src/src/__tests__/components/assessments/su-full-landscape-report.test.tsx`

**Interfaces:**
- Consumes: rendered `.su-full-landscape` DOM and canonical fixture.
- Produces: responsive screen pages, exact A4 print pages, `tmp/pdfs/su-full-landscape-fixture.pdf`, and PNG inspection pages.

- [ ] **Step 1: Write failing CSS and capture-contract tests**

Assert the stylesheet contains:

```css
@page { size: A4 landscape; margin: 0; }
.su-full-landscape-page { break-after: page; }
.su-full-landscape-detail { break-inside: avoid; }
```

Also assert square-ended bars, five chapter color scopes, print color adjustment,
screen-only responsive stacking, and a capture script using
`preferCSSPageSize: true`, `landscape: true`, and `printBackground: true`.

- [ ] **Step 2: Run CSS/capture tests and verify RED**

```bash
npx jest src/__tests__/components/assessments/su-full-landscape-report.test.tsx src/__tests__/scripts/capture-su-full-landscape-report.test.ts --runInBand
```

Expected: FAIL because print rules and capture script do not exist.

- [ ] **Step 3: Implement scoped screen and print styles**

Use `.su-public-brand .su-report.su-full-landscape` or descendant-equivalent scope. Print pages are `297mm × 210mm`, with internal safe padding and no external margin. Define `--chapter-color` and `--chapter-peer-color` in `.is-people`, `.is-strategy`, `.is-execution`, `.is-cash`, and `.is-you`. Remove rounded-card styling from detail blocks in this renderer only. Do not change other Classic/report-style CSS.

- [ ] **Step 4: Implement deterministic Chromium capture**

The script must:

1. render the canonical fixture and model to static markup;
2. inject `su-report.css`;
3. launch Playwright Chromium;
4. emulate print media;
5. write `tmp/pdfs/su-full-landscape-fixture.pdf`; and
6. exit non-zero if the model is unavailable.

Do not commit generated PDF/PNG artifacts.

- [ ] **Step 5: Run CSS/capture tests, create PDF, and verify 26 pages**

```bash
npx jest src/__tests__/components/assessments/su-full-landscape-report.test.tsx src/__tests__/scripts/capture-su-full-landscape-report.test.ts --runInBand
npx tsx scripts/capture-su-full-landscape-report.tsx
pdfinfo tmp/pdfs/su-full-landscape-fixture.pdf | rg '^Pages:\s+26$'
pdftoppm -png -f 1 -l 8 -r 110 tmp/pdfs/su-full-landscape-fixture.pdf tmp/pdfs/su-full-landscape
pdftoppm -png -f 21 -l 21 -singlefile -r 110 tmp/pdfs/su-full-landscape-fixture.pdf tmp/pdfs/su-full-landscape-p21
pdftoppm -png -f 26 -l 26 -singlefile -r 110 tmp/pdfs/su-full-landscape-fixture.pdf tmp/pdfs/su-full-landscape-p26
```

Expected: Jest PASS, `Pages: 26`, and PNGs with no browser chrome.

- [ ] **Step 6: Inspect rendered PNGs**

Inspect pages 1-8, 21, and 26 with the local image viewer. Reject clipping, overlap, unreadable labels, missing contours, missing paired bars, unexpected whitespace, or browser headers/footers. Patch CSS and repeat Steps 5-6 until clean.

- [ ] **Step 7: Commit Task 5**

```bash
git add src/src/styles/su-report.css src/scripts/capture-su-full-landscape-report.tsx src/src/__tests__/scripts/capture-su-full-landscape-report.test.ts src/src/__tests__/components/assessments/su-full-landscape-report.test.tsx
git commit -m "feat(assessments): polish SU Full landscape PDF"
```

---

### Task 6: SoT, full gates, and implementation review

**Files:**
- Modify: `CLAUDE.md`
- Modify: `plans/CHANGELOG.md`
- Review: all branch changes from `origin/main...HEAD`

**Interfaces:**
- Consumes: completed implementation and verification receipts.
- Produces: fresh SoT, green local gates, and a review-ready branch.

- [ ] **Step 1: Add SoT and changelog entries**

Update `LAST_UPDATED_ISO` / `LAST_UPDATED_SLUG` and prepend a changelog entry recording:

- the five chapter opener contours;
- retained paired detail bars;
- Appendix A;
- truthfulness disclosure;
- exact 26-page PDF verification; and
- tests/build run with their outcomes.

- [ ] **Step 2: Run focused lint and tests**

From `src/`:

```bash
npx eslint src/lib/assessments/su-full-landscape-report.ts src/components/assessments/su-full-landscape src/components/assessments/BrandedReport.tsx scripts/capture-su-full-landscape-report.tsx src/__tests__/lib/assessments/su-full-landscape-report.test.ts src/__tests__/components/assessments/su-full-landscape-report.test.tsx src/__tests__/components/assessments/su-full-peer-render.test.tsx src/__tests__/scripts/capture-su-full-landscape-report.test.ts
npx jest src/__tests__/lib/assessments/su-full-landscape-report.test.ts src/__tests__/lib/assessments/su-full-peer-presentation.test.ts src/__tests__/components/assessments/su-full-landscape-report.test.tsx src/__tests__/components/assessments/su-full-peer-render.test.tsx src/__tests__/components/assessments/branded-report.test.tsx src/__tests__/components/assessments/report-style-renderers.test.tsx src/__tests__/components/assessments/org-survey-onscreen-results.test.tsx src/__tests__/scripts/capture-su-full-landscape-report.test.ts --runInBand
```

Expected: PASS with zero ESLint errors.

- [ ] **Step 3: Run repository gates**

```bash
node scripts/check-migration-safety.mjs
CI=true npx next build --turbopack
```

Expected: migration gate PASS and 94/94-or-current page build PASS.

- [ ] **Step 4: Review branch diff**

Review `git diff --check origin/main...HEAD`, `git diff --stat origin/main...HEAD`, and the full diff for:

- accidental changes to benchmark/scoring/feedback data;
- generic report regressions;
- unsupported peer claims;
- missing page numbers or page allocations;
- missing accessibility text; and
- generated PDF/PNG artifacts accidentally staged.

- [ ] **Step 5: Commit Task 6**

```bash
git add CLAUDE.md plans/CHANGELOG.md
git commit -m "docs: record SU Full landscape report verification"
```

---

### Task 7: Protected PR, Production activation, and end-user smoke test

**Files:**
- No new product files unless CI/review finds a defect.
- Append final receipts to `plans/CHANGELOG.md` if repository convention requires a closeout PR.

**Interfaces:**
- Consumes: green, reviewed branch.
- Produces: merged PR, successful Vercel Production deployment, and an end-user report receipt.

- [ ] **Step 1: Push the feature branch and open a PR**

```bash
git push -u origin codex/su-full-esperto-landscape-report
gh pr create \
  --repo ChiefAI-Officer/Scaling-up-platform-v2 \
  --base main \
  --head codex/su-full-esperto-landscape-report \
  --title "Render Esperto-faithful Scaling Up Full landscape report" \
  --body $'## Summary\n- render the approved 26-page A4 landscape Scaling Up Full Classic report\n- restore five chapter-level vertical peer contours and Appendix A\n- retain detailed You/Peers bars and frozen feedback\n\n## Safety\n- no benchmark, scoring, answer, feedback-band, or Esperto data changes\n- invalid peer/composition data falls back to the existing Classic report\n\n## Verification\n- targeted Jest and ESLint pass\n- migration safety passes\n- Turbopack Production build passes\n- Chromium fixture PDF is exactly 26 pages; pages 1-8, 21, and 26 visually inspected\n\n## Design\n- docs/superpowers/specs/2026-08-17-su-full-esperto-faithful-landscape-report-design.md\n- docs/superpowers/plans/2026-08-17-su-full-esperto-landscape-report.md'
```

The PR body must include the design/spec links, 26-page PDF receipt, tests/build, risk/fallback, and explicit statement that benchmarks/scoring/feedback data are unchanged.

- [ ] **Step 2: Obtain required independent approval and green checks**

Request an independent review. Resolve actionable comments test-first. Wait for Build, Migration Safety Gate, PostgreSQL lease test, Vercel Preview, and any repository-required checks to pass. Do not self-approve as the required reviewer.

- [ ] **Step 3: Verify the Vercel preview visually**

Use an authorized test report route on the preview. Confirm the end-user screen and Download PDF show:

- page 7 vertical;
- page 8 paired bars and feedback;
- page 21 vertical;
- page 26 all five verticals;
- exactly 26 pages; and
- no browser headers/footers or unsupported cohort claims.

- [ ] **Step 4: Merge and wait for Production deployment**

```bash
SU_LANDSCAPE_PR_NUMBER=$(gh pr view --repo ChiefAI-Officer/Scaling-up-platform-v2 --json number -q .number)
gh pr merge "$SU_LANDSCAPE_PR_NUMBER" --repo ChiefAI-Officer/Scaling-up-platform-v2 --merge --delete-branch
npx vercel ls scaling-up-platform-v2 --yes
```

Merge only after approval/checks. Identify the deployment created from the merge commit and wait until it is `Ready`.

- [ ] **Step 5: Production health and end-user smoke**

Verify:

```bash
curl -fsS https://scaling-up-platform-v2.vercel.app/api/health
```

Then use the authorized Production coach/test respondent flow to open or create a disposable test report. Download the PDF and verify the same six acceptance points from Step 3. Do not mutate Esperto or benchmark rows.

- [ ] **Step 6: Record and report Production receipt**

Report PR number, merge SHA, Vercel deployment ID/URL, health response, test report identifier, PDF page count, key-page visual results, and any known non-blocking browser behavior. If a Production-only defect appears, stop activation claims and open a narrow hotfix PR.

- [ ] **Step 7: Commit the Production closeout receipt**

After a clean smoke test, fetch `origin/main`, create `codex/su-full-esperto-landscape-closeout` from it, update `CLAUDE.md` freshness anchors, and prepend the exact merge/deployment/report receipts to `plans/CHANGELOG.md`. Commit the two docs, push the closeout branch, open a docs-only PR, obtain the required approval/checks, and merge it. Do not mix new product behavior into this closeout PR.
