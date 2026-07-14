# ED4 Three-Pane Editor — Post-Launch Audit & W5 Candidate Backlog

**Date:** 2026-07-14\
**Source:** verified multi-agent audit (`wf_020e403c-51f`) of the *shipped* ED4 three-pane —
5 review dimensions (layout · interaction · a11y · inspector · design-gap) → adversarial
verify per finding → this synthesis. 25 raw findings; 24 verified; **23 confirmed** in-scope
(1 ruled out-of-scope). Verdict spread: **severity** 0 high / 3 medium / 21 low; **category**
1 must-polish / 4 feature / 18 nice-to-have; **effort** 20 small / 4 medium.
Two agents hit a mid-response API error (the `layout` dimension review and one `a11y` verify) —
their gaps are backfilled here from the live launch walk + the surviving cross-dimension findings.

> This is **pre-brainstorm input** for the gated W5 wave, **not** the W5 spec (`19ag`). It is
> to be reconciled with whatever the ~3 admins' keep/kill walk surfaces before W5 is scoped.

## Executive read
The shipped three-pane is **healthy and walk-ready** — the adversarial pass surfaced **no
high-severity must-fix** item; the single "must-polish" call and the four "feature" calls are
all things a polish wave is *for*, not launch regressions. The gate-deletion dependent cleanup
(the co-validate-C2 correctness guarantee) verified **correctly wired**, and the launch-day
row-overlap hotfix verified **structurally sound**. The themes worth W5 attention cluster into
three buckets below. The one genuinely user-visible rough edge for the ~3 authors is the **cold
empty landing** (Edit is now the default tab but nothing is focused); the most interesting design
knot is the **canvas ↔ inspector "double widget"** (same widget on screen twice, with a real
cross-question stale-state divergence in the inspector copy).

## A. Address before / at W5 (highest value, small effort)
1. **Cold empty landing on the new default tab.** With the flag on, "Edit" is the default tab,
   but `useEditorSelection` starts `focusedQuestionUid = null` → authors land on an empty canvas
   ("Select a question to preview it") + empty inspector. The old `QuestionsTab` effectively
   opened on the first question. Fix candidate: auto-focus the first question of the first section
   on mount when nothing is focused. Files: `hooks/useEditorSelection.ts`, `ThreePaneWorkspace.tsx`,
   `TabbedShell.tsx`.
2. **Per-section "answered / total" counter regression.** The legacy section navigator showed
   `answered/total` per section (answered = non-empty label) — an at-a-glance "which sections are
   unfinished" signal. `EditorOutline` shows only a raw question count. Honest regression vs
   `QuestionsTab`; restore the fraction. Files: `EditorOutline.tsx` (cf. `QuestionsTab.tsx`).
3. **Canvas/FindingsPreview stale-state divergence.** The canvas is keyed by focused uid (resets
   on focus change); the inspector's `FindingsPreview` is **not** keyed, so its throwaway preview
   value persists across questions → the two widgets can show contradictory state for the same
   question, and a value can bleed from one question's preview to the next. Authoring-preview only
   (the canvas invariant still guarantees no model dirtying), but confusing. Ties into B-4.

## B. Feature candidates (the W5 headline work, medium effort)
1. **Show-if visibility on the outline + a read-only logic map** *(named W5 candidate #1).* Outline
   rows carry no badge for "has a `showIf`" or "is a gate others depend on"; conditional structure
   is only visible/editable one question at a time in the inspector. Add row badges + a read-only
   logic overview. (Cleanup-on-delete is already correct — this is *visibility*, not correctness.)
2. **Section create / rename / reorder from the outline** *(named W5 candidate).* Today the outline
   offers per-section "+ Add question" and, only when zero sections exist, a "Go to Sections" link —
   authors must leave the Edit workspace for the Sections tab to touch sections.
3. **Cross-section question move.** The whole-tree outline invites dragging a question into another
   section, but reorder is strictly within-section and there's no "move to section" control — a
   pre-existing limitation the unified tree now makes glaring.
4. **Reconcile the "double widget."** When the Findings panel is open the focused question's live
   respondent widget renders twice at once (center canvas + inspector `FindingsPreview`) —
   redundant, and the canvas (big, prominent) resolves *no* findings while the preview that *does*
   show which finding fires is the smaller near-duplicate. Decide: one widget, or clearly distinct
   roles. (Absorbs A-3 and the two-mapper item in C.)
5. **Drag-to-set tier bands** *(named W5 candidate; not surfaced as a defect, still scoped work).*

## C. Nice-to-have / polish (low)
- **A11y cluster:** delete/add/duplicate never move DOM keyboard focus (delete can drop focus to
  page top — *unverified, verify errored, but plausible*); keyboard-reorder announcements read the
  question's random uid instead of its key/label; the workspace panes have no landmark labels /
  the center canvas pane is nameless; outline row `aria-label="Edit {key}"` hides the visible
  label/type and duplicates `aria-current`; pointer-only slider ticks still sit in the SR virtual
  cursor.
- **Canvas cues:** no visible "this preview is throwaway" hint; no reset when an inspector edit
  changes the widget *shape* (type/options/scale) → possible stale cross-shape value; no
  scroll-into-view on focus/add/duplicate (new row can be below the fold on long instruments);
  section collapse state resets on every tab round-trip (while focus persists — inconsistent).
- **Layout:** the row-action hotfix is confirmed sound, but the 20% outline column stays cramped
  at `lg`; consider widening it (`minmax`) — must not disturb the responsive-grid parity test.
- **DRY:** two hand-maintained draft→widget mappers (`QuestionCanvas.tsx:toForInput` vs
  `QuestionInspector.tsx:FindingsPreview.forInput`) already diverge and will drift; unify
  (folds into B-4).

## D. Ruled out / already handled (do NOT re-litigate)
- Gate-deletion dependent cleanup is correctly + consistently wired (outline delete, inspector
  retype, inspector option-remove) via the shared predicate — verified good.
- The launch-day outline row-overlap hotfix is structurally sound (badges wrap; actions stacked
  below) — verified; residual column tightness is the C "layout" item, not the overlap.

## For the admins' keep/kill walk (~10 minutes, on `platformtest.scalingup.com`)
The editor is live now (flag on). Open any template's **"Edit"** tab and try, in order:
1. **Land** — you arrive with nothing selected (empty canvas + inspector). Jarring, or fine?
2. **Focus** a question in the outline → canvas shows the live respondent widget, inspector its settings.
3. **Edit** the label / type / options in the inspector → watch the canvas reflect it live.
4. **Add / Duplicate / Delete** a question → does focus + scroll land somewhere sensible?
5. **Reorder** within a section (drag, then try arrow-keys after picking up the handle).
6. **Try to drag a question into a *different* section** — you can't today; did you expect to?
7. **Open the Findings panel** — the widget now appears twice (canvas + preview). Confusing?
8. **Switch to another tab and back** — focus persists; section-collapse + canvas reset.
9. **Author feel** vs the old single-column Questions tab — faster or slower to build a template?
10. **Verdict:** keep (leave the flag on) or kill (flag off + redeploy → byte-identical old tab).

Capture answers to 1, 4, 6, 7, 9 especially — they map directly onto backlog items A-1, C, B-3,
B-4, and the overall keep/kill call.
