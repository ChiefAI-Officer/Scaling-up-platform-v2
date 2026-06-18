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
 * Qualitative aggregation output (T4 fills `sections`). The shape is declared
 * here so T4 and the renderer share a contract; T3 emits it with EMPTY
 * sections.
 */
export interface GroupQualitativeReport {
  // T4 — per-section aggregated qualitative blocks go here.
  sections: GroupQualitativeSection[];
}

/** Placeholder qualitative-section shape (T4 refines/extends as needed). */
export interface GroupQualitativeSection {
  stableKey: string;
  name: string;
  // T4 — aggregated per-respondent items / matrices / choice tallies.
}

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

  // Dispatch — emit the matching section container with EMPTY sections.
  if (reportType === "qualitative") {
    report.qualitative = { sections: [] }; // T4 fills sections
  } else {
    report.scored = { sections: [] }; // T5 fills sections
  }

  return report;
}
