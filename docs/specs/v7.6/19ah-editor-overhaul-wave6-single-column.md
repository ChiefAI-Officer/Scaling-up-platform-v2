# Wave ED6 — editor-overhaul single-column form builder — DESIGN (DRAFT)

> **Status:** LAUNCHED (2026-07-15) — PR #186 merged to `main` (`8e9fdd79`); `WAVE_ED6_SINGLE_COLUMN_ENABLED=1`
> on Vercel Production + prod redeploy `5rrern1yr` Ready (aliased `platformtest.scalingup.com`); single-column
> is now the default editor (wins over the live ED4 flag). Kill = flag off + redeploy → byte-identical fallback. Brainstorm + grill + co-validate (real Codex
> GPT-5.5 + own 4-lens) + TDD build (16 commits; PR-A + T4 subagent-reviewed, T5–T15 inline under an account
> session limit) all complete. Frozen ED3 guard 15/15 + ED4 parity 20/20 green throughout; editor sweep 38
> suites / 403; `CI=true next build --turbopack` + eslint clean. Grill outcomes in §14; **co-validate
> outcomes in §15 — §15 supersedes §14 and any conflicting inline text.**
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
  - Note: the "Scoring & Tiers" tab (template-level *global* tier bands) stays separate; per-question
    Advanced holds **findings + show-if + slider scale**, not scoring (only sliders are scored — §15).
- **D3 — Card anatomy: one component, three visual states** — collapsed (resting) / expanded-basic
  (focused) / expanded-advanced. Exactly one card focused at a time
  (`model.selection.focusedQuestionUid`). Focus is a persistent visual treatment (left accent stripe +
  elevation), independent of DOM focus. **[default]**
- **D4 — Collapsed = a fixed-height one-line summary:** drag handle (on hover/focus, ≥24×24px), position
  + type badge, truncated prompt, **state badges** (`Findings`, `Show-if`; warnings
  `Required`, `Unassigned` — **no per-question `Scored` badge**: all sliders score automatically, §15) that
  are **text+icon, never color-only**, and a kebab (Duplicate · Delete ·
  Move to section…). A plain slider shows **no** badges → reads identically to Google Forms. **[default]**
- **D5 — Advanced config lives inside the focused card (decision A, §15).** The expanded card body **is**
  the re-hosted `QuestionInspector` (bare chrome) — there is **NO separate "basic editor" layer** (that
  would duplicate its controls, Codex C1). It shows label/type/options inline (Forms-like) with **findings**
  and **show-if** as its existing collapsible sub-panels, plus per-type scale/range. **Only the focused card
  mounts the inspector.** Per-question config is **findings + show-if + slider scale — NOT "scoring
  tier-bands"**: only SLIDER_LIKERT is scored (verified `scoring.ts:1356–1457`), and template-level tier
  bands stay in the separate "Scoring & Tiers" tab. **[decision A]**
- **D6 — Live preview built into the card.** The card's answer area renders the **real** `QuestionInput`
  widget (editor doubles as preview, like Forms). Preview state is **throwaway-local** (no model/mutation
  prop → structurally cannot persist), keyed on `` `${uid}:${shapeSignature(q)}` ``, and uses a
  **distinct `idPrefix` (`"col-q-"`)** so its DOM ids never collide with the in-card `FindingsPreview`
  widget. The whole-instrument **Test Mode** (`TestModeDrawer`) stays a header button + slide-over,
  verbatim. **[default]**
- **D7 — Sections inline.** Sticky tinted header band (`role="group"` + `aria-labelledby`) with the ED5
  labeled/total counter, a collapse caret, and a section kebab (rename · add question · move up/down ·
  **cascade delete**). Create/rename/reorder/delete route through the existing shared commands; **cascade
  delete uses the atomic `deleteSection` (never the orphan-leaving legacy path)**. Within-section reorder
  ships as drag (dnd-kit) + keyboard; **cross-section move ships as the explicit "Move to section…" picker
  only in v1** (reliable + testable), with cross-section **drag as a fast-follow** (grill Q1) — both call
  `moveQuestionToSection`. Section reorder = arrow up/down (matches today's inline outline; section drag is
  a later nicety). Contextual "＋ Add question" inserts **below the focused card**, not at
  the end. Empty section = dashed "Add question" drop-zone + focus landing spot; empty instrument =
  centered "Add your first section/question" CTA. **[default]**
- **D8 — Reuse Path A: re-host `QuestionInspector` in-card.** Mount the existing inspector inside the
  expanded card's Advanced region (it is already fully props-controlled and surface-agnostic — mounted
  this exact way by `ThreePaneWorkspace`). **Grill-verified:** the inspector renders BOTH its own
  `<header>` ("Edit Question — {key}") AND its own outer `wf-card` `<section>` chrome, and **neither is
  suppressible today** — so D8's one genuine code change is a single **additive boolean prop** (e.g.
  `bare`/`hideChrome`, default `false` → byte-identical) that drops both so it sits flush in the card, plus
  updating tests that assume a single `questions-config-form` node (now one per card). **Do NOT** extract
  the private `FindingsPanel`/`ShowIfPanel`/`FindingsPreview` sub-panels for v1 (Path B lifts ~250 lines of
  confirm-orchestration for no v1 payoff). **[default]**
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
`QuestionInput` (preview) + the re-hosted **bare** `QuestionInspector` as the card body — the inspector
itself provides type/label/options inline plus its collapsible findings/show-if (decision A, §15); there is
no separate basic-editor layer. All mutations call `model` commands; nothing is mutated locally.

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
- **Single-column gets its OWN focused suite — do NOT force it through the legacy cross-assert harness
  (co-validate C5 + own lenses, §15).** Cross-asserting `single≡off` on DOM/UI would cage the redesign to
  legacy markup. Instead: (a) leave the 2-mode parity harness untouched; (b) a new single-column suite
  asserts each DOM affordance dispatches the correct model command (add/delete/duplicate/reorder/move/
  section-CRUD) + spot-checks 2–3 author-action→save-payload flows (payload parity is fine, DOM parity is
  not); (c) a **render-count assertion** (editing card A must not re-render card B). Single-column cards
  **must emit `question-card-*` + `drag-handle-*` test-ids** so the existing `installDndLayout()`
  keyboard-reorder stub drives them.
- **New mode-aware authoring helpers** keyed off the new DOM test-ids; drive reorder via the **keyboard
  sensor** (jsdom can't dispatch dnd-kit PointerEvents); keep the `installDndLayout()` rect stub.
- **New flag-branch-pick test**: flag ON ⇒ single-column mounts/relabels; OFF ⇒ byte-identical fallback;
  plus a11y landmarks + responsive classes. The ED3 byte-equivalence guard stays **flag-OFF and green**
  (it never sets the flag; ED4's identical default-tab swap left it green — §15); the new coverage is this
  flag-branch-pick test, **not** a guard edit. The tab **id** must stay literal `"questions"`.
- `question-commands.test.ts` (30) + `ed5-round-trip.test.ts` (2) unchanged and green (mutations already
  route through shared commands; the new suite only proves the DOM affordances dispatch them). Baseline
  counts (jest-verified): byte-equivalence **15**, parity **20**, three-pane-flag **5**.
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

**DECIDED (grill Q2): write ADR-0024** — "Single-column form builder supersedes the three-pane as the
default authoring surface." Flag-reversible (so not code-irreversible), but a **surprising direction
reversal** of ED4/ED5 that a future reader will question. The ADR records *why* (live-review usability
rejection of the three-pane; Google-Forms simplicity mandate) and the trade-off (three-pane side-by-side
density vs one-column simplicity).

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

**DRAFT — brainstorm + grill done.** No code. Next: `/co-validate` (real Codex) → **explicit user
approval** → `writing-plans` (per-task TDD plan, grouped into revertible PR-units) → subagent-driven TDD
build. Per the gated-wave rule, catalog decisions here are provisional, not build instructions.

---

## 14. Grill outcomes (2026-07-15)

Grill decisions (Q1–Q3) + code-grounded verification (a background pass read the real editor). These
**supersede** any conflicting inline text above.

**Decisions**
- **Q1 — cross-section move:** v1 = within-section drag + a "Move to section…" picker for cross-section
  moves; cross-section **drag** is a fast-follow. Section reorder = arrows (matches today's inline outline).
- **Q2 — ADR:** YES → **ADR-0024** (three-pane → single-column reversal).
- **Q3 — tab label:** **"Build"** (the tab *id* stays the literal `"questions"`).

**Code-verified (all confirm the design; refinements folded in)**
1. **Seam/flag (D10):** the 3-way seam is a ~few-line additive edit at `TabbedShell.tsx:649`; new
   `singleColumnEnabled` prop + `wave-ed6-flags.ts`. **Hard rule:** the tab **id** must stay the literal
   `"questions"` — renaming it breaks `?tab=` bookmarks *and* the ED3 guard. Only the display label changes.
2. **Sections fold-in (D2):** no author capability lost — the inline outline already does
   add/rename/arrow-reorder/cascade-delete/count. Only *section drag-reorder* is net-new (deferrable). Must
   preserve the serialization round-trip (`description`/`partLabel`/`domain`/positional `sortOrder`).
3. **Published/inherited locks (§6):** reused **verbatim** — consume the shared `model` + pass-through
   `isReadOnly`/`isUnlocked`/`publishedOptionKeys` + baked `question.isInherited`. **Must NOT** call the
   model hook twice or re-derive locally (breaks flag-OFF byte-identity + anti-drift).
4. **Inspector re-host (D8):** the one genuine code change is a single **additive `bare`/`hideChrome` prop**
   on `QuestionInspector` that drops its self-rendered `<header>` + outer `wf-card` `<section>` (byte-
   identical when omitted; not a fork), plus updating tests that assume a single `questions-config-form`
   node (now one per card).
5. **Parity harness (§7):** the "3rd mode, no new golden strings" claim holds, but effort is a notch
   heavier — widen the MODES `key` union to `"single"`, thread `singleColumnEnabled` through the fixtures
   (`fixtureA`/`fixtureMC` signature change), add an explicit `cap.single≡cap.off` assert per
   cross-asserting scenario, and single-column cards must emit `question-card-*` + `drag-handle-*` test-ids
   for the `installDndLayout()` reorder stub. Baseline counts (jest-verified): byte-equivalence 15,
   parity 20, three-pane-flag 5, question-commands 30, ed5-round-trip 2.

---

## 15. Co-validate outcomes (2026-07-15)

Real Codex (GPT-5.5, thread `019f6477`) + my own 4-lens review (3 lenses completed; the correctness lens +
synthesis were lost to an account session limit and reconciled inline). Both converged on the
inspector-monolith issue. **§15 supersedes §14 and any conflicting inline text.**

**Load-bearing decision — the user chose A.** The existing `QuestionInspector` is a single ~1,400-line
interwoven form (label/type/options AND findings/show-if together), so the original "separate basic fields
+ one tidy 'Advanced' box" (old D5) is not cheaply buildable and would duplicate controls (Codex C1).
**Decision A:** the expanded card body **is** the re-hosted bare inspector — no separate basic layer;
findings/show-if are its existing collapsible sub-panels; **only the focused card mounts it**. Keeps ~90%
reuse, stays Forms-clean. (Alternatives weighed and set aside: B bottom-sheet; C invest in a shared
`QuestionEditorForm` split — a follow-on only if the focused card reads busy after the launch walk.)

**Accepted — folded into the spec:**
1. **Scoring language corrected (Codex C2, verified `scoring.ts:1356–1457`):** only SLIDER_LIKERT is scored;
   NUMBER/TEXT/MULTI_CHOICE are not. Per-question Advanced = **findings + show-if + slider scale**, NOT
   "scoring tier-bands." Dropped the per-question `Scored` badge; template-level tier bands stay in the
   "Scoring & Tiers" tab. (D4, D5.)
2. **Sections routing (Codex C3):** flag-ON removes the Sections trigger + panel; `?tab=sections` resolves
   to the Build tab (no orphaned/hidden tab). (D2/D10.)
3. **Contextual insert (Codex C4):** "insert below the focused card" is NOT verbatim — `addQuestion`
   appends. Add an optional `targetIndex` to the command (or a tested add-then-reorder). (D7/§5.)
4. **Testing (Codex C5 + own lenses):** do NOT generalize the legacy parity harness to a 3rd cross-asserted
   mode — give single-column its own focused wiring suite + a flag-branch-pick test + a render-count
   assertion; keep the ED3 byte-equivalence guard strictly flag-OFF (NOT "extended" — the grill note
   over-corrected). (§7.)
5. **Don't duplicate glue (own simplification lens):** the new card-list surface should **share** the
   drag/move/cascade-confirm/`computeSurvivorFocus` glue with `EditorOutline` (a shared hook/module, or a
   full-width expandable variant) — never copy it. Plan decides extend-vs-shared-hook. (§5.)
6. **Re-render churn (own risk lens):** hoist per-card derived data (badges, showIfGates, dependent counts)
   into ONE `useMemo` → `Map<uid, CardViewModel>`; pass cards a primitive id + their slice + stable
   `useCallback(uid)` handlers. Do NOT copy `EditorOutline`'s per-row inline lambdas / O(n²)
   `findShowIfDependents`. (§6/§8.)
7. **Single `activeAuthoringMode` (own risk lens):** derive one `single | three | legacy` value at the
   shell feeding BOTH the body seam AND the label/default-tab (single-wins in one place). (D10.)
8. **Three-pane framing (own lenses):** three-pane is the **current live prod default**, NOT a rollback
   rung — the kill switch (D12) falls back to the byte-identical legacy `QuestionsTab`. Keep three-pane
   until **cross-section drag** lands in single-column (the picker is v1-sufficient but not equivalent — a
   logged capability regression, ADR-0024). Commit a **named retirement trigger**: on ED6 launch (flag ON
   in prod), the immediate follow-on removes `ThreePaneWorkspace` + its flag + the seam branch. (D11/D12/ADR.)
9. **Dropped "Preview as respondent"** (carry-to-grill d) — redundant with in-card live preview + Test Mode.
10. **Card states:** two (collapsed / expanded) + a nested disclosure — not a 3-state machine. (D3.)

**Overridden:**
- Keeping the standalone Sections tab in v1 (own simplification lens) — **overridden**: the user chose to
  fold it in (D2), and the grill verified inline section management already fully exists in `EditorOutline`,
  so folding in adds no risk.

**Not changed (both reviews agreed sound):** single-column direction, the flag / 3-way seam, sections
inline, the ADR-0024 reversal rationale, cross-section move = picker in v1.
