<!-- SPEC_ID:19al STATUS:DRAFT GATED WAVE:ED9 -->
# 19al — Wave ED9: Build-tab Forms overhaul (design + SoT)

**Status:** DRAFT · GATED (visual mockups approved + grilled 2026-07-17; per-wave plan = `19al-plan-wave9-forms-build.md`). No code until the plan is co-validated and the user authorizes the build.

**Ticket:** #5 of the 10-ticket editor-simplification pipeline (governing principle: *the whole assessment editor as simple as possible*). ED7 shipped #1–#2, ED8 (version lifecycle) shipped as #3, the design-review Artifact was #4.

**Design SoT:** the approved-design Artifact + the ED9 mockup Artifact `https://claude.ai/code/artifact/d9f78262-f3f9-4a18-b69d-74ea07b875dc` (before/after, per-candidate keep/cut, the 5 grilled decisions).

---

## 1. Problem

ED6 (spec 19ah) shipped a Google-Forms-*style* single column, but the surface still reads like a list-with-an-inspector, not a form builder: per-question actions are text links scattered on the collapsed row, the type is a bare `<select>` buried in the inspector body, the question you're editing has no card identity, there's no editable form title/description on the Build surface, and section bands carry four tiny inline controls. The user wants the Build tab to *feel* like Google Forms while staying on the shipped ED3→ED6 headless model.

## 2. Locked decisions (grilled 2026-07-17)

| # | Decision | Choice |
|---|---|---|
| **Scope** | Build canvas only, or also Metadata→Preview + Settings? | **Build canvas only.** The tab-architecture rebuild (Preview tab, Settings tab, Metadata dedup) is a *separate* gated wave (ED10). After ED9 the tab bar still reads "Metadata" — accepted interim state. |
| **D1** | Where the form title lives | **Hero card owns the editable title.** The page-header `<h2>` is hidden **in single-column mode only** (`{activeAuthoringMode !== "single" && …}`) so three-pane/legacy keep it and the frozen guards stay byte-identical. Pills + Save/Publish/Preview/Test-Mode stay in the header. |
| **D2** | Add affordance | **Contextual "+ Add question below" on the open card + a persistent add-bar** ("+ Add question" / "+ Add section") at the column/section end. **No** floating right-rail toolbar (fights the sticky section bands; ambiguous which section receives the add). |
| **D3** | Collapsed row density | **One compact line** (position · type pill · prompt · state glyphs). State badges shrink to tooltipped glyphs (＊ ⚑ ✎ ⚠). |
| **D4** | Section header controls | **Name + optional description + a ⋯ overflow menu** (rename inline; move up/down, delete, add-question in the menu). Replaces the four inline text/arrow links. |
| **Flag** | Flag or restyle in place | **Flag it** — `WAVE_ED9_FORMS_BUILD_ENABLED` (+ `_KILL`), gated at the ED6 seam. Flag-OFF renders today's `SingleColumnFormBuilder` byte-identical. |

## 3. Candidate set (from the approved-design list)

**Ships in ED9 (this wave):** 1 form-identity hero card · 2 footer action bar (duplicate/delete icons + Required switch) · 3 inline icon type picker · 4 add affordance (D2) · 5 section cards + description + ⋯ menu (D4) · 6 visual rhythm pass · 9 stableKey de-emphasis.

**Deferred → ED10 (sibling wave):** 7 relocate email cards to a Settings surface · 8 Metadata dedup (drop the duplicated Sections card).

**Already shipped, dropped from ED9:** friendly type names, plain slider copy + lowest/highest labels, hidden "Sort order" in single-column (all ED7); humanized header pills/caption (ED7/ED8).

## 4. Engine constraints honored by construction (verified against code)

- **Show-if ⇒ always optional.** The footer **Required** switch auto-disables with the existing hint when a question carries a show-if rule — *"Conditional questions are always optional…"* (`QuestionInspector.tsx:943`, Wave W). The ED9 footer switch reuses `question.isRequired` + the same interlock; it never lets a show-if question be required.
- **Inherited questions lock type/key.** The inline type picker renders a **locked chip** (not a dropdown) when `question.isInherited` — mirrors `disabled={isReadOnly || question.isInherited}` (`QuestionInspector.tsx:819`, Wave T). Retype on an unlocked question still runs the existing `handleTypeChange` guard + findings/options confirm-drop (`QuestionInspector.tsx:712`).
- **Focused-card body keeps every existing panel + the live preview.** The `QuestionCanvas` live respondent-preview, the per-type settings, the Wave U **FindingsPanel**, and the Wave W **ShowIfPanel** are all re-laid-out inside the focused card — never dropped. They are extracted from `QuestionInspector` (extract-don't-fork, ADR-0024 lineage) so flag-OFF `SingleColumnFormBuilder` keeps using the bare inspector unchanged.
- **Destructive edits stay whole (co-validate Codex#1).** Type change is not a rename — it clears the question's findings rules *and* clears `showIf` on every dependent question; option-removal and inherited-slider scale edits carry their own confirms/cleanup. These live in a shared `useQuestionEditorActions` command layer (`changeType`/`removeOption`/`updateScale`) called by **both** the bare inspector and the ED9 picker/settings — never a pure "confirm-text" builder.
- **No duplicated orchestration (co-validate Codex#3).** The DnD/grouping/focus/announcements/command wiring is lifted into `useSingleColumnBuilderController`; `SingleColumnFormBuilder` (flag-OFF) and `FormsBuilder` (flag-ON) are both thin renderers over it.
- **Add is section-local (co-validate Codex#4).** Questions are added per-section (section ⋯-menu + contextual "+ below"); the bottom bar offers only "+ Add section"; the empty state offers only "+ Add section" (a question can't exist without a section).
- **Section description is already respondent-visible.** `SectionDraft.description` round-trips (`sections-serialization.ts`) **and** renders on the survey (`section-pager.tsx:275`, `<p class="su-intro-desc">`) — so the new Build-UI description field is honest and needs **no** respondent-facing change.
- **stableKey de-emphasis** is gated to bare/single mode; legacy/three-pane keep the full labeled field (frozen suites pin it there).
- **Published = read-only.** All edit affordances (add-bar, footer actions, type picker, drag) suppress when the version is published — reuses the existing `isReadOnly` signal.

## 5. Flag + kill semantics (Wave-Q doctrine)

- New module `lib/assessments/wave-ed9-flags.ts` → `isFormsBuildEnabled()`; two levers only (no canary — the editor is template-level platform config): `WAVE_ED9_FORMS_BUILD_ENABLED` enables globally, `WAVE_ED9_FORMS_BUILD_KILL` hard-overrides OFF. Truthiness matches the Wave-M/N/O/S/ED8 convention.
- The flag gates **presentation only** — ED9 adds **no** schema, API, persisted data, or capability. Flag-OFF (or kill) → the Build tab is byte-identical to today's ED6 `SingleColumnFormBuilder`. Rollback of the extraction refactors (T2/T3) = revert-commit; the flag alone reverts all new presentation.

## 6. Testing decisions (seams)

- **Seam 1 — component-render** (existing): React Testing Library suites per new component (`FormsBuilder`, `FormQuestionCard`, `FormSectionCard`, `FormHeaderCard`, `QuestionTypePicker`) + a flag-OFF byte-identity test proving `SingleColumnFormBuilder` still renders when the flag is off.
- **Golden `innerHTML` net (co-validate Codex#2):** the frozen 15/20 suites pin *behavior + request transcripts*, not rendered HTML — so before any extraction, capture golden `container.innerHTML` snapshots of the bare inspector across representative states (slider/number/multi-choice/text × locked/unlocked/with-findings/with-show-if) **and** the flag-OFF Build shell. These stay green verbatim through every refactor — this is the actual "byte-identical" proof. (Task 0's jest run must not swallow a failure via `| tail`.)
- **Frozen regression pins (untouched by construction):** `editor-byte-equivalence.test.tsx` (15) and `three-pane-parity.test.tsx` (20) must pass with **zero diffs** to those files — the extractions are pure refactors of shared internals; the bare inspector's rendered output is unchanged (goldens prove it); the new layout lives behind the flag.
- **Seam 3 — live-app e2e** (post-launch): Playwright drive of the deployed Build tab — hero title edits, type picker (incl. locked inherited), footer Required + show-if interlock, add-bar, section description, drag reorder; respondent survey unchanged.
- Pure unit tests for the flag module and the extracted type-change guard. Test counts jest-verified, never from memory.

## 7. Out of scope

Any respondent survey/report/email change · the coach portal · the Metadata→Preview + Settings rebuild (ED10) · cross-section drag (ledgered) · retiring the three-pane/legacy fallbacks · the question-type set.

## 8. References

- Plan: `19al-plan-wave9-forms-build.md` (TDD tasks).
- Mockup Artifact: `https://claude.ai/code/artifact/d9f78262-f3f9-4a18-b69d-74ea07b875dc`.
- Live surface being overhauled: `components/admin/template-editor/SingleColumnFormBuilder.tsx`, `QuestionCard.tsx`, `QuestionInspector.tsx` (bare), `TabbedShell.tsx` (seam + header).
- Precedent: ED6 spec 19ah (single-column seam), ADR-0024 (single-column supersedes three-pane), ED3 extract-don't-fork.
