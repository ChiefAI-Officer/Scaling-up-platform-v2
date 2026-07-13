# Wave ED3 — Extract shared editor state + inspector into headless hooks · Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: use superpowers:subagent-driven-development to execute this plan task-by-task. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Split the 1,393-line `TemplateEditorTabbed` monolith into a `TemplateEditorController` (owns one editor model) + `TabbedShell` (view), lift the model into headless hooks (`useTemplateEditorDraft` + `useVersionActions` + `useEditorSelection`, composed by `useTemplateEditorModel`), and extract one public `QuestionInspector` — **with zero user-facing change**, proven by a golden byte-equivalence guard held green through every slice.

**Architecture:** Spec `docs/specs/v7.6/19ae-editor-overhaul-wave3-extract-hooks.md`. Controller owns the single model instance; the view renders it. Mechanical lift (behavior relocated, never changed; internal `useState` preserved; three known warts preserved verbatim). No flag — live on merge, kill = revert.

**Tech Stack:** Next.js App Router, React 19, TypeScript, Jest + React Testing Library (jsdom), @dnd-kit, Radix Tabs. Run all commands from `src/`.

**Branch:** `feat/wave-ed3-extract-hooks` (already checked out; spec committed).

**Discipline for EVERY task:** the guard suite (Task 1) MUST stay byte-green. A task that breaks a byte assertion is not done. Preserve `useCallback` identities + deps exactly. Never change behavior — only its location.

---

## File structure

**New:**
- `src/src/__tests__/components/admin/template-editor/editor-byte-equivalence.test.tsx` — the golden characterization guard (Task 1).
- `src/src/components/admin/template-editor/hooks/useEditorSelection.ts`
- `src/src/components/admin/template-editor/hooks/useTemplateEditorDraft.ts`
- `src/src/components/admin/template-editor/hooks/useVersionActions.ts`
- `src/src/components/admin/template-editor/hooks/useTemplateEditorModel.ts`
- `src/src/components/admin/template-editor/TemplateEditorController.tsx` — thin owner (calls the model, renders the view).
- `src/src/components/admin/template-editor/QuestionInspector.tsx` — the one public inspector (sub-panels private+collocated).
- Per-hook unit tests: `hooks/__tests__/*.test.ts(x)` (or under `src/__tests__/components/admin/template-editor/`).

**Modified:**
- `src/src/components/admin/TemplateEditorTabbed.tsx` → becomes `TabbedShell` (the view) OR a thin re-export wrapper (see Task 2 note on preserving the import path).
- `src/src/components/admin/template-editor/QuestionsTab.tsx` — renders the extracted `QuestionInspector`; selection sourced from the model.
- `src/src/app/(dashboard)/admin/assessments/templates/[id]/versions/[versionId]/edit/page.tsx` — imports/renders `TemplateEditorController` (if the export name changes).

**Unchanged (reused; do NOT edit):** `build-version-payload.ts`, `compute-score-result.ts`, `scoring.ts`, `question-serialization.ts`, `sections-serialization.ts`, `test-mode-display.ts`, `publish-readiness.ts`.

---

## Task 1 — Golden byte-equivalence guard suite (write FIRST, against current code)

**Files:**
- Create: `src/src/__tests__/components/admin/template-editor/editor-byte-equivalence.test.tsx`
- Reference harness (reuse mocks): `src/src/__tests__/components/admin/TemplateEditorTabbed.test.tsx`, `.../template-editor-tabbed.wave-t.test.tsx`

**Context for the implementer:** This suite renders the CURRENT `TemplateEditorTabbed` and captures its exact outgoing HTTP behavior + derived state for scripted edits. It is the safety net for the entire refactor — it must pass on today's `main` and stay byte-green through every later task. It asserts on the component's PUBLIC surface (render + user events + captured `fetch`), which is stable across the refactor while internals change.

- [ ] **Step 1 — Test harness + `fetch` transcript recorder.**
  - Mock `next/navigation` (`useRouter`/`usePathname`/`useSearchParams`), `useToast`, and (as the reference tests do) `@dnd-kit` as needed. Mock `global.fetch` with a recorder capturing, per call, `{ method, url, body }` where `body` is the **raw string** passed to `fetch` (NOT re-parsed) — plus total call count and order.
  - **Mock `genUid`** (both `sections-serialization.ts` and `QuestionsTab.tsx` define one) to a deterministic counter via `jest.mock`, so uid-touching intermediates are stable. (PATCH bodies don't contain uid, but this makes the whole suite reproducible.)
  - Define 3 fixture versions as `TemplateEditorTabbedProps`: (a) slider-heavy (≥3 slider questions across 2 sections), (b) one carrying a MULTI_CHOICE with options (mirror LVA `S4_biggest_obstacles`), (c) a TEXT+NUMBER mix. Render with **all editor flags ON** (`waveQEnabled`, `questionEditorUnlocked`, `findingsEnabled`, `conditionalAuthoringEnabled`, `testModeEnabled`, `safeToPublishEnabled` = true).

- [ ] **Step 2 — Run to confirm it renders on current code.**
  - Run: `npx jest editor-byte-equivalence -t "renders"` → expect the smoke render to PASS on current `TemplateEditorTabbed`.

- [ ] **Step 3 — Happy-path transcript assertions.** Script, on fixture (a): edit template name (metadata dirty) → add a question with a fixed label (D8 slug-key path) → edit a slider's bands (findings) → reorder sections via the **MoveUp/MoveDown buttons** (jsdom-friendly) → click Save Draft. Assert:
  - the **full transcript**: exactly the expected `fetch` calls in order — metadata PATCH (URL `/api/admin/assessment-templates/{id}`, method PATCH, exact body string) then version PATCH (URL `.../versions/{versionId}`, method PATCH, exact body string); assert `count`.
  - derived: `isAnyDirty` true before save / Save button enabled; after save, Save disabled (`!isAnyDirty`).
  - **post-save reconciliation result**: the newly-added question's `stableKey` in the on-screen state is the slug-derived key (assert by stableKey, never uid); a subsequent state read shows `isNew` cleared.
  - Repeat the core transcript assertion on fixtures (b) and (c) (multi-choice option emission; TEXT/NUMBER no scale).

- [ ] **Step 4 — Transition-scenario assertions** (each its own `it`):
  - **Serializer failure ⇒ ZERO requests:** drive a state that makes `buildQuestionsPayload` throw `QuestionSerializationError` (e.g. an inherited-key collision, if reachable via the UI; else assert via a targeted render with crafted props) → click Save → assert **no `fetch` call** + a destructive toast.
  - **Double-save prevention:** click Save twice rapidly (second while the first's promise is pending) → assert exactly ONE transcript (the `savingDraft` guard).
  - **Failed save → retry:** first Save's version PATCH resolves `!ok` → destructive toast, dirty NOT reset; fix nothing, Save again → second transcript issued.
  - **`?tab=` routing:** click each tab → assert `router.replace` called with the expected `?tab=` (and no param for `metadata`).
  - **Independent `sendResultsDefault`:** toggle it → assert a standalone PATCH to `/api/admin/assessment-templates/{id}` with `{ sendResultsDefault }`, fired outside any Save.
  - **Wave-T follow-up-save regression:** add a question → Save → then make ONLY a sections edit → Save again → assert the second version PATCH's `questions` body STILL contains the earlier-added question (no data loss).
  - **Publish + duplicate:** click Publish (mock 422 with issues) → assert the POST to `.../publish` + `PublishFailureModal` opens; mock 409 → "already published" toast + refresh. Duplicate → POST `.../duplicate` + navigation (`window.location.href`) set.

- [ ] **Step 5 — Run the full guard suite, expect ALL green on current code.**
  - Run: `npx jest editor-byte-equivalence` → expect PASS. This is the golden baseline.

- [ ] **Step 6 — Commit.**
  - `git add src/src/__tests__/components/admin/template-editor/editor-byte-equivalence.test.tsx`
  - `git commit -m "test(editor): ED3 golden byte-equivalence guard (baseline on current editor)"`

**Note for the controller:** if a transition scenario proves genuinely undrivable through the UI in jsdom (e.g. forcing a serializer throw, or dnd question-reorder), capture it instead as a hook-unit contract test in the task that extracts that logic (F1) — and say so explicitly in the commit; never weaken the guard silently.

---

## Task 2 — Split `TemplateEditorTabbed` → `TemplateEditorController` + `TabbedShell` (no logic moved)

**Files:**
- Create: `src/src/components/admin/template-editor/TemplateEditorController.tsx`
- Modify: `src/src/components/admin/TemplateEditorTabbed.tsx` (becomes `TabbedShell`)
- Modify: `.../edit/page.tsx` (render the controller)

**Context:** Pure structural split. The controller will (in later tasks) own the model; for now it just wraps and renders the existing UI unchanged. Keep ALL state/logic in `TabbedShell` for this task — we only introduce the controller seam. Preserve the public import used by the page.

- [ ] **Step 1 — Create `TemplateEditorController.tsx`.** It accepts the same `TemplateEditorTabbedProps`, and for now simply renders `<TabbedShell {...props} />`. (Later tasks: it will call `useTemplateEditorModel(props)` and pass `model` down.)
- [ ] **Step 2 — Rename the component to `TabbedShell`** inside `TemplateEditorTabbed.tsx` (keep the file for now). Export `TabbedShell`; keep a `TemplateEditorTabbed` alias export so existing tests/imports resolve.
- [ ] **Step 3 — Point the page at the controller.** In `edit/page.tsx`, render `<TemplateEditorController .../>`.
- [ ] **Step 4 — Run guard + touched suites.** `npx jest editor-byte-equivalence TemplateEditorTabbed template-editor-tabbed` → expect byte-green (behavior unchanged).
- [ ] **Step 5 — Build check.** `CI=true npx next build --turbopack` → green.
- [ ] **Step 6 — Commit.** `git commit -m "refactor(editor): ED3 slice — introduce TemplateEditorController seam over TabbedShell (no logic moved)"`

---

## Task 3 — `useEditorSelection` (lift selection from QuestionsTab to the controller)

**Files:**
- Create: `src/src/components/admin/template-editor/hooks/useEditorSelection.ts`
- Create: `hooks/__tests__/useEditorSelection.test.ts`
- Modify: `TemplateEditorController.tsx` (call it, pass selection down), `TabbedShell`, `QuestionsTab.tsx` (consume selection from props instead of local state)

**Context (co-validate C2):** `focusedQuestionUid`/`selectedSectionStableKey` currently live in `QuestionsTab`. Lift them so the future panes share selection. **Behavior-neutral** — first characterize CURRENT selection behavior (esp. what happens on tab switch / QuestionsTab unmount-remount) and replicate it exactly.

- [ ] **Step 1 — Characterize current selection behavior.** Inspect `QuestionsTab.tsx` selection init + any reset. If selection resets when the Questions tab is left (component unmount), the lifted hook must replicate that (e.g. the controller resets selection on tab change away from `questions`, OR selection persists — match whatever the guard shows). Add a guard assertion (in Task 1's suite or here) pinning the observed tab-switch behavior BEFORE lifting.
- [ ] **Step 2 — Write the hook + unit test.** `useEditorSelection()` → `{ focusedQuestionUid, setFocusedQuestionUid, selectedSectionStableKey, setSelectedSectionStableKey }` (+ any reset helper needed to preserve behavior). Unit-test the setters + reset semantics.
- [ ] **Step 3 — Wire it.** Controller calls `useEditorSelection()`; passes selection + setters into `TabbedShell` → `QuestionsTab` as props; delete QuestionsTab's local selection `useState`.
- [ ] **Step 4 — Run guard + QuestionsTab suite.** `npx jest editor-byte-equivalence QuestionsTab useEditorSelection` → byte-green (incl. the tab-switch pin).
- [ ] **Step 5 — Build check.** `CI=true npx next build --turbopack` → green.
- [ ] **Step 6 — Commit.** `git commit -m "refactor(editor): ED3 slice — lift selection into useEditorSelection (behavior-neutral)"`

---

## Task 4 — `useTemplateEditorDraft` (the transactional aggregate — extract incrementally)

**Files:**
- Create: `src/src/components/admin/template-editor/hooks/useTemplateEditorDraft.ts`
- Create: `hooks/__tests__/useTemplateEditorDraft.test.ts`
- Modify: `TabbedShell` / `TemplateEditorController` (consume the hook)

**Context (co-validate C3 — the highest-risk task):** Extract the ENTIRE document model + save flow as ONE hook. Do it in internal sub-steps, running the guard green after each. Preserve `useState`, refs (return the ref OBJECTS so the shell reads `.current` exactly as today), `useCallback` identities + deps, and the two-copy scoringConfig verbatim. `useSaveDraft` is NOT a separate hook — it lives inside this aggregate.

**Hook signature (returns, grouped):**
```ts
useTemplateEditorDraft(args: {
  template; version; publishedQuestionKeys; publishedOptionKeys;
  questionEditorUnlocked; waveQEnabled; onSaveDraft?; initialDirtyFlags?;
}): {
  // state
  templateValues; versionValues; sections; questions; scoringConfigState;
  dirtyFlags; isAnyDirty; savingDraft; sendResultsDefault; savingSendResultsDefault;
  questionCountByStableKey;
  // refs (objects — shell reads .current, preserving current wiring)
  rawQuestionsRef; rawSectionsRef; scoringConfigRef; reportConfigRef;
  // handlers (identities + deps preserved verbatim)
  handleTemplateFieldChange; handleVersionFieldChange; handleScoringConfigChange;
  handleSendResultsDefaultChange;
  handleSectionsAdd; handleSectionsRename; handleSectionsDelete;
  handleSectionsMoveUp; handleSectionsMoveDown; handleSectionsReorder;
  handleAddQuestion; handleUpdateQuestion; handleDeleteQuestion;
  handleDuplicateQuestion; handleReorderQuestions;
  handleSaveDraft;
}
```

- [ ] **Step 1 — Sub-step A: lift STATE + refs + dirty.** Move the 5 content `useState` (templateValues/versionValues/sections/questions/scoringConfigState), `dirtyFlags`+`isAnyDirty`, `sendResultsDefault`+`savingSendResultsDefault`, `savingDraft`, the 4 refs, `questionCountByStableKey`, and the 5 `setXDirty` callbacks into the hook. `TabbedShell` consumes them. Run `npx jest editor-byte-equivalence` → byte-green.
- [ ] **Step 2 — Sub-step B: lift the change handlers.** Move `handleTemplateFieldChange`, `handleVersionFieldChange`, `handleScoringConfigChange`, `handleSendResultsDefaultChange`, the 6 section handlers, the 5 question handlers — with EXACT `useCallback` deps. Run guard → byte-green.
- [ ] **Step 3 — Sub-step C: lift `handleSaveDraft` + reconciliation.** Move the full save orchestration (serialize-before-fetch via `buildVersionScoringPayload`, `ops[]`, `Promise.all`, post-save `rawQuestionsRef`/`rawSectionsRef` overwrite, `assignedKeys`→`questions`, dirty reset). Run guard → byte-green, with **special attention** to the Wave-T follow-up-save and double-save scenarios.
- [ ] **Step 4 — Hook unit tests.** With `renderHook`, drive: a dirty save issues the exact metadata+version PATCH bodies; serializer-throw ⇒ zero fetch; double-save guarded; post-save reconciliation applies assigned keys by stableKey. (Complements the component-level guard.)
- [ ] **Step 5 — Full touched suites + build.** `npx jest editor-byte-equivalence useTemplateEditorDraft TemplateEditorTabbed` then `CI=true npx next build --turbopack` → green.
- [ ] **Step 6 — Commit.** `git commit -m "refactor(editor): ED3 slice — extract useTemplateEditorDraft transactional aggregate (state+handlers+save)"`

---

## Task 5 — `useVersionActions` (publish / duplicate)

**Files:**
- Create: `hooks/useVersionActions.ts`, `hooks/__tests__/useVersionActions.test.ts`
- Modify: `TabbedShell` / controller

**Context (grill G2 + C3):** Independent of the draft flow. Move `handlePublishVersion`/`handlePublish`/`handleDuplicateVersion`, `publishingVersionId`/`duplicatingVersionId`/`publishing`, `publishIssues`+`setPublishIssues`. `PublishFailureModal` render stays in the view, driven by `publishIssues`.

- [ ] **Step 1 — Hook + unit test.** `useVersionActions({ templateId, versionId, router, toast })` → the fields above. Unit-test: publish 422→sets issues; 409→toast+refresh; success→toast+refresh; duplicate→POST + navigation.
- [ ] **Step 2 — Wire it** into the controller/shell; `PublishFailureModal open={publishIssues !== null}` unchanged.
- [ ] **Step 3 — Guard + build.** `npx jest editor-byte-equivalence useVersionActions` + `CI=true npx next build --turbopack` → green.
- [ ] **Step 4 — Commit.** `git commit -m "refactor(editor): ED3 slice — extract useVersionActions (publish/duplicate)"`

---

## Task 6 — `useTemplateEditorModel` composer + thin controller

**Files:**
- Create: `hooks/useTemplateEditorModel.ts`
- Modify: `TemplateEditorController.tsx` (call the composer, pass `model` to `TabbedShell`), `TabbedShell` (consume `model` instead of calling the three hooks itself)

**Context (co-validate C1):** The composer calls the three hooks and returns one `{ state, handlers }`. The CONTROLLER calls the composer ONCE; `TabbedShell` receives `model` as a prop (no longer calls hooks). This is what makes W4 a one-line view switch. Tab routing (`activeTab` + `handleTabChange` + URL effect) and `testModeOpen` stay LOCAL to `TabbedShell` (view concerns, C3).

- [ ] **Step 1 — Write `useTemplateEditorModel(props)`** = compose `useTemplateEditorDraft` + `useVersionActions` + `useEditorSelection`; return a stable-shaped `{ state, handlers, selection, versionActions }`.
- [ ] **Step 2 — Controller calls it once**, renders `<TabbedShell model={model} template={...} version={...} .../>`; `TabbedShell` reads everything from `model` (+ keeps its own `activeTab`/`testModeOpen`).
- [ ] **Step 3 — Guard + build.** `npx jest editor-byte-equivalence template-editor` + `CI=true npx next build --turbopack` → green.
- [ ] **Step 4 — Commit.** `git commit -m "refactor(editor): ED3 slice — useTemplateEditorModel composer; controller owns one model, TabbedShell is a thin view"`

---

## Task 7 — Extract one public `QuestionInspector` (sub-panels private)

**Files:**
- Create: `src/src/components/admin/template-editor/QuestionInspector.tsx`
- Create: `src/src/__tests__/components/admin/template-editor/QuestionInspector.test.tsx`
- Modify: `QuestionsTab.tsx` (render `QuestionInspector`; remove the now-extracted internal code)

**Context (co-validate C5):** Move `QuestionConfigForm` (`QuestionsTab.tsx:1031`) out as the public `QuestionInspector`; move `FindingsPanel` (`:645`), `ShowIfPanel` (`:860`), `FindingsPreview` (`:538`) as **private, collocated** components inside `QuestionInspector.tsx`. `QuestionInspector` is **controlled**: props = `focusedQuestion` + mutation handlers + `findingsEnabled`/`conditionalEnabled`/`isUnlocked` + published-key/option data; it keeps its own local UI state; it mutates the document only via the handler props. `QuestionsTab` renders it, fed by the model's selection.

- [ ] **Step 1 — Light structural test.** `QuestionInspector.test.tsx`: rendering with a focused SLIDER question shows the config fields + (flags on) the findings/showif panels; a MULTI_CHOICE shows the options editor; calling a field change invokes the passed handler. Not a full DOM snapshot.
- [ ] **Step 2 — Extract.** Move the four components into `QuestionInspector.tsx` (three private, one public); wire props. `QuestionsTab` imports and renders `QuestionInspector` in its inspector column, passing the focused question from selection + the question handlers.
- [ ] **Step 3 — Guard byte-green + inspector test + build.** `npx jest editor-byte-equivalence QuestionsTab QuestionInspector` → byte-green (QuestionsTab rendered output unchanged); `CI=true npx next build --turbopack` → green.
- [ ] **Step 4 — Commit.** `git commit -m "refactor(editor): ED3 slice — extract public QuestionInspector (sub-panels private+collocated)"`

---

## Task 8 — Wave close-out

- [ ] **Step 1 — Full sweep.** `npx jest` → record the summary line (jest-verify counts; expect no NEW failures beyond the known pre-existing suites).
- [ ] **Step 2 — Build + lint.** `CI=true npx next build --turbopack` green; `npx eslint` on all changed files clean.
- [ ] **Step 3 — Multi-lens adversarial review** (own review focus: `useTemplateEditorDraft` closure-safety — no stale reads across the composed handlers; selection lift behavior; no changed `fetch` transcript). Fix any confirmed defect + lock with a test.
- [ ] **Step 4 — SoT.** Update `CLAUDE.md` LAST_UPDATED anchor + prose (keep < 8000 words) and prepend the `wave-ed3-*` entry to `plans/CHANGELOG.md`; run `npx jest changelog-freshness` (4/4 green).
- [ ] **Step 5 — PR.** Open a single PR (`feat/wave-ed3-extract-hooks` → `main`); wait for Build + Migration Safety Gate.
- [ ] **Step 6 — Post-merge prod smoke (MANDATORY, own review F7):** open a real DRAFT → edit a question + section + scoring value → Save Draft → Publish → confirm success (live parity).

---

## Self-review (writing-plans)

- **Spec coverage:** controller split (T2) · one draft aggregate (T4) · version actions (T5) · selection lifted (T3) · composer/one-owner (T6) · one QuestionInspector (T7) · guard = full transcript + all transition scenarios (T1) · determinism/genUid mock (T1) · flags-ON pass (T1) · no flag / kill=revert · mandatory prod smoke (T8) — all present.
- **Type consistency:** the `useTemplateEditorDraft` return shape (T4) is consumed verbatim by the composer (T6) and the guard's hook-unit tests (T4.4); `useVersionActions` / `useEditorSelection` shapes match their wiring.
- **Ordering:** guard first (T1) → structural seam (T2) → selection (T3) → aggregate (T4) → version actions (T5) → composer (T6) → inspector (T7) → close-out (T8). Each keeps the guard byte-green.
- **No placeholders:** every task has exact files, relocation sources (with line refs from the spec §6), the new hook signatures, exact commands, and commit messages.
