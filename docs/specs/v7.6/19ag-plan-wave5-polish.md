# Wave ED5 — Editor-Overhaul Close-Out Polish — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement
> this plan task-by-task. Steps use checkbox (`- [ ]`) syntax. Run jest/eslint/build from `src/`
> (i.e. `/Users/diushianstand/Scaling-up-platform-v2/src`). Build gate = `CI=true npx next build --turbopack`.
> Branch: `feat/wave-ed5-editor-polish` (already checked out, off `main`; spec commits present).

**Goal:** Close the editor-overhaul arc by resolving every ED4 post-launch-audit item (buckets A/B/C)
in the flag-on three-pane workspace + two flagless surfaces, hardened per co-validate.

**Architecture:** Flag-on three-pane polish rides `WAVE_ED4_THREE_PANE_ENABLED` (kill = flag off +
redeploy → byte-identical legacy `QuestionsTab`); flagless bits (cascade section-delete wiring on the
Sections tab, tier-band bar + client tier validation on the Scoring tab) kill = revert. Question
mutations stay on shared model commands both views call (no bypass). Draft-corrupting paths (cascade,
move) are atomic + guarded at save/publish + round-trip tested.

**Tech Stack:** Next.js 16 (App Router), React, TypeScript, Prisma, Jest + Testing Library, @dnd-kit,
Tailwind.

**PR-unit map (co-validate C5 — independently revertible):**
- **PR-A** (flag-gated UI + inert shared model): T1–T14.
- **PR-B** (flagless — global cascade wiring on the Sections tab): T15.
- **PR-C** (flagless — tier-band bar + client tier validation, Scoring tab): T16–T18.
- **PR-D** (flag-gated, highest risk — cross-section multi-container drag): T19–T20.
- **Close-out** (round-trips, ADR, sweep, SoT): T21–T22.

Each PR-unit is a clean commit group. Build order A → C → B → D → close-out (B depends on the
`deleteSection` command from A; D depends on the outline from A; C is independent).

---

## File map

**New**
- `src/src/components/admin/template-editor/question-widget-mapper.ts` — shared `toQuestionForInput` +
  `shapeSignature` (B-4 DRY, C1).
- `src/src/components/admin/template-editor/LogicMapDrawer.tsx` — read-only show-if map (B-1b).
- `src/src/components/admin/template-editor/EditorDrawer.tsx` — shared drawer shell extracted from
  `TestModeDrawer` (M6). *(If `TestModeDrawer` already delegates to a reusable primitive, reuse that
  instead and skip this file — the implementer checks first.)*
- `src/src/components/admin/template-editor/TierBandBar.tsx` — visual tier-band editor (B-5).
- `src/src/components/admin/template-editor/outline-drop.ts` — pure `resolveOutlineDrop` (B-3, PR-D).
- `docs/adr/0023-cross-section-move-and-cascade-section-delete.md` — ADR (T22).
- Test files mirrored under `src/src/__tests__/components/admin/template-editor/` (and `.../hooks/`,
  `.../lib/` as appropriate).

**Modified**
- `hooks/useEditorSelection.ts` — add `collapse` slice (T3).
- `hooks/useTemplateEditorDraft.ts` — `deleteSection` (cascade), `moveQuestionToSection`; route
  `handleSectionsDelete` through cascade (T10, T11, T15).
- `question-commands.ts` — `buildSectionDeletePrompt`, `buildMoveQuestionPrompt`, `computeSurvivorFocus`
  (T5, T10, T11).
- `EditorOutline.tsx` — collapse-via-model, focus rule + scroll, labeled/total, badges, drawer trigger,
  section CRUD, move control, a11y, column width, multi-container dnd (T3, T5, T6, T7, T8, T9, T11, T13,
  T14, T20).
- `QuestionCanvas.tsx` — shared mapper, shape re-key, "Preview only" hint, scroll (T1, T2).
- `QuestionInspector.tsx` — `FindingsPreview` uses shared mapper + keyed by uid+shapeSig + relabel (T1, T2).
- `TemplateEditorController.tsx` — auto-focus-once effect (T4).
- `ThreePaneWorkspace.tsx` — pass new props (collapse, focus helpers, drawer/badge flags) (T2–T13).
- `SectionsCard.tsx` — route delete through cascade + update confirm wording (T15).
- `ScoringTiersTab.tsx` — render `TierBandBar`; wire domain-aware `validateTierTiling` (T16–T18).
- `src/src/lib/assessments/scoring.ts` — `export` `computeGlobalTierDomain` (T16).
- Save serializer (`build-version-payload.ts`) + publish gate (`publish-readiness.ts` /
  `getPublishValidationIssues`) — reject dangling `sectionStableKey` + dangling show-if (T12).

**Guards that MUST stay green** (run after every PR-unit):
`src/src/__tests__/components/admin/template-editor/editor-byte-equivalence.test.tsx` (15) and the ED4
parameterized parity suite. Full editor sweep before close-out.

---

## PR-A — three-pane polish + shared model

### Task 1: Shared widget mapper + shape signature (B-4 DRY, C1 groundwork)

**Files:**
- Create: `src/src/components/admin/template-editor/question-widget-mapper.ts`
- Create: `src/src/__tests__/components/admin/template-editor/question-widget-mapper.test.ts`
- Modify: `QuestionCanvas.tsx` (replace local `toForInput`), `QuestionInspector.tsx` (replace
  `FindingsPreview.forInput`).

- [ ] **Step 1: Write the failing test**

```ts
// question-widget-mapper.test.ts
import { toQuestionForInput, shapeSignature } from "@/components/admin/template-editor/question-widget-mapper";
import type { QuestionDraftRow } from "@/components/admin/template-editor/question-serialization";

const slider = (over: Partial<QuestionDraftRow> = {}): QuestionDraftRow =>
  ({ uid: "u1", stableKey: "S1_x", type: "SLIDER_LIKERT", label: "L", isRequired: true,
     helpText: "", sortOrder: 0, sectionStableKey: "S1", options: [], maxChoices: null,
     scaleMin: 1, scaleMax: 5, scaleStep: 1, anchorMin: "lo", anchorMax: "hi",
     recommendations: [], showIf: null, isInherited: false, ...over } as QuestionDraftRow);

test("canvas opts: real isRequired, '(no label yet)' fallback, '__canvas__' key fallback", () => {
  const r = toQuestionForInput(slider({ label: "", stableKey: "" }),
    { labelFallback: "(no label yet)", keyFallback: "__canvas__" });
  expect(r.stableKey).toBe("__canvas__");
  expect(r.label).toBe("(no label yet)");
  expect(r.isRequired).toBe(true);
  expect(r.scale).toEqual({ min: 1, max: 5, step: 1, anchorMin: "lo", anchorMax: "hi" });
});

test("preview opts: isRequired forced false, 'Sample answer' fallback, '__preview__' key", () => {
  const r = toQuestionForInput(slider({ label: "", stableKey: "" }),
    { labelFallback: "Sample answer", keyFallback: "__preview__", forceRequired: false });
  expect(r.stableKey).toBe("__preview__");
  expect(r.label).toBe("Sample answer");
  expect(r.isRequired).toBe(false);
});

test("MULTI_CHOICE maps options (blank keys dropped) + maxChoices", () => {
  const q = slider({ type: "MULTI_CHOICE", options: [
    { key: "a", label: "A" }, { key: "", label: "" }, { key: "b", label: "" }], maxChoices: 2 }) as QuestionDraftRow;
  const r = toQuestionForInput(q, { labelFallback: "x", keyFallback: "k" });
  expect(r.options).toEqual([{ key: "a", label: "A" }, { key: "b", label: "b" }]);
  expect(r.maxChoices).toBe(2);
});

test("shapeSignature changes on type/options-count/scale, stable otherwise", () => {
  const a = slider();
  expect(shapeSignature(a)).toBe(shapeSignature(slider({ label: "different label" })));
  expect(shapeSignature(a)).not.toBe(shapeSignature(slider({ scaleMax: 7 })));
  expect(shapeSignature(a)).not.toBe(shapeSignature(slider({ type: "TEXT" })));
  const mc1 = slider({ type: "MULTI_CHOICE", options: [{ key: "a", label: "A" }] });
  const mc2 = slider({ type: "MULTI_CHOICE", options: [{ key: "a", label: "A" }, { key: "b", label: "B" }] });
  expect(shapeSignature(mc1)).not.toBe(shapeSignature(mc2));
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx jest question-widget-mapper --no-coverage`
Expected: FAIL — module/exports not found.

- [ ] **Step 3: Implement**

```ts
// question-widget-mapper.ts
import type { QuestionForInput } from "@/components/assessments/question-input";
import type { QuestionDraftRow } from "./question-serialization";

export interface MapperOpts {
  /** Fallback when label is blank. */ labelFallback: string;
  /** Fallback when stableKey is blank. */ keyFallback: string;
  /** When defined, overrides isRequired (preview forces false). */ forceRequired?: boolean;
}

/** ONE draft→respondent-widget mapper shared by the canvas + the inspector's findings preview.
 *  Preserves the two intentional divergences via `opts` (co-validate C1 / B-4 DRY). */
export function toQuestionForInput(q: QuestionDraftRow, opts: MapperOpts): QuestionForInput {
  return {
    stableKey: q.stableKey || opts.keyFallback,
    type: q.type,
    label: q.label || opts.labelFallback,
    isRequired: opts.forceRequired ?? q.isRequired,
    ...(q.type === "SLIDER_LIKERT"
      ? { scale: { min: q.scaleMin, max: q.scaleMax, step: q.scaleStep,
                   anchorMin: q.anchorMin, anchorMax: q.anchorMax } }
      : {}),
    ...(q.type === "MULTI_CHOICE"
      ? { options: q.options.filter((o) => o.key !== "").map((o) => ({ key: o.key, label: o.label || o.key })),
          ...(q.maxChoices !== null ? { maxChoices: q.maxChoices } : {}) }
      : {}),
  };
}

/** Signature of the WIDGET SHAPE (not content). A change ⇒ the throwaway preview value is stale and
 *  must reset. Excludes label/help/required (those don't invalidate a typed value). */
export function shapeSignature(q: QuestionDraftRow): string {
  const parts: (string | number)[] = [q.type];
  if (q.type === "SLIDER_LIKERT") parts.push(q.scaleMin, q.scaleMax, q.scaleStep);
  if (q.type === "MULTI_CHOICE") parts.push(q.options.filter((o) => o.key !== "").length, q.maxChoices ?? -1);
  return parts.join("|");
}
```

- [ ] **Step 4: Refactor call sites (behavior-preserving)**

Replace `QuestionCanvas.tsx`'s local `toForInput` with `toQuestionForInput(question, { labelFallback:
"(untitled question)", keyFallback: "__canvas__" })` (keep the same fallback strings it uses today —
verify by reading the file). Replace `QuestionInspector.tsx`'s `FindingsPreview.forInput` with
`toQuestionForInput(question, { labelFallback: "Sample answer", keyFallback: "__preview__", forceRequired: false })`.

- [ ] **Step 5: Run mapper + the two touched suites**

Run: `npx jest question-widget-mapper QuestionCanvas QuestionInspector --no-coverage`
Expected: PASS (behavior unchanged).

- [ ] **Step 6: Commit**

```bash
git add src/src/components/admin/template-editor/question-widget-mapper.ts \
        src/src/__tests__/components/admin/template-editor/question-widget-mapper.test.ts \
        src/src/components/admin/template-editor/QuestionCanvas.tsx \
        src/src/components/admin/template-editor/QuestionInspector.tsx
git commit -m "feat(ed5): shared question-widget mapper + shapeSignature (B-4 DRY, co-validate C1)"
```

### Task 2: Key canvas + inspector preview by uid+shapeSignature; relabel; "Preview only" hint (B-4, A-3, C1)

**Files:** Modify `ThreePaneWorkspace.tsx`, `QuestionInspector.tsx`, `QuestionCanvas.tsx`; Test:
`ThreePaneWorkspace` / `QuestionInspector` suites.

- [ ] **Step 1: Write the failing test** (React Testing Library, flag-on workspace)

```tsx
// in the ThreePaneWorkspace test suite
test("changing a focused SLIDER to a value then editing its scale resets the inspector preview", async () => {
  // render workspace focused on a slider question; type a preview value in the inspector "test a value";
  // then change scaleMax via the inspector; assert the preview widget input is back to empty (remounted).
});

test("canvas shows a 'Preview only' hint and inspector preview is labeled 'test which finding fires'", () => {
  // render focused; expect getByText(/preview only/i) in canvas and /which finding fires/i in inspector.
});
```

*(Implementer writes concrete render/assert using the existing workspace test fixtures + userEvent.)*

- [ ] **Step 2: Run to verify it fails** — `npx jest ThreePaneWorkspace --no-coverage` → FAIL.

- [ ] **Step 3: Implement**
  - In `ThreePaneWorkspace.tsx`, the canvas is already keyed `key={focusedQuestion?.uid ?? "none"}`.
    Change to `key={focusedQuestion ? \`${focusedQuestion.uid}:${shapeSignature(focusedQuestion)}\` : "none"}`
    (import `shapeSignature`).
  - Wrap the inspector's `FindingsPreview` render with the same key. Since the inspector is reused
    verbatim, add the key at the `FindingsPreview` usage INSIDE `QuestionInspector` (its `question`
    prop's `uid`+`shapeSignature`), OR key `<FindingsPreview key={sig} .../>` where it is rendered
    (line ~451 `{open && <FindingsPreview question={question} />}`). Prefer keying at that call site so
    the rest of the inspector is untouched.
  - Relabel the preview header (`QuestionInspector.tsx` ~line 207) from "Test a value — preview which
    finding fires" to "Test which finding fires" (keep concise).
  - Add the canvas hint: in `QuestionCanvas.tsx` non-empty branch, add
    `<p className="text-[0.6875rem] italic text-muted-foreground">Preview only — answers here aren’t saved.</p>`.

- [ ] **Step 4: Run** — `npx jest ThreePaneWorkspace QuestionInspector QuestionCanvas --no-coverage` → PASS.

- [ ] **Step 5: Commit**

```bash
git add src/src/components/admin/template-editor/ThreePaneWorkspace.tsx \
        src/src/components/admin/template-editor/QuestionInspector.tsx \
        src/src/components/admin/template-editor/QuestionCanvas.tsx \
        src/src/__tests__/components/admin/template-editor/
git commit -m "feat(ed5): reset both preview widgets on uid+shapeSignature; relabel + preview-only hint (B-4/A-3/C1)"
```

### Task 3: Persist section-collapse via useEditorSelection (C)

**Files:** Modify `hooks/useEditorSelection.ts`, `EditorOutline.tsx`, `ThreePaneWorkspace.tsx`; Test:
`useEditorSelection` + a workspace re-entry test.

- [ ] **Step 1: Failing test**

```ts
// useEditorSelection.test.ts
import { renderHook, act } from "@testing-library/react";
import { useEditorSelection } from "@/components/admin/template-editor/hooks/useEditorSelection";

test("collapse slice toggles + persists in the hook", () => {
  const { result } = renderHook(() => useEditorSelection());
  expect(result.current.isSectionCollapsed("S1")).toBe(false);
  act(() => result.current.toggleSectionCollapsed("S1"));
  expect(result.current.isSectionCollapsed("S1")).toBe(true);
});
```

Plus a workspace test: collapse a section, switch tab away+back (unmount/remount ThreePaneWorkspace),
assert the section stays collapsed.

- [ ] **Step 2: Verify fails** — `npx jest useEditorSelection --no-coverage` → FAIL.

- [ ] **Step 3: Implement** — add to `EditorSelection`:

```ts
  collapsedSections: Record<string, boolean>;
  isSectionCollapsed: (key: string) => boolean;
  toggleSectionCollapsed: (key: string) => void;
```

Implement with `useState<Record<string, boolean>>({})`, `isSectionCollapsed = (k) => !!collapsed[k]`,
`toggleSectionCollapsed = useCallback((k) => setCollapsed((p) => ({ ...p, [k]: !p[k] })), [])`. Return
them. In `EditorOutline.tsx`, delete the local `collapsed` `useState` (line ~235) and consume the
model's `selection.isSectionCollapsed` / `toggleSectionCollapsed` (thread via `ThreePaneWorkspace`
which passes `selection`). Keep the existing "expand on add" behavior by calling
`toggleSectionCollapsed`/a new setter as needed (preserve current UX).

- [ ] **Step 4: Run** — `npx jest useEditorSelection ThreePaneWorkspace EditorOutline editor-byte-equivalence --no-coverage` → PASS (guard green: additive slice).

- [ ] **Step 5: Commit**

```bash
git add src/src/components/admin/template-editor/hooks/useEditorSelection.ts \
        src/src/components/admin/template-editor/EditorOutline.tsx \
        src/src/components/admin/template-editor/ThreePaneWorkspace.tsx \
        src/src/__tests__/
git commit -m "feat(ed5): persist section-collapse across Edit-tab unmount via useEditorSelection (C)"
```

### Task 4: Auto-focus first question once on mount (A-1)

**Files:** Modify `TemplateEditorController.tsx`; Test: controller suite.

- [ ] **Step 1: Failing test** — render controller with `threePaneEnabled`, a DRAFT with sections+questions,
`focusedQuestionUid` initially null; assert after mount the model focuses the first section's first
question (by canonical order). Second test: with `threePaneEnabled=false`, focus stays null (no
auto-focus). Third: with an already-set focus, mount does NOT change it.

- [ ] **Step 2: Verify fails** → FAIL.

- [ ] **Step 3: Implement** — in `TemplateEditorController.tsx`, after `const model = useTemplateEditorModel(...)`:

```tsx
useEffect(() => {
  if (!threePaneEnabled) return;
  if (model.selection.focusedQuestionUid !== null) return;
  const firstSection = [...model.sections].sort((a, b) => /* existing canonical section order */ 0)[0];
  const firstQ = model.questions
    .filter((q) => q.sectionStableKey === firstSection?.stableKey)
    .sort((a, b) => a.sortOrder - b.sortOrder)[0];
  if (firstSection && firstQ) model.selection.resetSelection(firstSection.stableKey, firstQ.uid);
  // eslint-disable-next-line react-hooks/exhaustive-deps
}, []); // once on mount
```

Use the canonical section ordering already used elsewhere (sections are stored in order; use their
array order). Guard exactly as shown (null focus + flag on).

- [ ] **Step 4: Run** — controller suite PASS; guard green.

- [ ] **Step 5: Commit** — `feat(ed5): auto-focus first question once on mount (A-1)`.

### Task 5: Survivor-focus helper + post-mutation focus/scroll rule (focus rule, C scroll)

**Files:** Modify `question-commands.ts` (+ test), `EditorOutline.tsx`, `ThreePaneWorkspace.tsx`.

- [ ] **Step 1: Failing test**

```ts
// question-commands.test.ts (append)
import { computeSurvivorFocus } from "@/components/admin/template-editor/question-commands";
const q = (uid: string, sec: string, ord: number) =>
  ({ uid, stableKey: uid, sectionStableKey: sec, sortOrder: ord } as any);

test("survivor after delete = next in section, else previous, else nearest section, else null", () => {
  const qs = [q("a","S1",0), q("b","S1",1), q("c","S1",2)];
  expect(computeSurvivorFocus(qs, ["S1"], "b")).toBe("c");       // next
  expect(computeSurvivorFocus(qs, ["S1"], "c")).toBe("b");       // last → previous
  expect(computeSurvivorFocus([q("a","S1",0)], ["S1","S2"], "a")).toBeNull(); // template empty after
  const two = [q("a","S1",0), q("x","S2",0)];
  expect(computeSurvivorFocus(two, ["S1","S2"], "a")).toBe("x"); // section empties → nearest section
});
```

- [ ] **Step 2: Verify fails** → FAIL.

- [ ] **Step 3: Implement `computeSurvivorFocus`** (pure; operates on the pre-delete list + the set of
removed uids for cascade):

```ts
/** Which question should receive focus after `removedUids` are deleted, given the pre-delete list and
 *  section render order. Prefers the next then previous sibling in the primary removed question's
 *  section; else the nearest surviving question in section order; else null. */
export function computeSurvivorFocus(
  questions: readonly Pick<QuestionDraftRow, "uid" | "sectionStableKey" | "sortOrder">[],
  sectionOrder: readonly string[],
  primaryRemovedUid: string,
  alsoRemoved: readonly string[] = [],
): string | null {
  const removed = new Set([primaryRemovedUid, ...alsoRemoved]);
  const target = questions.find((q) => q.uid === primaryRemovedUid);
  const survivors = questions.filter((q) => !removed.has(q.uid));
  if (survivors.length === 0) return null;
  const bySection = (sec: string) =>
    survivors.filter((q) => q.sectionStableKey === sec).sort((a, b) => a.sortOrder - b.sortOrder);
  if (target) {
    const same = bySection(target.sectionStableKey);
    const next = same.find((q) => q.sortOrder > target.sortOrder);
    if (next) return next.uid;
    const prev = [...same].reverse().find((q) => q.sortOrder < target.sortOrder);
    if (prev) return prev.uid;
  }
  // nearest surviving question by section order then sortOrder
  for (const sec of sectionOrder) { const list = bySection(sec); if (list.length) return list[0].uid; }
  return survivors[0].uid;
}
```

- [ ] **Step 4: Wire in `EditorOutline.tsx`** — after `onAddQuestion`/`onDuplicateQuestion` return the
new uid, call `setFocusedQuestionUid(newUid)` and move DOM focus to the new row + `scrollIntoView({
block: "nearest" })`. Before `onDeleteQuestion`, compute the survivor via `computeSurvivorFocus`, then
after delete `setFocusedQuestionUid(survivor)` + DOM focus/scroll to that row (or the `+ Add` button
when null). Use a `ref` map keyed by uid for the row focus buttons.

- [ ] **Step 5: Run** — `npx jest question-commands EditorOutline --no-coverage` → PASS.

- [ ] **Step 6: Commit** — `feat(ed5): survivor-focus helper + post-mutation focus/scroll rule`.

### Task 6: "labeled/total" counter per section (A-2)

**Files:** Modify `EditorOutline.tsx`; Test: EditorOutline suite.

- [ ] **Step 1: Failing test** — render outline with a section holding 3 questions, 1 with an empty
label; assert the section header shows `2/3 labeled` (not a raw count, not "answered").

- [ ] **Step 2: Verify fails** → FAIL.

- [ ] **Step 3: Implement** — in the section header render, compute
`labeled = qs.filter(q => q.label.trim() !== "").length` and render `{labeled}/{qs.length} labeled`
where the raw count is shown today.

- [ ] **Step 4: Run** → PASS.

- [ ] **Step 5: Commit** — `feat(ed5): per-section labeled/total counter (A-2)`.

### Task 7: Show-if row badges (B-1a)

**Files:** Modify `EditorOutline.tsx` (+ props for `conditionalEnabled`); Test: EditorOutline suite.

- [ ] **Step 1: Failing test** — with `conditionalEnabled`, a question carrying `showIf` shows a
"conditional" badge; a MULTI_CHOICE question that N others depend on shows a "gate (N)" badge; with
`conditionalEnabled=false`, neither renders.

- [ ] **Step 2: Verify fails** → FAIL.

- [ ] **Step 3: Implement** — in each question row, when `conditionalEnabled`: if `q.showIf` render a
small badge "conditional"; compute `deps = findShowIfDependents(questions, q).length` (import from
`question-commands`) and if `deps > 0` render "gate ({deps})". Thread `conditionalEnabled` through
`ThreePaneWorkspace` (already a prop) to `EditorOutline`.

- [ ] **Step 4: Run** → PASS.

- [ ] **Step 5: Commit** — `feat(ed5): show-if row badges (conditional / gate-with-count) (B-1a)`.

### Task 8: Shared drawer shell + LogicMapDrawer + outline-toolbar trigger (B-1b, M6)

**Files:** Create `EditorDrawer.tsx` (or reuse existing primitive), `LogicMapDrawer.tsx`; Modify
`EditorOutline.tsx`, `TestModeDrawer.tsx` (only if extracting the shell); Tests for both.

- [ ] **Step 1: Failing test** — `LogicMapDrawer` given sections+questions renders one line per show-if
relationship in the form `'<dep label>' shows only when '<gate label>' = '<option label>'`, resolving
`showIf.optionKey` → option label and gate label; empty state "No conditional logic" when none. Outline
test: the "Logic map" trigger appears only when `conditionalEnabled`, and clicking it opens the drawer.

- [ ] **Step 2: Verify fails** → FAIL.

- [ ] **Step 3: Implement**
  - Check whether `TestModeDrawer` uses a reusable drawer/`Sheet` primitive. If yes, `LogicMapDrawer`
    uses the same primitive. If `TestModeDrawer` is bespoke, extract its slide-over shell into
    `EditorDrawer.tsx` (props: `open`, `onClose`, `title`, `children`) and refactor `TestModeDrawer` to
    use it (behavior-preserving; run its test).
  - `LogicMapDrawer` builds lines: for each question with `showIf`, find the gate question by
    `showIf.questionKey`, the option by `showIf.optionKey` in the gate's options, and render the
    plain-language line. Read-only.
  - `EditorOutline` toolbar: add a "Logic map" button (rendered only when `conditionalEnabled`) that
    opens `LogicMapDrawer` with the current `sections`/`questions`.

- [ ] **Step 4: Run** — `npx jest LogicMapDrawer TestModeDrawer EditorOutline --no-coverage` → PASS.

- [ ] **Step 5: Commit** — `feat(ed5): read-only show-if logic-map drawer + shared drawer shell (B-1b/M6)`.

### Task 9: Section CRUD in the outline (add / rename / reorder) (B-2)

**Files:** Modify `EditorOutline.tsx`, `ThreePaneWorkspace.tsx` (pass section commands); Test: EditorOutline.

*(Delete is Task 10, which introduces the cascade command.)*

- [ ] **Step 1: Failing test** — outline renders a "+ Add Section" control (calls `onAddSection`);
each section header has an inline-editable name (calls `onRenameSection(uid, name)`); section headers
are keyboard/drag reorderable (calls `onReorderSections(newOrderUids)`); all disabled when `isReadOnly`.

- [ ] **Step 2: Verify fails** → FAIL.

- [ ] **Step 3: Implement** — thread the existing model section commands from `ThreePaneWorkspace`
(`model.handleSectionsAdd/Rename/MoveUp/MoveDown/Reorder`) into `EditorOutline` as
`onAddSection/onRenameSection/onMoveSectionUp/onMoveSectionDown/onReorderSections`. Render `+ Add
Section` at the tree top; make section headers inline-editable (`<input>` bound to
`onRenameSection`); add section drag/keyboard reorder using the SectionsCard idiom (a `DndContext` over
section headers) OR arrow buttons (keep it consistent with question rows). Gate on `isReadOnly`.

- [ ] **Step 4: Run** — `npx jest EditorOutline ThreePaneWorkspace --no-coverage` → PASS.

- [ ] **Step 5: Commit** — `feat(ed5): section add/rename/reorder from the outline (B-2)`.

### Task 10: Cascade `deleteSection` command + prompt + outline delete (B-2b command)

**Files:** Modify `hooks/useTemplateEditorDraft.ts`, `question-commands.ts` (+ tests), `EditorOutline.tsx`,
`ThreePaneWorkspace.tsx`.

- [ ] **Step 1: Failing tests**

```ts
// question-commands.test.ts (append) — prompt builder
import { buildSectionDeletePrompt } from "@/components/admin/template-editor/question-commands";
test("cascade prompt: empty section = simple; with questions = count; inherited enumerated; deps named", () => {
  expect(buildSectionDeletePrompt({ name: "Intro", stableKey: "S1" },
    { questionCount: 0, inheritedKeys: [], freedDependentKeys: [], isUnlocked: true }))
    .toContain("Delete section S1");
  const p = buildSectionDeletePrompt({ name: "Recruit", stableKey: "S3" },
    { questionCount: 3, inheritedKeys: ["S3_a", "S3_b"], freedDependentKeys: ["S5_why"], isUnlocked: true });
  expect(p).toContain("3 question");
  expect(p).toContain("S3_a, S3_b");           // inherited enumerated
  expect(p).toContain("trend");                // consequence language
  expect(p).toContain("S5_why");               // freed dependent named
});
```

```ts
// useTemplateEditorDraft.test — command
test("deleteSection removes section + its questions atomically and returns affected external deps", () => {
  // seed sections [S1,S2], questions S1_a (gate MC), S2_x (showIf → S1_a); delete S1
  // → sections=[S2], questions has S2_x with showIf cleared; return { removedSectionKey:'S1',
  //   removedQuestionUids:['S1_a'], affectedDependentUids:[<S2_x uid>] }
});
```

- [ ] **Step 2: Verify fails** → FAIL.

- [ ] **Step 3: Implement `buildSectionDeletePrompt`** in `question-commands.ts`:

```ts
export function buildSectionDeletePrompt(
  section: { name: string; stableKey: string },
  opts: { questionCount: number; inheritedKeys: readonly string[];
          freedDependentKeys: readonly string[]; isUnlocked: boolean },
): string {
  if (opts.questionCount === 0) return `Delete section ${section.stableKey}?`;
  const lines = [`Delete section ${section.stableKey} and its ${opts.questionCount} question${opts.questionCount === 1 ? "" : "s"}?`];
  if (opts.isUnlocked && opts.inheritedKeys.length) {
    lines.push("",
      `${opts.inheritedKeys.length} of these exist in a published version (${opts.inheritedKeys.join(", ")}). Deleting them means:`,
      "• cross-version trend history for those keys ends with the last published version;",
      "• a locked Esperto import crosswalk that maps them will refuse imports;",
      "• any peer benchmarks on them are pruned.");
  }
  if (opts.freedDependentKeys.length) {
    lines.push("",
      `${opts.freedDependentKeys.length} question${opts.freedDependentKeys.length === 1 ? "" : "s"} shown conditionally on deleted questions will become always-visible: ${opts.freedDependentKeys.join(", ")}.`);
  }
  lines.push("", "Continue?");
  return lines.join("\n");
}
```

Implement `deleteSection` in `useTemplateEditorDraft.ts` (atomic — one `setSections` + one
`setQuestions`, or a combined update): compute `removedQuestionUids` (questions in the section);
compute external dependents = questions OUTSIDE the section whose `showIf.questionKey` is a removed
question's `stableKey` (reuse `findShowIfDependents` per removed gate, filter to non-removed); remove
the section, remove its questions, clear `showIf` on external dependents; set BOTH sections + questions
dirty; return `{ removedSectionKey, removedQuestionUids, affectedDependentUids }`. Expose on the model
(add to the return + alias like `deleteQuestion`).

- [ ] **Step 4: Wire outline delete** — `EditorOutline` section header delete: assemble prompt inputs
(questionCount, inheritedKeys = questions in section with `isInherited`, freedDependentKeys via the
external-dependent computation), `window.confirm(buildSectionDeletePrompt(...))`, on OK call
`onDeleteSection(uid)` then focus survivor via `computeSurvivorFocus(questions, sectionOrder,
firstRemovedUid, otherRemovedUids)`.

- [ ] **Step 5: Run** — `npx jest question-commands useTemplateEditorDraft EditorOutline --no-coverage` → PASS.

- [ ] **Step 6: Commit** — `feat(ed5): cascade deleteSection command + prompt + outline delete (B-2b)`.

### Task 11: `moveQuestionToSection` command + inherited warn + explicit control (B-3 command + control)

**Files:** Modify `hooks/useTemplateEditorDraft.ts`, `question-commands.ts` (+ tests), `EditorOutline.tsx`,
`ThreePaneWorkspace.tsx`.

- [ ] **Step 1: Failing tests**

```ts
// question-commands.test.ts — move prompt (inherited only)
import { buildMoveQuestionPrompt } from "@/components/admin/template-editor/question-commands";
test("move prompt: inherited names consequence; new-to-draft returns empty (no confirm)", () => {
  expect(buildMoveQuestionPrompt({ stableKey: "S3_a", isInherited: true } as any, "Onboarding"))
    .toContain("S3_a");
  expect(buildMoveQuestionPrompt({ stableKey: "S3_b", isInherited: false } as any, "Onboarding")).toBe("");
});
```

```ts
// useTemplateEditorDraft.test — move command
test("moveQuestionToSection re-homes a question + resequences sortOrder in both sections", () => {
  // seed S1:[a,b], S2:[x]; move b → S2 end → S1:[a], S2:[x,b] with contiguous sortOrders
});
```

- [ ] **Step 2: Verify fails** → FAIL.

- [ ] **Step 3: Implement `buildMoveQuestionPrompt`**:

```ts
export function buildMoveQuestionPrompt(
  q: Pick<QuestionDraftRow, "stableKey" | "isInherited">, targetSectionName: string,
): string {
  if (!q.isInherited) return "";
  return [
    `Move inherited question ${q.stableKey} to "${targetSectionName}"?`, "",
    "Its key keeps the original section prefix (keys are immutable). From the NEXT published version,",
    "reports group it under the new section and per-domain scoring counts it toward the new section's",
    "domain. Past published versions are unaffected.", "", "Continue?",
  ].join("\n");
}
```

Implement `moveQuestionToSection(uid, targetSectionKey, targetIndex?)` in `useTemplateEditorDraft.ts`:
set the question's `sectionStableKey = targetSectionKey`; place at `targetIndex` (default: end of
target section); resequence `sortOrder` contiguously within BOTH the source and target sections; set
questions dirty (sections not changed → only questions dirty). Expose on the model.

- [ ] **Step 4: Explicit control** — `EditorOutline` question row gets a "Move to section…" control (a
`<select>` or menu listing OTHER sections). On choose: if the question `isInherited`, `window.confirm`
with `buildMoveQuestionPrompt` (skip confirm when empty string); on OK call
`onMoveQuestion(uid, targetSectionKey)`; keep focus on the moved question (its uid persists) + scroll
into view. Disabled when `isReadOnly`.

- [ ] **Step 5: Run** — `npx jest question-commands useTemplateEditorDraft EditorOutline --no-coverage` → PASS.

- [ ] **Step 6: Commit** — `feat(ed5): moveQuestionToSection command + inherited warn + explicit control (B-3)`.

### Task 12: Defense-in-depth — reject dangling section/show-if refs at save + publish (co-validate C3)

**Files:** Modify `build-version-payload.ts` (save serializer) + `publish-readiness.ts` /
`getPublishValidationIssues`; Tests for both.

- [ ] **Step 1: Failing tests** — serializer/validator given a question whose `sectionStableKey` names
no section → an issue/refusal; given a `showIf.questionKey` that no question owns → an issue/refusal.
Valid drafts unaffected.

- [ ] **Step 2: Verify fails** → FAIL.

- [ ] **Step 3: Implement** — in `getPublishValidationIssues` add two Prevent-class checks:
`orphaned section reference` (question.sectionStableKey ∉ section keys) and `dangling show-if`
(showIf.questionKey ∉ question stableKeys). Add the same guard to the save serializer path
(fail-closed: refuse to serialize a corrupt draft, matching the existing MULTI_CHOICE_NO_OPTIONS
serializer-guard pattern). Read the current files to match the issue-shape + surface conventions.

- [ ] **Step 4: Run** — `npx jest publish-readiness build-version-payload getPublishValidationIssues --no-coverage` → PASS.

- [ ] **Step 5: Commit** — `feat(ed5): reject dangling sectionStableKey + show-if refs at save/publish (C3)`.

### Task 13: A11y cluster (C)

**Files:** Modify `EditorOutline.tsx`, `ThreePaneWorkspace.tsx`, `QuestionCanvas.tsx`; Tests.

- [ ] **Step 1: Failing tests** — the three panes expose landmark labels (`aria-label` "Outline",
"Question preview", "Inspector"); the outline row `aria-label` uses the visible label + type (not the
opaque "Edit {key}") and does not duplicate `aria-current`; a keyboard reorder emits a live-region
message naming the question KEY/LABEL, not the uid; pointer-only slider tap ticks are `aria-hidden`.

- [ ] **Step 2: Verify fails** → FAIL.

- [ ] **Step 3: Implement** — add `aria-label`/`role="region"` (or `<nav aria-label>`) to the outline
aside, the canvas section, and the inspector aside in `ThreePaneWorkspace`/`QuestionCanvas`. Fix the
row `aria-label` to `\`${q.label || "(untitled)"} — ${q.type}\``; keep `aria-current` only on the
focused row. Add an `aria-live="polite"` region in `EditorOutline` that announces
`\`Moved ${q.label || q.stableKey} to position N\`` on reorder. Add `aria-hidden` to the pointer-only
slider tick buttons (verify they already carry `tabIndex=-1`).

- [ ] **Step 4: Run** — `npx jest EditorOutline ThreePaneWorkspace QuestionCanvas --no-coverage` → PASS.

- [ ] **Step 5: Commit** — `feat(ed5): a11y cluster — landmarks, row labels, reorder announcements, SR slider ticks (C)`.

### Task 14: Widen outline column (C layout)

**Files:** Modify `ThreePaneWorkspace.tsx`; verify the responsive-grid parity assertion.

- [ ] **Step 1: Failing test** — find the test that pins the grid template (search parity/EditorOutline/
ThreePaneWorkspace tests for `20%`); update it to expect the new `minmax(...)` template. If none pins
it, add an assertion that the grid stacks (`grid-cols-1`) below `lg` and uses the widened template at
`lg`.

- [ ] **Step 2: Verify fails** → FAIL (or add-then-fail).

- [ ] **Step 3: Implement** — change
`className="grid grid-cols-1 lg:grid-cols-[20%_50%_30%] gap-4"` to
`lg:grid-cols-[minmax(14rem,22%)_1fr_30%]` (keeps center flexible + right at 30%). Keep the `< lg` stack.

- [ ] **Step 4: Run** — the touched test + `editor-byte-equivalence` (flag-off unaffected) → PASS.

- [ ] **Step 5: Commit** — `feat(ed5): widen outline column via minmax (C layout)`.

**→ PR-A checkpoint:** run the full editor sweep + `CI=true npx next build --turbopack` + eslint on all
changed files. Open PR-A.

---

## PR-B — global cascade wiring (flagless, Sections tab)

### Task 15: Route the Sections tab delete through `deleteSection`

**Files:** Modify `SectionsCard.tsx`, `SectionsTab.tsx` / `MetadataTab.tsx` wiring; update the existing
Sections-tab delete test.

- [ ] **Step 1: Failing/updated test** — the existing SectionsCard delete test asserts the old
orphan-and-remove behavior; update it: deleting a non-empty section now shows the cascade confirm
(`buildSectionDeletePrompt`) and removes the section + its questions. Add a test that questions are
removed (no dangling).

- [ ] **Step 2: Verify fails** → FAIL (old assertion no longer holds).

- [ ] **Step 3: Implement** — change `SectionsCard`'s delete `onClick` to build the cascade prompt (it
needs `questionCountByStableKey` — already a prop — plus the caller must pass inherited/dependent info;
simplest: route delete through the same model `deleteSection` so the confirm inputs are computed by the
caller in `SectionsTab`/`MetadataTab` wiring, mirroring the outline). Replace the inline
`window.confirm("Delete section … reassigned")` with the shared prompt. The `onDelete` callback now
maps to `model.deleteSection`.

- [ ] **Step 4: Run** — `npx jest SectionsCard SectionsTab MetadataTab --no-coverage` → PASS.

- [ ] **Step 5: Commit** — `feat(ed5): route Sections-tab delete through cascade deleteSection (B-2b global)`.

**→ PR-B checkpoint:** sweep + build + eslint. Open PR-B.

---

## PR-C — tier-band bar + client validation (flagless, Scoring tab)

### Task 16: Export domain fn + canonical boundary helper + wire domain-aware client validation (B-5 rider, C2)

**Files:** Modify `src/src/lib/assessments/scoring.ts` (export), Create
`src/src/components/admin/template-editor/tier-band-math.ts` (+ test), Modify `ScoringTiersTab.tsx`.

- [ ] **Step 1: Failing test**

```ts
// tier-band-math.test.ts
import { boundaryToTiers, tiersToBoundaries } from "@/components/admin/template-editor/tier-band-math";
test("integer mode: divider at v ⇒ lower.max=v, upper.min=v+1 (no overlap)", () => {
  const tiers = [{ minMetric: 0, maxMetric: 2, label: "", message: "" },
                 { minMetric: 3, maxMetric: 5, label: "", message: "" }];
  expect(tiersToBoundaries(tiers, "integer")).toEqual([2]);           // one interior boundary
  expect(boundaryToTiers(tiers, "integer", 0, 3)).toEqual([          // move boundary 0 → 3
    { minMetric: 0, maxMetric: 3, label: "", message: "" },
    { minMetric: 4, maxMetric: 5, label: "", message: "" }]);
});
test("fractional mode: divider at v ⇒ lower.max=v, upper.min=v (touching)", () => {
  const tiers = [{ minMetric: 0, maxMetric: 2.5, label: "", message: "" },
                 { minMetric: 2.5, maxMetric: 5, label: "", message: "" }];
  expect(tiersToBoundaries(tiers, "fractional")).toEqual([2.5]);
});
```

- [ ] **Step 2: Verify fails** → FAIL.

- [ ] **Step 3: Implement**
  - In `scoring.ts` add `export` to `computeGlobalTierDomain` (line ~1100).
  - `tier-band-math.ts`: `tiersToBoundaries(tiers, mode)` returns the interior boundary values;
    `boundaryToTiers(tiers, mode, boundaryIndex, newValue)` sets `tiers[i].maxMetric = newValue` and
    `tiers[i+1].minMetric = mode === "integer" ? newValue + 1 : newValue` (the ONE canonical
    conversion). Include a `clampBoundary(value, domain, neighbors, mode)` used by both drag + keyboard.
  - `ScoringTiersTab.tsx`: replace the internal-only `validateTiersClient` domain-span gap by computing
    the real domain (global via exported `computeGlobalTierDomain(sliderQuestions, scoringConfig)`;
    per-domain via the already-exported `computePerDomainTierContexts`) and calling the exported
    `validateTierTiling(tiers, domain)` so "tiers don't span domain" shows live. Keep
    `validateTiersClient` for the label/message checks or fold into the same surface.

- [ ] **Step 4: Run** — `npx jest tier-band-math ScoringTiersTab --no-coverage` → PASS.

- [ ] **Step 5: Commit** — `feat(ed5): export tier domain + canonical boundary math + live domain-aware validation (B-5/C2)`.

### Task 17: TierBandBar (global) (B-5)

**Files:** Create `TierBandBar.tsx` (+ test); Modify `ScoringTiersTab.tsx` (render above the global TierTable).

- [ ] **Step 1: Failing test** — given a finite domain + tiers, `TierBandBar` renders one draggable
divider per interior boundary; a keyboard ArrowRight on a focused divider increments it by one snap
unit and calls `onChange` with `boundaryToTiers(...)`; when domain.max is not finite the bar renders
nothing (parent shows a note); out-of-domain boundary renders clamped.

- [ ] **Step 2: Verify fails** → FAIL.

- [ ] **Step 3: Implement** — `TierBandBar({ tiers, domain, mode, onChange, isReadOnly })`: if
`!Number.isFinite(domain.max)` return null. Render a horizontal bar spanning `[domain.min, domain.max]`;
segments per tier; interior dividers as focusable buttons (role="slider", `aria-valuemin/max/now`,
`aria-label="Tier boundary N"`) draggable (pointer) + keyboard (Arrow = ±snap, Home/End = domain edges),
clamped between neighbors via `clampBoundary`; on change call `onChange(boundaryToTiers(...))`. Open-
ended top tier (last omits max) draws an arrow at the right edge.

- [ ] **Step 4: Run** — `npx jest TierBandBar ScoringTiersTab --no-coverage` → PASS.

- [ ] **Step 5: Commit** — `feat(ed5): TierBandBar visual editor for global tiers (B-5)`.

### Task 18: TierBandBar per-domain (B-5)

**Files:** Modify `ScoringTiersTab.tsx`; Test.

- [ ] **Step 1: Failing test** — each per-domain tier table renders a `TierBandBar` bound to that
domain's bounds (from `computePerDomainTierContexts`) + `onChange` → `handleDomainTiersChange(key, …)`;
open per-domain ranges show inputs-only + the note.

- [ ] **Step 2: Verify fails** → FAIL.

- [ ] **Step 3: Implement** — in the per-domain section render, compute per-domain
`{ domain }` via `computePerDomainTierContexts` and render `TierBandBar` (fractional mode) above each
domain's `TierTable`, wired to `handleDomainTiersChange`.

- [ ] **Step 4: Run** — `npx jest ScoringTiersTab --no-coverage` → PASS.

- [ ] **Step 5: Commit** — `feat(ed5): TierBandBar for per-domain tiers (B-5)`.

**→ PR-C checkpoint:** sweep + build + eslint. Open PR-C.

---

## PR-D — cross-section multi-container drag (flag-gated, highest risk)

### Task 19: Pure `resolveOutlineDrop` (B-3 drag core, own M1)

**Files:** Create `outline-drop.ts` (+ exhaustive test).

- [ ] **Step 1: Failing test**

```ts
// outline-drop.test.ts
import { resolveOutlineDrop } from "@/components/admin/template-editor/outline-drop";
// containers: Map<sectionKey, uid[]> in render order
const containers = { S1: ["a", "b"], S2: ["x"] };
test("same-section drop → reorder", () => {
  expect(resolveOutlineDrop("a", "b", containers)).toEqual(
    { kind: "reorder", sectionKey: "S1", order: ["b", "a"] });
});
test("cross-section drop → move at target index", () => {
  expect(resolveOutlineDrop("b", "x", containers)).toEqual(
    { kind: "move", uid: "b", targetSectionKey: "S2", index: 0 });
});
test("drop onto empty section container → move to end (index 0)", () => {
  expect(resolveOutlineDrop("b", "S3", { ...containers, S3: [] })).toEqual(
    { kind: "move", uid: "b", targetSectionKey: "S3", index: 0 });
});
test("no-op (over === active) → null", () => {
  expect(resolveOutlineDrop("a", "a", containers)).toBeNull();
});
```

- [ ] **Step 2: Verify fails** → FAIL.

- [ ] **Step 3: Implement** — `resolveOutlineDrop(activeId, overId, containers)`: locate active's
section + over's section (over may be a question uid OR a section-container id). If same section →
`{ kind:"reorder", sectionKey, order }` (arrayMove within the section). If different → `{ kind:"move",
uid: activeId, targetSectionKey, index }` where index = position of `overId` in the target (or end when
over is the container). Return `null` when `activeId === overId` or unresolved.

- [ ] **Step 4: Run** — `npx jest outline-drop --no-coverage` → PASS (all branches).

- [ ] **Step 5: Commit** — `feat(ed5): pure resolveOutlineDrop for multi-container dnd (B-3, M1)`.

### Task 20: Multi-container DndContext restructure in EditorOutline (B-3 drag)

**Files:** Modify `EditorOutline.tsx`; Tests: within + cross reorder; guards MUST stay green.

- [ ] **Step 1: Failing test** — drive the outline's single `onDragEnd` (jsdom, via the drivable path
already used for keyboard reorder) with a synthetic `{active, over}` for (a) a within-section pair →
asserts `onReorderQuestions(sectionKey, order)` fires; (b) a cross-section pair → asserts
`onMoveQuestion(uid, targetSectionKey)` (or `onMoveQuestionToIndex`) fires. Also assert the existing
`editor-byte-equivalence` keyboard-reorder test still passes.

- [ ] **Step 2: Verify fails** → FAIL.

- [ ] **Step 3: Implement** — replace the per-section `DndContext` (line ~371) with ONE `DndContext`
wrapping all sections; keep one `SortableContext` per section (items = that section's uids) plus make
each section a droppable container (so empty sections accept drops). Single `onDragEnd` builds
`containers` (Map sectionKey→uids), calls `resolveOutlineDrop(active.id, over.id, containers)`, and
dispatches `onReorderQuestions` or `onMoveQuestion` accordingly. Preserve the keyboard sensor + the
jsdom-drivable path. Keep within-section reorder semantics byte-identical (the guard exercises it).

- [ ] **Step 4: Run** — `npx jest EditorOutline editor-byte-equivalence --no-coverage` + the ED4 parity
suite → PASS (guards green).

- [ ] **Step 5: Commit** — `feat(ed5): multi-container DndContext — within + cross-section drag (B-3)`.

**→ PR-D checkpoint:** sweep + build + eslint. Open PR-D.

---

## Close-out

### Task 21: Round-trip persistence tests (co-validate C6)

**Files:** Create round-trip tests exercising serialize → PATCH-body → re-hydrate.

- [ ] **Step 1: Write tests**
  - **cascade → save → reload:** delete a non-empty section, serialize via `build-version-payload`, and
    assert the produced sections+questions payloads contain no removed section/questions and no dangling
    `sectionStableKey`/show-if; re-hydrate (`hydrateSectionsFromJson` + question hydration) and assert a
    consistent draft.
  - **move → save → reload:** move a question across sections, serialize, assert the moved question's
    `sectionStableKey` + contiguous `sortOrder`, key/prefix unchanged; re-hydrate + assert.
  - **tier → publish:** a draft whose tiers don't span the domain fails `getPublishValidationIssues`
    (domain-span) and a spanning draft passes.
  - **follow-up-save reconciliation:** cascade/move followed by a sections-only save still carries the
    question changes (guards the Wave-T raw-ref bug class).

- [ ] **Step 2: Run** → PASS.

- [ ] **Step 3: Commit** — `test(ed5): round-trip persistence — cascade/move/tier corrupting paths (C6)`.

### Task 22: ADR-0023 + full sweep + adversarial review + SoT

- [ ] **Step 1: Write `docs/adr/0023-cross-section-move-and-cascade-section-delete.md`** — Status
  Accepted (Wave ED5); Context (extends ADR-0020 inherited-lock; ADR-0016 same-version deltas); Decision
  (cross-section move allowed for inherited with a warning — stableKey/prefix immutable, per-domain +
  report-grouping shift on future versions only; section-delete cascades globally, physical deletion no
  tombstone, defense-in-depth reject of dangling refs at save/publish); Consequences; cross-links.

- [ ] **Step 2: Full editor sweep** — `npx jest src/src/__tests__/components/admin/template-editor
  src/src/__tests__/admin --no-coverage 2>&1 | tail -20`. Record the exact pass count from the jest
  summary line (Jest-verify — never from memory). Confirm the frozen guard (15) + ED4 parity suite green.

- [ ] **Step 3: Build + eslint** — `CI=true npx next build --turbopack` green;
  `npx eslint <all changed files>` clean.

- [ ] **Step 4: Adversarial review** — multi-lens review of the diff (correctness/data-integrity/a11y/
  flag-off byte-identity/dnd edge cases). Fix confirmed defects + add regression tests.

- [ ] **Step 5: SoT + Notion + memory** — update CLAUDE.md LAST_UPDATED anchor
  (`LAST_UPDATED_SLUG:wave-ed5-*`, keep < 8000 words — the `changelog-freshness.test.ts` guard) + a new
  top `plans/CHANGELOG.md` entry (`ENTRY_SLUG:wave-ed5-*`); create the Notion task; update memory
  anchors (`project_next_wave`, `project_editor_overhaul`).

- [ ] **Step 6: Commit** — `docs(ed5): ADR-0023 + SoT for Wave ED5 close-out`.

---

## Self-review

**Spec coverage:** A-1 (T4) · A-2 (T6) · A-3 (T2) · B-1 badges (T7) + drawer (T8) · B-2 CRUD (T9) +
cascade (T10, T15) · B-3 command+control (T11) + drag (T19–T20) + inherited warn (T11) · B-4 two widgets
+ keying + DRY (T1, T2) · B-5 bar (T16–T18) + validation rider (T16) · C canvas cues (T2, T5) + collapse
(T3) + a11y (T13) + column (T14) + DRY (T1). Co-validate C1 (T1/T2) · C2 (T16) · C3 (T10, T12) · C4
(T19–T20 hardened) · C5 (PR split) · C6 (T21). ADR-0023 (T22). All covered.

**Placeholder scan:** UI-wiring steps reference reading the exact file for JSX (deliberate — subagents
have file access); all pure logic (mapper, shapeSignature, survivor, prompts, boundary math,
resolveOutlineDrop, commands) has complete code. No TBD/TODO.

**Type consistency:** `toQuestionForInput(q, opts)`, `shapeSignature(q)`, `computeSurvivorFocus(...)`,
`buildSectionDeletePrompt(section, opts)`, `buildMoveQuestionPrompt(q, name)`, `deleteSection(uid) →
{removedSectionKey, removedQuestionUids, affectedDependentUids}`, `moveQuestionToSection(uid, key,
index?)`, `resolveOutlineDrop(active, over, containers) → {kind:"reorder"|"move", ...} | null`,
`tiersToBoundaries/boundaryToTiers(tiers, mode, ...)` — names consistent across tasks.

## Execution
REQUIRED SUB-SKILL: superpowers:subagent-driven-development. Fresh subagent per task, two-stage review
(spec compliance → code quality), guards re-run per PR-unit. Build order A → C → B → D → close-out.
