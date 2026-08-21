# Task 6 implementation report

## Status

Complete. Approved Layout A is implemented for SU Full detail cards as question
label → explicit You/Peers paired bars → Frozen feedback. Truthful frozen-peer
disclosure and provenance are rendered without changing the fixed 26-page report
composition.

- Base commit: `97b7710154e0a4214a24c48db6aa9a79f7c2552c`
- Implementation commit: `2a29384dd2920226cf336c3847a67d0be8f9f4c3`
- Commit subject: `feat: apply approved phase peer report layout`

## RED evidence

The first focused run was made before production changes:

```bash
npx jest \
  src/__tests__/components/assessments/su-full-landscape-browser.test.tsx \
  src/__tests__/lib/assessments/su-full-landscape-report.test.ts \
  src/__tests__/lib/assessments/su-full-landscape-render.test.tsx \
  --runInBand
```

It exited 1: 3 suites failed, 6 tests failed, and 21 tests passed. The expected
failures showed that the landscape model still exposed `benchmarkUpdatedAt`, the
exact governed disclosure/provenance were absent, and the browser-rendered report
contained zero copies of the required disclosure. Stale pre-Task-5 P4 fixture
expectations were then corrected independently from production behavior.

Visual TDD found one additional defect. The focused browser assertion for a
single-column mobile detail layout failed with two computed grid columns. The CSS
specificity correction was made only after that RED result, and the isolated test
then passed.

The generic flag-off renderer was also exercised after Task 5's provenance type
change. Its new disclosure/provenance tests initially failed six assertions,
including a `RangeError` from attempting to format the removed
`benchmarkUpdatedAt` value. Replacing that stale seam with Task 5 provenance and
renaming its detail heading to `Frozen feedback` made all 12 focused renderer tests
green.

## GREEN and refactor evidence

The exact Task 6 focused set passed after implementation: 3 suites and 27 tests.
The combined landscape component/model/browser set then passed 4 suites and 33
tests. The final Task 1–6 regression command was:

```bash
npx jest \
  src/__tests__/lib/assessments/su-full-phase-peer-catalogue.test.ts \
  src/__tests__/lib/assessments/scoring.test.ts \
  src/__tests__/lib/assessments/compute-score-result.test.ts \
  src/__tests__/lib/assessments/su-full-phase-feedback-edition.test.ts \
  src/__tests__/app/org-survey/submit.test.ts \
  src/__tests__/lib/assessments/respondent-report.test.ts \
  src/__tests__/lib/assessments/onscreen-result-store.test.ts \
  src/__tests__/lib/assessments/su-full-peer-presentation.test.ts \
  src/__tests__/lib/assessments/peer-report-resolver.test.ts \
  src/__tests__/components/assessments/su-full-peer-render.test.tsx \
  src/__tests__/components/assessments/su-full-landscape-browser.test.tsx \
  src/__tests__/components/assessments/su-full-landscape-report.test.tsx \
  src/__tests__/lib/assessments/su-full-landscape-report.test.ts \
  src/__tests__/lib/assessments/su-full-landscape-render.test.tsx \
  --runInBand
```

Result: 14 suites passed, 496 tests passed, 0 failed, 0 snapshots.

Changed TypeScript/TSX files passed targeted ESLint, and `git diff --check` passed.
Repository-wide `npx tsc --noEmit --pretty false` remains red on known pre-existing
diagnostics. Filtering that output for the Task 6 landscape, generic peer renderer,
and changed test file names produced no Task 6 diagnostics.

## Browser and visual verification

The existing Playwright-backed Jest browser harness was used directly:

```bash
SU_FULL_LANDSCAPE_VISUAL_ARTIFACTS=1 \
  npx jest src/__tests__/components/assessments/su-full-landscape-browser.test.tsx \
  --runInBand
```

The harness rendered and the implementer inspected these temporary standard
artifacts under `src/tmp/screenshots/su-full-phase-peers/`:

- P3, P4, P5, and historical dashboard page 6 at desktop size;
- P3, P4, P5, and historical detail page 8 at desktop, mobile, and print sizes;
- corrupt fallback at desktop, mobile, and print sizes.

The temporary screenshot/PDF output was removed after inspection and was not
committed.

Observations:

- Desktop `1280×720`: detail cards retain the existing report palette/type system,
  show the approved repeated comparison signature, and keep disclosure/provenance
  visually subordinate. P4 Q01 is 6.6; P3, P5, and historical Q01 are 6.3.
- Mobile `390×844`: detail pages are one column after the test-first specificity
  fix; labels, source IDs, bars, and feedback wrap without horizontal overflow.
- Print/A4 landscape: two-column detail composition remains stable, disclosure and
  source IDs remain readable, and representative long feedback stays within the
  page. P3, P4, P5, and historical PDFs each report exactly 26 pages through
  `pdfinfo`.
- Provenance renders as `Phase P<n> · 2026-08-20.esperto-five-phase-peers-v1`
  for governed snapshots and
  `Legacy baseline · su-full-benchmarks-2026-08-14-v1` for historical fallback.
- Corrupt/unavailable presentation renders the classic fallback with no peer UI,
  disclosure, or provenance in desktop, mobile, or print modes.
- Browser contrast checks require at least 3:1 for both bar fills against their
  track and 4.5:1 for numeric values. All 27 detail-card samples passed.

## Changed files

- `src/src/components/assessments/su-full-landscape/SuFullLandscapeReport.tsx`
- `src/src/components/assessments/SuFullPeerComparison.tsx`
- `src/src/lib/assessments/su-full-landscape-report.ts`
- `src/src/styles/su-report.css`
- `src/src/__tests__/components/assessments/su-full-landscape-browser.test.tsx`
- `src/src/__tests__/components/assessments/su-full-landscape-report.test.tsx`
- `src/src/__tests__/components/assessments/su-full-peer-render.test.tsx`
- `src/src/__tests__/lib/assessments/su-full-landscape-report.test.ts`
- `src/src/__tests__/lib/assessments/su-full-landscape-render.test.tsx`

`SuFullLandscapeCharts.tsx` needed no production edit because its existing detail
bar primitive already rendered explicit `You` then `Peers` labels and values. Tests
now lock that behavior and its contrast contract.

## Rulings and costs

- Task 5 intentionally removed mutable `benchmarkUpdatedAt` from the presentation.
  Task 6 therefore had to carry `SuFullPeerPresentation.provenance` through
  `su-full-landscape-report.ts` and update the generic flag-off renderer in addition
  to the brief's minimum file list. Without this compatibility bridge, valid reports
  would crash or make stale claims.
- Existing detail selectors such as
  `su-full-landscape-detail-${stableKey}` were preserved per the frozen dispatch;
  no selector rename or whole-report clone was introduced.
- Provenance is repeated on detail pages so every printed page containing peer bars
  remains self-describing. The cost is a compact disclosure block on each such page;
  print sizing was deliberately subordinate and verified against the 26-page limit.
- Accessible detail-bar colors were adjusted within the existing chapter/purple
  palette because some prior decorative fills did not meet the 3:1 non-text contrast
  contract against the track.

## Review and concerns

A post-commit standards and spec review against the fixed base found no unresolved
Task 6 defect. Numeric values are still sourced exclusively from the frozen Task 5
presentation, and unavailable/corrupt data continues to fail closed.

The only remaining repository concern is the known unrelated repository-wide
TypeScript baseline. No production deployment, database mutation, PR/push, external
message, or prototype modification was performed. The untracked prototype remains
preserved for Task 7.
