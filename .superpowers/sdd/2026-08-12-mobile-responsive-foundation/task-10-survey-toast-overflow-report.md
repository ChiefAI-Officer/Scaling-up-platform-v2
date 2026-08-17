# Task 10 — Survey Template / Toast 320 px Overflow Follow-up

## Status

IMPLEMENTATION COMPLETE; LIVE PREVIEW REMEASUREMENT PENDING.

Implementation commit: `83b93a08`.

No deployment or production-data operation was performed.

## Reproduction and Root Cause

The final preview’s authenticated 320 px scan measured document width 327 px
on `/admin/surveys/templates/cmpbgsdfo000pzvkiln9440cp`. Named offender
rectangles included the global Radix ToastViewport, the survey-template header
action row, and its Delete Template button.

Source tracing confirmed two independent owners:

1. The fixed global ToastViewport had `w-full` but no compact horizontal
   anchor. With both horizontal insets auto, its static-position offset could
   remain non-zero; the observed 7 px offset made its right edge 327 px.
2. The survey-template editor did not consume the responsive flag. Its header,
   nested identity row, and action row were unconditional nowrap flex layouts;
   Delete Template had no responsive sizing or reflow boundary.

The page action row and global viewport are siblings, so neither rectangle was
treated as a proxy for the other. Both disconnected flag boundaries were fixed.

The in-app/browser runtime was unavailable for this subtask, so local computed
geometry and post-change preview geometry were not fabricated. The parent’s
live measurement remains the original feedback-loop evidence; the same route
must be remeasured after a later preview deployment.

## TDD Evidence

- The first test attempt exposed two harness errors (missing real Radix provider
  and invalid nested `<html>` in jsdom); these were corrected and were not
  counted as behavioral RED.
- Corrected RED:
  `npx jest src/__tests__/components/ui/toast-responsive.test.tsx src/__tests__/components/surveys/survey-template-editor-responsive.test.tsx src/__tests__/app/root-layout-responsive.test.tsx src/__tests__/app/registration-survey-hosts-responsive.test.tsx --runInBand`
  failed 4 behavioral assertions while 3 tests passed: missing compact toast
  anchor, missing root-to-toaster flag forwarding, missing survey-host flag
  forwarding, and missing survey header/action reflow. React also warned that
  the unconsumed test prop leaked to the Radix DOM node, corroborating the
  missing component boundary.
- GREEN: the same four suites passed 7/7 with no warnings after the minimal
  implementation.

## Change

- `RootLayout` forwards its already-evaluated responsive flag through `Toaster`
  to `ToastViewport`. Enabled compact toast layout adds `left-0`; at `sm`,
  `sm:left-auto sm:right-0` restores the existing right-anchored tablet/desktop
  behavior. The default-off viewport class literal remains exact.
- The survey-template server host forwards the same root flag into the editor.
  Enabled layout adds bounded root/title containment, stacks the header and its
  action row below `sm`, and sizes Back, Preview, and Delete Template as real
  44 px targets. Every disabled class and DOM branch asserted in the component
  test remains the prior literal.
- Fetches, saves, deletes, preview state, assignment state, tabs, routes, and
  all controlled inputs are unchanged.

## Verification

- PASS: focused RED/GREEN suites — 4 suites, 7 tests.
- PASS: neighboring survey-results and toast-consuming regression gate — 6
  suites, 17 tests. The pre-existing workflow-editor suite prints its already
  documented asynchronous `act(...)` warnings; it has no failure.
- PASS: scoped ESLint with 0 errors. The legacy survey editor retains its two
  pre-existing unused-import warnings (`QUESTION_TYPES`, `SurveyType`).
- PASS: `git diff --check` and staged diff integrity before commit.
- PENDING: authenticated preview remeasurement at 320 px because this subtask
  was explicitly prohibited from deploying and no browser runtime was
  available locally.
