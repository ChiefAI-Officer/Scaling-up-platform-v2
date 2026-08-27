# Summary Reporting — production release receipt, August 27, 2026

**Current status: deployed and live-canary verified; global enablement still off pending user acceptance.** The packaging incident below is resolved. [Open the production Admin campaign](https://platformtest.scalingup.com/admin/assessments/campaigns/cmt3sxj95000g1bznjubxw4ms), then Reports → View. [Open the saved PDF](https://platformtest.scalingup.com/api/assessment-campaigns/cmt3sxj95000g1bznjubxw4ms/summary-reports/512c509c-171e-4013-a642-b683ca232f7f/artifact?disposition=inline) requires an authorized session.

## Authority and scope

The user accepted the revised local CEO/Team composition, understood that only Scaling Up CEO Full is implemented, and requested: “push to prod now. then assess and recommend next steps”. The approved plan still requires actual live-canary PDF acceptance before global enablement. No unrelated feature or customer messaging is authorized by this release.

## Integration

- Release workspace: `.worktrees/summary-reporting-production`; branch `codex/summary-reporting-production`.
- Main baseline: `95d2228c9114982574d4cf60af897aae60b3e3f8`; feature foundation: `dad03dd4`, plus the accepted local composition revision.
- Existing preview on loopback port 53953 and its synthetic database are preserved.
- Conflict resolution preserves current-main campaign settings, report appearance/presentation gates, responsive controls, invitation/results-email functionality, and native comparisons. One conditional authorization lookup serves both legacy and new group-report capabilities.
- Migration `20260827090000_add_summary_reports` is additive; existing tables/data are not rewritten. Immutable report/source triggers are exercised by the isolated database tests.
- Local fixture baseline is updated to current pre-feature main so newer required columns exist before applying the exact new migration.

## Verified infrastructure

- Project `prj_xcAWuAmGZAU3DCHgAauRv2WPKneo`, team `scaling-up`.
- Private store `store_OX5JX5N2nVCfGk4H`, name `scaling-up-summary-reports`, region `iad1`.
- Connection `spc_6WK125nDuWDMN178`, prefix `SUMMARY_REPORT_BLOB`, Preview + Production only; expected server-only `SUMMARY_REPORT_BLOB_READ_WRITE_TOKEN` present.
- Synthetic private upload/read: 95 bytes, authenticated 200 with exact content; anonymous URL access 403. The sole probe object was deleted and the store verified empty.
- Existing distributed Redis: TLS PING returned PONG; no data writes.
- Existing attachment token and unrelated environment metadata unchanged; all Summary Reporting feature flags absent/off.
- Preview/Production share database configuration. No preview fixture or seed may run against it. The normal deployment's additive migration is production-impacting.
- Provider commands must use the `scaling-up` team; the canonical local Vercel link has a stale team ID. No credentials are included here.

## Validation and deployment

### Pre-PR checks

- Production-runtime Node 24.20.0 Turbopack build: exit 0; TypeScript/static generation pass; 95/95 pages. Only dummy CI database/auth values used, with no migration or live connection.
- Migration Safety Gate: 50 migrations pass; changed-file ESLint and `git diff --check` pass.
- Independent integration review: no remaining issue. Separate re-review approved the nullable-organization compatibility guards without scope widening or changes to valid calculations.
- Focused final matrix: 20/20 relevant suites, 271/271 tests pass (snapshot/renderer, API/storage/idempotency, wizard/panel, both hosts, flags/limiter, schema and SoT). Snapshot adds explicit missing-organization rejection and PDF-text equivalence despite newer main-model question-peer fields.
- Full repository run: 791 suites, 788 passed / 3 failed; 9,850 passed / 4 failed tests, 16 snapshots passed. This run overlapped integration fixes. The snapshot benchmark/golden expectation and SoT-size failures were fixed and pass in the final focused run. The unrelated existing landscape capture exceeded its 5-second test deadline; a bounded standalone recheck is recorded separately, not hidden as an all-green full-suite result.
- The nested-worktree browser harness authenticated successfully but timed out while compiling the Admin host. Both bundlers reproduced that environment boundary; the subsequent isolated-copy proof below passed.
- Standalone landscape-capture recheck: 3/3 tests pass, exit 0, with an explicit 30-second local test deadline (6.671 seconds for the suite). No assertion or unrelated test source was changed. All failures from the full run have now passed their focused rechecks; the complete suite was not rerun after those fixes.
- Live pre-release read-only baseline: authorized test Admin login, `SU Full report TEST` campaign, existing direct group report, healthy database/auth posture, and login `X-Frame-Options: DENY` verified. No invitation/reminder or assessment change performed.

### Final isolated browser proof

All **5/5 tests passed**, exit 0, in 1.6 minutes using Node 24.20.0 and default Turbopack from a clean `/tmp` copy. The complete runtime source matches the release source; only the temporary fixture's explicit baseline `git -C` lookup and generated Next route types differ. No assertion was removed or relaxed. The earlier Admin compilation boundary cleared (1.619-second compile); root location, contention and runtime changed together, so no single cause is asserted.

Covered both Admin/Coach list and composition, real sign-in, initial create 201 and replay 200, selected source ordering, exact stored canonical JSON hash, immutable PDF bytes after later source changes, authorization/current-access revocation, tamper denial, immutable database constraints, unsupported/flag-off/kill paths, DRAFT destinations, and concurrent identical requests (201/503, one retained report/source/audit/artifact). Fixture app/database stopped and its synthetic database removed; the original user preview remains running.

[Protected PR #384](https://github.com/ChiefAI-Officer/Scaling-up-platform-v2/pull/384) merged as `af55886022b2eebaae36fafa9d656c6a2ad9f48b` at `2026-08-27T13:42:26Z`. All hosted checks passed: Build (Node 20), Migration Safety Gate, Assessment Email Lease (PostgreSQL), Vercel and Preview Comments. The merged-main CI run also passed. [Notion release task](https://app.notion.com/p/3c98c45dd8298116a226c0d3056ac812) tracks the release and acceptance gate.

### Dark production verification

- Ready deployment `dpl_EFRQsDBR1uPemZK31F1V7Lsr1ZCE`, URL `https://scaling-up-platform-v2-kjlq854fg-scaling-up.vercel.app`, matches the exact merge SHA.
- Both canonical aliases independently resolve to this deployment/project/SHA; both health endpoints returned HTTP 200 with healthy database and safe auth posture.
- The additive migration finished at `2026-08-27T13:36:00.418Z`, with no rollback. Both tables exist and each expected immutability trigger is enabled. Initial report/source counts were 0/0.
- Authorized Admin and Coach accounts both opened the existing `SU Full report TEST` campaign with the legacy group-report link present and no Summary Reports wizard. The legacy direct report remained available; login retained `X-Frame-Options: DENY`.

### Canary activation

Only Production `SUMMARY_REPORTING_CANARY` was set to `cmt3sxj95000g1bznjubxw4ms` (the user's existing `SU Full report TEST` campaign). Global enablement and kill remain absent; unrelated environment metadata is unchanged. The exact merged-main redeploy `dpl_ZYY4S7MdYjnyco2hLaY1Hxxat7Yj` reached Ready at `2026-08-27T13:48:02Z`; both aliases independently match its project/SHA and return healthy HTTP 200. Live report creation/preview/download and product-owner PDF acceptance remain pending.

### Canary-native dependency finding

- The live Coach host displays Summary Reports and opens the approved wizard. Candidates GET returns 200, exposing the existing single completed test source (Edition 6, `enUS`). No synthetic Team responses were added.
- Report-list GET repeatedly returns HTTP 500 with a Next error document, independently reproduced after authorized Admin sign-in.
- Runtime logs identify `ERR_DLOPEN_FAILED: libvips-cpp.so.8.18.3: cannot open shared object file` while loading root Sharp 0.35.1 on Linux x64. Static import path: route → creation service → coach-image → Sharp. Failure occurs before the handler/limiter. No matching rate-limit or list-handler failure events were observed.
- The Mac production-build trace contains the Sharp native addon and libvips package metadata but omits its native library too. Full local node_modules masks this tracing gap. Next's nested Sharp 0.34.5 is a different dependency and is not substituted for the report service's version.
- Follow-up branch `codex/summary-reporting-production-receipt` makes a narrow route-specific native-asset tracing correction. Verification must include generated trace completeness and deployed Linux route loading, then actual report/PDF proof; local build success alone is insufficient.
- No live summary report or source record was created before the fault was identified. Existing assessments, submissions, invitations, and reminders remain unchanged.

Primary references: [Next output-file tracing](https://nextjs.org/docs/app/api-reference/config/next-config-js/output), [Sharp native installation/deployment](https://sharp.pixelplumbing.com/install/).

### Packaging correction verification

- `next.config.ts` explicitly includes installed root `@img/sharp-*/lib/*.node` and `@img/sharp-libvips-*/lib/**/*` assets for the Summary Reports API family. Next's `contains:true` route matching also covers report children; this is documented and tested, not claimed as list-only isolation. No dependency version, UI, calculation, or authorization changed.
- Test-first proof: four missing native-asset cases failed before the includes. Final config regression passes 9/9, including report children and exclusion of unrelated app routes. The affected API/image/PDF/SoT matrix passed 5 suites/84 tests before the two final child assertions; those final config assertions independently pass. Agent runtime/image/config proof also passed 3 suites/30 tests.
- Final stable-source Node 24.20.0 Turbopack build exits 0; TypeScript and 95/95 pages pass. Actual generated list/create trace now contains both root Sharp `sharp-darwin-arm64-0.35.1.node` and `libvips-cpp.8.18.3.dylib`, with both files verified present. An earlier build overlapped the red-test temporary config removal and did not load the includes; it is not used as corrected-trace evidence.
- Changed-file ESLint, 50-migration safety gate, and diff check pass. Independent review found no Critical/Important issue. Deployed Linux import and live PDF proof are still required.

## Next steps after the canary

1. Obtain acceptance of the actual live CEO Full screens/PDF; then enable globally for compatible Scaling Up Full campaigns. This production fixture has one CEO only; a genuine multi-member test cohort should be checked before broad rollout, without fabricating production responses.
2. Plan Scaling Condensed CEO + Self Comparison on the existing lifecycle.
3. Follow with LVA CEO Full, distinct QSP v1/v2 CEO Full, then Team-only Rockefeller Full, per the approved family order.

Do not fork the shared wizard/list/storage/authorization lifecycle. Do not add placeholders, imports, deletion, sharing, or a report hub to this scope.

## Final production verification

### Corrected deployment

- [PR #385](https://github.com/ChiefAI-Officer/Scaling-up-platform-v2/pull/385) passed Build, Migration Safety Gate, PostgreSQL email-lease integration, Vercel, and Preview Comments; protected squash merge `0673e34fa5c695bdea96544dde332445ab818dd6` at `2026-08-27T14:06:23Z`. Merged-main CI also passed.
- Exact Preview `dpl_4tnwheJsV1GUgwX2v6LhJstr8i6p` was authenticated with the existing Admin test account. Session200 and Summary Reports GET404 JSON `Not found`, `private, no-store`, proved the native import reached the flag-off handler rather than failing500. No protection bypass was created.
- Production `dpl_7dEWXzUB4p3M54AVyQkUUz2KoVou` / `https://scaling-up-platform-v2-871vn1dht-scaling-up.vercel.app` reached Ready on exact feature-bearing merge SHA. Both canonical aliases independently matched project/deployment/SHA; both health endpoints returned200 with healthy database/safe auth posture.
- Exact single-campaign encrypted Production canary retained; global enable/kill absent; private Blob token encrypted for Preview+Production. Pre-UI database counts0/0, additive migration applied and not rolled back.

### Created artifact and delivery

| Item | Verified value |
| --- | --- |
| Report | `512c509c-171e-4013-a642-b683ca232f7f` |
| Campaign | `cmt3sxj95000g1bznjubxw4ms` — existing `SU Full report TEST` |
| Source | `cmt3tp3l8001hbecr6ac5uwux`, CEO position0, Team0 |
| Renderer / language | `scaling-ceo-full-pdf-v1` / `enUS` |
| Creation | Coach UI POST201 at `2026-08-27T14:10:03.672Z`; one report/source/create-audit |
| Input SHA-256 | `4455afb54ef8d553cfef586397838945d1ac7a5b9db593c10982925669ec1ffc` |
| PDF SHA-256 | `13068349e0b5c5ed9dc207b5359120562ee1821bc463b1523c9376f03de2a83e` |
| PDF bytes / pages | 200,776 bytes / 8 A4 portrait pages |

- Coach and Admin both see and open the same saved report in the production campaign. Native PDF iframe visibly renders the real artifact; the UI Download control was exercised.
- Authenticated Admin inline and attachment requests each return200 `application/pdf`; identical bytes/hash, correct filename/disposition, `Cache-Control: private, no-store`, and `X-Frame-Options: SAMEORIGIN`. Existing login framing remains DENY.
- An unauthenticated application artifact request returns307 to `/api/auth/signin`, not PDF content. The exact anonymous private Blob object request returns403; authenticated private SDK get200 matches database bytecount/hash and the API downloads.
- Read-only persisted canonical input hash matches the recorded hash and creation audit; source identity/position and audit count are exact. No duplicate report or retry was introduced. Scoped production requests show no5xx, Sharp, or rate-limit failures after the correction.
- Downloaded PDF was rendered with Poppler and all8 pages visually inspected: no clipped/overlapping report text or missing coach image; all61 question rows and zero-Team Not available treatment are present. Existing whitespace/pagination and the explicit provisional/non-size-matched peer disclosure remain. This is the preserved platform Full body, not a claim of pixel-identical ESPERTO31-page output.
- Local inspection files are under `/tmp/summary-live-pdf.ApWR9S`; the durable authoritative artifact remains private in the application. No private PDF/answers/credentials are committed into the repository.

### Boundaries and remaining gate

Only the existing CEO-only test cohort was created in Production. Multi-member Team composition/order and post-creation source-change/revocation invariants were verified in the isolated5/5 browser tests, not by altering real records. No invitation, reminder, respondent, answer, assessment setting, or existing report was changed. The original local preview remains available. Actual-output user acceptance and global activation are not claimed complete.

The campaign host still emits the pre-existing React418 text-hydration warning seen on pre-feature deployment `dpl_GarxuXDsnTnmtD8tBuP5i1ooFDpk` as well as the corrected canary. The campaign's initially server-rendered UTC date text changes to the browser-local date after hydration. This release does not claim a warning-free app console or silently expand into unrelated date formatting; report controls and actual stored PDF delivery were exercised successfully despite that existing warning.
