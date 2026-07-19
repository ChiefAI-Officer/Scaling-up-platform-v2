/**
 * TemplateEditorTabbed — compatibility re-export (ED3, spec 19ae, Task 2).
 *
 * This file used to contain the entire assessment template editor
 * component. It has been split into:
 *   - `template-editor/TabbedShell.tsx`            — the view (all state
 *     + render logic, moved here verbatim — no behavior change).
 *   - `template-editor/TemplateEditorController.tsx` — the owner wrapper
 *     that will grow the shared `useTemplateEditorModel` hook in a later
 *     ED3 task; today it's a pure passthrough to `TabbedShell`.
 *
 * This module re-exports the controller under the original public name
 * so every existing importer (tests, the edit page) keeps resolving
 * without a code change. Do NOT add new logic here — this file is a
 * compatibility shim only.
 */

export {
  TemplateEditorController as TemplateEditorTabbed,
} from "./template-editor/TemplateEditorController";

export type {
  TabbedShellProps as TemplateEditorTabbedProps,
} from "./template-editor/TabbedShell";

export type {
  TemplateEditorTabbedTemplate,
  TemplateEditorTabbedVersion,
  TemplateEditorTabbedVersionMeta,
  DirtyFlags,
  ActivePreview,
} from "./template-editor/TabbedShell";
