/**
 * Assessment v7.6 Wave E — qualitative-report-model.
 *
 * SHARED, pure data-shaping layer for the new Qualitative Report. NO HTML,
 * NO React, NO DB. Consumed by both the on-screen renderer and the email
 * twin so the two paths can never drift.
 *
 * What it does
 * ────────────
 * Given a respondent's submission shapes (the same in-memory shapes returned
 * by `getRespondentReport` — `sections`, `questionsByKey`, `rawAnswers`), it
 * builds a per-section model of ONLY the questions the respondent actually
 * answered, in section order, each section tagged with a PresentationKind so
 * the renderer can pick the right block (metric table / Q&A / matrix / bar /
 * statement table).
 *
 * Two design points worth calling out:
 *
 *  1. Answered-only + section-omission reproduces Esperto's conditional output
 *     without a conditional engine. If a respondent flags only 3 of 16 obstacle
 *     factors, only those 3 "why" rows survive; a fully-empty section is dropped
 *     entirely (mirrors the mockup's "Factors you did not flag are omitted").
 *
 *  2. Presence is TYPE-AWARE (`isReportAnswerPresent`). A real numeric 0 (e.g.
 *     LVA "Gross margin (in million)" = 0, "Number of branch-offices" = 0) is a
 *     PRESENT answer and must render — a naive `if (value)` would silently drop
 *     it. See the mockup metric table where 0 appears.
 *
 * The answer-row shape is the persisted `Answer[]` from `scoring.ts`:
 *   { stableKey: string; value: unknown }
 *   - SLIDER_LIKERT / NUMBER  → value is a finite number
 *   - TEXT (and text-like)    → value is a string
 *   - MULTI_CHOICE            → value is string[] (selected option keys)
 * (Confirmed against the org-survey submit route, which persists
 *  `answers.map(a => ({ stableKey, value }))` verbatim into the JSON column.)
 */

import { stripLegacyDecimalSuffix } from "@/lib/assessments/question-label";

// ─── Public types ──────────────────────────────────────────────────────────

export type PresentationKind =
  | "qa" // blue-heading question + free-text answer (Esperto Q&A rows)
  | "metric-table" // numeric metrics, one respondent column (LVA financials)
  | "percent-bar" // a single percentage rendered as a fill bar (rehire %)
  | "rating" // 1–N scale picks: matrix (1-3) or statement table (1-10)
  | "choices"; // MULTI_CHOICE picks + optional per-factor explanations

export interface QualItem {
  stableKey: string;
  /** Display label, with the legacy "(with 1 decimal)" suffix stripped. */
  label: string;
  /** Raw question type (SLIDER_LIKERT / NUMBER / TEXT / MULTI_CHOICE / …). */
  type: string;
  /** The respondent's submitted value, exactly as stored. */
  value: unknown;
  /** Scale bounds — populated for SLIDER_LIKERT ratings only. */
  min?: number;
  max?: number;
  /**
   * Display-ready values for MULTI_CHOICE items: each stored option KEY
   * resolved to its human LABEL via the question's `options` (fallback to the
   * raw key when no match). Renderers display these instead of `value` so
   * stored keys (`the_leadership`) never leak (co-validate C-H1). Present only
   * for MULTI_CHOICE.
   */
  displayValues?: string[];
}

export interface QualSection {
  stableKey: string;
  name: string;
  description?: string;
  kind: PresentationKind;
  items: QualItem[];
}

export interface QualitativeModel {
  sections: QualSection[];
}

export interface QMeta {
  type: string;
  label: string;
  sectionStableKey?: string;
  min?: number;
  max?: number;
  /** MULTI_CHOICE option list ({key,label}) — used to resolve stored keys to
   *  labels for display (C-H1). */
  options?: Array<{ key: string; label: string }>;
}

export interface BuildQualitativeModelInput {
  templateAlias?: string;
  sections: unknown;
  questionsByKey: Record<string, QMeta>;
  rawAnswers: unknown;
}

// ─── PART A — type-aware answer presence ─────────────────────────────────────

/**
 * Is this answer value "present" (answered) for report purposes?
 *
 * Type-aware so a real numeric 0 counts as present (NUMBER / SLIDER_LIKERT),
 * while a whitespace-only TEXT answer or an empty MULTI_CHOICE array does not.
 */
export function isReportAnswerPresent(type: string, value: unknown): boolean {
  switch (type) {
    case "NUMBER":
    case "SLIDER_LIKERT":
      return typeof value === "number" && Number.isFinite(value);
    case "TEXT":
    case "TEXTAREA":
    case "LONG_TEXT":
    case "SHORT_TEXT":
      return typeof value === "string" && value.trim() !== "";
    case "MULTI_CHOICE":
      return Array.isArray(value) && value.length > 0;
    default:
      return (
        value != null &&
        value !== "" &&
        !(Array.isArray(value) && value.length === 0)
      );
  }
}

// ─── PART B — presentation contract ──────────────────────────────────────────

/**
 * Per-template (alias) → per-section (sectionStableKey) presentation kind.
 *
 * Built directly from the approved mockup
 * (src/public/wireframes-phase2/wave-e-qualitative-report-mockup.html) plus the
 * seed section/question types (seed-lva-assessment.ts, seed-qsp-v{1,2}-assessment.ts).
 *
 * Mockup mapping:
 *   LVA  S1_financials  → metric table (all NUMBER, one column, NO Mean)
 *        S2_vision      → Q&A rows (TEXT)
 *        S5_explained   → Q&A rows for each flagged obstacle (TEXT; "choices"
 *                         family — explanations of the picked factors)
 *        S3_strengths   → 16-factor rating matrix (SLIDER_LIKERT 1–3)
 *        S4_obstacles   → the MULTI_CHOICE pick itself ("choices")
 *        S6_focus       → mostly Q&A; contains ONE percent NUMBER (rehire %).
 *                         v1 pragmatic choice (per the task): classify the whole
 *                         section as "qa" and let the renderer tag the percent
 *                         item — keeps a single block per section, matching the
 *                         seed's section grouping. (The mockup splits the rehire
 *                         bar into its own visual section, but the data lives in
 *                         S6_focus; the renderer can special-case the percent
 *                         item without a separate model section.)
 *   QSP  P1_retrospective (v2) / S2_rating + S3_quarter_grid (v1):
 *        rating block + statement table → "rating" (these sections contain the
 *        NUMBER overall rating + SLIDER statements; the renderer reads each
 *        item's type). For v1 the rating and the statement grid are distinct
 *        sections, so each maps cleanly.
 *        start/stop/keep + reflections (TEXT) → "qa".
 *
 * A section/alias NOT in this map falls through to a type-driven default
 * (see classifyByTypes) so future templates work without edits here.
 */
export const SECTION_PRESENTATION: Record<
  string,
  Record<string, PresentationKind>
> = {
  "leadership-vision-alignment": {
    S1_financials: "metric-table",
    S2_vision: "qa",
    S3_strengths: "rating",
    S4_obstacles: "choices",
    S5_explained: "choices",
    // S6_focus mixes a rehire-% NUMBER with many TEXT items. v1: render as Q&A
    // and let the renderer tag the percent item as a bar.
    S6_focus: "qa",
  },
  "qsp-v1": {
    S2_rating: "rating",
    S3_quarter_grid: "rating",
    S4_leadership_core_values: "qa",
    S5_start_stop_continue: "qa",
    S6_challenges: "qa",
    S7_rockefeller: "qa",
    S8_closing: "qa",
  },
  "qsp-v2": {
    // v2 packs the NUMBER rating + 5 SLIDER statements + the start/stop/keep
    // TEXT into a single P1_retrospective section. "rating" keeps the scored
    // statements visible; the renderer reads each item's type so the TEXT
    // reflections still render as Q&A within the same block.
    P1_retrospective: "rating",
    P2_personal_checkin: "rating",
    P3_growth_challenge: "qa",
    P4_focus: "qa",
    P5_closing: "qa",
  },
};

/**
 * Type-driven fallback for sections/aliases not in SECTION_PRESENTATION,
 * classifying from a bare list of question TYPES:
 *   - all NUMBER                 → metric-table
 *   - majority SLIDER_LIKERT     → rating
 *   - contains any MULTI_CHOICE  → choices
 *   - otherwise                  → qa
 *
 * Exported so the GROUP report model (group-report-model.ts) classifies each
 * section identically to the per-respondent report and the two cannot drift.
 */
export function classifyPresentationByTypes(types: string[]): PresentationKind {
  if (types.length === 0) return "qa";
  if (types.some((t) => t === "MULTI_CHOICE")) return "choices";

  const numberCount = types.filter((t) => t === "NUMBER").length;
  if (numberCount === types.length) return "metric-table";

  const sliderCount = types.filter((t) => t === "SLIDER_LIKERT").length;
  if (sliderCount > types.length / 2) return "rating";

  return "qa";
}

/**
 * Resolves the presentation kind for a section: the alias-keyed
 * SECTION_PRESENTATION map FIRST, else the type-driven fallback over the
 * section's question types. Shared by the per-respondent and group models.
 */
export function presentationKindForSection(
  alias: string | undefined,
  sectionStableKey: string,
  types: string[],
): PresentationKind {
  const aliasMap = alias ? SECTION_PRESENTATION[alias] : undefined;
  return aliasMap?.[sectionStableKey] ?? classifyPresentationByTypes(types);
}

function classifyByTypes(items: QualItem[]): PresentationKind {
  return classifyPresentationByTypes(items.map((i) => i.type));
}

// ─── Guards (mirror respondent-report.ts JSON-guarding posture) ──────────────

interface RawSection {
  stableKey: string;
  name: string;
  description?: string;
  /**
   * Section-embedded question membership (C-M3). Older / historical pinned LVA
   * & QSP versions carry their question keys on the SECTION here instead of (or
   * in addition to) a `sectionStableKey` on each question. Each entry is either
   * an object with a `stableKey` or a bare string key (mirrors the scored
   * renderer's `parseSections` in BrandedReport.tsx).
   */
  questionKeys: string[];
}

/**
 * Extracts the section-embedded question-key list from a raw `questions` field,
 * accepting both `[{ stableKey }]` and bare-string `["key"]` shapes (C-M3 — the
 * same membership shape BrandedReport.tsx's parseSections reads).
 */
export function extractSectionQuestionKeys(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  const keys: string[] = [];
  for (const q of raw) {
    if (typeof q === "string") {
      keys.push(q);
    } else if (q && typeof q === "object") {
      const qk = (q as Record<string, unknown>).stableKey;
      if (typeof qk === "string") keys.push(qk);
    }
  }
  return keys;
}

function isRawSection(v: unknown): v is RawSection {
  if (!v || typeof v !== "object") return false;
  const r = v as Record<string, unknown>;
  return typeof r.stableKey === "string" && typeof r.name === "string";
}

/** Normalizes a guarded raw section, lifting its embedded question keys (C-M3). */
function toRawSection(v: RawSection & Record<string, unknown>): RawSection {
  return {
    stableKey: v.stableKey,
    name: v.name,
    description: typeof v.description === "string" ? v.description : undefined,
    questionKeys: extractSectionQuestionKeys(v.questions),
  };
}

interface RawAnswerRow {
  stableKey: string;
  value: unknown;
}

function isRawAnswerRow(v: unknown): v is RawAnswerRow {
  if (!v || typeof v !== "object") return false;
  const r = v as Record<string, unknown>;
  return typeof r.stableKey === "string" && "value" in r;
}

// ─── Main builder ────────────────────────────────────────────────────────────

/**
 * Builds the per-section qualitative model from the respondent's submission.
 * Sections retain input order; questions retain version order. Unanswered
 * questions are dropped; fully-empty sections are omitted.
 */
export function buildQualitativeModel(
  input: BuildQualitativeModelInput,
): QualitativeModel {
  const { templateAlias, sections, questionsByKey, rawAnswers } = input;

  const sectionList: RawSection[] = Array.isArray(sections)
    ? (sections as unknown[])
        .filter(isRawSection)
        .map((s) => toRawSection(s as RawSection & Record<string, unknown>))
    : [];

  // Build stableKey → submitted value map from the raw answer rows.
  const answerByKey = new Map<string, unknown>();
  if (Array.isArray(rawAnswers)) {
    for (const row of rawAnswers as unknown[]) {
      if (isRawAnswerRow(row)) answerByKey.set(row.stableKey, row.value);
    }
  }

  const questionEntries = Object.entries(questionsByKey ?? {});

  // Index questions by their section, preserving questionsByKey insertion order
  // (which mirrors the version's question order).
  //
  // C-M3 — defensive grouping for OLD pinned versions: a question is assigned to
  // a section via `meta.sectionStableKey` FIRST; when that's absent (older
  // content shape), it's resolved via the SECTION's own embedded question-key
  // list (`sections[].questions`, lifted into `section.questionKeys`). A
  // question already placed by `sectionStableKey` is never duplicated by the
  // section-list pass. Without this, retroactively flipping a historical LVA/QSP
  // version to the qualitative renderer would produce an EMPTY report.
  const questionsBySection = new Map<string, Array<{ key: string; meta: QMeta }>>();
  const assignedKeys = new Set<string>();

  // Pass 1 — questions that carry their own sectionStableKey.
  const metaByKey = new Map<string, QMeta>();
  for (const [key, meta] of questionEntries) {
    metaByKey.set(key, meta);
    const sectionKey = meta.sectionStableKey;
    if (!sectionKey) continue;
    const bucket = questionsBySection.get(sectionKey) ?? [];
    bucket.push({ key, meta });
    questionsBySection.set(sectionKey, bucket);
    assignedKeys.add(key);
  }

  // Pass 2 — section-embedded membership for questions not yet assigned.
  for (const section of sectionList) {
    for (const key of section.questionKeys) {
      if (assignedKeys.has(key)) continue;
      const meta = metaByKey.get(key);
      if (!meta) continue;
      const bucket = questionsBySection.get(section.stableKey) ?? [];
      bucket.push({ key, meta });
      questionsBySection.set(section.stableKey, bucket);
      assignedKeys.add(key);
    }
  }

  const aliasMap = templateAlias ? SECTION_PRESENTATION[templateAlias] : undefined;

  /** Shapes a present answer row into a QualItem (shared with the orphan bucket). */
  const toItem = (key: string, meta: QMeta, value: unknown): QualItem => {
    const item: QualItem = {
      stableKey: key,
      label: stripLegacyDecimalSuffix(meta.label),
      type: meta.type,
      value,
    };
    if (typeof meta.min === "number") item.min = meta.min;
    if (typeof meta.max === "number") item.max = meta.max;

    // C-H1: resolve MULTI_CHOICE stored option KEYS → human LABELS so the
    // renderers never display raw keys. Fallback to the raw key when an
    // option has no matching label (or the question carries no options).
    if (meta.type === "MULTI_CHOICE" && Array.isArray(value)) {
      const labelByOptionKey = new Map<string, string>(
        (meta.options ?? []).map((o) => [o.key, o.label]),
      );
      item.displayValues = (value as unknown[]).map((v) => {
        const k = String(v);
        return labelByOptionKey.get(k) ?? k;
      });
    }

    return item;
  };

  const out: QualSection[] = [];

  for (const section of sectionList) {
    const questions = questionsBySection.get(section.stableKey) ?? [];

    const items: QualItem[] = [];
    for (const { key, meta } of questions) {
      const value = answerByKey.get(key);
      if (!isReportAnswerPresent(meta.type, value)) continue;
      items.push(toItem(key, meta, value));
    }

    // Omit a section with zero present items (Esperto conditional output).
    if (items.length === 0) continue;

    const kind =
      aliasMap?.[section.stableKey] ?? classifyByTypes(items);

    const qualSection: QualSection = {
      stableKey: section.stableKey,
      name: section.name,
      kind,
      items,
    };
    if (typeof section.description === "string" && section.description.trim() !== "") {
      qualSection.description = section.description;
    }
    out.push(qualSection);
  }

  // C-M3 — "Additional responses" bucket: any ANSWERED question that resolved to
  // no section (no sectionStableKey AND not referenced by any section's list)
  // must still surface so content is never silently dropped (mirrors the scored
  // renderer's orphanRows handling). The bucket only appears when it has ≥1
  // present item; a section with zero present items is still omitted.
  const orphanItems: QualItem[] = [];
  for (const [key, meta] of questionEntries) {
    if (assignedKeys.has(key)) continue;
    const value = answerByKey.get(key);
    if (!isReportAnswerPresent(meta.type, value)) continue;
    orphanItems.push(toItem(key, meta, value));
  }
  if (orphanItems.length > 0) {
    out.push({
      stableKey: "__additional_responses__",
      name: "Additional responses",
      kind: "qa",
      items: orphanItems,
    });
  }

  return { sections: out };
}
