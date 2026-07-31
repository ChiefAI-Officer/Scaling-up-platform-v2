# Welcome-Screen Question-Bank Accuracy Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make invited and public assessment Welcome screens claim a rating scale only when every question uses the same valid slider scale.

**Architecture:** Replace the first-slider-only helper with one pure derivation over the complete question bank. The derivation returns the exact expectations sentence and an optional scale label; both participant clients compute it once and pass its fields into the shared Welcome components, which omit the scale chip when the label is absent.

**Tech Stack:** TypeScript 5, React, Next.js 16 App Router, Jest, React Testing Library

## Global Constraints

- A scale may render only when every question is `SLIDER_LIKERT`, every scale has finite numeric `min` and `max` values with `max > min`, and every slider uses the same range.
- Uniform banks keep the exact existing copy: `{count} short statement(s), rated {minimum}–{maximum}.`
- Banks with more than one supported response type, or multiple valid slider
  ranges, render exactly
  `{count} question(s) using a mix of response formats.`
- Homogeneous non-slider, empty, invalid, or unrecognized banks render only
  the neutral `{count} question(s).` fallback.
- A missing scale label removes only the scale chip; the existing question-count and section-count chips remain.
- `deriveTimeEstimate` and all time-estimate behavior remain byte-unchanged.
- Invited and public Welcome flows must use the same derivation.
- Do not add template aliases, percentage thresholds, CSS changes, API changes, migrations, seed edits, feature flags, or unrelated Welcome copy.
- Update `CLAUDE.md` and prepend `plans/CHANGELOG.md` in the implementation branch before push.
- Before push, run changed-file ESLint, focused Jest, migration safety, and `CI=true npx next build --turbopack` from the app root.

---

## File map

- Create `src/src/__tests__/assessments/assessment-welcome.test.tsx`
  - Owns pure composition tests against the real assessment seed builders.
  - Owns focused rendering tests for the expectations sentence and optional scale chip.
- Modify `src/src/components/assessments/assessment-welcome.tsx`
  - Owns `WelcomeQuestion`, `WelcomePresentation`, and `deriveWelcomePresentation`.
  - Renders caller-supplied expectations text.
  - Makes the scale chip conditional.
- Modify `src/src/components/assessments/public-quiz-client.tsx`
  - Computes the shared presentation once for the public flow.
- Modify `src/src/components/assessments/org-survey-client.tsx`
  - Computes the shared presentation once for the invited flow.
- Modify `src/src/__tests__/assessments/public-quiz-pager.test.tsx`
  - Pins the unchanged uniform-bank public behavior.
- Modify `src/src/__tests__/assessments/org-survey-pager.test.tsx`
  - Pins mixed-bank wording and two-chip behavior in the invited flow.
- Modify `CLAUDE.md`
  - Advances the SoT freshness anchor and records the PR-ready state briefly.
- Modify `plans/CHANGELOG.md`
  - Prepends the full implementation and verification record.

No stylesheet should change: `.su-welcome-chip { flex: 1 }` already balances a two-child row.

---

### Task 1: Derive one truthful Welcome presentation from the complete bank

**Files:**

- Create: `src/src/__tests__/assessments/assessment-welcome.test.tsx`
- Modify: `src/src/components/assessments/assessment-welcome.tsx:125-145`

**Interfaces:**

- Consumes: `questions: WelcomeQuestion[]`
- Produces:

```ts
export interface WelcomeQuestion {
  type: string;
  scale?: { min: number; max: number };
}

export interface WelcomePresentation {
  expectationText: string;
  scaleLabel: string | null;
}

export function deriveWelcomePresentation(
  questions: WelcomeQuestion[],
): WelcomePresentation;
```

- [ ] **Step 1: Create failing composition tests**

Create `src/src/__tests__/assessments/assessment-welcome.test.tsx` with the real seed builders and edge cases:

```tsx
import {
  deriveWelcomePresentation,
  type WelcomeQuestion,
} from "@/components/assessments/assessment-welcome";
import { buildLvaContent } from "../../../prisma/seed-lva-assessment";
import { buildQspV1Content } from "../../../prisma/seed-qsp-v1-assessment";
import { buildQspV2Content } from "../../../prisma/seed-qsp-v2-assessment";
import { buildScalingUpFullContent } from "../../../prisma/seed-scaling-up-full-assessment";
import { buildRockefellerContent } from "../../../prisma/seed-rockefeller-assessment";
import { buildFiveDysfunctionsContent } from "../../../prisma/seed-five-dysfunctions";
import { buildQuickAssessmentContent } from "../../../prisma/seed-scaling-up-quick-assessment";

function asWelcomeQuestions(questions: unknown[]): WelcomeQuestion[] {
  return questions as WelcomeQuestion[];
}

describe("deriveWelcomePresentation", () => {
  it.each([
    ["LVA", buildLvaContent().questions, "67 questions using a mix of response formats."],
    ["QSP v1", buildQspV1Content().questions, "28 questions using a mix of response formats."],
    ["QSP v2", buildQspV2Content().questions, "22 questions using a mix of response formats."],
    [
      "Scaling Up Full",
      buildScalingUpFullContent().questions,
      "63 questions using a mix of response formats.",
    ],
  ])("suppresses the scale for mixed bank %s", (_name, questions, expectationText) => {
    expect(deriveWelcomePresentation(asWelcomeQuestions(questions))).toEqual({
      expectationText,
      scaleLabel: null,
    });
  });

  it.each([
    ["Rockefeller Habits", buildRockefellerContent().questions, "40 short statements, rated 0–3.", "0–3"],
    ["Five Dysfunctions", buildFiveDysfunctionsContent().questions, "38 short statements, rated 1–5.", "1–5"],
    ["Scaling Up Quick", buildQuickAssessmentContent().questions, "32 short statements, rated 0–10.", "0–10"],
  ])(
    "preserves the scale for uniform bank %s",
    (_name, questions, expectationText, scaleLabel) => {
      expect(deriveWelcomePresentation(asWelcomeQuestions(questions))).toEqual({
        expectationText,
        scaleLabel,
      });
    },
  );

  it("suppresses differing slider ranges", () => {
    expect(
      deriveWelcomePresentation([
        { type: "SLIDER_LIKERT", scale: { min: 0, max: 3 } },
        { type: "SLIDER_LIKERT", scale: { min: 1, max: 5 } },
      ]),
    ).toEqual({
      expectationText: "2 questions using a mix of response formats.",
      scaleLabel: null,
    });
  });

  it.each([
    ["empty bank", [], "0 questions."],
    ["homogeneous text bank", [{ type: "TEXT" }], "1 question."],
    ["unknown type", [{ type: "RANKING" }], "1 question."],
    [
      "invalid scale",
      [{ type: "SLIDER_LIKERT", scale: { min: 5, max: 1 } }],
      "1 question.",
    ],
    [
      "non-finite scale",
      [{ type: "SLIDER_LIKERT", scale: { min: 0, max: Number.NaN } }],
      "1 question.",
    ],
    [
      "later invalid scale",
      [
        { type: "SLIDER_LIKERT", scale: { min: 0, max: 3 } },
        { type: "SLIDER_LIKERT", scale: { min: 3, max: 3 } },
      ],
      "2 questions.",
    ],
  ])("uses neutral copy for %s", (_name, questions, expectationText) => {
    expect(deriveWelcomePresentation(questions as WelcomeQuestion[])).toEqual({
      expectationText,
      scaleLabel: null,
    });
  });
});
```

- [ ] **Step 2: Run the new suite and verify the missing export fails**

Run from `src/`:

```bash
npx jest src/__tests__/assessments/assessment-welcome.test.tsx --runInBand
```

Expected: FAIL because `assessment-welcome.tsx` does not export `deriveWelcomePresentation` or `WelcomeQuestion`.

- [ ] **Step 3: Implement the minimal pure derivation**

In `src/src/components/assessments/assessment-welcome.tsx`, add the following
immediately before the existing `deriveScaleLabel` comment:

```ts
export interface WelcomeQuestion {
  type: string;
  scale?: { min: number; max: number };
}

export interface WelcomePresentation {
  expectationText: string;
  scaleLabel: string | null;
}

const SUPPORTED_QUESTION_TYPES = new Set([
  "SLIDER_LIKERT",
  "TEXT",
  "NUMBER",
  "MULTI_CHOICE",
]);

function questionCountLabel(questionCount: number): string {
  return `${questionCount} ${questionCount === 1 ? "question" : "questions"}`;
}

export function deriveWelcomePresentation(
  questions: WelcomeQuestion[],
): WelcomePresentation {
  const countLabel = questionCountLabel(questions.length);
  const neutral = {
    expectationText: `${countLabel}.`,
    scaleLabel: null,
  };

  if (
    questions.length === 0 ||
    questions.some((question) => !SUPPORTED_QUESTION_TYPES.has(question.type))
  ) {
    return neutral;
  }

  const responseTypes = new Set(questions.map((question) => question.type));
  if (responseTypes.size > 1) {
    return {
      expectationText: `${countLabel} using a mix of response formats.`,
      scaleLabel: null,
    };
  }

  if (!responseTypes.has("SLIDER_LIKERT")) {
    return neutral;
  }

  const firstScale = questions[0].scale;
  const allScalesValid = questions.every(({ scale }) =>
    Boolean(
      scale &&
        Number.isFinite(scale.min) &&
        Number.isFinite(scale.max) &&
        scale.max > scale.min,
    ),
  );
  if (!firstScale || !allScalesValid) {
    return neutral;
  }

  const sameScale = questions.every(
    ({ scale }) =>
      scale?.min === firstScale.min && scale?.max === firstScale.max,
  );

  if (!sameScale) {
    return {
      expectationText: `${countLabel} using a mix of response formats.`,
      scaleLabel: null,
    };
  }

  const scaleLabel = `${firstScale.min}–${firstScale.max}`;
  return {
    expectationText:
      `${questions.length} short ` +
      `${questions.length === 1 ? "statement" : "statements"}, rated ${scaleLabel}.`,
    scaleLabel,
  };
}
```

Leave `deriveScaleLabel` temporarily in place so both existing clients continue
to compile at this independently testable commit boundary. Do not change
`deriveTimeEstimate`.

- [ ] **Step 4: Run the new composition suite**

Run:

```bash
npx jest src/__tests__/assessments/assessment-welcome.test.tsx --runInBand
```

Expected: PASS, including all seven real assessment banks and all fallback cases.

- [ ] **Step 5: Commit the pure derivation**

```bash
git add src/src/components/assessments/assessment-welcome.tsx \
  src/src/__tests__/assessments/assessment-welcome.test.tsx
git commit -m "test(assessments): define truthful welcome presentation (#222)"
```

---

### Task 2: Use the shared presentation on both participant Welcome screens

**Files:**

- Modify: `src/src/components/assessments/assessment-welcome.tsx:38-122`
- Modify: `src/src/components/assessments/public-quiz-client.tsx:22-29,154-158,264-275`
- Modify: `src/src/components/assessments/org-survey-client.tsx:42-49,364-368,609-620`
- Modify: `src/src/__tests__/assessments/assessment-welcome.test.tsx`
- Modify: `src/src/__tests__/assessments/public-quiz-pager.test.tsx:472-490`
- Modify: `src/src/__tests__/assessments/org-survey-pager.test.tsx:583-600`

**Interfaces:**

- Consumes: `WelcomePresentation` returned once per sorted question bank.
- Produces:

```ts
export interface WelcomeExpectationsProps {
  timeLabel: string;
  expectationText: string;
  confidentialSub: string;
  scoresSub: string;
}

export function WelcomeStats(props: {
  questionCount: number;
  sectionCount: number;
  scaleLabel: string | null;
}): React.ReactElement;
```

- [ ] **Step 1: Add failing shared-component rendering tests**

Extend `assessment-welcome.test.tsx` imports:

```tsx
import React from "react";
import { render, screen, within } from "@testing-library/react";
import {
  deriveWelcomePresentation,
  WelcomeExpectations,
  WelcomeStats,
  type WelcomeQuestion,
} from "@/components/assessments/assessment-welcome";
```

Append:

```tsx
describe("Welcome presentation rendering", () => {
  it("renders mixed copy and only question/section chips without a scale", () => {
    render(
      <>
        <WelcomeExpectations
          timeLabel="About 35 minutes"
          expectationText="67 questions using a mix of response formats."
          confidentialSub="Confidential detail."
          scoresSub="Scores detail."
        />
        <WelcomeStats questionCount={67} sectionCount={8} scaleLabel={null} />
      </>,
    );

    expect(
      within(screen.getByTestId("welcome-expectations")).getByText(
        "67 questions using a mix of response formats.",
      ),
    ).toBeInTheDocument();
    const stats = screen.getByTestId("welcome-stats");
    expect(stats.querySelectorAll(".su-welcome-chip")).toHaveLength(2);
    expect(within(stats).queryByText("scale")).not.toBeInTheDocument();
  });

  it("preserves uniform copy and the scale chip", () => {
    render(
      <>
        <WelcomeExpectations
          timeLabel="About 15 minutes"
          expectationText="40 short statements, rated 0–3."
          confidentialSub="Confidential detail."
          scoresSub="Scores detail."
        />
        <WelcomeStats questionCount={40} sectionCount={10} scaleLabel="0–3" />
      </>,
    );

    expect(
      within(screen.getByTestId("welcome-expectations")).getByText(
        "40 short statements, rated 0–3.",
      ),
    ).toBeInTheDocument();
    const stats = screen.getByTestId("welcome-stats");
    expect(stats.querySelectorAll(".su-welcome-chip")).toHaveLength(3);
    expect(within(stats).getByText("0–3")).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Update the pager expectations before production wiring**

In the invited Welcome test, replace the stale scale assertion with:

```tsx
expect(
  within(expectations).getByText(
    "2 questions using a mix of response formats.",
  ),
).toBeInTheDocument();

const stats = screen.getByTestId("welcome-stats");
expect(stats.querySelectorAll(".su-welcome-chip")).toHaveLength(2);
expect(within(stats).getByText("2")).toBeInTheDocument();
expect(within(stats).getByText("1")).toBeInTheDocument();
expect(within(stats).queryByText("0–3")).not.toBeInTheDocument();
expect(within(stats).queryByText("scale")).not.toBeInTheDocument();
```

In the public Welcome test, retain the existing exact copy and scale assertions, then add:

```tsx
expect(stats.querySelectorAll(".su-welcome-chip")).toHaveLength(3);
```

- [ ] **Step 3: Run the component and pager suites and verify red**

Run:

```bash
npx jest \
  src/__tests__/assessments/assessment-welcome.test.tsx \
  src/__tests__/assessments/org-survey-pager.test.tsx \
  src/__tests__/assessments/public-quiz-pager.test.tsx \
  --runInBand
```

Expected: FAIL because `WelcomeExpectations` still requires `questionCount` and `scaleLabel`, `WelcomeStats` still requires a string scale, and the invited client still displays `0–3`.

- [ ] **Step 4: Make the shared components consume the presentation fields**

In `assessment-welcome.tsx`:

```ts
export interface WelcomeExpectationsProps {
  timeLabel: string;
  expectationText: string;
  confidentialSub: string;
  scoresSub: string;
}
```

Destructure `expectationText` instead of `questionCount` and `scaleLabel`, and replace the old generated sentence with:

```tsx
<span>{expectationText}</span>
```

Change `WelcomeStats` to accept `scaleLabel: string | null`, and wrap only the third chip:

```tsx
{scaleLabel ? (
  <div className="su-welcome-chip">
    <b>{scaleLabel}</b>
    <span>scale</span>
  </div>
) : null}
```

Update the component comments from “three stat chips” and first-slider language so they describe the optional scale chip and complete-bank derivation.

After both clients have stopped importing it, delete the legacy
`deriveScaleLabel` function and its first-slider comment. Do not leave two
competing derivations.

- [ ] **Step 5: Wire the public client once**

In `public-quiz-client.tsx`, replace the import of `deriveScaleLabel` with `deriveWelcomePresentation`.

Replace:

```ts
const scaleLabel = useMemo(() => deriveScaleLabel(sortedQuestions), [sortedQuestions]);
```

with:

```ts
const welcomePresentation = useMemo(
  () => deriveWelcomePresentation(sortedQuestions),
  [sortedQuestions],
);
```

Keep the `deriveTimeEstimate` memo unchanged. Pass:

```tsx
<WelcomeExpectations
  timeLabel={timeEstimate}
  expectationText={welcomePresentation.expectationText}
  confidentialSub="Your results are shown to you the moment you submit."
  scoresSub="See where you stand across each category."
/>
<WelcomeStats
  questionCount={sortedQuestions.length}
  sectionCount={sortedSections.length}
  scaleLabel={welcomePresentation.scaleLabel}
/>
```

- [ ] **Step 6: Wire the invited client once**

In `org-survey-client.tsx`, make the same import and memo replacement:

```ts
const welcomePresentation = useMemo(
  () => deriveWelcomePresentation(sortedQuestions),
  [sortedQuestions],
);
```

Keep the `deriveTimeEstimate` memo unchanged. Pass:

```tsx
<WelcomeExpectations
  timeLabel={timeEstimate}
  expectationText={welcomePresentation.expectationText}
  confidentialSub="Your individual answers feed the team picture."
  scoresSub="See where the team stands across each category."
/>
<WelcomeStats
  questionCount={sortedQuestions.length}
  sectionCount={sortedSections.length}
  scaleLabel={welcomePresentation.scaleLabel}
/>
```

- [ ] **Step 7: Run the focused suites and verify green**

Run:

```bash
npx jest \
  src/__tests__/assessments/assessment-welcome.test.tsx \
  src/__tests__/assessments/org-survey-pager.test.tsx \
  src/__tests__/assessments/public-quiz-pager.test.tsx \
  --runInBand
```

Expected: PASS. The invited mixed fixture has two chips and no scale claim; the public uniform fixture retains its exact sentence and three chips.

- [ ] **Step 8: Run changed-file ESLint**

Run:

```bash
npx eslint \
  src/components/assessments/assessment-welcome.tsx \
  src/components/assessments/public-quiz-client.tsx \
  src/components/assessments/org-survey-client.tsx \
  src/__tests__/assessments/assessment-welcome.test.tsx \
  src/__tests__/assessments/public-quiz-pager.test.tsx \
  src/__tests__/assessments/org-survey-pager.test.tsx
```

Expected: exit 0 with no errors.

- [ ] **Step 9: Commit the shared rendering change**

```bash
git add \
  src/src/components/assessments/assessment-welcome.tsx \
  src/src/components/assessments/public-quiz-client.tsx \
  src/src/components/assessments/org-survey-client.tsx \
  src/src/__tests__/assessments/assessment-welcome.test.tsx \
  src/src/__tests__/assessments/public-quiz-pager.test.tsx \
  src/src/__tests__/assessments/org-survey-pager.test.tsx
git commit -m "fix(assessments): make welcome scale claims truthful (#222)"
```

---

### Task 3: Run release gates and record the source of truth

**Files:**

- Modify: `CLAUDE.md:21`
- Modify: `plans/CHANGELOG.md:8`
- Test: `src/src/__tests__/lint/changelog-freshness.test.ts`

**Interfaces:**

- Consumes: verified implementation from Tasks 1 and 2.
- Produces: aligned `LAST_UPDATED_*` and topmost `ENTRY_*` anchors using slug `gh-222-welcome-screen-accuracy-implemented`.

- [ ] **Step 1: Re-run the focused regression set**

Run from `src/`:

```bash
npx jest \
  src/__tests__/assessments/assessment-welcome.test.tsx \
  src/__tests__/assessments/org-survey-pager.test.tsx \
  src/__tests__/assessments/public-quiz-pager.test.tsx \
  --runInBand
```

Expected: all three suites pass.

- [ ] **Step 2: Run migration safety**

Run:

```bash
node scripts/check-migration-safety.mjs
```

Expected: exit 0 with no newly introduced destructive migration.

- [ ] **Step 3: Run the Turbopack production build**

Run:

```bash
CI=true npx next build --turbopack
```

Expected: exit 0 after compilation, type checking, and route generation.

- [ ] **Step 4: Advance the CLAUDE.md anchor and brief prose**

Replace only the `Last Updated` row with:

```md
| **Last Updated** | <!-- LAST_UPDATED_ISO:2026-07-31 LAST_UPDATED_SLUG:gh-222-welcome-screen-accuracy-implemented --> July 31, 2026 — **GH #222 Welcome-screen question-bank accuracy is IMPLEMENTED + LOCALLY VERIFIED, not yet merged or launched.** A scale is now described only when every question shares one valid slider range; mixed banks use neutral format-aware wording and omit only the scale chip. Time estimates, question/section chips, APIs, stored data, and assessment content are unchanged. Full detail in CHANGELOG entry `gh-222-welcome-screen-accuracy-implemented`. |
```

- [ ] **Step 5: Prepend the full changelog entry**

Insert immediately after the `---` near the top of `plans/CHANGELOG.md`:

```md
### 2026-07-31 — Welcome-screen question-bank accuracy implemented (GH #222) <!-- ENTRY_ISO:2026-07-31 ENTRY_SLUG:gh-222-welcome-screen-accuracy-implemented -->

**Status: IMPLEMENTED + LOCALLY VERIFIED; not yet merged or launched.** The shared participant Welcome screen no longer takes the first slider's range and presents it as a property of the entire question bank.

**Behavior.** A bank shows its existing `short statements, rated …` sentence and scale chip only when every question is `SLIDER_LIKERT`, every range is finite and increasing, and every range matches. LVA, QSP v1, QSP v2, and Scaling Up Full instead use `questions using a mix of response formats` and retain only the existing question-count and section-count chips. Rockefeller Habits, Five Dysfunctions, and Scaling Up Quick retain their existing rated copy and three-chip layout. Invited and public flows use one shared derivation.

**Scope.** `deriveTimeEstimate` is unchanged. No template-specific rule, percentage threshold, CSS change, API change, migration, seed edit, feature flag, or unrelated Welcome copy is included.

**Verification.** The focused shared-component, invited-pager, and public-pager suites passed. Changed-file ESLint, migration safety, changelog freshness, `git diff --check`, and `CI=true npx next build --turbopack` passed.

**Rollout and rollback.** This is a flagless presentation fix with no stored-data change. It is not live until its PR merges and deploys; rollback is a normal revert.

---
```

- [ ] **Step 6: Verify SoT alignment**

Run:

```bash
npx jest src/__tests__/lint/changelog-freshness.test.ts --runInBand
```

Expected: PASS; the `LAST_UPDATED_*` anchor matches the topmost `ENTRY_*` anchor and the CLAUDE.md size guard remains green.

- [ ] **Step 7: Run final static checks**

Run:

```bash
git diff --check
git status --short
```

Expected: no whitespace errors; only `CLAUDE.md` and `plans/CHANGELOG.md` remain uncommitted at this task boundary.

- [ ] **Step 8: Commit the source-of-truth record**

```bash
git add CLAUDE.md plans/CHANGELOG.md
git commit -m "docs(sot): record welcome-screen accuracy fix (#222)"
```

- [ ] **Step 9: Confirm the branch is ready for review**

Run:

```bash
git status --short --branch
git log --oneline origin/main..HEAD
```

Expected: clean working tree; the design, implementation plan, test-first derivation, shared rendering fix, and SoT commits appear above `origin/main`.
