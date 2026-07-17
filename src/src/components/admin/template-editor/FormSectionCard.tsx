"use client";

/**
 * FormSectionCard — ED9 (spec 19al-plan), Task 8.
 *
 * The Google-Forms-style single-column builder's per-section band, lifted to
 * its own component (mirrors `FormQuestionCard`, Task 7) so a later wiring
 * pass — and the eventual `FormsBuilder` — reuse it verbatim instead of the
 * inline band in `SingleColumnFormBuilder`. Additive: nothing wires this
 * component in yet, so the existing single-column DOM (goldens/frozen) is
 * untouched by this file.
 *
 * Renders a collapse toggle, an inline name `<input>` (`onRename`), a
 * description field (`onSetDescription` — the round-trip already existed on
 * `SectionDraft.description`; this is the first UI surface that writes it), a
 * "N of M labeled" count, and a ⋯ overflow menu exposing Add question / Move
 * up / Move down / Delete. The menu is a simple local open-state disclosure
 * (no `role=menu`) — matches the template-editor family's existing
 * conventions (`SectionsCard`'s inline actions, the admin nav's disclosure
 * groups), not a Radix-menu pattern. `isReadOnly` hides the menu entirely and
 * disables both text inputs; the collapse toggle is a pure view affordance
 * and stays enabled either way.
 */

import { useState } from "react";
import { MoreHorizontal } from "lucide-react";

import type { SectionDraft } from "./SectionsCard";

export interface FormSectionCardProps {
  section: SectionDraft;
  /** Count of questions in this section with a non-blank label. */
  labeledCount: number;
  /** Total question count in this section. */
  totalCount: number;
  collapsed: boolean;
  isReadOnly: boolean;
  onRename: (uid: string, name: string) => void;
  onSetDescription: (uid: string, description: string) => void;
  onToggleCollapsed: (stableKey: string) => void;
  onAddQuestion: (stableKey: string) => void;
  onMoveUp: (uid: string) => void;
  onMoveDown: (uid: string) => void;
  onDelete: (uid: string) => void;
}

export function FormSectionCard({
  section,
  labeledCount,
  totalCount,
  collapsed,
  isReadOnly,
  onRename,
  onSetDescription,
  onToggleCollapsed,
  onAddQuestion,
  onMoveUp,
  onMoveDown,
  onDelete,
}: FormSectionCardProps) {
  const { uid, stableKey, name, description } = section;
  const [menuOpen, setMenuOpen] = useState(false);

  function runAndClose(fn: () => void) {
    setMenuOpen(false);
    fn();
  }

  return (
    <div
      data-testid={`form-section-card-${uid}`}
      className="rounded-lg border border-border bg-card"
    >
      <div className="flex items-start gap-2 px-3 py-2">
        <button
          type="button"
          data-testid={`form-section-toggle-${uid}`}
          aria-expanded={!collapsed}
          aria-label={collapsed ? "Expand section" : "Collapse section"}
          onClick={() => onToggleCollapsed(stableKey)}
          className="mt-1 shrink-0 text-muted-foreground hover:text-foreground"
        >
          {collapsed ? "▸" : "▾"}
        </button>

        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <input
            type="text"
            data-testid={`form-section-name-${uid}`}
            aria-label="Section name"
            placeholder="Section name"
            value={name}
            disabled={isReadOnly}
            onChange={(e) => onRename(uid, e.target.value)}
            className="w-full rounded border border-transparent bg-transparent px-1 py-0.5 text-sm font-semibold text-foreground outline-none focus:border-border focus:bg-background disabled:opacity-60 disabled:cursor-not-allowed"
          />
          <textarea
            data-testid={`form-section-description-${uid}`}
            aria-label="Section description"
            placeholder="Optional — shown above this section on the survey"
            value={description ?? ""}
            disabled={isReadOnly}
            rows={1}
            onChange={(e) => onSetDescription(uid, e.target.value)}
            className="w-full resize-none rounded border border-transparent bg-transparent px-1 py-0.5 text-xs text-muted-foreground outline-none focus:border-border focus:bg-background disabled:opacity-60 disabled:cursor-not-allowed"
          />
        </div>

        <span className="mt-1 shrink-0 whitespace-nowrap text-[0.6875rem] tabular-nums text-muted-foreground">
          {labeledCount} of {totalCount} labeled
        </span>

        {!isReadOnly && (
          <div className="relative shrink-0">
            <button
              type="button"
              data-testid={`section-menu-${stableKey}`}
              aria-haspopup="true"
              aria-expanded={menuOpen}
              aria-label="Section options"
              onClick={() => setMenuOpen((open) => !open)}
              className="inline-flex h-6 w-6 items-center justify-center rounded text-muted-foreground hover:bg-muted hover:text-foreground"
            >
              <MoreHorizontal className="h-4 w-4" aria-hidden="true" />
            </button>
            {menuOpen && (
              <div
                data-testid={`section-menu-${stableKey}-panel`}
                role="presentation"
                className="absolute right-0 top-full z-10 mt-1 w-44 rounded-md border border-border bg-popover p-1 shadow-md"
              >
                <button
                  type="button"
                  data-testid={`section-menu-${stableKey}-add-question`}
                  onClick={() => runAndClose(() => onAddQuestion(stableKey))}
                  className="block w-full rounded px-2 py-1.5 text-left text-sm text-foreground hover:bg-muted"
                >
                  Add question
                </button>
                <button
                  type="button"
                  data-testid={`section-menu-${stableKey}-move-up`}
                  onClick={() => runAndClose(() => onMoveUp(uid))}
                  className="block w-full rounded px-2 py-1.5 text-left text-sm text-foreground hover:bg-muted"
                >
                  Move up
                </button>
                <button
                  type="button"
                  data-testid={`section-menu-${stableKey}-move-down`}
                  onClick={() => runAndClose(() => onMoveDown(uid))}
                  className="block w-full rounded px-2 py-1.5 text-left text-sm text-foreground hover:bg-muted"
                >
                  Move down
                </button>
                <button
                  type="button"
                  data-testid={`section-menu-${stableKey}-delete`}
                  onClick={() => runAndClose(() => onDelete(uid))}
                  className="block w-full rounded px-2 py-1.5 text-left text-sm text-destructive hover:bg-destructive/10"
                >
                  Delete
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
