# Wave ED6 — Single-Column Form Builder — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: `superpowers:subagent-driven-development` (fresh subagent per
> task, two-stage review). Steps use `- [ ]` checkboxes. **Spec:** `19ah-editor-overhaul-wave6-single-column.md`
> (read §3 decisions, §14 grill, **§15 co-validate — authoritative**). **ADR-0024.**

**Goal:** Rebuild the question-authoring surface as a single-column, Google-Forms-style form builder — a
3rd flag-selected presentation over the ED3 headless model — replacing the "Edit" tab (as "Build"),
folding Sections in inline, keeping the three-pane as a live fallback.

**Architecture:** Body-swap at the `TabbedShell` seam (~L649). New default-OFF flag
`WAVE_ED6_SINGLE_COLUMN_ENABLED`. One `activeAuthoringMode` (`single|three|legacy`) drives seam + label +
default tab (single-wins). New `SingleColumnFormBuilder` renders section bands + collapsed one-line cards;
the single focused card expands to a live `QuestionInput` preview + the re-hosted **bare** `QuestionInspector`.
All mutations route through shared `model` commands; orchestration glue is **extracted into a shared hook**
consumed by both `EditorOutline` and the new surface (no duplication). ~90% reuse; the genuinely new code
is the card-list container + one shared hook.

**Tech Stack:** Next.js 16 / React / TypeScript / @dnd-kit / Tailwind / Jest + Testing Library.

**Conventions:**
- Run `npx jest …` and `npx eslint …` from **`src/`**; run `git` from the repo root.
- Branch: `feat/wave-ed6-single-column` (already checked out; spec+ADR committed).
- **Every structural mutation goes through `model` commands** (spec §6). Never mutate `questions`/`sections`
  locally. Consume the shared `model` from `TabbedShell`; **never call `useTemplateEditorModel` a 2nd time**.
- **Flag-OFF must stay byte-identical** — the ED3 byte-equivalence guard (`editor-byte-equivalence.test.tsx`,
  15) and the ED4 parity suite (`three-pane-parity.test.tsx`, 20) stay green throughout, **untouched**.
- Single-column DOM must emit `data-testid="question-card-<key>"` and `drag-handle-<key>` (so the existing
  `installDndLayout()` keyboard-reorder stub drives it) and `data-testid` for every affordance under test.

---

## PR-unit A — Flag, mode plumbing, seam (flag-OFF byte-identical)

### Task 1 — `wave-ed6-flags.ts`
**Files:** Create `src/src/lib/assessments/wave-ed6-flags.ts`; Test `src/src/__tests__/lib/assessments/wave-ed6-flags.test.ts`.

- [ ] **Step 1 — failing test.** Mirror `wave-ed4-flags.test.ts` exactly: `isSingleColumnEnabled()` returns
  `false` when `WAVE_ED6_SINGLE_COLUMN_ENABLED` is unset/`"0"`/`"false"`, `true` for `"1"|"true"|"yes"`
  (case-insensitive), read at call time (mutate `process.env` per case).
- [ ] **Step 2 — run, verify fail** (`npx jest wave-ed6-flags`).
- [ ] **Step 3 — implement** by copying `wave-ed4-flags.ts` and renaming the env key + fn to
  `WAVE_ED6_SINGLE_COLUMN_ENABLED` / `isSingleColumnEnabled`.
- [ ] **Step 4 — run, verify pass.**
- [ ] **Step 5 — commit** `feat(ed6): WAVE_ED6_SINGLE_COLUMN_ENABLED flag`.

### Task 2 — thread `singleColumnEnabled` from the edit page
**Files:** Modify `src/src/app/(dashboard)/admin/assessments/templates/[id]/versions/[versionId]/edit/page.tsx`
(add `import { isSingleColumnEnabled }` next to the ED4 import at ~:24; pass `singleColumnEnabled={isSingleColumnEnabled()}`
to `<TemplateEditorTabbed>` next to `threePaneEnabled` at ~:208).

- [ ] **Step 1** — add the import + prop pass.
- [ ] **Step 2** — `npx tsc --noEmit` clean (prop is threaded in Task 3).
- [ ] **Step 3 — commit** `feat(ed6): read flag in edit page`.

### Task 3 — `activeAuthoringMode` + 3-way seam + label/default-tab + `?tab=sections` routing
**Files:** Modify `src/src/components/admin/template-editor/TabbedShell.tsx`;
Test additions in `src/src/__tests__/components/admin/template-editor/three-pane-flag.test.tsx` (or a new
`single-column-flag.test.tsx`).

- [ ] **Step 1 — failing test** (`single-column-flag.test.tsx`): with `singleColumnEnabled` (through
  `TemplateEditorTabbed`): the questions tab trigger reads **"Build"**; the default landing tab is
  `questions`; a placeholder `data-testid="single-column-builder"` mounts in the questions panel; navigating
  to `?tab=sections` resolves to the questions/Build tab (no Sections trigger rendered). And with the flag
  OFF: byte-identical to today (Sections trigger present, default Metadata).
- [ ] **Step 2 — run, verify fail.**
- [ ] **Step 3 — implement:**
  - New prop `singleColumnEnabled = false` next to `threePaneEnabled` (~:268).
  - Derive once: `const activeAuthoringMode = singleColumnEnabled ? "single" : threePaneEnabled ? "three" : "legacy";`
  - `defaultTab` (~:291): `activeAuthoringMode !== "legacy" ? "questions" : "metadata"`.
  - Label (~:562): `activeAuthoringMode === "single" ? "Build" : activeAuthoringMode === "three" ? "Edit" : TAB_LABELS.questions`.
  - **Sections trigger + `TabsContent value="sections"`**: render only when `activeAuthoringMode !== "single"`.
  - `resolveTabFromUrl`: when `activeAuthoringMode === "single"` and the param is `"sections"`, return
    `"questions"` (keep `"questions"` a valid id; do not rename it).
  - Body seam (~:649): `activeAuthoringMode === "single" ? <SingleColumnFormBuilder model={model} …/> : threePaneEnabled ? <ThreePaneWorkspace …/> : <QuestionsTab …/>`.
  - Temporary: a minimal `SingleColumnFormBuilder` placeholder (`return <div data-testid="single-column-builder"/>`) — filled in PR-B/C.
- [ ] **Step 4 — run, verify pass**; run the ED3 guard + ED4 parity — **both green** (flag OFF path unchanged).
- [ ] **Step 5 — commit** `feat(ed6): activeAuthoringMode + 3-way seam + Build label + sections routing`.

---

## PR-unit B — Card list, section bands, navigation (reuse section mgmt; no in-place edit yet)

### Task 4 — extract `useEditorCommands` shared orchestration hook (behavior-preserving)
**Why:** co-validate §15.5 — do not duplicate the confirm→command→focus glue currently inline in
`EditorOutline.tsx`. Extract it so both `EditorOutline` and `SingleColumnFormBuilder` consume one copy.
**Files:** Create `src/src/components/admin/template-editor/hooks/useEditorCommands.ts`;
Test `.../__tests__/…/useEditorCommands.test.ts`; Modify `EditorOutline.tsx` to consume it.

- [ ] **Step 1 — failing test.** `useEditorCommands(model, { conditionalEnabled })` returns handlers:
  `deleteQuestion(uid)` (builds the show-if-dependents warning via `findShowIfDependents` + `window.confirm`,
  then calls `model.deleteQuestion`, then sets pending focus via `computeSurvivorFocus`), `deleteSection(uid)`
  (uses `collectSectionDeleteImpact` + `buildSectionDeletePrompt` + confirm → `model.deleteSection`),
  `moveQuestion(uid, targetSectionKey, index?)`, `duplicateQuestion(uid)` (focus the copy), `addQuestion`
  (focus the new). Assert: confirm-declined → no mutation; confirm-accepted → exactly one model call +
  correct pending-focus uid. (Mock `window.confirm`.)
- [ ] **Step 2 — run, verify fail.**
- [ ] **Step 3 — implement** by lifting the EXACT logic out of `EditorOutline.tsx` (the build-prompt →
  `window.confirm` → command → `computeSurvivorFocus`/pendingFocus sequence) into the hook. Return a stable
  object (`useCallback`/`useMemo`). Expose the `pendingFocusUid` + a `consumePendingFocus()` so the view can
  drive its `useLayoutEffect`.
- [ ] **Step 4 — refactor `EditorOutline.tsx`** to call `useEditorCommands` instead of its inline glue —
  **behavior-preserving**. Run ED4 parity (`three-pane-parity`, 20) + `question-commands` (30) + `ed5-round-trip`
  (2) — **all green**. If any diff, the extraction changed behavior — fix until byte-equal.
- [ ] **Step 5 — verify** ED3 guard green.
- [ ] **Step 6 — commit** `refactor(ed6): extract useEditorCommands shared hook (behavior-preserving)`.

### Task 5 — `addQuestion` optional `targetIndex` (contextual insert-below-focused)
**Why:** co-validate C4 — `addQuestion` appends today; "insert below focused" needs an index.
**Files:** Modify `src/src/components/admin/template-editor/hooks/useTemplateEditorDraft.ts` (`addQuestion`);
Test additions in the existing draft/command test.

- [ ] **Step 1 — failing test:** `addQuestion(sectionKey, { afterUid })` (or `targetIndex`) inserts the new
  question immediately after `afterUid` within that section and resequences `sortOrder` 1-based; with no
  option it appends (back-compat — existing callers unchanged). Returns the new uid.
- [ ] **Step 2 — verify fail.**
- [ ] **Step 3 — implement:** add the optional param; when present, splice at the computed index and
  resequence via the same path `moveQuestionToSection` uses; default path byte-identical to today.
- [ ] **Step 4 — verify pass** + `question-commands`/`ed5-round-trip`/parity green (append path unchanged).
- [ ] **Step 5 — commit** `feat(ed6): addQuestion optional insert-after index`.

### Task 6 — per-card view-model (`Map<uid, CardViewModel>`, one memo)
**Why:** co-validate §15.6 — avoid the O(n²) inline-lambda churn that would re-render all 61 cards.
**Files:** Create `src/src/components/admin/template-editor/single-column-view-model.ts`; Test alongside.

- [ ] **Step 1 — failing test** for a pure `buildCardViewModels(questions, sections, { conditionalEnabled })`
  → `Map<uid, { uid, stableKey, type, label, position, badges: {findings,showIf,required,unassigned}, showIfGates, dependentCount }>`.
  Assert: a plain slider → all badges false; a question with findings rules → `findings:true`; a show-if
  dependent → `showIf:true`; dependents counted once (no O(n²) per card — computed in one pass).
- [ ] **Step 2 — verify fail.**
- [ ] **Step 3 — implement** as a single pass building the whole map (reuse `computeShowIfGates` /
  `findShowIfDependents` **once** over the full set, not per row).
- [ ] **Step 4 — verify pass** + eslint.
- [ ] **Step 5 — commit** `feat(ed6): pure per-card view-model builder`.

### Task 7 — `SingleColumnFormBuilder` shell: section bands + collapsed cards + focus + empty states
**Files:** Create `src/src/components/admin/template-editor/SingleColumnFormBuilder.tsx`;
Create `.../SectionBand.tsx` + `.../QuestionCard.tsx` (collapsed rendering only this task);
Test `.../__tests__/…/SingleColumnFormBuilder.test.tsx`.

- [ ] **Step 1 — failing tests:** renders sticky section header bands (`role="group"`, `aria-labelledby`,
  counter, collapse caret, kebab: rename / add-question / move up-down / cascade-delete via `useEditorCommands`);
  a collapsed row per question with `data-testid="question-card-<key>"`, `drag-handle-<key>`, the view-model
  badges (text+icon), and a kebab (Duplicate / Delete / Move to section…); a collapsed section renders only
  its header (reuse `model.selection.collapsedSections` / `toggleSectionCollapsed`); empty section → dashed
  "Add question" zone; empty instrument → centered CTA; a card is marked focused (`aria-current`) when
  `model.selection.focusedQuestionUid === uid`.
- [ ] **Step 2 — verify fail.**
- [ ] **Step 3 — implement:** map `buildCardViewModels`; render bands + collapsed `QuestionCard`s; pass each
  card a **primitive** id + its view-model slice + stable `useCallback(uid)` handlers from `useEditorCommands`;
  `React.memo` the card. Read-only: gate affordances on the shared `isReadOnly` prop. Focus lands via the
  `pendingFocusUid` + `useLayoutEffect` + `scrollIntoView` (lift the pattern from `EditorOutline`).
- [ ] **Step 4 — verify pass** + eslint.
- [ ] **Step 5 — commit** `feat(ed6): SingleColumnFormBuilder shell (bands + collapsed cards + focus)`.

### Task 8 — reorder + cross-section move + add-below-focused
**Files:** Modify `SingleColumnFormBuilder.tsx` (+ reuse `outline-drop.ts` `resolveOutlineDrop`); Test additions.

- [ ] **Step 1 — failing tests:** within-section keyboard reorder (Space→Arrow→Space, using
  `installDndLayout()`) dispatches `model.reorderQuestions`; the card "Move to section…" picker dispatches
  `moveQuestion(uid, target)`; the contextual "＋ Add question" (anchored to the focused card) calls
  `addQuestion(section, { afterUid: focused })` and focuses the new card; section arrow up/down dispatches
  the section reorder.
- [ ] **Step 2 — verify fail.**
- [ ] **Step 3 — implement:** one `DndContext` + per-section `SortableContext` + `useDroppable`; delegate the
  drop decision to `resolveOutlineDrop`; wire the picker + add-below + section arrows to `useEditorCommands`.
  (Cross-section **drag** is out of scope for v1 — picker only; `resolveOutlineDrop` still returns move
  results but v1 wires only within-section drag + the picker.)
- [ ] **Step 4 — verify pass** + eslint.
- [ ] **Step 5 — commit** `feat(ed6): reorder + move-to-section picker + add-below-focused`.

### Task 9 — render-count assertion
**Files:** Test `.../__tests__/…/SingleColumnFormBuilder.render-count.test.tsx`.

- [ ] **Step 1 — failing test:** wrap `QuestionCard` with a render counter (spy); editing card A's label
  (fire change on the focused card) must **not** increment card B's render count.
- [ ] **Step 2 — verify fail** (proves the guard bites if memo/props regress).
- [ ] **Step 3 — implement/tune** memoization until it passes (primitive props + stable handlers).
- [ ] **Step 4 — commit** `test(ed6): render-count guard (edit A doesn't re-render B)`.

---

## PR-unit C — In-place editing (the expanded card)

### Task 10 — `QuestionInspector` `bare` prop (suppress own chrome)
**Why:** co-validate/grill — the inspector renders its own `<header>` (~:757) + outer `wf-card <section>`
(~:739/:752) in both branches; neither is suppressible today.
**Files:** Modify `src/src/components/admin/template-editor/QuestionInspector.tsx`; Test additions in
`QuestionInspector.test.tsx`.

- [ ] **Step 1 — failing test:** with `bare={true}`, the component renders NO `<header>` ("Edit Question —")
  and NO outer `wf-card` wrapper (both the null-question and real branches) — just the fields; with `bare`
  omitted/`false`, output is **byte-identical** to today (snapshot).
- [ ] **Step 2 — verify fail.**
- [ ] **Step 3 — implement:** add `bare?: boolean` (default `false`); gate the `<header>` and swap the outer
  `<section className="wf-card">` for a plain `<div>` (or fragment) when `bare`. Additive only.
- [ ] **Step 4 — verify pass** + the existing `QuestionInspector.test.tsx` green unchanged + ED3 guard green.
- [ ] **Step 5 — commit** `feat(ed6): QuestionInspector bare prop (additive, byte-identical default)`.

### Task 11 — expanded card = live preview + bare inspector (only focused card mounts it)
**Files:** Modify `QuestionCard.tsx` (expanded rendering) + `SingleColumnFormBuilder.tsx` (wire inspector
props); Test additions.

- [ ] **Step 1 — failing tests:** focusing a card renders (a) a live `QuestionInput` preview with
  `idPrefix="col-q-"`, keyed `` `${uid}:${shapeSignature(q)}` ``, receiving no model/mutation prop (throwaway
  — mirror `QuestionCanvas` invariant: interacting leaves Save disabled + resets on shape change + a later
  unrelated save excludes preview values); and (b) the **bare** `QuestionInspector` as the body; editing the
  label dispatches `model.handleUpdateQuestion`; only the focused card mounts an inspector (assert exactly one
  `questions-config-form` in the tree). Findings/show-if render as the inspector's existing collapsible panels.
- [ ] **Step 2 — verify fail.**
- [ ] **Step 3 — implement:** in the expanded branch, render the preview + `<QuestionInspector bare … />`,
  wiring its 10 props from the shared helpers/model exactly as `ThreePaneWorkspace` does (`computeShowIfGates`,
  `findShowIfDependents`, `publishedOptionKeys`, `isReadOnly`, `isUnlocked`, `findingsEnabled`,
  `conditionalEnabled`, `onUpdate`, `onClearDependents`).
- [ ] **Step 4 — verify pass** + eslint.
- [ ] **Step 5 — commit** `feat(ed6): expanded card — live preview + bare inspector`.

### Task 12 — published / inherited read-only reuse (verification tests)
**Files:** Test additions in `SingleColumnFormBuilder.test.tsx`.

- [ ] **Step 1 — failing tests:** when `isReadOnly` (published version) → all mutation affordances disabled
  (add/rename/reorder/delete/move + inspector fields); an inherited question → type/key/option-key locks
  hold (reuse `question.isInherited`, no local re-derivation). Assert the surface consumes the shared props,
  not re-derived state.
- [ ] **Step 2 — verify fail / implement** (gating is prop-driven — likely already true from Task 7/11; add
  any missing `disabled` wiring).
- [ ] **Step 3 — verify pass** + commit `test(ed6): published/inherited read-only reuse`.

---

## PR-unit D — a11y, focused test suite, close-out

### Task 13 — accessibility
**Files:** Modify `SingleColumnFormBuilder.tsx`/`SectionBand.tsx`/`QuestionCard.tsx`; Test
`.../__tests__/…/single-column-a11y.test.tsx`.

- [ ] **Step 1 — failing tests:** section landmarks (`role="group"` + label wired to the section-name);
  SR reorder announcements via dnd-kit `announcements` naming the question **label** (not uid) — reuse
  `EditorOutline`'s `dndAnnouncements`; focused card has `aria-current` + an accessible name conveying
  "editing" (accent-stripe is visual-only); drag handles ≥24px; collapse carets labelled.
- [ ] **Step 2 → 4** — verify fail → implement (lift the ED5 landmark/announce patterns) → verify pass.
- [ ] **Step 5 — commit** `feat(ed6): single-column a11y (landmarks, SR announce, aria-current)`.

### Task 14 — single-column focused wiring suite + flag-branch coverage
**Why:** co-validate C5 — the new surface gets its OWN contract; do NOT cross-assert DOM against legacy.
**Files:** Test `.../__tests__/…/single-column-wiring.test.tsx`.

- [ ] **Step 1 — tests:** through `TemplateEditorController` with the flag ON — each affordance dispatches the
  correct **model command** (add / delete / duplicate / reorder / move / section add-rename-reorder-cascade-
  delete); 2–3 author-action → **save-payload** spot-checks (stub `fetch`, assert the emitted body — payload
  parity, not DOM parity); confirm the ED3 guard + ED4 parity remain green (untouched).
- [ ] **Step 2 → 4** — write → verify → green.
- [ ] **Step 5 — commit** `test(ed6): single-column wiring + payload spot-checks`.

### Task 15 — close-out
- [ ] **Step 1** — full editor sweep: `cd src && npx jest src/__tests__/…/template-editor src/__tests__/…/assessments`
  (or the editor test globs); **jest-verify every count** (house rule) — record byte-equivalence 15, ED4
  parity 20, three-pane-flag 5, plus the new ED6 suite counts.
- [ ] **Step 2** — `CI=true npx next build --turbopack` green; `npx eslint` clean on all changed files.
- [ ] **Step 3** — adversarial review pass (subagent if the session limit allows, else inline multi-lens):
  correctness / bypass / flag-OFF byte-identity / re-render. Fix findings.
- [ ] **Step 4** — SoT: append a `plans/CHANGELOG.md` ED6 entry (anchor `ENTRY_SLUG:wave-ed6-single-column`),
  update the CLAUDE.md LAST_UPDATED anchor + one-line prose; flip the spec status `DRAFT → BUILT`.
- [ ] **Step 5 — commit** `docs(ed6): close-out — sweep, build, SoT` and open the PR.

---

## Verification (whole wave)
- ED3 byte-equivalence (15) + ED4 parity (20) **green and untouched** at every task (flag-OFF byte-identical).
- New single-column suites green; render-count guard green; a11y suite green.
- `CI=true npx next build --turbopack` exit 0; eslint clean.
- Ship dark → merge → flip `WAVE_ED6_SINGLE_COLUMN_ENABLED=1` + **redeploy** → internal walk on a throwaway
  `walk-*` template (add/edit/section-CRUD/move/publish) → keep or kill (flag off → byte-identical fallback).

## Kill switch
Flag OFF + redeploy → `ThreePaneWorkspace` (its flag on) or byte-identical `QuestionsTab`. No persisted-data
change. Named retirement of three-pane is a follow-on **after** cross-section drag lands (ADR-0024).

## Self-review (writing-plans)
- **Spec coverage:** every §15 accept maps to a task — scoring correction (T6 badges/T11 no scoring panel),
  sections routing (T3), contextual insert (T5), own test suite (T14)/ED3-guard-stays-off (T3/T14), share glue
  (T4), view-model+render-count (T6/T9), activeAuthoringMode (T3), three-pane framing (kill/close-out), drop
  preview-as-respondent (not built), two-state card (T7/T11). Decision A → T10/T11. ✓
- **No placeholders:** each task has concrete files, test intent, and implementation steps citing the exact
  precedent to mirror. ✓
- **Type consistency:** `useEditorCommands` (T4) is consumed by T7/T8/T11; `buildCardViewModels`/`CardViewModel`
  (T6) consumed by T7; `addQuestion({afterUid})` (T5) used by T8; `bare` prop (T10) used by T11. ✓
