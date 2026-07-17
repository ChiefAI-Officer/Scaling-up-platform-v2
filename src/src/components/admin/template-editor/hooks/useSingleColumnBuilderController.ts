"use client";

/**
 * useSingleColumnBuilderController — ED9 (spec 19al-plan), Task 6.
 *
 * The single-column builder's ORCHESTRATION, lifted VERBATIM out of
 * `SingleColumnFormBuilder`. A later ED9 task adds `FormsBuilder` (the flag-ON
 * Google-Forms Build body); rather than CLONE the DnD wiring, section grouping,
 * card view-models, focus restoration, SR announcements, and command glue
 * (Codex co-validate finding #3), both surfaces call THIS hook and stay thin
 * renderers over it.
 *
 * BEHAVIOR-PRESERVING LIFT. Every line below is the EXACT logic that lived
 * inline in `SingleColumnFormBuilder` — same `commandsModel`/`useEditorCommands`
 * wiring, the same `buildCardViewModels` memo (same dependency array), the same
 * `rowFocusRefs`/`addButtonRefs` + focus-restoration `useLayoutEffect` +
 * `consumePendingFocus`, the same `registerFocusRef`, the same ascending-
 * sortOrder `bySection` grouping, the same DnD sensors, the same
 * `handleDragEnd` (pure `resolveOutlineDrop` → within-section reorder only), and
 * the same `dndAnnouncements` (named by label, never uid). The JSX (section
 * bands, cards, add buttons, empty states) stays in the component. Pinned
 * byte-identical by the ED9 golden shell baseline + the full single-column
 * suite (`single-column-*.test.tsx`) and directly by
 * `use-single-column-builder-controller.test.tsx`.
 *
 * NOTE — `rowFocusRefs` stays PRIVATE to the hook (only its effect +
 * `registerFocusRef` touch it), but `addButtonRefs` is returned because the JSX
 * registers empty-section "+ Add question" buttons into the SAME map the focus
 * effect reads from.
 */

import { useCallback, useLayoutEffect, useMemo, useRef } from "react";
import {
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type Announcements,
  type DragEndEvent,
} from "@dnd-kit/core";
import { sortableKeyboardCoordinates } from "@dnd-kit/sortable";

import type { TemplateEditorModel } from "./useTemplateEditorModel";
import {
  useEditorCommands,
  type EditorCommands,
  type EditorCommandsModel,
} from "./useEditorCommands";
import { buildCardViewModels, type CardViewModel } from "../single-column-view-model";
import { resolveOutlineDrop } from "../outline-drop";
import type { SectionDraft } from "../SectionsCard";
import type { QuestionDraftRow } from "../question-serialization";

export interface SingleColumnBuilderControllerOptions {
  /** Wave W — conditional (show-if) authoring on. */
  conditionalEnabled: boolean;
  /** Published version ⇒ read-only mutation affordances. */
  isReadOnly: boolean;
  /** Wave T — per-type question editing unlocked. */
  isUnlocked: boolean;
}

export interface SingleColumnBuilderController {
  /** Sections/questions/selection, forwarded from the model for the JSX. */
  sections: readonly SectionDraft[];
  questions: readonly QuestionDraftRow[];
  selection: TemplateEditorModel["selection"];
  /** Shared confirm→command→focus glue (add/duplicate/delete/move/section). */
  commands: EditorCommands;
  /** Per-card display data, derived ONCE over the whole instrument. */
  vms: Map<string, CardViewModel>;
  /** Questions grouped by section stableKey, ascending sortOrder. */
  bySection: Map<string, QuestionDraftRow[]>;
  /** DnD sensors (pointer + keyboard). */
  sensors: ReturnType<typeof useSensors>;
  /** Within-section reorder wiring (delegates to the pure `resolveOutlineDrop`). */
  handleDragEnd: (event: DragEndEvent) => void;
  /** SR reorder announcements, named by question label (never uid). */
  dndAnnouncements: Announcements;
  /** Registers a card's row focus button for the focus-restoration effect. */
  registerFocusRef: (uid: string, el: HTMLButtonElement | null) => void;
  /** Empty-section "+ Add question" refs — the JSX writes into this same map. */
  addButtonRefs: React.RefObject<Map<string, HTMLButtonElement>>;
}

export function useSingleColumnBuilderController(
  model: TemplateEditorModel,
  { conditionalEnabled, isReadOnly, isUnlocked }: SingleColumnBuilderControllerOptions,
): SingleColumnBuilderController {
  const { sections, questions, selection } = model;

  const commandsModel: EditorCommandsModel = {
    sections,
    questions,
    selection: {
      focusedQuestionUid: selection.focusedQuestionUid,
      setFocusedQuestionUid: selection.setFocusedQuestionUid,
      setSectionCollapsed: selection.setSectionCollapsed,
    },
    addQuestion: model.addQuestion,
    duplicateQuestion: model.duplicateQuestion,
    deleteQuestion: model.deleteQuestion,
    deleteSection: model.deleteSection,
    moveQuestionToSection: model.moveQuestionToSection,
  };
  const commands = useEditorCommands(commandsModel, {
    conditionalEnabled,
    isReadOnly,
    isUnlocked,
  });
  const { consumePendingFocus } = commands;

  const vms = useMemo(
    () => buildCardViewModels(questions, sections, { conditionalEnabled }),
    [questions, sections, conditionalEnabled],
  );

  const rowFocusRefs = useRef(new Map<string, HTMLButtonElement>());
  const addButtonRefs = useRef(new Map<string, HTMLButtonElement>());
  useLayoutEffect(() => {
    const pending = consumePendingFocus();
    if (!pending) return;
    const el =
      pending.kind === "row"
        ? rowFocusRefs.current.get(pending.uid)
        : addButtonRefs.current.get(pending.sectionKey);
    if (!el) return;
    el.focus();
    el.scrollIntoView?.({ block: "nearest" });
  }, [questions, consumePendingFocus]);

  const registerFocusRef = useCallback(
    (uid: string, el: HTMLButtonElement | null) => {
      if (el) rowFocusRefs.current.set(uid, el);
      else rowFocusRefs.current.delete(uid);
    },
    [],
  );

  // Group questions by section, ascending sortOrder.
  const bySection = useMemo(() => {
    const grouped = new Map<string, (typeof questions)[number][]>();
    for (const s of sections) grouped.set(s.stableKey, []);
    for (const q of [...questions].sort((a, b) => a.sortOrder - b.sortOrder)) {
      const arr = grouped.get(q.sectionStableKey);
      if (arr) arr.push(q);
    }
    return grouped;
  }, [questions, sections]);

  // DnD — pointer + keyboard (the keyboard sensor is the jsdom-drivable path).
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  // Reorder-vs-move decision via the pure, tested `resolveOutlineDrop`. v1 wires
  // WITHIN-section reorder only; a cross-section drag result is ignored (the
  // "Move to section…" select is the reliable cross-section path — co-validate Q1).
  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over) return;
    const containers: Record<string, string[]> = {};
    for (const s of sections) {
      containers[s.stableKey] = (bySection.get(s.stableKey) ?? []).map((q) => q.uid);
    }
    const result = resolveOutlineDrop(String(active.id), String(over.id), containers);
    if (result && result.kind === "reorder") {
      model.reorderQuestions(result.sectionKey, result.order);
    }
  };

  // SR reorder announcements name the question's LABEL/key, never its random uid.
  const nameForUid = (id: string): string => {
    const q = questions.find((qq) => qq.uid === id);
    return q ? q.label.trim() || q.stableKey || "question" : "question";
  };
  const dndAnnouncements: Announcements = {
    onDragStart: ({ active }) => `Picked up ${nameForUid(String(active.id))}.`,
    onDragOver: ({ active, over }) =>
      over ? `${nameForUid(String(active.id))} is over ${String(over.id)}.` : undefined,
    onDragEnd: ({ active, over }) =>
      over
        ? `Moved ${nameForUid(String(active.id))}.`
        : `${nameForUid(String(active.id))} was dropped.`,
    onDragCancel: ({ active }) => `Cancelled moving ${nameForUid(String(active.id))}.`,
  };

  return {
    sections,
    questions,
    selection,
    commands,
    vms,
    bySection,
    sensors,
    handleDragEnd,
    dndAnnouncements,
    registerFocusRef,
    addButtonRefs,
  };
}
