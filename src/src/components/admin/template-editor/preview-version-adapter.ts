/**
 * Wave ED10 (spec 19am-plan, Task 5) — preview version adapters.
 *
 * The ED10 Preview tab (Task 6) renders the SAME `SectionPager` the live
 * survey uses, fed by the SAME `assembleSurveyPages` pipeline. Both consume
 * the pager shapes (`PagerSection[]` / `PagerQuestion[]`). This module bridges
 * the editor's two content sources onto those shapes:
 *
 *   - DRAFT adapter — the live, in-editor state (`SectionDraft` /
 *     `QuestionDraftRow`). Mirrors the SAVE serializers so a draft preview
 *     matches what a save would persist (and therefore what a published survey
 *     renders): section `sortOrder = idx + 1` (buildSectionsPayload's
 *     positional stamp), and per-type question emission (SLIDER_LIKERT→scale,
 *     MULTI_CHOICE→options[+maxChoices], TEXT/NUMBER→neither) with the same
 *     show-if / helpText rules as `buildQuestionsPayload`.
 *   - STORED-JSON adapter — the Active published version's `questions` /
 *     `sections` JSON. The `/me` route casts this JSON straight through to the
 *     survey client, so the stored shape ALREADY IS the survey shape; this
 *     adapter just reads it defensively (tolerant of missing optional fields
 *     and garbage entries — there is no `/me`-style deserializer to reuse).
 *
 * PURE + framework-free (type-only imports of the editor draft types, erased
 * at compile) — safe to import from the client PreviewTab or a unit test.
 */

import type {
  PagerSection,
  PagerQuestion,
} from "@/lib/assessments/section-pages";
import type { SectionDraft } from "@/components/admin/template-editor/SectionsCard";
import type { QuestionDraftRow } from "@/components/admin/template-editor/question-serialization";

// ────────────────────────────────────────────────────────────────────────
// DRAFT → pager (live editor state)
// ────────────────────────────────────────────────────────────────────────

/**
 * Map editor `SectionDraft` rows onto `PagerSection[]`.
 *
 * `SectionDraft` carries NO `sortOrder` — the editor keeps section order as
 * array position (SectionsCard reorders the array). So `sortOrder = idx + 1`,
 * matching `buildSectionsPayload`'s positional stamp (sections-serialization.ts),
 * so a draft preview orders sections exactly as a save/publish would.
 */
export function draftSectionsToPager(sections: SectionDraft[]): PagerSection[] {
  return sections.map((s, idx) => {
    const out: PagerSection = {
      stableKey: s.stableKey,
      sortOrder: idx + 1,
      name: s.name,
    };
    if (s.description !== undefined) out.description = s.description;
    if (s.partLabel !== undefined) out.partLabel = s.partLabel;
    if (s.domain !== undefined) out.domain = s.domain;
    return out;
  });
}

/**
 * Map editor `QuestionDraftRow` rows onto `PagerQuestion[]`.
 *
 * Mirrors `buildQuestionsPayload`'s per-type emission so the preview shows a
 * question exactly as a save would persist it:
 *   - SLIDER_LIKERT → `scale` assembled from the flat scale* fields; no options.
 *   - MULTI_CHOICE  → `options[{key,label}]` (+ `maxChoices` when set); no scale.
 *   - TEXT / NUMBER → neither scale nor options.
 * `helpText` is emitted only when non-blank; `showIf` only when COMPLETE
 * (both keys non-empty) — a half-picked / cleared rule is dropped, exactly as
 * the serializer's anti-resurrection rule.
 */
export function draftQuestionsToPager(
  questions: QuestionDraftRow[],
): PagerQuestion[] {
  return questions.map((d) => {
    const out: PagerQuestion = {
      stableKey: d.stableKey,
      sortOrder: d.sortOrder,
      // Match buildQuestionsPayload, which always emits sectionStableKey (a
      // blank value resolves to the trailing "Other" page in buildSectionPages).
      sectionStableKey: d.sectionStableKey,
      type: d.type,
      label: d.label,
      isRequired: d.isRequired,
    };

    if (d.helpText.trim() !== "") out.helpText = d.helpText;

    if (d.type === "SLIDER_LIKERT") {
      out.scale = {
        min: d.scaleMin,
        max: d.scaleMax,
        step: d.scaleStep,
        anchorMin: d.anchorMin,
        anchorMax: d.anchorMax,
      };
    } else if (d.type === "MULTI_CHOICE") {
      out.options = d.options.map((o) => ({ key: o.key, label: o.label }));
      if (d.maxChoices !== null) out.maxChoices = d.maxChoices;
    }

    if (d.showIf && d.showIf.questionKey !== "" && d.showIf.optionKey !== "") {
      out.showIf = {
        questionKey: d.showIf.questionKey,
        optionKey: d.showIf.optionKey,
      };
    }

    return out;
  });
}

// ────────────────────────────────────────────────────────────────────────
// STORED JSON → pager (Active published version)
// ────────────────────────────────────────────────────────────────────────

function asString(v: unknown): string | undefined {
  return typeof v === "string" ? v : undefined;
}

function asFiniteNumber(v: unknown): number | undefined {
  return typeof v === "number" && Number.isFinite(v) ? v : undefined;
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null;
}

function toRecordArray(raw: unknown): Record<string, unknown>[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter(isRecord);
}

/**
 * Normalize the Active version's stored `sections` JSON onto `PagerSection[]`.
 * Tolerant: non-array ⇒ `[]`; garbage entries dropped; `sortOrder` falls back
 * to the array index and `name` to `""` when absent.
 */
export function storedSectionsToPager(raw: unknown): PagerSection[] {
  return toRecordArray(raw).map((s, idx) => {
    const out: PagerSection = {
      stableKey: asString(s.stableKey) ?? "",
      sortOrder: asFiniteNumber(s.sortOrder) ?? idx,
      name: asString(s.name) ?? "",
    };
    const description = asString(s.description);
    if (description !== undefined) out.description = description;
    const partLabel = asString(s.partLabel);
    if (partLabel !== undefined) out.partLabel = partLabel;
    const domain = asString(s.domain);
    if (domain !== undefined) out.domain = domain;
    return out;
  });
}

function normalizeScale(v: unknown): PagerQuestion["scale"] | undefined {
  if (!isRecord(v)) return undefined;
  const min = asFiniteNumber(v.min);
  const max = asFiniteNumber(v.max);
  const step = asFiniteNumber(v.step);
  if (min === undefined || max === undefined || step === undefined) {
    return undefined; // malformed ⇒ drop (tolerant, never throw)
  }
  return {
    min,
    max,
    step,
    anchorMin: asString(v.anchorMin) ?? "",
    anchorMax: asString(v.anchorMax) ?? "",
  };
}

function normalizeOptions(
  v: unknown,
): { key: string; label: string }[] | undefined {
  if (!Array.isArray(v)) return undefined;
  return v.filter(isRecord).map((o) => ({
    key: asString(o.key) ?? "",
    label: asString(o.label) ?? "",
  }));
}

function normalizeShowIf(
  v: unknown,
): { questionKey: string; optionKey: string } | undefined {
  if (!isRecord(v)) return undefined;
  const questionKey = asString(v.questionKey);
  const optionKey = asString(v.optionKey);
  if (!questionKey || !optionKey) return undefined; // incomplete ⇒ drop
  return { questionKey, optionKey };
}

/**
 * Normalize the Active version's stored `questions` JSON onto
 * `PagerQuestion[]`. Tolerant: non-array ⇒ `[]`; garbage entries dropped;
 * `type` falls back to `"TEXT"`, `isRequired` to `false`, `label` to `""`,
 * `sortOrder` to the array index. Optional `scale` / `options` / `maxChoices`
 * / `helpText` / `showIf` are read when present and well-formed, dropped
 * otherwise.
 */
export function storedQuestionsToPager(raw: unknown): PagerQuestion[] {
  return toRecordArray(raw).map((q, idx) => {
    const out: PagerQuestion = {
      stableKey: asString(q.stableKey) ?? "",
      sortOrder: asFiniteNumber(q.sortOrder) ?? idx,
      type: asString(q.type) ?? "TEXT",
      label: asString(q.label) ?? "",
      isRequired: q.isRequired === true,
    };

    const sectionStableKey = asString(q.sectionStableKey);
    if (sectionStableKey !== undefined) out.sectionStableKey = sectionStableKey;

    const helpText = asString(q.helpText);
    if (helpText !== undefined) out.helpText = helpText;

    const scale = normalizeScale(q.scale);
    if (scale !== undefined) out.scale = scale;

    const options = normalizeOptions(q.options);
    if (options !== undefined) out.options = options;

    const maxChoices = asFiniteNumber(q.maxChoices);
    if (maxChoices !== undefined) out.maxChoices = maxChoices;

    const showIf = normalizeShowIf(q.showIf);
    if (showIf !== undefined) out.showIf = showIf;

    return out;
  });
}
