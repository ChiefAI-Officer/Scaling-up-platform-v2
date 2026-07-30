# Jeff #48 QSP Core-Values Stories Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Render the three QSP v2 core-values story answers as one progressively revealed “Add another person” question while preserving their existing stable keys and Esperto import mapping.

**Architecture:** Add a default-off presentation flag, a pure QSP-triplet classifier/progress model, and one focused progressive story component. `SectionPager` renders the classifier’s units and uses the same units for logical progress; public, invited, and editor Preview entry points resolve and pass the server flag. Submission state, published template content, imports, scoring, reports, and exports remain unchanged.

**Tech Stack:** Next.js App Router, React 19, TypeScript, Jest + Testing Library, scoped CSS, Vercel feature flags.

## Global Constraints

- The approved design is `docs/superpowers/specs/2026-07-30-jeff-48-qsp-core-values-stories-design.md`.
- The approved visual is `docs/specs/v7.6/mockups/48-qsp-core-values-progressive.html`.
- The three stable keys remain exactly `P1_core_values_story_1`, `P1_core_values_story_2`, and `P1_core_values_story_3`.
- Esperto mappings remain exactly `Q5a -> story_1`, `Q5b -> story_2`, and `Q5c -> story_3`.
- Do not change the Prisma schema, QSP seed question count, submission payload, scoring, reports, exports, or historical data.
- Group only the exact consecutive, same-section, optional `TEXT` triplet on template alias `qsp-v2`.
- Any incomplete, reordered, mistyped, required, wrong-alias, or flag-off case renders the ordinary questions.
- The grouped prompt contributes one logical progress item and is answered when any of the three values is nonblank.
- Start with one visible slot; reveal slots 2 and 3 in fixed order; do not remove, reorder, or compact answers.
- A restored answer expands the UI through the highest populated slot.
- `WAVE_48_QSP_STORY_GROUP_KILL` overrides `WAVE_48_QSP_STORY_GROUP_ENABLED`; both default false.
- Flag off must preserve current visible behavior and current question-based progress.
- Reuse `QuestionInput` for every textarea so text limits, answer updates, disabled state, and character counting do not fork.
- Run commands from `/Users/diushianstand/Scaling-up-platform-v2/src` unless a step explicitly says otherwise.

---

## File structure

### New files

- `src/src/lib/assessments/wave-48-flags.ts` — call-time environment gate.
- `src/src/__tests__/lib/assessments/wave-48-flags.test.ts` — flag truthiness and kill precedence.
- `src/src/lib/assessments/qsp-story-group.ts` — exact-triplet classifier, prompt derivation, restored-slot count, and logical progress.
- `src/src/__tests__/lib/assessments/qsp-story-group.test.ts` — pure behavior and fail-safe matrix.
- `src/src/components/assessments/qsp-story-group.tsx` — progressive, accessible story-entry UI.
- `src/src/__tests__/assessments/qsp-story-group.test.tsx` — interaction, focus, mapping, restore, and Preview behavior.
- `src/src/__tests__/assessments/section-pager-qsp-stories.test.tsx` — shared-pager render and progress integration.
- `src/src/__tests__/app/public-quiz-page-qsp-story-group.test.tsx` — public server-flag seam.
- `src/src/__tests__/app/org-survey-page-qsp-story-group.test.tsx` — invited server-flag seam.

### Modified files

- `src/.env.example` — document the two rollout variables.
- `src/src/components/assessments/section-pager.tsx` — render units and logical progress.
- `src/src/styles/wireframes-scoped.css` — approved story-group visuals and mobile behavior.
- `src/src/app/(public)/quiz/[campaignAlias]/page.tsx` — resolve the flag for public campaigns.
- `src/src/components/assessments/public-quiz-client.tsx` — pass alias and gate to `SectionPager`.
- `src/src/app/(public)/org-survey/[campaignAlias]/page.tsx` — resolve the flag for invited surveys.
- `src/src/components/assessments/org-survey-client.tsx` — pass the gate to `SectionPager`.
- `src/src/app/(dashboard)/admin/assessments/templates/[id]/versions/[versionId]/edit/page.tsx` — resolve the flag for editor Preview.
- `src/src/components/admin/template-editor/TabbedShell.tsx` — thread the gate into `PreviewTab`.
- `src/src/components/admin/template-editor/PreviewTab.tsx` — pass template alias and gate to the read-only pager.
- `src/src/__tests__/assessments/public-quiz-pager.test.tsx` — public end-to-end component seam.
- `src/src/__tests__/assessments/org-survey-pager.test.tsx` — invited end-to-end component seam.
- `src/src/__tests__/components/admin/template-editor/preview-tab.test.tsx` — read-only QSP grouped Preview.
- `src/src/__tests__/components/admin/template-editor/tabbed-shell-panels.wave-ed10.test.tsx` — editor prop threading.
- `CLAUDE.md`, `plans/CHANGELOG.md`, and the design/plan status lines — source-of-truth hygiene.

---

### Task 1: Add the default-off presentation gate

**Files:**

- Create: `src/src/lib/assessments/wave-48-flags.ts`
- Create: `src/src/__tests__/lib/assessments/wave-48-flags.test.ts`
- Modify: `src/.env.example`

**Interfaces:**

- Produces: `isQspStoryGroupEnabled(): boolean`.
- Produces: environment variables `WAVE_48_QSP_STORY_GROUP_ENABLED` and `WAVE_48_QSP_STORY_GROUP_KILL`.

- [x] **Step 1: Write the failing flag test**

```ts
import { isQspStoryGroupEnabled } from "@/lib/assessments/wave-48-flags";

const ENABLED = "WAVE_48_QSP_STORY_GROUP_ENABLED";
const KILL = "WAVE_48_QSP_STORY_GROUP_KILL";
const saved: Record<string, string | undefined> = {};

beforeEach(() => {
  for (const key of [ENABLED, KILL]) {
    saved[key] = process.env[key];
    delete process.env[key];
  }
});

afterEach(() => {
  for (const key of [ENABLED, KILL]) {
    if (saved[key] === undefined) delete process.env[key];
    else process.env[key] = saved[key];
  }
});

it.each(["1", "true", "TRUE", "yes"])("enables for %s", (value) => {
  process.env[ENABLED] = value;
  expect(isQspStoryGroupEnabled()).toBe(true);
});

it.each([undefined, "", "0", "false", "Yes"])(
  "stays off for %s",
  (value) => {
    if (value !== undefined) process.env[ENABLED] = value;
    expect(isQspStoryGroupEnabled()).toBe(false);
  },
);

it("lets the kill switch override enablement", () => {
  process.env[ENABLED] = "1";
  process.env[KILL] = "1";
  expect(isQspStoryGroupEnabled()).toBe(false);
});
```

- [x] **Step 2: Run the test and verify RED**

Run:

```bash
npx jest src/__tests__/lib/assessments/wave-48-flags.test.ts --runInBand
```

Expected: FAIL because `wave-48-flags.ts` does not exist.

- [x] **Step 3: Add the minimal call-time flag helper**

```ts
function isOn(value: string | undefined): boolean {
  return value === "1" || value === "true" || value === "TRUE" || value === "yes";
}

export function isQspStoryGroupEnabled(): boolean {
  if (isOn(process.env.WAVE_48_QSP_STORY_GROUP_KILL)) return false;
  return isOn(process.env.WAVE_48_QSP_STORY_GROUP_ENABLED);
}
```

- [x] **Step 4: Document both variables in `.env.example`**

Add immediately after the Jeff #83 flags:

```dotenv
# Jeff #48 — group the three QSP v2 core-values story slots into one
# progressive participant question. Presentation-only; default OFF.
# The kill switch wins when both values are set.
WAVE_48_QSP_STORY_GROUP_ENABLED="false"
WAVE_48_QSP_STORY_GROUP_KILL="false"
```

- [x] **Step 5: Verify GREEN and lint**

Run:

```bash
npx jest src/__tests__/lib/assessments/wave-48-flags.test.ts --runInBand
npx eslint src/lib/assessments/wave-48-flags.ts src/__tests__/lib/assessments/wave-48-flags.test.ts
```

Expected: PASS with no lint errors.

- [x] **Step 6: Commit**

```bash
git add .env.example src/lib/assessments/wave-48-flags.ts src/__tests__/lib/assessments/wave-48-flags.test.ts
git commit -m "feat(assessments): gate QSP story grouping"
```

---

### Task 2: Build the pure render-unit and progress model

**Files:**

- Create: `src/src/lib/assessments/qsp-story-group.ts`
- Create: `src/src/__tests__/lib/assessments/qsp-story-group.test.ts`

**Interfaces:**

- Consumes: `PagerQuestion[]`, `PagerPage[]`, template alias, feature-gate boolean, and answer map.
- Produces: `QspStoryQuestions`, `QuestionRenderUnit`, `buildQuestionRenderUnits()`, `initialVisibleStoryCount()`, and `questionProgress()`.

- [x] **Step 1: Write the failing classifier and progress tests**

Use this fixture and assertions:

```ts
import type { PagerQuestion } from "@/lib/assessments/section-pages";
import type { PagerPage } from "@/lib/assessments/custom-slides";
import {
  buildQuestionRenderUnits,
  initialVisibleStoryCount,
  questionProgress,
} from "@/lib/assessments/qsp-story-group";

const prompt =
  "Which employees have demonstrated that they live the core values? Why? Share the stories.";

function story(index: 1 | 2 | 3, over: Partial<PagerQuestion> = {}): PagerQuestion {
  return {
    stableKey: `P1_core_values_story_${index}`,
    sortOrder: 8 + index,
    sectionStableKey: "P1_retrospective",
    type: "TEXT",
    label: `${prompt} (Story ${index} of 3)`,
    isRequired: false,
    ...over,
  };
}

const triplet = [story(1), story(2), story(3)];

it("groups only the exact enabled qsp-v2 triplet", () => {
  const units = buildQuestionRenderUnits(triplet, {
    enabled: true,
    templateAlias: "qsp-v2",
  });
  expect(units).toHaveLength(1);
  expect(units[0]).toMatchObject({ kind: "qsp-story-group", prompt });
});

it.each([
  ["flag off", { enabled: false, templateAlias: "qsp-v2" }, triplet],
  ["wrong alias", { enabled: true, templateAlias: "other" }, triplet],
  ["missing key", { enabled: true, templateAlias: "qsp-v2" }, triplet.slice(0, 2)],
  ["wrong order", { enabled: true, templateAlias: "qsp-v2" }, [story(2), story(1), story(3)]],
  ["wrong type", { enabled: true, templateAlias: "qsp-v2" }, [story(1), story(2, { type: "NUMBER" }), story(3)]],
  ["required slot", { enabled: true, templateAlias: "qsp-v2" }, [story(1), story(2, { isRequired: true }), story(3)]],
  ["different section", { enabled: true, templateAlias: "qsp-v2" }, [story(1), story(2), story(3, { sectionStableKey: "P2" })]],
])("falls back for %s", (_name, options, questions) => {
  expect(buildQuestionRenderUnits(questions, options)).toHaveLength(questions.length);
  expect(buildQuestionRenderUnits(questions, options).every((unit) => unit.kind === "question")).toBe(true);
});

it("expands restored work through the highest nonblank slot", () => {
  const group = buildQuestionRenderUnits(triplet, {
    enabled: true,
    templateAlias: "qsp-v2",
  })[0];
  if (group.kind !== "qsp-story-group") throw new Error("expected grouped unit");
  expect(initialVisibleStoryCount(group.questions, {})).toBe(1);
  expect(initialVisibleStoryCount(group.questions, { P1_core_values_story_2: "Ada led the launch" })).toBe(2);
  expect(initialVisibleStoryCount(group.questions, { P1_core_values_story_3: "Grace coached the team" })).toBe(3);
  expect(initialVisibleStoryCount(group.questions, { P1_core_values_story_3: "   " })).toBe(1);
});

it("counts the group as one logical item answered by any nonblank slot", () => {
  const pages: PagerPage[] = [{
    kind: "section",
    stableKey: "P1_retrospective",
    name: "Looking back",
    isOther: false,
    questions: triplet,
  }];
  expect(questionProgress(pages, {}, { enabled: true, templateAlias: "qsp-v2" }))
    .toEqual({ answered: 0, total: 1 });
  expect(questionProgress(
    pages,
    { P1_core_values_story_2: "Ada led the launch" },
    { enabled: true, templateAlias: "qsp-v2" },
  )).toEqual({ answered: 1, total: 1 });
  expect(questionProgress(pages, {}, { enabled: false, templateAlias: "qsp-v2" }))
    .toEqual({ answered: 0, total: 3 });
});
```

- [x] **Step 2: Run the pure test and verify RED**

Run:

```bash
npx jest src/__tests__/lib/assessments/qsp-story-group.test.ts --runInBand
```

Expected: FAIL because `qsp-story-group.ts` does not exist.

- [x] **Step 3: Implement the exact classifier**

```ts
import type { PagerPage } from "@/lib/assessments/custom-slides";
import {
  isAnswered,
  type PagerQuestion,
} from "@/lib/assessments/section-pages";

export const QSP_V2_ALIAS = "qsp-v2";
export const QSP_STORY_KEYS = [
  "P1_core_values_story_1",
  "P1_core_values_story_2",
  "P1_core_values_story_3",
] as const;

export type AssessmentAnswers = Record<
  string,
  number | string | string[] | undefined
>;

export type QspStoryQuestions = readonly [
  PagerQuestion,
  PagerQuestion,
  PagerQuestion,
];

export type QuestionRenderUnit =
  | { kind: "question"; question: PagerQuestion }
  | {
      kind: "qsp-story-group";
      questions: QspStoryQuestions;
      prompt: string;
    };

interface GroupOptions {
  enabled: boolean;
  templateAlias?: string | null;
}

const STORY_ONE_SUFFIX = /\s+\(Story 1 of 3\)\s*$/;

function exactTriplet(candidate: PagerQuestion[]): QspStoryQuestions | null {
  if (candidate.length !== 3) return null;
  const [one, two, three] = candidate;
  const questions: QspStoryQuestions = [one, two, three];
  if (!questions.every((question, index) => question.stableKey === QSP_STORY_KEYS[index])) return null;
  if (!questions.every((question) => question.type === "TEXT" && !question.isRequired)) return null;
  const sectionKey = one.sectionStableKey?.trim();
  if (!sectionKey || !questions.every((question) => question.sectionStableKey === sectionKey)) return null;
  return questions;
}

export function buildQuestionRenderUnits(
  questions: PagerQuestion[],
  options: GroupOptions,
): QuestionRenderUnit[] {
  if (!options.enabled || options.templateAlias !== QSP_V2_ALIAS) {
    return questions.map((question) => ({ kind: "question", question }));
  }

  const units: QuestionRenderUnit[] = [];
  for (let index = 0; index < questions.length;) {
    const group = exactTriplet(questions.slice(index, index + 3));
    if (group) {
      units.push({
        kind: "qsp-story-group",
        questions: group,
        prompt: group[0].label.replace(STORY_ONE_SUFFIX, ""),
      });
      index += 3;
    } else {
      units.push({ kind: "question", question: questions[index] });
      index += 1;
    }
  }
  return units;
}

export function initialVisibleStoryCount(
  questions: QspStoryQuestions,
  answers: AssessmentAnswers,
): 1 | 2 | 3 {
  if (isAnswered(answers[questions[2].stableKey])) return 3;
  if (isAnswered(answers[questions[1].stableKey])) return 2;
  return 1;
}

export function questionProgress(
  pages: PagerPage[],
  answers: AssessmentAnswers,
  options: GroupOptions,
): { answered: number; total: number } {
  let answered = 0;
  let total = 0;
  for (const page of pages) {
    if (page.kind !== "section") continue;
    for (const unit of buildQuestionRenderUnits(page.questions, options)) {
      total += 1;
      const unitAnswered =
        unit.kind === "qsp-story-group"
          ? unit.questions.some((question) => isAnswered(answers[question.stableKey]))
          : isAnswered(answers[unit.question.stableKey]);
      if (unitAnswered) answered += 1;
    }
  }
  return { answered, total };
}
```

- [x] **Step 4: Run the test and verify GREEN**

Run:

```bash
npx jest src/__tests__/lib/assessments/qsp-story-group.test.ts --runInBand
npx eslint src/lib/assessments/qsp-story-group.ts src/__tests__/lib/assessments/qsp-story-group.test.ts
```

Expected: PASS.

- [x] **Step 5: Commit**

```bash
git add src/lib/assessments/qsp-story-group.ts src/__tests__/lib/assessments/qsp-story-group.test.ts
git commit -m "feat(assessments): model QSP story render group"
```

---

### Task 3: Build the progressive story-group component

**Files:**

- Create: `src/src/components/assessments/qsp-story-group.tsx`
- Create: `src/src/__tests__/assessments/qsp-story-group.test.tsx`
- Modify: `src/src/styles/wireframes-scoped.css`

**Interfaces:**

- Consumes: `QspStoryQuestions`, derived prompt, answer map, `onAnswerChange`, and `disabled`.
- Produces: `QspStoryGroup` with fixed-order reveal, focus transfer, live announcement, and stable-key writes.

- [x] **Step 1: Write the failing interaction tests**

Create the canonical triplet fixture used in Task 2 and cover these assertions:

```tsx
const onAnswerChange = jest.fn();
render(
  <QspStoryGroup
    questions={triplet}
    prompt={prompt}
    answers={{}}
    onAnswerChange={onAnswerChange}
  />,
);

expect(screen.getAllByRole("textbox")).toHaveLength(1);
expect(screen.getByRole("textbox", { name: "Person and story 1 of 3" }))
  .toHaveAttribute("maxlength", String(MAX_TEXT_ANSWER_LENGTH));

fireEvent.click(screen.getByRole("button", { name: /add another person/i }));
const second = screen.getByRole("textbox", { name: "Person and story 2 of 3" });
await waitFor(() => expect(second).toHaveFocus());

fireEvent.change(second, { target: { value: "Ada led the launch" } });
expect(onAnswerChange).toHaveBeenCalledWith(
  "P1_core_values_story_2",
  "Ada led the launch",
);

fireEvent.click(screen.getByRole("button", { name: /add another person/i }));
expect(screen.getAllByRole("textbox")).toHaveLength(3);
expect(screen.queryByRole("button", { name: /add another person/i }))
  .not.toBeInTheDocument();
```

Add separate tests proving:

- `{ P1_core_values_story_3: "Grace coached the team" }` renders all three slots;
- whitespace-only slot 3 still starts with one;
- clearing a restored slot during the same mount does not collapse already visible fields;
- changing slot 3 calls stable key 3 and never changes keys 1 or 2;
- there is no remove or reorder control;
- `disabled` disables visible textareas and the add button;
- the live region announces `Person and story 2 of 3 added.`;
- prompt and supporting copy render once.

- [x] **Step 2: Run the component test and verify RED**

Run:

```bash
npx jest src/__tests__/assessments/qsp-story-group.test.tsx --runInBand
```

Expected: FAIL because the component does not exist.

- [x] **Step 3: Implement the progressive component**

```tsx
"use client";

import React from "react";
import { QuestionInput } from "@/components/assessments/question-input";
import {
  initialVisibleStoryCount,
  type AssessmentAnswers,
  type QspStoryQuestions,
} from "@/lib/assessments/qsp-story-group";

interface QspStoryGroupProps {
  questions: QspStoryQuestions;
  prompt: string;
  answers: AssessmentAnswers;
  onAnswerChange: (
    stableKey: string,
    value: number | string | string[],
  ) => void;
  disabled?: boolean;
}

export function QspStoryGroup({
  questions,
  prompt,
  answers,
  onAnswerChange,
  disabled = false,
}: QspStoryGroupProps) {
  const [announcement, setAnnouncement] = React.useState("");
  const promptId = React.useId();
  const restoredCount = initialVisibleStoryCount(questions, answers);
  const [visibleCount, setVisibleCount] = React.useState(restoredCount);

  React.useEffect(() => {
    // Draft hydration may arrive after mount. Visibility grows monotonically
    // for this mount, so clearing a restored field never collapses the UI.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setVisibleCount((current) => Math.max(current, restoredCount));
  }, [restoredCount]);

  function revealNext() {
    if (disabled || visibleCount >= questions.length) return;
    const nextCount = visibleCount + 1;
    const nextQuestion = questions[nextCount - 1];
    setVisibleCount(nextCount);
    setAnnouncement(`Person and story ${nextCount} of 3 added.`);
    requestAnimationFrame(() => {
      document.getElementById(`q-${nextQuestion.stableKey}`)?.focus();
    });
  }

  return (
    <div
      className="qsp-story-group"
      role="group"
      aria-labelledby={promptId}
      data-testid="qsp-story-group"
    >
      <div className="qsp-story-prompt-row">
        <span className="qsp-story-prompt-mark" aria-hidden="true">Q</span>
        <div>
          <div id={promptId} className="qsp-story-prompt">{prompt}</div>
          <p className="qsp-story-help">
            Share up to three people and the examples that stood out.
          </p>
        </div>
      </div>

      <div className="qsp-story-entries">
        {questions.slice(0, visibleCount).map((question, index) => (
          <div className="qsp-story-entry" key={question.stableKey}>
            <label
              className="qsp-story-entry-label"
              htmlFor={`q-${question.stableKey}`}
            >
              <span>Person and story</span>
              <span className="qsp-story-count">{index + 1} of 3</span>
            </label>
            <QuestionInput
              question={question}
              value={answers[question.stableKey]}
              onChange={onAnswerChange}
              disabled={disabled}
            />
          </div>
        ))}
      </div>

      {visibleCount < questions.length ? (
        <button
          type="button"
          className="qsp-story-add"
          onClick={revealNext}
          disabled={disabled}
        >
          + Add another person
        </button>
      ) : null}

      <p className="sr-only" aria-live="polite">{announcement}</p>
    </div>
  );
}
```

- [x] **Step 4: Add the approved scoped styling**

Append inside the `.su-assessment-brand` respondent-style region:

```css
.su-assessment-brand .survey-question.qsp-story-question {
  padding: 1.75rem;
}
.su-assessment-brand .qsp-story-prompt-row {
  display: grid;
  grid-template-columns: 3rem minmax(0, 1fr);
  gap: 1rem;
  align-items: start;
}
.su-assessment-brand .qsp-story-prompt-mark {
  display: grid;
  place-items: center;
  width: 3rem;
  height: 3rem;
  border-radius: 0.875rem;
  background: hsl(var(--primary));
  color: #fff;
  font-weight: 800;
}
.su-assessment-brand .qsp-story-prompt {
  color: #231535;
  font-size: 1.125rem;
  font-weight: 800;
  line-height: 1.35;
}
.su-assessment-brand .qsp-story-help {
  margin: 0.35rem 0 0;
  color: #6b6480;
  font-size: 0.9375rem;
}
.su-assessment-brand .qsp-story-entries {
  display: grid;
  gap: 0.875rem;
  margin-top: 1.25rem;
}
.su-assessment-brand .qsp-story-entry {
  padding: 1rem;
  border: 1px solid #ded3ec;
  border-radius: 12px;
  background: #fcfbfd;
}
.su-assessment-brand .qsp-story-entry-label {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
  margin-bottom: 0.75rem;
  color: #49375d;
  font-size: 0.875rem;
  font-weight: 800;
}
.su-assessment-brand .qsp-story-count {
  flex: 0 0 auto;
  padding: 0.3rem 0.65rem;
  border-radius: 999px;
  background: #eee8f6;
  color: #522583;
  font-size: 0.75rem;
}
.su-assessment-brand .qsp-story-add {
  width: 100%;
  margin-top: 0.875rem;
  padding: 0.8rem 1rem;
  border: 1px dashed #a88ec7;
  border-radius: 10px;
  background: #faf7fd;
  color: #522583;
  font-weight: 800;
}
.su-assessment-brand .qsp-story-add:focus-visible {
  outline: 2px solid #522583;
  outline-offset: 2px;
}
.su-assessment-brand .qsp-story-add:disabled {
  cursor: not-allowed;
  opacity: 0.55;
}
@media (max-width: 640px) {
  .su-assessment-brand .survey-question.qsp-story-question {
    padding: 1.25rem;
  }
  .su-assessment-brand .qsp-story-prompt-row {
    grid-template-columns: 2.5rem minmax(0, 1fr);
    gap: 0.75rem;
  }
  .su-assessment-brand .qsp-story-prompt-mark {
    width: 2.5rem;
    height: 2.5rem;
    border-radius: 0.75rem;
  }
  .su-assessment-brand .qsp-story-entry {
    padding: 0.875rem;
  }
}
```

- [x] **Step 5: Verify GREEN and accessibility behavior**

Run:

```bash
npx jest src/__tests__/assessments/qsp-story-group.test.tsx --runInBand
npx eslint src/components/assessments/qsp-story-group.tsx src/__tests__/assessments/qsp-story-group.test.tsx
```

Expected: PASS; every visible textarea has a unique accessible name.

- [x] **Step 6: Commit**

```bash
git add src/components/assessments/qsp-story-group.tsx src/__tests__/assessments/qsp-story-group.test.tsx src/styles/wireframes-scoped.css
git commit -m "feat(assessments): add progressive QSP story fields"
```

---

### Task 4: Integrate grouped render units and logical progress into SectionPager

**Files:**

- Modify: `src/src/components/assessments/section-pager.tsx`
- Create: `src/src/__tests__/assessments/section-pager-qsp-stories.test.tsx`

**Interfaces:**

- Consumes: `qspStoryGroupEnabled?: boolean`, `templateAlias`, `buildQuestionRenderUnits()`, `questionProgress()`, and `QspStoryGroup`.
- Preserves: ordinary `QuestionInput` markup and all existing validation/navigation paths when grouping is inactive.

- [x] **Step 1: Write the failing shared-pager tests**

Build one section containing an ordinary answered question followed by the canonical triplet. Assert:

```tsx
render(
  <SectionPager
    pages={pages}
    answers={{ ordinary: "answered" }}
    onAnswerChange={onAnswerChange}
    onSubmit={onSubmit}
    submitting={false}
    templateAlias="qsp-v2"
    qspStoryGroupEnabled
  />,
);

expect(screen.getByTestId("qsp-story-group")).toBeInTheDocument();
expect(screen.getAllByText(prompt)).toHaveLength(1);
expect(screen.getByRole("progressbar")).toHaveAttribute("aria-valuemax", "2");
expect(screen.getByRole("progressbar")).toHaveAttribute("aria-valuenow", "1");
```

Rerender with `P1_core_values_story_3: "Grace coached the team"` and expect `aria-valuenow="2"` plus three visible textareas.

Add tests proving:

- omitted/false `qspStoryGroupEnabled` renders three ordinary question labels and `aria-valuemax="4"`;
- the wrong template alias renders three ordinary questions;
- the enabled group’s blank optional slots do not block Submit when another answer satisfies `requireAtLeastOneAnswer`;
- clicking Add and typing slot 2 reaches `onAnswerChange("P1_core_values_story_2", value)`;
- `previewMode` disables the story textarea and add button.

- [x] **Step 2: Run the pager test and verify RED**

Run:

```bash
npx jest src/__tests__/assessments/section-pager-qsp-stories.test.tsx --runInBand
```

Expected: FAIL because `SectionPager` does not accept or render the new gate.

- [x] **Step 3: Add the prop and shared progress calculation**

Extend `SectionPagerProps`:

```ts
/** Jeff #48 — server-resolved, default-OFF QSP story presentation gate. */
qspStoryGroupEnabled?: boolean;
```

Default it in the function signature:

```ts
qspStoryGroupEnabled = false
```

Replace the current raw question count:

```ts
const { answered: answeredCount, total } = questionProgress(pages, answers, {
  enabled: qspStoryGroupEnabled,
  templateAlias,
});
```

Do not replace the existing underlying-question required checks or the assessment-wide at-least-one-answer calculation.

- [x] **Step 4: Render the same units used by progress**

For a section page:

```ts
const pageRenderUnits =
  page.kind === "section"
    ? buildQuestionRenderUnits(pageQuestions, {
        enabled: qspStoryGroupEnabled,
        templateAlias,
      })
    : [];
```

Replace only the `sectionPage.questions.map` block:

```tsx
{pageRenderUnits.length > 0 ? (
  <ul className="survey-question-list">
    {pageRenderUnits.map((unit) => {
      if (unit.kind === "qsp-story-group") {
        return (
          <li
            key={unit.questions[0].stableKey}
            className="survey-question qsp-story-question"
          >
            <QspStoryGroup
              questions={unit.questions}
              prompt={unit.prompt}
              answers={answers}
              onAnswerChange={handleAnswerChange}
              disabled={submitting || previewMode}
            />
          </li>
        );
      }

      const q = unit.question;
      return (
        <li key={q.stableKey} className="survey-question">
          <label htmlFor={`q-${q.stableKey}`} className="survey-question-label">
            {q.label}
            {q.isRequired ? (
              <span className="survey-required" aria-hidden="true"> *</span>
            ) : null}
          </label>
          {q.helpText ? (
            <p className="survey-question-help">{q.helpText}</p>
          ) : null}
          <QuestionInput
            question={q}
            value={answers[q.stableKey]}
            onChange={handleAnswerChange}
            disabled={submitting || previewMode}
            invalid={invalidKeys.has(q.stableKey)}
          />
        </li>
      );
    })}
  </ul>
) : null}
```

This ordinary branch intentionally preserves the current markup.

- [x] **Step 5: Verify focused and frozen regressions**

Run:

```bash
npx jest \
  src/__tests__/assessments/section-pager-qsp-stories.test.tsx \
  src/__tests__/assessments/section-pager.test.tsx \
  src/__tests__/assessments/section-pager-slides.test.tsx \
  src/__tests__/assessments/section-pager-phase-tile.test.tsx \
  --runInBand
npx eslint src/components/assessments/section-pager.tsx src/__tests__/assessments/section-pager-qsp-stories.test.tsx
```

Expected: PASS; slides remain uncounted, SU-Full behavior remains unchanged, and Preview mode remains read-only.

- [x] **Step 6: Commit**

```bash
git add src/components/assessments/section-pager.tsx src/__tests__/assessments/section-pager-qsp-stories.test.tsx
git commit -m "feat(assessments): group QSP stories in respondent pager"
```

---

### Task 5: Wire the server gate through all respondent entry points

**Files:**

- Modify: `src/src/app/(public)/quiz/[campaignAlias]/page.tsx`
- Modify: `src/src/components/assessments/public-quiz-client.tsx`
- Modify: `src/src/app/(public)/org-survey/[campaignAlias]/page.tsx`
- Modify: `src/src/components/assessments/org-survey-client.tsx`
- Modify: `src/src/app/(dashboard)/admin/assessments/templates/[id]/versions/[versionId]/edit/page.tsx`
- Modify: `src/src/components/admin/template-editor/TabbedShell.tsx`
- Modify: `src/src/components/admin/template-editor/PreviewTab.tsx`
- Create: `src/src/__tests__/app/public-quiz-page-qsp-story-group.test.tsx`
- Create: `src/src/__tests__/app/org-survey-page-qsp-story-group.test.tsx`
- Modify: `src/src/__tests__/assessments/public-quiz-pager.test.tsx`
- Modify: `src/src/__tests__/assessments/org-survey-pager.test.tsx`
- Modify: `src/src/__tests__/components/admin/template-editor/preview-tab.test.tsx`
- Modify: `src/src/__tests__/components/admin/template-editor/tabbed-shell-panels.wave-ed10.test.tsx`

**Interfaces:**

- Produces: `qspStoryGroupEnabled?: boolean` on `PublicQuizClient`, `OrgSurveyClient`, `TabbedShell`, and `PreviewTab`.
- Guarantees: only server modules read `process.env`; client modules receive a boolean.

- [x] **Step 1: Write failing public and invited server-seam tests**

Mock `isQspStoryGroupEnabled()` and each client component. For both pages assert:

```ts
mockIsQspStoryGroupEnabled.mockReturnValue(false);
expect((await renderPageProps())).not.toHaveProperty("qspStoryGroupEnabled");

mockIsQspStoryGroupEnabled.mockReturnValue(true);
expect((await renderPageProps())).toHaveProperty("qspStoryGroupEnabled", true);
```

The public fixture must include a published PUBLIC campaign. The invited page needs only `params`, because its server component performs no database read.

- [x] **Step 2: Run the page tests and verify RED**

Run:

```bash
npx jest \
  src/__tests__/app/public-quiz-page-qsp-story-group.test.tsx \
  src/__tests__/app/org-survey-page-qsp-story-group.test.tsx \
  --runInBand
```

Expected: FAIL because neither page resolves or passes the flag.

- [x] **Step 3: Wire public and invited pages**

In each server page:

```ts
import { isQspStoryGroupEnabled } from "@/lib/assessments/wave-48-flags";
```

Pass the prop only when enabled:

```tsx
{...(isQspStoryGroupEnabled()
  ? { qspStoryGroupEnabled: true }
  : {})}
```

Add the optional prop with default `false` to each client. Public must pass both values:

```tsx
<SectionPager
  templateAlias={templateAlias ?? undefined}
  qspStoryGroupEnabled={qspStoryGroupEnabled}
/>
```

Invited already passes `data.campaign.templateAlias`; add:

```tsx
qspStoryGroupEnabled={qspStoryGroupEnabled}
```

- [x] **Step 4: Wire editor Preview**

In the admin edit page, resolve:

```tsx
qspStoryGroupEnabled={isQspStoryGroupEnabled()}
```

Add `qspStoryGroupEnabled?: boolean` to `TabbedShellProps`, default it to `false`, and pass it into `PreviewTab`.

Add the same optional/defaulted prop to `PreviewTab`, then pass:

```tsx
<SectionPager
  previewMode
  pages={pages}
  answers={{}}
  onAnswerChange={() => {}}
  onSubmit={() => {}}
  assessmentName={template.name}
  templateAlias={template.alias ?? undefined}
  qspStoryGroupEnabled={qspStoryGroupEnabled}
/>
```

Update PreviewTab’s existing comment: `templateAlias` is now passed for the QSP presentation adapter; `isCEO` remains false/omitted, so the SU-Full CEO tile still cannot fire.

- [x] **Step 5: Add component-seam assertions**

Public test:

```tsx
render(
  <PublicQuizClient
    {...baseProps}
    templateAlias="qsp-v2"
    questions={qspStoryQuestions}
    qspStoryGroupEnabled
  />,
);
reachFormStep();
expect(screen.getByTestId("qsp-story-group")).toBeInTheDocument();
```

Continue that public test by entering three distinct values, submitting, and
asserting the unchanged request body:

```ts
expect(body.answers).toEqual([
  { stableKey: "P1_core_values_story_1", value: "Ada led the launch" },
  { stableKey: "P1_core_values_story_2", value: "Grace coached the team" },
  { stableKey: "P1_core_values_story_3", value: "Lin removed a blocker" },
]);
```

Invited test: return `campaign.templateAlias = "qsp-v2"` and the canonical
triplet from `/me`, render
`<OrgSurveyClient campaignAlias={ALIAS} qspStoryGroupEnabled />`, enter the
pager, and expect the group. Enter and submit the same three values; assert the
invited `/submit` request carries the same three stable-key/value objects.

Preview test: use `template={{ name: "QSP v2", alias: "qsp-v2" }}`, the canonical three draft questions, `qspStoryGroupEnabled`, and expect one disabled textarea plus a disabled Add button.

TabbedShell test: set template alias `qsp-v2`, provide the canonical triplet, pass `qspStoryGroupEnabled: true`, enable ED10, and expect `qsp-story-group` in the mounted Preview panel.

- [x] **Step 6: Verify every entry point**

Run:

```bash
npx jest \
  src/__tests__/app/public-quiz-page-qsp-story-group.test.tsx \
  src/__tests__/app/org-survey-page-qsp-story-group.test.tsx \
  src/__tests__/assessments/public-quiz-pager.test.tsx \
  src/__tests__/assessments/org-survey-pager.test.tsx \
  src/__tests__/components/admin/template-editor/preview-tab.test.tsx \
  src/__tests__/components/admin/template-editor/tabbed-shell-panels.wave-ed10.test.tsx \
  --runInBand
```

Expected: PASS in public, invited, and read-only Preview paths.

- [x] **Step 7: Lint all wiring files**

Run:

```bash
npx eslint \
  'src/app/(public)/quiz/[campaignAlias]/page.tsx' \
  'src/app/(public)/org-survey/[campaignAlias]/page.tsx' \
  'src/app/(dashboard)/admin/assessments/templates/[id]/versions/[versionId]/edit/page.tsx' \
  src/components/assessments/public-quiz-client.tsx \
  src/components/assessments/org-survey-client.tsx \
  src/components/admin/template-editor/TabbedShell.tsx \
  src/components/admin/template-editor/PreviewTab.tsx
```

Expected: no lint errors.

- [x] **Step 8: Commit**

```bash
git add \
  'src/app/(public)/quiz/[campaignAlias]/page.tsx' \
  'src/app/(public)/org-survey/[campaignAlias]/page.tsx' \
  'src/app/(dashboard)/admin/assessments/templates/[id]/versions/[versionId]/edit/page.tsx' \
  src/components/assessments/public-quiz-client.tsx \
  src/components/assessments/org-survey-client.tsx \
  src/components/admin/template-editor/TabbedShell.tsx \
  src/components/admin/template-editor/PreviewTab.tsx \
  src/__tests__/app/public-quiz-page-qsp-story-group.test.tsx \
  src/__tests__/app/org-survey-page-qsp-story-group.test.tsx \
  src/__tests__/assessments/public-quiz-pager.test.tsx \
  src/__tests__/assessments/org-survey-pager.test.tsx \
  src/__tests__/components/admin/template-editor/preview-tab.test.tsx \
  src/__tests__/components/admin/template-editor/tabbed-shell-panels.wave-ed10.test.tsx
git commit -m "feat(assessments): wire QSP story grouping to respondent flows"
```

---

### Task 6: Prove compatibility, complete source-of-truth hygiene, and merge dark

**Files:**

- Modify: `docs/superpowers/specs/2026-07-30-jeff-48-qsp-core-values-stories-design.md`
- Modify: `docs/superpowers/plans/2026-07-30-jeff-48-qsp-core-values-stories.md`
- Modify: `CLAUDE.md`
- Modify: `plans/CHANGELOG.md`

**Interfaces:**

- Produces: one reviewable PR with the flag default off.
- Preserves: QSP seed keys/count, Esperto crosswalks, submission payloads, reports, and unrelated templates.

- [x] **Step 1: Run the complete focused regression suite**

Run:

```bash
npx jest \
  src/__tests__/lib/assessments/wave-48-flags.test.ts \
  src/__tests__/lib/assessments/qsp-story-group.test.ts \
  src/__tests__/assessments/qsp-story-group.test.tsx \
  src/__tests__/assessments/section-pager-qsp-stories.test.tsx \
  src/__tests__/assessments/section-pager.test.tsx \
  src/__tests__/assessments/section-pager-slides.test.tsx \
  src/__tests__/assessments/section-pager-phase-tile.test.tsx \
  src/__tests__/assessments/public-quiz-pager.test.tsx \
  src/__tests__/assessments/org-survey-pager.test.tsx \
  src/__tests__/components/admin/template-editor/preview-tab.test.tsx \
  src/__tests__/components/admin/template-editor/tabbed-shell-panels.wave-ed10.test.tsx \
  src/__tests__/seed/qsp-v2-content.test.ts \
  src/__tests__/seed/wave-p-seed-labels.test.ts \
  src/__tests__/lib/assessments/esperto-import/crosswalk.test.ts \
  src/__tests__/lib/assessments/esperto-import/results-plan.test.ts \
  --runInBand
```

Expected: PASS without changing any seed or crosswalk expectation.

- [x] **Step 2: Run the required repository gates**

Run:

```bash
node scripts/check-migration-safety.mjs
CI=true npx next build --turbopack
```

Expected: migration safety PASS and Turbopack build PASS.

- [x] **Step 3: Perform flag-off and flag-on visual review**

Use the editor Preview tab with the QSP v2 template at desktop width and at a mobile width no larger than 390px:

- flag off: three ordinary story questions and raw three-question progress;
- flag on: one prompt, slot 1, `1 of 3`, and Add button;
- Add once: slot 2 appears and receives focus;
- Add again: slot 3 appears and the Add button disappears;
- restored slot-3 draft: all three fields reopen;
- Preview mode: visible controls and Add are disabled;
- non-QSP template: unchanged ordinary rendering.

Compare the flag-on screen with `docs/specs/v7.6/mockups/48-qsp-core-values-progressive.html`. Record screenshots in the PR description; do not add temporary screenshots to the repository.

- [x] **Step 4: Update implementation status**

In the design, set:

```md
**Status:** BUILT behind a default-off flag; pending PR review and production launch
```

Check every completed implementation step in this plan. In `CLAUDE.md`, advance `LAST_UPDATED_ISO` and `LAST_UPDATED_SLUG` to a `jeff-48-qsp-story-group-built` entry. Prepend a detailed `plans/CHANGELOG.md` entry recording:

- no schema/content/import change;
- stable-key preservation;
- public/invited/Preview coverage;
- exact test/build commands and results;
- `WAVE_48_QSP_STORY_GROUP_ENABLED` remains off; and
- kill switch name.

- [x] **Step 5: Commit documentation**

```bash
git add \
  docs/superpowers/specs/2026-07-30-jeff-48-qsp-core-values-stories-design.md \
  docs/superpowers/plans/2026-07-30-jeff-48-qsp-core-values-stories.md \
  CLAUDE.md \
  plans/CHANGELOG.md
git commit -m "docs: record Jeff #48 build status"
```

- [x] **Step 6: Re-run diff and freshness checks**

Run from the repository root:

```bash
git diff --check origin/main...HEAD
git status --short
```

Run from `src`:

```bash
npx jest \
  src/__tests__/lib/assessments/qsp-story-group.test.ts \
  src/__tests__/assessments/section-pager-qsp-stories.test.tsx \
  --runInBand
CI=true npx next build --turbopack
```

Expected: clean diff check, only intentional branch changes, focused tests PASS, build PASS.

- [ ] **Step 7: Push and open a dark-launch PR**

```bash
git push -u origin codex/issue-48-qsp-story-ui-design
gh pr create \
  --base main \
  --head codex/issue-48-qsp-story-ui-design \
  --title "feat(assessments): group QSP core-values stories" \
  --body $'## Summary\n- implements the approved Option B progressive story UI\n- preserves P1_core_values_story_1/2/3 and Q5a/Q5b/Q5c\n- ships behind a default-off flag with a winning kill switch\n\n## Validation\n- focused Jest suites: PASS\n- migration safety: PASS\n- Turbopack production build: PASS\n- desktop and mobile visual review: PASS\n\n## Rollout\nMerge dark. Enable WAVE_48_QSP_STORY_GROUP_ENABLED only after the merged deployment is Ready.'
```

The PR body must list the approved visual, stable-key/import guarantees, flag-off behavior, focused tests, Turbopack result, and desktop/mobile screenshots.

- [ ] **Step 8: Wait for required checks and merge**

Required checks:

```text
Build
Migration Safety Gate
```

Address only actionable findings, rerun the proportional gates, and merge only when both required checks are green. Do not enable the feature flag in this task.

> **Post-review gate:** Task 6 Steps 7–8 are intentionally deferred until the
> independent whole-branch review is complete. No push, PR, merge, production
> environment change, deployment, or launch occurred during Steps 1–6.

---

### Task 7: Launch, smoke-test, and close the source of truth

**Files:**

- Modify after launch: `docs/superpowers/specs/2026-07-30-jeff-48-qsp-core-values-stories-design.md`
- Modify after launch: `CLAUDE.md`
- Modify after launch: `plans/CHANGELOG.md`

**Interfaces:**

- Produces: production-enabled QSP grouped presentation with an immediate kill switch.
- Produces: a consolidated LAUNCHED record in the designated source of truth.

- [ ] **Step 1: Confirm the merged deployment is Ready while the flag is off**

Run from `src`:

```bash
npx vercel ls
curl -sS https://scaling-up-platform-v2.vercel.app/api/health
```

Expected: newest `main` deployment is Ready and health returns success.

- [ ] **Step 2: Confirm rollback posture before enablement**

Run:

```bash
npx vercel env list production
```

Confirm `WAVE_48_QSP_STORY_GROUP_KILL` is absent or false. Resolve the exact
newest Ready production deployment URL before any redeploy:

```bash
QSP48_READY_URL=$(npx vercel ls --environment production --status READY --limit 1 --format json | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{const j=JSON.parse(s);const d=j.deployments?.[0];process.stdout.write(d?.url ?? d?.name ?? "")})')
test -n "$QSP48_READY_URL"
```

If the command cannot resolve a Ready URL, stop rather than redeploying an
unknown deployment. The rollback action is:

```bash
printf '1\n' | npx vercel env update WAVE_48_QSP_STORY_GROUP_KILL production
npx vercel redeploy "$QSP48_READY_URL" --target production
```

If the kill variable does not yet exist, use `vercel env add` in place of `vercel env update`.

- [ ] **Step 3: Enable the production flag and redeploy**

If the enable variable does not exist:

```bash
printf '1\n' | npx vercel env add WAVE_48_QSP_STORY_GROUP_ENABLED production
```

If it exists:

```bash
printf '1\n' | npx vercel env update WAVE_48_QSP_STORY_GROUP_ENABLED production
```

Redeploy the newest merged production deployment:

```bash
npx vercel redeploy "$QSP48_READY_URL" --target production
npx vercel ls
```

Expected: the new deployment reaches Ready before smoke testing.

- [ ] **Step 4: Perform the production launch walk**

Verify:

1. QSP v2 editor Preview shows one prompt, one initial story field, and a disabled Add button.
2. A real invited QSP v2 respondent shows one prompt and can reveal slots 2 and 3.
3. A public QSP v2 campaign, when available, shows the same treatment.
4. Enter distinct values into slots 1, 2, and 3; confirm the submitted/admin-visible answers retain the three original stable keys.
5. Progress treats the group as one question.
6. A non-QSP assessment remains unchanged.
7. Refreshing a draft with slot 3 populated reopens all three fields.
8. Desktop and mobile layouts match the approved mockup.

If any check fails, set the kill switch to `1`, redeploy, and confirm the three-question fallback before investigating.

- [ ] **Step 5: Create the closeout branch and record the launch**

Start the documentation closeout from the merged `main` state:

```bash
git fetch origin main
git switch -c codex/issue-48-qsp-story-launch-closeout origin/main
```

Update the design status to:

```md
**Status:** LAUNCHED on production on 2026-07-30
```

Advance `CLAUDE.md`’s freshness anchor to `jeff-48-qsp-story-group-launched`. Prepend a `plans/CHANGELOG.md` closeout containing:

- merge commit and PR number;
- Ready deployment ID and URL;
- enabled and kill variable names;
- production launch-walk results;
- stable-key/import verification;
- current rollback command; and
- tracker #48 disposition as launched.

- [ ] **Step 6: Commit and ship the launch closeout**

```bash
git add \
  docs/superpowers/specs/2026-07-30-jeff-48-qsp-core-values-stories-design.md \
  CLAUDE.md \
  plans/CHANGELOG.md
git commit -m "docs: close out Jeff #48 launch"
git push -u origin codex/issue-48-qsp-story-launch-closeout
gh pr create \
  --base main \
  --head codex/issue-48-qsp-story-launch-closeout \
  --title "docs: close out Jeff #48 launch" \
  --body "Records the verified production launch of Jeff tracker #48, including deployment, smoke results, stable-key compatibility, and rollback controls."
```

Merge the closeout PR after required checks pass. Confirm the final documentation deployment is Ready and the health endpoint remains successful.

---

## Completion criteria

- The approved Option B UI is live in public and invited QSP v2 flows.
- Editor Preview shows the same layout read-only.
- Slots remain mapped one-to-one to the three original stable keys.
- Esperto crosswalk and historical-import tests are unchanged and green.
- The group counts as one logical progress item.
- Restored answers reveal every populated slot.
- No remove/reorder/compaction behavior exists.
- Flag off/kill restores the three-question presentation without data changes.
- Required checks, targeted tests, migration safety, lint, and Turbopack pass.
- `CLAUDE.md`, `plans/CHANGELOG.md`, the design, and this plan reflect the final launched state.
