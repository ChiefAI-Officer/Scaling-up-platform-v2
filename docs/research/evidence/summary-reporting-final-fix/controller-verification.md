# Controller final verification record

Product commit: `bc12913a493a6a141a04bade2584f15d3e45d4c1`.
2026-08-27. These are contemporaneous records/excerpts of tool stdout personally
run and read by the controller. Full runner stdout was returned by the exec tools,
not redirected to a log file. This file is not claimed to be a raw runner log.

## Fresh focused tests

From worktree `src/`:

```sh
env -i PATH=/opt/homebrew/opt/node@20/bin:/opt/homebrew/bin:/usr/bin:/bin:/usr/sbin:/sbin HOME=/Users/diushianstand CI=true npx jest src/__tests__/lib/assessments/summary-reports/create.test.ts src/__tests__/lib/assessments/summary-reports/coach-image.test.ts src/__tests__/components/assessments/summary-report-wizard.test.tsx --runInBand
```

Exec session74609 completed exit0. Complete final stdout:

```text
PASS src/__tests__/lib/assessments/summary-reports/create.test.ts
PASS src/__tests__/components/assessments/summary-report-wizard.test.tsx
PASS src/__tests__/lib/assessments/summary-reports/coach-image.test.ts

Test Suites: 3 passed, 3 total
Tests:       69 passed, 69 total
Snapshots:   0 total
Time:        2.103 s
Ran all test suites matching src/__tests__/lib/assessments/summary-reports/create.test.ts|src/__tests__/lib/assessments/summary-reports/coach-image.test.ts|src/__tests__/components/assessments/summary-report-wizard.test.tsx.
```

Run occurred after final product changes and before the implementer's commit;
subsequent commit included that tested code and final documentation/evidence.

## Fresh exact-commit build

After commit and clean status, from worktree `src/`:

```sh
env -i PATH=/opt/homebrew/opt/node@20/bin:/opt/homebrew/bin:/usr/bin:/bin:/usr/sbin:/sbin HOME=/Users/diushianstand CI=true NEXT_TELEMETRY_DISABLED=1 npx next build --turbopack
```

Exec session57270 completed exit0. Relevant exact stdout excerpts (not full log):

```text
▲ Next.js 16.1.6 (Turbopack)
  Creating an optimized production build ...
✓ Compiled successfully in 12.9s
  Running TypeScript ...
  Collecting page data using 7 workers ...
✓ Generating static pages using 7 workers (92/92) in 261.7ms
  Finalizing page optimization ...
```

Full output included the expected existing inferred-workspace/multiple-lockfile
and deprecated middleware warnings, missing Inngest event/signing-key warnings,
and three Prisma missing-DATABASE_URL static-data diagnostics for workflow,
contact and category reads. Build still completed exit0 and listed both new
Summary Report API routes and unchanged legacy report route. No credentials
were loaded. This closes the earlier build timing caveat after the final
loader cleanup change; it does not prove live environment integrations.

## Files and visual inspection

Post-commit `git status --short --branch` showed only the branch header; HEAD was
bc12913a. `git diff --check` exited0. SHA256 of all13 promoted PNGs matched the
committed table and the controller's pre-commit hash capture exactly.

Controller personally inspected12: local PDF cover/provenance/appendix,
name-only cover/tier-suppressed page, all four host mobile list states, both
desktop native previews and native mobile. Did not separately inspect the
13th `team0-provenance.png` in this pass (implementer did; earlier fixture evidence
also reviewed). No pixel/full-page/native-mobile acceptance implied.

Observed admin mobile list fits; coach list/action labels clip and require
horizontal pan. New desktop native screenshots show partial title canvas and
thumbnails, not top logo/toolbar/full-page. Current docs accurately state this.
Actual PDF raster samples show restored image/name/footer and suppressed tier,
with no overlap/clipping in inspected body/footer content.
