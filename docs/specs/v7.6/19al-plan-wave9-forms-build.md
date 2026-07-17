# 19al-plan — Wave ED9 implementation plan (TDD)

> **For agentic workers:** REQUIRED SUB-SKILL — use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans. Steps use checkbox (`- [ ]`) syntax. Design SoT = `19al-editor-wave9-forms-build.md`. **Co-validated by Codex 2026-07-17 (4 findings folded) + own review (2 findings folded); see §Co-validation.**

**Goal:** Turn the ED6 single-column Build tab into a Google-Forms-style builder — editable form-identity hero card, section cards with description + ⋯ menu, a focused question card with a live preview, an inline icon type picker, and a footer action bar (duplicate/delete + Required switch), a section-local add model, and a visual rhythm pass — behind `WAVE_ED9_FORMS_BUILD_ENABLED`, with flag-OFF byte-identical to today **and that byte-identity proven by golden snapshots**.

**Architecture:** Flag at the ED6 seam. The shared logic is lifted into two seams so ED6 and ED9 are both thin renderers with zero duplicated orchestration:
- `useSingleColumnBuilderController` — DnD (sensors, `handleDragEnd`, announcements), `bySection` grouping, focus refs/restoration, and the `useEditorCommands` wiring. Consumed by **both** `SingleColumnFormBuilder` (flag-OFF) and `FormsBuilder` (flag-ON).
- `useQuestionEditorActions` — a **command layer** owning the destructive edits (`changeType` clears findings + dependent `showIf`; `removeOption`; `updateScale`) with their confirms. Consumed by **both** the bare `QuestionInspector` and the ED9 `QuestionTypePicker`/`QuestionSettings`.

Flag-ON composes new presentation (`FormHeaderCard`, `FormSectionCard`, `FormQuestionCard`, `QuestionTypePicker`, `QuestionSettings`) over those seams. Golden `innerHTML` snapshots pin the ED6 render + bare-inspector states before any extraction, so every refactor is proven output-preserving.

**Tech stack:** Next.js 16 (App Router) · React 19 · TypeScript · Tailwind + shadcn tokens · @dnd-kit · Jest + React Testing Library. Build gate: `CI=true npx next build --turbopack` from `src/`.

---

## Co-validation (2026-07-17)

Codex (staff-engineer review, threadId `019f6ee9…`) returned **4 material findings, all accepted**; own independent review added **2** Codex couldn't see (it reviewed a condensed plan). Mapping: Codex#1→T3 (command layer, not confirm-builder); Codex#2→T2 (golden snapshots) + T0 (jest exit-code fix); Codex#3→T6 (extract controller, both thin renderers); Codex#4→T10 (section-local add). Own#1→T11 (flag-gated header conditional); Own#2→T7 (QuestionCanvas + full-question focused body). No overrides.

## File structure

**New:**
- `src/src/lib/assessments/wave-ed9-flags.ts` — `isFormsBuildEnabled()` (+ `_KILL`). Mirrors `wave-ed8-flags.ts`.
- `src/src/components/admin/template-editor/hooks/useQuestionEditorActions.ts` — command layer: `changeType`, `removeOption`, `updateScale` (own the confirms + destructive cleanup, incl. clearing dependent `showIf`). [Codex#1]
- `src/src/components/admin/template-editor/hooks/useSingleColumnBuilderController.ts` — presentation-neutral controller: DnD, `bySection`, focus refs/restore, announcements, commands. [Codex#3]
- `src/src/components/admin/template-editor/QuestionSettings.tsx` — per-type config body (slider/number/multi-choice/short-text), extracted from `QuestionInspector`; calls `useQuestionEditorActions` for option/scale edits.
- `src/src/components/admin/template-editor/QuestionTypePicker.tsx` — inline icon type picker (4 friendly types; locked chip when `isInherited`; retype via `changeType`).
- `src/src/components/admin/template-editor/FormQuestionCard.tsx` — collapsed one-line row + focused body (live preview + settings + panels + picker) + footer action bar.
- `src/src/components/admin/template-editor/FormSectionCard.tsx` — section card: inline name + description + ⋯ overflow menu.
- `src/src/components/admin/template-editor/FormHeaderCard.tsx` — form-identity hero.
- `src/src/components/admin/template-editor/FormsBuilder.tsx` — the ED9 Build body (flag-ON), a thin renderer over `useSingleColumnBuilderController`.
- Test files alongside each, **plus** `__tests__/.../ed9-golden-snapshots.test.tsx` (the byte-identity net) and `forms-build-flag-off-parity.test.tsx`.

**Modified:**
- `QuestionInspector.tsx` — consume `useQuestionEditorActions` + render `<QuestionSettings>`; `export { FindingsPanel, ShowIfPanel }`. Rendered DOM unchanged (proven by goldens).
- `SingleColumnFormBuilder.tsx` — refactor to a **thin renderer** over `useSingleColumnBuilderController` (output unchanged, proven by goldens + `single-column-builder.test.tsx`).
- `hooks/useTemplateEditorDraft.ts` — add `handleSectionsSetDescription` (mirror `handleSectionsRename` at L303).
- `hooks/useTemplateEditorModel.ts` (+ `TemplateEditorController` wiring) — expose `handleSectionsSetDescription`.
- `TabbedShell.tsx` — accept `formsBuildEnabled`; single-mode Build panel picks `FormsBuilder` vs `SingleColumnFormBuilder`; hide page-header `<h2>` **only** when `formsBuildEnabled && single`.
- `.../assessments/templates/[id]/edit/page.tsx` — read `isFormsBuildEnabled()`, pass `formsBuildEnabled`.
- `.env.example` / env docs — add the two levers.

## Constraint evidence (from spec 19al §4)

| Constraint | Evidence | ED9 handling |
|---|---|---|
| type-change clears findings + dependent show-if | `QuestionInspector.tsx:712`; dependents cleared via `onClearDependents` (`SingleColumnFormBuilder.tsx:352`) | `useQuestionEditorActions.changeType` owns both; picker + inspector call it |
| show-if ⇒ optional | `QuestionInspector.tsx:943` | footer Required switch reuses `isRequired`; disabled + hint when `showIf` set |
| inherited type/key lock | `QuestionInspector.tsx:819` | picker renders locked chip when `isInherited` |
| section description respondent-visible | `section-pager.tsx:275` | new field edits `SectionDraft.description`; no respondent change |
| flag-OFF = today | ED6 seam in `TabbedShell.tsx` | `formsBuildEnabled` chosen only inside the single branch; goldens prove OFF unchanged |

---

## Tasks (red → green each; commit after every task)

### Task 0 — Baseline (with a non-swallowing test run) [Codex#2]
- [ ] Record green counts for the pins. Run so a Jest failure fails the command (never mask the exit code):
  `cd src && set -o pipefail; npx jest src/__tests__/components/admin/template-editor --silent | tail -30` — or run without a pipe and read the summary. Confirm `editor-byte-equivalence.test.tsx` (expect **15**), `three-pane-parity.test.tsx` (expect **20**), `single-column-builder.test.tsx`, `single-column-inspector-bare.test.tsx` all green. Note the exact numbers in the PR (jest-verified, never from memory).

### Task 1 — Flag module
**Files:** Create `wave-ed9-flags.ts` (+ test `__tests__/wave-ed9-flags.test.ts`).
- [ ] **Test (fails):** default-OFF; ON for `=1`/`"true"`/`"yes"`; KILL overrides ENABLED; env read at call time.
```ts
import { isFormsBuildEnabled } from "../wave-ed9-flags";
afterEach(() => { delete process.env.WAVE_ED9_FORMS_BUILD_ENABLED; delete process.env.WAVE_ED9_FORMS_BUILD_KILL; });
test("off by default", () => expect(isFormsBuildEnabled()).toBe(false));
test("on when enabled", () => { process.env.WAVE_ED9_FORMS_BUILD_ENABLED = "1"; expect(isFormsBuildEnabled()).toBe(true); });
test("kill overrides", () => { process.env.WAVE_ED9_FORMS_BUILD_ENABLED = "1"; process.env.WAVE_ED9_FORMS_BUILD_KILL = "1"; expect(isFormsBuildEnabled()).toBe(false); });
```
- [ ] **Impl:** copy `wave-ed8-flags.ts` verbatim; rename to `isFormsBuildEnabled` + the two `WAVE_ED9_FORMS_BUILD_*` vars. PASS. Commit.

### Task 2 — Golden snapshot safety net (BEFORE any extraction) [Codex#2]
**Files:** Create `__tests__/.../ed9-golden-snapshots.test.tsx`.
- [ ] **Write goldens against HEAD (pre-refactor):** render and capture `container.innerHTML` for:
  - the **bare** `QuestionInspector` in representative states: `SLIDER_LIKERT` (unlocked; locked/inherited), `MULTI_CHOICE` (with 3 options; with a findings rule), `NUMBER`, `TEXT`, and one with a `showIf` rule set.
  - the flag-OFF **Build shell** (`TabbedShell` single mode, `formsBuildEnabled=false`): assert `SingleColumnFormBuilder` present and the page-header `<h2>` present.
- [ ] Assert each captured HTML equals an inline golden string (or `toMatchInlineSnapshot`). Run → PASS at HEAD. **These goldens must stay green verbatim through Tasks 3, 4, 6, and 11** — they are the real "byte-identical" proof the frozen suites don't provide. Commit.

### Task 3 — Extract `useQuestionEditorActions` command layer [Codex#1]
**Files:** Create `hooks/useQuestionEditorActions.ts` (+ test); Modify `QuestionInspector.tsx`.
- [ ] **Test (fails):** the hook exposes `changeType(question, nextType)`, `removeOption(question, optionKey)`, `updateScale(question, patch)`. `changeType` from `MULTI_CHOICE`→`SLIDER_LIKERT`: confirms (reusing the existing confirm copy), and on accept clears the question's findings rules **and** clears `showIf` on every dependent question (the `onClearDependents` behavior). `removeOption` fires the existing option-remove confirm; `updateScale` on an inherited slider fires the inherited-scale confirm (`buildScaleChangeConfirmText`).
- [ ] **Impl:** lift the mutation+confirm logic out of `QuestionInspector.handleTypeChange` (L712) and the option/scale handlers into the hook (it takes the same `onUpdate`/dependent-clear callbacks the inspector already receives). `QuestionInspector` now calls the hook. **No behavioral change.**
- [ ] **Guard:** `ed9-golden-snapshots` + `editor-byte-equivalence` (15) + `three-pane-parity` (20) green, **zero diffs** to the frozen files. Commit.

### Task 4 — Extract `QuestionSettings` + export the panels
**Files:** Create `QuestionSettings.tsx` (+ test); Modify `QuestionInspector.tsx`.
- [ ] **Test (fails):** `QuestionSettings` renders slider config for `SLIDER_LIKERT` (lowest/highest/step + ED7 lowest/highest-point labels), keyed options + "+ Add option" for `MULTI_CHOICE`, min/max/decimals/unit for `NUMBER`, and no scale block for `TEXT`. Locked/inherited disables inputs; option remove/scale edits route through `useQuestionEditorActions`.
- [ ] **Impl:** lift the per-type config JSX from the inspector's bare render into `QuestionSettings` (byte-identical markup: same classNames/testids/structure); inspector renders `<QuestionSettings>`. `FindingsPanel`/`ShowIfPanel` become named exports (bodies unchanged).
- [ ] **Guard:** goldens + frozen suites green, zero diffs; `single-column-inspector-bare.test.tsx` green. Commit. *(Highest-risk task — the config JSX is the most entangled; lean on the goldens as the tripwire.)*

### Task 5 — `QuestionTypePicker`
**Files:** Create `QuestionTypePicker.tsx` (+ test).
- [ ] **Test (fails):** shows the current type's friendly label + icon (`QUESTION_TYPE_LABELS`); opens to exactly the 4 types (Slider ▤ / Multiple choice ☰ / Number # / Short text ▭); selecting another calls `changeType` (via the hook, so the confirm + cleanup fire); `isInherited` (or `isReadOnly`) → locked chip (`data-testid="type-locked"`), no dropdown.
- [ ] **Impl:** icon dropdown wired to `useQuestionEditorActions.changeType`. Commit.

### Task 6 — Extract `useSingleColumnBuilderController`; ED6 becomes a thin renderer [Codex#3]
**Files:** Create `hooks/useSingleColumnBuilderController.ts` (+ test); Modify `SingleColumnFormBuilder.tsx`.
- [ ] **Test (fails):** the hook returns `{ bySection, sensors, handleDragEnd, dndAnnouncements, registerFocusRef, consumePendingFocus, commands, vms }` from a model; a within-section drop routes to `model.reorderQuestions`; a cross-section drop is ignored (parity with today).
- [ ] **Impl:** move `SingleColumnFormBuilder`'s orchestration (lines ~104–180: `useEditorCommands`, `buildCardViewModels`, `bySection`, sensors, `handleDragEnd`, announcements, focus refs) into the hook. `SingleColumnFormBuilder` consumes it and renders exactly as before.
- [ ] **Guard:** `ed9-golden-snapshots` (the flag-OFF shell golden) + `single-column-builder.test.tsx` + frozen suites green — proves ED6 output unchanged. Commit.

### Task 7 — `FormQuestionCard` (with live preview) [Own#2]
**Files:** Create `FormQuestionCard.tsx` (+ test).
- [ ] **Test (fails):**
  - Collapsed (not focused): one row — drag handle, position, type pill, prompt (focus button), glyph state badges (＊/⚑/✎/⚠ with `title` tooltips); **no** text Duplicate/Delete links.
  - Focused: receives the **full `question` draft**; body renders `<QuestionCanvas>` (live respondent preview) **then** `<QuestionSettings>` + `<FindingsPanel>` (if `findingsEnabled`) + `<ShowIfPanel>` (if `conditionalEnabled`); title `<input>` → `onUpdate({label})`; `<QuestionTypePicker>` beside the title; footer bar with duplicate icon, delete icon, and a **Required switch** → `onUpdate({isRequired})`.
  - Required switch **disabled + hint** when `question.showIf` is set (cannot enable Required while show-if present).
  - `isReadOnly` → no footer, no picker dropdown, no drag.
- [ ] **Impl:** compose the extracted pieces; keep the `React.memo` + primitive-field `areEqual` pattern from `QuestionCard` (focused card never memo-skipped) so editing one card can't re-render the other 60. Commit.

### Task 8 — `FormSectionCard` + section-description edit path
**Files:** Create `FormSectionCard.tsx` (+ test); Modify `useTemplateEditorDraft.ts`, `useTemplateEditorModel.ts`.
- [ ] **Test A (fails):** `handleSectionsSetDescription(uid, text)` sets `SectionDraft.description` + marks sections dirty.
- [ ] **Impl A:**
```ts
const handleSectionsSetDescription = useCallback(
  (uid: string, description: string) => {
    setSections((prev) => prev.map((s) => (s.uid === uid ? { ...s, description } : s)));
    setSectionsDirty();
  },
  [setSectionsDirty],
);
```
  export beside `handleSectionsRename`; thread through the model.
- [ ] **Test B (fails):** `FormSectionCard` renders name input (`handleSectionsRename`), description input (`handleSectionsSetDescription`), labeled-count, and a ⋯ menu exposing Add question / Move up / Move down / Delete; `isReadOnly` hides the menu + disables inputs.
- [ ] **Impl B:** build the card; the ⋯ menu is a simple disclosure (not `role=menu` — match the SectionsCard/AdminNav idiom). Commit.

### Task 9 — `FormHeaderCard`
**Files:** Create `FormHeaderCard.tsx` (+ test).
- [ ] **Test (fails):** editable title → `onTemplateFieldChange("name", …)`; editable description → `onTemplateFieldChange("description", …)` (verify the field is accepted — it backs the MetadataTab Description today); a meta row of per-type counts derived from `questions` (e.g. "Slider ×3 · Multiple choice ×1") + section/question totals; `isReadOnly` → read-only text.
- [ ] **Impl:** hero card; counts via `QUESTION_TYPE_LABELS`. Commit.

### Task 10 — `FormsBuilder` (thin renderer + disambiguated add model) [Codex#3, Codex#4]
**Files:** Create `FormsBuilder.tsx` (+ test).
- [ ] **Test (fails):**
  - Renders `FormHeaderCard`, one `FormSectionCard` per section, `FormQuestionCard` per question (one focused with its live body), and the contextual "+ Add question below" on the focused card.
  - **Add model (pinned):** question-add is **section-local only** — via each section's ⋯-menu "Add question" and the focused card's "+ below"; there is **no** global "+ Add question" button. The bottom bar shows **"+ Add section" only**.
  - **Empty state** (no sections): shows **only** "+ Add section" (no add-question affordance — impossible without a section).
  - Drag reorder routes through the controller (`resolveOutlineDrop` → `model.reorderQuestions`, within-section). `isReadOnly` suppresses all add/edit affordances.
- [ ] **Impl:** thin renderer over `useSingleColumnBuilderController`; compose the new cards + hero + add-bar. Commit.

### Task 11 — Flag seam + D1 header (flag-gated) + flag-OFF parity [Own#1]
**Files:** Modify `TabbedShell.tsx`, `edit/page.tsx`; Test `forms-build-flag-off-parity.test.tsx`.
- [ ] **Test (fails):**
  - `formsBuildEnabled=true` + single mode → Build panel renders `FormsBuilder` (`data-testid="forms-builder"`) and the page-header `<h2>` is **absent**.
  - `formsBuildEnabled=false` + single mode → renders `SingleColumnFormBuilder` and the `<h2>` is **present** (matches the Task 2 flag-OFF-shell golden exactly).
  - three-pane / legacy modes → `<h2>` present regardless of the flag.
- [ ] **Impl:** `TabbedShell` gains `formsBuildEnabled?: boolean`; the single-mode Build panel picks the builder; wrap the header title exactly `{!(formsBuildEnabled && activeAuthoringMode === "single") && <h2 …>}` — **flag-gated so flag-OFF single mode keeps its h2** (this is the correctness fix: a bare `!== "single"` would strip the h2 from today's ED6 and break the golden + byte-identity). `edit/page.tsx` reads `isFormsBuildEnabled()` and passes the prop.
- [ ] **Guard:** `ed9-golden-snapshots` + frozen suites (15/20) green, **zero diffs**; parity test green. Commit.

### Task 12 — Visual rhythm pass
**Files:** the new components' classNames only.
- [ ] Consistent spacing/elevation/focus-accent/radius using shadcn tokens (`bg-card`, `border-border`, `border-l-4 border-l-primary`, `shadow-md` on the focused card, semantic `text-destructive`/`text-muted-foreground` — **never** hardcoded Tailwind colors per CLAUDE.md). No structural/test change; re-run the new suites → green. Commit.

### Task 13 — Docs + gate
- [ ] Spec status → BUILT; `.env.example` entries; CLAUDE.md anchor + CHANGELOG entry drafted (applied on prod push).
- [ ] Full gate: `cd src && npx jest` (record counts from the summary line), `npx tsc --noEmit`, `npx eslint <changed files>`, `CI=true npx next build --turbopack`. Explicit zero-diff on the two frozen suites + the ED9 goldens. Commit + PR to `main`; run the review-loop.

### Post-launch — live-app e2e (Seam 3)
- [ ] After flag flip + dark deploy, Playwright-drive the deployed editor: hero title/description edit, type picker (incl. locked inherited), footer Required + show-if interlock, section-local add + empty state, section description renders on the survey, drag reorder; confirm respondent surfaces unchanged. Report findings.

---

## Self-review

- **Spec coverage:** §3 candidates → 1:T9 · 2:T7 · 3:T5 · 4:T10 · 5:T8 · 6:T12 · 9:T7(collapsed row + de-emphasis). Flag → T1/T11. §4 constraints → type-change cleanup:T3 · show-if interlock:T7 · inherited lock:T5 · panels kept + live preview:T4/T7 · section desc:T8 · read-only:T7/T8/T10 · flag-OFF proven:T2. ✔
- **Placeholders:** none — exact files, a representative test, and impl approach per task; T1/T8 include literal code. ✔
- **Type consistency:** `isFormsBuildEnabled`/`formsBuildEnabled`, `useQuestionEditorActions` (`changeType`/`removeOption`/`updateScale`), `useSingleColumnBuilderController`, `handleSectionsSetDescription`, `QuestionSettings`, `QuestionTypePicker`, `FormQuestionCard`/`FormSectionCard`/`FormHeaderCard`/`FormsBuilder` used identically throughout. ✔
- **Safety ordering:** goldens (T2) land before every extraction (T3/T4/T6) and before the seam wiring (T11); the frozen suites stay untouched by construction because the refactors preserve DOM and the new layout is flag-OFF until T11. ✔
