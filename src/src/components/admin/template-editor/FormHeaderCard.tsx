"use client";

/**
 * FormHeaderCard — ED9 (spec 19al-plan), Task 9.
 *
 * The Google-Forms-style form-identity hero card that sits atop the ED9
 * Build column: an editable title + description, a meta row of per-type
 * question counts + a section/question totals chip, and a top accent bar
 * (the Google-Forms hero motif — a `border-t-primary` stripe, shadcn tokens
 * only per CLAUDE.md, never a hardcoded color).
 *
 * Title/description round-trip through the SAME `onTemplateFieldChange`
 * callback the Metadata tab already uses (`MetadataTab.tsx` /
 * `useTemplateEditorDraft.ts` `handleTemplateFieldChange`) — a PATCH-object
 * shape (`(patch: Partial<{ name; description }>) => void`), NOT
 * `(field, value)`. Reusing the exact prop keeps the hero two-way synced
 * with Metadata for free (both write into the same `templateValues` state
 * via the same setter — no drift, no second source of truth).
 *
 * Additive: nothing wires this component into `SingleColumnFormBuilder` yet
 * (mirrors `FormQuestionCard`/`FormSectionCard`, Tasks 7-8), so the existing
 * single-column DOM (goldens/frozen) is untouched by this file.
 */

import { QUESTION_TYPE_LABELS } from "./enum-labels";

export interface FormHeaderCardTemplate {
  name: string;
  description: string | null;
}

export interface FormHeaderCardQuestion {
  type: string;
}

export interface FormHeaderCardProps {
  template: FormHeaderCardTemplate;
  questions: readonly FormHeaderCardQuestion[];
  sectionCount: number;
  isReadOnly: boolean;
  /**
   * The exact `MetadataTab`/`TabbedShell` field-change shape — a PATCH
   * object, e.g. `onTemplateFieldChange({ name: "New Title" })`. See
   * `handleTemplateFieldChange` in `hooks/useTemplateEditorDraft.ts`.
   */
  onTemplateFieldChange: (
    patch: Partial<{ name: string; description: string }>,
  ) => void;
}

// Canonical display order for the meta-row type-count chips — mirrors the
// declaration order in `QUESTION_TYPE_LABELS` (Slider, Multiple choice,
// Number, Short text, …). Any type not in this map (unmapped/future enum
// value) falls back to its raw string and is appended in first-seen order.
const KNOWN_TYPE_ORDER = Object.keys(QUESTION_TYPE_LABELS);

function typeLabel(type: string): string {
  return QUESTION_TYPE_LABELS[type] ?? type;
}

function pluralize(count: number, noun: string): string {
  return `${count} ${noun}${count === 1 ? "" : "s"}`;
}

export function FormHeaderCard({
  template,
  questions,
  sectionCount,
  isReadOnly,
  onTemplateFieldChange,
}: FormHeaderCardProps) {
  const counts = new Map<string, number>();
  for (const question of questions) {
    counts.set(question.type, (counts.get(question.type) ?? 0) + 1);
  }

  const orderedTypes = [
    ...KNOWN_TYPE_ORDER.filter((type) => counts.has(type)),
    ...Array.from(counts.keys()).filter(
      (type) => !KNOWN_TYPE_ORDER.includes(type),
    ),
  ];

  const typeCountsText = orderedTypes
    .map((type) => `${typeLabel(type)} ×${counts.get(type)}`)
    .join(" · ");

  const totalsText = `${pluralize(sectionCount, "section")} · ${pluralize(
    questions.length,
    "question",
  )}`;

  return (
    <div
      data-testid="form-header-card"
      className="space-y-2 rounded-lg border border-t-4 border-t-primary border-border bg-card p-4"
    >
      <input
        type="text"
        data-testid="form-header-title"
        aria-label="Form title"
        placeholder="Untitled form"
        value={template.name}
        disabled={isReadOnly}
        onChange={(e) => onTemplateFieldChange({ name: e.target.value })}
        className="w-full rounded border border-transparent bg-transparent px-1 py-1 text-2xl font-semibold text-foreground outline-none focus:border-border disabled:opacity-60 disabled:cursor-not-allowed"
      />
      <input
        type="text"
        data-testid="form-header-description"
        aria-label="Form description"
        placeholder="Add a description (optional)"
        value={template.description ?? ""}
        disabled={isReadOnly}
        onChange={(e) =>
          onTemplateFieldChange({ description: e.target.value })
        }
        className="w-full rounded border border-transparent bg-transparent px-1 py-1 text-sm text-muted-foreground outline-none focus:border-border disabled:opacity-60 disabled:cursor-not-allowed"
      />
      <div
        data-testid="form-header-meta"
        className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground"
      >
        {typeCountsText && (
          <span data-testid="form-header-type-counts">{typeCountsText}</span>
        )}
        <span
          data-testid="form-header-totals"
          className="font-medium text-foreground"
        >
          {totalsText}
        </span>
      </div>
    </div>
  );
}
