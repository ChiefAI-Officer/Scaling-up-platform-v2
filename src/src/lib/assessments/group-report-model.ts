/**
 * Assessment v7.6 Wave F #22 — group-report-model CORE.
 *
 * SHARED, pure data-shaping layer for the campaign GROUP report (Esperto's
 * "CEO Full Report"): a read-only view that aggregates ALL completed
 * submissions of a campaign into a single team report. NO HTML, NO React,
 * NO DB — a pure function over plain in-memory inputs (callers denormalize
 * the Prisma rows into `GroupReportInput`).
 *
 * Scope of T3 (THIS file): the SHARED CORE only —
 *   1. the input/output type contract that T4/T5 depend on,
 *   2. cohort assembly (one entry per completed submission),
 *   3. CEO-first-then-alphabetical respondent ordering,
 *   4. per-respondent answer normalization + validation, and
 *   5. the scored|qualitative dispatch (reportConfigFor(alias)).
 *
 * NOT in scope of T3 (left as clearly-marked stubs the later tasks fill):
 *   - qualitative section aggregation  → T4
 *   - scored section aggregation       → T5
 * Both `qualitative.sections` and `scored.sections` are emitted EMPTY here.
 *
 * Design notes
 * ────────────
 *  - Mirrors the per-respondent report pipeline: it reuses
 *    `buildQuestionMetaByKey` (the single source of truth for stableKey →
 *    {type,label,section,scale,options}) and `reportConfigFor` (the alias →
 *    {reportType} dispatch), so the group report can never drift from the
 *    per-respondent report on metadata or report-type.
 *  - Cohort is SUBMISSION-based (ADR-0011 invariant 1): each completed
 *    submission with a respondentId is a cohort member. An orphan submission
 *    (respondentId not in participants) is NEVER dropped (invariant 2).
 *  - Answer normalization is TYPE-AWARE and mirrors the spirit of the
 *    per-respondent model's `isReportAnswerPresent`: a finite numeric 0 is a
 *    PRESENT answer (e.g. LVA "Gross margin" = 0), not blank. A type-mismatch,
 *    a non-finite number, or an unknown stableKey is treated as ABSENT (the
 *    answer is dropped) and flips `degraded` true — but the SUBMISSION stays
 *    in the cohort.
 *  - `answersByRespondent` is the validated, ready-to-aggregate structure that
 *    T4/T5 consume: a Map<respondentId, Map<stableKey, NormalizedAnswer>> so
 *    the later tasks never have to re-validate raw answers.
 */

import {
  buildQuestionMetaByKey,
  type QuestionMeta,
} from "@/lib/assessments/question-meta";
import { reportConfigFor, type ReportType } from "@/lib/assessments/report-config";
import {
  extractSectionQuestionKeys,
  presentationKindForSection,
} from "@/lib/assessments/qualitative-report-model";
import { stripLegacyDecimalSuffix } from "@/lib/assessments/question-label";

// ─── Input contract (plain data — no DB) ────────────────────────────────────

/** Minimal respondent profile carried on participant rows + submission rows. */
export interface GroupReportRespondentProfile {
  firstName?: string | null;
  lastName?: string | null;
  jobTitle?: string | null;
}

/** A campaign participant row (the source of `isCEO` + the canonical name). */
export interface GroupReportParticipantInput {
  respondentId: string;
  isCEO: boolean;
  respondent: GroupReportRespondentProfile;
}

/**
 * A completed submission. `respondentId` is nullable on the schema (PUBLIC
 * submissions), but group reports are for INVITED campaigns; a null/blank
 * respondentId submission cannot be keyed into the cohort and is skipped.
 * `respondent` is the submission's OWN respondent relation — used to name an
 * orphan whose participant row is missing.
 */
export interface GroupReportSubmissionInput {
  respondentId: string | null;
  answers: unknown;
  result: unknown;
  respondent?: GroupReportRespondentProfile | null;
}

export interface GroupReportInput {
  /** Template alias — drives reportType via reportConfigFor(alias). */
  alias: string;
  /**
   * The pinned template version (raw JSON columns). `sections` is unused by the
   * T3 core (cohort assembly is submission-based) but is carried on the input
   * so T4 (qualitative section grouping/order) and T5 (per-section scored
   * aggregation) can read it without a second loader.
   */
  version: { questions: unknown; sections?: unknown; scoringConfig?: unknown };
  participants: GroupReportParticipantInput[];
  submissions: GroupReportSubmissionInput[];
}

// ─── Output contract (what renderers + T4/T5 consume) ────────────────────────

/** One cohort member, in display order (CEO first, then alphabetical). */
export interface GroupRespondent {
  respondentId: string;
  /** "firstName lastName".trim(); falls back to jobTitle, then "Respondent". */
  name: string;
  jobTitle: string | null;
  isCEO: boolean;
  /** true when this submission's respondentId is NOT in the participants list. */
  isOrphan: boolean;
}

/**
 * A validated, normalized answer value, ready for aggregation:
 *   - NUMBER / SLIDER_LIKERT → a finite number
 *   - TEXT (and text-like)   → a non-empty string
 *   - MULTI_CHOICE           → a de-duped array of KNOWN option keys
 * Absent/invalid answers are never stored (they're dropped + flip `degraded`).
 */
export type NormalizedAnswer = number | string | string[];

/**
 * Per-respondent validated answers: respondentId → (stableKey → NormalizedAnswer).
 * Present-only — a key is absent from the inner map when the respondent did not
 * answer it (or the answer failed normalization). This is the structure T4/T5
 * aggregate over; they MUST NOT re-validate.
 */
export type AnswersByRespondent = Map<string, Map<string, NormalizedAnswer>>;

/**
 * Qualitative aggregation output. The renderer (T7) switches on each section's
 * `presentation` discriminant.
 */
export interface GroupQualitativeReport {
  sections: GroupQualitativeSection[];
}

// ── Qualitative section payloads (discriminated by `presentation`) ───────────

/**
 * A single metric row in a metric-table section. `mean` is the arithmetic mean
 * over respondents who ANSWERED this metric (a blank is excluded, NOT averaged
 * as 0); `perRespondent` carries one cell per cohort member in `respondents`
 * order — a non-answerer contributes `value: null`. `n` = answerer count.
 */
export interface GroupMetricRow {
  stableKey: string;
  label: string;
  mean: number;
  n: number;
  perRespondent: Array<{ respondentId: string; value: number | null }>;
}

export interface GroupMetricTableSection {
  stableKey: string;
  name: string;
  presentation: "metric-table";
  rows: GroupMetricRow[];
}

/**
 * A single rated factor in a rating section (e.g. an LVA strength on the 1–3
 * Weak/Average/Strong scale). `strong`/`avg`/`weak` are answerer counts of the
 * top/middle/bottom value; `mean` is the mean of the raw scale values over
 * answerers; `n` = answerer count.
 */
export interface GroupRatingFactor {
  stableKey: string;
  label: string;
  strong: number;
  avg: number;
  weak: number;
  mean: number;
  n: number;
}

export interface GroupRatingSection {
  stableKey: string;
  name: string;
  presentation: "rating";
  /** Sorted by `mean` descending. */
  factors: GroupRatingFactor[];
}

/**
 * A single option tally in a choices section. `count` = how many respondents
 * picked it; `n` = respondents who ANSWERED the multi-choice question (a blank
 * does NOT dilute); `pct` = round(count / n * 100).
 */
export interface GroupChoiceOption {
  key: string;
  label: string;
  count: number;
  pct: number;
  n: number;
}

export interface GroupChoicesSection {
  stableKey: string;
  name: string;
  presentation: "choices";
  /** The multi-choice question this section's options belong to. */
  question: { stableKey: string; label: string };
  /** ALL options (including 0%), sorted by pct then count descending. */
  options: GroupChoiceOption[];
  /** Respondents who answered the multi-choice question (the denominator). */
  n: number;
}

/** A free-text question's answers in a qa section (answerers only, CEO-first). */
export interface GroupQaTextQuestion {
  stableKey: string;
  label: string;
  kind: "text";
  answers: Array<{
    respondentId: string;
    name: string;
    isCEO: boolean;
    text: string;
  }>;
}

/** A standalone NUMBER question in a qa section (answerers only, CEO-first). */
export interface GroupQaNumberQuestion {
  stableKey: string;
  label: string;
  kind: "number";
  perRespondent: Array<{
    respondentId: string;
    name: string;
    isCEO: boolean;
    value: number;
  }>;
  mean: number;
  n: number;
}

export type GroupQaQuestion = GroupQaTextQuestion | GroupQaNumberQuestion;

export interface GroupQaSection {
  stableKey: string;
  name: string;
  presentation: "qa";
  questions: GroupQaQuestion[];
}

/**
 * A qualitative section, discriminated by `presentation` so the renderer (T7)
 * can switch on it. A SLIDER_LIKERT or MULTI_CHOICE question that lands inside a
 * "qa" section is rendered via the rating/choices sub-form embedded in the
 * matching section type — see the aggregation in `buildGroupReportModel`.
 */
export type GroupQualitativeSection =
  | GroupMetricTableSection
  | GroupRatingSection
  | GroupChoicesSection
  | GroupQaSection;

/**
 * Scored aggregation output (T5 fills `sections`). Declared here for the
 * contract; T3 emits it with EMPTY sections.
 */
export interface GroupScoredReport {
  // T5 — per-section means / per-question Mean+respondent columns go here.
  sections: GroupScoredSection[];
}

/** Placeholder scored-section shape (T5 refines/extends as needed). */
export interface GroupScoredSection {
  stableKey: string;
  name: string;
  // T5 — aggregated Mean + per-respondent score columns.
}

export interface CampaignGroupReport {
  /** scored | qualitative — resolved from reportConfigFor(alias). */
  reportType: ReportType;
  /** Cohort members in display order (CEO first, then alphabetical by name). */
  respondents: GroupRespondent[];
  /** Count of completed submissions in the cohort. */
  respondentCount: number;
  /** true if any answer failed validation/normalization (submission kept). */
  degraded: boolean;
  /**
   * stableKey → QuestionMeta (type/label/section/scale/options), from the
   * shared builder. Renderers + T4/T5 resolve labels/options/types from here.
   */
  questionsByKey: Record<string, QuestionMeta>;
  /**
   * Validated per-respondent answers, ready to aggregate. Keyed by the same
   * respondentIds present in `respondents`.
   */
  answersByRespondent: AnswersByRespondent;
  /** Present when reportType === "qualitative" (sections EMPTY until T4). */
  qualitative?: GroupQualitativeReport;
  /** Present when reportType === "scored" (sections EMPTY until T5). */
  scored?: GroupScoredReport;
}

// ─── Raw answer-row guard (mirror qualitative-report-model posture) ─────────

interface RawAnswerRow {
  stableKey: string;
  value: unknown;
}

function isRawAnswerRow(v: unknown): v is RawAnswerRow {
  if (!v || typeof v !== "object") return false;
  const r = v as Record<string, unknown>;
  return typeof r.stableKey === "string" && "value" in r;
}

// ─── Name resolution ─────────────────────────────────────────────────────────

/**
 * Display name from a respondent profile: "firstName lastName".trim(); falls
 * back to jobTitle (trimmed), then "Respondent" (invariant 5).
 *
 * When NO profile relation exists at all (a fully-orphan submission with a null
 * respondent), the name is "Unknown respondent" (invariant 2) — distinct from a
 * present-but-empty profile, which yields "Respondent".
 */
function resolveName(profile: GroupReportRespondentProfile | null | undefined): string {
  if (profile == null) return "Unknown respondent";
  const first = (profile.firstName ?? "").trim();
  const last = (profile.lastName ?? "").trim();
  const full = `${first} ${last}`.trim();
  if (full !== "") return full;
  const title = (profile.jobTitle ?? "").trim();
  if (title !== "") return title;
  return "Respondent";
}

// ─── Answer normalization (type-aware; mirrors isReportAnswerPresent) ────────

/**
 * Validate + normalize a single raw answer value against its question meta.
 * Returns the normalized value, or `undefined` when the answer is absent /
 * invalid (the caller drops it and flips `degraded`).
 *
 *   - NUMBER / SLIDER_LIKERT → a finite number (a real 0 is PRESENT).
 *   - TEXT (and text-like)   → a non-empty (trimmed) string.
 *   - MULTI_CHOICE           → array of KNOWN option keys, unknown dropped,
 *                              de-duped (order of first occurrence preserved).
 *   - other / unknown type   → conservative: finite number | non-empty string
 *                              | non-empty string[] passes through; else absent.
 */
export function normalizeAnswer(
  meta: QuestionMeta,
  rawValue: unknown,
): NormalizedAnswer | undefined {
  switch (meta.type) {
    case "NUMBER":
    case "SLIDER_LIKERT":
      return typeof rawValue === "number" && Number.isFinite(rawValue)
        ? rawValue
        : undefined;

    case "TEXT":
    case "TEXTAREA":
    case "LONG_TEXT":
    case "SHORT_TEXT":
      return typeof rawValue === "string" && rawValue.trim() !== ""
        ? rawValue
        : undefined;

    case "MULTI_CHOICE": {
      if (!Array.isArray(rawValue)) return undefined;
      const known = new Set((meta.options ?? []).map((o) => o.key));
      const out: string[] = [];
      const seen = new Set<string>();
      for (const v of rawValue) {
        if (typeof v !== "string") continue;
        // When the question carries options, keep only KNOWN keys; when it
        // carries none (malformed/legacy), keep non-empty strings as-is.
        if (known.size > 0 && !known.has(v)) continue;
        if (v === "" || seen.has(v)) continue;
        seen.add(v);
        out.push(v);
      }
      return out.length > 0 ? out : undefined;
    }

    default:
      if (typeof rawValue === "number" && Number.isFinite(rawValue)) return rawValue;
      if (typeof rawValue === "string" && rawValue.trim() !== "") return rawValue;
      if (Array.isArray(rawValue)) {
        const strs = rawValue.filter(
          (v): v is string => typeof v === "string" && v !== "",
        );
        return strs.length > 0 ? strs : undefined;
      }
      return undefined;
  }
}

// ─── Internal cohort assembly ────────────────────────────────────────────────

interface CohortMember {
  respondentId: string;
  profile: GroupReportRespondentProfile | null;
  isCEO: boolean;
  isOrphan: boolean;
  answers: Map<string, NormalizedAnswer>;
}

// ─── Qualitative section grouping + aggregation (T4) ─────────────────────────

interface GroupRawSection {
  stableKey: string;
  name: string;
  questionKeys: string[];
}

function isGroupRawSection(v: unknown): v is Record<string, unknown> {
  if (!v || typeof v !== "object") return false;
  const r = v as Record<string, unknown>;
  return typeof r.stableKey === "string" && typeof r.name === "string";
}

/**
 * Parses `version.sections` into ordered {stableKey, name, questionKeys}.
 * Section ORDER + display NAMES come from here (mirrors the per-respondent
 * model). Each section's embedded question-key list (older pinned versions)
 * is lifted via the shared `extractSectionQuestionKeys`.
 */
function parseGroupSections(sections: unknown): GroupRawSection[] {
  if (!Array.isArray(sections)) return [];
  const out: GroupRawSection[] = [];
  for (const s of sections as unknown[]) {
    if (!isGroupRawSection(s)) continue;
    const r = s as Record<string, unknown>;
    out.push({
      stableKey: r.stableKey as string,
      name: r.name as string,
      questionKeys: extractSectionQuestionKeys(r.questions),
    });
  }
  return out;
}

/**
 * Groups questionsByKey into sections, mirroring the per-respondent model's
 * two-pass C-M3 logic: a question is placed by its `sectionStableKey` first;
 * when that's absent (older content shape) it's resolved via the SECTION's own
 * embedded question-key list. Questions placed by sectionStableKey are never
 * duplicated by the section-list pass. Insertion order (= version question
 * order) is preserved within each section.
 */
function groupQuestionsBySection(
  questionsByKey: Record<string, QuestionMeta>,
  sectionList: GroupRawSection[],
): Map<string, Array<{ key: string; meta: QuestionMeta }>> {
  const bySection = new Map<string, Array<{ key: string; meta: QuestionMeta }>>();
  const assigned = new Set<string>();
  const entries = Object.entries(questionsByKey);

  // Pass 1 — questions carrying their own sectionStableKey.
  for (const [key, meta] of entries) {
    const sectionKey = meta.sectionStableKey;
    if (!sectionKey) continue;
    const bucket = bySection.get(sectionKey) ?? [];
    bucket.push({ key, meta });
    bySection.set(sectionKey, bucket);
    assigned.add(key);
  }

  // Pass 2 — section-embedded membership for not-yet-assigned questions.
  for (const section of sectionList) {
    for (const key of section.questionKeys) {
      if (assigned.has(key)) continue;
      const meta = questionsByKey[key];
      if (!meta) continue;
      const bucket = bySection.get(section.stableKey) ?? [];
      bucket.push({ key, meta });
      bySection.set(section.stableKey, bucket);
      assigned.add(key);
    }
  }

  return bySection;
}

const round = (n: number): number => Math.round(n);

/** Mean of a non-empty number array (caller guarantees length > 0). */
function meanOf(values: number[]): number {
  return values.reduce((a, b) => a + b, 0) / values.length;
}

/**
 * Builds a metric-table section: one row per NUMBER metric that ≥1 respondent
 * answered. `mean` is over answerers (blanks excluded); `perRespondent` carries
 * a cell for EVERY cohort member (null when not answered), in `respondents`
 * order. A metric nobody answered is omitted. Returns null when no row survives.
 */
function buildMetricTableSection(
  stableKey: string,
  name: string,
  questions: Array<{ key: string; meta: QuestionMeta }>,
  respondents: GroupRespondent[],
  answersByRespondent: AnswersByRespondent,
): GroupMetricTableSection | null {
  const rows: GroupMetricRow[] = [];
  for (const { key, meta } of questions) {
    const perRespondent: Array<{ respondentId: string; value: number | null }> = [];
    const answered: number[] = [];
    for (const r of respondents) {
      const v = answersByRespondent.get(r.respondentId)?.get(key);
      if (typeof v === "number") {
        perRespondent.push({ respondentId: r.respondentId, value: v });
        answered.push(v);
      } else {
        perRespondent.push({ respondentId: r.respondentId, value: null });
      }
    }
    if (answered.length === 0) continue; // omit a metric nobody answered
    rows.push({
      stableKey: key,
      label: stripLegacyDecimalSuffix(meta.label),
      mean: meanOf(answered),
      n: answered.length,
      perRespondent,
    });
  }
  if (rows.length === 0) return null;
  return { stableKey, name, presentation: "metric-table", rows };
}

/**
 * Builds a rating section: one factor per SLIDER_LIKERT question ≥1 respondent
 * answered. `strong`/`avg`/`weak` are answerer counts of the top / middle /
 * bottom value (top = scale max when known, else the observed max; bottom =
 * scale min when known, else observed min); `mean` is the mean of the raw
 * values over answerers. Factors sorted by mean DESC. Null when none survive.
 */
function buildRatingSection(
  stableKey: string,
  name: string,
  questions: Array<{ key: string; meta: QuestionMeta }>,
  respondents: GroupRespondent[],
  answersByRespondent: AnswersByRespondent,
): GroupRatingSection | null {
  const factors: GroupRatingFactor[] = [];
  for (const { key, meta } of questions) {
    const values: number[] = [];
    for (const r of respondents) {
      const v = answersByRespondent.get(r.respondentId)?.get(key);
      if (typeof v === "number") values.push(v);
    }
    if (values.length === 0) continue;

    // Determine the top/bottom value for strong/weak buckets. Prefer the scale
    // bounds; fall back to the observed range so a malformed scale never crashes.
    const max = typeof meta.max === "number" ? meta.max : Math.max(...values);
    const min = typeof meta.min === "number" ? meta.min : Math.min(...values);
    const strong = values.filter((v) => v === max).length;
    const weak = values.filter((v) => v === min).length;
    const avg = values.length - strong - weak;

    factors.push({
      stableKey: key,
      label: stripLegacyDecimalSuffix(meta.label),
      strong,
      avg,
      weak,
      mean: meanOf(values),
      n: values.length,
    });
  }
  if (factors.length === 0) return null;
  factors.sort((a, b) => b.mean - a.mean);
  return { stableKey, name, presentation: "rating", factors };
}

/**
 * Builds a choices section from a single MULTI_CHOICE question: the denominator
 * `n` is respondents who ANSWERED that question (a blank does NOT dilute);
 * `count` per option is selections across answerers; `pct = round(count/n*100)`.
 * ALL options are shown (incl. 0%), labelled (not keyed), sorted by pct then
 * count DESC. Null when the question was answered by nobody or carries no
 * options.
 */
function buildChoicesSection(
  stableKey: string,
  name: string,
  question: { key: string; meta: QuestionMeta },
  respondents: GroupRespondent[],
  answersByRespondent: AnswersByRespondent,
): GroupChoicesSection | null {
  const { key, meta } = question;
  const options = meta.options ?? [];
  if (options.length === 0) return null;

  // Tally selections + count answerers (only respondents whose normalized
  // answer is a present, non-empty string[] count toward the denominator).
  const counts = new Map<string, number>();
  let n = 0;
  for (const r of respondents) {
    const v = answersByRespondent.get(r.respondentId)?.get(key);
    if (!Array.isArray(v)) continue;
    n += 1;
    for (const picked of v) counts.set(picked, (counts.get(picked) ?? 0) + 1);
  }
  if (n === 0) return null; // nobody answered → omit (Esperto conditional output)

  const tallied: GroupChoiceOption[] = options.map((o) => {
    const count = counts.get(o.key) ?? 0;
    return { key: o.key, label: o.label, count, pct: round((count / n) * 100), n };
  });
  tallied.sort((a, b) => b.pct - a.pct || b.count - a.count);

  return {
    stableKey,
    name,
    presentation: "choices",
    question: { stableKey: key, label: stripLegacyDecimalSuffix(meta.label) },
    options: tallied,
    n,
  };
}

/**
 * Builds a qa section: one block per question that ≥1 respondent answered.
 *   - TEXT-like  → a text block (answerers only, CEO-first via `respondents`).
 *   - NUMBER     → a number block (perRespondent + mean over answerers).
 *   - other (SLIDER_LIKERT / MULTI_CHOICE inside a qa section, or UNKNOWN) →
 *     rendered defensively as a text block by stringifying the value, so a
 *     mixed/legacy section never crashes and never silently drops content.
 * A question nobody answered is omitted; null when no block survives.
 */
function buildQaSection(
  stableKey: string,
  name: string,
  questions: Array<{ key: string; meta: QuestionMeta }>,
  respondents: GroupRespondent[],
  answersByRespondent: AnswersByRespondent,
): GroupQaSection | null {
  const out: GroupQaQuestion[] = [];

  for (const { key, meta } of questions) {
    if (meta.type === "NUMBER") {
      const perRespondent: GroupQaNumberQuestion["perRespondent"] = [];
      const values: number[] = [];
      for (const r of respondents) {
        const v = answersByRespondent.get(r.respondentId)?.get(key);
        if (typeof v === "number") {
          perRespondent.push({
            respondentId: r.respondentId,
            name: r.name,
            isCEO: r.isCEO,
            value: v,
          });
          values.push(v);
        }
      }
      if (values.length === 0) continue;
      out.push({
        stableKey: key,
        label: stripLegacyDecimalSuffix(meta.label),
        kind: "number",
        perRespondent,
        mean: meanOf(values),
        n: values.length,
      });
      continue;
    }

    // TEXT-like and any other type → a text block (defensive stringification).
    const answers: GroupQaTextQuestion["answers"] = [];
    for (const r of respondents) {
      const v = answersByRespondent.get(r.respondentId)?.get(key);
      if (v === undefined) continue;
      const text =
        typeof v === "string"
          ? v
          : Array.isArray(v)
            ? v.join(", ")
            : String(v);
      if (text.trim() === "") continue;
      answers.push({
        respondentId: r.respondentId,
        name: r.name,
        isCEO: r.isCEO,
        text,
      });
    }
    if (answers.length === 0) continue;
    out.push({
      stableKey: key,
      label: stripLegacyDecimalSuffix(meta.label),
      kind: "text",
      answers,
    });
  }

  if (out.length === 0) return null;
  return { stableKey, name, presentation: "qa", questions: out };
}

/**
 * Aggregates ALL qualitative sections from the validated cohort. Section order
 * + names come from `version.sections`; each section's presentation kind comes
 * from the shared `presentationKindForSection` (alias map → type fallback), so
 * the group report can never drift from the per-respondent report. A section
 * with no present content is omitted (Esperto conditional output). PURE.
 */
function buildQualitativeSections(
  alias: string | undefined,
  sectionsRaw: unknown,
  questionsByKey: Record<string, QuestionMeta>,
  respondents: GroupRespondent[],
  answersByRespondent: AnswersByRespondent,
): GroupQualitativeSection[] {
  const sectionList = parseGroupSections(sectionsRaw);
  const questionsBySection = groupQuestionsBySection(questionsByKey, sectionList);

  const out: GroupQualitativeSection[] = [];

  for (const section of sectionList) {
    const questions = questionsBySection.get(section.stableKey) ?? [];
    if (questions.length === 0) continue;

    const kind = presentationKindForSection(
      alias,
      section.stableKey,
      questions.map((q) => q.meta.type),
    );

    let built: GroupQualitativeSection | null = null;
    switch (kind) {
      case "metric-table":
        built = buildMetricTableSection(
          section.stableKey,
          section.name,
          questions,
          respondents,
          answersByRespondent,
        );
        break;
      case "rating":
        built = buildRatingSection(
          section.stableKey,
          section.name,
          questions,
          respondents,
          answersByRespondent,
        );
        break;
      case "choices": {
        // Use the first MULTI_CHOICE question in the section (LVA has exactly
        // one — S4_biggest_obstacles); fall back to qa when none is present.
        const mc = questions.find((q) => q.meta.type === "MULTI_CHOICE");
        built = mc
          ? buildChoicesSection(
              section.stableKey,
              section.name,
              mc,
              respondents,
              answersByRespondent,
            )
          : buildQaSection(
              section.stableKey,
              section.name,
              questions,
              respondents,
              answersByRespondent,
            );
        break;
      }
      // "qa", "percent-bar", and any future kind → qa block (defensive).
      default:
        built = buildQaSection(
          section.stableKey,
          section.name,
          questions,
          respondents,
          answersByRespondent,
        );
        break;
    }

    if (built) out.push(built);
  }

  return out;
}

// ─── Main builder ──────────────────────────────────────────────────────────

/**
 * Builds the shared group-report CORE model. Pure; NEVER throws.
 *
 * Invariants (ADR-0011):
 *   1. Cohort = ALL completed submissions (one entry per submission with a
 *      usable respondentId).
 *   2. Orphan-robust: a submission whose respondentId is not in `participants`
 *      is still included (named from the submission's own respondent, else
 *      "Unknown respondent") and flagged isOrphan.
 *   3. CEO comes from the participant row; if the CEO participant has no
 *      completed submission, nobody is marked CEO.
 *   4. Ordering: CEO first, then alphabetical by display name (deterministic).
 *   5. Name: "firstName lastName".trim(); fall back to jobTitle, then "Respondent".
 *   6. Answer normalization drops invalid answers + flips degraded; a finite 0
 *      is present.
 *   7. Empty cohort → respondentCount 0, empty respondents, no throw.
 */
export function buildGroupReportModel(input: GroupReportInput): CampaignGroupReport {
  const reportType = reportConfigFor(input?.alias).reportType;
  const questionsByKey = buildQuestionMetaByKey(input?.version?.questions);

  // Participant lookups: respondentId → profile (canonical name) + isCEO set.
  const participantProfileById = new Map<string, GroupReportRespondentProfile>();
  const ceoRespondentIds = new Set<string>();
  const participants = Array.isArray(input?.participants) ? input.participants : [];
  for (const p of participants) {
    if (!p || typeof p.respondentId !== "string" || p.respondentId === "") continue;
    if (p.respondent) participantProfileById.set(p.respondentId, p.respondent);
    if (p.isCEO === true) ceoRespondentIds.add(p.respondentId);
  }

  // Assemble the cohort — one entry per completed submission (invariant 1).
  // A submission's own profile is the orphan name source (invariant 2).
  const submissions = Array.isArray(input?.submissions) ? input.submissions : [];
  const members: CohortMember[] = [];
  let degraded = false;

  for (const sub of submissions) {
    if (!sub) continue;
    const respondentId =
      typeof sub.respondentId === "string" && sub.respondentId !== ""
        ? sub.respondentId
        : null;
    // PUBLIC / keyless submissions cannot be placed in an invited cohort.
    if (!respondentId) continue;

    const isOrphan = !participantProfileById.has(respondentId);
    // Prefer the participant profile (canonical at add-time); fall back to the
    // submission's own respondent relation (the only name source for orphans).
    const profile =
      participantProfileById.get(respondentId) ?? sub.respondent ?? null;

    // Normalize this respondent's answers (invariant 6).
    const answers = new Map<string, NormalizedAnswer>();
    if (Array.isArray(sub.answers)) {
      for (const row of sub.answers as unknown[]) {
        if (!isRawAnswerRow(row)) {
          degraded = true;
          continue;
        }
        const meta = questionsByKey[row.stableKey];
        if (!meta) {
          // Unknown stableKey — ignore but flag (invariant 6).
          degraded = true;
          continue;
        }
        const normalized = normalizeAnswer(meta, row.value);
        if (normalized === undefined) {
          // Type-mismatch / non-finite / empty — dropped + flagged.
          degraded = true;
          continue;
        }
        answers.set(row.stableKey, normalized);
      }
    } else if (sub.answers != null) {
      // A non-array, non-null answers payload is malformed.
      degraded = true;
    }

    members.push({
      respondentId,
      profile,
      isCEO: ceoRespondentIds.has(respondentId),
      isOrphan,
      answers,
    });
  }

  // Order: CEO first, then alphabetical by display name (invariant 4).
  // Names are resolved once for both ordering and output (invariant 5).
  const named = members.map((m) => ({
    member: m,
    name: resolveName(m.profile),
  }));
  named.sort((a, b) => {
    if (a.member.isCEO !== b.member.isCEO) return a.member.isCEO ? -1 : 1;
    const byName = a.name.localeCompare(b.name);
    if (byName !== 0) return byName;
    // Deterministic tie-break on respondentId.
    return a.member.respondentId.localeCompare(b.member.respondentId);
  });

  const respondents: GroupRespondent[] = named.map(({ member, name }) => ({
    respondentId: member.respondentId,
    name,
    jobTitle: (member.profile?.jobTitle ?? null) || null,
    isCEO: member.isCEO,
    isOrphan: member.isOrphan,
  }));

  // Keyed by respondentId. ASSUMPTION: every submission fed in belongs to the
  // SAME campaign, so (campaignId, respondentId) is unique here — i.e. one
  // submission per respondentId. A future caller MUST NOT feed multiple
  // campaigns' submissions through one call: two submissions sharing a
  // respondentId would silently collide (last-writer-wins) on this map.
  const answersByRespondent: AnswersByRespondent = new Map();
  for (const m of members) {
    answersByRespondent.set(m.respondentId, m.answers);
  }

  const report: CampaignGroupReport = {
    reportType,
    respondents,
    respondentCount: respondents.length,
    degraded,
    questionsByKey,
    answersByRespondent,
  };

  // Dispatch — aggregate the matching section container.
  if (reportType === "qualitative") {
    report.qualitative = {
      sections: buildQualitativeSections(
        input?.alias,
        input?.version?.sections,
        questionsByKey,
        respondents,
        answersByRespondent,
      ),
    };
  } else {
    report.scored = { sections: [] }; // T5 fills sections
  }

  return report;
}
