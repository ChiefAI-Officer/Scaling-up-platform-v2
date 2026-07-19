"use client";

/**
 * useTemplateEditorModel — ED3 (spec 19ae), Task 6.
 *
 * Composer hook (Codex C1). Bundles the editor's three headless hooks —
 * `useTemplateEditorDraft` (document model + save flow), `useVersionActions`
 * (publish/duplicate), and `useEditorSelection` (question-selection slice) —
 * into ONE `model` object. The CONTROLLER (`TemplateEditorController`) calls
 * this hook exactly once and hands the single `model` down to `TabbedShell`,
 * which used to call `useTemplateEditorDraft` + `useVersionActions` itself
 * and receive `selection` as a separate prop from the controller.
 *
 * MECHANICAL — same hooks, same args, same defaults as `TabbedShell` applied
 * before this lift, just called one level up and bundled. The
 * `publishedQuestionKeys` / `publishedOptionKeys` empty-default constants are
 * module-scoped (mirroring `TabbedShell`'s own `EMPTY_PUBLISHED_*`
 * constants) so a fixture that omits the prop still gets a REFERENTIALLY
 * STABLE empty array/object across renders — preserving the memoized
 * `useCallback` identities inside `useTemplateEditorDraft` that depend on
 * them (e.g. `handleSaveDraft`). Byte-identical behavior, pinned by the
 * golden guard `editor-byte-equivalence.test.tsx`.
 *
 * `draft` and `versionActions` are spread into one object with no key
 * collisions (verified against both hooks' return shapes at write time);
 * `selection` is nested under its own key exactly as it was passed as a
 * standalone prop before.
 */

import { useTemplateEditorDraft } from "@/components/admin/template-editor/hooks/useTemplateEditorDraft";
import { useVersionActions } from "@/components/admin/template-editor/hooks/useVersionActions";
import { useEditorSelection } from "@/components/admin/template-editor/hooks/useEditorSelection";
import type { TabbedShellProps } from "@/components/admin/template-editor/TabbedShell";

// Stable empty defaults so the memoized handlers inside `useTemplateEditorDraft`
// don't churn on every render — same pattern (and purpose) as TabbedShell's
// own module-scoped `EMPTY_PUBLISHED_QUESTION_KEYS` / `EMPTY_PUBLISHED_OPTION_KEYS`.
const EMPTY_PUBLISHED_QUESTION_KEYS: string[] = [];
const EMPTY_PUBLISHED_OPTION_KEYS: Record<string, string[]> = {};

export function useTemplateEditorModel(props: TabbedShellProps) {
  // ED10 (spec 19am-plan, Task 7) — mirrors TabbedShell's own `ed10Active`
  // (previewSettings + formsBuild + single-column all on). Threaded into the
  // draft hook so Save Draft TRIMS the per-card-owned template-row fields
  // (aggregationMode + results-email) out of the metadata PATCH when the
  // Preview/Settings shell is live. Equivalent to TabbedShell's
  // `activeAuthoringMode === "single"` leg because single-column mode ⟺
  // `singleColumnEnabled`. All three legs false by default ⇒ byte-identical
  // flag-OFF Save-Draft body (editor-byte-equivalence guard).
  const ed10Active = Boolean(
    props.previewSettingsEnabled &&
      props.formsBuildEnabled &&
      props.singleColumnEnabled,
  );

  const draft = useTemplateEditorDraft({
    template: props.template,
    version: props.version,
    publishedQuestionKeys:
      props.publishedQuestionKeys ?? EMPTY_PUBLISHED_QUESTION_KEYS,
    publishedOptionKeys:
      props.publishedOptionKeys ?? EMPTY_PUBLISHED_OPTION_KEYS,
    questionEditorUnlocked: props.questionEditorUnlocked ?? false,
    waveQEnabled: props.waveQEnabled ?? false,
    onSaveDraft: props.onSaveDraft,
    initialDirtyFlags: props.initialDirtyFlags,
    ed10Active,
  });

  const versionActions = useVersionActions({
    template: props.template,
    version: props.version,
    isPublished: props.version.publishedAt !== null,
  });

  const selection = useEditorSelection();

  return {
    ...draft,
    ...versionActions,
    selection,
  };
}

export type TemplateEditorModel = ReturnType<typeof useTemplateEditorModel>;
