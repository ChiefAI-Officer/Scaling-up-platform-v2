# Report-comparison MVP final-fix report

## Outcome

All consolidated runtime and test findings were implemented test-first in
commits
`e1fab9ce04a8f5b73fe1f6e16280ea81d7ba218a`,
`4c045769bd104fa8e8b32d6ea0a9212a42e67207`, and
`b012ba5c5c6d9afddf92368cc5017f85df29fdf8`, relative to fixed point
`2ac1db6fbdfad37f3f91b0dfba30b84a801a0efd`.
The tracked closeout documentation completes the remaining evidence, domain,
and API-guidance findings.

The feature remains default-off and unlaunched. No Production deployment,
environment mutation, canary selection, customer-data operation, invitation
delivery, or assessment response was performed.

## Red → green evidence

- Exchange limiter: 3 new tests failed before the route applied
  `RateLimits.standard`; the first review then exposed that the shared wrapper
  fails open on Redis errors. A route-level strict-wrapper regression failed
  before `withRateLimitStrict` existed; the real strict backend now propagates
  outages and the route converts them to the generic unavailable response
  before parsing or token inspection.
- Token lifetime: issuance above 30 days failed to throw; 6 token tests passed
  after enforcing the maximum while preserving shorter test TTLs.
- Compatibility: changed question type/bounds retained a Previous value; 6
  model tests passed after incompatible questions became unmatched with both
  Previous and Change null and all scale bounds had to be finite.
- Controls: a same-route server-prop change retained stale local selection; 6
  component tests passed after moving local state behind a prop-derived key.
- Bearer handling: the invited results UI rendered the raw fragment URL; the
  client now exchanges it function-locally and only a validated clean exact
  report path reaches React state. The raw token is absent from DOM and
  `sessionStorage`.
- CEO revalidation: revoked invitation/campaign/respondent/tenant/disclosure/
  participant facts still allowed selected comparison load; the selected focus
  and baseline now reload after exact live-grant revalidation in one Serializable
  transaction.
- Rollout boundary: OFF/KILL still performed focus reads/transactions and
  middleware still opened capability routes; tests now prove zero comparison
  reads plus authenticated middleware fallback while inactive.
- Rollback entry: the prior coach “Over time” path had been removed
  unconditionally; campaign detail now restores its server eligibility checks
  and links only while report-native comparison is disabled, and never exposes
  the coach-only path in admin.
- Remaining minors: explicit empty selection, 50-identity and 200-row bounded reporting,
  self-report shell privacy headers, positive template canary, visible imported
  provenance, stable `CEO_SELF` audit identity, and lane-specific sentinel
  verification errors all received focused regressions.

## Guarded browser contract

The fixture provisioner first proves exact `DATABASE_URL` equality and a strong,
live disposable sentinel row. It then creates distinct per-style same-person
identities, one CEO per campaign, lifecycle style locks, deterministic fixture
version reuse, cross-organization exclusion data, and a separate Classic live
focus with pending CEO/non-CEO invitations plus its own native/imported history.
The live focus has results email disabled, and the isolated launcher also
forces Wave D results-email and delivery-intent gates off. The Playwright
workflow:

1. enters through real coach and admin campaign-detail “View report” actions;
2. repeats native and imported selection, Change, Remove, coverage, deltas,
   provenance, and actual renderer IDs for both roles in all three styles;
3. writes 1440px and 390px screenshots plus Letter PDFs to the Playwright test
   output directory and checks controls are hidden while facts remain printable;
4. answers and submits real CEO and non-CEO invitation flows;
5. proves only the CEO receives a clean fragment-free comparison link and that
   its picker contains and compares only that CEO identity’s live native/imported
   history;
6. denies cross-respondent, group, portal, admin, altered-focus, and
   cross-organization access;
7. proves disclosure and CEO designation revoke independently, restoring each
   mutable fact and both pending invitation states during cleanup.

The current environment had none of the five required database/sentinel/secret
values. Therefore the real server/browser workflow was not run. The guarded
discovery command listed four cases; no screenshot, PDF, print preview, visual
acceptance, or browser-pass claim is made.

## Verification receipt

From `src/`:

```text
npx jest [15 prescribed comparison suites] --runInBand --silent
# PASS — 15 suites / 193 tests

npx jest [8 prescribed legacy suites] --runInBand --silent
# PASS — 8 suites / 149 tests / 1 snapshot

npx jest [9 added audit/on-screen/portal/admin/E2E/runtime suites] --runInBand --silent
# PASS — 9 suites / 93 tests

npx jest [4 final correction suites] --runInBand --silent
# PASS — 4 suites / 45 tests

npx eslint [all changed TS/TSX/MJS/CJS files]
# PASS

node scripts/check-migration-safety.mjs
# PASS — 45 migrations, no unapproved destructive operations

CI=true npx next build --turbopack
# PASS — compiled successfully, TypeScript complete, 94/94 pages generated

PLAYWRIGHT_SKIP_WEBSERVER=1 npx playwright test e2e/report-comparison.spec.ts --list
# PASS — 4 tests discovered

git diff --check
# PASS
```

Expected build-only warnings were limited to the existing middleware naming
deprecation, absent local Inngest keys, and fail-soft static page data reads
without a local `DATABASE_URL`.

## Source-of-truth correction

The prior changelog described intended browser assertions as if their presence
in an unrun spec were evidence. The new controlling entry
`report-comparison-final-review-closed` distinguishes:

- green unit/integration/contract/build evidence that actually ran;
- a complete but unexecuted disposable Playwright contract; and
- browser/print/visual acceptance that remains pending a proven disposable
  environment.

## Review closure

The first two-axis final review found an unprovisionable duplicate CEO,
cross-style identity collisions, a fail-open limiter call, style-lock/version
cleanup gaps, and acceptance-proof omissions. Each received a red regression or
contract assertion before correction. The follow-up review confirmed the
strict limiter, one-CEO topology, isolated identities/focus campaign, version
reuse, style-lock restoration, endpoint documentation boundary, coach/admin
three-style facts, CEO-own-history comparison, and outbound-email isolation.
