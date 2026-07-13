"use client";

/**
 * TemplateEditorController — ED3 (spec 19ae), Task 2.
 *
 * Thin owner wrapper around the editor view. This is a PURE structural
 * split: no state has moved yet. `TabbedShell` still owns every
 * `useState`/`useRef`/`useCallback` and the full render tree exactly as
 * `TemplateEditorTabbed` did before this split — this file just passes
 * props straight through.
 *
 * Future (later ED3 tasks): this component will call
 * `useTemplateEditorModel(props)` to lift the shared editor state out of
 * `TabbedShell` and pass the resulting `model` down as a prop, so the
 * inspector/other consumers can share the same headless state without
 * re-deriving it.
 */

import { TabbedShell, type TabbedShellProps } from "./TabbedShell";

export function TemplateEditorController(props: TabbedShellProps) {
  return <TabbedShell {...props} />;
}
