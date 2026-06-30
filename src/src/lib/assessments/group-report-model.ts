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
import { benchmarksFor } from "@/lib/assessments/su-full-benchmarks";
import {
  GROUP_RENDER_VERSION,
  LVA_TEMPLATE_ALIAS,
  lvaReportFactorLabel,
  lvaReportQuestionLabel,
  scaledRatingValue,
  s3ValuesInDomain,
} from "@/lib/assessments/lva-report-display";

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
  /** Raw mean on the stored scale (1–3 for LVA S3). The SORT KEY + provenance. */
  mean: number;
  /**
   * Wave L (L3) — the factor's value on Esperto's 0–10 axis (LVA S3 ONLY:
   * Weak=0/Avg=5/Strong=10, mean over all contributors incl. CEO, ceil to 1dp).
   * `null` for any non-LVA / non-S3 section, AND for an LVA S3 factor that has
   * an out-of-domain (≠{1,2,3}) value — the renderer falls back to raw `mean`.
   */
  scaledValue: number | null;
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
 * Scored aggregation output (T5). MIRRORS the per-respondent scored report
 * headline (BrandedReport: per-section table → per-domain cards → ScaleUp
 * Score → tier) rather than inventing a new shape (R1-HIGH-2). Every figure is
 * read VERBATIM from each submission's FROZEN `result` (a `ScoreResult`) —
 * NEVER recomputed (R1-HIGH-1, rule 5). The team aggregate ALWAYS excludes the
 * CEO (rule 1); a key with zero non-CEO contributors → `teamAvg`/`dev` null
 * (the N<2 fallback, rule 2).
 *
 * Blocks are PRESENCE-driven (rule 3): `domains` is present iff any submission
 * carries `result.perDomain`; `scaleUpScore` iff any carries `result.scaleUpScore`;
 * `tier` is always present (it summarizes `result.tier.label`). For a plain
 * section-only template (Rockefeller / Five-Dysfunctions) `domains` and
 * `scaleUpScore` are `undefined`.
 */
export interface GroupScoredReport {
  /** Per-section CEO-vs-team rows (the base/fallback for non-domain templates). */
  sections: GroupScoredSection[];
  /** Per-question CEO-vs-team means (CEO-excluded teamMean). */
  questions: GroupScoredQuestion[];
  /** Present iff any submission's `result` carries `perDomain` (rule 3). */
  domains?: GroupScoredDomain[];
  /** Present iff any submission's `result` carries `scaleUpScore` (rule 3). */
  scaleUpScore?: GroupScoredScaleUp;
  /** CEO tier label + the team's tier-label distribution (CEO-excluded). */
  tier: GroupScoredTier;
  /**
   * Wave J/K (Task 3) — Esperto "Anonymous Team" Appendix B: a pseudonymized,
   * de-identified per-member domain grid. Present iff `domains` is present (i.e.
   * SU-Full, the only scored group report carrying per-domain scores). One row
   * per cohort member in display order (CEO first, then alphabetical). The CEO
   * row is labelled "CEO" (a role, de-identified — matches the Esperto source);
   * the non-CEO members are numbered "Person 1".."Person N". NO names, NO job
   * titles. Cells carry each person's FROZEN per-domain averagePoints (verbatim,
   * never recomputed) on the 4 domains People/Strategy/Execution/Cash; the
   * CEO-personal "you" domain is excluded (source spec). `undefined` for any
   * non-domain scored report so the renderer omits the grid entirely.
   */
  appendixB?: GroupAppendixBRow[];
}

/**
 * The 4 domains shown in Appendix B — People/Strategy/Execution/Cash. The
 * CEO-personal "you" domain is intentionally EXCLUDED (Esperto source spec:
 * Appendix B columns are People/Strategy/Execution/Cash, NOT "You").
 */
export const APPENDIX_B_DOMAIN_KEYS = [
  "people",
  "strategy",
  "execution",
  "cash",
] as const;

export type AppendixBDomainKey = (typeof APPENDIX_B_DOMAIN_KEYS)[number];

/**
 * One pseudonymized Appendix B row: a de-identified "Person N" label + that
 * person's 0–10 score per Appendix-B domain (`null` where they answered none in
 * that domain). NO respondentId / name / jobTitle is carried — the row is fully
 * de-identified at the data layer (the renderer never has a name to leak).
 */
export interface GroupAppendixBRow {
  /** "CEO" for the CEO row; "Person 1".."Person N" for non-CEO members (display order). */
  personLabel: string;
  /** domain key → that person's frozen averagePoints, or null when unanswered. */
  domainScores: Record<AppendixBDomainKey, number | null>;
}

/**
 * A scored section row mirroring a per-respondent `perSection` entry's
 * `averagePoints`. `ceo` = the CEO submission's averagePoints for this section
 * (null when the CEO didn't submit or didn't answer it); `teamAvg` = arithmetic
 * mean of the NON-CEO submissions' averagePoints (null when N<2 — i.e. zero
 * non-CEO contributors); `dev = ceo - teamAvg` (null when either is null).
 * `n` = count of non-CEO submissions that contributed a value.
 */
export interface GroupScoredSection {
  stableKey: string;
  name: string;
  ceo: number | null;
  teamAvg: number | null;
  dev: number | null;
  n: number;
  /**
   * Peers benchmark (Wave J / J-2). Attached ONLY for the SU-Full alias by
   * `applyBenchmarks`; `undefined` for every other template (omit-empty so the
   * renderer never shows a Peers column). `peers` = the static peer mean for
   * this section; `devPeers = ceo - peers`; `devPeersTeam = teamAvg - peers`
   * (the standing signal when there is no CEO column).
   */
  peers?: number | null;
  devPeers?: number | null;
  devPeersTeam?: number | null;
}

/**
 * A scored per-domain row mirroring a per-respondent `perDomain` card's
 * `averagePoints`. CEO-excluded team mean (same null/dev rules as a section).
 */
export interface GroupScoredDomain {
  key: string;
  label: string;
  ceo: number | null;
  teamAvg: number | null;
  dev: number | null;
  n: number;
  /** Peers benchmark (Wave J / J-2). See `GroupScoredSection` for semantics. */
  peers?: number | null;
  devPeers?: number | null;
  devPeersTeam?: number | null;
}

/** The 0-100 ScaleUp Score headline: CEO value + CEO-excluded team mean. */
export interface GroupScoredScaleUp {
  ceo: number | null;
  teamAvg: number | null;
  /**
   * Peers benchmark (Wave J / J-2). Attached ONLY for the SU-Full alias.
   * `peers` = the static peer ScaleUp mean (0–100); `devPeers = ceo - peers`.
   */
  peers?: number | null;
  devPeers?: number | null;
}

/**
 * The tier headline: the CEO submission's tier label (null when no CEO
 * submission / no tier) + the distribution of NON-CEO submissions' tier labels.
 */
export interface GroupScoredTier {
  ceo: string | null;
  teamDistribution: Array<{ label: string; count: number }>;
}

/**
 * A scored per-question CEO-vs-team row: `ceo` = the CEO submission's
 * `perQuestion.value` (null when absent); `teamMean` = mean of the NON-CEO
 * submissions' values for this question (null when no non-CEO answered it);
 * `n` = non-CEO answerer count. `label` from `questionsByKey`.
 */
export interface GroupScoredQuestion {
  stableKey: string;
  label: string;
  ceo: number | null;
  teamMean: number | null;
  n: number;
}

/**
 * Wave L (L3) — model render provenance. Code-only display ruleset version + a
 * degraded signal for the S3 0–10 scaling. `scaleDegraded` flips true when an
 * LVA S3 factor carries an out-of-domain (≠{1,2,3}) value and its scaledValue is
 * therefore suppressed (the renderer falls back to raw mean). Carried into the
 * GROUP_REPORT_VIEW audit so a viewed report is attributable to the exact ruleset.
 */
export interface GroupRenderProvenance {
  groupRenderVersion: string;
  scaleDegraded: boolean;
}

export interface CampaignGroupReport {
  /** scored | qualitative — resolved from reportConfigFor(alias). */
  reportType: ReportType;
  /** Wave L — the render-ruleset version + the S3 scale-degraded signal. */
  provenance: GroupRenderProvenance;
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
  /**
   * Wave J / J-2 — Peers benchmark + tier presentation policy.
   *
   *  - `showTier` = reportConfigFor(alias).showTier — the group renderer's tier
   *    band toggle (SU-Full suppresses it; everyone else shows it).
   *  - `benchmarkVersion` = the applied Peers benchmark version string, ONLY
   *    when ≥1 peer row was attached to the scored report; `undefined` when no
   *    benchmark applied (non-SU-Full, empty cohort) OR on a key mismatch.
   *  - `benchmarkKeyMismatch` = true when the scored report carried a
   *    domain/section key the benchmark does not cover (seed/version drift):
   *    Peers are then cleared entirely (fail-closed; never a partial table) and
   *    this flag drives the audit/metric + the launch-blocking alert.
   */
  showTier?: boolean;
  benchmarkVersion?: string;
  benchmarkKeyMismatch?: boolean;
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
  /** The submission's raw frozen `result` (a ScoreResult) — read by the scored
   *  path only; never recomputed. Kept raw so qualitative campaigns ignore it. */
  result: unknown;
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
  alias: string | undefined,
  stableKey: string,
  name: string,
  questions: Array<{ key: string; meta: QuestionMeta }>,
  respondents: GroupRespondent[],
  answersByRespondent: AnswersByRespondent,
  /** Wave L — flipped true when an LVA S3 factor has an out-of-domain value. */
  signal: { scaleDegraded: boolean },
): GroupRatingSection | null {
  // Wave L (L3): the Esperto 0–10 scaled value is LVA-S3-specific. The 0/5/10
  // mapping must NOT leak into the generic rating contract — gate it on the LVA
  // alias AND the S3 section key. Non-LVA / non-S3 keep scaledValue null.
  const isLvaStrengths =
    alias === LVA_TEMPLATE_ALIAS && stableKey === "S3_strengths";

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

    // Wave L (L3): the 0–10 scaled display value, ONLY for LVA S3 AND ONLY when
    // every contributing value is in the {1,2,3} domain (imported/legacy rows
    // can break this even though the live survey can't). An out-of-domain factor
    // → scaledValue null (renderer falls back to raw mean) + scaleDegraded.
    let scaledValue: number | null = null;
    if (isLvaStrengths) {
      if (s3ValuesInDomain(values)) {
        scaledValue = scaledRatingValue(strong, avg, weak);
      } else {
        signal.scaleDegraded = true;
      }
    }

    factors.push({
      stableKey: key,
      label: isLvaStrengths
        ? lvaReportFactorLabel(key, stripLegacyDecimalSuffix(meta.label))
        : stripLegacyDecimalSuffix(meta.label),
      strong,
      avg,
      weak,
      mean: meanOf(values),
      scaledValue,
      n: values.length,
    });
  }
  if (factors.length === 0) return null;
  // Sort stays keyed on raw `mean` (monotonic with scaledValue for in-domain S3).
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
  alias: string | undefined,
  stableKey: string,
  name: string,
  question: { key: string; meta: QuestionMeta },
  respondents: GroupRespondent[],
  answersByRespondent: AnswersByRespondent,
): GroupChoicesSection | null {
  const { key, meta } = question;
  const options = meta.options ?? [];
  if (options.length === 0) return null;

  // Wave L (L4a): for LVA, the obstacle option labels use the Esperto *report*
  // labels (the bare factor slug → report label override), not the survey labels.
  const isLva = alias === LVA_TEMPLATE_ALIAS;

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
    const label = isLva ? lvaReportFactorLabel(o.key, o.label) : o.label;
    return { key: o.key, label, count, pct: round((count / n) * 100), n };
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
  alias: string | undefined,
  stableKey: string,
  name: string,
  questions: Array<{ key: string; meta: QuestionMeta }>,
  respondents: GroupRespondent[],
  answersByRespondent: AnswersByRespondent,
): GroupQaSection | null {
  // Wave L follow-on: in the LVA "Obstacles and Challenges Explained" section,
  // rewrite each S5 "Why is <factor> a hindrance?" heading to the Esperto REPORT
  // factor label so it matches the rating/obstacles labels (no within-report
  // "staff" vs "employees" mismatch). No-op for non-LVA / non-S5_why labels.
  const isLva = alias === LVA_TEMPLATE_ALIAS;
  const qaLabel = (key: string, raw: string): string =>
    isLva ? lvaReportQuestionLabel(key, raw) : raw;
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
        label: qaLabel(key, stripLegacyDecimalSuffix(meta.label)),
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
      label: qaLabel(key, stripLegacyDecimalSuffix(meta.label)),
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
  /** Wave L — flipped by buildRatingSection when an LVA S3 value is out-of-domain. */
  signal: { scaleDegraded: boolean },
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
          alias,
          section.stableKey,
          section.name,
          questions,
          respondents,
          answersByRespondent,
          signal,
        );
        break;
      case "choices": {
        // Use the first MULTI_CHOICE question in the section (LVA has exactly
        // one — S4_biggest_obstacles); fall back to qa when none is present.
        const mc = questions.find((q) => q.meta.type === "MULTI_CHOICE");
        built = mc
          ? buildChoicesSection(
              alias,
              section.stableKey,
              section.name,
              mc,
              respondents,
              answersByRespondent,
            )
          : buildQaSection(
              alias,
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
          alias,
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

// ─── Scored section + headline aggregation (T5) ──────────────────────────────
//
// Reads each submission's FROZEN `result` (a ScoreResult) VERBATIM — never
// recomputes a score (R1-HIGH-1, rule 5). The team aggregate ALWAYS excludes
// the CEO (rule 1); a key with zero non-CEO contributors → null teamAvg/dev
// (the N<2 fallback, rule 2). A malformed/missing result row is skipped (its
// contribution is dropped) and flips `degraded`.

/** A defensively-parsed view of a submission's frozen ScoreResult. */
interface ParsedScoreResult {
  /** stableKey → averagePoints (finite numbers only). */
  sectionAvg: Map<string, number>;
  /** stableKey → section display name (first-seen wins; for section ordering). */
  sectionName: Map<string, string>;
  /** domain key → averagePoints (finite numbers only; null entries dropped). */
  domainAvg: Map<string, number>;
  /** domain key → label (first-seen wins). */
  domainLabel: Map<string, string>;
  /** stableKey → perQuestion.value (finite numbers only). */
  questionValue: Map<string, number>;
  /** finite scaleUpScore, or null. */
  scaleUpScore: number | null;
  /** tier.label, or null. */
  tierLabel: string | null;
  /** true when the result row carried perDomain (drives the domains block). */
  hasDomains: boolean;
  /** true when the result row carried a finite scaleUpScore. */
  hasScaleUpScore: boolean;
}

function num(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

/**
 * Parse a frozen `result` into a ParsedScoreResult. Returns null when the result
 * is not a usable object (caller treats that submission as a non-contributor +
 * flips degraded). NEVER throws.
 */
function parseScoreResult(result: unknown): ParsedScoreResult | null {
  if (!result || typeof result !== "object") return null;
  const r = result as Record<string, unknown>;

  const parsed: ParsedScoreResult = {
    sectionAvg: new Map(),
    sectionName: new Map(),
    domainAvg: new Map(),
    domainLabel: new Map(),
    questionValue: new Map(),
    scaleUpScore: null,
    tierLabel: null,
    hasDomains: false,
    hasScaleUpScore: false,
  };

  if (Array.isArray(r.perSection)) {
    for (const row of r.perSection as unknown[]) {
      if (!row || typeof row !== "object") continue;
      const s = row as Record<string, unknown>;
      if (typeof s.stableKey !== "string") continue;
      const avg = num(s.averagePoints);
      if (avg !== null) parsed.sectionAvg.set(s.stableKey, avg);
      if (typeof s.name === "string" && !parsed.sectionName.has(s.stableKey)) {
        parsed.sectionName.set(s.stableKey, s.name);
      }
    }
  }

  if (Array.isArray(r.perDomain)) {
    parsed.hasDomains = true;
    for (const row of r.perDomain as unknown[]) {
      if (!row || typeof row !== "object") continue;
      const d = row as Record<string, unknown>;
      if (typeof d.key !== "string") continue;
      const avg = num(d.averagePoints); // null when "no data" (kept absent)
      if (avg !== null) parsed.domainAvg.set(d.key, avg);
      if (typeof d.label === "string" && !parsed.domainLabel.has(d.key)) {
        parsed.domainLabel.set(d.key, d.label);
      }
    }
  }

  if (Array.isArray(r.perQuestion)) {
    for (const row of r.perQuestion as unknown[]) {
      if (!row || typeof row !== "object") continue;
      const q = row as Record<string, unknown>;
      if (typeof q.stableKey !== "string") continue;
      const value = num(q.value);
      if (value !== null) parsed.questionValue.set(q.stableKey, value);
    }
  }

  const sus = num(r.scaleUpScore);
  if (sus !== null) {
    parsed.scaleUpScore = sus;
    parsed.hasScaleUpScore = true;
  }

  if (r.tier && typeof r.tier === "object") {
    const t = r.tier as Record<string, unknown>;
    if (typeof t.label === "string") parsed.tierLabel = t.label;
  }

  return parsed;
}

/** A cohort member's parsed result, tagged CEO/non-CEO, for scored aggregation. */
interface ScoredMember {
  isCEO: boolean;
  parsed: ParsedScoreResult;
}

/** CEO-excluded team mean of the values a getter pulls (null when none). */
function teamMeanBy(
  members: ScoredMember[],
  get: (p: ParsedScoreResult) => number | null,
): { teamAvg: number | null; n: number } {
  const values: number[] = [];
  for (const m of members) {
    if (m.isCEO) continue;
    const v = get(m.parsed);
    if (v !== null) values.push(v);
  }
  return values.length > 0 ? { teamAvg: meanOf(values), n: values.length } : { teamAvg: null, n: 0 };
}

/** The CEO submission's value via a getter (first CEO member; null when none). */
function ceoValueBy(
  members: ScoredMember[],
  get: (p: ParsedScoreResult) => number | null,
): number | null {
  for (const m of members) {
    if (!m.isCEO) continue;
    const v = get(m.parsed);
    if (v !== null) return v;
  }
  return null;
}

const devOf = (ceo: number | null, teamAvg: number | null): number | null =>
  ceo === null || teamAvg === null ? null : ceo - teamAvg;

/**
 * Builds the scored aggregation: per-section + per-question CEO-vs-team rows,
 * plus the presence-driven headline blocks (domains / scaleUpScore / tier).
 * PURE — reads each member's parsed FROZEN result; never recomputes.
 *
 * Section ORDER + display NAMES come from `version.sections` (mirrors the
 * per-respondent report); a section the version doesn't list falls back to the
 * result's own name. Only sections at least one submission scored are emitted.
 */
function buildScoredReport(
  sectionsRaw: unknown,
  questionsByKey: Record<string, QuestionMeta>,
  scoredMembers: ScoredMember[],
): GroupScoredReport {
  const sectionList = parseGroupSections(sectionsRaw);

  // Resolve a display name for a section key: version first, else result-carried.
  const versionName = new Map(sectionList.map((s) => [s.stableKey, s.name]));
  const resultName = (key: string): string => {
    for (const m of scoredMembers) {
      const n = m.parsed.sectionName.get(key);
      if (n) return n;
    }
    return key;
  };

  // Collect every section key any submission scored, in version order first,
  // then any extra keys (result-only) in first-seen order.
  const orderedKeys: string[] = [];
  const seen = new Set<string>();
  for (const s of sectionList) {
    orderedKeys.push(s.stableKey);
    seen.add(s.stableKey);
  }
  for (const m of scoredMembers) {
    for (const key of m.parsed.sectionAvg.keys()) {
      if (!seen.has(key)) {
        orderedKeys.push(key);
        seen.add(key);
      }
    }
  }

  const sections: GroupScoredSection[] = [];
  for (const key of orderedKeys) {
    // Skip a section nobody scored (Esperto conditional output parity).
    if (!scoredMembers.some((m) => m.parsed.sectionAvg.has(key))) continue;
    const ceo = ceoValueBy(scoredMembers, (p) => p.sectionAvg.get(key) ?? null);
    const { teamAvg, n } = teamMeanBy(
      scoredMembers,
      (p) => p.sectionAvg.get(key) ?? null,
    );
    sections.push({
      stableKey: key,
      name: versionName.get(key) ?? resultName(key),
      ceo,
      teamAvg,
      dev: devOf(ceo, teamAvg),
      n,
    });
  }

  // Per-question rows — one per scored question any submission carries, in
  // questionsByKey (version question) order, then any result-only keys.
  const questionKeys: string[] = [];
  const qSeen = new Set<string>();
  for (const key of Object.keys(questionsByKey)) {
    questionKeys.push(key);
    qSeen.add(key);
  }
  for (const m of scoredMembers) {
    for (const key of m.parsed.questionValue.keys()) {
      if (!qSeen.has(key)) {
        questionKeys.push(key);
        qSeen.add(key);
      }
    }
  }
  const questions: GroupScoredQuestion[] = [];
  for (const key of questionKeys) {
    if (!scoredMembers.some((m) => m.parsed.questionValue.has(key))) continue;
    const ceo = ceoValueBy(scoredMembers, (p) => p.questionValue.get(key) ?? null);
    const { teamAvg, n } = teamMeanBy(
      scoredMembers,
      (p) => p.questionValue.get(key) ?? null,
    );
    questions.push({
      stableKey: key,
      label: stripLegacyDecimalSuffix(questionsByKey[key]?.label ?? key),
      ceo,
      teamMean: teamAvg,
      n,
    });
  }

  const report: GroupScoredReport = {
    sections,
    questions,
    tier: buildScoredTier(scoredMembers),
  };

  // Domains block — present iff any submission carried perDomain.
  if (scoredMembers.some((m) => m.parsed.hasDomains)) {
    report.domains = buildScoredDomains(scoredMembers);
  }

  // ScaleUp Score block — present iff any submission carried a finite score.
  if (scoredMembers.some((m) => m.parsed.hasScaleUpScore)) {
    const ceo = ceoValueBy(scoredMembers, (p) => p.scaleUpScore);
    const { teamAvg } = teamMeanBy(scoredMembers, (p) => p.scaleUpScore);
    report.scaleUpScore = { ceo, teamAvg };
  }

  return report;
}

/** Per-domain CEO-vs-team rows, in first-seen domain order across submissions. */
function buildScoredDomains(scoredMembers: ScoredMember[]): GroupScoredDomain[] {
  const orderedKeys: string[] = [];
  const seen = new Set<string>();
  const labelByKey = new Map<string, string>();
  for (const m of scoredMembers) {
    for (const [key, label] of m.parsed.domainLabel) {
      if (!labelByKey.has(key)) labelByKey.set(key, label);
    }
    // Order keys by their appearance in perDomain (label map preserves order).
    for (const key of m.parsed.domainLabel.keys()) {
      if (!seen.has(key)) {
        orderedKeys.push(key);
        seen.add(key);
      }
    }
  }

  const domains: GroupScoredDomain[] = [];
  for (const key of orderedKeys) {
    const ceo = ceoValueBy(scoredMembers, (p) => p.domainAvg.get(key) ?? null);
    const { teamAvg, n } = teamMeanBy(
      scoredMembers,
      (p) => p.domainAvg.get(key) ?? null,
    );
    domains.push({
      key,
      label: labelByKey.get(key) ?? key,
      ceo,
      teamAvg,
      dev: devOf(ceo, teamAvg),
      n,
    });
  }
  return domains;
}

/**
 * Wave J/K (Task 3) — builds the pseudonymized Appendix B grid IN DISPLAY ORDER
 * (the `respondents` array is already CEO-first then alphabetical), each row
 * carrying that member's FROZEN per-domain averagePoints on the 4 Appendix-B
 * domains (the "you" domain is excluded). A domain the member did not answer
 * (absent from `parsed.domainAvg`) → null.
 *
 * Mirrors the `domains` aggregation's source (each member's parsed perDomain) so
 * the grid can never drift from the by-domain matrix. PURE — never recomputes.
 *
 * Row labels match the Esperto source (18j-su-full-source-extract.md §133): the
 * CEO row is labelled "CEO" (a ROLE, not a name — still de-identified, and not a
 * privacy regression since the report is already CEO-vs-team); the non-CEO
 * members are numbered "Person 1".."Person N" in their existing order. A no-CEO
 * cohort simply numbers everyone "Person 1..N" (no CEO row).
 *
 * A member without a parsed result (its submission failed result parsing) is
 * skipped — it never appears in `parsedById`, so it contributes no row.
 */
function buildAppendixB(
  respondents: GroupRespondent[],
  parsedById: Map<string, ParsedScoreResult>,
): GroupAppendixBRow[] {
  const rows: GroupAppendixBRow[] = [];
  let personN = 0;
  for (const r of respondents) {
    const parsed = parsedById.get(r.respondentId);
    if (!parsed) continue; // a member whose result didn't parse → no row
    const domainScores = {} as Record<AppendixBDomainKey, number | null>;
    for (const key of APPENDIX_B_DOMAIN_KEYS) {
      const v = parsed.domainAvg.get(key);
      domainScores[key] = typeof v === "number" ? v : null;
    }
    // CEO → "CEO" (role, de-identified); everyone else → "Person 1".."Person N".
    const personLabel = r.isCEO ? "CEO" : `Person ${(personN += 1)}`;
    rows.push({ personLabel, domainScores });
  }
  return rows;
}

/** CEO tier label + the non-CEO team's tier-label distribution. */
function buildScoredTier(scoredMembers: ScoredMember[]): GroupScoredTier {
  let ceo: string | null = null;
  for (const m of scoredMembers) {
    if (m.isCEO && m.parsed.tierLabel) {
      ceo = m.parsed.tierLabel;
      break;
    }
  }
  // Distribution over non-CEO submissions, in first-seen label order.
  const counts = new Map<string, number>();
  for (const m of scoredMembers) {
    if (m.isCEO) continue;
    const label = m.parsed.tierLabel;
    if (!label) continue;
    counts.set(label, (counts.get(label) ?? 0) + 1);
  }
  const teamDistribution = Array.from(counts, ([label, count]) => ({ label, count }));
  return { ceo, teamDistribution };
}

// ─── Peers benchmark application (Wave J / J-2) ──────────────────────────────
//
// Attaches the static, versioned Peers benchmark onto the BUILT scored report.
// SU-Full ONLY (benchmarksFor returns null for every other alias → no-op). The
// `devOf` helper above (`ceo - x`) is reused for BOTH the CEO-vs-peer deviation
// and the team-vs-peer deviation, so the standing signal survives a no-CEO
// cohort (devPeersTeam = teamAvg - peers).

/**
 * Attaches Peers/devPeers (+ devPeersTeam on domains/sections) onto the scored
 * report's domains, sections, and ScaleUp headline, and returns the application
 * metadata for provenance/metrics.
 *
 *  - version flows out ONLY when ≥1 peer row was actually applied,
 *  - FAIL-CLOSED on key skew (R3-Mc): if the report carries a domain/section
 *    key the benchmark does not cover (a seed/version drift), EVERY attached
 *    peer is cleared so the renderer omits Peers entirely (never a partial,
 *    misleading table) and `keyMismatch:true` flows to the audit/metric + alert.
 *
 * Mutates `report` in place (it is freshly built by `buildScoredReport`).
 */
export function applyBenchmarks(
  report: GroupScoredReport,
  alias?: string | null,
): { version?: string; keyMismatch: boolean } {
  const b = benchmarksFor(alias);
  if (!b) return { keyMismatch: false };

  let applied = 0;
  let missing = 0;

  const fill = (
    row: { ceo: number | null; teamAvg: number | null },
    peer: number | undefined,
    set: (p: number, dCeo: number | null, dTeam: number | null) => void,
  ): void => {
    if (typeof peer === "number") {
      set(peer, devOf(row.ceo, peer), devOf(row.teamAvg, peer));
      applied++;
    } else {
      missing++;
    }
  };

  for (const d of report.domains ?? []) {
    fill(d, b.domain[d.key as keyof typeof b.domain], (p, dc, dt) => {
      d.peers = p;
      d.devPeers = dc;
      d.devPeersTeam = dt;
    });
  }
  for (const s of report.sections) {
    fill(s, b.section[s.stableKey as keyof typeof b.section], (p, dc, dt) => {
      s.peers = p;
      s.devPeers = dc;
      s.devPeersTeam = dt;
    });
  }
  if (report.scaleUpScore && typeof b.scaleUp === "number") {
    report.scaleUpScore.peers = b.scaleUp;
    report.scaleUpScore.devPeers = devOf(report.scaleUpScore.ceo, b.scaleUp);
    applied++;
  }

  // FAIL-CLOSED on key skew (R3-Mc): a missing expected key means the seed /
  // version drifted from the benchmark — do NOT show a partial/misleading Peers
  // table. Clear EVERY peer so the renderer omits the column entirely.
  if (missing > 0) {
    for (const d of report.domains ?? []) {
      d.peers = undefined;
      d.devPeers = undefined;
      d.devPeersTeam = undefined;
    }
    for (const s of report.sections) {
      s.peers = undefined;
      s.devPeers = undefined;
      s.devPeersTeam = undefined;
    }
    if (report.scaleUpScore) {
      report.scaleUpScore.peers = undefined;
      report.scaleUpScore.devPeers = undefined;
    }
    return { version: undefined, keyMismatch: true };
  }

  return { version: applied > 0 ? b.version : undefined, keyMismatch: false };
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
  const config = reportConfigFor(input?.alias);
  const reportType = config.reportType;
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
      result: sub.result,
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

  // Dispatch — aggregate the matching section container.
  let qualitative: GroupQualitativeReport | undefined;
  let scored: GroupScoredReport | undefined;

  // Peers benchmark application metadata (Wave J / J-2). Set only on the scored
  // path (benchmarksFor is alias-scoped to SU-Full); stays undefined/false for
  // qualitative templates (LVA/QSP) and any non-SU-Full scored template.
  let benchmarkVersion: string | undefined;
  let benchmarkKeyMismatch = false;
  // Wave L (L3) — the S3 0–10-scale degraded signal (out-of-domain values).
  const scaleSignal = { scaleDegraded: false };

  if (reportType === "qualitative") {
    qualitative = {
      sections: buildQualitativeSections(
        input?.alias,
        input?.version?.sections,
        questionsByKey,
        respondents,
        answersByRespondent,
        scaleSignal,
      ),
    };
  } else {
    // Parse each submission's FROZEN result; a malformed/missing result is a
    // non-contributor that flips degraded (rule 5) — the submission still
    // stays in the cohort (it remains in `respondents`).
    const scoredMembers: ScoredMember[] = [];
    // Keep a respondentId → parsed map (display-ordered Appendix B lookup).
    const parsedById = new Map<string, ParsedScoreResult>();
    for (const m of members) {
      const parsed = parseScoreResult(m.result);
      if (parsed === null) {
        degraded = true;
        continue;
      }
      scoredMembers.push({ isCEO: m.isCEO, parsed });
      parsedById.set(m.respondentId, parsed);
    }
    scored = buildScoredReport(input?.version?.sections, questionsByKey, scoredMembers);
    // Appendix B (Task 3) — the pseudonymized per-member domain grid. Built ONLY
    // when the scored report carries per-domain scores (i.e. SU-Full), in the
    // cohort's display order (`respondents`). Non-domain scored reports
    // (Rockefeller / Five-D) leave appendixB undefined → renderer omits it.
    if (scored.domains && scored.domains.length > 0) {
      scored.appendixB = buildAppendixB(respondents, parsedById);
    }
    // Attach the static Peers benchmark (SU-Full only); the result drives the
    // version + key-mismatch fields below (and the loader's provenance, T7).
    const applied = applyBenchmarks(scored, input?.alias);
    benchmarkVersion = applied.version;
    benchmarkKeyMismatch = applied.keyMismatch;
  }

  return {
    reportType,
    provenance: {
      groupRenderVersion: GROUP_RENDER_VERSION,
      scaleDegraded: scaleSignal.scaleDegraded,
    },
    respondents,
    respondentCount: respondents.length,
    degraded,
    questionsByKey,
    answersByRespondent,
    showTier: config.showTier,
    ...(benchmarkVersion !== undefined ? { benchmarkVersion } : {}),
    benchmarkKeyMismatch,
    ...(qualitative ? { qualitative } : {}),
    ...(scored ? { scored } : {}),
  };
}
