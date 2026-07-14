# Wave ED4 — Three-pane authoring workspace · Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: use superpowers:subagent-driven-development to execute this plan task-by-task. Steps use checkbox (`- [ ]`) syntax.

**Goal:** When `WAVE_ED4_THREE_PANE_ENABLED` is on, render a three-pane authoring workspace (outline · in-context canvas · reused `QuestionInspector`) as the **Questions tab body inside the existing `TabbedShell`** — flag-gated, kill-able (flip + redeploy → byte-identical `QuestionsTab`). Proven by a parity contract suite parameterized over both flag states.

**Architecture:** Spec `docs/specs/v7.6/19af-editor-overhaul-wave4-three-pane.md`. ONE shell (co-validate C1). Question mutations run through shared model commands both views call (co-validate C2). Canvas answer-state is local/throwaway/keyed-by-UID (C4). No second shell, no surface strip, no header re-implementation.

**Tech Stack:** Next.js App Router, React 19, TypeScript, Jest + RTL (jsdom), @dnd-kit, Radix Tabs. **Run all commands from `src/`.**

**Branch:** `feat/wave-ed4-three-pane` (checked out; spec + plan committed first).

**Discipline for EVERY task:** the parity contract suite (Task 2) and the existing 241 editor tests MUST stay green. The flag-OFF path is byte-identical to today — a task that changes flag-OFF behavior is not done. Preserve `useCallback` identities where they gate memoization. Never change existing behavior — only add the flag-ON path + the shared-command refactor (behavior-preserving).

---

## File structure

**New:**
- `src/src/lib/assessments/wave-ed4-flags.ts` — `isThreePaneEnabled()` (mirror `wave-ed2-flags.ts`).
- `src/src/components/admin/template-editor/ThreePaneWorkspace.tsx` — flag-ON Questions body (outline + canvas + inspector).
- `src/src/components/admin/template-editor/EditorOutline.tsx` — left pane.
- `src/src/components/admin/template-editor/QuestionCanvas.tsx` — center pane.
- `src/src/components/admin/template-editor/question-commands.ts` (or new exports on the draft hook) — shared add/duplicate/delete/reorder commands returning affected UIDs + doing dependent cleanup.
- Tests: `three-pane-parity.test.tsx` (or extend `editor-byte-equivalence.test.tsx` to parameterize), `question-commands.test.ts`, `QuestionCanvas.test.tsx`, `EditorOutline.test.tsx`.

**Modified:**
- `src/src/components/admin/template-editor/hooks/useTemplateEditorDraft.ts` — expose the shared commands (return UIDs; dependent cleanup) via the model.
- `src/src/components/admin/template-editor/QuestionsTab.tsx` — call the shared commands (behavior-preserving); keep confirm/warn text via the now-shared builders.
- `src/src/components/admin/template-editor/TabbedShell.tsx` — ONE conditional: Questions body = `threePaneEnabled ? <ThreePaneWorkspace> : <QuestionsTab>`; relabel `questions`→"Edit" + default to it when the flag is on. Thread `threePaneEnabled` prop.
- `src/src/components/admin/template-editor/hooks/useTemplateEditorModel.ts` / `TemplateEditorController.tsx` — pass `threePaneEnabled` through (prop already flows `TabbedShellProps`).
- `src/src/components/assessments/question-input.tsx` — optional `idPrefix?: string` (default `"q-"`), used for the element `id`.
- `src/src/app/(dashboard)/admin/assessments/templates/[id]/versions/[versionId]/edit/page.tsx` — resolve `isThreePaneEnabled()`, pass `threePaneEnabled`.
- `src/src/components/admin/template-editor/QuestionInspector.tsx` — accept + forward `idPrefix` to its `FindingsPreview`'s `QuestionInput` (default preserves current ids).

**Unchanged (reused; do NOT edit behavior):** `SafeToPublishBadge`, `TestModeDrawer`, `PublishFailureModal`, `MetadataTab`, `SectionsTab`, `ScoringTiersTab`, `VersionsTab`, `build-version-payload.ts`, `compute-score-result.ts`, `scoring.ts`, serializers.

---

## Task 1 — Shared question commands (PREREQUISITE, co-validate C2)

**Files:** `hooks/useTemplateEditorDraft.ts` (+ optional `question-commands.ts`), `QuestionsTab.tsx`, `question-commands.test.ts`.

- [ ] **Step 1 — Failing unit tests.** Assert the model now exposes commands with return values + cleanup:
  - `addQuestion(sectionKey)` returns the new question's `uid` (a string not previously present).
  - `duplicateQuestion(uid)` returns the new copy's `uid`.
  - `deleteQuestion(gateUid)` where another question's `showIf` references the gate returns `{ removedUid, affectedDependentUids: [depUid] }` AND the dependents' `showIf` is cleared in the resulting `questions` state.
  - The shared text builders `buildDeleteConfirmText(question)` and `buildShowIfDependentsWarning(keys)` are exported and unchanged in output vs. today's `QuestionsTab` copies (snapshot the strings).
- [ ] **Step 2 — Run, verify fail** (`npm run test -- question-commands`).
- [ ] **Step 3 — Implement.** Lift the discovery/cleanup + text builders out of `QuestionsTab` into shared code; make the draft hook's add/duplicate/delete return the UID(s) and perform dependent cleanup inside `setQuestions`. Keep the existing behavior identical (the cleanup already happens on delete today — relocate its computation; if today's delete does NOT clean dependents, ADD the cleanup and note it as a bug-fix in the changelog with a regression test).
- [ ] **Step 4 — Refactor `QuestionsTab`** to call the shared commands + shared text builders (delete confirm still shown by the row; now via the shared builder). Behavior-preserving.
- [ ] **Step 5 — Verify** `question-commands` green AND the full editor suite green (241 tests) AND the ED3 byte-equivalence guard byte-green (behavior unchanged). `npm run test -- template-editor`.
- [ ] **Step 6 — Commit** `feat(assessments): ED4 T1 — shared question commands (return UIDs + dependent cleanup)`.

## Task 2 — Parity contract suite, parameterized (co-validate C3)

**Files:** `three-pane-parity.test.tsx` (new) or parameterize `editor-byte-equivalence.test.tsx`.

- [ ] **Step 1 — Write the parameterized suite.** `describe.each([{ threePane: false }, { threePane: true }])` rendering through `TemplateEditorController` with `threePaneEnabled` set. For each ED3 mutation scenario (edit-label→Save, Publish, Duplicate, serializer-failure→ZERO fetch, double-save prevention, failed-PATCH→retry, Wave-T follow-up-save regression, publish 422/409): assert the **same** frozen fetch transcript (method+URL+ordered bodies+count) **plus** UI state (control present/enabled) + dirty state. Mock `genUid` to a deterministic counter (as ED3 does). Drive flag-ON scenarios through the three-pane affordances (outline rows, canvas, inspector) — cross-surface fixtures switch `?tab=`/surface between edits.
  - Navigation scenario (`?tab=` routing) asserted **per mode**.
  - Document the ONE intentional divergence (focus-preservation vs. ED3 selection-reset) with a mode-specific assertion, not a shared one.
- [ ] **Step 2 — Run.** The flag-OFF branch must pass immediately (behavior = today). The flag-ON branch FAILS (no workspace yet) — expected; it's the build target for T3–T7.
- [ ] **Step 3 — Commit** `test(assessments): ED4 T2 — parameterized parity contract suite (flag-OFF green, flag-ON is the target)`.

## Task 3 — Flag + workspace pick

**Files:** `wave-ed4-flags.ts`, edit `page.tsx`, `TabbedShell.tsx`, thread through `TemplateEditorController`/model props.

- [ ] **Step 1 — Failing test:** with `threePaneEnabled=true`, `TabbedShell` renders `ThreePaneWorkspace` (a stub is fine here) in the Questions body, the tab labeled "Edit", default tab = Edit; with `false`, renders `QuestionsTab`, label "Questions", default Metadata.
- [ ] **Step 2 — Run, verify fail.**
- [ ] **Step 3 — Implement.** `wave-ed4-flags.ts` mirroring `wave-ed2-flags.ts`; `page.tsx` resolves + passes `threePaneEnabled`; `TabbedShell` adds the conditional + relabel/default; a minimal `ThreePaneWorkspace` stub renders `QuestionInspector` + placeholders.
- [ ] **Step 4 — Verify** flag-OFF parity branch (T2) still byte-green; new flag-pick test green.
- [ ] **Step 5 — Commit** `feat(assessments): ED4 T3 — WAVE_ED4 flag + Questions-body workspace pick`.

## Task 4 — `EditorOutline`

**Files:** `EditorOutline.tsx`, `EditorOutline.test.tsx`, used by `ThreePaneWorkspace`.

- [ ] **Step 1 — Failing tests:** sections render as headers with nested question rows (type chip, label); clicking a row focuses it (`model.selection.setFocusedQuestionUid`); "+ Add question" calls `addQuestion` and focuses the returned UID; delete calls `deleteQuestion` (with the shared confirm) and moves focus to a neighbor; within-section drag AND **keyboard** reorder call `reorderQuestions` with the swapped order; zero-sections empty state links to the Sections tab; affordances disabled when `isPublished`.
- [ ] **Step 2 — Run, verify fail.**
- [ ] **Step 3 — Implement** using @dnd-kit (as `QuestionsTab` does) with a keyboard sensor so reorder is fireable in jsdom; wire the shared commands + selection; empty state.
- [ ] **Step 4 — Verify** outline tests + the flag-ON parity scenarios that depend on the outline (add/delete/reorder) now pass.
- [ ] **Step 5 — Commit** `feat(assessments): ED4 T4 — EditorOutline (sections+questions tree, shared commands, keyboard reorder)`.

## Task 5 — `QuestionCanvas` (invariant, co-validate C4)

**Files:** `QuestionCanvas.tsx`, `QuestionCanvas.test.tsx`.

- [ ] **Step 1 — Failing tests:**
  - Renders the focused question's respondent chrome (section heading, label, help, required marker) + a real `QuestionInput`.
  - `key={focusedUid}` remounts local state on focus change (interacting with question A, focusing B, returning to A shows the default value, not A's prior interaction).
  - Interacting with the canvas widget leaves **Save disabled** (model not dirtied) and emits **zero** fetch.
  - After a canvas interaction, editing a label in the inspector + Save produces a transcript **excluding** the canvas value.
  - Always renders even when the focused question has an unsatisfied `showIf`.
  - Nothing focused → empty state "Select a question to preview it."
- [ ] **Step 2 — Run, verify fail.**
- [ ] **Step 3 — Implement.** Local `useState` for the preview value; local `onChange`; `key` on the focused UID; read the focused `QuestionDraft` from the model (live reflection). No model writes anywhere.
- [ ] **Step 4 — Verify** canvas tests + relevant flag-ON parity scenarios green.
- [ ] **Step 5 — Commit** `feat(assessments): ED4 T5 — QuestionCanvas (keyed local throwaway state, in-context preview)`.

## Task 6 — `QuestionInput` idPrefix (co-validate C5)

**Files:** `question-input.tsx`, `QuestionInspector.tsx`, a dup-id test.

- [ ] **Step 1 — Failing test:** rendering the canvas + an expanded Findings panel for the same question yields **no duplicate `id` attributes** in the DOM; with no `idPrefix`, ids are byte-identical to today (`q-${stableKey}`).
- [ ] **Step 2 — Run, verify fail.**
- [ ] **Step 3 — Implement.** Add `idPrefix?: string` (default `"q-"`) to `QuestionInput`; use it for element ids/`htmlFor`. `QuestionInspector` forwards an `idPrefix` to its `FindingsPreview`'s `QuestionInput`; the canvas passes a distinct prefix (e.g. `"canvas-q-"`).
- [ ] **Step 4 — Verify** dup-id test green; existing `QuestionInput`/survey tests green (default unchanged).
- [ ] **Step 5 — Commit** `fix(assessments): ED4 T6 — QuestionInput idPrefix to avoid duplicate DOM ids`.

## Task 7 — Read-only + narrow-width + focus persistence

**Files:** `ThreePaneWorkspace.tsx`, `EditorOutline.tsx`, tests.

- [ ] **Step 1 — Failing tests:** published version → outline mutation affordances disabled, Save/Publish reflect published state (reused signals), canvas still interactive; below-`lg` layout stacks (assert the responsive classes mirror `QuestionsTab`); switching to Metadata and back preserves `focusedQuestionUid` (no reset).
- [ ] **Step 2 — Run, verify fail.**
- [ ] **Step 3 — Implement** the `isPublished` gating in the new panes, the `lg` grid/stack classes, and confirm focus persists (the model lives above the shell — assert no reset effect in the workspace).
- [ ] **Step 4 — Verify** these tests + the intentional-divergence parity assertion (three-pane preserves focus) green.
- [ ] **Step 5 — Commit** `feat(assessments): ED4 T7 — read-only gating, narrow-width stack, focus persistence`.

## Task 8 — Close-out

- [ ] **Step 1** — Full sweep from `src/`: `npm run test -- template-editor` + the new suites; record jest-verified counts.
- [ ] **Step 2** — `CI=true npx next build --turbopack` green; `npx eslint` clean on all changed files.
- [ ] **Step 3** — Full repo test sweep; confirm any failing suites are the known pre-existing ones (reason each, do not attribute to ED4).
- [ ] **Step 4** — Multi-lens adversarial review (Workflow: refute-by-default verify of the canvas invariant, the flag-OFF byte-identity, the shared-command cleanup, the dup-id fix). Fix confirmed defects.
- [ ] **Step 5** — SoT: CLAUDE.md LAST_UPDATED anchor + prose (`wave-ed4-three-pane`, BUILT — ships dark pending flag flip); `plans/CHANGELOG.md` entry. Verify freshness lint green + word count < 8000.
- [ ] **Step 6** — Open PR to `main` (protected; user names it to merge). Body: what/why, kill runbook (flip + redeploy), jest-verified counts, co-validate summary.
- [ ] **Step 7 (post-merge, separately authorized)** — flip `WAVE_ED4_THREE_PANE_ENABLED=1` + redeploy → internal editor walk → keep or kill.

---

## Verification (whole wave)
- Parity contract suite green for BOTH flag states (transcripts + UI + dirty).
- Existing 241 editor tests green (T1 behavior-preserving); ED3 byte-equivalence guard byte-green.
- Canvas invariant, idPrefix, outline, read-only/responsive/focus tests green.
- Build + eslint clean. SoT freshness lint green.

## Self-review (writing-plans)
- **Spec coverage:** every §3 decision maps to a task (C1→T3, C2→T1, C3→T2, C4→T5, C5→T6, C6→T3/T8 runbook, C7→out-of-scope; G4/G6/G10→T4/T7; G8→T6). ✓
- **Type consistency:** command names (`addQuestion`/`duplicateQuestion`/`deleteQuestion`/`reorderQuestions`) used identically across T1/T4; `idPrefix` across T6; `threePaneEnabled` across T3. ✓
- **No placeholders:** each task has concrete failing-test intents + exact commands + a commit. ✓
