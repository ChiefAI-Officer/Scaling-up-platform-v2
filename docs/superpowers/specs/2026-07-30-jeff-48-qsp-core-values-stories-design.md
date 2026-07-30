# Jeff #48 — QSP Core-Values Stories Design

**Status:** BUILT behind a default-off flag; visual validation complete via published Preview plus a temporary DB-free real-component harness; pending PR review and production launch

**Scope:** Replace three repeated QSP v2 prompts with one progressively revealed “up to three people” question without changing the three stored answers

**Source:** `Scaling-Up-Assessment-Feedback-Report-2026-07-10.pdf`, tracker item #48

**Approved visual:** [`docs/specs/v7.6/mockups/48-qsp-core-values-progressive.html`](../../specs/v7.6/mockups/48-qsp-core-values-progressive.html)

## Problem

Quarterly Session Prep v2 currently renders this prompt three times:

> Which employees have demonstrated that they live the core values? Why? Share the stories.

The three copies are labeled “Story 1 of 3,” “Story 2 of 3,” and “Story 3 of 3.” They are separate because Esperto historical import maps `Q5a`, `Q5b`, and `Q5c` to three independent stable keys:

```text
P1_core_values_story_1
P1_core_values_story_2
P1_core_values_story_3
```

Jeff wants respondents to see the question once, with room inside it for up to three people and their stories. The user selected the quieter progressive-add treatment: show one entry first, then reveal the second and third through **Add another person**.

## Outcome

In the QSP v2 participant experience:

1. render one visible core-values prompt;
2. show one “Person and story” textarea initially;
3. reveal at most two more textareas, in fixed order, through **Add another person**;
4. preserve the three existing stable keys and their one-to-one slot mapping; and
5. count the grouped prompt as one logical question in respondent progress.

This is a presentation adapter over three existing questions. It is not a new question type or data model.

## Approaches considered

### Keep three separate questions and make each singular

This was Jeff’s stated fallback if consolidation would break imports. It is safe but does not deliver the preferred experience: the page still repeats the same conceptual request three times.

### Add a generic compound/repeater question type

A reusable repeatable-field schema could model the UI directly, but it would require new template authoring, validation, serialization, import, report, and migration rules. That is disproportionate to one known QSP content pattern and creates risk around published-version immutability.

### Group the three known QSP questions at render time — selected

Recognize the canonical QSP v2 stable-key triplet in the respondent renderer and present it as one progressive group. Each textarea still reads and writes its original stable key.

This satisfies the requested UI while leaving submission payloads, Esperto crosswalks, historical answers, scoring, and reports unchanged.

## Approved interaction

### Initial state

- The shared prompt appears once.
- Supporting copy says: **Share up to three people and the examples that stood out.**
- Slot 1 is visible with:
  - label **Person and story**;
  - badge **1 of 3**; and
  - placeholder **Name the person, then describe what they did…**
- **Add another person** appears below the slot.
- All three story slots remain optional.

### Adding entries

- First activation reveals slot 2 and moves focus to its textarea.
- Second activation reveals slot 3 and moves focus to its textarea.
- Revealed slots stack in the fixed order 1, 2, 3.
- Each slot shows its own `N of 3` badge.
- The add button disappears when slot 3 is visible.
- An assistive-technology status message announces the newly added slot.

### No remove or reorder controls

There is no remove, drag, or reorder interaction. A respondent who does not need a revealed slot may clear it or leave it blank.

This is deliberate:

- visible slot 1 always maps to stable key 1;
- visible slot 2 always maps to stable key 2;
- visible slot 3 always maps to stable key 3; and
- no compaction or answer-moving rule is needed.

### Returning to saved work

The initial visible count is the greater of:

- one; or
- the highest slot that already contains a nonblank draft answer.

For example, if slot 3 contains restored data, all three slots render. A populated answer must never be hidden merely because an earlier slot is blank.

Progressive reveal state lasts for the current mounted assessment session. After a full reload, saved answers determine how many slots reopen; newly revealed but untouched blank slots may collapse.

### Navigation and validation

- **Next** behaves as it does today.
- No story slot becomes required.
- Revealing a blank slot does not create a validation error.
- The assessment-wide “at least one answer” rule remains unchanged.
- Disabled editor Preview mode renders the same grouped layout, but its inputs and add action remain non-interactive.

## Logical progress

The grouped triplet represents one visible question:

- denominator contribution: **1**, not 3;
- answered contribution: **1** when any of the three values is nonblank;
- answered contribution: **0** when all three values are blank.

This counting change applies only while the grouped presentation is active. Submission validation and payload shape still operate on the three underlying questions.

## Group-recognition contract

The special renderer activates only when all of these conditions hold:

1. the template alias is `qsp-v2`;
2. the three canonical stable keys are present;
3. they are consecutive within the same section and in numeric order;
4. all three are `TEXT`; and
5. all three are optional.

If any condition fails, the renderer fails safe to the ordinary three-question UI. It must never skip, merge, or reposition a partially matching set.

The grouped prompt is derived from the first question label by removing the recognized ` (Story 1 of 3)` suffix. If that suffix is absent, use the complete first label. The other two authored labels remain stored but are not displayed while grouping is active.

## Data and compatibility

No schema migration or content migration is required.

The following remain unchanged:

- `P1_core_values_story_1/2/3`;
- Esperto `Q5a/Q5b/Q5c` crosswalk entries;
- answer state as `stableKey -> value`;
- local draft storage;
- public and invited-survey POST payloads;
- server validation and text-length limits;
- frozen historical submissions;
- scoring and report loaders; and
- QSP seed question count and the three-question content invariant.

The seed labels may remain differentiated for generic fallback, auditability, and non-participant surfaces. This wave changes their respondent presentation, not their identity.

## Rendering scope

The grouped presentation must be consistent anywhere the live respondent pager renders QSP v2:

- invited organization survey;
- public assessment;
- editor Preview mode; and
- any test-mode surface that delegates to the same pager.

Every entry point must supply the template alias and one resolved feature-gate boolean to the shared pager. The new props default off so unrelated callers remain unchanged.

Reports, exports, admin answer tables, and import tools are out of rendering scope. They continue to expose the three stored answer fields according to their current rules.

## Visual and responsive behavior

Use the established assessment tokens and typography:

- one standard question card;
- existing purple focus and action treatment;
- a quiet nested boundary for each story entry;
- a pale-purple `N of 3` badge;
- a full-width dashed secondary add button; and
- the existing textarea character counter and maximum length.

On narrow screens, the prompt, slots, and add action remain one column. No horizontal scrolling is introduced. The button and textarea meet the existing touch-target conventions.

## Accessibility

- Use a semantic group (`fieldset`/`legend`, or an equivalent accessible grouping) for the shared prompt.
- Associate each visible textarea with a unique accessible label such as **Person and story 2 of 3**.
- Do not rely on the badge alone to name a field.
- The add action is a real `button` with `type="button"`.
- After adding, focus the newly revealed textarea.
- Announce additions through a polite live region.
- Preserve the existing visible focus ring, `aria-invalid`, character counter, disabled state, and keyboard behavior.
- Preview mode must not expose an operable add control.

## Feature flag and rollback

Use one default-off wave gate and kill switch, provisionally:

```text
WAVE_48_QSP_STORY_GROUP_ENABLED
WAVE_48_QSP_STORY_GROUP_KILL
```

The kill switch overrides enablement. Flag off renders the current three ordinary questions and uses current question-based progress counting. The gate is presentation-only; answer writes and imports do not depend on it.

Merge dark, visually test both respondent lanes and Preview mode, then enable in production. Rollback is the kill switch plus redeploy; no data cleanup is needed.

## Component boundary

Planning should favor three small responsibilities:

1. a pure classifier that recognizes the exact QSP triplet and returns ordinary or grouped render units;
2. a focused progressive story-group component that owns visible-count and focus behavior; and
3. progress helpers that count the same render units used by the screen.

`QuestionInput` should remain the primitive for each textarea so text limits, answer handling, disabled behavior, and character counting do not fork.

## Failure handling

- An incomplete, reordered, required, or mistyped triplet falls back to ordinary rendering.
- A hidden populated slot is expanded into view.
- A missing template alias cannot activate grouping.
- Feature-flag resolution failure defaults off.
- No client condition may rename or shift answer keys.

## Test and acceptance criteria

### Pure behavior

- Exact canonical triplet groups only for `qsp-v2`.
- Wrong alias, missing key, nonconsecutive order, wrong type, or required slot returns three ordinary units.
- Grouped progress counts one total and one answered when any slot is nonblank.
- Flag-off progress remains byte-for-byte equivalent to the existing calculation.

### Interaction

- Initial render shows slot 1 and one add button.
- First click reveals slot 2 and focuses it.
- Second click reveals slot 3, focuses it, and removes the add button.
- Each change calls `onAnswerChange` with the corresponding original stable key.
- Blank revealed slots do not block navigation.
- Restored slot-2 data opens two slots; restored slot-3 data opens three.
- Clearing a value does not move another answer to a different key.
- Preview mode shows the group without an operable add action.

### Integration and regressions

- Invited and public QSP v2 screens show one prompt under the enabled flag.
- Non-QSP templates render unchanged.
- Flag off shows all three existing QSP questions.
- Existing seed-content and Esperto crosswalk tests remain green without changing expected stable keys.
- SectionPager navigation, required-question focus, slides, conditional visibility, SU-Full phase tile, and ED10 preview tests remain green.
- Responsive visual review covers desktop and mobile.
- Keyboard and accessible-name checks cover every revealed state.

## Out of scope

- a general repeatable/compound template field;
- editor authoring for arbitrary repeaters;
- separate “person name” and “story” database fields;
- removing or reordering entries;
- changing Esperto imports;
- rewriting historical answers;
- merging the three stable keys;
- changing reports or exports; and
- changing the wording of unrelated QSP questions.

## Definition of done

The work is complete when a QSP v2 respondent sees the approved progressive single-question design in public and invited flows, can enter up to three fixed-order stories, retains draft and import compatibility through the original three keys, sees logical one-question progress, and can be returned to the existing UI through the kill switch without data changes.
