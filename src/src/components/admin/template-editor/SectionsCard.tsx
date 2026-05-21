"use client";

/**
 * SectionsCard — F2 / F2b (Checkpoint 1b) + F3 drag retrofit (Checkpoint 2).
 *
 * Shared reusable card used by:
 *   - MetadataTab right column (60/40 grid) — narrow context
 *   - SectionsTab full-width — standalone tab
 *
 * Wireframe spec: WF16 lines 1051-1100. Each row renders:
 *   drag-handle | stableKey badge | inline-editable name | question
 *   count | up/down/delete actions.
 *
 * F3 drag retrofit: rows are drag-sortable via @dnd-kit (matches the
 * Questions tab pattern). The up/down arrow buttons remain alongside
 * the drag handle as an accessible keyboard fallback for screen reader
 * + non-pointer users. Order changes from either mechanism update the
 * same sections state slice in TemplateEditorTabbed.
 */

import React, { useCallback } from "react";
import { ArrowDown, ArrowUp, GripVertical, Trash2 } from "lucide-react";
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

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
  /** Optional drag-reorder callback. When provided, drag-and-drop is enabled. */
  onReorder?: (newOrderUids: string[]) => void;
  /** Disable all interactions (published version). */
  isReadOnly: boolean;
  /** When true, the card content is rendered full-width (Sections tab). */
  layout?: "compact" | "wide";
}

interface SortableSectionRowProps {
  section: SectionDraft;
  qLabel: string;
  isFirst: boolean;
  isLast: boolean;
  isReadOnly: boolean;
  onRename: (uid: string, name: string) => void;
  onDelete: (uid: string) => void;
  onMoveUp: (uid: string) => void;
  onMoveDown: (uid: string) => void;
}

function SortableSectionRow({
  section,
  qLabel,
  isFirst,
  isLast,
  isReadOnly,
  onRename,
  onDelete,
  onMoveUp,
  onMoveDown,
}: SortableSectionRowProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: section.uid, disabled: isReadOnly });

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.6 : 1,
  };

  return (
    <li
      ref={setNodeRef}
      style={style}
      className="flex flex-wrap items-center gap-2 px-3 py-2"
      data-testid={`sections-row-${section.uid}`}
    >
      <button
        type="button"
        aria-label={`Drag to reorder ${section.stableKey}`}
        data-testid={`sections-drag-handle-${section.uid}`}
        disabled={isReadOnly}
        className="cursor-grab disabled:cursor-not-allowed text-muted-foreground hover:text-foreground"
        {...attributes}
        {...listeners}
      >
        <GripVertical className="w-3.5 h-3.5" />
      </button>
      <span
        className="inline-flex items-center px-1.5 py-0.5 text-[0.625rem] font-mono font-semibold uppercase tracking-wide rounded bg-muted text-muted-foreground"
        aria-label={`Section stable key ${section.stableKey}`}
      >
        {section.stableKey}
      </span>
      <input
        type="text"
        value={section.name}
        onChange={(e) => onRename(section.uid, e.target.value)}
        disabled={isReadOnly}
        placeholder="Section name"
        aria-label={`Section ${section.stableKey} name`}
        className="flex-1 min-w-[12rem] bg-transparent px-1 py-0.5 text-sm text-foreground border border-transparent rounded focus:outline-none focus:border-border focus:bg-background disabled:opacity-60 disabled:cursor-not-allowed"
      />
      <span className="text-[0.6875rem] text-muted-foreground whitespace-nowrap">
        {qLabel}
      </span>
      <div className="flex items-center gap-0.5">
        <button
          type="button"
          onClick={() => onMoveUp(section.uid)}
          disabled={isReadOnly || isFirst}
          aria-label={`Move up ${section.stableKey}`}
          title="Move up"
          className="p-1 rounded hover:bg-muted disabled:opacity-30 disabled:cursor-not-allowed"
        >
          <ArrowUp className="w-3.5 h-3.5" />
        </button>
        <button
          type="button"
          onClick={() => onMoveDown(section.uid)}
          disabled={isReadOnly || isLast}
          aria-label={`Move down ${section.stableKey}`}
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
              `Delete section ${section.stableKey}? Questions in this section will need to be reassigned.`,
            );
            if (ok) onDelete(section.uid);
          }}
          disabled={isReadOnly}
          aria-label={`Delete ${section.stableKey}`}
          title="Delete"
          className="p-1 rounded hover:bg-destructive/10 text-destructive disabled:opacity-30 disabled:cursor-not-allowed"
        >
          <Trash2 className="w-3.5 h-3.5" />
        </button>
      </div>
    </li>
  );
}

export function SectionsCard({
  sections,
  questionCountByStableKey,
  onAdd,
  onRename,
  onDelete,
  onMoveUp,
  onMoveDown,
  onReorder,
  isReadOnly,
  layout = "compact",
}: SectionsCardProps) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      if (!onReorder) return;
      const { active, over } = event;
      if (!over || active.id === over.id) return;
      const oldIndex = sections.findIndex((s) => s.uid === String(active.id));
      const newIndex = sections.findIndex((s) => s.uid === String(over.id));
      if (oldIndex < 0 || newIndex < 0) return;
      const next = arrayMove(sections, oldIndex, newIndex).map((s) => s.uid);
      onReorder(next);
    },
    [onReorder, sections],
  );

  const rows = sections.map((s, idx) => {
    const qCount = questionCountByStableKey[s.stableKey] ?? 0;
    const qLabel = qCount === 1 ? "1 question" : `${qCount} questions`;
    return (
      <SortableSectionRow
        key={s.uid}
        section={s}
        qLabel={qLabel}
        isFirst={idx === 0}
        isLast={idx === sections.length - 1}
        isReadOnly={isReadOnly}
        onRename={onRename}
        onDelete={onDelete}
        onMoveUp={onMoveUp}
        onMoveDown={onMoveDown}
      />
    );
  });

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
        {onReorder ? (
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragEnd={handleDragEnd}
          >
            <SortableContext
              items={sections.map((s) => s.uid)}
              strategy={verticalListSortingStrategy}
            >
              {rows}
            </SortableContext>
          </DndContext>
        ) : (
          rows
        )}
      </ul>

      <p className="text-[0.6875rem] italic text-muted-foreground">
        stableKey is auto-generated on first save; immutable across versions
        for longitudinal comparability.
      </p>
    </section>
  );
}
