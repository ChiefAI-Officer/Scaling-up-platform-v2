# Release readiness — 27 August 2026

Status: local composition visual approved; **publication held**. No branch push,
PR creation, merge, deployment, live data change, or flag change in this gate.
The active user preview at `http://127.0.0.1:53953` remains running.

## Scope and approval

The user approved the revised CEO/Team selection screen (“looks good”), then
authorized release validation and PR preparation (“proceed”). Production remains
a separate explicit gate. This branch implements the shared foundation and
**Scaling CEO Full only**, not the entire seven-type catalog. Placeholders,
import/deletion flows and unrelated editor work remain out of scope.

The current UI revision changes no schema, API contract, renderer or report
calculation. It changes source selection/assignment presentation and tests.

## Scoped review and corrections

A read-only subagent review identified three bounded issues, all re-reviewed
with no remaining actionable finding:

1. Refreshed incompatible assigned sources now remain visible with the reason;
   Review stays blocked until they are removed. A regression test failed before
   the fix and passes afterward.
2. Same-name choices now expose full submission identity and provenance through
   `aria-describedby`. A regression test failed before the fix and passes afterward.
3. Mobile E2E assertions now check all scroll ancestors for separation from the
   Review footer, the pending-selection message, and the actual bottom Team Add
   action rather than only a nested row's Remove control.

An initial E2E run passed four tests but timed out after five seconds on login
following flag-test server restarts. Its retained application log shows accepted
credentials and a successful `/portal/home` load; the failure screenshot shows
the authenticated dashboard. The bounded navigation wait is now 15 seconds to
allow cold development compilation. Authentication and assertions are not bypassed.

## Final focused and runtime validation

All commands ran from this worktree's `src/`, with no customer database access.
Build and full Jest use a scrubbed environment rather than `.env` credentials.

| Check | Result |
| --- | --- |
| Five focused Jest suites: wizard, panel, campaign host, API, candidates | **83/83 passed** |
| Two UI suites after review fixes | **32/32 passed** |
| ESLint: both UI files, both changed component test files, E2E spec | **exit 0** |
| Migration safety | **43 migrations; exit 0** |
| `CI=true next build --turbopack`, Node 20 | **exit 0; TypeScript passed; 92/92 static pages** |
| Fresh Chromium E2E suite | **5/5 passed, 2.4 minutes** |
| Full repository Jest suite | **600 suites / 7,159 tests passed; 8 suites / 22 tests failed; exit 1** |

The successful build still logs expected missing Inngest keys, missing database
configuration during static collection, the workspace-lockfile warning and the
middleware deprecation warning. These are disclosed, not reported as live-service
verification. A prior standalone repository `tsc --noEmit` also had broader test
typing failures; the successful production build does not erase that observation.

E2E ran in a separate local app copy so the user's preview/database was untouched:
`.worktrees/summary-release-check.iU6Fzr/src`. The fixture used real NextAuth,
loopback PostgreSQL, application routes and renderer; private Blob transport was
simulated and the limiter was development-only. Final temporary resources were
`/tmp/summary-proof-0SYfOZ`, PostgreSQL port 54782, app port 54783. Fixture cleanup
stopped only those test processes and removed only its disposable database;
logs, screenshots and generated PDFs remain. The user's separate preview did
not stop.

Covered: coach/admin catalog parity; independent composition, ordering and
creation; repeat requests; authorized PDF view/download; frozen byte/hash identity;
tamper and immutable database constraints; unsupported/DRAFT/kill/off states;
concurrent same-ID creation (503/201, successful retry, one report/source/audit/
artifact). Test report `900ffed0-db68-433a-93c3-4dd6cfe91e17` artifact SHA-256:
`a701d72dab9f347fc521ed08f1d49abe241abaeaed89095efe07ca89bc4fce3c`.

Inspected captures: `composition-desktop.png` (1440px full-page),
`composition-pending-mobile-viewport.png` and
`composition-bottom-mobile-viewport.png` (390×844). Mobile component controls,
pending warning and Review footer are readable and separated. Existing coach
host overflow remains: 901px document at 390px viewport with the feature both on
and off. This revision does not claim to fix the whole coach host or establish
pixel-identical Esperto/PDF parity.

Logs are retained under ignored `src/test-results/`:
`summary-release-focused-final.log`, `summary-release-build-final.log`,
`summary-release-e2e-final.log`, `summary-release-full-jest-final.log`.
Earlier non-final runs remain separately named and are superseded by final runs.

## Full-suite failures: classification, not blanket dismissal

The fresh full run completed in 250.527 seconds: **608 suites / 7,181 tests**, of
which **8 suites / 22 tests failed**, and **12/12 snapshots passed**. Eight failures
are missing-database checks; the other 14 occur in the seven listed test areas.
No existing assertion was weakened and no unrelated product behavior was changed
to make them pass. Both newly added UI regressions pass in this final full run.

| Area | Observed failure |
| --- | --- |
| LVA display | Test expects `lva-fidelity-v1`; code returns v2 |
| Invitation exchange | Future-open-date response differs from test expectation |
| Auth-surface guard | Two existing admin campaign/organization pages absent from allowlist |
| Migration verification | Eight database assertions cannot run without `DATABASE_URL` |
| Portal campaign status filter | Test fixtures lack required `metrics.total` |
| Date-format lint guard | Existing public quiz contains prohibited date-format calls |
| Admin organizations | Test fixtures lack referenced coach/name data |
| Dashboard statistics | Expected query omits current `deletedAt:null` filter |

The seven non-database test/implementation areas are unchanged from merge-base
`16d5a29c31c2db64e7f4d11c4053f4bb9f5d43db` by read-only file diff. This is history
evidence, **not a fresh execution of the entire baseline suite**. The database
suite needs an isolated fully migrated database; no production database was
borrowed just to satisfy it. These remain release-gate failures/environment gaps.

## Integration blocker

Branch: `codex/summary-reporting-tracer`, HEAD `dad03dd4` plus this uncommitted
composition revision. Fetched `origin/main` at
`95d2228c9114982574d4cf60af897aae60b3e3f8`.
`git rev-list --left-right --count origin/main...HEAD` reports **208 / 31**.

Read-only `git merge-tree --write-tree --name-only HEAD origin/main` exits 1,
without editing the index or worktree. Eight conflicts:

- `CLAUDE.md`
- `plans/CHANGELOG.md`
- `src/prisma/schema.prisma`
- `src/src/__tests__/app/admin-campaign-detail-page.test.tsx`
- `src/src/__tests__/app/portal-campaign-detail-publish-gate.test.tsx`
- `src/src/app/(dashboard)/admin/assessments/campaigns/[id]/page.tsx`
- `src/src/app/(portal)/portal/assessments/[id]/page.tsx`
- `src/src/components/assessments/CampaignDetail.tsx`

This simulation checks committed HEAD; the local composition revision is not a
substitute for rerunning integration on the final committed candidate. Output:
`src/test-results/summary-release-merge-check.log`.

## Next bounded gate

Preserve the approved preview. Integrate current main in a separate worktree,
resolve only the summary-reporting overlaps while retaining newer host/schema
features, review the integration diff, and rerun gates against the integrated
candidate. Diagnose the surviving full-suite failures without changing unrelated
product rules or merely loosening tests. Only then publish the feature branch/PR.
Protected Build and Migration Safety checks, private Blob/distributed limiter
verification, approved canary, actual output acceptance and explicit production
go-ahead remain prerequisites. A local, unpublished PR body is in `pr-draft.md`.
