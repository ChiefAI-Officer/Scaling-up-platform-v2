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

## Fix round 5 evidence — authoritative populated-route readiness (2026-08-13)

The next populated matrix reached Access Groups in all four projects, then
failed before a detail link appeared. Failure snapshots showed the transient
client state (`Loading…` at wide widths and `0 active` at compact widths), while
authenticated live inspection showed a real Access Group CUID link after the
client fetch completed. The shared `firstMatchingHref` helper scanned anchors
immediately after `domcontentloaded`, so it raced async collections and could
also select reserved create owners such as template/workflow/survey `new`.

The harness now validates source navigation, waits on an authoritative
collection-settled signal, and polls only when that settled collection reports
items. Access Groups and assessment templates use successful API payload
counts. Server-rendered collections settle on either a valid candidate or
their explicit empty state. A settled empty collection returns no candidate;
a settled populated collection without a valid detail fails closed. Static
collection routes remain mandatory, while only genuinely present detail
routes enter the dynamic matrix. CUID-backed owners reject create routes;
workflow and survey matchers reject only `new`, preserving valid seeded
non-CUID IDs. Optional public-campaign discovery now waits for its list API
before scanning.

### RED / GREEN

RED command (from `src/`):

```bash
npx jest src/__tests__/e2e/mobile-responsive-acceptance-contract.test.ts --runInBand
```

The first test placement attempt produced a syntax error and was corrected
before it was counted as RED. Valid RED: exit 1, **6 failed / 23 passed**. All
six new behavior tests received no discovery summary because the shared live
href contract did not exist. They independently covered delayed anchors,
reserved create owners, authoritative empty collections, populated collections
without details, valid non-CUID workflow/survey seeds, and navigation/auth/404
failure posture.

GREEN with the same command: exit 0, **1 suite / 29 tests passed**.

### Changed files and validation

- `src/e2e/helpers/live-href-discovery-contract.ts`
- `src/e2e/mobile-responsive-admin.spec.ts`
- `src/src/__tests__/e2e/mobile-responsive-acceptance-contract.test.ts`
- This appended evidence receipt.

Fresh validation from `src/`:

```bash
npx jest src/__tests__/e2e/mobile-responsive-acceptance-contract.test.ts --runInBand
npx eslint e2e/helpers/live-href-discovery-contract.ts e2e/mobile-responsive-admin.spec.ts src/__tests__/e2e/mobile-responsive-acceptance-contract.test.ts
PLAYWRIGHT_BASE_URL=https://preview.example.test npx playwright test e2e/mobile-responsive-coach.spec.ts e2e/mobile-responsive-admin.spec.ts e2e/mobile-responsive-state.spec.ts e2e/mobile-responsive-a11y.spec.ts e2e/mobile-responsive-visual.spec.ts e2e/mobile-responsive-kill-diagnostic.spec.ts --list --reporter=list --project=responsive-compact --project=responsive-medium --project=responsive-tablet-wide --project=responsive-desktop
git diff --check
```

Results: Jest **29/29**, scoped ESLint exit 0 with no output, Playwright static
listing **56 tests in 6 files** across four responsive projects, and diff check
exit 0. No browser test ran and the placeholder preview hostname was not
contacted.

Implementation commit: `4749c3af` (`test: wait for settled populated routes`).
This report append is committed separately so it can name the immutable
implementation commit.

### Fix-round concerns

- DOM-settled collections rely on their explicit product empty-state copy as
  the authoritative zero-item signal; copy changes require a harness selector
  update.
- Browser runtime, Axe, overflow, visual, database, deployment, and external
  actions were intentionally not run in this fix round.
- The pre-existing untracked `src/playwright-report/` directory remains
  untouched and excluded.

## Fix round 3/5 — deterministic admin survey owner (2026-08-13)

The second populated preview run selected a real workshop detail but found no
survey shortcut in that detail UI. Admin survey coverage now constructs the
exact `/workshops/{validatedCuid}/surveys` owner from the already validated
detail href. It remains a required member of `dynamicRoutes`, so the existing
`expectResponsiveRoute` guard rejects missing responses, 4xx responses,
redirects, authentication fallbacks, missing authenticated shell markers, and
overflow at every width. Coach retains its portal-specific visible-link
discovery using the same validated-detail child pattern.

### RED / GREEN

RED command (from `src/`):

```bash
npx jest src/__tests__/e2e/mobile-responsive-acceptance-contract.test.ts --runInBand
```

Result: exit 1, **2 failed / 20 passed**. The contract failed because the route
helper could not yet construct an exact child href and the admin spec still
required `firstMatchingHref` for the survey owner. The independent expected
literal was `/workshops/cm1234567890abcdefghijkl/surveys`; `/workshops/new`
was required to throw.

GREEN with the same command: exit 0, **1 suite / 22 tests passed**. The final
contracts prove exact construction from a valid admin CUID, rejection of the
reserved create owner, inclusion in `dynamicRoutes` under
`expectResponsiveRoute`, and unchanged coach link-discovery semantics.

### Changed files and validation

- `src/e2e/helpers/workshop-route-contract.ts`
- `src/e2e/mobile-responsive-admin.spec.ts`
- `src/src/__tests__/e2e/mobile-responsive-acceptance-contract.test.ts`
- This appended evidence receipt.

Fresh validation from `src/`:

```bash
npx jest src/__tests__/e2e/mobile-responsive-acceptance-contract.test.ts --runInBand
npx eslint e2e/helpers/workshop-route-contract.ts e2e/mobile-responsive-admin.spec.ts e2e/mobile-responsive-coach.spec.ts src/__tests__/e2e/mobile-responsive-acceptance-contract.test.ts
PLAYWRIGHT_BASE_URL=https://preview.example.test npx playwright test e2e/mobile-responsive-coach.spec.ts e2e/mobile-responsive-admin.spec.ts e2e/mobile-responsive-state.spec.ts e2e/mobile-responsive-a11y.spec.ts e2e/mobile-responsive-visual.spec.ts e2e/mobile-responsive-kill-diagnostic.spec.ts --list --reporter=list --project=responsive-compact --project=responsive-medium --project=responsive-tablet-wide --project=responsive-desktop
git diff --check
```

Results: Jest **22/22**, scoped ESLint exit 0 with no output, Playwright static
listing **56 tests in 6 files** across four responsive projects, and diff check
exit 0. `--reporter=list` did not create a new HTML report. No browser test ran
and the placeholder preview hostname was not contacted.

Implementation commit: `43aa7940ddcba4aa5ab9d567f14724867fd9e62c`
(`test: derive admin workshop survey route`). This report append is committed
separately so it can name the immutable implementation commit.

### Fix-round concerns

- This deliberately tests the surveys page even when the selected admin detail
  offers no visible shortcut; runtime route validity remains fail-closed rather
  than optional or redirect-tolerant.
- Evidence remains contract/static-list only; browser runtime, Axe, overflow,
  visual, database, deployment, and external actions were not run.
- The pre-existing untracked `src/playwright-report/` directory remains
  untouched and excluded.

## Fix round 4/5 — populated coach and landing-manager setup (2026-08-13)

The next populated preview exposed two deterministic harness setup defects.
The admin coach inventory's generic single-segment matcher admitted the
reserved `/coaches/new` create route before a real coach detail. The landing
manager setup also clicked a server-rendered button immediately after
`domcontentloaded`, before the client-side `router.push` handler was reliably
hydrated.

Coach detail selection now requires a realistic CUID-shaped owner, so
`/coaches/new` cannot match. Edit discovery remains link-backed: the harness
opens the validated real coach detail and searches that page for an edit link
rooted in the same CUID. The admin landing manager is derived from the already
validated workshop CUID and navigated through `expectResponsiveRoute` at the
initial width. It remains in `dynamicRoutes`, preserving fail-closed response,
authentication, redirect, 404, shell-marker, and overflow checks across every
configured width.

### RED / GREEN

RED command (from `src/`):

```bash
npx jest src/__tests__/e2e/mobile-responsive-acceptance-contract.test.ts --runInBand
```

Initial result: exit 1, **2 failed / 22 passed**. The behavioral coach contract
received `null` because the CUID-aware helper did not exist. A second
source-text assertion also failed for the landing setup. Review correctly
identified the new source assertions as change-detector tests; they were
removed before GREEN, leaving only the Node-executed coach matcher behavior
contract. The populated Playwright test remains the landing consumer test.

GREEN with the same Jest command: exit 0, **1 suite / 23 tests passed**. The
behavior contract proves `/coaches/new` is rejected, a realistic coach CUID is
accepted, its rooted edit link matches, and edit discovery cannot be rooted in
the reserved create owner.

### Changed files and validation

- `src/e2e/helpers/coach-route-contract.ts`
- `src/e2e/mobile-responsive-admin.spec.ts`
- `src/src/__tests__/e2e/mobile-responsive-acceptance-contract.test.ts`
- This appended evidence receipt.

Fresh validation from `src/`:

```bash
npx jest src/__tests__/e2e/mobile-responsive-acceptance-contract.test.ts --runInBand
npx eslint e2e/helpers/coach-route-contract.ts e2e/mobile-responsive-admin.spec.ts src/__tests__/e2e/mobile-responsive-acceptance-contract.test.ts
PLAYWRIGHT_BASE_URL=https://preview.example.test npx playwright test e2e/mobile-responsive-coach.spec.ts e2e/mobile-responsive-admin.spec.ts e2e/mobile-responsive-state.spec.ts e2e/mobile-responsive-a11y.spec.ts e2e/mobile-responsive-visual.spec.ts e2e/mobile-responsive-kill-diagnostic.spec.ts --list --reporter=list --project=responsive-compact --project=responsive-medium --project=responsive-tablet-wide --project=responsive-desktop
git diff --check
```

Results: Jest **23/23**, scoped ESLint exit 0 with no output, Playwright static
listing **56 tests in 6 files** across four responsive projects, and diff check
exit 0. `--reporter=list` did not create a new HTML report. No browser test ran
and the placeholder preview hostname was not contacted.

Implementation commit: `372c7cac` (`test: harden populated admin route
setup`). This report append is committed separately so it can name the
immutable implementation commit.

### Fix-round concerns

- The coach route contract follows `Coach.id @default(cuid())` in the Prisma
  schema. A future coach ID migration requires an explicit matcher update.
- Browser runtime, Axe, overflow, visual, database, deployment, and external
  actions were intentionally not run in this fix round. The next authorized
  populated matrix run remains the consumer-level verification.
- The pre-existing untracked `src/playwright-report/` directory remains
  untouched and excluded.

## Fix round 5/5 — authoritative populated-route readiness (2026-08-13)

Completed in implementation commit `4749c3af`. The full root-cause,
RED/GREEN, validation, and limitation receipt is recorded above under
**Fix round 5 evidence — authoritative populated-route readiness**.

## Post-round follow-up — shell-less authenticated report routes (2026-08-13)

The latest populated matrix reached valid campaign reports at 600, 1024, and
1440 pixels, but the harness rejected them for lacking
`[data-auth-shell="admin"]`. That requirement was false for these URLs: both
`/assessments/{campaignId}/report` and
`/assessments/{campaignId}/respondents/{respondentId}/report` live in the
deliberate `(report)` route group. Its layout explicitly omits dashboard and
portal navigation so printable reports keep clean branded chrome. The report
pages already expose `data-responsive-report-page` in all rendered branches,
while the root body exposes `data-mobile-responsive="on"` when the wave is
active.

The route contract now has two explicit responsive surfaces. Dashboard routes
retain the role-specific visible auth-shell requirement. Only the two exact
assessment report pathname shapes opt into the shell-less report surface; an
arbitrary `/report` suffix and the portal longitudinal report remain normal
auth-shell routes. A shell-less report must prove the responsive body flag,
its visible report-page marker, and the absence of any visible auth shell.
Navigation response, HTTP status, authentication fallback, unexpected redirect,
error-heading, and document-overflow checks are unchanged and still run for
every route.

### RED / GREEN

RED command (from `src/`):

```bash
npx jest src/__tests__/e2e/mobile-responsive-acceptance-contract.test.ts --runInBand
```

Result: exit 1, **3 failed / 30 passed**. The three new behavioral cases could
not load a responsive surface contract. They covered exact route
classification, valid and invalid report presentation evidence, and the
unchanged dashboard-shell requirement. Separate navigation assertions proved
that report auth redirects and HTTP 404s remained rejected before the surface
contract existed.

GREEN with the same command: exit 0, **1 suite / 33 tests passed**. The behavior
contract accepts only a body-flagged, report-marked, shell-less report; rejects
missing body or report markers and reports that render a dashboard shell; and
still rejects a dashboard route without the role-specific auth shell.

### Changed files and validation

- `src/e2e/helpers/responsive-route-contract.ts`
- `src/e2e/helpers/overflow.ts`
- `src/e2e/mobile-responsive-admin.spec.ts`
- `src/src/__tests__/e2e/mobile-responsive-acceptance-contract.test.ts`
- This appended evidence receipt.

Validation from `src/`:

```bash
npx jest src/__tests__/e2e/mobile-responsive-acceptance-contract.test.ts --runInBand
npx eslint e2e/helpers/responsive-route-contract.ts e2e/helpers/overflow.ts e2e/mobile-responsive-admin.spec.ts src/__tests__/e2e/mobile-responsive-acceptance-contract.test.ts
PLAYWRIGHT_BASE_URL=https://preview.example.test npx playwright test e2e/mobile-responsive-coach.spec.ts e2e/mobile-responsive-admin.spec.ts e2e/mobile-responsive-state.spec.ts e2e/mobile-responsive-a11y.spec.ts e2e/mobile-responsive-visual.spec.ts e2e/mobile-responsive-kill-diagnostic.spec.ts --list --reporter=list --project=responsive-compact --project=responsive-medium --project=responsive-tablet-wide --project=responsive-desktop
git diff --check
```

Fresh final verification results: Jest **33/33**, scoped ESLint exit 0 with no
output, Playwright static listing **56 tests in 6 files** across four responsive
projects, and diff check exit 0. The placeholder preview hostname was not
contacted.

Implementation commit: `f42a8a89` (`test: validate shellless report routes`).
This report append is committed separately so it can name the immutable
implementation commit.

### Follow-up limitations

- This is a harness correction only; no product, browser, deployment, or data
  mutation was performed.
- The authorized runtime matrix should be rerun by its owner to confirm the
  previously failing valid report proceeds through the preserved overflow
  assertion at all discovered widths.
- The pre-existing untracked `src/playwright-report/` directory remains
  untouched and excluded.
