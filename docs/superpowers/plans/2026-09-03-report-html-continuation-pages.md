# Report HTML Continuation Pages Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Allow up to 200 estimated lines in both report Preface and Closing HTML while keeping every supported individual report readable and unclipped in browser and PDF output.

**Architecture:** Retain the sanitizer as the single storage/load policy and raise only its two estimated-line ceilings. Keep the four naturally flowing portrait renderers unchanged except for regression coverage; add authored-flow page descriptors and CSS only to Scaling Up Full, moving custom Closing HTML off the fixed generated-summary page.

**Tech Stack:** TypeScript, React server rendering, Next.js, `sanitize-html`, Jest, Testing Library, Playwright Chromium, Poppler (`pdfinfo`/`pdftotext`), CSS paged media

**Spec:** `docs/superpowers/specs/2026-09-03-report-html-continuation-pages-design.md`

## Global Constraints

- Both Preface and Closing have an exact `estimatedLines` ceiling of 200.
- Every other report HTML security and structural limit remains byte-for-byte unchanged.
- Historically completed reports continue to use their pinned Template Version HTML; no provenance rewrite is allowed.
- The generated Scaling Up Full conclusion narrative remains present when authored Closing HTML exists.
- Only authored Scaling Up Full pages may fragment; every generated Scaling Up Full page retains its fixed-page contract.
- Group reports and results emails remain out of scope.

---

### Task 1: Lock the authoring and defensive-load contract

**Files:**
- Create: `src/src/__tests__/fixtures/report-html.ts`
- Modify: `src/src/__tests__/lib/assessments/report-html-sanitizer.test.ts`
- Modify: `src/src/__tests__/lib/assessments/report-html.test.ts`
- Modify: `src/src/lib/assessments/report-html-sanitizer.ts`

**Interfaces:**
- Consumes: `sanitizeReportHtmlFragment(raw, position)`, `prepareReportHtmlForStorage(reportConfig)`, and `loadSafeReportHtml(reportConfig)`.
- Produces: `ROCKEFELLER_BOOK_OFFER_REPORT_HTML` and `REPORT_HTML_LIMITS.{introduction,conclusion}.estimatedLines === 200`.

- [ ] **Step 1: Add the exact Rockefeller CTA regression fixture and failing acceptance tests**

```ts
export const ROCKEFELLER_BOOK_OFFER_REPORT_HTML = `
  <table aria-label="Rockefeller Habits checklist conclusion">
    <tr>
      <td><h1>Conclusion</h1><p>We would like to thank you...</p><p>Keep Scaling,</p><p>Verne Harnish</p></td>
      <td aria-label="Book offer"><img src="https://images.squarespace-cdn.com/content/rockefeller-book.jpg" alt="Mastering the Rockefeller Habits book cover"><p>Order your own personal copy <a href="https://amzn.to/4xtRFrS">here</a></p></td>
    </tr>
  </table>`;
```

Assert acceptance for both positions, storage preparation, and defensive load under labels representing newly issued and historically pinned reports.

- [ ] **Step 2: Run the focused tests and verify the original ceilings reject the fixture**

Run: `npx jest src/__tests__/lib/assessments/report-html-sanitizer.test.ts src/__tests__/lib/assessments/report-html.test.ts --runInBand`

Expected: FAIL because the fixture exceeds 32 introduction lines and 24 conclusion lines.

- [ ] **Step 3: Raise only the two estimated-line ceilings**

```ts
introduction: { /* retained limits */ estimatedLines: 200 },
conclusion: { /* retained limits */ estimatedLines: 200 },
```

Update boundary tests so 200 estimated lines pass, 201 fail, and every granular element/image/table/heading/break limit still fails independently.

- [ ] **Step 4: Run the focused tests and verify they pass**

Run: `npx jest src/__tests__/lib/assessments/report-html-sanitizer.test.ts src/__tests__/lib/assessments/report-html.test.ts --runInBand`

Expected: PASS.

- [ ] **Step 5: Commit the sanitizer contract**

```bash
git add src/src/lib/assessments/report-html-sanitizer.ts src/src/__tests__/fixtures/report-html.ts src/src/__tests__/lib/assessments/report-html-sanitizer.test.ts src/src/__tests__/lib/assessments/report-html.test.ts
git commit -m "fix: expand report html authoring capacity"
```

### Task 2: Give Scaling Up Full authored sections a safe page order

**Files:**
- Modify: `src/src/lib/assessments/su-full-landscape-report.ts`
- Modify: `src/src/components/assessments/su-full-landscape/SuFullLandscapePages.tsx`
- Modify: `src/src/components/assessments/su-full-landscape/SuFullLandscapeReport.tsx`
- Modify: `src/src/__tests__/components/assessments/su-full-landscape-report.test.tsx`
- Modify: `src/src/__tests__/lib/assessments/su-full-landscape-report.test.ts`

**Interfaces:**
- Consumes: `SafeReportHtmlFragment`, `SuFullLandscapePage`, and `ReportHtmlSection`.
- Produces: `SuFullLandscapePageContent` kind `closing`; `SuFullLandscapePage` variant `authored`; sequential page descriptors including both optional authored pages.

- [ ] **Step 1: Write failing model and component tests**

Assert that a report with both authored fields has `cover → preface → ... → conclusion → closing → appendix`, 26 logical pages, sequential numbers, generated conclusion copy on the conclusion page, custom CTA only on the closing page, and Appendix after it. Assert no authored Closing page when `conclusionHtml` is null.

- [ ] **Step 2: Run the focused tests and verify they fail**

Run: `npx jest src/__tests__/lib/assessments/su-full-landscape-report.test.ts src/__tests__/components/assessments/su-full-landscape-report.test.tsx --runInBand`

Expected: FAIL because the model has no `closing` descriptor and Closing HTML is embedded in the fixed conclusion page.

- [ ] **Step 3: Expand the page model and renderer**

Change the model builder to call:

```ts
pages(
  Boolean(report.reportHtml?.introductionHtml),
  Boolean(report.reportHtml?.conclusionHtml),
)
```

Add `{ kind: "closing" }` between generated conclusion and Appendix when present. Generalize `CustomHtmlPage` with a `position` parameter, render Preface and Closing as `variant="authored"`, and remove `conclusionHtml` from `ConclusionPage` so its generated narrative stays isolated.

- [ ] **Step 4: Run the focused tests and verify they pass**

Run: `npx jest src/__tests__/lib/assessments/su-full-landscape-report.test.ts src/__tests__/components/assessments/su-full-landscape-report.test.tsx --runInBand`

Expected: PASS.

- [ ] **Step 5: Commit the page-order change**

```bash
git add src/src/lib/assessments/su-full-landscape-report.ts src/src/components/assessments/su-full-landscape/SuFullLandscapePages.tsx src/src/components/assessments/su-full-landscape/SuFullLandscapeReport.tsx src/src/__tests__/components/assessments/su-full-landscape-report.test.tsx src/src/__tests__/lib/assessments/su-full-landscape-report.test.ts
git commit -m "fix: separate authored closing from report summary"
```

### Task 3: Let only authored landscape pages fragment safely

**Files:**
- Modify: `src/src/styles/su-report.css`
- Modify: `src/src/__tests__/components/assessments/su-full-landscape-browser.test.tsx`

**Interfaces:**
- Consumes: `.su-full-landscape-page--authored`, `ROCKEFELLER_BOOK_OFFER_REPORT_HTML`, Playwright `Page`, and the Poppler commands.
- Produces: growing screen pages and naturally fragmenting print pages without overlap into generated report pages.

- [ ] **Step 1: Add failing browser and PDF assertions**

For Preface and Closing separately, render accepted 200-line semantic-boundary inputs and assert:

```ts
expect(await authoredContentOutsideLogicalPage(page)).toEqual([]);
expect(pdfText).toContain("END-OF-AUTHORED-CONTENT");
expect(appendixText).toContain("Appendix A");
```

Also assert that every fixed generated page still computes to exactly `210mm`, authored pages compute to at least `210mm`, page descriptors are sequential, and a long authored section increases physical PDF sheets instead of overlapping its next logical sibling.

- [ ] **Step 2: Run the browser test and verify fixed-page overflow**

Run: `npx jest src/__tests__/components/assessments/su-full-landscape-browser.test.tsx --runInBand -t "authored|semantic|Rockefeller"`

Expected: FAIL with authored descendants extending below their closest fixed landscape page.

- [ ] **Step 3: Add the authored-flow CSS override after the fixed print rule**

```css
@media print {
  .su-public-brand.su-report.su-full-landscape .su-full-landscape-page--authored {
    height: auto;
    min-height: 210mm;
    break-inside: auto;
    page-break-inside: auto;
  }
}
```

Keep explicit breaks before and after the logical page and retain atomic print handling for images, tables, blockquotes, and preformatted blocks.

- [ ] **Step 4: Run the complete landscape browser suite**

Run: `npx jest src/__tests__/components/assessments/su-full-landscape-browser.test.tsx --runInBand`

Expected: PASS, including searchable end markers in generated PDFs.

- [ ] **Step 5: Commit the flow contract**

```bash
git add src/src/styles/su-report.css src/src/__tests__/components/assessments/su-full-landscape-browser.test.tsx
git commit -m "fix: flow long authored report pages safely"
```

### Task 4: Verify all report styles and both provenance paths

**Files:**
- Modify: `src/src/__tests__/components/assessments/report-html-sections.test.tsx`
- Modify: `src/src/__tests__/components/assessments/su-full-landscape-browser.test.tsx`
- Modify only if a failing renderer proves necessary: `src/src/components/assessments/BrandedReport.tsx`
- Modify only if a failing renderer proves necessary: `src/src/components/assessments/QualitativeReport.tsx`
- Modify only if a failing renderer proves necessary: `src/src/components/assessments/report-styles/ExecutiveBoardroomReport.tsx`
- Modify only if a failing renderer proves necessary: `src/src/components/assessments/report-styles/ModernDashboardReport.tsx`

**Interfaces:**
- Consumes: all five individual renderers and shared `SafeReportHtml` values.
- Produces: evidence that new and historical pinned inputs render the full Preface and Closing in desktop, mobile, and PDF paths.

- [ ] **Step 1: Add a renderer matrix using the exact Rockefeller fixture**

Cover both `introductionHtml` and `conclusionHtml`, and label the inputs `newly-issued` and `historical-pinned`. Assert the book link, final text marker, and image alt text are present after rendering.

- [ ] **Step 2: Run the renderer tests and record any style-specific failure**

Run: `npx jest src/__tests__/components/assessments/report-html-sections.test.tsx src/__tests__/components/assessments/su-full-landscape-browser.test.tsx --runInBand -t "Rockefeller|historical|pinned|expanded Closing"`

Expected: PASS for naturally flowing renderers; any failure must name the renderer and clipping measurement before production CSS is changed.

- [ ] **Step 3: Make only evidence-required style corrections**

If portrait CSS blocks fragmentation, change only the authored introduction/conclusion page wrapper to `break-inside: auto` while retaining `break-before: page`. Do not relax generated report sections.

- [ ] **Step 4: Run the full targeted report suite**

Run: `npx jest src/__tests__/lib/assessments/report-html-sanitizer.test.ts src/__tests__/lib/assessments/report-html.test.ts src/__tests__/lib/assessments/su-full-landscape-report.test.ts src/__tests__/components/assessments/report-html-sections.test.tsx src/__tests__/components/assessments/su-full-landscape-report.test.tsx src/__tests__/components/assessments/su-full-landscape-browser.test.tsx src/__tests__/components/assessments/report-style-renderers.test.tsx --runInBand`

Expected: PASS.

- [ ] **Step 5: Commit cross-renderer coverage**

```bash
git add src/src/__tests__/components/assessments/report-html-sections.test.tsx src/src/__tests__/components/assessments/su-full-landscape-browser.test.tsx src/src/components/assessments/BrandedReport.tsx src/src/components/assessments/QualitativeReport.tsx src/src/components/assessments/report-styles/ExecutiveBoardroomReport.tsx src/src/components/assessments/report-styles/ModernDashboardReport.tsx
git commit -m "test: cover long report html across renderers"
```

### Task 5: Run release gates and update source-of-truth notes

**Files:**
- Modify: `CLAUDE.md`
- Modify: `plans/CHANGELOG.md`

**Interfaces:**
- Consumes: the complete branch diff and project release commands.
- Produces: passing validation evidence and current project history.

- [ ] **Step 1: Update source-of-truth records**

Set `CLAUDE.md` `LAST_UPDATED_ISO` to the completion timestamp, set `LAST_UPDATED_SLUG` to `report-html-continuation-pages`, add a short current-state note, and prepend a detailed `plans/CHANGELOG.md` entry describing root cause, renderer behavior, historical-version semantics, tests, and rollback surface.

- [ ] **Step 2: Lint every changed TypeScript/TSX file**

Run from `src/`:

```bash
npx eslint src/lib/assessments/report-html-sanitizer.ts src/lib/assessments/su-full-landscape-report.ts src/components/assessments/su-full-landscape/SuFullLandscapePages.tsx src/components/assessments/su-full-landscape/SuFullLandscapeReport.tsx src/__tests__/fixtures/report-html.ts src/__tests__/lib/assessments/report-html-sanitizer.test.ts src/__tests__/lib/assessments/report-html.test.ts src/__tests__/lib/assessments/su-full-landscape-report.test.ts src/__tests__/components/assessments/report-html-sections.test.tsx src/__tests__/components/assessments/su-full-landscape-report.test.tsx src/__tests__/components/assessments/su-full-landscape-browser.test.tsx
```

Expected: exit 0.

- [ ] **Step 3: Run the migration safety gate**

Run from `src/`: `node scripts/check-migration-safety.mjs`

Expected: PASS with no new migration.

- [ ] **Step 4: Run the production-equivalent build**

Run from `src/`: `CI=true npx next build --turbopack`

Expected: exit 0.

- [ ] **Step 5: Review the final diff and commit documentation**

Run: `git diff --check && git status --short && git diff --stat origin/main...HEAD`

```bash
git add CLAUDE.md plans/CHANGELOG.md docs/superpowers/specs/2026-09-03-report-html-continuation-pages-design.md docs/superpowers/plans/2026-09-03-report-html-continuation-pages.md
git commit -m "docs: record report html continuation behavior"
```
