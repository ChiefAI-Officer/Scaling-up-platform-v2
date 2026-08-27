# Composition revision — local review, 27 August 2026

Status: **local visual approved** (user: “looks good”); release preparation
authorized by the subsequent “proceed”. **Not pushed, deployed, or approved for
production.** Final release evidence and integration blockers are recorded in
[`release-readiness.md`](release-readiness.md).
User explicitly requested revision and a working local preview before production
approval. This supersedes the tall-card composition UI only, not the report engine.

## What changed

Compact available-report rows; search and current/all-campaign scope; Select all /
Deselect all; separate CEO/Team panels, counts, batch Add selected, Clear, and
individual Remove. Assigned sources leave the available list. An occupied CEO
slot must be cleared before replacement. Pending selections block Review with an
explicit explanation. Back preserves assigned sources. A three-step indicator
provides orientation. Existing platform styling and security/compatibility checks
remain; no backend, schema, PDF body, or production flags changed.

New UI lives in `src/src/components/assessments/SummaryReportComposition.tsx`;
existing wizard retains draft ownership and creation/error/retry handling.
The prior comparison is in `../summary-composition-comparison-2026-08-27/README.md`.

## Initial revision verification (before visual approval)

- TDD: three new interaction tests failed on the absent batch controls before
  implementation, then passed. The complete wizard suite passes 18 tests.
- Five targeted suites pass **81/81 tests**: wizard, report panel, campaign host,
  summary-report API, and candidate eligibility.
- ESLint passes on both UI files, both changed component test files, and the
  updated E2E spec. `git diff --check` passes.
- Focused TypeScript check of the two UI entrypoints and their transitive imports
  passes via ignored `src/test-results/tsconfig-summary-ui.json`.
- Repository-wide `tsc --noEmit --incremental false` does **not** pass: reports
  many test/integration typing errors outside the revised UI, including Prisma
  JsonValue input typing in existing E2E immutable-row assertions. No claim of a
  clean repository-wide typecheck or new production build is made.
- Updated existing E2E selectors for the new assignment controls; the standalone
  E2E fixture suite was **not rerun** during this turn. The running user preview
  was retained and exercised interactively instead.

## Fresh browser exercise

Actual local app: `http://127.0.0.1:53953/admin/assessments/campaigns/proof-scaling`.
Synthetic local DB and simulated private Blob transport; live data untouched.

Verified CEO assignment, Select all for two pending Team reports, disabled Review
while pending, batch Team transfer, Clear Team returning reports, name search,
Back-state preservation, exact final review with Alex CEO plus Dee Team and Ed
Team, creation, persisted report-list row, and report View modal.

Created one local-only sample report:
`c3272bd6-49a5-4f1e-9449-e5b4bd941c6b` (Scaling Q3 local proof).
No invitations or external writes. This is not live Blob/Redis deployment proof.

The initial desktop preview was captured at 1280×720. `composition-desktop.png`
now contains the inspected final release-check capture (1440px full-page).
`composition-pending-mobile-viewport.png` and
`composition-bottom-mobile-viewport.png` show the final 390×844 pending-selection
warning, disabled Review, and reachable Team transfer action. These are engineering
verification captures, not additional user approval of every viewport or PDF.
The local server remains running; refresh and reopen Open Wizard → Scaling Up ·
CEO Full → Next to inspect the revision.
