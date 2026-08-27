# Summary Reporting — production release receipt, August 27, 2026

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
- The nested-worktree browser harness authenticated successfully but timed out while compiling the Admin host. Both bundlers reproduced that environment boundary; isolated-copy verification is pending. This is not claimed as an end-to-end pass.
- Standalone landscape-capture recheck: 3/3 tests pass, exit 0, with an explicit 30-second local test deadline (6.671 seconds for the suite). No assertion or unrelated test source was changed. All failures from the full run have now passed their focused rechecks; the complete suite was not rerun after those fixes.
- Live pre-release read-only baseline: authorized test Admin login, `SU Full report TEST` campaign, existing direct group report, healthy database/auth posture, and login `X-Frame-Options: DENY` verified. No invitation/reminder or assessment change performed.

Protected PR checks, exact-SHA Ready deployment and live canary proof remain pending. Provisioning/build success does not imply deployment or global activation.

## Next steps after the canary

1. Obtain acceptance of the actual live CEO Full screens/PDF; then enable globally for compatible Scaling Up Full campaigns.
2. Plan Scaling Condensed CEO + Self Comparison on the existing lifecycle.
3. Follow with LVA CEO Full, distinct QSP v1/v2 CEO Full, then Team-only Rockefeller Full, per the approved family order.

Do not fork the shared wizard/list/storage/authorization lifecycle. Do not add placeholders, imports, deletion, sharing, or a report hub to this scope.
