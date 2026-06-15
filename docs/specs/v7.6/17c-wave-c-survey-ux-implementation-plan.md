# Wave C — Assessment Survey Participant UX — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix Spec 17 items #6–#14 on the live assessment survey — one clean purple card (no white chrome, no orange "01"), a slider that doesn't look pre-answered, bordered/placeholdered text inputs with a surfaced char limit, and per-question red validation that survives every focus/draft edge case — across both the invited and public flows.

**Architecture:** Pure participant-UI work. All changes live in the shared `SectionPager` / `QuestionInput` / `AssessmentShellHeader` components, the two thin clients (`org-survey-client`, `public-quiz-client`), and the scoped `.su-assessment-brand` CSS block. Two logic changes only — the slider unanswered/invalid state (#8) and per-question validation (#13). Additive, no migration, no feature flag; reversible by `git revert` + Vercel promote-previous.

**Tech Stack:** Next.js (App Router, Turbopack 16.1.6), TypeScript, React 19, Jest + React Testing Library, Playwright (one Chromium visual check), Tailwind + scoped CSS.

**Design source:** [`17c-wave-c-survey-ux-design.md`](17c-wave-c-survey-ux-design.md) — read it; this plan implements that design including every claudex finding (G1–G7 + Round 1/2/3, see its Changelog).

**Branch:** `feat/wave-c-survey-ux` (already created off `main`). **Source root:** `/Users/diushianstand/Scaling-up-platform-v2/src`. **Build gate (run from the source root):** `CI=true npx next build --turbopack`.

**Pre-build gate (HARD):** Do **not** start Task 1 until the user signs off on a `/frontend-design` mockup of the restyled survey (#6/#7/#8/#9/#11) — mockup-before-build, per design constraint 5 and the established Wave pattern (PRs #41/#51/#54). After the build, a final user merge-go follows the preview smoke (Task 8).

---

## File Structure

| File | Responsibility | Action |
|------|----------------|--------|
| `src/src/lib/assessments/answer-limits.ts` | Client-safe answer-length constants (no Zod/server imports) | **Create** |
| `src/src/lib/assessments/scoring.ts` | Re-import `MAX_TEXT_ANSWER_LENGTH` from `answer-limits` (no behavior change) | Modify |
| `src/src/components/assessments/question-input.tsx` | Per-type control + new `invalid` prop, slider `--pct`, placeholders, maxLength + counter, MULTI_CHOICE focus id | Modify |
| `src/src/components/assessments/section-pager.tsx` | #13 validation engine, focus-first-invalid, `requireAtLeastOneAnswer`, submit latch; remove `su-intro-num` | Modify |
| `src/src/components/assessments/AssessmentShellHeader.tsx` | Owns the single `role="progressbar"`; caption; drop segmented strip | Modify |
| `src/src/components/assessments/org-survey-client.tsx` | Remove `ty-header` + `ty-card`; prune-on-hydrate + pre-submit; submit-error recovery; pass `requireAtLeastOneAnswer` | Modify |
| `src/src/components/assessments/public-quiz-client.tsx` | Remove `ty-header`; caption = `campaignName`; prune-on-hydrate + pre-submit; submit latch | Modify |
| `src/src/lib/assessments/prune-answers.ts` | Pure helper: prune an answers map to a known stableKey set | **Create** |
| `src/src/styles/wireframes-scoped.css` | All visual changes, scoped under `.su-assessment-brand` | Modify |
| `src/src/__tests__/components/assessments/question-input.test.tsx` | QuestionInput tests | Modify |
| `src/src/__tests__/assessments/section-pager.test.tsx` | SectionPager tests | Modify |
| `src/src/__tests__/lib/assessments/prune-answers.test.ts` | prune helper tests | **Create** |
| `src/tests-e2e/` (Playwright) | One Chromium visual check of slider states | **Create** (location per existing e2e convention) |

**Shared contract introduced by this plan (used across tasks — define once, reuse):**
- `QuestionInput` gains `invalid?: boolean`. Every question type renders a focusable element with `id={`q-${stableKey}`}` (slider/text/number already do; MULTI_CHOICE adds it to its **first** checkbox) so the pager can focus by `document.getElementById` (metacharacter-safe — claudex R2-L1).
- `SectionPager` gains `requireAtLeastOneAnswer?: boolean`.
- `isAnswered(value)` (existing, `@/lib/assessments/section-pages`) is the single source of "answered" — `0` and a non-empty string/array count; `undefined`/`null`/`""`/`[]` do not.

---

### Task 1: Client-safe answer-length constants (claudex R1-M4)

**Files:**
- Create: `src/src/lib/assessments/answer-limits.ts`
- Modify: `src/src/lib/assessments/scoring.ts` (around line 490)
- Test: `src/src/__tests__/lib/assessments/answer-limits.test.ts` (create)

**Why:** `MAX_TEXT_ANSWER_LENGTH` lives in `scoring.ts`, which imports Zod and server scoring logic. Importing it into the client `QuestionInput` would pull that whole module into the participant bundle. Extract the constant into a tiny client-safe module both sides import.

- [ ] **Step 1: Write the failing test**

```ts
// src/src/__tests__/lib/assessments/answer-limits.test.ts
import { MAX_TEXT_ANSWER_LENGTH } from "@/lib/assessments/answer-limits";
import { MAX_TEXT_ANSWER_LENGTH as fromScoring } from "@/lib/assessments/scoring";

describe("answer-limits", () => {
  it("exposes the 10k text limit", () => {
    expect(MAX_TEXT_ANSWER_LENGTH).toBe(10_000);
  });
  it("scoring.ts re-exports the same constant (single source of truth)", () => {
    expect(fromScoring).toBe(MAX_TEXT_ANSWER_LENGTH);
  });
});
```

- [ ] **Step 2: Run it, expect FAIL** — `cd src && npx jest answer-limits` → fails (module missing).

- [ ] **Step 3: Create the module**

```ts
// src/src/lib/assessments/answer-limits.ts
/**
 * Client-safe answer-length limits. NO Zod / server imports — safe to import
 * from participant client components without bundling the scoring module.
 */
/** Maximum character length accepted for a TEXT answer. */
export const MAX_TEXT_ANSWER_LENGTH = 10_000;
```

- [ ] **Step 4: Re-point `scoring.ts`** — replace the literal `export const MAX_TEXT_ANSWER_LENGTH = 10_000;` (≈ line 490) with a re-export so all existing server importers are unchanged:

```ts
// near the top of the "Answer value validation" section of scoring.ts
export { MAX_TEXT_ANSWER_LENGTH } from "./answer-limits";
```

Remove the old `export const MAX_TEXT_ANSWER_LENGTH = 10_000;` line. Leave its doc comment above the re-export.

- [ ] **Step 5: Run it, expect PASS** — `cd src && npx jest answer-limits scoring` → both pass.

- [ ] **Step 6: Build gate** — `cd src && CI=true npx next build --turbopack 2>&1 | tail -15` → clean.

- [ ] **Step 7: Commit** — `git add -A && git commit -m "refactor(assessments): client-safe answer-limits module (Wave C R1-M4)"`

**Closes (claudex):** R1-M4.

---

### Task 2: QuestionInput — invalid contract, text/number polish, char counter (#11, #12, #13/H1, R2-L1)

**Files:**
- Modify: `src/src/components/assessments/question-input.tsx`
- Test: `src/src/__tests__/components/assessments/question-input.test.tsx`

**Contract added:** `invalid?: boolean` on `QuestionInputProps`. When `invalid`, the control reflects an error state per type. Every type exposes a focusable `id={`q-${stableKey}`}`.

- [ ] **Step 1: Write failing tests** (append to the existing file; reuse its fixtures `sliderQuestion`, `zeroBasedSliderQuestion`, and add a `multiChoiceQuestion`).

```tsx
const multiChoiceQuestion: QuestionForInput = {
  stableKey: "S1_MC",
  type: "MULTI_CHOICE",
  label: "Pick some",
  isRequired: true,
  options: [
    { key: "a", label: "Alpha" },
    { key: "b", label: "Beta" },
  ],
};

describe("QuestionInput invalid + a11y contract", () => {
  it("slider: invalid sets aria-invalid on the range input", () => {
    render(<QuestionInput question={sliderQuestion} value={undefined} onChange={jest.fn()} invalid />);
    expect(screen.getByRole("slider")).toHaveAttribute("aria-invalid", "true");
  });
  it("text: invalid sets aria-invalid on the textarea + shows a placeholder", () => {
    render(<QuestionInput question={{ ...sliderQuestion, type: "TEXT", stableKey: "T1" }} value={undefined} onChange={jest.fn()} invalid />);
    const ta = screen.getByRole("textbox");
    expect(ta).toHaveAttribute("aria-invalid", "true");
    expect(ta).toHaveAttribute("placeholder");
  });
  it("multi-choice: invalid marks the group invalid AND the first checkbox carries the focus id", () => {
    render(<QuestionInput question={multiChoiceQuestion} value={[]} onChange={jest.fn()} invalid />);
    expect(screen.getByRole("group")).toHaveAttribute("aria-invalid", "true");
    const boxes = screen.getAllByRole("checkbox");
    expect(boxes[0]).toHaveAttribute("id", "q-S1_MC"); // pager focuses via getElementById
  });
  it("text: enforces the 10k maxLength", () => {
    render(<QuestionInput question={{ ...sliderQuestion, type: "TEXT", stableKey: "T2" }} value={""} onChange={jest.fn()} />);
    expect(screen.getByRole("textbox")).toHaveAttribute("maxLength", "10000");
  });
  it("text: shows the char counter only near the cap", () => {
    const near = "x".repeat(9_500);
    const { rerender } = render(<QuestionInput question={{ ...sliderQuestion, type: "TEXT", stableKey: "T3" }} value={"hi"} onChange={jest.fn()} />);
    expect(screen.queryByTestId("char-counter")).toBeNull();           // far from cap → hidden
    rerender(<QuestionInput question={{ ...sliderQuestion, type: "TEXT", stableKey: "T3" }} value={near} onChange={jest.fn()} />);
    expect(screen.getByTestId("char-counter")).toHaveTextContent("9500 / 10000");
  });
});
```

- [ ] **Step 2: Run, expect FAIL** — `cd src && npx jest question-input`.

- [ ] **Step 3: Implement.** In `question-input.tsx`:
  - Import the limit: `import { MAX_TEXT_ANSWER_LENGTH } from "@/lib/assessments/answer-limits";`
  - Add `invalid?: boolean` to `QuestionInputProps`; destructure it.
  - **SLIDER_LIKERT:** add `aria-invalid={invalid || undefined}` to the range input; add `className={`survey-slider${invalid ? " is-invalid" : ""}`}`; on the wrapper add `is-invalid` too: `className={`survey-slider-wrap${answered ? "" : " is-unanswered"}${invalid ? " is-invalid" : ""}`}`. Set the WebKit fill var only when answered: add `style={answered ? ({ ["--pct" as string]: `${((numVal - min) / (max - min)) * 100}%` }) : undefined}` to the input.
  - **TEXT:** add `placeholder="Type your answer here…"`, `maxLength={MAX_TEXT_ANSWER_LENGTH}`, `aria-invalid={invalid || undefined}`, `className={`survey-textarea${invalid ? " is-invalid" : ""}`}`. Below it render the counter only near the cap:
    ```tsx
    {typeof value === "string" && value.length >= MAX_TEXT_ANSWER_LENGTH - 1000 ? (
      <span className="survey-char-counter" data-testid="char-counter">
        {value.length} / {MAX_TEXT_ANSWER_LENGTH}
      </span>
    ) : null}
    ```
  - **NUMBER:** add `placeholder="Enter a number"`, `aria-invalid={invalid || undefined}`, `className={`survey-input-number${invalid ? " is-invalid" : ""}`}`.
  - **MULTI_CHOICE:** add `aria-invalid={invalid || undefined}` to the `role="group"` div and `className={`survey-checkbox-group${invalid ? " is-invalid" : ""}`}`; give the **first** option's `<input type="checkbox">` `id={`q-${q.stableKey}`}` (others keep no id) so the pager can focus it.

- [ ] **Step 4: Run, expect PASS** — `cd src && npx jest question-input` (all existing + new tests green; the existing minimum-commit regression test #10 must still pass).

- [ ] **Step 5: Build gate** — `cd src && CI=true npx next build --turbopack 2>&1 | tail -15`.

- [ ] **Step 6: Commit** — `git add -A && git commit -m "feat(assessments): QuestionInput invalid contract + text border/placeholder/counter (Wave C #11/#12/#13)"`

**Closes (claudex):** R1-H1 (per-type invalid/focus, multi-choice id), R1-M4 (import path), R2-L1 (focus by id, not selector).

---

### Task 3: SectionPager — validation engine, focus-first-invalid, min-answer gate, submit latch (#13, R1-M1, R2-M2/M3, R2-L1, R3-M2)

**Files:**
- Modify: `src/src/components/assessments/section-pager.tsx`
- Test: `src/src/__tests__/assessments/section-pager.test.tsx`

- [ ] **Step 1: Write failing tests** (append; reuse the existing `setup()` helper, extending fixtures with a second required slider and an optional question as needed).

```tsx
describe("SectionPager validation (#13)", () => {
  it("blocking advance flags the unanswered required question (aria-invalid) and focuses it", () => {
    const { getByRole } = setup(); // S1 has one required slider q1, unanswered
    fireEvent.click(getByRole("button", { name: "Begin section →" }));
    fireEvent.click(getByRole("button", { name: "Submit" })); // last section → submit gate
    const slider = getByRole("slider");
    expect(slider).toHaveAttribute("aria-invalid", "true");
    expect(slider).toHaveFocus();
  });
  it("answering a flagged question clears ONLY its invalid state", () => {
    const { getByRole } = setup();
    fireEvent.click(getByRole("button", { name: "Begin section →" }));
    fireEvent.click(getByRole("button", { name: "Submit" }));
    fireEvent.click(getByRole("slider")); // commit a value
    expect(getByRole("slider")).not.toHaveAttribute("aria-invalid");
  });
  it("does NOT prune invalid on a whitespace-only text change (R1-M1)", () => {
    // a required TEXT question, flagged, then changed to "   " stays invalid
    // (build a pages fixture with one required TEXT question)
  });
  it("requireAtLeastOneAnswer: an all-optional zero-answer submit shows a non-field alert + does not mark optional invalid (R2-M2)", () => {
    // pages with only OPTIONAL questions, requireAtLeastOneAnswer
    // assert: role="alert" present, no control has aria-invalid, onSubmit NOT called
  });
  it("renders exactly one role=progressbar and no segmented strip (R1-M3/G3)", () => {
    const { container } = setup();
    expect(screen.getAllByRole("progressbar")).toHaveLength(1);
    expect(container.querySelector(".su-shell-seg")).toBeNull();
  });
  it("double-clicking Submit issues onSubmit at most once (R2-M3 latch)", () => {
    // answer the required question, then fire two clicks synchronously
    // assert onSubmit called exactly once
  });
});
```

Flesh out the three commented tests with concrete fixtures (a required TEXT question; an all-optional pages set; a single-required-then-submit set) following the existing `setup()` pattern. Do not leave them empty.

- [ ] **Step 2: Run, expect FAIL** — `cd src && npx jest section-pager`.

- [ ] **Step 3: Implement.** In `section-pager.tsx`:
  - Add prop `requireAtLeastOneAnswer?: boolean`.
  - State: `const [invalidKeys, setInvalidKeys] = React.useState<Set<string>>(new Set());` and a `const submitLatch = React.useRef(false);`.
  - Reset `invalidKeys` to empty in `goToSection`.
  - **`handleNext`:**
    ```ts
    function handleNext() {
      const unanswered = page.questions.filter((q) => q.isRequired && !isAnswered(answers[q.stableKey]));
      if (unanswered.length > 0) {
        setInvalidKeys(new Set(unanswered.map((q) => q.stableKey)));
        setShowGateError(true);
        focusFirstInvalid(unanswered[0].stableKey);
        return;
      }
      if (isLast) { attemptSubmit(); return; }
      advance();
    }
    ```
  - **`attemptSubmit`** (new) — handles the min-answer gate + the synchronous latch:
    ```ts
    function attemptSubmit() {
      const totalAnswered = pages.flatMap((p) => p.questions).filter((q) => isAnswered(answers[q.stableKey])).length;
      if (requireAtLeastOneAnswer && totalAnswered === 0) {
        setShowGateError(true);            // non-field alert; do NOT mark optional questions invalid
        focusFirstAnswerable();
        return;
      }
      if (submitLatch.current || submitting) return;  // synchronous double-click guard (R2-M3)
      submitLatch.current = true;
      onSubmit();
    }
    ```
    Reset the latch when a submit finishes: `React.useEffect(() => { if (!submitting) submitLatch.current = false; }, [submitting]);`
  - **`handleAnswerChange`** — prune only when truly answered (R1-M1):
    ```ts
    function handleAnswerChange(stableKey: string, value: number | string | string[]) {
      onAnswerChange(stableKey, value);
      setInvalidKeys((prev) => {
        if (!prev.has(stableKey) || !isAnswered(value)) return prev; // whitespace/empty STAYS invalid
        const next = new Set(prev); next.delete(stableKey);
        if (next.size === 0) setShowGateError(false);
        return next;
      });
    }
    ```
  - **Focus helpers** (R2-L1 — `getElementById`, never `querySelector('#q-'+key)`):
    ```ts
    function focusFirstInvalid(stableKey: string) {
      requestAnimationFrame(() => document.getElementById(`q-${stableKey}`)?.focus());
    }
    function focusFirstAnswerable() {
      const first = page.questions[0];
      if (first) requestAnimationFrame(() => document.getElementById(`q-${first.stableKey}`)?.focus());
    }
    ```
  - **Render:** pass `invalid={invalidKeys.has(q.stableKey)}` into `<QuestionInput …>`. Keep the bottom `role="alert"` `survey-error`; when the alert is the min-answer one, use copy "Please answer at least one question before submitting." vs the required-miss copy "Please answer all required questions before continuing." Track which via a small `gateMessage` state set alongside `showGateError`.
  - **Remove the segmented strip dependency:** see Task 4 — the pager already renders `AssessmentShellHeader`; after Task 4 the strip is gone and the progressbar moves into the header, so **delete the standalone `survey-progress` block from the pager** (it now lives in the header). Confirm exactly one progressbar remains.
  - **#7:** delete the `su-intro-num` `<span>` (the `String(sectionIndex + 1).padStart(2, "0")`) from the intro slide JSX.

- [ ] **Step 4: Run, expect PASS** — `cd src && npx jest section-pager`.

- [ ] **Step 5: Build gate** — `cd src && CI=true npx next build --turbopack 2>&1 | tail -15`.

- [ ] **Step 6: Commit** — `git add -A && git commit -m "feat(assessments): SectionPager #13 validation + min-answer gate + submit latch (Wave C)"`

**Closes (claudex):** R1-M1, R1-M3 (one progressbar — completed with Task 4), R2-M2, R2-M3, R2-L1; design #13, #7.

---

### Task 4: AssessmentShellHeader — own the single progress bar, caption = campaign name, drop the strip (#6/#10, G1/G3, R1-M3)

**Files:**
- Modify: `src/src/components/assessments/AssessmentShellHeader.tsx`
- Test: `src/src/__tests__/components/assessments/assessment-shell-header.test.tsx` (create)

**Contract change:** the header now owns the authoritative `role="progressbar"`. Add props `answeredCount: number` and `totalQuestions: number`; render logo → caption (`assessmentName`) → "Section N of M" → the linear progressbar. **Remove** the `su-shell-seg` segmented strip and the `FOUR_DECISIONS` cycling.

- [ ] **Step 1: Write failing tests**

```tsx
import { render, screen } from "@testing-library/react";
import { AssessmentShellHeader } from "@/components/assessments/AssessmentShellHeader";

it("renders the caption + Section N of M", () => {
  render(<AssessmentShellHeader currentSection={2} totalSections={4} assessmentName="Q3 Rockefeller" answeredCount={3} totalQuestions={10} />);
  expect(screen.getByText("Q3 Rockefeller")).toBeInTheDocument();
  expect(screen.getByText(/Section 2 of 4/)).toBeInTheDocument();
});
it("owns exactly one progressbar reflecting answered/total", () => {
  render(<AssessmentShellHeader currentSection={1} totalSections={2} assessmentName="X" answeredCount={3} totalQuestions={10} />);
  const bar = screen.getByRole("progressbar");
  expect(bar).toHaveAttribute("aria-valuenow", "3");
  expect(bar).toHaveAttribute("aria-valuemax", "10");
});
it("no longer renders the segmented strip", () => {
  const { container } = render(<AssessmentShellHeader currentSection={1} totalSections={2} assessmentName="X" answeredCount={0} totalQuestions={4} />);
  expect(container.querySelector(".su-shell-seg")).toBeNull();
});
```

- [ ] **Step 2: Run, expect FAIL** — `cd src && npx jest assessment-shell-header`.

- [ ] **Step 3: Implement.** Add `answeredCount` + `totalQuestions` to `AssessmentShellHeaderProps`; delete the `su-shell-seg` block + `FOUR_DECISIONS`; render the progressbar inside the `<header className="su-shell-header">`:

```tsx
<div
  role="progressbar"
  aria-label="Progress"
  aria-valuemin={0}
  aria-valuemax={totalQuestions}
  aria-valuenow={answeredCount}
  className="survey-progress su-shell-progress"
>
  <div className="survey-progress-fill" style={{ width: totalQuestions ? `${(answeredCount / totalQuestions) * 100}%` : "0%" }} />
</div>
```

- [ ] **Step 4: Wire the pager** — in `section-pager.tsx`, pass `answeredCount={answeredCount}` and `totalQuestions={total}` to `<AssessmentShellHeader>`, and **delete the pager's own `survey-progress` `<div role="progressbar">`** (now duplicated). Re-run Task 3's "exactly one progressbar" test → green.

- [ ] **Step 5: Run, expect PASS** — `cd src && npx jest assessment-shell-header section-pager`.

- [ ] **Step 6: Build gate** — `cd src && CI=true npx next build --turbopack 2>&1 | tail -15`.

- [ ] **Step 7: Commit** — `git add -A && git commit -m "feat(assessments): unify progress bar into the purple shell header, drop segmented strip (Wave C #6/G3/R1-M3)"`

**Closes (claudex):** R1-M3, G3; design #6/#10 (header ownership).

---

### Task 5: Clients — remove white chrome, prune answers, submit-error recovery (#6/#10/G1, R2-M1, R3-M2, R2-M3)

**Files:**
- Create: `src/src/lib/assessments/prune-answers.ts` + test `src/src/__tests__/lib/assessments/prune-answers.test.ts`
- Modify: `src/src/components/assessments/org-survey-client.tsx`, `src/src/components/assessments/public-quiz-client.tsx`

- [ ] **Step 1: Write the prune-helper test**

```ts
// prune-answers.test.ts
import { pruneAnswersToQuestions } from "@/lib/assessments/prune-answers";
it("drops answers whose stableKey is not in the known set", () => {
  const known = new Set(["a", "b"]);
  expect(pruneAnswersToQuestions({ a: 1, b: "x", stale: 9 }, known)).toEqual({ a: 1, b: "x" });
});
it("returns the same object reference when nothing is pruned (no needless rerender)", () => {
  const known = new Set(["a"]);
  const input = { a: 1 };
  expect(pruneAnswersToQuestions(input, known)).toBe(input);
});
```

- [ ] **Step 2: Run, expect FAIL** → **Step 3: Implement**

```ts
// src/src/lib/assessments/prune-answers.ts
type AnswersMap = Record<string, number | string | string[]>;
/** Drop any answer whose stableKey isn't a currently-rendered question (R3-M2). */
export function pruneAnswersToQuestions(answers: AnswersMap, knownStableKeys: Set<string>): AnswersMap {
  const keys = Object.keys(answers);
  if (keys.every((k) => knownStableKeys.has(k))) return answers; // unchanged → same ref
  const next: AnswersMap = {};
  for (const k of keys) if (knownStableKeys.has(k)) next[k] = answers[k];
  return next;
}
```

- [ ] **Step 4: Run, expect PASS** — `cd src && npx jest prune-answers`.

- [ ] **Step 5: org-survey-client.tsx** — in the `ready` render:
  - **Delete** the `<header className="ty-header">…</header>` and the `<section className="ty-card">…survey-title…</section>` blocks (leave the loading/error/welcome/thank-you phases untouched).
  - Pass `requireAtLeastOneAnswer` to `<SectionPager …>` (the submit API rejects empty answers; invited can be all-optional too — R2-M2).
  - After draft hydrate and again right before `handleSubmit` POSTs, prune: build `const knownKeys = new Set(sortedQuestions.map(q => q.stableKey));` and `setAnswers(prev => pruneAnswersToQuestions(prev, knownKeys));` (and write the pruned map back to the draft). Pre-submit, POST the pruned map.
  - **Submit-error recovery (R2-M1):** read `app/api/assessment-campaigns/.../submit` (or the org-survey submit route) error shape. If the server returns per-field codes (`UNKNOWN_STABLE_KEY` / `INVALID_TYPE` / `ANSWER_TOO_LONG`) with a `stableKey`, map them into an `invalidKeys` set handed to `SectionPager` and **keep the user on the pager** (do not transition to a terminal error phase); otherwise show a non-field inline alert on the pager. (If the route does not currently return per-field detail, the fallback non-field alert is the behavior; note that in the PR.)
- [ ] **Step 6: public-quiz-client.tsx** — in the `form` step:
  - **Delete** the `<header className="ty-header">…</header>` block (there is no `ty-card` title in the form step).
  - Change the pager prop from `assessmentName={templateName}` to `assessmentName={campaignName}` (G1).
  - Pass `requireAtLeastOneAnswer` to `<SectionPager …>`.
  - Hydrate-prune + pre-submit-prune with `pruneAnswersToQuestions` exactly as invited; keep `idemRef` idempotency. The existing `if (submitting || !canSubmit) return;` plus the pager's synchronous latch (Task 3) cover double-click.

- [ ] **Step 7: Update client tests** — in whatever client RTL tests exist, update/replace any assertion that keys on `ty-header`/`ty-card` in the **ready/form** phase (they should now be absent there); assert the pager renders and `screen.queryByText("Scaling Up")` is no longer the white-bar brand in the form phase. Add a test that a stale answer key is pruned before submit (mock fetch, assert the POSTed body omits the stale key).

- [ ] **Step 8: Run + build** — `cd src && npx jest org-survey public-quiz prune-answers && CI=true npx next build --turbopack 2>&1 | tail -15`.

- [ ] **Step 9: Commit** — `git add -A && git commit -m "feat(assessments): unify participant header, prune stale answers, submit-error recovery (Wave C #6/G1/R2-M1/R3-M2)"`

**Closes (claudex):** R2-M1 (partial — recovery), R3-M2 (prune), G1; design #6/#10.

---

### Task 6: Scoped CSS — purple card, slider visual-unset + focus ring + bigger handle, red invalid, text inputs, remove "01" (#6/#7/#8/#9/#11/#12, G2/G6, R1-M2)

**Files:**
- Modify: `src/src/styles/wireframes-scoped.css` (the `.su-assessment-brand` block)

**Rule (R1-M2):** every new selector is prefixed `.su-assessment-brand …`. Do **not** edit base `.wf-scope` rules (only remove a `.wf-scope` rule if proven unused). After this task, run the scope-guard grep in Step 8.

- [ ] **Step 1: Slider visual-unset (#8) + focus ring (G2).** Under `.su-assessment-brand`:
  ```css
  /* Hidden thumb + empty rail until answered (#8) */
  .su-assessment-brand .survey-slider-wrap.is-unanswered .survey-slider::-webkit-slider-thumb { opacity: 0; box-shadow: none; }
  .su-assessment-brand .survey-slider-wrap.is-unanswered .survey-slider::-moz-range-thumb     { opacity: 0; box-shadow: none; border-color: transparent; }
  .su-assessment-brand .survey-slider-wrap.is-unanswered .survey-slider::-webkit-slider-runnable-track { background: #e4e4e4; } /* flat empty rail (no purple fill) */
  /* Answered fill follows --pct on WebKit */
  .su-assessment-brand .survey-slider-wrap:not(.is-unanswered) .survey-slider::-webkit-slider-runnable-track {
    background: linear-gradient(to right, #522583 0%, #522583 var(--pct, 0%), #e4e4e4 var(--pct, 0%), #e4e4e4 100%);
  }
  /* Track-level focus ring so a thumbless slider is still visibly focusable (G2) */
  .su-assessment-brand .survey-slider-wrap.is-unanswered .survey-slider:focus-visible { outline: 2px solid #522583; outline-offset: 4px; border-radius: 6px; }
  ```
- [ ] **Step 2: Bigger handle (#9).** Bump both thumbs 22px → 30px, recenter on the 6px track, scale the focus ring:
  ```css
  .su-assessment-brand .survey-slider::-webkit-slider-thumb { width: 30px; height: 30px; margin-top: -12px; }
  .su-assessment-brand .survey-slider::-moz-range-thumb     { width: 30px; height: 30px; }
  ```
- [ ] **Step 3: Focus-independent red invalid rail + card (#13/G6).**
  ```css
  .su-assessment-brand .survey-question.is-invalid,                       /* card border */
  .su-assessment-brand .survey-question:has(.is-invalid) { border-color: hsl(var(--destructive)); }
  .su-assessment-brand .survey-slider.is-invalid::-webkit-slider-runnable-track { background: hsl(var(--destructive) / 0.25); }
  .su-assessment-brand .survey-slider.is-invalid::-moz-range-track { background: hsl(var(--destructive) / 0.25); }
  .su-assessment-brand .survey-textarea.is-invalid,
  .su-assessment-brand .survey-input-number.is-invalid,
  .su-assessment-brand .survey-checkbox-group.is-invalid { border-color: hsl(var(--destructive)); }
  ```
  The red rail must NOT depend on `:focus`/`:focus-visible` (G6). Add a red invalid treatment to the `survey-question-label` of an invalid question if the card-level `:has()` is insufficient for the target browsers — verify in Task 7.
- [ ] **Step 4: Text inputs border + placeholder visibility + counter (#11/#12).**
  ```css
  .su-assessment-brand .survey-textarea,
  .su-assessment-brand .survey-input-number { border: 1px solid #cbb8e6; border-radius: 10px; padding: 0.65rem 0.8rem; }
  .su-assessment-brand .survey-textarea:focus-visible,
  .su-assessment-brand .survey-input-number:focus-visible { outline: 2px solid #522583; outline-offset: 1px; }
  .su-assessment-brand .survey-char-counter { display: block; margin-top: 0.3rem; font-size: 0.75rem; color: #6b6480; text-align: right; }
  ```
- [ ] **Step 5: Purple card header + linear bar inside it (#6).** Style `.su-shell-header` to read as the single card and `.su-shell-progress` (the relocated bar) to sit inside it with a translucent-white track on purple:
  ```css
  .su-assessment-brand .su-shell-progress { width: 100%; height: 6px; border-radius: 9999px; background: rgba(255,255,255,0.25); margin-top: 0.6rem; overflow: hidden; }
  .su-assessment-brand .su-shell-progress .survey-progress-fill { height: 100%; background: #fff; border-radius: 9999px; }
  ```
  Confirm the deleted pager `survey-progress` block leaves no orphan margin.
- [ ] **Step 6: Remove "01" styling (#7).** Delete the `.su-assessment-brand .su-intro-num { … }` rule(s) and reflow `.su-intro-kicker` so removing the number doesn't leave a gap (e.g. drop the grid/flex column that held it).
- [ ] **Step 7: Build gate** — `cd src && CI=true npx next build --turbopack 2>&1 | tail -15`.
- [ ] **Step 8: Scope guard** — `cd src/src && grep -nE "^\s*\.(survey-|su-shell|su-intro)" styles/wireframes-scoped.css | grep -v "su-assessment-brand\|wf-scope"` → **must return nothing** (every survey rule is scoped). Eyeball that no base `.wf-scope` survey rule was edited (only additions under `.su-assessment-brand`).
- [ ] **Step 9: Commit** — `git add -A && git commit -m "style(assessments): purple card, slider unset+focus+handle, red invalid, text inputs, drop 01 (Wave C, scoped)"`

**Closes (claudex):** R1-M2 (scope guard), G2, G6; design #6/#7/#8/#9/#11/#12.

---

### Task 7: Browser-level visual check + #14 verification (R1-M5, L1)

**Files:**
- Create: a Playwright spec under the repo's existing e2e dir (e.g. `src/tests-e2e/wave-c-slider.spec.ts` — match the existing `test:e2e` config).

- [ ] **Step 1: Playwright (Chromium) slider-state check (R1-M5).** Drive a survey page (use a seeded test campaign or the public quiz alias on a local/preview server) and assert visually/by-DOM across the four states: **unanswered** (thumb hidden — computed `opacity` of the thumb pseudo isn't directly queryable, so assert the wrapper has `is-unanswered` and take a screenshot), **focused-unanswered** (focus ring visible — screenshot), **invalid** (the rail/card carries `is-invalid` without focus — assert class + screenshot), **answered** (thumb visible, fill follows value). Save screenshots to the PR.
- [ ] **Step 2: Manual cross-browser pass.** On the Vercel preview, manually verify the four slider states + red validation + unified header in **Safari and Firefox** (pseudo-element + `:focus-visible` behavior is engine-specific). Record pass/fail in the PR description.
- [ ] **Step 3: #14 verification (L1).** On the preview, open a survey whose template has a **section with a non-empty seeded `description`** — use the **Five Dysfunctions** template (or Rockefeller). Confirm the section-intro slide renders that description text. Capture a screenshot for the PR. If the target section's `description` is empty in the live seed, **report that gap** (the actionable finding) rather than marking #14 done.
- [ ] **Step 4: Commit** — `git add -A && git commit -m "test(assessments): Playwright slider-state check + Wave C verification notes"`

**Closes (claudex):** R1-M5, design #14 (verify-only), L1.

---

### Task 8: Final review, runbook, SoT (R3-H1 rollout safety, R3-M1 telemetry note)

**Files:**
- Create/append: `docs/specs/v7.6/17c-ops-notes.md` (rollout + deferred follow-ups)
- Modify: `CLAUDE.md` (LAST_UPDATED anchor), `plans/CHANGELOG.md` (new entry) — **on merge only**

- [ ] **Step 1: Whole-branch review.** Dispatch the superpowers:code-reviewer against `git diff main...feat/wave-c-survey-ux`. Fix Critical/Important before merge.
- [ ] **Step 2: Rollout runbook (R3-H1).** Write `17c-ops-notes.md`: the rollback is **Vercel promote-previous-deployment** (no flag); the go/no-go is the post-merge both-flow smoke (invited test campaign + public quiz alias each submit successfully); preview-canary checklist; and the **deferred follow-ups** explicitly listed — hydrate-time deep value validation, autosave TTL/clear-on-terminal-state (pre-existing PR-#32 privacy), full client telemetry (R3-M1, premature at near-zero volume; server `/submit` logs + outbox are the interim signal).
- [ ] **Step 3: Full suite** — `cd src && CI=true npx next build --turbopack && npx jest 2>&1 | tail -20`. Record pass count + confirm no NEW failures vs `main` (known pre-existing failures are documented in CLAUDE.md/the punch-list anchor).
- [ ] **Step 4: GATE — final user merge-go.** The `/frontend-design` mockup was already approved before Task 1 (pre-build gate). Here, surface the preview-smoke results and get the user's go to merge (ship-don't-iterate: judged on "is it built + does it work on preview", not a second design review).
- [ ] **Step 5: On go — SoT flush + merge.** Update `CLAUDE.md` LAST_UPDATED anchor (`wave-c-survey-ux`), prepend the `plans/CHANGELOG.md` entry, open the PR, merge, deploy, post-merge smoke both flows, Notion task → Done.

**Closes (claudex):** R3-H1 (rollout safety), R3-M1 (telemetry deferral documented).

---

## Self-Review

**Spec coverage (design #6–#14 + claudex):**
- #6 unified purple card → Tasks 4 + 5 (+ CSS 6). #7 remove "01" → Task 3 (JSX) + Task 6 (CSS). #8 slider unset → Task 2 (`--pct`/state) + Task 6 (CSS). #9 handle → Task 6. #10 title only first → Tasks 4/5 (header owns caption; ty-card deleted). #11 text border/placeholder → Tasks 2 + 6. #12 char limit → Tasks 1 + 2. #13 red validation → Tasks 2 + 3 (+ CSS 6). #14 verify → Task 7. ✔ all covered.
- claudex: R1-H1→T2/T3; R1-M1→T3; R1-M2→T6; R1-M3→T4; R1-M4→T1; R1-M5→T7; R1-M6/R2-M2→T3/T5; R2-M1→T5; R2-M3→T3; R2-L1→T2/T3; R3-H1→T8; R3-M1→T8; R3-M2→T5; G1→T5; G2→T6; G3→T4; G6→T6; G7→honored by the #6 deviation (design-documented). Deferred (T8 notes): hydrate deep-validation, autosave TTL, full telemetry. ✔
**Placeholder scan:** the three commented SectionPager tests in Task 3 Step 1 are explicitly required to be fleshed out in the same step (fixtures described) — not left as TODOs. No "add error handling"-style vagueness.
**Type consistency:** `invalid?: boolean` (T2) is consumed by T3; `requireAtLeastOneAnswer?: boolean` (T3) is passed by T5; `answeredCount`/`totalQuestions` (T4) are passed by T3; `pruneAnswersToQuestions` (T5) signature matches its test; `id={`q-${stableKey}`}` focus contract is consistent across T2 (render) and T3 (`getElementById`). ✔
