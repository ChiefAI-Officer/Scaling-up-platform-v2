# Spec 19af — Assessment Editor Overhaul · Wave 4: Three-pane authoring workspace (Approach A)

> **Status:** DRAFT — brainstorm + `/grill-with-docs` + `/grill-me` + `/co-validate` (real Codex GPT-5.5 @ xhigh) DONE 2026-07-13; **user-approved to proceed to `writing-plans` + subagent-driven TDD build.**
> **Date:** 2026-07-13 · **Author:** design track (Wave ED overhaul, re-sequenced 5-wave plan — spec 19ac §2).
> **Gate:** GATED wave. Brainstorm + grill + co-validate DONE (decisions locked below). This spec + the implementation plan (`19af-plan`) + the granted user approval complete the gate.

> **/co-validate outcome (2026-07-13) — REAL Codex GPT-5.5 @ xhigh (read-only, code-grounded) + own independent review. 7 findings, ALL ACCEPTED, 0 overridden — 2 were correctness gaps own-review MISSED, 1 converged with own-review, the rest refine/correct earlier decisions:**
> - **C1 (one shell, not two — accept; converged with own review; OVERRIDES brainstorm Q4-A + grill G7).** A parallel `ThreePaneShell` duplicates header/nav/modal/action wiring that can drift, for a *weaker* kill guarantee. Ship a **flag-selected Questions *workspace* inside the existing `TabbedShell`** instead: header/tab-nav/other surfaces/modals/action wiring stay single-source; only the Questions authoring body swaps. "Flag off ⇒ identical" is then provable by construction, and the header-re-implementation drift risk (G7) disappears. (§3.2)
> - **C2 (model not ready — accept; own review MISSED; new prerequisite).** `handleAddQuestion`/`handleDuplicateQuestion`/`handleDeleteQuestion` return **`void`** (can't focus a new question's UID), and the delete confirm + inherited (D9) warning + **show-if dependent discovery/cleanup live in `QuestionsTab`'s presentation**, not the model (`showIfDependentKeys`, `buildShowIfDependentsWarning`, `window.confirm`, gate/dependent maps). A new outline calling raw handlers would **bypass** them → data-integrity regression. **Lift shared question commands into the model first** (return affected/new UIDs; do dependent cleanup; shared confirm/warn text). (§3.4)
> - **C3 (parity = one parameterized contract suite — accept; refines G3).** Separate three-pane tests with copied expectations validate two paths without proving *equivalence*. Make ONE suite parameterized over `threePaneEnabled ∈ {false,true}`, driven through `TemplateEditorController`, asserting **fetch transcripts + UI state + dirty state** (transcripts alone can't catch missing controls, wrong disabled states, or a dirtied model before Save). (§3.5)
> - **C4 (canvas invariant needs structure — accept; refines G1/§3.3).** Key the canvas answer-state by focused question UID (structural reset on focus change); assert canvas interaction leaves **Save disabled**, resets on focus change, and a **later unrelated edit/save excludes** canvas values. "No immediate fetch" doesn't prove the model stayed clean. (§3.3)
> - **C5 (duplicate DOM ids — accept; own review MISSED).** `QuestionInput` renders `id="q-${stableKey}"`; the canvas + the inspector's `FindingsPreview` collide on duplicate ids when the Findings panel is expanded. Add an optional `idPrefix` (backward-compatible default = `q-`); the canvas passes a distinct prefix. Both widgets stay (G8). (§3.3)
> - **C6 (kill is flip + redeploy, not zero-deploy — accept).** Vercel env changes require a redeploy (per CLAUDE.md gotchas). Correct the kill runbook: flip `WAVE_ED4_THREE_PANE_ENABLED=0` **+ redeploy**. Still no code revert; still fast. (§3.6)
> - **C7 (drop proactive memoization — accept; removes grill G11 from scope).** The proposed memo was self-defeating (per-row callbacks + freshly-computed dependent arrays) and off-objective. Keep hygiene (no gratuitous fresh `Set`/`{}` props); add memoization/`useDeferredValue` ONLY if profiling/the launch walk shows jank. (§3.7)

> **Brainstorm + grill outcome (2026-07-13) — decisions locked (some revised by co-validate above):**
> - **Q1 — scope = the Questions authoring surface only** (others untouched, single-source). (§3.1)
> - **Q2 — center canvas = live in-context preview** (respondent-fidelity render of the focused question). (§3.3)
> - **Q3 — center preview state is local-only, throwaway, always-renders-regardless-of-show-if.** Confirmed airtight: `QuestionInput` is purely controlled. Structured per C4. (§3.3)
> - **Q4 — left outline = navigation + question ops; section CRUD stays in the Sections surface.** Ops go through the shared commands (C2). (§3.4)
> - **G1 — parity guard against the ED3 frozen transcripts** (revised to the parameterized contract suite, C3). (§3.5)
> - **G2 — new presentation over the shared model** (revised: one shell + shared commands, C1/C2). (§3.2)
> - **G4 — mutation affordances gate on reused `isPublished`; canvas interactive in both states.** (§3.3)
> - **G5 — reuse `?tab=`; the flag-on Questions tab relabels "Edit" + becomes default; focus persists across tab switches.** (§3.2)
> - **G6 — desktop-first; panes stack below `lg`.** (§3.3)
> - **G8 — keep both `QuestionInput` widgets** (canvas + `FindingsPreview`); reconciled via C5's idPrefix. (§3.3)
> - **G9 — guided empty states** (no sections → link to Sections; nothing focused → canvas empty state). (§3.3)
> - **G10 — focus policy** (delete→neighbor, add→focus-new via C2's returned UID, reorder→unchanged, cross-tab→preserved). (§3.4)

> **Flag: `WAVE_ED4_THREE_PANE_ENABLED`** (default-OFF, single lever). Ships dark; live only when flipped + redeployed. Kill = flag off + redeploy (byte-identical fallback). (§3.6)

> **ADR:** none proposed (additive, flag-gated, kill-able → fails "hard to reverse"; the governing "extract, don't fork" principle is locked at 19ac §2). **No CONTEXT.md glossary change** — outline/canvas/inspector are editor-UI implementation, not domain-expert language.

---

## 1. Context & problem

The admin template editor (`admin/assessments/templates/[id]/versions/[versionId]/edit`) authors every instrument (SU-Full, LVA, QSP, Website Assessment, + custom). Audience: **ADMIN/STAFF only** (~3 internal experts, desktop). ED3 already refactored it into `TemplateEditorController` → one shared `model` (`useTemplateEditorModel` = `useTemplateEditorDraft` + `useVersionActions` + `useEditorSelection`) → a thin `TabbedShell` + a public `QuestionInspector`, guarded by a 15-scenario byte-equivalence suite (frozen + green).

The locked end-state (Approach A, 19ac §1) is a **three-pane working editor** — outline · in-context canvas · inspector. W4 delivers it. ED3 made this a presentation swap: the same `model` can back a second authoring view.

## 2. Where this sits in the wave plan

Wave 4 of 5 (19ac §2) — the **layout rebuild**, earned after the three capability/pivot waves (ED1 Test Mode, ED2 Safe-to-Publish, ED3 extract-hooks; all LAUNCHED). It is the one **visible-UI** wave; deliberately flag-gated + kill-able. W5 (polish: show-if badges + read-only logic map, drag-to-set tier bands) follows.

**Migration principle (all waves): extract, don't fork.** W4 honors it two ways: (a) the three-pane is a *flag-selected workspace inside the existing shell* (not a forked shell — co-validate C1); (b) question mutations run through *shared model commands* both the old and new views call (co-validate C2).

---

## 3. Wave 4 — Three-pane authoring workspace (this wave)

### 3.1 Goal & scope
When `WAVE_ED4_THREE_PANE_ENABLED` is on, the **Questions tab body** renders a new `ThreePaneWorkspace` — **left outline · center in-context canvas · right `QuestionInspector`** — instead of `QuestionsTab`; the Questions tab is relabeled **"Edit"** and made the default tab. **Scope is the Questions authoring surface only.** Metadata, Sections, Scoring & Tiers, Access, Versions, the header (Save Draft · Test Mode · Safe-to-Publish badge · Publish), and all modals are **untouched and single-source**.

### 3.2 Architecture — one shell, flag-selected workspace (co-validate C1; supersedes Q4-A/G7)
```
TemplateEditorController (unchanged) → const model = useTemplateEditorModel(props)
  → TabbedShell (SINGLE shell; header, tab-nav, all surfaces, modals, action wiring single-source)
       Questions tab body:
         props.threePaneEnabled
           ? <ThreePaneWorkspace model={model} .../>   // NEW — outline + canvas + reused inspector
           : <QuestionsTab .../>                         // existing 3-column, unchanged behavior
       (+ when threePaneEnabled: Questions tab labeled "Edit", default tab)
```
- **No `ThreePaneShell`, no surface strip, no header re-implementation.** `TabbedShell` gains ONE conditional (workspace pick + relabel/default).
- Reuse `?tab=` verbatim; the three-pane rides the existing `questions` value. `TabbedShell` still defaults to Metadata when the flag is off; defaults to "Edit" when on.
- Focus persists across tab switches (the `model` lives in the controller above the shell) — the flag-on tab does NOT reproduce `QuestionsTab`'s mount-only selection reset. Shell-local, no wire impact.

### 3.3 The three panes
- **Left — `EditorOutline` (NEW):** sections as collapsible headers; question rows (type chip, drag handle, label, edit/duplicate/delete) nested within. Within-section drag **and keyboard** reorder (the keyboard affordance is required so the ED3 keyboard-reorder scenario is drivable — C3). Focus applies to **questions only**; clicking a section header expands/scrolls. Empty state (G9): zero sections → *"No sections yet — add one in the Sections tab,"* linking to the Sections tab; per-section **"+ Add question."** Mutation affordances gate on reused `isPublished` (G4).
- **Center — `QuestionCanvas` (NEW):** renders the focused question exactly as a respondent sees it (section heading → label → help → required → the real `QuestionInput`). **Local, throwaway answer-state keyed by focused question UID** (C4) — never enters the model, never dirties, resets structurally on focus change; interactive in draft AND published states (it can't mutate anything — G4). Always renders regardless of show-if. Empty state (G9): nothing focused → *"Select a question to preview it."* Confirmed airtight: `QuestionInput` is purely controlled (`value` + `onChange`, no internal state), so a local `useState` + local `onChange` has zero path to the model.
- **Right — `QuestionInspector` (REUSED verbatim)** except a new optional `idPrefix` pass-through (C5). Its collapsed-by-default `FindingsPreview` (Wave U3) stays — the canvas ("what does this look/feel like") and the preview ("what recommendation *fires* for value X") answer different questions (G8). **`QuestionInput` gains an optional `idPrefix`** (default = `q-`, backward-compatible); the canvas passes a distinct prefix so the two simultaneous widgets don't emit duplicate DOM ids.
- **Narrow width (G6):** side-by-side at `lg`+, stack below `lg` — mirrors `QuestionsTab sticky lg+`. No new responsive framework.

### 3.4 Shared question commands (co-validate C2 — PREREQUISITE)
Today the question mutation *semantics* live split between the void-returning model handlers and `QuestionsTab`'s presentation. Before the outline can safely exist, lift them into shared model commands both views call:
- `addQuestion(sectionKey) → newUid`, `duplicateQuestion(uid) → newUid` (enables the G10 focus-the-new behavior).
- `deleteQuestion(uid) → { removedUid, affectedDependentUids }` performing the show-if dependent cleanup; the confirm/warn text builders (`buildDeleteConfirmText`, `buildShowIfDependentsWarning`) become shared so both views prompt identically.
- Within-section `reorderQuestions(sectionKey, newOrderUids)` (already effectively shared via the model) exposed to both drag and keyboard affordances.
- `QuestionsTab` is refactored to call these commands (behavior-preserving; guarded by the existing 241 editor tests + the parity contract suite). `ThreePaneWorkspace` calls the same commands → no bypass, no fork.
- **Focus policy (G10):** delete focused → focus next question in-section (prev if last; clear → canvas empty state if section now empty); add → focus the returned new UID; per-question duplicate → focus the copy; reorder → focus unchanged; cross-tab switch → focus preserved.

### 3.5 Parity contract suite (co-validate C3; revises G1)
ONE suite parameterized over `threePaneEnabled ∈ {false, true}`, driven through `TemplateEditorController`, asserting for each ED3 mutation scenario the **exact fetch transcript (method+URL+ordered bodies+count) + relevant UI state + dirty state**: edit-label→Save, Publish, Duplicate, serializer-failure→ZERO requests, double-save prevention, failed-PATCH→retry, the Wave-T follow-up-save data-loss regression, publish 422/409. Navigation (`?tab=` routing) tested per-mode. **One intentional divergence documented:** the ED3-pinned "selection resets after leaving Questions and returning" is the *opposite* of the three-pane's focus-preservation (G5) — deliberate, not a bug to fix. Cross-surface fixtures (a single Save spanning Metadata+Sections+Edit) are faithful because both modes mount/unmount the active surface identically (edits live in the model, so switching never loses them — the Wave-T guard).

### 3.6 Flag & kill (co-validate C6)
New `wave-ed4-flags.ts` (mirror `wave-ed2-flags.ts`), single lever `WAVE_ED4_THREE_PANE_ENABLED` (default-OFF, `KILL`/`ENABLED` if the mirror carries them — otherwise a single ENABLED bool matching ED1/ED2). Resolved server-side in the edit page (`isThreePaneEnabled()`), passed as `threePaneEnabled` down to the Questions-tab render decision. **Kill = set the flag off + REDEPLOY** (Vercel env needs a redeploy); documented runbook. No code revert; the flag gates presentation only and never touched persisted data. Second kill clause: the internal authors judge it worse after the launch walk.

### 3.7 Out of scope for W4 (co-validate C7 + wave plan)
- **Proactive render memoization** — hygiene only (no gratuitous fresh `Set`/`{}` props); add memo/`useDeferredValue` only if profiling shows jank on the largest instruments (~61 questions).
- **W5 polish:** show-if badges on outline rows, a read-only logic map, drag-to-set tier bands, section-create-from-outline, canvas/preview reconciliation if authors find the doubled widget confusing.

---

## 4. Testing
- **Parity contract suite** (§3.5) green for BOTH flag states via the controller.
- **Shared-command unit tests:** add/duplicate return correct UIDs; delete returns affected dependents + performs cleanup; `QuestionsTab` behavior unchanged (existing 241 tests green).
- **Canvas invariant tests (C4):** interaction leaves Save disabled; state resets on focus change (keyed remount); a later unrelated edit/save excludes canvas values; always-renders-regardless-of-showif.
- **idPrefix test (C5):** canvas + expanded Findings panel emit no duplicate DOM ids.
- **Outline/read-only/narrow-width/focus-policy** behavior tests.
- Full template-editor sweep + `CI=true npx next build --turbopack` + eslint clean.

## 5. Rollout
Ship dark (merge behind default-OFF flag) → flip `WAVE_ED4_THREE_PANE_ENABLED=1` on Vercel + **redeploy** → internal editor walk with the ~3 admins (edit→save→publish on a throwaway `walk-*` template) → keep or kill (§3.6). SoT on merge (CLAUDE.md anchor + CHANGELOG entry). No schema/migration.
