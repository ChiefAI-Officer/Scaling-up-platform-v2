# Final-fix report — empty invitation-banner canary short-circuit

**Starting revision:** `16e31be3be4237c0f6b192cf446e4244664771c9`
**Implementation commit:** `bab76fa805b5b52e40cdda8e634d1d899f7d36fc`

## Outcome

When `WAVE_INVITATION_BANNER_ENABLED`,
`WAVE_INVITATION_BANNER_CANARY`, and `WAVE_INVITATION_BANNER_KILL` are all absent,
`getInvitationBannerAuthoringGate` now returns
`{ globallyEnabled: false, canaryIds: [] }` before it calls picker visibility. The
new-campaign page consequently performs no Template, Organization, access-group, or
grant work for the dormant banner path. KILL and global enablement precedence, and
configured-canary visibility filtering, are unchanged.

## Test-first evidence

The production mutation each new test catches is removal of the empty-configured-ID
return: that bug invokes the visibility callback and lets the new-campaign page enter
picker/RBAC query work in the default-off state.

### RED

```bash
cd src
npx jest src/__tests__/lib/assessments/wave-invitation-banner-flags.test.ts src/__tests__/app/portal-new-campaign-page.test.tsx --runInBand
```

Result: expected failure, **2 failed / 16 passed / 18 total**. The helper regression
observed the callback called once with `[]`; the rendered-page regression observed one
`assessmentTemplate.findMany` call with an empty configured-ID clause.

### GREEN

```bash
cd src
npx jest src/__tests__/lib/assessments/wave-invitation-banner-flags.test.ts src/__tests__/app/portal-new-campaign-page.test.tsx --runInBand
```

Result: **2 suites passed / 18 tests passed / 0 snapshots**.

## Verification

```bash
cd src
npx eslint src/lib/assessments/wave-invitation-banner-flags.ts src/__tests__/lib/assessments/wave-invitation-banner-flags.test.ts src/__tests__/app/portal-new-campaign-page.test.tsx
```

Result: passed with no diagnostics.

```bash
cd src
node scripts/check-migration-safety.mjs
```

Result: passed — **47 migrations** checked; no unapproved destructive operations.

```bash
cd src
CI=true npx next build --turbopack
```

Result: passed — compiled successfully, completed TypeScript, and generated **94/94**
static pages. Warnings retained: the established middleware-to-proxy deprecation,
missing local Inngest keys, and non-fatal missing-`DATABASE_URL` static-generation
messages.

```bash
cd src
npx jest --runInBand
```

Result: passed — **687 suites / 8,578 tests / 16 snapshots**. The established
negative-path console output and React `act(...)` warnings remained; no suite or test
failed.

```bash
cd src
npx jest src/__tests__/lint/changelog-freshness.test.ts --runInBand
```

Result: passed — **1 suite / 4 tests / 0 snapshots**.

```bash
git diff --check
```

Result: passed silently.

## Files

- `src/src/lib/assessments/wave-invitation-banner-flags.ts`
- `src/src/__tests__/lib/assessments/wave-invitation-banner-flags.test.ts`
- `src/src/__tests__/app/portal-new-campaign-page.test.tsx`
- `CLAUDE.md`
- `plans/CHANGELOG.md`
- `.superpowers/sdd/2026-08-11-picker-visible-invitation-banner-canaries/final-fix-report.md`

## Self-review

- The new branch is after KILL/global checks and before the sole visibility callback.
- The helper regression proves no callback in the all-vars-absent state; the rendered
  page regression independently proves no Template, Organization, access-group, or
  grant query can occur there.
- The minimal return does not alter nonempty canary filtering, global enablement, or
  KILL behavior.
- No ledger edit, push, PR/Notion/Vercel action, deployment, flag change, database
  write, or customer email occurred.
