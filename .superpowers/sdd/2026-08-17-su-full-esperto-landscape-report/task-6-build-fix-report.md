# Task 6 build/print fix report

Date: 2026-08-18
Fix commit: `71c6457d`

## Scope

Resolved the Task 6 production-build blocker caused by the duplicate
`SuFullLandscapePage` type/component identifier, then completed the scoped
print-contract fixes found during the same review round:

- aliased the landscape page descriptor type so the renderer compiles;
- made the real `LegacyClassicReport` landscape dispatch self-contained by
  emitting the `.su-public-brand.su-report.su-full-landscape` wrapper required
  by the production CSS;
- restored the approved narrative-left/chart-right chapter pages and
  two-column detail pages;
- kept all 61 question labels visible on Appendix A page 26 while retaining
  all five charts on one A4 landscape page;
- made opener and appendix chart `aria-labelledby` IDs unique;
- preserved the Scaling Up cover mark and coach logo/name when supplied;
- made the chapter key a visible, colored kicker and changed peer contour
  colors to lighter chapter tints;
- strengthened the canonical fixture with a representative maximum-density
  Q35 label and long feedback, and ignored the complete local PDF evidence
  directory.

## Verification

- Focused Jest: 3 suites, 38 tests passed.
- ESLint passed for all changed TS/TSX files.
- `git diff --check` passed.
- `npx tsx scripts/capture-su-full-landscape-report.tsx` passed.
- `pdfinfo tmp/pdfs/su-full-landscape-fixture.pdf`: 26 pages; `841.92 x
  594.96 pts (A4)` (landscape).
- Poppler renders were inspected for pages 1, 7, 8, 18, 21, and 26.
  Page 1 has the Scaling Up mark; pages 7/21 use narrative-left/chart-right;
  page 8 uses two columns; page 18 contains the long Q35 feedback without
  clipping; page 26 shows all five charts and question labels.
- Integration assertions cover the real dispatch wrapper, exactly ten
  contour polylines with no dashed series, unique chart title IDs, coach
  provenance, and all 61 detailed paired-bar/feedback blocks.
- Final `CI=true npx next build --turbopack` passed after both fix commits; it
  emitted only the existing missing optional Inngest/DATABASE_URL environment
  warnings during static generation.

## Remaining concerns

The fixture intentionally uses a compact representative page-26 type scale
so all 61 labels fit the fixed A4 landscape appendix. Production data should
still be spot-checked with the live longest labels/feedback after activation.
