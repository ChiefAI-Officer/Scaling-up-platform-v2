# Welcome-screen question-bank accuracy (GH #222)

**Date:** 2026-07-31

**Issue:** [#222](https://github.com/ChiefAI-Officer/Scaling-up-platform-v2/issues/222)

**Branch:** `codex/gh-222-welcome-screen-accuracy`

**Base:** `origin/main` at `a9c5afdc`

**Status:** Approved design; implementation has not started

## Goal

Make the shared assessment Welcome screen describe the complete question bank
truthfully. Today it takes the first `SLIDER_LIKERT` question's scale and presents
that scale as if it applies to every question. That produces false summaries for
mixed-format banks such as Leadership Vision Alignment (LVA), QSP v1, and QSP v2.

The fix must remain deliberately small:

- use one deterministic composition rule;
- keep the existing time estimate;
- avoid template-specific copy and thresholds;
- apply the same behavior to invited and public assessments.

## Current behavior

`deriveScaleLabel` in
`src/src/components/assessments/assessment-welcome.tsx` finds the first
`SLIDER_LIKERT` question. Its result drives both:

- the expectations sentence: `{count} short statements, rated {scale}.`; and
- the third Welcome stat chip showing the scale.

The invited flow in `org-survey-client.tsx` and the public flow in
`public-quiz-client.tsx` both use these shared Welcome components.

This makes the copy inaccurate for the following known banks:

| Assessment | Composition | Current scale claim |
| --- | --- | --- |
| LVA | 40 text, 16 slider, 10 number, 1 multiple choice | All 67 appear rated 1–3 |
| QSP v1 | 20 text, 7 slider, 1 number | The first slider scale appears to cover all 28 |
| QSP v2 | 15 text, 6 slider, 1 number | All 22 appear rated 1–10 |

## Approved behavior

### One strict composition rule

A question bank may claim a rating scale only when:

1. every question is `SLIDER_LIKERT`;
2. every slider has finite numeric minimum and maximum values, with maximum
   greater than minimum; and
3. every slider uses the same minimum and maximum.

There are no percentage thresholds or template exceptions. A single non-slider
question makes the bank mixed. Sliders with different ranges also make the bank
mixed.

This strict rule intentionally treats Scaling Up Full as mixed because it
contains 61 slider questions and 2 number questions. Although the existing scale
claim is close to representative, it is not true for the whole bank.

### Welcome copy and stat chips

For a wholly uniform slider bank:

- preserve the existing sentence:
  `{count} short statements, rated {minimum}–{maximum}.`;
- preserve all three stat chips: question count, estimated time, and scale.

For a non-empty mixed-format bank:

- render:
  `{count} questions using a mix of response formats.`;
- render only the question-count and estimated-time chips;
- do not add a replacement “Mixed formats” chip.

For an empty or unrecognized bank:

- use the neutral fallback `{count} questions.`;
- render only the question-count and estimated-time chips.

The two-chip row uses the existing flexible layout. No replacement chip or CSS
redesign is required.

## Presentation derivation

Replace the first-slider-only decision with one shared presentation derivation
over the complete question bank. Its output contains:

- the expectations sentence; and
- an optional scale label.

Both `WelcomeExpectations` and `WelcomeStats` consume this result. The optional
scale label is the single source of truth: when absent, no scale wording and no
scale chip may render.

The helper should classify the bank from question data, not from assessment
aliases. New templates therefore receive correct behavior without new branches.

## Behavior matrix

| Bank shape | Expectations sentence | Stat chips |
| --- | --- | --- |
| All sliders, identical valid range | Existing “short statements, rated …” copy | Questions, time, scale |
| Contains text, number, or multiple choice | “questions using a mix of response formats” | Questions, time |
| Sliders use different ranges | “questions using a mix of response formats” | Questions, time |
| Empty, invalid, or unrecognized | Neutral “questions” fallback | Questions, time |

Known examples:

| Assessment | Expected classification |
| --- | --- |
| Rockefeller Habits | Uniform scale |
| Five Dysfunctions | Uniform scale |
| Scaling Up Quick | Uniform scale |
| LVA | Mixed |
| QSP v1 | Mixed |
| QSP v2 | Mixed |
| Scaling Up Full | Mixed |

## Scope boundaries

Included:

- shared Welcome presentation derivation;
- invited and public assessment Welcome screens;
- conditional scale wording and chip rendering;
- focused automated coverage for both branches.

Excluded:

- recalibrating `deriveTimeEstimate`;
- displaying exact counts per question type;
- template-specific wording;
- changing question-bank data or seed content;
- database migrations or API changes;
- unrelated Welcome-screen copy, including confidentiality claims;
- broader visual redesign.

The user declined mockups and approved the textual/layout behavior directly.

## Testing

Add focused tests for the shared derivation and preserve coverage through both
participant flows.

Composition coverage:

- all sliders with one valid range returns the existing rated copy and scale;
- one non-slider question makes the result mixed;
- different slider ranges make the result mixed;
- a missing or invalid slider scale does not produce a scale claim;
- a slider-free or empty bank does not produce a scale claim.

Rendering coverage:

- a uniform bank renders three stat chips and the exact existing scale wording;
- a mixed bank renders two stat chips and the exact mixed-format sentence;
- mixed and fallback cases contain no scale chip or `rated` claim;
- invited and public Welcome flows both consume the shared result.

Regression examples should include LVA, QSP v1, QSP v2, Scaling Up Full,
Rockefeller Habits, and Five Dysfunctions where their seed builders are practical
to exercise without database access.

## Rollout and risk

This is a flagless presentation bug fix. It changes no stored data and requires
no migration. Rollback is a normal revert.

Primary risks:

- a partial update could remove the sentence claim but leave the scale chip;
- independently deriving copy and chip state could let them diverge later;
- preserving “effectively accurate” exceptions would weaken the rule and create
  maintenance ambiguity.

The single shared derivation and optional scale label address the first two
risks. The strict all-questions rule addresses the third.

## Acceptance criteria

1. A scale is shown only when every question is a slider with the same valid
   numeric range.
2. Mixed-format banks render
   `{count} questions using a mix of response formats.`.
3. Mixed-format banks show exactly the question-count and estimated-time chips.
4. Uniform slider banks preserve their existing copy and three-chip layout.
5. Invited and public Welcome screens use the same derivation.
6. `deriveTimeEstimate` remains unchanged.
7. No template-specific branches, percentage thresholds, migrations, API
   changes, or broader visual redesign are introduced.
8. Focused tests cover uniform, mixed, invalid, and empty bank shapes.
