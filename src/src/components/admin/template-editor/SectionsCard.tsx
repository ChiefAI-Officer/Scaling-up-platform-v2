"use client";

/**
 * SectionsCard — F2 / F2b (Checkpoint 1b).
 *
 * Shared reusable card used by:
 *   - MetadataTab right column (60/40 grid) — narrow context
 *   - SectionsTab full-width — standalone tab
 *
 * Wireframe spec: WF16 lines 1051-1100. Each row renders:
 *   stableKey badge (S1–S{N}) | inline-editable name | question count | up/down/delete actions
 *
 * Drag-and-drop is deferred to F3 (per the plan). For F2 we use up/down
 * arrow buttons so the operator can reorder without a heavy dnd install
 * in this checkpoint.
 */

import React from "react";
import { ArrowDown, ArrowUp, Trash2 } from "lucide-react";

export interface SectionDraft {
  uid: string;
  stableKey: string;
  name: string;
}

export interface SectionsCardProps {
  sections: SectionDraft[];
  /** Map stableKey → question count, derived from version.questions. */
  questionCountByStableKey: Record<string, number>;
  onAdd: () => void;
  onRename: (uid: string, name: string) => void;
  onDelete: (uid: string) => void;
  onMoveUp: (uid: string) => void;
  onMoveDown: (uid: string) => void;
  /** Disable all interactions (published version). */
  isReadOnly: boolean;
  /** When true, the card content is rendered full-width (Sections tab). */
  layout?: "compact" | "wide";
}

export function SectionsCard({
  sections,
  questionCountByStableKey,
  onAdd,
  onRename,
  onDelete,
  onMoveUp,
  onMoveDown,
  isReadOnly,
  layout = "compact",
}: SectionsCardProps) {
  return (
    <section
      className="rounded-lg border border-border bg-card p-5 space-y-4"
      data-testid="sections-card"
      data-layout={layout}
    >
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-base font-semibold text-foreground">
          Sections ({sections.length})
        </h3>
        <button
          type="button"
          onClick={onAdd}
          disabled={isReadOnly}
          className="inline-flex items-center gap-1 text-xs font-medium px-3 py-1.5 rounded border border-border text-foreground hover:bg-muted disabled:opacity-50 disabled:cursor-not-allowed"
        >
          + Add Section
        </button>
      </div>

      <ul
        className="divide-y divide-border rounded-md border border-border bg-background"
        aria-label="Sections list"
      >
        {sections.length === 0 ? (
          <li className="px-3 py-6 text-center text-xs text-muted-foreground">
            No sections yet. Click <strong>+ Add Section</strong> to start.
          </li>
        ) : null}
        {sections.map((s, idx) => {
          const qCount = questionCountByStableKey[s.stableKey] ?? 0;
          const qLabel = qCount === 1 ? "1 question" : `${qCount} questions`;
          const isFirst = idx === 0;
          const isLast = idx === sections.length - 1;
          return (
            <li
              key={s.uid}
              className="flex flex-wrap items-center gap-2 px-3 py-2"
              data-testid={`sections-row-${s.uid}`}
            >
              <span
                className="inline-flex items-center px-1.5 py-0.5 text-[0.625rem] font-mono font-semibold uppercase tracking-wide rounded bg-muted text-muted-foreground"
                aria-label={`Section stable key ${s.stableKey}`}
              >
                {s.stableKey}
              </span>
              <input
                type="text"
                value={s.name}
                onChange={(e) => onRename(s.uid, e.target.value)}
                disabled={isReadOnly}
                placeholder="Section name"
                aria-label={`Section ${s.stableKey} name`}
                className="flex-1 min-w-[12rem] bg-transparent px-1 py-0.5 text-sm text-foreground border border-transparent rounded focus:outline-none focus:border-border focus:bg-background disabled:opacity-60 disabled:cursor-not-allowed"
              />
              <span className="text-[0.6875rem] text-muted-foreground whitespace-nowrap">
                {qLabel}
              </span>
              <div className="flex items-center gap-0.5">
                <button
                  type="button"
                  onClick={() => onMoveUp(s.uid)}
                  disabled={isReadOnly || isFirst}
                  aria-label={`Move up ${s.stableKey}`}
                  title="Move up"
                  className="p-1 rounded hover:bg-muted disabled:opacity-30 disabled:cursor-not-allowed"
                >
                  <ArrowUp className="w-3.5 h-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => onMoveDown(s.uid)}
                  disabled={isReadOnly || isLast}
                  aria-label={`Move down ${s.stableKey}`}
                  title="Move down"
                  className="p-1 rounded hover:bg-muted disabled:opacity-30 disabled:cursor-not-allowed"
                >
                  <ArrowDown className="w-3.5 h-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => {
                    if (isReadOnly) return;
                    const ok = window.confirm(
                      `Delete section ${s.stableKey}? Questions in this section will need to be reassigned.`,
                    );
                    if (ok) onDelete(s.uid);
                  }}
                  disabled={isReadOnly}
                  aria-label={`Delete ${s.stableKey}`}
                  title="Delete"
                  className="p-1 rounded hover:bg-destructive/10 text-destructive disabled:opacity-30 disabled:cursor-not-allowed"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            </li>
          );
        })}
      </ul>

      <p className="text-[0.6875rem] italic text-muted-foreground">
        stableKey is auto-generated on first save; immutable across versions
        for longitudinal comparability.
      </p>
    </section>
  );
}
