"use client";

/**
 * LogicMapDrawer — ED5 Task 8 (audit B-1b). A READ-ONLY drawer listing every
 * show-if relationship authored in this draft, in plain language:
 * "'<dependent>' shows only when '<gate>' = '<option>'". Grouped by the
 * dependent question's section so an admin can scan what a section's
 * visibility depends on without re-deriving it from scattered per-question
 * "Show only when…" pickers.
 *
 * Read-only by construction — no editing affordance here. The
 * `QuestionInspector` "Show only when…" panel remains the only write surface
 * for `showIf`. Uses the shared `EditorDrawer` shell (M6) rather than a
 * second bespoke slide-over.
 */
import * as React from "react";

import { EditorDrawer } from "@/components/admin/template-editor/EditorDrawer";
import type { SectionDraft } from "@/components/admin/template-editor/SectionsCard";
import type { QuestionDraftRow } from "@/components/admin/template-editor/question-serialization";

export interface LogicMapDrawerProps {
  open: boolean;
  onClose: () => void;
  sections: SectionDraft[];
  questions: QuestionDraftRow[];
}

interface LogicMapRow {
  dependentUid: string;
  dependentLabel: string;
  sectionStableKey: string;
  gateLabel: string;
  optionLabel: string;
}

function displayLabel(label: string, fallback: string): string {
  return label.trim() !== "" ? label : fallback;
}

/** Pure — resolves each showIf's gate question + option by stableKey, with
 *  fallback to the raw key when the reference can't be resolved (e.g. the
 *  gate was since deleted, though publish disallows dangling rules). */
function buildLogicMapRows(
  questions: readonly QuestionDraftRow[],
): LogicMapRow[] {
  const byStableKey = new Map<string, QuestionDraftRow>();
  for (const q of questions) {
    if (q.stableKey !== "") byStableKey.set(q.stableKey, q);
  }

  const rows: LogicMapRow[] = [];
  for (const q of questions) {
    if (!q.showIf) continue;
    const gate = byStableKey.get(q.showIf.questionKey);
    const option = gate?.options.find((o) => o.key === q.showIf!.optionKey);
    rows.push({
      dependentUid: q.uid,
      dependentLabel: displayLabel(q.label, q.stableKey || "(new question)"),
      sectionStableKey: q.sectionStableKey,
      gateLabel: gate
        ? displayLabel(gate.label, gate.stableKey)
        : q.showIf.questionKey,
      optionLabel: option
        ? displayLabel(option.label, option.key)
        : q.showIf.optionKey,
    });
  }
  return rows;
}

export function LogicMapDrawer({
  open,
  onClose,
  sections,
  questions,
}: LogicMapDrawerProps) {
  const rows = buildLogicMapRows(questions);

  const bySection = new Map<string, LogicMapRow[]>();
  for (const r of rows) {
    const list = bySection.get(r.sectionStableKey) ?? [];
    list.push(r);
    bySection.set(r.sectionStableKey, list);
  }
  const sectionsWithRows = sections.filter(
    (s) => (bySection.get(s.stableKey) ?? []).length > 0,
  );

  return (
    <EditorDrawer open={open} onClose={onClose} title="Logic map">
      <p className="mb-4 text-sm text-muted-foreground">
        Every show-if relationship authored in this draft — read-only.
      </p>

      {rows.length === 0 ? (
        <p
          className="text-sm italic text-muted-foreground"
          data-testid="logic-map-empty"
        >
          No conditional logic in this template.
        </p>
      ) : (
        <ul className="space-y-4" data-testid="logic-map-list">
          {sectionsWithRows.map((s) => (
            <li key={s.stableKey} data-testid={`logic-map-section-${s.stableKey}`}>
              <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                {s.name || s.stableKey}
              </p>
              <ul className="space-y-1.5 pl-2">
                {(bySection.get(s.stableKey) ?? []).map((r) => (
                  <li
                    key={r.dependentUid}
                    data-testid={`logic-map-row-${r.dependentUid}`}
                    className="text-sm text-foreground"
                  >
                    “{r.dependentLabel}” shows only when “{r.gateLabel}” = “
                    {r.optionLabel}”
                  </li>
                ))}
              </ul>
            </li>
          ))}
        </ul>
      )}
    </EditorDrawer>
  );
}
