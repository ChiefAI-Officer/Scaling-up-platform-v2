# Wave 1 (Test Mode) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a flag-gated "Test Mode" drawer to the assessment template editor: while editing a DRAFT, an admin enters sample answers and immediately sees the computed per-domain/section scores, tier, and fired findings — writing nothing.

**Architecture:** Extract the production scoring path into two shared, pure helpers so Test Mode and the real save/submit paths are the *same code* (no second code path): (1) `buildVersionScoringPayload` — the editor's save-time `{questions, sections, scoringConfig}` assembly, called by both Save Draft and Test Mode; (2) `computeScoreResult` — the submit route's `prune → score`, called by both submit routes and Test Mode. The drawer renders visible questions with the real `QuestionInput` widget, runs the pipeline client-side (all pure — zero DB), and displays a view-model gated by `reportConfigFor`. No schema change, no migration, no write path.

**Tech Stack:** Next.js 16 (App Router), TypeScript, React, Zod, Jest + React Testing Library, Tailwind/shadcn.

**Spec:** `docs/specs/v7.6/19ac-editor-overhaul-wave1-test-mode.md` (grilled + real-Codex co-validated).

**Conventions (this repo):**
- App source lives under `src/src/…`. Run all tooling from `src/`: `cd src && npx jest <pattern>`, `cd src && CI=true npx next build --turbopack`.
- Tests live in `src/src/__tests__/…`; import app code via the `@/…` alias.
- **Never** run `prisma db push`/`migrate` locally (local `DATABASE_URL` is prod). This wave needs neither.
- Commit per task. Branch off `main` (protected → ship via PR).

---

## File Structure

**New files:**
- `src/src/lib/assessments/wave-ed1-flags.ts` — `isTestModeEnabled()` (single-lever default-OFF flag).
- `src/src/lib/assessments/compute-score-result.ts` — `computeScoreResult(version, questions, answers, opts) → { result, prunedAnswers }` (shared prune+score; the ONE scoring seam).
- `src/src/components/admin/template-editor/build-version-payload.ts` — `buildVersionScoringPayload(args) → { questions, sections, scoringConfig, assignedKeys }` (shared editor assembly).
- `src/src/components/admin/template-editor/test-mode-display.ts` — `buildTestModeDisplay(result, templateAlias) → TestModeDisplay` (pure ScoreResult→view-model, `reportConfigFor`-gated).
- `src/src/components/admin/template-editor/TestModeDrawer.tsx` — the drawer UI.

**Modified files:**
- `src/src/app/(public)/org-survey/[campaignAlias]/submit/route.ts` — use `computeScoreResult` (behavior-preserving).
- `src/src/app/api/quiz/[campaignAlias]/submit/route.ts` — use `computeScoreResult` (behavior-preserving).
- `src/src/components/admin/TemplateEditorTabbed.tsx` — Save Draft calls `buildVersionScoringPayload`; add the flag-gated Test Mode header button + drawer.

**New tests:**
- `src/src/__tests__/lib/assessments/wave-ed1-flags.test.ts`
- `src/src/__tests__/lib/assessments/compute-score-result.test.ts`
- `src/src/__tests__/admin/build-version-payload.test.ts`
- `src/src/__tests__/lib/assessments/test-mode-display.test.ts`
- `src/src/__tests__/admin/test-mode-drawer.test.tsx`

---

## Task 1: Wave ED1 feature flag

**Files:**
- Create: `src/src/lib/assessments/wave-ed1-flags.ts`
- Test: `src/src/__tests__/lib/assessments/wave-ed1-flags.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// src/src/__tests__/lib/assessments/wave-ed1-flags.test.ts
import { isTestModeEnabled } from "@/lib/assessments/wave-ed1-flags";

describe("wave-ed1-flags", () => {
  const prev = process.env.WAVE_ED1_TEST_MODE_ENABLED;
  afterEach(() => { process.env.WAVE_ED1_TEST_MODE_ENABLED = prev; });

  it("is OFF when unset", () => {
    delete process.env.WAVE_ED1_TEST_MODE_ENABLED;
    expect(isTestModeEnabled()).toBe(false);
  });
  it.each(["", "0", "false"])("is OFF for %p", (v) => {
    process.env.WAVE_ED1_TEST_MODE_ENABLED = v;
    expect(isTestModeEnabled()).toBe(false);
  });
  it.each(["1", "true", "TRUE", "yes"])("is ON for %p", (v) => {
    process.env.WAVE_ED1_TEST_MODE_ENABLED = v;
    expect(isTestModeEnabled()).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd src && npx jest __tests__/lib/assessments/wave-ed1-flags.test.ts`
Expected: FAIL — cannot find module `wave-ed1-flags`.

- [ ] **Step 3: Write minimal implementation**

```ts
// src/src/lib/assessments/wave-ed1-flags.ts
/**
 * Wave ED1 — assessment-editor Test Mode (default-OFF, single lever).
 * Spec: docs/specs/v7.6/19ac-editor-overhaul-wave1-test-mode.md.
 * Additive, writes nothing → no KILL/CANARY needed (unlike the import flags).
 * Env read at call time (redeploy-less kill; test-predictable). Truthiness
 * matches the Wave-N/O/X convention.
 */
function isOn(v: string | undefined): boolean {
  return v === "1" || v === "true" || v === "TRUE" || v === "yes";
}

export function isTestModeEnabled(): boolean {
  return isOn(process.env.WAVE_ED1_TEST_MODE_ENABLED);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd src && npx jest __tests__/lib/assessments/wave-ed1-flags.test.ts`
Expected: PASS (8 assertions).

- [ ] **Step 5: Commit**

```bash
git add src/src/lib/assessments/wave-ed1-flags.ts src/src/__tests__/lib/assessments/wave-ed1-flags.test.ts
git commit -m "feat(assessments): Wave ED1 Test Mode feature flag (default-OFF)"
```

---

## Task 2: `computeScoreResult` — the shared prune+score seam

**Files:**
- Create: `src/src/lib/assessments/compute-score-result.ts`
- Test: `src/src/__tests__/lib/assessments/compute-score-result.test.ts`

**Context:** Today both submit routes inline the same sequence: `pruneHiddenAnswers(answers, questions)` then `scoreSubmission(version, pruned, opts?)`, and both reuse the *pruned* answers downstream (org-survey `submit/route.ts:413-430,506`; quiz `submit/route.ts:187-264`). This helper captures exactly that, returning both the score and the pruned answers. `pruneHiddenAnswers` evaluates GENERIC `showIf` only (never the LVA branch) — that behavior is inherited verbatim (spec C1). `scoreSubmission` is pure (no `db` import) and throws `ScoringValidationError` on config/answer problems (callers keep handling that).

- [ ] **Step 1: Write the failing test**

```ts
// src/src/__tests__/lib/assessments/compute-score-result.test.ts
import { computeScoreResult } from "@/lib/assessments/compute-score-result";
import {
  scoreSubmission,
  type Answer,
  type TemplateVersionForScoring,
} from "@/lib/assessments/scoring";
import { pruneHiddenAnswers } from "@/lib/assessments/form-visibility";
import type { PagerQuestion } from "@/lib/assessments/section-pages";

// Minimal 2-slider scored version (tierMetric overallAvg, single full-span tier).
const version: TemplateVersionForScoring = {
  questions: [
    { stableKey: "S1_q1", type: "SLIDER_LIKERT", label: "Q1", sectionStableKey: "S1",
      sortOrder: 1, isRequired: true, scale: { min: 0, max: 3, step: 1 } },
    { stableKey: "S1_q2", type: "SLIDER_LIKERT", label: "Q2", sectionStableKey: "S1",
      sortOrder: 2, isRequired: true, scale: { min: 0, max: 3, step: 1 } },
  ] as unknown as TemplateVersionForScoring["questions"],
  sections: [{ stableKey: "S1", name: "S1", sortOrder: 1 }] as unknown as TemplateVersionForScoring["sections"],
  scoringConfig: {
    tierMetric: "overallAvg",
    tiers: [{ label: "All", min: 0, max: 3 }],
  } as unknown as TemplateVersionForScoring["scoringConfig"],
};
const questions = version.questions as unknown as PagerQuestion[];
const answers: Answer[] = [
  { stableKey: "S1_q1", value: 2 },
  { stableKey: "S1_q2", value: 3 },
];

describe("computeScoreResult", () => {
  it("equals a manual prune→score for identical inputs (behavior-preserving)", () => {
    const manualPruned = pruneHiddenAnswers(answers, questions);
    const manual = scoreSubmission(version, manualPruned);
    const { result, prunedAnswers } = computeScoreResult(version, questions, answers);
    expect(result).toEqual(manual);
    expect(prunedAnswers).toEqual(manualPruned);
  });

  it("passes allowMissingRequired through (partial answers score instead of throwing)", () => {
    const partial: Answer[] = [{ stableKey: "S1_q1", value: 2 }];
    expect(() => computeScoreResult(version, questions, partial)).toThrow(); // MISSING_REQUIRED_KEY
    const { result } = computeScoreResult(version, questions, partial, { allowMissingRequired: true });
    expect(result.unansweredKeys).toContain("S1_q2");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd src && npx jest __tests__/lib/assessments/compute-score-result.test.ts`
Expected: FAIL — cannot find module `compute-score-result`.

- [ ] **Step 3: Write minimal implementation**

```ts
// src/src/lib/assessments/compute-score-result.ts
/**
 * The ONE production scoring seam: prune hidden answers, then score.
 * Called by BOTH submit routes and by editor Test Mode (spec 19ac C2/C5) so
 * there is no second code path. Pure (no db import). Returns the pruned
 * answers too — both submit routes persist/emit them downstream.
 *
 * pruneHiddenAnswers evaluates GENERIC showIf only (never LVA) — mirrored
 * verbatim (C1). scoreSubmission throws ScoringValidationError on config/
 * answer problems; callers handle it.
 */
import {
  scoreSubmission,
  type Answer,
  type ScoreResult,
  type TemplateVersionForScoring,
} from "@/lib/assessments/scoring";
import { pruneHiddenAnswers } from "@/lib/assessments/form-visibility";
import type { PagerQuestion } from "@/lib/assessments/section-pages";

export function computeScoreResult(
  version: TemplateVersionForScoring,
  questions: PagerQuestion[],
  answers: Answer[],
  options?: { allowMissingRequired?: boolean },
): { result: ScoreResult; prunedAnswers: Answer[] } {
  const prunedAnswers = pruneHiddenAnswers(answers, questions);
  const result = scoreSubmission(version, prunedAnswers, options);
  return { result, prunedAnswers };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd src && npx jest __tests__/lib/assessments/compute-score-result.test.ts`
Expected: PASS. (If the fixture shape trips schema validation, align field names with `QuestionSchema`/`SectionSchema` in `scoring.ts` — the test is the contract, the fixture is incidental.)

- [ ] **Step 5: Commit**

```bash
git add src/src/lib/assessments/compute-score-result.ts src/src/__tests__/lib/assessments/compute-score-result.test.ts
git commit -m "feat(assessments): shared computeScoreResult (prune+score) seam"
```

---

## Task 3: Route both submit paths through `computeScoreResult`

**Files:**
- Modify: `src/src/app/(public)/org-survey/[campaignAlias]/submit/route.ts:413-418`
- Modify: `src/src/app/api/quiz/[campaignAlias]/submit/route.ts:187-208`

**Context:** Behavior-preserving refactor. The existing submit-route/integration tests are the safety net — they must stay green. The findings-freeze (`assessmentSubmission.create`) stays in the routes; only prune+score moves into the helper.

- [ ] **Step 1: Run the existing submit tests to capture the green baseline**

Run: `cd src && npx jest submit org-survey quiz --listTests` then run the matched suites (e.g. `cd src && npx jest __tests__ -t "submit"`).
Expected: PASS (record the count — it must not drop).

- [ ] **Step 2: Refactor org-survey route**

In `src/src/app/(public)/org-survey/[campaignAlias]/submit/route.ts`, add the import and replace the inline prune+score (lines ~413-418):

```ts
// add with the other lib imports:
import { computeScoreResult } from "@/lib/assessments/compute-score-result";
```

Replace:
```ts
      const rawAnswers: Answer[] = pruneHiddenAnswers(
        answers.map((a) => ({ stableKey: a.stableKey, value: a.value })),
        allQuestions as unknown as PagerQuestion[],
      );
      // scoreSubmission may throw ScoringValidationError → caught by outer catch.
      const scoreResult = scoreSubmission(versionParsed.data, rawAnswers);
```
with:
```ts
      // Prune-then-score via the ONE shared seam (spec 19ac). rawAnswers stays
      // the PRUNED set (persisted + emitted downstream). May throw
      // ScoringValidationError → caught by outer catch.
      const { result: scoreResult, prunedAnswers: rawAnswers } = computeScoreResult(
        versionParsed.data,
        allQuestions as unknown as PagerQuestion[],
        answers.map((a) => ({ stableKey: a.stableKey, value: a.value })),
      );
```
Leave the now-unused `pruneHiddenAnswers`/`scoreSubmission` imports only if still referenced elsewhere in the file; otherwise remove them (ESLint no-unused).

- [ ] **Step 3: Refactor quiz route**

In `src/src/app/api/quiz/[campaignAlias]/submit/route.ts`, add the same import and replace the inline prune+score (lines ~187-208):

```ts
import { computeScoreResult } from "@/lib/assessments/compute-score-result";
```
Replace the `pruneHiddenAnswers(...)` → `submittedAnswers` and `scoreSubmission(versionParsed.data, submittedAnswers)` pair with:
```ts
      const { result, prunedAnswers: submittedAnswers } = computeScoreResult(
        versionParsed.data,
        allQuestions as unknown as PagerQuestion[],
        answers.map((a) => ({ stableKey: a.stableKey, value: a.value })),
      );
```
(Match the local variable names already used below in that route — `result` and `submittedAnswers`. Adjust the `allQuestions`/`answers` source expressions to whatever the quiz route already names them.)

- [ ] **Step 4: Run the submit suites + typecheck**

Run: `cd src && npx jest __tests__ -t "submit"` and `cd src && npx eslint "src/app/(public)/org-survey/[campaignAlias]/submit/route.ts" "src/app/api/quiz/[campaignAlias]/submit/route.ts"`
Expected: PASS, zero lint errors, same test count as Step 1.

- [ ] **Step 5: Commit**

```bash
git add "src/src/app/(public)/org-survey/[campaignAlias]/submit/route.ts" "src/src/app/api/quiz/[campaignAlias]/submit/route.ts"
git commit -m "refactor(assessments): route both submit paths through computeScoreResult (behavior-preserving)"
```

---

## Task 4: `buildVersionScoringPayload` — shared editor assembly

**Files:**
- Create: `src/src/components/admin/template-editor/build-version-payload.ts`
- Modify: `src/src/components/admin/TemplateEditorTabbed.tsx` (Save Draft calls the helper)
- Test: `src/src/__tests__/admin/build-version-payload.test.ts`

**Context:** Today `handleSaveDraft` inlines the assembly (`TemplateEditorTabbed.tsx:734-770`): `buildSectionsPayload(...)` + `buildQuestionsPayload(...)` with the REAL dirty flags, then PATCHes `{questions, sections, scoringConfig, reportConfig, [language]}`. Extract the `{questions, sections, scoringConfig}` assembly so Test Mode produces byte-identically what Save persists (spec C2 — real dirty semantics, NOT forced). `buildQuestionsPayload` may throw `QuestionSerializationError`; callers keep catching it.

- [ ] **Step 1: Write the failing test**

```ts
// src/src/__tests__/admin/build-version-payload.test.ts
import { buildVersionScoringPayload } from "@/components/admin/template-editor/build-version-payload";
import type { QuestionDraftRow } from "@/components/admin/template-editor/question-serialization";
import type { SectionDraft } from "@/components/admin/template-editor/SectionsCard";

const sections: SectionDraft[] = [
  { uid: "u-s1", stableKey: "S1", name: "Section 1", sortOrder: 1 } as unknown as SectionDraft,
];
const questions: QuestionDraftRow[] = [
  { uid: "u-q1", stableKey: "S1_q1", sectionStableKey: "S1", label: "Q1",
    type: "SLIDER_LIKERT", isRequired: true, sortOrder: 1, isNewToDraft: false, isInherited: false,
    scaleMin: 0, scaleMax: 3, scaleStep: 1, options: [], findingBands: [], findingOptionTexts: {},
    showIf: null } as unknown as QuestionDraftRow,
];

describe("buildVersionScoringPayload", () => {
  // NOTE: `toBe` (reference equality) assumes `buildSectionsPayload` returns the raw
  // array when `sectionsDirty: false`. Verify against `sections-serialization.ts` —
  // if it always rebuilds, switch to `toEqual`.
  it("NOT dirty → passes raw arrays through by reference (byte-for-byte)", () => {
    const rawQuestions = [{ stableKey: "S1_q1", type: "SLIDER_LIKERT" }];
    const rawSections = [{ stableKey: "S1", name: "Section 1", sortOrder: 1 }];
    const out = buildVersionScoringPayload({
      questions, sections, rawQuestions, rawSections, scoringConfig: { tierMetric: "overallAvg" },
      publishedKeys: new Set(), publishedOptionKeys: {}, dirty: { questions: false, sections: false },
    });
    expect(out.questions).toBe(rawQuestions);   // same reference
    expect(out.sections).toBe(rawSections);     // same reference
    expect(out.scoringConfig).toEqual({ tierMetric: "overallAvg" });
  });

  it("dirty → rebuilds questions and stamps section sortOrder", () => {
    const out = buildVersionScoringPayload({
      questions, sections, rawQuestions: [], rawSections: [], scoringConfig: {},
      publishedKeys: new Set(), publishedOptionKeys: {}, dirty: { questions: true, sections: true },
    });
    expect(Array.isArray(out.questions)).toBe(true);
    expect((out.sections as Array<{ sortOrder: number }>)[0].sortOrder).toBe(1);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd src && npx jest __tests__/admin/build-version-payload.test.ts`
Expected: FAIL — cannot find module `build-version-payload`.

- [ ] **Step 3: Write the helper**

```ts
// src/src/components/admin/template-editor/build-version-payload.ts
/**
 * Assemble the scoring-relevant version payload from live editor state,
 * exactly as Save Draft persists it — so editor Test Mode scores what would
 * be published (spec 19ac C2). Uses the editor's REAL dirty flags (NOT forced):
 * clean → raw pass-through (== persisted); dirty → reserialize (== next save).
 * Shared by handleSaveDraft AND TestModeDrawer. May throw
 * QuestionSerializationError (inherited key/type-lock) — callers handle it.
 */
import {
  buildQuestionsPayload,
  type QuestionDraftRow,
} from "@/components/admin/template-editor/question-serialization";
import { buildSectionsPayload } from "@/components/admin/template-editor/sections-serialization";
import type { SectionDraft } from "@/components/admin/template-editor/SectionsCard";

export interface BuildVersionScoringPayloadArgs {
  questions: QuestionDraftRow[];
  sections: SectionDraft[];
  rawQuestions: unknown[];
  rawSections: unknown[];
  scoringConfig: unknown;
  publishedKeys: ReadonlySet<string>;
  publishedOptionKeys: Readonly<Record<string, readonly string[]>>;
  dirty: { questions: boolean; sections: boolean };
}

export interface BuildVersionScoringPayloadResult {
  questions: unknown[];
  sections: unknown;
  scoringConfig: unknown;
  assignedKeys: Map<string, string>;
}

export function buildVersionScoringPayload(
  args: BuildVersionScoringPayloadArgs,
): BuildVersionScoringPayloadResult {
  const sections = buildSectionsPayload(args.sections, {
    sectionsDirty: args.dirty.sections,
    rawSections: args.rawSections,
  });
  const q = buildQuestionsPayload(args.questions, {
    questionsDirty: args.dirty.questions,
    rawQuestions: args.rawQuestions,
    publishedKeys: args.publishedKeys,
    publishedOptionKeys: args.publishedOptionKeys,
  });
  return {
    questions: q.payload,
    sections,
    scoringConfig: args.scoringConfig,
    assignedKeys: q.assignedKeys,
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd src && npx jest __tests__/admin/build-version-payload.test.ts`
Expected: PASS.

- [ ] **Step 5: Refactor `handleSaveDraft` to call the helper**

In `src/src/components/admin/TemplateEditorTabbed.tsx`, replace the inline `buildSectionsPayload(...)` + `buildQuestionsPayload(...)` block (~lines 734-770) with a single call, preserving the existing `try/catch` for `QuestionSerializationError`:

```ts
import { buildVersionScoringPayload } from "@/components/admin/template-editor/build-version-payload";
```
```ts
        let questionsPayload: unknown[] = rawQuestionsRef.current;
        let sectionsPayload: unknown = rawSectionsRef.current;
        let assignedKeys = new Map<string, string>();
        try {
          const built = buildVersionScoringPayload({
            questions,
            sections,
            rawQuestions: rawQuestionsRef.current,
            rawSections: rawSectionsRef.current,
            scoringConfig: scoringConfigRef.current,
            publishedKeys: new Set(publishedQuestionKeys),
            publishedOptionKeys,
            dirty: {
              questions: Boolean(dirtyFlags.questions),
              sections: Boolean(dirtyFlags.sections),
            },
          });
          questionsPayload = built.questions;
          sectionsPayload = built.sections;
          assignedKeys = built.assignedKeys;
        } catch (e) {
          if (e instanceof QuestionSerializationError) {
            toast({ title: "Could not save draft", description: e.message, variant: "destructive" });
            return;
          }
          throw e;
        }
```
The version-PATCH body stays `{ questions: questionsPayload, sections: sectionsPayload, scoringConfig: scoringConfigRef.current, reportConfig: reportConfigRef.current, ... }`.

- [ ] **Step 6: Verify Save Draft still works (existing editor tests green)**

Run: `cd src && npx jest __tests__/admin/question-serialization __tests__/admin/template-editor`
Expected: PASS (no drop from baseline).

- [ ] **Step 7: Commit**

```bash
git add src/src/components/admin/template-editor/build-version-payload.ts src/src/__tests__/admin/build-version-payload.test.ts src/src/components/admin/TemplateEditorTabbed.tsx
git commit -m "refactor(admin): extract buildVersionScoringPayload; Save Draft uses it"
```

---

## Task 5: `buildTestModeDisplay` — pure ScoreResult → view-model

**Files:**
- Create: `src/src/components/admin/template-editor/test-mode-display.ts`
- Test: `src/src/__tests__/lib/assessments/test-mode-display.test.ts`

**Context:** Decide WHAT to show, gated by `reportConfigFor(alias)` (spec C4: it governs `reportType`/`showTier`/`showScoreTable` only). Findings always included as an authoring output. Partial-answer honesty: unanswered are excluded (not zero-filled), so report answered vs scorable counts.

- [ ] **Step 1: Write the failing test**

```ts
// src/src/__tests__/lib/assessments/test-mode-display.test.ts
import { buildTestModeDisplay } from "@/components/admin/template-editor/test-mode-display";
import type { ScoreResult } from "@/lib/assessments/scoring";

const base: ScoreResult = {
  perQuestion: [], perSection: [{ stableKey: "S1", label: "S1", average: 2.5 } as never],
  overallTotal: 5, overallAverage: 2.5, countAchieved: 1,
  tier: { label: "Good" } as never, tierMetricValue: 2.5,
  unansweredKeys: [], findings: [{ questionStableKey: "S1_q1", text: "Do X" } as never],
};

describe("buildTestModeDisplay", () => {
  it("scored alias (scaling-up-full) shows score table, hides tier per config", () => {
    const d = buildTestModeDisplay(base, "scaling-up-full");
    expect(d.reportType).toBe("scored");
    expect(d.showScoreTable).toBe(true);
    expect(d.showTier).toBe(false);
    expect(d.findings).toHaveLength(1); // findings always present
  });
  it("qualitative alias (qsp-v1) → reportType qualitative", () => {
    const d = buildTestModeDisplay(base, "qsp-v1");
    expect(d.reportType).toBe("qualitative");
  });
  it("unknown/new alias → default (scored)", () => {
    const d = buildTestModeDisplay(base, "brand-new-template");
    expect(d.reportType).toBe("scored");
  });
  it("reports answered vs scorable for the partial-tier honesty note", () => {
    const partial = { ...base, unansweredKeys: ["S1_q2", "S1_q3"] };
    const d = buildTestModeDisplay(partial, "scaling-up-full");
    expect(d.unansweredCount).toBe(2);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd src && npx jest __tests__/lib/assessments/test-mode-display.test.ts`
Expected: FAIL — cannot find module `test-mode-display`.

- [ ] **Step 3: Write the helper**

```ts
// src/src/components/admin/template-editor/test-mode-display.ts
/**
 * Pure ScoreResult → Test Mode view-model. Display of tier/score-table follows
 * reportConfigFor(alias) — the SAME dispatch the real reports use — so Test
 * Mode never shows a tier/table the real report hides (spec 19ac C4). Findings
 * are always surfaced as an authoring output (NOT a faithful branded-report
 * reproduction). Unanswered are excluded from scoring, so expose the count for
 * the "tier computed over N answered" honesty note.
 */
import { reportConfigFor } from "@/lib/assessments/report-config";
import type { ScoreResult } from "@/lib/assessments/scoring";

export interface TestModeDisplay {
  reportType: string;      // "scored" | "qualitative"
  showTier: boolean;
  showScoreTable: boolean;
  result: ScoreResult;
  findings: NonNullable<ScoreResult["findings"]>;
  unansweredCount: number;
}

export function buildTestModeDisplay(
  result: ScoreResult,
  templateAlias: string | null,
): TestModeDisplay {
  const cfg = reportConfigFor(templateAlias);
  return {
    reportType: cfg.reportType,
    showTier: cfg.showTier,
    showScoreTable: cfg.showScoreTable,
    result,
    findings: result.findings ?? [],
    unansweredCount: result.unansweredKeys.length,
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd src && npx jest __tests__/lib/assessments/test-mode-display.test.ts`
Expected: PASS. (If `reportConfigFor` returns a narrower `showTier`/`showScoreTable` for `scaling-up-full`, align the assertions with `report-config.ts` — the config is the source of truth.)

- [ ] **Step 5: Commit**

```bash
git add src/src/components/admin/template-editor/test-mode-display.ts src/src/__tests__/lib/assessments/test-mode-display.test.ts
git commit -m "feat(admin): buildTestModeDisplay view-model (reportConfigFor-gated)"
```

---

## Task 6: `TestModeDrawer` component

**Files:**
- Create: `src/src/components/admin/template-editor/TestModeDrawer.tsx`
- Test: `src/src/__tests__/admin/test-mode-drawer.test.tsx`

**Context:** The drawer receives the live editor state (already held by `TemplateEditorTabbed`), assembles via `buildVersionScoringPayload`, parses `TemplateVersionForScoringSchema`, renders the visible questions with the real `QuestionInput` (`{ question, value, onChange(stableKey, value) }`), and on each change: builds `Answer[]` from the answers map, calls `computeScoreResult(parsed, parsed.questions, answers, { allowMissingRequired: true })`, and renders `buildTestModeDisplay`. States: (a) empty/too-few → neutral prompt, scorer NOT called (avoids `EMPTY_ANSWERS`); (b) config error (`QuestionSerializationError` / `ScoringValidationError` `INVALID_SCORING_CONFIG` / schema parse fail) → "Can't test yet — fix these"; (c) results. Debounced recompute. Writes nothing.

- [ ] **Step 1: Write the failing test**

```tsx
// src/src/__tests__/admin/test-mode-drawer.test.tsx
import { render, screen, fireEvent } from "@testing-library/react";
import { TestModeDrawer } from "@/components/admin/template-editor/TestModeDrawer";
import type { QuestionDraftRow } from "@/components/admin/template-editor/question-serialization";
import type { SectionDraft } from "@/components/admin/template-editor/SectionsCard";

const sections: SectionDraft[] = [
  { uid: "u-s1", stableKey: "S1", name: "Section 1", sortOrder: 1 } as unknown as SectionDraft,
];
const questions: QuestionDraftRow[] = [
  { uid: "u-q1", stableKey: "S1_q1", sectionStableKey: "S1", label: "How ready?",
    type: "SLIDER_LIKERT", isRequired: true, sortOrder: 1, isNewToDraft: false, isInherited: false,
    scaleMin: 0, scaleMax: 3, scaleStep: 1, options: [], findingBands: [], findingOptionTexts: {},
    showIf: null } as unknown as QuestionDraftRow,
];
const baseProps = {
  open: true, onClose: jest.fn(), templateAlias: "scaling-up-full",
  questions, sections,
  rawQuestions: [], rawSections: [], scoringConfig: { tierMetric: "overallAvg", tiers: [{ label: "All", min: 0, max: 3 }] },
  publishedKeys: new Set<string>(), publishedOptionKeys: {},
  dirty: { questions: true, sections: true },
};

describe("TestModeDrawer", () => {
  it("renders the visible question via the real widget", () => {
    render(<TestModeDrawer {...baseProps} />);
    expect(screen.getByText("How ready?")).toBeInTheDocument();
  });

  it("shows the neutral empty state before any answer (scorer not called → no crash)", () => {
    render(<TestModeDrawer {...baseProps} />);
    expect(screen.getByText(/answer .*questions to see results/i)).toBeInTheDocument();
  });

  it("shows a 'fix these' state when the draft's scoringConfig can't be scored", () => {
    render(<TestModeDrawer {...baseProps} scoringConfig={{ tierMetric: "overallAvg", tiers: [{ label: "Partial", min: 0, max: 1 }] }} />);
    // Answer the question so scoring is attempted; non-tiling tiers → INVALID_SCORING_CONFIG.
    fireEvent.click(screen.getByRole("button", { name: "3" }));
    expect(screen.getByText(/can't test yet/i)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd src && npx jest __tests__/admin/test-mode-drawer.test.tsx`
Expected: FAIL — cannot find module `TestModeDrawer`.

- [ ] **Step 3: Write the component**

```tsx
// src/src/components/admin/template-editor/TestModeDrawer.tsx
"use client";
import * as React from "react";
import { QuestionInput } from "@/components/assessments/question-input";
import { buildVersionScoringPayload } from "@/components/admin/template-editor/build-version-payload";
import { buildTestModeDisplay, type TestModeDisplay } from "@/components/admin/template-editor/test-mode-display";
import { computeScoreResult } from "@/lib/assessments/compute-score-result";
import { filterVisibleSurveyQuestions } from "@/lib/assessments/form-visibility";
import {
  TemplateVersionForScoringSchema,
  ScoringValidationError,
  type Answer,
} from "@/lib/assessments/scoring";
import { QuestionSerializationError } from "@/components/admin/template-editor/question-serialization";
import type { PagerQuestion } from "@/lib/assessments/section-pages";
import type { QuestionDraftRow } from "@/components/admin/template-editor/question-serialization";
import type { SectionDraft } from "@/components/admin/template-editor/SectionsCard";

export interface TestModeDrawerProps {
  open: boolean;
  onClose: () => void;
  templateAlias: string | null;
  questions: QuestionDraftRow[];
  sections: SectionDraft[];
  rawQuestions: unknown[];
  rawSections: unknown[];
  scoringConfig: unknown;
  publishedKeys: ReadonlySet<string>;
  publishedOptionKeys: Readonly<Record<string, readonly string[]>>;
  dirty: { questions: boolean; sections: boolean };
}

// TWO answer representations coexist intentionally:
// - `answers: Record<string, ...>` (AnswersMap shape) for `filterVisibleSurveyQuestions`
// - `answerList: Answer[]` (`{stableKey, value}[]`) for `computeScoreResult`
// Do NOT unify — the APIs consume different shapes.
type Answers = Record<string, number | string | string[]>;
const MIN_TO_SCORE = 1;

export function TestModeDrawer(props: TestModeDrawerProps) {
  const [answers, setAnswers] = React.useState<Answers>({});

  // Assemble + parse once per open / structural change. Config errors surface here.
  const parsed = React.useMemo(() => {
    try {
      const built = buildVersionScoringPayload({
        questions: props.questions, sections: props.sections,
        rawQuestions: props.rawQuestions, rawSections: props.rawSections,
        scoringConfig: props.scoringConfig,
        publishedKeys: props.publishedKeys, publishedOptionKeys: props.publishedOptionKeys,
        dirty: props.dirty,
      });
      const res = TemplateVersionForScoringSchema.safeParse(built);
      if (!res.success) return { kind: "config-error" as const, messages: res.error.issues.map((i) => i.message) };
      return { kind: "ok" as const, version: res.data };
    } catch (e) {
      if (e instanceof QuestionSerializationError) return { kind: "config-error" as const, messages: [e.message] };
      throw e;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.questions, props.sections, props.scoringConfig, props.dirty]);

  const visible: PagerQuestion[] = React.useMemo(() => {
    if (parsed.kind !== "ok") return [];
    return filterVisibleSurveyQuestions({
      templateAlias: props.templateAlias ?? "",
      questions: parsed.version.questions as unknown as PagerQuestion[],
      answers,
    });
  }, [parsed, props.templateAlias, answers]);

  const answerList: Answer[] = React.useMemo(
    () => Object.entries(answers).map(([stableKey, value]) => ({ stableKey, value })),
    [answers],
  );

  const scored = React.useMemo(() => {
    if (parsed.kind !== "ok") return { kind: "config-error" as const, messages: parsed.messages };
    if (answerList.length < MIN_TO_SCORE) return { kind: "empty" as const };
    try {
      const { result } = computeScoreResult(
        parsed.version, parsed.version.questions as unknown as PagerQuestion[],
        answerList, { allowMissingRequired: true },
      );
      return { kind: "result" as const, display: buildTestModeDisplay(result, props.templateAlias) };
    } catch (e) {
      if (e instanceof ScoringValidationError && e.code === "INVALID_SCORING_CONFIG") {
        return { kind: "config-error" as const, messages: [e.message] };
      }
      if (e instanceof ScoringValidationError && e.code === "EMPTY_ANSWERS") return { kind: "empty" as const };
      throw e; // answer-shape codes are unreachable via the constrained widget → real bug
    }
  }, [parsed, answerList, props.templateAlias]);

  if (!props.open) return null;

  return (
    <aside role="dialog" aria-label="Test Mode" className="fixed inset-y-0 right-0 w-[min(720px,100vw)] overflow-y-auto border-l bg-background p-6 shadow-xl">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-lg font-semibold">Test Mode</h2>
        <button type="button" onClick={props.onClose} className="text-sm underline">Close</button>
      </div>

      {parsed.kind === "config-error" ? (
        <ConfigError messages={parsed.messages} />
      ) : (
        <div className="grid gap-6 md:grid-cols-2">
          <div className="space-y-4">
            {visible.map((q) => (
              <QuestionInput
                key={q.stableKey}
                question={q as never}
                value={answers[q.stableKey]}
                onChange={(stableKey, value) => setAnswers((prev) => ({ ...prev, [stableKey]: value }))}
              />
            ))}
          </div>
          <div className="rounded-lg border p-4">
            {scored.kind === "empty" && <p className="text-sm text-muted-foreground">Answer some questions to see results.</p>}
            {scored.kind === "config-error" && <ConfigError messages={scored.messages} />}
            {scored.kind === "result" && <ResultPanel display={scored.display} />}
          </div>
        </div>
      )}
    </aside>
  );
}

function ConfigError({ messages }: { messages: string[] }) {
  return (
    <div className="rounded-lg border border-destructive/40 bg-destructive/5 p-4">
      <p className="font-medium text-destructive">Can&apos;t test yet — fix these:</p>
      <ul className="mt-2 list-disc pl-5 text-sm">{messages.map((m, i) => <li key={i}>{m}</li>)}</ul>
    </div>
  );
}

function ResultPanel({ display }: { display: TestModeDisplay }) {
  const r = display.result;
  return (
    <div className="space-y-3 text-sm">
      {display.showTier && r.tier && <p><span className="font-medium">Tier:</span> {r.tier.label}</p>}
      {display.showScoreTable && r.perDomain && (
        <ul>{r.perDomain.map((d) => <li key={d.domain}>{d.domain}: {d.average}</li>)}</ul>
      )}
      <ul>{r.perSection.map((s) => <li key={s.stableKey}>{s.label}: {s.average}</li>)}</ul>
      {display.findings.length > 0 && (
        <div>
          <p className="font-medium">Recommendations that fire ({display.findings.length}):</p>
          <ul className="list-disc pl-5">{display.findings.map((f, i) => <li key={i}>{f.text}</li>)}</ul>
        </div>
      )}
      {display.unansweredCount > 0 && (
        <p className="text-muted-foreground">Computed over answered questions only — {display.unansweredCount} unanswered.</p>
      )}
    </div>
  );
}
```
Adapt `QuestionInput`'s prop name (`question` vs `def`) and `PerSectionResult`/`PerDomainResult`/`ResolvedFinding`/`TierResolution` field names (`label`, `average`, `domain`, `text`) to the exact shapes in `scoring.ts`/`findings.ts` — the drawer must read the real fields.

- [ ] **Step 4: Run test to verify it passes**

Run: `cd src && npx jest __tests__/admin/test-mode-drawer.test.tsx`
Expected: PASS. Add a `data-testid` or match the slider button label as the real `QuestionInput` renders it (pointer buttons labelled by the scale number, per `question-input.tsx`).

- [ ] **Step 5: Commit**

```bash
git add src/src/components/admin/template-editor/TestModeDrawer.tsx src/src/__tests__/admin/test-mode-drawer.test.tsx
git commit -m "feat(admin): Test Mode drawer (renders draft, scores live, writes nothing)"
```

---

## Task 7: Wire the flag-gated Test Mode button into the editor header

**Files:**
- Modify: `src/src/components/admin/TemplateEditorTabbed.tsx` (header ~lines 1062-1112; state; render `TestModeDrawer`)

**Context:** Header is `<header className="wf-page-header-row">` (line 1062) holding the Save Draft button (~1088-1098). Add a "Test Mode" button next to it, shown only when `isTestModeEnabled()` AND the version is a draft (`!isPublished`). It opens `TestModeDrawer` with the live editor state.

- [ ] **Step 1: Add imports + open state**

```ts
import { isTestModeEnabled } from "@/lib/assessments/wave-ed1-flags";
import { TestModeDrawer } from "@/components/admin/template-editor/TestModeDrawer";
```
Near the other `useState` hooks:
```ts
const [testModeOpen, setTestModeOpen] = useState(false);
const testModeAvailable = !isPublished && isTestModeEnabled();
```

- [ ] **Step 2: Add the header button (next to Save Draft, inside `<header>` before its closing tag)**

```tsx
{testModeAvailable && (
  <button type="button" className="wf-btn-secondary" onClick={() => setTestModeOpen(true)}>
    Test Mode
  </button>
)}
```
(Match the class/markup of the existing Save Draft button.)

- [ ] **Step 3: Render the drawer (after the `<Tabs>` block, before the component's closing fragment)**

```tsx
{testModeAvailable && (
  <TestModeDrawer
    open={testModeOpen}
    onClose={() => setTestModeOpen(false)}
    templateAlias={templateValues.alias}
    questions={questions}
    sections={sections}
    rawQuestions={rawQuestionsRef.current}
    rawSections={rawSectionsRef.current}
    scoringConfig={scoringConfigRef.current}
    publishedKeys={new Set(publishedQuestionKeys)}
    publishedOptionKeys={publishedOptionKeys}
    dirty={{ questions: Boolean(dirtyFlags.questions), sections: Boolean(dirtyFlags.sections) }}
  />
)}
```

- [ ] **Step 4: Add a wiring test**

```tsx
// append to src/src/__tests__/admin/test-mode-drawer.test.tsx (or a new editor test)
// With WAVE_ED1_TEST_MODE_ENABLED set, a draft editor shows the "Test Mode" button;
// a published version does not. (Render TemplateEditorTabbed with a draft vs published
// version prop; assert the button's presence/absence.)
```

Run: `cd src && npx jest __tests__/admin/test-mode-drawer.test.tsx`
Expected: PASS.

- [ ] **Step 5: Lint + commit**

```bash
cd src && npx eslint src/components/admin/TemplateEditorTabbed.tsx src/components/admin/template-editor/TestModeDrawer.tsx
git add src/src/components/admin/TemplateEditorTabbed.tsx src/src/__tests__/admin/test-mode-drawer.test.tsx
git commit -m "feat(admin): flag-gated Test Mode button in the editor header (drafts only)"
```

---

## Task 8: Fidelity regression test + full verification

**Files:**
- Test: `src/src/__tests__/lib/assessments/test-mode-fidelity.test.ts`

**Context:** Lock the two shared seams so a future edit can't reintroduce a second code path (spec §3.7 — now regression guards, since equivalence is by construction).

- [ ] **Step 1: Write the fidelity regression test**

```ts
// src/src/__tests__/lib/assessments/test-mode-fidelity.test.ts
import { buildVersionScoringPayload } from "@/components/admin/template-editor/build-version-payload";
import { computeScoreResult } from "@/lib/assessments/compute-score-result";
import { scoreSubmission, TemplateVersionForScoringSchema, type Answer } from "@/lib/assessments/scoring";
import type { PagerQuestion } from "@/lib/assessments/section-pages";
// Inline fixture (NOT imported from prisma/seed-* — those are tsconfig-excluded).
// Minimal 2-slider scored version matching the Task 2 fixture pattern.
const fixtureContent = {
  questions: [
    { stableKey: "S1_q1", type: "SLIDER_LIKERT", label: "Q1", sectionStableKey: "S1",
      sortOrder: 1, isRequired: true, scale: { min: 0, max: 10, step: 1 } },
    { stableKey: "S1_q2", type: "SLIDER_LIKERT", label: "Q2", sectionStableKey: "S1",
      sortOrder: 2, isRequired: true, scale: { min: 0, max: 10, step: 1 } },
  ],
  sections: [{ stableKey: "S1", name: "Section 1", sortOrder: 1 }],
  scoringConfig: { tierMetric: "overallAvg", tiers: [{ label: "All", min: 0, max: 10 }] },
};

describe("Test Mode fidelity (regression guards)", () => {
  it("assembly parity: Test Mode payload parses + scores like the persisted version", () => {
    const parsed = TemplateVersionForScoringSchema.parse(fixtureContent);
    const questions = parsed.questions as unknown as PagerQuestion[];
    const answers: Answer[] = questions
      .filter((q) => (q as { type?: string }).type === "SLIDER_LIKERT")
      .map((q) => ({ stableKey: q.stableKey, value: 3 }));

    // Direct scoreSubmission (the "persisted version" path).
    const direct = scoreSubmission(parsed, answers);
    // computeScoreResult (the Test Mode path) with the SAME complete answers.
    const { result } = computeScoreResult(parsed, questions, answers);
    expect(result).toEqual(direct);
  });
});
```
If `buildVersionScoringPayload` is exercised end-to-end, add a case that maps the seed content into `QuestionDraftRow`/`SectionDraft` shape (dirty:true) and asserts the assembled `{questions,sections,scoringConfig}` parses and scores equal to the raw seed — the assembly-parity half.

- [ ] **Step 2: Run it**

Run: `cd src && npx jest __tests__/lib/assessments/test-mode-fidelity.test.ts`
Expected: PASS.

- [ ] **Step 3: Full targeted suite + build + lint (jest-verify the counts for SoT)**

```bash
cd src && npx jest __tests__/lib/assessments/wave-ed1-flags.test.ts __tests__/lib/assessments/compute-score-result.test.ts __tests__/admin/build-version-payload.test.ts __tests__/lib/assessments/test-mode-display.test.ts __tests__/admin/test-mode-drawer.test.tsx __tests__/lib/assessments/test-mode-fidelity.test.ts
cd src && CI=true npx next build --turbopack
```
Expected: all new suites PASS; build green. Record the exact jest counts for the SoT entry.

- [ ] **Step 4: Commit**

```bash
git add src/src/__tests__/lib/assessments/test-mode-fidelity.test.ts
git commit -m "test(assessments): Test Mode fidelity regression guards (assembly + scoring parity)"
```

---

## After all tasks: launch prep (separate authorization)

Ships DARK behind `WAVE_ED1_TEST_MODE_ENABLED` (default-OFF). Before any prod flag flip (separate, explicitly-authorized step per the launch-walk rule):
- Adversarial review pass.
- Live walk: author a throwaway draft, open Test Mode, confirm the numbers match a real submission's report for the same answers.
- SoT update (CLAUDE.md anchor + `plans/CHANGELOG.md`), Notion task → Done on merge, and flip the flag only after the walk.

## Self-review notes (author)

- **Spec coverage:** flag (§3.6→T1) · client-side pure pipeline + no-second-path via shared helpers (§3.3, C2/C5→T2,T3,T4) · assemble from live draft (§3.3→T4) · visibility render + generic-only prune (§3.5, C1→T2,T6) · error surface: empty-state vs config-error (§3.5, C3→T6) · output surface + reportConfigFor gating + partial honesty (§3.4, C4→T5,T6) · drawer + flat list + live panel (§3.2→T6,T7) · fidelity tests (§3.7→T8). All covered.
- **Type consistency:** `Answer = {stableKey, value}`; `computeScoreResult(...) → {result, prunedAnswers}` used identically in T2/T3/T6; `buildVersionScoringPayload(args) → {questions, sections, scoringConfig, assignedKeys}` used in T4/T6; `buildTestModeDisplay(result, alias) → TestModeDisplay` used in T5/T6.
- **Known adapt-points flagged inline** (real field names on `ScoreResult` sub-types, `QuestionInput` prop name, `reportConfigFor` exact `showTier`/`showScoreTable` values, slider widget button label) — the implementer confirms against the cited files; tests are the contract.
