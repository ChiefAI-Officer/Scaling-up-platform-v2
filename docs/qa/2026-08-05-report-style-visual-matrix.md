# Report-style visual and print QA matrix — 2026-08-05

## Environment and evidence boundary

This worktree has no `DATABASE_URL`, no `E2E_REPORT_STYLES_DATABASE_URL`, no
local PostgreSQL/Docker runtime, and no seeded isolated acceptance database.
No production credentials were requested or used. The canonical checkout has
its own unshared environment file, but it was not copied or sourced here.
Attempting the worktree's local Playwright web server with an ephemeral
`NEXTAUTH_SECRET` and a signed local ADMIN JWT reached the dashboard shell, but
failed at its unconditional liveness query:
`src/app/(dashboard)/layout.tsx:32` calls `db.user.findUnique`, and Prisma
correctly rejected the missing `DATABASE_URL`. There is currently no Task 15
preview server on port 3015 to reuse. Consequently, the authenticated
admin→coach→submission workflow remains **not run**, not inferred as a pass.
The isolated-database suite fails closed by skipping without its exact fixture
inputs.

Supplemental renderer visual/print evidence does not need that database. The
DB-free harness uses `react-dom/server` to render the Boardroom and Dashboard
component tree from the same allow-listed fixture builder, then injects the
scoped CSS text into Chromium. It bypasses the Next.js CSS import pipeline and
stubs `next/font` variables, so it is **not** an exact or authoritative check of
the compiled production font/CSS pipeline. It exercises component markup,
declared fallback fonts, responsive layout, Axe rules, and print pagination;
the authenticated production-build workflow remains the authoritative visual
gate and is still not run in this environment.

The fixture-only preview route is admin-authenticated in production and has no
database, campaign, respondent, or report-loader import. Its allow-listed
variants are `normal`, `partial`, `degraded`, `max-length`,
`missing-optional`, and `long-branding`; its route test passed on this branch.

## Observed automated evidence

| Check | Command / artifact | Observation |
| --- | --- | --- |
| Fixture variant route contract | `npx jest src/__tests__/app/report-style-preview-page.test.tsx --runInBand` | Passed: 1 suite, 15 tests. All six fixture variants render only through the safe route; unknown variants return `notFound`. |
| Picker keyboard/read-only semantics | Focused Jest matrix (below) | Passed. Admin and coach pickers select via ArrowRight; all three campaign radios are disabled after a first completion. |
| Focused Jest matrix | Task 16 exact 14-suite command | Passed: 14 suites, 171 tests, 1 snapshot. Includes migration, policy, lock, view model, picker, new renderers, contrast/print contracts, admin/coach picker, individual/public/group report, and results-email regression coverage. |
| Browser suite discovery | `npx playwright test e2e/report-styles.spec.ts --list` | Found 8 tests (Chromium + Mobile Chrome): two isolated workflow/race tests, one authenticated fixture-route test, and one DB-free supplemental-component test per browser. |
| DB-free supplemental component matrix | `PLAYWRIGHT_SKIP_WEBSERVER=1 npx playwright test e2e/report-styles.spec.ts --project=chromium --grep 'DB-free supplemental component renderer'` | Passed: 1 Playwright test, 12 style×variant cases, 12 Axe scans, 24 responsive overflow checks/screenshots, and 12 full Letter PDFs. `pdfinfo` confirmed 612×792 pt pages; per-page `pdftotext` confirmed all 111 physical pages nonblank with recurring confidentiality and matching `Page N of M`. This is supplemental component/CSS evidence, not compiled production-font evidence. |
| Whole E2E spec without app server | `PLAYWRIGHT_SKIP_WEBSERVER=1 npx playwright test e2e/report-styles.spec.ts` | 2 supplemental-component project cases passed (Chromium and Mobile Chrome); 6 authenticated/database cases skipped by their explicit environment gates. Mobile Chrome uses the suite's 60-second renderer timeout because it repeats all 12 PDF generations. |
| Fixture-only browser attempt | `NEXTAUTH_SECRET=<ephemeral> NEXTAUTH_URL=http://localhost:3000 E2E_REPORT_STYLES_PREVIEW_BASE_URL=http://localhost:3000 npx playwright test e2e/report-styles.spec.ts --project=chromium --grep 'fixture-only renderer'` | Failed as expected before rendering: signed JWT authenticated, then dashboard liveness query required `DATABASE_URL` at `src/app/(dashboard)/layout.tsx:32`. This predates the guarded launcher; future external-preview runs must also set `PLAYWRIGHT_SKIP_WEBSERVER=1`. No browser/PDF success claimed. |
| Completed-campaign PDF — Boardroom | `e2e/report-styles.spec.ts` | **NOT RUN.** Requires a completed synthetic campaign/report URL. Supplemental component PDF evidence is observed below, but it does not substitute for authorization/loading through the product route. |
| Completed-campaign PDF — Dashboard | `e2e/report-styles.spec.ts` | **NOT RUN.** Same isolated-database prerequisite as Boardroom. |
| Classic flag-off / kill browser parity | `e2e/report-styles.spec.ts` plus focused Jest | **NOT RUN in browser.** Focused server/rendering regressions assert the legacy report remains selected when availability is false; screenshot/DOM parity still needs the isolated browser fixture. |

## Visual matrix

| Renderer / fixture | Desktop | Mobile | Letter PDF | Page count / print defects |
| --- | --- | --- | --- | --- |
| Executive Boardroom / normal | 1280px: inspected; no clip/overlap | 393px: inspected; stacks without horizontal overflow | 9 pages, 612×792 pt; all inspected | No blank page; footer/counter on 9/9 |
| Executive Boardroom / partial | 1280px: inspected; unrated/empty priority states readable | 393px: inspected; tables and badges wrap | 6 pages, 612×792 pt; all inspected | No blank page; footer/counter on 6/6 |
| Executive Boardroom / degraded | 1280px: inspected; warning and orphan row visible | 393px: inspected; degraded notice remains readable | 9 pages, 612×792 pt; all inspected | No blank page; footer/counter on 9/9 |
| Executive Boardroom / max-length | 1280px: inspected; long fields wrap without collision | 393px: inspected; dense but complete, no horizontal overflow | 14 pages, 612×792 pt; all inspected | No blank page; footer/counter on 14/14 |
| Executive Boardroom / missing-optional | 1280px: inspected; absent campaign/coach/CTA fields collapse cleanly | 393px: inspected; no empty placeholder gaps | 9 pages, 612×792 pt; all inspected | No blank page; footer/counter on 9/9 |
| Executive Boardroom / long-branding | 1280px: inspected; cover/footer branding wraps | 393px: inspected; long identity/provenance stays in bounds | 9 pages, 612×792 pt; all inspected | No blank page; footer/counter on 9/9 |
| Modern Dashboard / normal | 1280px: inspected; cards/tables aligned | 393px: inspected; decisions/actions stack | 9 pages, 612×792 pt; all inspected | No blank page; footer/counter on 9/9 |
| Modern Dashboard / partial | 1280px: inspected; unrated matrix rows readable | 393px: inspected; compact matrix stays in bounds | 6 pages, 612×792 pt; all inspected | No blank page; footer/counter on 6/6 |
| Modern Dashboard / degraded | 1280px: inspected; warning/orphan row visible | 393px: inspected; warning and tables remain readable | 9 pages, 612×792 pt; all inspected | No blank page; footer/counter on 9/9 |
| Modern Dashboard / max-length | 1280px: inspected; expanded evidence/action cards do not collide | 393px: inspected; dense content wraps without horizontal overflow | 14 pages, 612×792 pt; all inspected | No blank page; footer/counter on 14/14 |
| Modern Dashboard / missing-optional | 1280px: inspected; optional regions collapse cleanly | 393px: inspected; CTA/coach omissions leave no broken UI | 8 pages, 612×792 pt; all inspected | No blank page; footer/counter on 8/8 |
| Modern Dashboard / long-branding | 1280px: inspected; identity/provenance wrap | 393px: inspected; long coach/company copy stays in bounds | 9 pages, 612×792 pt; all inspected | No blank page; footer/counter on 9/9 |

## Required isolated acceptance run

Provision a disposable migrated PostgreSQL database and set
`E2E_REPORT_STYLES_DATABASE_URL` to its URL, with the report-style feature
enabled. Playwright overwrites the production server child's `DATABASE_URL`
with that exact value and refuses server reuse. Before `npm run build` (which
can run migrations), authentication, or any product mutation, both the server
launcher and isolated suite query a strong sentinel through that same URL.
The fixture setup must create an active organization whose ID matches
`report-style-e2e-sentinel-<20+ random URL-safe characters>` and whose exact
name matches `report-style-e2e-disposable:<32+ random URL-safe characters>`.
It must also create a unique respondent plus three **Classic, unlocked**
campaigns (Executive, Dashboard, and race), with valid one-use invitation
tokens and valid submit JSON. The suite itself creates and deletes one extra
campaign through `POST /api/assessment-campaigns` to prove admin-default
inheritance. The fixture provides the following values only from that isolated
database:

```text
E2E_REPORT_STYLES_DATABASE_URL
E2E_REPORT_STYLES_DISPOSABLE_SENTINEL_ID
E2E_REPORT_STYLES_DISPOSABLE_SENTINEL_VALUE
E2E_REPORT_STYLES_ADMIN_SETTINGS_PATH
E2E_REPORT_STYLES_CREATE_CAMPAIGN_BODY
E2E_REPORT_STYLES_EXECUTIVE_CAMPAIGN_PATH
E2E_REPORT_STYLES_DASHBOARD_CAMPAIGN_PATH
E2E_REPORT_STYLES_EXECUTIVE_REPORT_PATH
E2E_REPORT_STYLES_DASHBOARD_REPORT_PATH
E2E_REPORT_STYLES_EXECUTIVE_EXCHANGE_PATH
E2E_REPORT_STYLES_EXECUTIVE_INVITATION_TOKEN
E2E_REPORT_STYLES_EXECUTIVE_SUBMIT_BODY
E2E_REPORT_STYLES_DASHBOARD_EXCHANGE_PATH
E2E_REPORT_STYLES_DASHBOARD_INVITATION_TOKEN
E2E_REPORT_STYLES_DASHBOARD_SUBMIT_BODY
E2E_REPORT_STYLES_RACE_CAMPAIGN_PATH
E2E_REPORT_STYLES_RACE_EXCHANGE_PATH
E2E_REPORT_STYLES_RACE_INVITATION_TOKEN
E2E_REPORT_STYLES_RACE_SUBMIT_BODY
E2E_REPORT_STYLES_RACE_PATCH_PATH
```

The DB-free supplemental component suite above is observed supporting evidence.
The separately retained authenticated fixture-route suite can additionally be
run against a Task 15 preview server with
`PLAYWRIGHT_SKIP_WEBSERVER=1` and `E2E_REPORT_STYLES_PREVIEW_BASE_URL`; it
verifies the protected route itself and its representative one-page captures.

Then let Playwright's guarded launcher build and start the production app with
the same isolated database, inspect the output PNG/PDF files, and replace every
`Not run` cell above with the observed page count and any defect/resolution.
The workflow capture must verify full report routes—not the single-page preview
host—and must leave the current admin navigation unchanged.
