# Task 5 — Unify all invitation send paths

## Status

DONE

## Implementation

- Migrated the initial/manual invite path (`POST /api/assessment-campaigns/[id]/invite`) and its shared `sendInvitesBatch` delivery contract.
- Migrated the auto-send Inngest fanout path.
- Migrated both reminder handoff branches: normal direct mailer and stable-link prepared mailer.
- Migrated the single-invitation resend path.
- Every path now evaluates the same precedence once per send using organization and template scope:
  `universalBanner` → `waveP` → `legacy`.
- Every path resolves one coach presentation model: creator first; owner only when no creator exists. The existing `coachName` field is derived from that result solely to preserve legacy/unbranded rendering bytes.
- Batch inputs default to `legacy` plus a `scaling_up_only` byline, and forward both unchanged.
- Replaced old logo diagnostics with PII-free `chromeVariant`, `coachBylineMode`, and `logoRejectedReason` fields.
- Removed `resolveCoachName` and `resolveCoachLogo` after all callers migrated.

## RED → GREEN evidence

RED run:

```bash
npx jest src/__tests__/lib/invite-send.test.ts src/__tests__/api/assessment-campaigns/invite-route.test.ts src/__tests__/inngest/assessment-invite-fanout.test.ts src/__tests__/api/assessment-campaigns/reminders-post.test.ts src/__tests__/api/assessment-campaigns/resend-route.test.ts --runInBand
```

Result: 5 suites failed as expected on missing universal gate/byline forwarding (13 assertions); existing behavior passed.

GREEN run:

```bash
npx jest src/__tests__/lib/invite-send.test.ts src/__tests__/api/assessment-campaigns/invite-route.test.ts src/__tests__/inngest/assessment-invite-fanout.test.ts src/__tests__/api/assessment-campaigns/reminders-post.test.ts src/__tests__/api/assessment-campaigns/resend-route.test.ts src/__tests__/services/notifications.test.ts src/__tests__/lib/assessments/invitation-email.test.ts --runInBand
```

Result: 7 suites passed, 244 tests passed, 1 snapshot passed.

## Validation

- `npx eslint` on all five modified production paths: passed.
- `git diff --check`: passed.
- `rg -n "resolveCoachName|resolveCoachLogo" src/src`: no matches.
- Scoped `tsc` review: no remaining error in `assessment-invite-fanout.ts`; full `npm run type-check` remains blocked by pre-existing repository-wide test/type errors (including ES target BigInt tests, existing NextRequest test fixtures, and template test fixture fields).
- No PUBLIC or results-flow files changed.

## Migrated delivery paths

1. Initial/manual invite send through `sendInvitesBatch`.
2. Inngest invitation fanout.
3. Reminders direct send.
4. Reminders stable-link prepared send.
5. Invitation resend.
