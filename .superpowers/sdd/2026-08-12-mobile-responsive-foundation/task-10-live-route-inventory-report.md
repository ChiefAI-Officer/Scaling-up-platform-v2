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

## Fix round 1/5 — runtime evidence override (2026-08-13)

Authenticated fail-closed preview evidence overruled the original static
assumption for `/admin/assessments/public-campaigns/new`: when unavailable, it
redirects to the list owner. The create path is therefore no longer in
`ADMIN_ROUTES`. The populated admin lane now reads authenticated links from
`/admin/assessments/public-campaigns`, selects only the exact create href, and
adds it to the existing fail-closed dynamic matrix only when exposed. No final
path allowlist was added, so a redirect remains a failure if the route is
discovered.

### RED / GREEN

RED command (from `src/`):

```bash
npx jest src/__tests__/e2e/mobile-responsive-acceptance-contract.test.ts --runInBand
```

Result: exit 1, **1 failed / 19 passed**. The focused contract failed because
the feature-gated create path was still present in the unconditional static
inventory.

GREEN with the same command: exit 0, **1 suite / 20 tests passed**. The revised
contract also pins all five unconditional create/operations owners, exact-href
conditional discovery, workshop-surveys discovery, and the prior coach and
base-URL contracts.

### Changed files and validation

- `src/e2e/mobile-responsive-admin.spec.ts`
- `src/src/__tests__/e2e/mobile-responsive-acceptance-contract.test.ts`
- This appended evidence receipt.

Fresh validation from `src/`:

```bash
npx jest src/__tests__/e2e/mobile-responsive-acceptance-contract.test.ts --runInBand
npx eslint e2e/mobile-responsive-admin.spec.ts src/__tests__/e2e/mobile-responsive-acceptance-contract.test.ts
PLAYWRIGHT_BASE_URL=https://preview.example.test npx playwright test e2e/mobile-responsive-coach.spec.ts e2e/mobile-responsive-admin.spec.ts e2e/mobile-responsive-state.spec.ts e2e/mobile-responsive-a11y.spec.ts e2e/mobile-responsive-visual.spec.ts e2e/mobile-responsive-kill-diagnostic.spec.ts --list --reporter=list --project=responsive-compact --project=responsive-medium --project=responsive-tablet-wide --project=responsive-desktop
git diff --check
```

Results: Jest **20/20**, scoped ESLint exit 0 with no output, Playwright static
listing **56 tests in 6 files** across four responsive projects, and diff check
exit 0. `--reporter=list` avoided creating a new HTML report. No listed browser
test was executed and the placeholder preview hostname was not contacted.

Implementation commit: `c81ddf07377f2d008b7b045cc5518044c0166bc5`
(`test: gate public campaign create route`). This report append is committed
separately so it can identify that immutable implementation commit.

### Fix-round concerns

- Evidence remains contract/static-list only; browser runtime, Axe, overflow,
  visual, database, deployment, and external actions were not run.
- Concurrent unrelated product/test/style changes and an existing untracked
  `src/playwright-report/` directory remain untouched and excluded.

## Fix round 2/5 — reserved workshop owner rejection (2026-08-13)

The populated preview run proved that the prior generic workshop-detail regex
selected the static `/workshops/new` owner before a populated record. Admin and
coach discovery now share a Node-safe CUID-shaped detail matcher. It accepts
only exact authenticated list hrefs under `/workshops/{cuid}` or
`/portal/workshops/{cuid}` and therefore remains fail-closed when no real
populated detail is exposed. Survey hrefs and the admin landing manager are
derived from that validated detail path; the landing editor assertion is then
derived from the validated landing-manager path.

### RED / GREEN

RED command (from `src/`):

```bash
npx jest src/__tests__/e2e/mobile-responsive-acceptance-contract.test.ts --runInBand
```

Result: exit 1, **1 failed / 20 passed**. The new behavior contract received
`null` because the shared workshop route matcher did not exist. It independently
expected `/workshops/new` and `/portal/workshops/new` to be rejected, realistic
CUID detail paths to match, and survey/landing child paths to derive from those
details.

The first post-implementation run remained RED because the Node subprocess
loaded the TypeScript CommonJS wrapper as named ESM exports. The test fixture
was corrected to use the same `default ?? module` interop already used by the
Playwright config contract. No E2E behavior was weakened. GREEN with the same
Jest command: exit 0, **1 suite / 21 tests passed**.

### Changed files and validation

- `src/e2e/helpers/workshop-route-contract.ts`
- `src/e2e/mobile-responsive-admin.spec.ts`
- `src/e2e/mobile-responsive-coach.spec.ts`
- `src/src/__tests__/e2e/mobile-responsive-acceptance-contract.test.ts`
- This appended evidence receipt.

Fresh validation from `src/`:

```bash
npx jest src/__tests__/e2e/mobile-responsive-acceptance-contract.test.ts --runInBand
npx eslint e2e/helpers/workshop-route-contract.ts e2e/mobile-responsive-admin.spec.ts e2e/mobile-responsive-coach.spec.ts src/__tests__/e2e/mobile-responsive-acceptance-contract.test.ts
PLAYWRIGHT_BASE_URL=https://preview.example.test npx playwright test e2e/mobile-responsive-coach.spec.ts e2e/mobile-responsive-admin.spec.ts e2e/mobile-responsive-state.spec.ts e2e/mobile-responsive-a11y.spec.ts e2e/mobile-responsive-visual.spec.ts e2e/mobile-responsive-kill-diagnostic.spec.ts --list --reporter=list --project=responsive-compact --project=responsive-medium --project=responsive-tablet-wide --project=responsive-desktop
git diff --check
```

Results: Jest **21/21**, scoped ESLint exit 0 with no output, Playwright static
listing **56 tests in 6 files** across four responsive projects, and diff check
exit 0. `--reporter=list` did not create a new HTML report. No browser test ran
and the placeholder preview hostname was not contacted.

Implementation commit: `cb14a021903d874039b07d0981c3be1f362ae05b`
(`test: reject reserved workshop routes`). This report append is committed
separately so it can name the immutable implementation commit.

### Fix-round concerns

- The ID-shape contract follows the Prisma `Workshop.id @default(cuid())`
  schema: lowercase `c` plus 20–31 lowercase alphanumeric characters. A future
  workshop ID migration requires an explicit matcher update.
- Evidence remains contract/static-list only; browser runtime, Axe, overflow,
  visual, database, deployment, and external actions were not run.
- The pre-existing untracked `src/playwright-report/` directory remains
  untouched and excluded.
