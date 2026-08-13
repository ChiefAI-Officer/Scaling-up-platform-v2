# Task 10 live-route inventory correction — evidence

Status: **HARNESS COMPLETE — BROWSER RUNTIME NOT RUN**

## Scope

Only Task 10 E2E/harness configuration and its direct Jest contract changed. No
application/product code, database, browser-runtime, deployment, or external
service action was performed.

## RED

Command (from `src/`):

```bash
npx jest src/__tests__/e2e/mobile-responsive-acceptance-contract.test.ts --runInBand
```

Result: exit 1, **7 failures / 13 passes**. The new contracts identified the
stale coach `public-leads` entry, absent gated referred-results discovery, all
six missing admin static owners, missing populated workshop-surveys discovery,
and absent preview-base-URL behavior (HTTPS override was ignored and malformed
and `ftp:` overrides did not throw). The first config-inspection assertion was
then corrected for the real `tsx` default-export wrapper; this was a test
fixture interoperability correction, not a production change.

## GREEN

Command (from `src/`):

```bash
npx jest src/__tests__/e2e/mobile-responsive-acceptance-contract.test.ts --runInBand
```

Result: exit 0, **1 suite / 20 tests passed**. The direct contracts prove:

- `/portal/assessments/public-leads` is not in the static coach inventory;
  `/portal/assessments/referred-results` is discovered only from the
  authenticated assessments navigation when its exact href is present, then
  enters the existing fail-closed route matrix.
- All six accessible admin create/operations paths are static owners, while the
  intentionally unavailable report-style preview path is excluded.
- The selected admin workshop's linked `/surveys` owner remains part of dynamic
  discovery and is checked through the same route guard.
- No override retains localhost plus the existing guarded web server; a valid
  HTTPS override uses that base URL with no web server; malformed and `ftp:`
  values throw during config evaluation.

## Changed files

- `src/e2e/mobile-responsive-coach.spec.ts`
- `src/e2e/mobile-responsive-admin.spec.ts`
- `src/playwright.config.ts`
- `src/src/__tests__/e2e/mobile-responsive-acceptance-contract.test.ts`
- `.superpowers/sdd/2026-08-12-mobile-responsive-foundation/task-10-live-route-inventory-report.md`

## Validation

From `src/`:

```bash
npx jest src/__tests__/e2e/mobile-responsive-acceptance-contract.test.ts --runInBand
npx eslint e2e/mobile-responsive-coach.spec.ts e2e/mobile-responsive-admin.spec.ts playwright.config.ts src/__tests__/e2e/mobile-responsive-acceptance-contract.test.ts
PLAYWRIGHT_BASE_URL=https://preview.example.test npx playwright test e2e/mobile-responsive-coach.spec.ts e2e/mobile-responsive-admin.spec.ts e2e/mobile-responsive-state.spec.ts e2e/mobile-responsive-a11y.spec.ts e2e/mobile-responsive-visual.spec.ts e2e/mobile-responsive-kill-diagnostic.spec.ts --list --project=responsive-compact --project=responsive-medium --project=responsive-tablet-wide --project=responsive-desktop
git diff --check
```

Results: Jest **20/20**, ESLint exit 0 with no output, Playwright static listing
exit 0 with **56 tests in 6 files** across all four responsive projects, and
`git diff --check` exit 0. The listing used the valid preview override only to
prove the no-web-server configuration branch; it did not navigate or contact
the preview URL.

## Commit

Scoped harness correction: `8bed20126fbec090ff82f89f0277c5a21196cf6f`
(`test: correct mobile route inventories`). This evidence receipt is committed
immediately after that correction so it can name the immutable implementation
commit without a self-referential commit hash.

## Self-review concerns

- This is static/contract evidence only. No browser runtime, authenticated
  navigation, Axe, overflow, visual, database, or deployment action was run.
- Existing unrelated changes to the portal settings page and its test were
  present in the worktree and are deliberately excluded from this correction.
