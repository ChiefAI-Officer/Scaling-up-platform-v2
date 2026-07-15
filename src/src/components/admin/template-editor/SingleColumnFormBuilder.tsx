"use client";

/**
 * SingleColumnFormBuilder — ED6 (spec 19ah), PR-A PLACEHOLDER.
 *
 * Flag-ON (`WAVE_ED6_SINGLE_COLUMN_ENABLED`, which WINS over the ED4
 * `WAVE_ED4_THREE_PANE_ENABLED`) replacement for the Questions tab body inside
 * `TabbedShell`: a single-column, Typeform-style form builder that folds the
 * Sections tab in (hence the Sections trigger disappears in single mode).
 *
 * PR-A only wires the flag + seam + tab plumbing and mounts this empty
 * placeholder so the presentation swap is provable end-to-end. The real
 * builder (outline rail + inline section/question editing) lands in later
 * ED6 PRs. It accepts the SAME props as `ThreePaneWorkspace` so `TabbedShell`
 * forwards one prop bundle to whichever workspace the flag selects — no
 * bespoke wiring, and the shared `model` is the single source of truth (the
 * ONE-shell rule inherited from ED4 co-validate C1).
 */

import type { TemplateEditorModel } from "./hooks/useTemplateEditorModel";

export interface SingleColumnFormBuilderProps {
  /** The composed editor model, shared with `TabbedShell` (ONE shell rule). */
  model: TemplateEditorModel;
  /** Published version ⇒ read-only mutation affordances (reused signal). */
  isReadOnly: boolean;
  /** Wave T — per-type question editing unlocked. */
  isUnlocked: boolean;
  /** Wave U — findings-logic authoring panel. */
  findingsEnabled: boolean;
  /** Wave W — conditional (show-if) authoring panel. */
  conditionalEnabled: boolean;
  /** Wave T — union of published option keys per question stableKey. */
  publishedOptionKeys: Record<string, readonly string[]>;
  /**
   * Switch the active tab to Sections. Retained for prop-parity with
   * `ThreePaneWorkspace`; single-column folds sections inline, so the real
   * builder will not use it — kept so `TabbedShell` forwards one bundle.
   */
  onGoToSections: () => void;
}

export function SingleColumnFormBuilder(
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _props: SingleColumnFormBuilderProps,
) {
  // PR-A placeholder — later ED6 PRs fill this in.
  return <div data-testid="single-column-builder" />;
}
