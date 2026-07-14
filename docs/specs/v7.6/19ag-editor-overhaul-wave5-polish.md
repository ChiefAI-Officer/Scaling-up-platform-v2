# Wave ED5 — editor-overhaul polish (arc close-out) — DESIGN

> Status: DRAFT (brainstorm + grill-with-docs + /co-validate DONE; awaiting user approval).
> Gated wave. NO code until user approval lands.
> /co-validate (real Codex GPT-5.5, thread `019f6066`) + own independent review: 6 findings accepted,
> 1 (cross-section drag) surfaced to the user who chose to KEEP it hardened. See changelog at end.
> Spec prefix `19ag` (design here; implementation plan → `19ag-plan-wave5-polish.md` via writing-plans).

## Goal
Close the five-wave editor-overhaul arc (ED1 Test Mode → ED2 Safe-to-Publish → ED3 extract-hooks →
ED4 three-pane → **ED5 polish**) by resolving **every** item the ED4 post-launch audit
(`19af-ed4-postlaunch-audit.md`) surfaced — 3 polish (bucket A), 5 feature candidates (bucket B),
4 nice-to-haves (bucket C) — so nothing is left open. The user chose **maximal — close everything**.

## Audience / posture
ADMIN/STAFF only (~3 internal expert authors, desktop). Coaches never see this editor. Alpha mode,
no real end users. The three-pane "Edit" workspace is live on production behind
`WAVE_ED4_THREE_PANE_ENABLED=1`.

## Safety / flag model (the crux)
W5 splits cleanly into two halves:

1. **Flag-on three-pane polish** — everything that lives *inside* the flag-on `ThreePaneWorkspace`
   (A-1 auto-focus, A-2 counter, B-1 badges + logic drawer, B-2 section CRUD, B-3 move UI + drag,
   B-4 inspector-preview keying, all of bucket C except the two below). **Rides the existing
   `WAVE_ED4_THREE_PANE_ENABLED` flag** — kill = flag off + redeploy → byte-identical legacy
   `QuestionsTab`. **No new flag.**
2. **Flagless shared changes** (kill = revert commit; they persist through an ED4-flag kill):
   - **B-5 tier-band bar** — Scoring & Tiers tab, an additive visual layer over the existing
     number-input `TierTable` (which stays fully functional). Not part of the three-pane.
   - **Global cascade section-delete** — the new `deleteSection` command routes BOTH the outline and
     the legacy Sections tab (fixes the latent orphan bug; see B-2b). Behavior change on a
     flag-independent surface — called out explicitly.
   - **Domain-aware client tier validation** — wiring the exported `validateTierTiling` client-side.
   - The `moveQuestionToSection` command + the `collapse` slice added to `useEditorSelection` sit on
     the model but are consumed ONLY by the flag-on outline, so a flag kill removes their UI; the
     unused command/slice is inert.

Flag-off byte-identity of the Questions surface is preserved by construction (W5 does not change
question add/dup/delete/reorder semantics), pinned by the frozen ED3 guard (15) + the ED4
parameterized parity suite (19).

**Honest rollback (co-validate C5).** Flipping `WAVE_ED4_THREE_PANE_ENABLED` off restores ONLY the
Questions authoring surface; the flagless half (cascade section-delete, tier-band bar + client tier
validation) **stays active** on the Sections + Scoring tabs. There is no single "undo W5" lever. To
make each flagless piece independently reversible, land the wave as **~3 separate PRs**, each a
coherent revert unit:
  - **PR-A (three-pane polish + shared model, flag-gated UI):** A-1/A-2/A-3, B-1, B-2 (outline CRUD),
    B-4, bucket C, `moveQuestionToSection` command + explicit control, the `deleteSection` command,
    `collapse` slice, focus-rule helper. Kill = ED4 flag off + redeploy (UI gone; the two commands sit
    inert). Note: `deleteSection` is wired to BOTH surfaces here (see PR-B split below).
  - **PR-B (global cascade wiring — flagless):** route the legacy Sections tab through `deleteSection`
    + its updated confirm/test. Isolated so the Sections-tab behavior change can be reverted alone
    without touching the three-pane. (The command itself lands in PR-A; PR-B only flips the Sections
    tab's call site.)
  - **PR-C (tier-band bar + domain-aware client validation — flagless):** Scoring tab only. Revertible
    alone.
  - **PR-D (cross-section multi-container drag — flag-gated, highest risk):** isolated so a stuck or
    regressing dnd restructure can't block the rest of the arc close (co-validate C4 / own M4; kept
    per user decision, hardened per below).

## Locked design (brainstorm + grill-with-docs)

### A — polish
- **A-1 Cold empty landing.** Auto-focus the first question of the first section, **in the controller
  (`TemplateEditorController`), once on mount**, guarded on `focusedQuestionUid === null` and
  `threePaneEnabled` and `questions.length > 0`. Fires exactly once (the controller mounts once and
  survives tab switches), so it never clobbers a persisted focus on Edit-tab re-entry. Empty templates
  keep the empty state.
- **A-2 authoring-completeness counter.** Restore the per-section fraction the legacy `QuestionsTab`
  showed, using **authoring-appropriate wording — "N/total labeled" (not "answered")** (own M6):
  "labeled" = questions with a non-empty label. "Answered" is respondent vocabulary and would confuse
  authors. Replaces `EditorOutline`'s raw question count.
- **A-3 canvas/preview stale state.** Resolved by B-4 — key BOTH the canvas and the inspector preview
  by `uid + shapeSignature` (co-validate C1: `key={uid}` alone would NOT reset a stale sample when the
  focused question's type/options/scale change).

### B — features
- **B-1 Show-if visibility.** (a) Outline **row badges**: "conditional" (has a `showIf`) and "gate
  (N)" (N questions depend on it, via the shared `findShowIfDependents`). (b) A read-only **logic-map
  drawer** listing each relationship in plain language
  (`'<dependent label>' shows only when '<gate label>' = '<option label>'`). Reuse the drawer chrome by
  **extracting a shared Drawer shell from `TestModeDrawer`** (or an existing UI primitive) rather than
  building a second bespoke drawer (own M6). Trigger button in the
  **outline toolbar** (flag-on workspace only — never the shared header; preserves the single-shell
  kill guarantee). Badges + drawer render only when `conditionalEnabled` (Wave W flag), matching the
  inspector's ShowIf panel + `computeShowIfGates` gating. Editing stays per-question in the inspector.
- **B-2 Section CRUD in the outline.** `+ Add Section` at the tree top; inline-rename section headers;
  drag + keyboard reorder of section headers (same idiom as question rows); delete. All route through
  the existing model commands (`handleSectionsAdd/Rename/MoveUp/MoveDown/Reorder`) plus the new
  `deleteSection` (B-2b). The outline becomes a complete authoring surface; the Sections tab remains a
  redundant-but-valid alternate view.
- **B-2b Cascade section-delete (global).** Deleting a NON-EMPTY section removes the section AND all
  its questions after a strong aggregated confirm that (i) enumerates the inherited keys being deleted
  and states the three Wave-T consequences ONCE (trend history ends · locked Esperto import crosswalk
  refuses · peer benchmarks pruned), and (ii) names the count of freed EXTERNAL show-if dependents
  (questions outside the section that gate on a to-be-deleted question → become always-visible; each
  run through the shared show-if cleanup, co-validate C2). Empty sections just delete. New command
  `deleteSection(uid) → { removedSectionKey, removedQuestionUids, affectedDependentUids }` +
  shared prompt builder `buildSectionDeletePrompt(...)`. **Global**: both the outline and the legacy
  Sections tab call it (one behavior; fixes the orphan bug where a dropped section stranded questions
  with a dangling `sectionStableKey`). Updates the existing Sections-tab delete confirm text + its test.
   **Integrity does NOT depend on the confirm dialog (co-validate C3):** the cleanup (removing the
   questions + clearing external show-if dependents) runs ATOMICALLY inside `deleteSection` (one
   `setState`), never in the confirm handler — a caller that skips the dialog still can't leave a
   dangling state. **Defense-in-depth:** the save serializer + the publish gate INDEPENDENTLY reject
   any question whose `sectionStableKey` names a missing section AND any `showIf.questionKey` that
   references a deleted key, so no bypass path can persist a corrupt draft. **Inherited removal is
   PHYSICAL deletion from the draft, not a tombstone** — consistent with ADR-0020 (a deleted-then-
   recreated key becomes a new `_2` suffix series; trend history never silently resurrects). Recorded
   in ADR-0023.
- **B-3 Cross-section question move.** New command
  `moveQuestionToSection(uid, targetSectionKey, targetIndex?)` (sets `sectionStableKey`, resequences
  `sortOrder` in the source + target sections). Two entry points, both through this one command:
  - **Explicit "Move to section…" control** on each question row (accessible, keyboard-friendly;
    appends to the target section's end).
  - **Cross-section drag** — requires restructuring `EditorOutline`'s drag layer from N per-section
    `DndContext`s into **one multi-container `DndContext`** (single `onDragEnd` deciding
    move-vs-within-reorder, `onDragOver` to cross containers, empty sections as drop targets). The
    within-section reorder command semantics stay identical. **This is the wave's highest-risk task**
    (own test surface; flagged for co-validate + extra adversarial testing).
    - **Kept over both reviews' advice, hardened (co-validate C4 / own M4).** Codex + the independent
      review both recommended shipping only the explicit control and deferring the drag; the user chose
      to keep the full restructure. Hardening: (a) extract the drop-resolution as a PURE function
      `resolveOutlineDrop(active, over, containers) → {kind:'reorder', sectionKey, order} |
      {kind:'move', uid, targetSectionKey, index}` with exhaustive unit tests (jsdom cannot drive real
      dnd-kit pointer drag, so the decision logic must not live behind the pointer machinery); the
      dnd-kit wiring stays thin and calls the existing `reorderQuestions` / new `moveQuestionToSection`
      commands. (b) The ED3 byte-equivalence guard + ED4 parity suite (which exercise within-section
      keyboard reorder through the outline) MUST stay byte-green after the restructure. (c) Lands in its
      OWN PR (PR-D) so a stuck/regressing dnd change can't block the arc close.
  - show-if stays **permissive**: a move that puts a gate after its dependent is caught by the existing
    publish gate (`checkShowIfIntegrity` + routed modal), matching Wave W — not blocked at move time.
  - **B-3 inherited wrinkle:** moving an INHERITED question is **allowed with a warning**
    (`buildMoveQuestionPrompt`, parallel to the delete prompt). The join identity is safe — `stableKey`
    is derived at first save then immutable (ADR-0020), so trends/crosswalk/benchmarks (which join on
    `stableKey`, not section) are untouched, and the server PATCH does not police `sectionStableKey`.
    The warned consequences: the key keeps its original-section prefix, and report grouping + per-domain
    scoring (`section.domain`) reassign the question to the new section from the next published version
    (past versions pinned by ADR-0016). Consistent with ADR-0020's "warn, don't block" stance for
    inherited structure edits. → ADR-0023.
- **B-4 Reconcile the double widget — two widgets, distinct roles.**
  - **Canvas** = pure respondent preview ("how a respondent sees it"); NO findings readout.
  - **Inspector "test-a-value" preview** = clearly relabeled "test which finding fires", and **keyed by
    `uid + shapeSignature(type, options.length, scale)`** — the SAME reset policy the canvas uses
    (co-validate C1). Resets its throwaway `sample` on focus change AND when the focused question's
    widget shape changes; today it persists and can bleed a value across questions/shapes.
  - **DRY:** unify the two near-duplicate draft→widget mappers (`QuestionCanvas.toForInput` +
    `QuestionInspector.FindingsPreview.forInput`) into ONE shared helper `toQuestionForInput(draft,
    opts)` with `opts` for the two intentional divergences (canvas: real `isRequired`, label fallback
    "(no label yet)"/key fallback `__canvas__`; preview: `isRequired:false`, label fallback
    "Sample answer"/key fallback `__preview__`). Both widgets stay on screen (per grill B-4 choice).
- **B-5 Drag-to-set tier bands.** A visual band bar with draggable + keyboard-movable dividers ABOVE
  the existing number-input `TierTable` (which stays for precision + a11y). Dragging a shared divider
  moves the boundary between two adjacent tiers using the CANONICAL boundary rule (co-validate C2):
  **fractional mode → `upper.minMetric = lower.maxMetric` (touching); integer mode →
  `upper.minMetric = lower.maxMetric + 1` (no inclusive overlap).** Setting them equal in integer mode
  (my original wording) would overlap inclusive bands — wrong. The bar and `validateTierTiling` MUST
  share ONE canonical boundary-conversion helper (bar-position ↔ tier min/max) so the visual and the
  validator can never disagree; snapping uses that helper (integer step 1 / fractional metric step).
  **Dynamic-domain behavior (own M3):** the metric domain shifts as questions are added/removed. When
  the domain shrinks below an existing boundary, the bar renders the out-of-domain divider CLAMPED to
  the domain edge and the (now live, see rider) validator flags "tiers don't span the domain"; tier
  VALUES are never silently rewritten (author fixes them). If no scorable/slider questions exist yet
  (metric N/A), the bar is not shown (falls to the finite gate below).
  Covers **global + per-domain** tiers (the shared `TierTable` makes both nearly free).
  Domain bounds: export `computeGlobalTierDomain` (currently un-exported; one line) for global; reuse
  the already-exported `computePerDomainTierContexts` for per-domain. **Bar shown only when
  `domain.max` is finite**; for open-ended-max surfaces (e.g. `overallTotal`, open per-domain ranges),
  show the number inputs alone with a small "visual bar unavailable for this metric" note. The top tier
  that omits `max` renders as an open arrow when the domain IS finite.
  - **Rider:** wire the exported domain-aware `validateTierTiling(tiers, domain)` into the client so
    "tiers don't span the domain" shows LIVE (today the client checks only internal contiguity and the
    domain-span error surfaces only at publish — the known Wave V tier-domain publish-vs-runtime gap).

### C — nice-to-have / polish
- **Canvas cues:** a small "Preview only — answers here aren't saved" hint; re-key the canvas on
  `uid + shapeSignature(type, options.length, scale)` so an inspector edit that changes the widget
  SHAPE (type/options/scale) remounts it and drops a now-invalid throwaway value (the inspector preview
  uses the identical `uid + shapeSignature` policy — B-4/co-validate C1);
  `scrollIntoView({ block: "nearest" })` on the focused outline row + canvas on focus/add/duplicate.
- **Collapse persistence:** lift the section-collapse slice out of `EditorOutline`'s local `useState`
  into `useEditorSelection` so it survives the Edit-tab unmount/remount (today focus persists but
  collapse resets — the audit's inconsistency).
- **A11y cluster:** move DOM keyboard focus per the neighbor-then-DOM rule (see below); keyboard-reorder
  live-region announcements read the question KEY/LABEL, not its random uid; add landmark labels to the
  three panes (outline / question preview / inspector) and name the canvas region; fix the outline row
  `aria-label` so it stops hiding the visible label/type and stops duplicating `aria-current`; take the
  pointer-only slider tap-to-set ticks out of the screen-reader virtual cursor.
- **Widen outline column:** relax the `lg:grid-cols-[20%_50%_30%]` to a `minmax(...)` (e.g.
  `minmax(14rem, 22%)_1fr_30%`) so the 20% column isn't cramped; keep the `< lg` stack; verify/adjust
  the responsive-grid parity assertion (with rationale if the pinned class string changes).
- **DRY mappers:** unified in B-4.

### Focus rule (A + B + C, one shared helper)
- **Add / Duplicate** → model-focus the new question (the command returns its uid) + move DOM focus to
  its outline row.
- **Delete / Cascade** → model-focus the nearest survivor (next question in section, else previous, else
  the nearest remaining section's first question, else `null` when the template is empty) + move DOM
  focus to that row, or to the `+ Add` control when none remain.
- One shared survivor helper computes the target; keeps the canvas populated and fixes the
  focus-to-page-top a11y bug.

## Architecture
```
TemplateEditorController
  ├─ model = useTemplateEditorModel(props)     // + collapse slice on useEditorSelection
  ├─ auto-focus-once effect (A-1)              // controller-level, null-guarded
  └─ TabbedShell (single shell — unchanged chrome)
       Questions/"Edit" tab body:
         threePaneEnabled ? <ThreePaneWorkspace/> : <QuestionsTab/>
       Scoring & Tiers tab:
         <ScoringTiersTab> + TierTable now renders <TierBandBar/> (B-5, flagless)

ThreePaneWorkspace (flag-on)
  ├─ EditorOutline    // section CRUD (B-2), move control + multi-container dnd (B-3),
  │                   // row badges + logic-drawer trigger (B-1), answered/total (A-2),
  │                   // collapse via model, focus rule, a11y, wider column
  ├─ QuestionCanvas   // pure respondent preview; re-keyed on uid+shapeSignature; "preview only" hint
  └─ QuestionInspector// "test which finding fires" preview keyed by uid; shared mapper (B-4)

New model commands: deleteSection (cascade, global), moveQuestionToSection.
New shared builders: buildSectionDeletePrompt, buildMoveQuestionPrompt, shared survivor helper,
                     toQuestionForInput (unified mapper).
New component: TierBandBar (Scoring tab). New drawer: LogicMapDrawer (outline).
Exports: computeGlobalTierDomain (scoring.ts).
```

## New / touched files (indicative — final list in the plan)
- MOD `hooks/useEditorSelection.ts` — add collapse slice.
- MOD `hooks/useTemplateEditorDraft.ts` — `deleteSection` cascade + `moveQuestionToSection`; change
  `handleSectionsDelete` to route through cascade (global).
- MOD `question-commands.ts` — `buildSectionDeletePrompt`, `buildMoveQuestionPrompt`, survivor helper,
  `toQuestionForInput` (or a new `question-widget-mapper.ts`).
- MOD `EditorOutline.tsx` — section CRUD, multi-container dnd, move control, badges, logic-drawer
  trigger, answered/total, collapse-via-model, focus rule, a11y, column width.
- NEW `LogicMapDrawer.tsx` (outline).
- MOD `QuestionCanvas.tsx` — shared mapper, re-key on shape signature, preview hint, scroll-into-view.
- MOD `QuestionInspector.tsx` — FindingsPreview keyed by uid + relabeled + shared mapper.
- MOD `TemplateEditorController.tsx` — auto-focus-once effect.
- MOD `SectionsCard.tsx` — route delete through cascade; update confirm wording.
- MOD `ScoringTiersTab.tsx` + NEW `TierBandBar.tsx` — visual bar + domain-aware client validation.
- MOD `src/lib/assessments/scoring.ts` — export `computeGlobalTierDomain`.
- NEW ADR `docs/adr/0023-cross-section-move-and-cascade-section-delete.md`.

## Task shape (subagent-driven TDD — detailed in the plan)
~13–15 tasks. Highest-risk two flagged for co-validate + extra adversarial testing:
1. Multi-container dnd restructure (B-3 drag).
2. Tier-band bar (domain-bounds math, snapping, finite/open gating, keyboard).
Sketch: T1 unified mapper + inspector preview keying (B-4/A-3/DRY) · T2 collapse-lift + auto-focus
(A-1/C) · T3 answered/total + a11y + column width (A-2/C) · T4 `deleteSection` cascade command +
prompts (both surfaces) · T5 `moveQuestionToSection` command + explicit control + inherited warn ·
T6 multi-container dnd (drag: within + cross) · T7 section CRUD in outline (add/rename/reorder/delete) ·
T8 row badges · T9 logic-map drawer · T10 focus rule helper wiring (add/dup/delete/cascade) · T11
canvas cues (shape re-key, hint, scroll) · T12 export domain fn + client domain-aware validation ·
T13 TierBandBar global · T14 TierBandBar per-domain · T15 close-out (sweep, build+eslint, adversarial
review, ADR-0023, SoT, Notion).

## Verification
- `CI=true npx next build --turbopack` green; `npx eslint` clean on changed files.
- Frozen ED3 byte-equivalence guard (15) + ED4 parameterized parity suite (19) stay green (W5 does not
  change question add/dup/delete/reorder semantics). The single intentional cross-surface behavior
  change (Sections-tab cascade-delete) updates its existing test with rationale + adds cascade coverage.
- New dedicated suites: `deleteSection` cascade (incl. inherited enumeration + external-dependent
  cleanup, both surfaces) · `moveQuestionToSection` (incl. inherited warn + sortOrder resequencing) ·
  multi-container dnd (within + cross) · row badges + logic map · unified mapper + preview keying ·
  focus-rule survivor helper · canvas shape re-key · TierBandBar interaction (global + per-domain,
  finite + open) · client domain-aware tiling validation · auto-focus-once · collapse persistence.
- **Round-trip persistence tests (co-validate C6 / own M2)** — the paths that can silently corrupt a
  draft, tested through the serializer + re-hydration (build-version-payload → PATCH body → hydrate),
  not just at the component/model layer: **cascade-delete → save → reload** (no dangling
  `sectionStableKey`/show-if survives), **cross-section move → save → reload** (question re-homed with
  correct `sortOrder`, key/prefix unchanged), and **tier edits → publish validation** (domain-span +
  contiguity enforced). Both cascade and move set BOTH the sections + questions dirty flags and are
  covered by a follow-up-save reconciliation test (guards the Wave-T raw-ref class of bug where a
  sections-only follow-up save dropped questions).
- **Pure dnd resolution (own M1):** `resolveOutlineDrop(...)` unit-tested exhaustively (reorder vs move,
  empty-section drop, no-op) independently of dnd-kit pointer machinery.
- Jest-verify all counts from the summary line (never from memory).

## Rollout
- Ship on `main` (merge auto-deploys). Three-pane polish is already live-gated by
  `WAVE_ED4_THREE_PANE_ENABLED=1` — no flag flip needed; the polish appears on merge for the flag-on
  workspace. Flagless bits (tier bar, cascade, client validation) appear on merge.
- Kill: three-pane polish = flip `WAVE_ED4_THREE_PANE_ENABLED` off + redeploy → byte-identical legacy
  tab. Flagless bits = revert commit.
- SoT (CLAUDE.md anchor + CHANGELOG entry `wave-ed5-*`), Notion task, memory anchors on push.

## ADR-0023 (to write with the build)
"Cross-section question move + cascade section-delete: structure-mutation policy." Records: (1) moving
an inherited question across sections is permitted with a named-consequence warning (join identity
safe; per-domain/report-grouping shift on future versions only); (2) section-delete cascades globally
(both surfaces), fixing the orphan bug. Trade-offs, consequences, cross-links to ADR-0020
(stableKey lock) and ADR-0016 (same-version-only deltas). CONTEXT.md untouched (editor-UI, not domain).

## Grill-with-docs changelog (9 decisions, all resolved with the user)
1. Inherited cross-section move → **allow + warn** (ADR-0020-consistent).
2. Cascade-delete + inherited → **allow, strong aggregated confirm**.
3. Cross-section drag → **full multi-container DndContext restructure this wave** (top risk).
4. Tier-bar open domains → **bar when finite, else inputs-only** + domain-aware client validation rider.
5. Auto-focus → **controller, once on mount** (null-guarded); collapse lifted to `useEditorSelection`.
6. Post-mutation focus → **neighbor-then-DOM rule** (shared survivor helper).
7. Logic-map drawer → **outline-toolbar trigger, gated on conditional flag**.
8. Cascade scope → **global** (both outline + Sections tab; fixes orphan bug; flagless, kill=revert).
9. Docs → **new ADR-0023**; CONTEXT.md untouched.

## Co-validate changelog (real Codex GPT-5.5, thread `019f6066` + own independent review)
6 findings accepted, 1 surfaced to the user (kept, hardened). Both reviews converged.
1. **[Codex C1 — ACCEPTED]** `key={uid}` doesn't reset the preview on type/options/scale change → key
   BOTH canvas + inspector preview on `uid + shapeSignature`. (A-3/B-4/C updated.)
2. **[Codex C2 + own M3 — ACCEPTED]** Tier divider inclusivity bug (`upper.min = lower.max` overlaps
   integer bands) → canonical mode-aware boundary conversion shared by bar + `validateTierTiling`; plus
   dynamic-domain clamp + live error. (B-5 updated.)
3. **[Codex C3 + own M2 — ACCEPTED]** Cascade integrity must be atomic in `deleteSection`, not in the
   confirm; save + publish independently reject dangling `sectionStableKey`/show-if; inherited removal
   is physical (no tombstone, ADR-0020). (B-2b updated.)
4. **[Codex C4 + own M4 — SURFACED, user KEPT (override), hardened]** Both reviews recommended deferring
   the cross-section drag (explicit control covers it, top risk for 3 users). User chose to keep the
   full multi-container restructure; hardened with a pure `resolveOutlineDrop` function, guard-green
   requirement, and its own PR (PR-D). (B-3 updated.)
5. **[Codex C5 + own M5 — ACCEPTED]** Rollback overstated (flag-off doesn't revert cascade/tier/
   validation) → honest rollback statement + ~3 independently-revertible PRs. (Safety/Rollout updated.)
6. **[Codex C6 + own M1/M2 — ACCEPTED]** Add round-trip persistence tests (cascade→save→reload,
   move→save→reload, tier→publish) + a pure dnd-resolution unit. (Verification updated.)
7. **[own M6 — ACCEPTED]** Extract a shared Drawer shell (not a 2nd bespoke drawer); "answered/total"
   → "labeled/total" wording. (B-1/A-2 updated.)
