# SDD ledger — plan: docs/superpowers/plans/2026-08-12-mobile-responsive-foundation.md

## Setup

- Worktree: `/Users/diushianstand/Scaling-up-platform-v2/.worktrees/mobile-responsive-foundation`
- Branch: `codex/mobile-responsive-foundation`
- Base: `origin/main` at `54cce7ae`
- Approved design/spec: `docs/superpowers/specs/2026-08-12-mobile-responsive-foundation-design.md`
- Plan/design commits cherry-picked only: `39b19bb3`, `c9568e24`
- Baseline: `npm test -- --runInBand` — PASS, 692 suites / 8,619 tests / 16 snapshots, 0 failures (2026-08-13)

## Preflight shared-file and interface scan

| Tasks | Producer → consumer / shared surface | Finding |
| --- | --- | --- |
| 1 ↔ 2 | `globals.css`; root gate scopes shared primitives | Compatible; Task 2 must keep all new selectors inert without the Task 1 body marker. |
| 1 ↔ 3 | `mobile-responsive-shell.spec.ts`; gate feeds coach hosts | Compatible; Task 3 extends, rather than replaces, the shell regression. |
| 1 ↔ 10 | `overflow.ts`; shell marker and helpers feed final matrix | Compatible; Task 10 may extend diagnostics but must preserve Task 1 export. |
| 1 ↔ 2/3/5/6/8/9 | `isMobileResponsiveEnabled()` and gated shell attributes | Compatible; every downstream optional prop defaults false and is passed only from gated hosts. |
| 2 ↔ 3/4/6/7/8/9 | shared headers, data views, action menus, tables, tabs, dialogs | Compatible; domain owners retain state/mutations while shared primitives own presentation only. |
| 3 ↔ 4 | `mobile-responsive-coach.spec.ts` | Compatible; route inventory is cumulative. |
| 3 ↔ 9 | portal workshop detail | Compatible; Task 3 reflows the page, Task 9 later hardens dialogs and errors without changing handlers. |
| 3 ↔ 10 | `mobile-responsive-coach.spec.ts` | Compatible; Task 10 completes widths, routes, state and a11y. |
| 4 ↔ 8 | `wireframes-scoped.css` | Compatible; Task 4 owns wizard reflow, Task 8 owns editor/assessment workspace rules; selectors must remain scoped. |
| 4 ↔ 9 | `CampaignWizard.tsx` | Compatible; Task 4 adds progress/reflow, Task 9 threads the responsive dialog contract without changing draft state. |
| 4 ↔ 10 | coach E2E route inventory | Compatible; Task 10 expands existing assertions. |
| 5 ↔ 8 | admin organizations host | Compatible; Task 5 owns members drill-in, Task 8 owns assessment-host container/navigation. |
| 6 ↔ 7 | `mobile-responsive-admin.spec.ts` | Compatible; Task 7 appends collection coverage. |
| 6 ↔ 8 | `mobile-responsive-admin.spec.ts` | Compatible; Task 8 appends assessment coverage. |
| 6 ↔ 10 | `mobile-responsive-admin.spec.ts` | Compatible; Task 10 turns the incremental sweep into the complete matrix. |
| 7 ↔ 8 | `mobile-responsive-admin.spec.ts` | Compatible; cumulative inventory only. |
| 7 ↔ 10 | `mobile-responsive-admin.spec.ts` | Compatible; cumulative inventory only. |
| 8 ↔ 10 | `mobile-responsive-admin.spec.ts` | Compatible; Task 10 supplies final widths/projects and state/a11y coverage. |
| 9 ↔ 10 | dialog/touch/report contracts feed state and a11y matrix | Compatible; Task 10 verifies the behavior Task 9 introduces. |
| 10 ↔ 11 | automated matrix feeds physical acceptance | Compatible but external boundary: Task 11 requires a preview deployment and physical iPhone/iPad use. |
| 11 ↔ 12 | physical evidence feeds release gates and SoT | Compatible; Task 12 must not claim physical PASS without recorded evidence. |

## Preflight task self-consistency scan

| Task | Tests ↔ implementation ↔ later consumers | Finding |
| --- | --- | --- |
| 1 | Flag unit RED/GREEN; overflow helper and shell E2E; exports consumed later | Internally consistent. E2E may require available local auth/seed data; authentication setup failure is not acceptable overflow RED evidence. |
| 2 | Missing-module RED; shared primitive GREEN; props consumed by Tasks 3–9 | One conflict: the proposed unconditional `Table` wrapper classes would change flag-OFF styling. See Ruling 1. |
| 3 | Workshop card unit + coach route RED; presenter and host changes | Internally consistent; wide slot and filter state must remain unchanged. |
| 4 | Existing campaign suites gain RED assertions; wizard/detail implementation | Internally consistent; action handlers and draft indexes stay authoritative. |
| 5 | Drill-in state/fetch-count RED; one selected-domain state | Internally consistent; presentation boolean must not duplicate selection state. |
| 6 | Two missing-card REDs + admin E2E; card integration | Internally consistent; query/filter/pagination/mutations remain in owners. |
| 7 | Shared record RED then explicit per-domain field map and route sweep | Large but internally consistent; route-local presenters use the tested semantic primitive. |
| 8 | Compact-nav and editor REDs; assessment route migration | Internally consistent; ED1–ED10 flags and callbacks remain unchanged. |
| 9 | Dialog/report edge-state REDs; a11y/touch hardening | Internally consistent; responsive props default false and print order stays unchanged. |
| 10 | Explicit projects/inventories/state/a11y/visual parity | Internally consistent; kill-switch run intentionally proves old RED failures return and is not a passing responsive matrix. |
| 11 | Acceptance document before physical sweep; evidence gates completion | Execution requires external preview side effect and physical devices. Do not fabricate or substitute emulator evidence for the table. |
| 12 | Full tests/build, SoT update, launch handoff | One timing issue: hard-coded 2026-08-12 may be stale when completed; use the actual completion date while keeping the approved slug. See Ruling 2. Production launch remains explicitly out of scope. |

## Rulings

- Ruling 1: For Task 2 `Table`, preserve the exact existing wrapper classes and DOM when `responsiveEnabled` is false; apply `max-w-full`, rounded/border presentation hooks, region attributes, and focusability only when responsive behavior is explicitly enabled. The spec/global flag-OFF parity requirement outranks the illustrative unconditional snippet. Cost if wrong: a flag-OFF desktop visual regression or snapshot drift.
- Ruling 2: When Task 12 is actually completed, use the real completion date for the changelog/CLAUDE ISO anchor and preserve the approved slug `mobile-responsive-foundation-wave-1`; do not backdate build evidence. Cost if wrong: SoT chronology differs from the plan’s example date but remains factually accurate.
- Ruling 3: Execute Tasks 1–10 locally without routine pauses. Before Task 11, stop if a preview deployment or other external side effect is still required; physical-device PASS cannot be inferred from emulation. Cost if wrong: implementation may be launch-ready but not physically accepted until the user authorizes/provides the required environment and devices.
- Ruling 4: Task 2 `ResponsiveActionsItem` keeps Radix menu-item semantics (`role="menuitem"`), and its test must open the menu through the supported pointer/keyboard interaction and assert `menuitem`, not incorrectly assert that the item is a button. Do not add a custom click-only production path solely to satisfy the illustrative test. The approved accessibility contract and the brief’s required Radix primitive outrank the inconsistent role assertion. Cost if wrong: a test differs from the plan snippet, but the product keeps correct menu semantics and focus behavior.
- Ruling 5: Keep `ResponsiveDataView.wideFrom` as the plan-specified `sm | md | lg` choice with default `md`. The approved design says medium layouts (640–1023px) may use a reduced-column table or card/table hybrid when the selected columns fit; Task 3 explicitly chooses `lg` for the dense workshop table. The reviewer’s claim that no “wide” presenter may appear before 1024px conflicts with both the task interface and the design’s measured-fit rule. Cost if wrong: a consumer could choose `sm`/`md` for data that does not fit, so consuming-route overflow tests remain mandatory and must select `lg` where needed.
- Ruling 6: After Task 3 fix round 5, park the required coach browser GREEN as real but environment-blocked: no authorized populated-coach credentials exist, and the repository’s safe isolated bootstrap seeds either auth users or workshops but not an authenticated coach who owns one. The three code findings are reviewed clean. Task 10 must create or adopt a repository-supported isolated authenticated fixture topology before the full route matrix can pass; until then, Task 3’s browser proof remains explicitly open. Cost if wrong: a remaining route overflow could survive until Task 10, but no credential/data mutation, auth bypass, or weakened discovery is introduced now.
- Ruling 7: Split oversized Task 7 into sequential verified subparts: foundation (shared record + route sweep), A coaches/contacts/partners, B templates/bios/create-edit, C approvals/categories/pricing/financials/refunds/settings, D registrations/surveys, E workflows/transactional emails + final sweep. The original task spans 32 owners/10 domains/~6,975 LOC and cannot be a coherent atomic TDD dispatch. Review the combined Task 7 range after all subparts. Cost if wrong: more commits/review packages and coordination overhead, but each domain stays testable and no partial oversized implementation is silently accepted.

## Task progress

- Task 1: fix round 1/5 (2 addressed, 0 open — compact controls now ≥44×44; 639/640/1023/1024 boundary probes added; commits `16fa7ea2..9068945f`)
- Task 1: minor (deferred): viewport metadata assertion should explicitly reject `maximum-scale=1` and `user-scalable=no`; final review must triage.
- Task 1: ⚠ resolved by controller: resize/rotation focus and state preservation is explicitly implemented and verified by Task 10 `mobile-responsive-state.spec.ts`, not by the Task 1 shell probe.
- Task 1: complete (commits `c9568e24..9068945f`, review clean; one deferred minor)
- Task 2: in progress (base `9068945f`; fresh implementer dispatch pending)
- Task 2: Ruling: retain plan-specified `ResponsiveDataView` breakpoint flexibility; no production change for reviewer Critical finding.
- Task 2: minor (deferred): add explicit default-breakpoint contract coverage if final review finds the current explicit `lg` coverage insufficient.
- Task 2: fix round 1/5 starting for enabled `TabsList` prop-order enforcement (implementation commit `79e41a2f`).
- Task 2: fix round 1/5 (1 addressed, 0 open — responsive tab hooks enforced after caller props; commits `79e41a2f..3c1dec9d`).
- Task 2: complete (commits `9068945f..3c1dec9d`, review clean after Ruling 5; one deferred minor).
- Task 3: in progress (base `3c1dec9d`; fresh implementer dispatch pending).
- Task 3: implementation commit `26c3c320`; fix round 1/5 starting for labeled wide-table scroll, compact cost/landing capability, 44px targets, and authenticated browser GREEN.
- Task 3: fix round 1/5 (3 addressed, 1 open — required post-change coach+shell browser GREEN; commits `26c3c320..566df16e`).
- Task 3: fix round 2/5 starting with corrected authenticated test setup; no product-code broadening authorized.
- Task 3: fix round 2/5 (0 addressed, 1 open — admin shell authenticates; populated coach identity returns 401; no commits).
- Task 3: fix round 3/5 starting with one remaining known populated coach identity; read-only authentication attempt only.
- Task 3: fix round 3/5 (0 addressed, 1 open — second populated coach identity returns 401; no commits).
- Task 3: fix round 4/5 starting with fresh implementer/higher reasoning to locate an existing authorized local `E2E_COACH_*` credential source without exposing values.
- Task 3: fix round 4/5 (0 addressed, 1 open — no authorized local `E2E_COACH_*` source exists in bounded project/env scope; no commits).
- Task 3: fix round 5/5 starting with fresh implementer to evaluate repository-supported isolated local DB/bootstrap only; canonical remote DB is out of scope.
- Task 3: fix round 5/5 (0 addressed, 1 open — safe bootstrap exists but no supported seed creates authenticated coach + owned workshop; no commits).
- Task 3: parked — required post-change coach browser GREEN — Ruling: real environment fixture gap deferred explicitly to Task 10; all product-code findings addressed and re-reviewed.
- Task 3: complete (commits `3c1dec9d..566df16e`, 1 parked after breaker).
- Task 4: in progress (base `566df16e`; fresh implementer dispatch pending). Carry Task 3 parked fixture finding for any browser suite using coach dynamic discovery.
- Task 4: implementation commit `2dbdf502`; fix round 1/5 starting for real 44px campaign links, wizard choice hit areas, and labeled compact respondent cards.
- Task 4: minor (deferred): icon-only Remove respondent needs explicit `min-w-11`/touch hook; final review must triage.
- Task 4: fix round 1/5 (3 addressed, 0 open — real 44px campaign link, semantic wizard choice targets, labeled respondent cards; commits `2dbdf502..915cc6d8`).
- Task 4: complete (commits `566df16e..915cc6d8`, review clean; one deferred minor; inherits Ruling 6 browser fixture gap).
- Task 5: in progress (base `915cc6d8`; fresh implementer dispatch pending).
- Task 5: implementation commit `c8610b4b`; fix round 1/5 starting for compact-back→medium interaction reconciliation and team edit-label spacing.
- Task 5: fix round 1/5 (2 addressed, 0 open — breakpoint re-entry and team edit spacing; commits `c8610b4b..b3c2e538`).
- Task 5: minor (deferred): mirror organization breakpoint re-entry regression for team and unassigned selections; implementation paths reviewed correct, final review to triage.
- Task 5: complete (commits `915cc6d8..b3c2e538`, review clean; one deferred test minor).
- Task 6: in progress (base `b3c2e538`; fresh implementer dispatch pending).
- Task 6: implementation commit `1f7b0910`; fix round 1/5 starting for bio file-row containment, actual workshop type, Radix workshop action semantics, and landing control stack/touch targets.
- Task 6: fix round 1/5 (4 addressed, 0 open — bio containment, type+tier, Radix actions, landing controls; commits `1f7b0910..798aabb3`).
- Task 6: complete (commits `b3c2e538..798aabb3`, review clean; browser artifact unverified for final gate).
- Task 7: in progress (base `798aabb3`; fresh implementer dispatch pending).
- Task 7: Ruling: split into foundation + A–E sequential subparts; browser RED blocked by `NO_SECRET`, carried as environment evidence, not pass.
- Task 7C: fix round 1/5 (4 addressed, 3 open — truthful metadata, bounded tables, filters, financial grid fixed; parity tests, full approval primitives, and touch regression evidence remained; commits `3505d06d..018c1dfc`).
- Task 7C: fix round 2/5 (2 addressed, 1 open — structural flag-OFF parity and touch/shared-primitive regression evidence fixed; exact approval legacy class ordering remained; commits `018c1dfc..c1478951`).
- Task 7C: fix round 3/5 (1 addressed, 0 open — exact approval legacy DOM/class parity restored; commits `c1478951..e4f7ac2b`).
- Task 7C: complete (commits `d86e9cd8..e4f7ac2b`, review clean; browser overflow evidence remains inherited environment-blocked by `NO_SECRET`).
- Task 8: Ruling: split sequentially into 8A navigation/route hosts, 8B assessment data collections, and 8C editor reflow; review the combined Task 8 range after all three. Cost if wrong: additional commits and bookkeeping, but presentation ownership remains bounded and independently testable.
- Task 8A: complete (commit `cc425fa1`; base `166469dc`; compact navigation + route host foundation; 37 focused and 9 existing host tests pass; browser execution parked by `NO_SECRET`, Playwright `--list` passes).
- Task 8B: in progress (base `cc425fa1`; assessment data collections and operational presenters only; editor ownership remains in 8C).
- Task 8B: Ruling: apply the SDD ledger, TDD, verification, and review gates locally without spawning implementer/reviewer agents because the controlling Task 8B dispatch explicitly says "Do not spawn subagents." Cost if wrong: review independence is reduced, so the final local diff review and parent review must scrutinize flag-OFF parity and action preservation.
- Task 8B: preflight scan — templates, access-groups list/detail, legacy public campaigns, observability/import-health, and aggregate report share only `responsiveEnabled?: boolean` (default false), `ResponsiveDataView`, and `ResponsiveRecord`; their data fetches/mutations are independent and no presenter consumes another presenter. The seven 8A server hosts already evaluate the root flag and only need explicit prop forwarding. No cross-slice conflict found; 8C editor files remain untouched.
- Task 8B: Ruling: convert only repeated record/list surfaces in ImportHealthPanel and ObservabilityDashboard; keep metric/stat grids as reflowing grids. Keep aggregate comparison tables as labeled bounded inner scroll regions, never cards. Cost if wrong: a list could remain less ergonomic at compact width, but comparison semantics and operator metric density are preserved as required.
- Task 8B: complete (assessment templates, access groups list/detail, legacy public campaigns, import health, observability, and aggregate report; 15 focused/regression suites and 83 tests pass; Playwright 12-test inventory lists; browser execution parked by `NO_SECRET`).
- Task 8C: complete (template editor shell, ED6/ED9 builders, inspector, scoped touch/layout CSS, and version-editor flag forwarding; 14 editor regression suites / 80 tests / 11 snapshots pass; bounded TypeScript diagnostics 0; Playwright 6-test inventory lists; browser execution parked by `NO_SECRET`).
- Task 8 combined fix Ruling: Wave 1 keeps secondary editor commands inline and wrapping; no responsive action-menu migration, preserving the existing callback and focus paths required by the Task 8 brief. Cost if wrong: compact headers may remain denser than a menu-based redesign, but no command ownership or focus behavior is forked.
- Task 8 combined reviewer fixes: complete (responsive submission domain details restored; reviewer-named direct controls satisfy the 44px contract; one persistent adaptive report-style picker survives breakpoint resize; 36 suites / 291 tests / 11 snapshots pass; browser remains parked by `NO_SECRET`).
- Task 9 Ruling: split Task 9 sequentially into 9A dialogs/error forms and 9B reports/touch E2E, with combined review after both. 9A may touch `members-teams-view.tsx` and the admin workshop detail page only to forward their already-evaluated responsive flag. Cost if wrong: extra coordination and one broader host diff, but the responsive dialog contract would otherwise remain disconnected.
- Task 9A: complete (commit `23e8dd37`; responsive organization/workshop dialogs, navigable Add Member error summary, preserved retry state, bounded CSV preview; 9 modal/dialog/host suites / 90 tests pass; bounded changed-file TypeScript diagnostics 0; no browser run under inherited `NO_SECRET`).
- Task 9B: complete (commit `0590fe4c`; gated report containment and named wide-data regions; mechanical server-host flag forwarding; reusable Node-safe visible touch-target assertions; Radix Escape/outside/focus-restoration coverage; fresh exact focused suites 6/6 and 68/68 tests pass; changed-file ESLint passes; bounded changed-path TypeScript diagnostics 0 while the repository baseline remains red; Playwright `--list` discovers 66 tests including 640/768/1023 widths; browser execution remains parked by inherited `NO_SECRET`; generated Playwright report moved to Trash).
- Task 9 integrated Important-review closure: complete (multi-field accessibility, responsive-only in-flight availability, all-visible-control touch audit, supported dismissal/focus E2E flows, actual report scroll-owner regions, screen-only print containment, and Trends native-anchor OFF parity; 16 suites / 176 tests pass; changed-file ESLint clean; bounded changed-path TypeScript diagnostics 0; Playwright parse/list 66 tests; browser remains parked by inherited `NO_SECRET`).
- Task 9 integrated fix round 2: complete (Edit Team responsive Save/Delete use independent action locks while flag-OFF retains the legacy shared lock; coach actual backdrop shares focus-restoring dismissal and the Playwright flow targets it directly; 2 suites / 20 tests pass; shell Playwright parse/list 14 tests; scoped ESLint and bounded changed-path TypeScript clean; browser remains parked).
- Task 10: Ruling: add an ephemeral `NEXTAUTH_SECRET` only to the isolated Playwright process; do not add an application fallback or change production auth. Cost if wrong: local acceptance depends on an explicit process variable, but production keeps its fail-closed secret posture.
- Task 10: safe fixture audit complete — standalone task-specific PostgreSQL on loopback only; guarded bootstrap + standard seed + guarded assessment seeds yielded 3 workshops, 5 assessment templates/versions, 1 access group, 1 workflow, and 2 survey templates, but 0 authenticated-coach-owned workshops, 0 organizations, and 0 campaigns. Ruling 6 remains open.
- Task 10: authenticated browser attempt blocked before test execution — Next 16 inferred the outer worktree root and could not resolve `tailwindcss`; no overflow offender was named, so no product code changed. Standalone DB stopped and recoverably moved to Trash; generated Playwright artifacts moved to Trash.
- Task 10: harness complete with runtime blocked (exact 14 coach / 31 admin static inventories; required dynamic live discovery; exact 10-width inventory; 4 viewport projects; 5 state scenarios; Axe/keyboard/touch and 24-image visual contract; 48 Playwright tests list; scoped ESLint clean; bounded Task 10 TypeScript diagnostics 0; no visual baselines generated; matrix/Axe/visual/kill proof not run). Report: `.superpowers/sdd/2026-08-12-mobile-responsive-foundation/task-10-report.md`.
- Task 10 finalization: **HARNESS COMPLETE — RUNTIME BLOCKED**. Fresh `git diff --check` and scoped ESLint exit 0; repository TypeScript baseline exits 1 with 0 Task 10 diagnostics; all 5 Task 10 specs list 48 tests across compact/medium/tablet-wide/desktop. No browser/snapshot/kill-switch run. Port 55433 and the task database process are absent; prior exact temp cluster remains recoverably in Trash; the final generated HTML report was moved to `/Users/diushianstand/.Trash/playwright-report-task10-finalize-20260813-67858`. Safe seed still has auth coach but 0 owned workshops/0 orgs/0 campaigns; process-only secret resolved `NO_SECRET`, then Next 16 outer-root inference failed Tailwind resolution before Playwright execution.
- Task 10 reviewer hardening: complete (fail-closed null/auth-fallback/redirect/path + role-shell route contract; direct Axe/visual guard; complete overlay lifecycle/focus evidence; exact Organization/member/fetch identity evidence; real-selector visual contract; separately opt-in named-offender KILL diagnostic and shared-baseline OFF/KILL desktop parity lane). RED-first Jest contract now 13/13 PASS; scoped ESLint and diff hygiene pass; 6 Task 10 specs list 56 tests across four projects. Browser/Axe/visual/parity/kill execution remains blocked and unrun; no snapshots generated.
- Task 10 live-preview remediation: fix round 1/5 (2 addressed, 0 open — conditional flag-OFF accessibility attributes and non-colliding responsive tier actions; commits `790055aa..be477f2f`).
- Task 10 live-preview remediation: fix round 2/5 (1 addressed, 0 open — portal settings now forwards its already-evaluated root responsive flag; commit `44e9e6b1`; scoped re-review clean; live recheck clean at 11 widths from 320 through 1366).
- Task 10 route inventory correction: complete pending runtime (commit `8bed2012`; evidence `efea3340`; review clean before runtime).
- Task 10 runtime matrix: first external preview execution completed read-only. Coach medium/tablet-wide/desktop static lanes passed. Exact failures: admin files 320 root 483; coach new assessment 320 root 358; feature-gated public-campaign creation redirected when unavailable. Product overflows entered live-preview remediation round 3; route assumption entered inventory fix round 1.
- Ruling 8: `/admin/assessments/public-campaigns/new` is not an unconditional owner. Runtime truth outranks the initial inventory assumption: discover the exact authenticated link and test only when exposed, without allowing redirects. Cost if wrong: a gated create owner could escape static coverage when navigation hides it, but an inaccessible redirect is no longer mislabeled as a responsive failure.
- Task 10 live-preview remediation: fix round 1/5 (2 addressed, 0 open — conditional flag-OFF accessibility attributes and non-colliding responsive tier actions; commits 790055aa..be477f2f).
- Task 10 live-preview remediation: complete (commits d9009e85..be477f2f, review clean).
- Task 10 live-preview remediation: fix round 3/5 (2 addressed, 0 open — responsive-only FileManager filter containment and scoped CampaignWizard full-stepper suppression below 640px; commit `2d701212`; 3 focused suites / 16 tests and scoped ESLint pass; browser remeasurement remains unrun).
- Task 7C live-review follow-up: complete (4 Important gaps addressed, 0 open — exact category/pricing OFF action parity, stacked approval filters, explicit 44×44 admin-operation targets, and corrected financial revenue row anatomy; implementation `9c322083`; 5 focused/shared suites / 21 tests, scoped ESLint, and diff hygiene pass).
- Task 10 survey-template/toast overflow follow-up: implementation complete, live remeasurement pending (root cause confirmed in independently unanchored global ToastViewport plus disconnected survey-template responsive host; implementation `83b93a08`; corrected RED 4 failed/3 passed, GREEN 4 suites/7 tests, neighboring 6 suites/17 tests, scoped ESLint 0 errors, diff hygiene pass; no deploy/data change).
- Task 10 survey-template/toast overflow follow-up: **LIVE GREEN** on flagged preview `dpl_EHz93wjeqq9AVB9auC3uJnXgtgUi` at 320px — `scrollWidth=clientWidth=305`, ToastViewport anchored `left=0`, and Delete Template measured `273x44`; independent focused review clean.
- Task 10 final static runtime matrix: **8/8 passed in 10.2m** against flagged preview across admin + coach and compact `[320,375,390,430]`, medium `[600,768,1023]`, tablet-wide `[1024,1366]`, and desktop `[1440]` inventories.
- Task 10 final populated admin runtime matrix: **4/4 passed in 4.0m** against the same preview; real workshop, landing manager/editor, coach detail/edit, available assessment/access-group/campaign/workflow/survey/email records, and exposed standalone reports reached the fail-closed responsive route/overflow assertion at every project width.
- Task 10 final verification: 7 focused suites / 57 tests passed; scoped ESLint 0 errors (2 pre-existing unused-import warnings); migration safety checked 47 migrations; `git diff --check` clean; Vercel build/deploy READY and preview health 200 (`database=healthy`, `authPosture=safe`); local Turbopack build exited 0. Physical iPhone/iPad acceptance and production promotion remain explicitly unperformed.
