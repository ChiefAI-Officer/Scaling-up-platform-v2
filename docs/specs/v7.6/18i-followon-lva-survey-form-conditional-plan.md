# Wave I follow-on - LVA survey-form conditional hiding - Implementation Plan

> **Status:** PLANNING APPROVED by Gabriel on 2026-06-25. This is the
> per-wave plan gate for the next implementation loop. No feature code is part
> of this planning PR.
>
> **Prior wave:** Wave I report-layer filter, PR #84, SoT PR #85, ADR-0014.
> **Goal:** make the LVA survey form match the report-layer contract by showing
> `S5_why_<factor>` follow-up boxes only for factors checked in
> `S4_biggest_obstacles`.

## 1. Scope

In scope:

- LVA only: template alias `leadership-vision-alignment`.
- Participant survey form only, across both current client surfaces:
  - invited org survey: `src/src/components/assessments/org-survey-client.tsx`
  - public quiz client, only if an LVA public campaign ever reaches this shared
    path: `src/src/components/assessments/public-quiz-client.tsx`
- Hide/show questions whose stable key starts with `S5_why_` based on the
  current array value of `S4_biggest_obstacles`.
- Keep `S4_biggest_obstacles`, `S5_other_factor`, and `S5_change_one_thing`
  visible at all times.
- Remove hidden `S5_why_` answers from the rendered-page key set before submit
  so stale autosave answers cannot be posted.
- Preserve Wave I report behavior in `qualitative-report-model.ts` unchanged.

Out of scope:

- A generic conditional-template engine.
- Schema migration.
- Seed change or republish.
- Changing LVA report rendering, report email rendering, or group report logic.
- Hiding the `S3_strengths` matrix in the survey form. Wave I intentionally
  removed that matrix from the individual report only; group/report semantics
  remain separate.

## 2. Product Contract

When a respondent reaches the LVA obstacles section:

- Before any S4 obstacles are checked, none of the 16 per-factor
  `S5_why_<factor>` text boxes are shown.
- When the respondent checks `sales`, `S5_why_sales` appears.
- When the respondent unchecks `sales`, `S5_why_sales` disappears.
- If a now-hidden field had a typed answer, that stale answer is pruned before
  submit and should not be sent in the `answers` payload.
- Always-on follow-ups remain visible regardless of S4:
  - `S5_other_factor`
  - `S5_change_one_thing`
- Required-question validation only considers visible questions. Hidden optional
  questions cannot block Next/Submit.

Fail-open rule:

- If a pinned version does not contain `S4_biggest_obstacles` as a
  `MULTI_CHOICE`, do not hide any `S5_why_` questions. This mirrors ADR-0014's
  conservative behavior for malformed or older content.

## 3. Current Code Map

Survey rendering:

- `SectionPager` renders pages and questions passed to it. It does not know the
  assessment alias or conditional rules.
- `buildSectionPages` in `section-pages.ts` groups whatever question list it
  receives; it should remain a pure grouping helper.
- `QuestionInput` renders controls and should not learn cross-question rules.

Client state and submit:

- `org-survey-client.tsx` owns invited survey answers, computes `sortedQuestions`
  and `knownKeys`, builds pages, prunes stale answers, and posts to
  `/org-survey/[campaignAlias]/submit`.
- `public-quiz-client.tsx` owns public quiz answers, computes `sortedQuestions`
  and `knownKeys`, builds pages, prunes stale answers, and posts to
  `/api/quiz/[campaignAlias]/submit`.

Report precedent:

- `REPORT_FILTERS["leadership-vision-alignment"]` already defines the key
  relationship:
  `{ gateKey: "S4_biggest_obstacles", followupPrefix: "S5_why_" }`.
- The form plan should reuse the same stable-key relationship, but should not
  import report-model code into client components if that creates server/client
  coupling. Prefer a small client-safe helper.

## 4. Design

Add a client-safe helper, likely:

- `src/src/lib/assessments/form-visibility.ts`

Suggested API:

```ts
export function filterVisibleSurveyQuestions(args: {
  templateAlias?: string | null;
  questions: PagerQuestion[];
  answers: Record<string, number | string | string[]>;
}): PagerQuestion[];

export function visibleSurveyQuestionKeys(args: {
  templateAlias?: string | null;
  questions: PagerQuestion[];
  answers: Record<string, number | string | string[]>;
}): Set<string>;
```

Rules:

- Unknown alias: return questions unchanged.
- LVA alias:
  - Find `S4_biggest_obstacles`.
  - Gate only if that question exists and `type === "MULTI_CHOICE"`.
  - If gate is valid and answer is an array, checked factors are that array.
  - If gate is valid and answer is missing/non-array, checked factors are empty.
  - Hide every question whose stable key starts with `S5_why_` unless the suffix
    after `S5_why_` is in checked factors.
  - Never hide non-prefix questions.

Client integration:

- Use `visibleQuestions` instead of `sortedQuestions` for:
  - `knownKeys`
  - required-question validation
  - `buildSectionPages`
  - welcome counts/time estimate only if the user is already in the form;
    otherwise keep intro counts as the full assessment shape to avoid dynamic
    changing before answers exist. Implementation can choose the simpler full
    count for intro and visible count for progress.
- Keep the answer state intact while the respondent is editing, but prune hidden
  keys during the existing hydrate/pre-submit prune path. If implementation can
  safely prune immediately when visibility changes without losing UX clarity,
  add a test first.

## 5. TDD Tasks

Task 1 - pure helper tests first:

- Add `src/src/__tests__/lib/assessments/form-visibility.test.ts`.
- Assert unknown alias returns all questions.
- Assert LVA with missing/non-MULTI_CHOICE gate returns all questions.
- Assert LVA valid gate with `["sales", "cash"]` returns:
  - `S4_biggest_obstacles`
  - `S5_why_sales`
  - `S5_why_cash`
  - always-on `S5_other_factor`
  - always-on `S5_change_one_thing`
  - not `S5_why_execution`
- Assert LVA valid gate with empty/missing answer hides all `S5_why_`.
- Assert prefix-match hides a drifted `S5_why_<unknown>` key when the gate is
  valid.

Task 2 - invited survey client tests:

- Add or extend an org survey client test with an LVA-shaped fixture.
- Verify initial render shows S4 and always-on S5 fields, but not per-factor
  `S5_why_` boxes.
- Check `sales`; verify `S5_why_sales` appears.
- Type into `S5_why_sales`; uncheck `sales`; verify it disappears.
- Submit or inspect request payload; verify hidden `S5_why_sales` is pruned.

Task 3 - public/shared regression:

- Add a public quiz client or shared visibility integration test proving the
  same helper path works if LVA is ever public.
- Add a non-LVA regression proving ordinary public quizzes remain unchanged.

Task 4 - implementation:

- Implement `form-visibility.ts`.
- Wire `visibleQuestions` into `org-survey-client.tsx`.
- Wire the same helper into `public-quiz-client.tsx` without changing public
  report behavior.
- Keep `SectionPager`, `QuestionInput`, and `buildSectionPages` generic.

Task 5 - review gates:

- Spec compliance review: confirm every in-scope/out-of-scope item above.
- Code quality review: confirm no generic conditional engine was smuggled in,
  no report model coupling leaks to client code, and hidden-answer pruning is
  covered by tests.
- Whole-branch review before PR.

## 6. Validation

Run from `D:/Scaling-up-platform-v2/src`:

```powershell
npx jest src/__tests__/lib/assessments/form-visibility.test.ts --runInBand
npx jest src/__tests__/components/assessments/org-survey-client.test.tsx --runInBand
npx jest src/__tests__/components/assessments/public-quiz-client.test.tsx --runInBand
npx eslint src/lib/assessments/form-visibility.ts src/components/assessments/org-survey-client.tsx src/components/assessments/public-quiz-client.tsx
$env:CI='true'; npx next build --turbopack
```

If actual test file names differ, use the closest existing component suites and
record the substitution in the PR body.

## 7. Risks And Guardrails

- **Risk: hidden stale answers leak to submit.** Guard with visible-key pruning
  tests.
- **Risk: intro/progress counts jump while the user checks boxes.** Prefer stable
  intro counts and visible form progress, or document the chosen behavior.
- **Risk: accidental generic engine.** Keep this LVA alias-keyed and key-based.
  A general engine needs its own wave.
- **Risk: old pinned versions.** Fail open when the S4 gate is absent or not
  `MULTI_CHOICE`.
- **Risk: public quiz behavior regression.** Non-LVA public quiz test must prove
  unchanged rendering/submission.

## 8. Source-of-Truth Follow-Up

When the implementation PR ships to production:

- Update `CLAUDE.md` `LAST_UPDATED_ISO` / `LAST_UPDATED_SLUG`.
- Prepend `plans/CHANGELOG.md` with the shipped detail.
- Reference this plan and ADR-0014.
