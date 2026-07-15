# Wave ED6 — editor-overhaul single-column form builder — DESIGN (DRAFT)

> **Status:** DRAFT. Brainstorm complete (visual-companion session, 2026-07-15). This is a **gated wave**:
> next gates are `/grill-with-docs` → `/co-validate` (real Codex) → explicit user approval → `writing-plans`
> → subagent-driven TDD build. **Nothing is built yet.** Decisions below are provisional until the grill.
>
> **Spec seq:** `19ah` (follows 19ac ED1 · 19ad ED2 · 19ae ED3 · 19af ED4 · 19ag ED5).

---

## 1. Why this wave exists (the redirect)

The original editor-overhaul artifact offered three layout directions. We shipped **Option A — the
three-pane "workbench"** (outline · canvas · inspector) across Waves ED4/ED5. On live review of the
production editor, the client (Jeff, via the user) found it **cluttered and hard to use** — every
question row carried always-on controls, two panes sat empty on load, and cryptic keys/counters led the
UI. The user's direction: adopt the **simplicity of Google Forms** — which is the artifact's
**Option B ("Document Outline / inline-expand")** that we passed over.

This wave rebuilds the **question-authoring surface** as a **single-column form builder**.

**What it does NOT undo.** ED1 (Test Mode), ED2 (Safe-to-Publish badge), and ED3 (headless-hook
extraction) are **foundations this wave reuses**, not casualties. ED3 in particular is what makes this
cheap: the editor is already split into a headless model + interchangeable presentations. This wave adds
a *third* presentation and makes it the default.

**What it supersedes.** The three-pane (ED4/ED5) stops being the default authoring surface. It is
**kept as a flag-selectable fallback** this wave and retired as dead code in a later cleanup once
single-column is proven (D11).

---

## 2. Grounding facts (from the ED6 research pass — codebase audit + form-builder UX study)

- The authoring surface is a **presentation over a headless model** (`useTemplateEditorModel`), swapped
  in at a single seam in `TabbedShell.tsx` (~L649). ED4's `ThreePaneWorkspace` is the working proof of
  exactly this composition (164 LOC). A single-column surface is a **third body** at that seam.
- **4 question types** (Zod union in `lib/assessments/scoring.ts`): `SLIDER_LIKERT`, `NUMBER`,
  `MULTI_CHOICE`, `TEXT`. `MULTI_CHOICE` with `maxChoices:1` **is** the single-select idiom — **there is
  no radio type**.
- **~69% of platform questions are sliders**, and most scored — so "scored" is the common case, not a
  rare one (informs D5: Advanced-as-one-region beats a Forms-style hidden menu).
- Largest instrument is **~61 questions** across multiple sections (informs performance/virtualization
  posture, D9 + §8).
- Everything below the presentation layer — the model + all mutation commands, serialization, the
  publish gate, the respondent widget, and the four overlays — is **reused unchanged**.

---

## 3. Locked design decisions

Notation: **[user]** = decided by the user in brainstorm; **[default]** = my call, user saw it on the
"locked-design" screen and did not object; **[grill]** = to be pressure-tested next.

- **D1 — Direction: single column (Approach A / artifact Option B).** One scrolling column of question
  cards; no persistent side inspector. **[user]**
- **D2 — Scope: the "Build" tab replaces "Edit."** The single-column surface takes over the Edit tab's
  contents. The **Sections** tab **folds in** (sections become inline header bands authored in the
  column). **Metadata · Scoring & Tiers · Access · Versions are untouched.** **[user — "Proposed"]**
  - Note: "Scoring & Tiers" (template-level *global* bands) is distinct from *per-question* scoring
    (which lives in a card's Advanced). Both remain; they do different jobs.
- **D3 — Card anatomy: one component, three visual states** — collapsed (resting) / expanded-basic
  (focused) / expanded-advanced. Exactly one card focused at a time
  (`model.selection.focusedQuestionUid`). Focus is a persistent visual treatment (left accent stripe +
  elevation), independent of DOM focus. **[default]**
- **D4 — Collapsed = a fixed-height one-line summary:** drag handle (on hover/focus, ≥24×24px), position
  + type badge, truncated prompt, **state badges** (`Scored`, `Findings`, `Show-if`; warnings
  `Required`, `Unassigned`) that are **text+icon, never color-only**, and a kebab (Duplicate · Delete ·
  Move to section…). A plain slider shows **no** badges → reads identically to Google Forms. **[default]**
- **D5 — Advanced = ONE collapsed region per focused card**, holding scoring tier-bands / findings /
  show-if as **type-gated** sub-sections (scoring only for NUMBER/SLIDER; findings hidden for TEXT).
  NOT a Google-Forms-style "⋮ → add scoring" menu — one scannable region wins because most questions are
  scored. **[default, user-confirmed on the locked-design screen]**
- **D6 — Live preview built into the card.** The card's answer area renders the **real** `QuestionInput`
  widget (editor doubles as preview, like Forms). Preview state is **throwaway-local** (no model/mutation
  prop → structurally cannot persist), keyed on `` `${uid}:${shapeSignature(q)}` ``, and uses a
  **distinct `idPrefix` (`"col-q-"`)** so its DOM ids never collide with the in-card `FindingsPreview`
  widget. The whole-instrument **Test Mode** (`TestModeDrawer`) stays a header button + slide-over,
  verbatim. **[default]**
- **D7 — Sections inline.** Sticky tinted header band (`role="group"` + `aria-labelledby`) with the ED5
  labeled/total counter, a collapse caret, and a section kebab (rename · add question · move up/down ·
  **cascade delete**). Create/rename/reorder/delete route through the existing shared commands; **cascade
  delete uses the atomic `deleteSection` (never the orphan-leaving legacy path)**. Cross-section move of a
  question = **explicit "Move to section…" picker (reliable) + multi-container drag (fluid)**, both
  calling `moveQuestionToSection`. Contextual "＋ Add question" inserts **below the focused card**, not at
  the end. Empty section = dashed "Add question" drop-zone + focus landing spot; empty instrument =
  centered "Add your first section/question" CTA. **[default]**
- **D8 — Reuse Path A: re-host `QuestionInspector` in-card.** Mount the existing inspector inside the
  expanded card's Advanced region (it is already fully props-controlled and surface-agnostic — mounted
  this exact way by `ThreePaneWorkspace`), wrapped to suppress its "Edit Question — {key}" header so it
  reads as in-card sections. **Do NOT** extract the private `FindingsPanel`/`ShowIfPanel`/`FindingsPreview`
  sub-panels for v1 (Path B lifts ~250 lines of confirm-orchestration for no v1 payoff). **[default]**
- **D9 — Collapse granularity: per-section only for v1** (reuse `collapsedSections` /
  `toggleSectionCollapsed` verbatim). A per-question collapse slice is additive and cheap to add later if
  wanted. **[default]**
- **D10 — Flag: a new default-OFF flag as a 3rd rendering.** New `lib/assessments/wave-ed6-flags.ts`
  (`isSingleColumnEnabled()`, env `WAVE_ED6_SINGLE_COLUMN_ENABLED`, mirroring `wave-ed4-flags.ts`),
  read in `edit/page.tsx`, passed as a `singleColumnEnabled` prop. The seam becomes a **3-way selector,
  single-column-wins**: `singleColumnEnabled ? <SingleColumnFormBuilder/> : threePaneEnabled ?
  <ThreePaneWorkspace/> : <QuestionsTab/>`. When on, the tab is relabeled **"Build"** and becomes the
  default landing tab (cosmetic; label revertible). **[default]**
- **D11 — Three-pane kept as fallback this wave; retired in a follow-on** once single-column launches and
  is stable. Deleting it now would remove the fallback rung and force an all-or-nothing launch. **[default]**
- **D12 — Kill = flag OFF + redeploy → byte-identical fallback** (`ThreePaneWorkspace` if its flag is on,
  else byte-identical `QuestionsTab`). Writes nothing; no `_KILL`/`_CANARY`. **Flags gate capability,
  never persisted data** (Wave-Q durable rule). **[default]**

---

## 4. Architecture

```
edit/page.tsx (RSC: auth, DB fetch, flag reads incl. isSingleColumnEnabled())
  └─ TemplateEditorController → const model = useTemplateEditorModel(props)   [UNCHANGED]
       └─ TabbedShell (single shell; header, tabs, modals, action wiring single-source)   [UNCHANGED except seam]
            Build/Edit tab body — 3-way selector (D10):
              singleColumnEnabled ? <SingleColumnFormBuilder model=… />        // NEW
              : threePaneEnabled   ? <ThreePaneWorkspace model=… />            // ED4, kept as fallback
              :                      <QuestionsTab model=… />                  // legacy, kept as fallback
```

`SingleColumnFormBuilder` (**NEW** — the only genuinely new component) maps `questions` grouped by
`sections` + `sortOrder` into: sticky section header bands, question cards (collapsed/expanded), the
contextual add toolbar, empty states, and the dnd wiring. Each expanded card composes:
`QuestionInput` (preview) + the type/prompt/options basic editors + the re-hosted `QuestionInspector`
(Advanced). All mutations call `model` commands; nothing is mutated locally.

---

## 5. Reuse-vs-rebuild map

| Layer | Concrete component / file | Fate |
|---|---|---|
| Headless model + all commands | `useTemplateEditorModel` (+ `useTemplateEditorDraft`, `useVersionActions`, `useEditorSelection`) | **VERBATIM** |
| Mutation commands | `addQuestion`, `handleUpdateQuestion`, `deleteQuestion`, `duplicateQuestion`, `reorderQuestions`, `moveQuestionToSection`, `deleteSection`, section add/rename/reorder/cascade-delete | **VERBATIM** |
| Serialization / save | `question-serialization.ts`, `sections-serialization.ts`, `build-version-payload.ts` (`buildVersionScoringPayload`) | **VERBATIM** |
| Pure helpers | `question-commands.ts` (`findShowIfDependents`, `computeShowIfGates`, `collectSectionDeleteImpact`, `computeSurvivorFocus`, prompt builders), `tier-band-math.ts`, publish-readiness (`getPublishValidationIssues`) | **VERBATIM** |
| Respondent widget + mapper | `question-input.tsx` (`QuestionInput`), `question-widget-mapper.ts` (`toQuestionForInput`, `shapeSignature`) | **VERBATIM** (+ existing `idPrefix`) |
| Per-question config editor | `QuestionInspector.tsx` (incl. private `FindingsPanel`/`ShowIfPanel`/`FindingsPreview`, options editor, type/scale/option confirms) | **RE-HOST** in-card (Path A; wrap to suppress header) |
| Overlays | `SafeToPublishBadge`, `TestModeDrawer`, `LogicMapDrawer`, `EditorDrawer` | **VERBATIM** (header/drawer) |
| Confirm orchestration | build-prompt → `window.confirm` → command → `computeSurvivorFocus` glue (currently in `EditorOutline.tsx`) | **RE-HOST** (lift exact glue; do not re-derive) |
| Drag math | `outline-drop.ts` | **RE-HOST** if drag kept in v1 |
| Flag file | mirror `wave-ed4-flags.ts` | **NEW** (`wave-ed6-flags.ts`, `isSingleColumnEnabled`) |
| Card-list container | grouping, focus, section bands, contextual insert, empty states, dnd | **NEW** — `SingleColumnFormBuilder` (the actual rebuild) |
| Seam edit | ternary at `TabbedShell.tsx:~649` → 3-way; new prop `singleColumnEnabled`; label/default-tab | **NEW (~4 edited lines)** + 1 line in `edit/page.tsx` |

---

## 6. Invariants the new surface MUST honor

Route **every** structural mutation through `model` commands → `buildVersionScoringPayload`. Never mutate
`questions`/`sections` locally. The server PATCH + publish gate are independent re-enforcement layers.

- [ ] All mutations via model commands (bypass-proof show-if dependent cleanup + cross-section move).
- [ ] Save flows through `buildVersionScoringPayload` → inherits stableKey derivation/immutability,
      `ORPHAN_SECTION_REF` rejection, inherited key/type/option locks, 4-type emission, show-if +
      findings anti-resurrection, content-hash stability.
- [ ] Server routes re-enforce `KEY_COLLIDES_WITH_PUBLISHED` / `TYPE_LOCKED` / duplicate/option/maxChoices
      / validate-don't-strip. Do not weaken client-side.
- [ ] Publish gate untouched — tier tiling (global + per-domain), show-if referential integrity, findings
      tiling/text caps — via the shared `getPublishValidationIssues` (same path as the badge; anti-drift).
- [ ] In-card preview is throwaway-local (no model/mutation prop; keyed `uid:shapeSignature`) — mirror the
      `QuestionCanvas` invariant.
- [ ] Distinct `idPrefix` for the card preview widget vs the FindingsPreview widget.
- [ ] Inherited/published locks reused, not re-implemented (read-only affordances from `QuestionInspector`).
- [ ] `MULTI_CHOICE` is the only multi-select; `maxChoices:1` = single-select; no radio type anywhere.
- [ ] Published versions immutable (409 `ALREADY_PUBLISHED`); read-only mode when `isPublished`.
- [ ] Deterministic focus after every mutation (capture target before mutate → `computeSurvivorFocus`;
      never `<body>`): add → new card's first field; duplicate → the copy; delete → next-then-prev sibling.

---

## 7. Test / parity strategy

- **ED3 golden byte-equivalence** (`editor-byte-equivalence.test.tsx`, 15) — **untouched**. If it needs an
  edit, the rebuild changed serializer/model behavior — a conscious break, not a refactor.
- **Generalize the parity runner to a 3rd mode.** Add `{mode:"single"}` to `MODES` in the parity suite
  (currently `three-pane-parity.test.tsx`); assert `cap.single.transcript === cap.off.transcript`. Because
  ED3 freezes `off` byte-exact, this **transitively freezes single-column** — no new golden strings.
- **New mode-aware authoring helpers** keyed off the new DOM test-ids; drive reorder via the **keyboard
  sensor** (jsdom can't dispatch dnd-kit PointerEvents); keep the `installDndLayout()` rect stub.
- **New flag-branch-pick test**: flag ON ⇒ single-column mounts/relabels; OFF ⇒ byte-identical fallback;
  plus a11y landmarks + responsive classes.
- `ed5-round-trip.test.ts` + `question-commands.test.ts` (30) unchanged and green (mutations already route
  through shared commands; the new suite only proves the DOM affordances dispatch them).
- **Jest-verify every count in the SoT** (house rule; loose counts were caught in Waves T & U).

---

## 8. Interaction · focus · a11y · performance

- **Focus:** deterministic via `computeSurvivorFocus` (see §6). Persistent focus treatment survives DOM
  focus moving into nested fields.
- **Re-render churn (the #1 real risk):** `React.memo` the card, pass **primitive ids** not fresh
  objects, `useCallback`/`useMemo` for handlers/derived arrays, `useDeferredValue` for live validation
  (the ED2 badge pattern). Editing one field must not re-render all cards.
- **Large forms (~61 q):** collapsed cards are **fixed-height** (only the single focused card is tall) so
  `@tanstack/react-virtual` can drop in later without re-architecture; section-collapse is the primary
  length-tamer now. **Virtualization is a staged follow-on, not v1.**
- **a11y:** section landmarks + labels; SR reorder announcements (dnd-kit `announcements`, naming the
  question label not the uid); ≥24px hit targets; text+icon badges; keyboard reorder + "Move to section…"
  as the non-drag path.

---

## 9. Top risks

1. **In-card inspector → tall focused cards fight windowing/focus math.** Mitigation: fixed-height
   collapsed cards + only-one-focused + defer virtualization (§8).
2. **Re-render churn** (§8) — the most likely actual bug.
3. **Nested-card visual awkwardness** (an inspector card inside a card). Mitigation: header-suppressing
   wrapper; escalate to Path B only if it reads badly.
4. **Losing side-by-side compare** vs the three-pane. Mitigated by always-visible summary badges + the
   read-only Logic Map drawer for show-if relationships.
5. **Parity divergences** (default tab, focus-persistence across tab switches) must be per-mode `[single]`
   tests, never cross-asserted, or the frozen transcript breaks.

---

## 10. Kill switch / rollout

Ship dark behind `WAVE_ED6_SINGLE_COLUMN_ENABLED` (default-OFF). Merge → flip the flag + **redeploy**
(Vercel env needs a redeploy) → internal walk on a throwaway `walk-*` template (add/edit/section
CRUD/move/publish) → keep or kill. Kill = flag off + redeploy → byte-identical fallback. Flags never
touch persisted data.

---

## 11. ADR candidate (decide at grill)

**"Single-column form builder supersedes the three-pane as the default authoring surface."** It is
flag-reversible (so not irreversible), but it is a **surprising direction reversal** of ED4/ED5 that a
future reader will question — a good candidate for a short ADR recording *why* (live-review usability
rejection of the three-pane; Google-Forms simplicity mandate). Confirm during `/grill-with-docs`.

---

## 12. Open questions resolved in brainstorm / carried to grill

**Resolved:** direction (D1), scope incl. Sections-fold-in (D2), Advanced-as-one-region (D5), Path A
reuse (D8), per-section collapse (D9), three-pane kept-as-fallback (D11).

**Carry to grill:** (a) ADR yes/no (§11); (b) whether v1 includes cross-section **drag** or ships the
explicit "Move to section…" picker only (drag is fluid but fragile across a scrolled list); (c) exact
"Build" default-tab behavior vs `?tab=` back-compat; (d) whether the header should surface a "Preview as
respondent" affordance distinct from Test Mode.

---

## 13. Gate status

**DRAFT — brainstorm done.** No code. Next: `/grill-with-docs` (pressure-test D1–D12 + carry-to-grill
items) → `/co-validate` (real Codex) → **explicit user approval** → `writing-plans` (per-task TDD plan,
grouped into revertible PR-units) → subagent-driven TDD build. Per the gated-wave rule, catalog decisions
here are provisional, not build instructions.
