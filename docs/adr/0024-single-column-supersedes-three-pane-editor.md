# ADR-0024 — Single-column form builder supersedes the three-pane as the default authoring surface

**Status:** Accepted (2026-07-15) — design-phase decision for Wave ED6 (spec `19ah`). Implementation gated.

## Context

The assessment template editor overhaul (Waves ED1–ED5) culminated in a **three-pane "workbench"**
authoring surface (outline · in-context canvas · inspector), shipped behind `WAVE_ED4_THREE_PANE_ENABLED`.
That was the artifact's recommended "Option A."

On live review of the production editor, the client (Jeff, via the user) judged the three-pane
**cluttered and hard to use**: always-on per-row controls, two panes empty until a selection, cryptic
keys/counters leading the UI. The user's explicit direction was to adopt the **simplicity of Google
Forms** — a single scrolling column of question cards — which is the artifact's originally-passed-over
"Option B (Document Outline / inline-expand)."

Because ED3 already extracted the editor into a headless model + interchangeable presentations, a new
authoring surface is a *third presentation* over the same model, not a rewrite. This raised the question:
do we polish the three-pane, or replace it as the default?

## Decision

**Build a single-column form-builder surface (Wave ED6) and make it the default authoring surface,
demoting the three-pane to a flag-selected fallback.**

- The single-column surface is a third rendering at the existing `TabbedShell` seam, selected by a new
  default-OFF flag `WAVE_ED6_SINGLE_COLUMN_ENABLED` (wins over the three-pane flag when both are on).
- The three-pane (`ThreePaneWorkspace` and its parts) is **kept this wave** — it is the *current live
  production* authoring surface, not a rollback rung (the kill switch falls back to the byte-identical
  legacy `QuestionsTab`). **Named retirement trigger:** on ED6 launch (flag ON in prod), the immediate
  follow-on wave removes `ThreePaneWorkspace` + its flag + the seam branch — but **not before cross-section
  drag lands in single-column** (see trade-offs).
- Advanced per-question config (scoring tier-bands, findings, show-if) moves **inside the focused card**
  behind one "Advanced" region — there is **no persistent right-hand inspector**. This is the load-bearing
  divergence from the three-pane and from the form-builder field's common "right inspector" pattern; it is
  chosen to honor the single-column mandate.

## Consequences

**Positive**
- Matches the client's stated mental model (Google Forms); simple questions read as one-line cards.
- Low blast radius: ~90% reuse (model, serialization, publish gate, respondent widget, and the config
  editor re-hosted in-card). The only genuinely new component is a card-list container.
- Fully reversible at the presentation layer: flag OFF + redeploy → the three-pane (or legacy list)
  returns byte-for-byte; no persisted-data change.

**Negative / accepted trade-offs**
- **Loses always-on side-by-side comparison** of questions that the three-pane offered — mitigated by
  always-visible summary badges + a read-only Logic Map drawer for show-if relationships.
- A focused, scoring-heavy card grows tall (only the one focused card); virtualization is deferred to a
  follow-on, mitigated by fixed-height collapsed cards + section collapse.
- **Two authoring surfaces coexist** until the three-pane is retired — extra flag branches and per-mode
  parity tests in the interim.
- **Cross-section *drag* is a temporary capability regression.** The live three-pane ships working
  cross-section drag today; single-column v1 offers the reliable "Move to section…" picker instead (drag is
  a fast-follow). The picker is sufficient but not equivalent — so three-pane is retained until
  cross-section drag lands in single-column, then retired.
- This is the **second** direction change for the editor's authoring surface (three-pane → single-column);
  the reversal is recorded here so future readers understand it was a deliberate response to live-review
  feedback, not churn.

## Alternatives considered

- **Polish the three-pane in place** (declutter controls, fill empty panes). Rejected: keeps three panes
  for a one-question job; does not deliver the Google-Forms simplicity the client asked for.
- **Hybrid — single column + an inspector that slides in on demand** for heavy config. Rejected for v1:
  reintroduces a second surface for the advanced path; the in-card "Advanced" region covers it more simply.

## Related

- Supersedes the default-surface role of ED4/ED5 (specs `19af`, `19ag`).
- Builds on ADR-0020 (stableKey lock), ADR-0021 (findings), ADR-0023 (cross-section move + cascade delete).
- Spec: `docs/specs/v7.6/19ah-editor-overhaul-wave6-single-column.md`.
