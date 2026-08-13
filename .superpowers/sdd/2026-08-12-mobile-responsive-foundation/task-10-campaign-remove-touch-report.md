# Task 10 — Campaign Remove Respondent Touch Target Follow-up

## Status

COMPLETE.

Implementation commit: `b7f8efd2`.

No deployment, browser execution, route-harness change, or data mutation was
performed.

## Finding and Root Cause

The responsive CampaignDetail root enforced only descendant minimum height.
Its icon-only Remove respondent button retained the legacy `px-2 py-1` class,
so the real node remained about 30 px wide. It also lacked
`data-touch-target`, which meant the intentionally narrow authenticated action
selector did not discover it. The removal handler and availability rules were
correct; only the responsive presentation/audit boundary was incomplete.

## TDD Evidence

- RED:
  `npx jest src/__tests__/components/assessments/campaign-detail-remove-respondent.test.tsx --runInBand`
  failed 1 targeted test while 5 neighboring removal tests passed. The real
  responsive Remove Alice Smith button lacked `min-h-11 min-w-11`; its exact
  flag-off class and absence of `data-touch-target` already passed.
- GREEN: the same suite passed 6/6 after the minimal conditional class and
  marker change.

## Change

- The real responsive Remove respondent button now has explicit
  `min-h-11 min-w-11`, centers its Trash icon, and carries
  `data-touch-target` so `AUTHENTICATED_ACTION_TARGET_SELECTOR` measures it.
- The flag-off button retains its exact prior class literal and DOM attributes;
  no touch marker is present while disabled.
- `onClick`, dialog state, handler, endpoint, respondent availability, and all
  data logic are unchanged.

## Verification

- PASS: CampaignDetail/touch regression gate — 4 suites, 18 tests.
- PASS: scoped ESLint on the component and focused test.
- PASS: `git diff --check` and staged diff integrity before commit.
