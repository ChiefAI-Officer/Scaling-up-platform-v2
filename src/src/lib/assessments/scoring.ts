/**
 * Assessment Tool v1 — scoreSubmission().
 *
 * Pure, side-effect-free scoring function for SLIDER_LIKERT assessments.
 * Backs the INVITED + PUBLIC submission paths. The submission API routes
 * are thin wrappers — all math, all validation, all tier resolution lives here.
 *
 * Design notes
 * ────────────
 * - No Prisma / no DB imports. Input shape is a plain TS type; tests pass it
 *   in directly. Route handlers must denormalize an AssessmentTemplateVersion
 *   row into this shape (its JSON columns are unknown to Prisma).
 * - Typed errors via `ScoringValidationError` — codes are NOT HTTP statuses.
 *   Route handlers map codes → 400/422 as appropriate.
 * - Dynamic tier-domain validation: the function verifies the scoringConfig's
 *   tiers cover the full metric domain implied by the questions, with no gaps
 *   and no overlaps. This catches mis-configured templates at scoring time
 *   rather than at admin-edit time (defence in depth).
 * - v1 supports SLIDER_LIKERT only on the scoring path. Future question types
 *   (TEXT, MULTI_SELECT, etc.) require extending the Zod schema + the per-answer
 *   validation switch — they intentionally fall through to INVALID_TYPE today.
 */

import { z } from "zod";

// ─── Zod schemas (input validation) ──────────────────────────────────────

export const SliderLikertScaleSchema = z.object({
  min: z.number().int(),
  max: z.number().int(),
  step: z.number().int().positive(),
  anchorMin: z.string(),
  anchorMax: z.string(),
});

export const QuestionSchema = z.object({
  stableKey: z.string(),
  sortOrder: z.number().int(),
  type: z.literal("SLIDER_LIKERT"),
  label: z.string(),
  helpText: z.string().optional(),
  sectionStableKey: z.string().optional(),
  isRequired: z.boolean(),
  scale: SliderLikertScaleSchema,
});

export const SectionSchema = z.object({
  stableKey: z.string(),
  sortOrder: z.number().int(),
  name: z.string(),
  description: z.string().optional(),
  partLabel: z.string().optional(),
});

export const TierSchema = z.object({
  minMetric: z.number(),
  maxMetric: z.number().optional(),
  label: z.string(),
  message: z.string(),
});

export const ScoringConfigSchema = z.object({
  tierMetric: z.enum(["countAchieved", "overallTotal", "overallAvg"]),
  passThreshold: z.number(),
  tiers: z.array(TierSchema).min(1),
});

export const TemplateVersionForScoringSchema = z.object({
  questions: z.array(QuestionSchema),
  sections: z.array(SectionSchema),
  scoringConfig: ScoringConfigSchema,
});

export type TemplateVersionForScoring = z.infer<
  typeof TemplateVersionForScoringSchema
>;

export const AnswerSchema = z.object({
  stableKey: z.string(),
  // Allow any value at Zod parse time; validate strictly inside scoreSubmission
  // so we can return a typed code per-answer (INVALID_TYPE / NON_INTEGER / OUT_OF_RANGE)
  // instead of a generic Zod error.
  value: z.unknown(),
});

export type Answer = z.infer<typeof AnswerSchema>;

// ─── Error type ──────────────────────────────────────────────────────────

export type ScoringValidationCode =
  | "UNKNOWN_STABLE_KEY"
  | "OUT_OF_RANGE"
  | "MISSING_REQUIRED_KEY"
  | "EMPTY_ANSWERS"
  | "NON_INTEGER"
  | "INVALID_TYPE"
  | "DUPLICATE_STABLE_KEY"
  | "INVALID_SCORING_CONFIG";

export class ScoringValidationError extends Error {
  constructor(
    public readonly code: ScoringValidationCode,
    public readonly details: Record<string, unknown> = {},
    message?: string
  ) {
    super(message ?? code);
    this.name = "ScoringValidationError";
    // Restore prototype chain for `instanceof` across compilation targets.
    Object.setPrototypeOf(this, ScoringValidationError.prototype);
  }
}

// ─── Result types ────────────────────────────────────────────────────────

export interface PerQuestionResult {
  stableKey: string;
  value: number;
  achieved: boolean;
}

export interface PerSectionResult {
  stableKey: string;
  name: string;
  totalPoints: number;
  averagePoints: number;
  achievedCount: number;
  totalCount: number;
}

export interface TierResolution {
  label: string;
  message: string;
}

export interface ScoreResult {
  perQuestion: PerQuestionResult[];
  perSection: PerSectionResult[];
  overallTotal: number;
  overallAverage: number;
  countAchieved: number;
  tier: TierResolution | null;
  tierMetricValue: number;
  unansweredKeys: string[];
}

// ─── Helpers ─────────────────────────────────────────────────────────────

type Question = z.infer<typeof QuestionSchema>;
type ScoringConfig = z.infer<typeof ScoringConfigSchema>;
type Tier = z.infer<typeof TierSchema>;

interface TierDomain {
  min: number;
  max: number;
  isInteger: boolean;
}

/**
 * Compute the metric domain implied by the scoringConfig + questions.
 *   countAchieved → [0, questions.length]                (integer)
 *   overallTotal  → [sum(scale.min), sum(scale.max)]     (integer if all scales are integer)
 *   overallAvg    → [scale.min, scale.max] when all questions share a scale;
 *                   REJECT for mixed scales (ambiguous).
 */
function computeTierDomain(
  questions: Question[],
  tierMetric: ScoringConfig["tierMetric"]
): TierDomain {
  if (tierMetric === "countAchieved") {
    return { min: 0, max: questions.length, isInteger: true };
  }

  if (tierMetric === "overallTotal") {
    let min = 0;
    let max = 0;
    for (const q of questions) {
      min += q.scale.min;
      max += q.scale.max;
    }
    return { min, max, isInteger: true };
  }

  // overallAvg
  if (questions.length === 0) {
    throw new ScoringValidationError(
      "INVALID_SCORING_CONFIG",
      { reason: "overallAvg with zero questions" },
      "overallAvg requires at least one question"
    );
  }
  const first = questions[0].scale;
  const allMatch = questions.every(
    (q) =>
      q.scale.min === first.min &&
      q.scale.max === first.max &&
      q.scale.step === first.step
  );
  if (!allMatch) {
    throw new ScoringValidationError(
      "INVALID_SCORING_CONFIG",
      {
        reason:
          "overallAvg with mixed scales is ambiguous; define explicitly",
      },
      "Cannot derive a tier domain for overallAvg when questions use different scales"
    );
  }
  return { min: first.min, max: first.max, isInteger: false };
}

/**
 * Verify the tiers exactly tile the metric domain with no gaps and no overlaps.
 *   - sorted by minMetric ascending
 *   - first.minMetric === domain.min
 *   - for each adjacent pair (a, b):
 *       integer domain → b.minMetric === a.maxMetric + 1
 *       fractional     → b.minMetric === a.maxMetric (touching)
 *     a.maxMetric must be defined (only the LAST tier may omit it)
 *   - last tier's maxMetric is either undefined (open-ended above) or === domain.max
 */
function validateTierTiling(tiers: Tier[], domain: TierDomain): void {
  const sorted = [...tiers].sort((a, b) => a.minMetric - b.minMetric);

  if (sorted[0].minMetric !== domain.min) {
    throw new ScoringValidationError(
      "INVALID_SCORING_CONFIG",
      {
        reason: "first tier minMetric must equal domain min",
        domainMin: domain.min,
        firstTierMin: sorted[0].minMetric,
      }
    );
  }

  for (let i = 0; i < sorted.length - 1; i++) {
    const a = sorted[i];
    const b = sorted[i + 1];

    if (a.maxMetric === undefined) {
      // Only the last tier may have undefined maxMetric.
      throw new ScoringValidationError(
        "INVALID_SCORING_CONFIG",
        {
          reason:
            "only the highest tier may omit maxMetric (open-ended above)",
          tierLabel: a.label,
          tierIndex: i,
        }
      );
    }

    const expectedNextMin = domain.isInteger ? a.maxMetric + 1 : a.maxMetric;
    if (b.minMetric !== expectedNextMin) {
      throw new ScoringValidationError(
        "INVALID_SCORING_CONFIG",
        {
          reason:
            b.minMetric > expectedNextMin
              ? "gap between tiers"
              : "overlap between tiers",
          tierA: a.label,
          tierB: b.label,
          aMax: a.maxMetric,
          bMin: b.minMetric,
          expectedNextMin,
        }
      );
    }
  }

  const last = sorted[sorted.length - 1];
  if (last.maxMetric !== undefined && last.maxMetric !== domain.max) {
    throw new ScoringValidationError(
      "INVALID_SCORING_CONFIG",
      {
        reason:
          "last tier maxMetric must equal domain max or be omitted (open-ended)",
        lastTierLabel: last.label,
        lastTierMax: last.maxMetric,
        domainMax: domain.max,
      }
    );
  }
}

/**
 * Find the tier whose [minMetric, maxMetric] range contains the metric value.
 * `maxMetric === undefined` means open-ended above (only valid on the top tier).
 */
function resolveTier(tiers: Tier[], value: number): Tier | null {
  for (const t of tiers) {
    const aboveMin = value >= t.minMetric;
    const belowMax = t.maxMetric === undefined || value <= t.maxMetric;
    if (aboveMin && belowMax) return t;
  }
  return null;
}

// ─── Main entry point ────────────────────────────────────────────────────

export function scoreSubmission(
  version: TemplateVersionForScoring,
  answers: Answer[]
): ScoreResult {
  // 1) Validate the version shape with Zod first so downstream code can
  //    trust the shape.
  const parsed = TemplateVersionForScoringSchema.safeParse(version);
  if (!parsed.success) {
    throw new ScoringValidationError(
      "INVALID_SCORING_CONFIG",
      { issues: parsed.error.issues },
      "Template version failed schema validation"
    );
  }
  const v = parsed.data;

  // 2) Dynamic tier-domain validation. Compute the implied metric domain and
  //    confirm the configured tiers tile it exactly.
  const domain = computeTierDomain(v.questions, v.scoringConfig.tierMetric);
  validateTierTiling(v.scoringConfig.tiers, domain);

  // 3) Reject empty answers payload.
  if (answers.length === 0) {
    throw new ScoringValidationError("EMPTY_ANSWERS");
  }

  // 4) Reject duplicate stableKeys in the answer set.
  const seenKeys = new Set<string>();
  for (const a of answers) {
    if (seenKeys.has(a.stableKey)) {
      throw new ScoringValidationError(
        "DUPLICATE_STABLE_KEY",
        { stableKey: a.stableKey }
      );
    }
    seenKeys.add(a.stableKey);
  }

  // 5) Build a lookup by stableKey + validate each answer against its question.
  const questionByKey = new Map<string, Question>();
  for (const q of v.questions) questionByKey.set(q.stableKey, q);

  // Sort sections + questions deterministically by sortOrder for stable output.
  const sortedSections = [...v.sections].sort(
    (a, b) => a.sortOrder - b.sortOrder
  );
  const sortedQuestions = [...v.questions].sort(
    (a, b) => a.sortOrder - b.sortOrder
  );

  const validatedAnswers = new Map<string, number>();
  for (const a of answers) {
    const q = questionByKey.get(a.stableKey);
    if (!q) {
      throw new ScoringValidationError(
        "UNKNOWN_STABLE_KEY",
        { stableKey: a.stableKey }
      );
    }

    // Strict type validation. Number primitives only, no NaN, no Infinity.
    if (typeof a.value !== "number" || !Number.isFinite(a.value)) {
      throw new ScoringValidationError(
        "INVALID_TYPE",
        {
          stableKey: a.stableKey,
          gotType: a.value === null ? "null" : typeof a.value,
        }
      );
    }
    const value = a.value;

    if (!Number.isInteger(value)) {
      throw new ScoringValidationError(
        "NON_INTEGER",
        { stableKey: a.stableKey, value }
      );
    }

    if (value < q.scale.min || value > q.scale.max) {
      throw new ScoringValidationError(
        "OUT_OF_RANGE",
        {
          stableKey: a.stableKey,
          value,
          min: q.scale.min,
          max: q.scale.max,
        }
      );
    }

    // Step alignment — for SLIDER_LIKERT with step=1 every integer in range is
    // aligned, so this never trips for Rockefeller. Included for forward compat
    // (e.g. a future 0/2/4/6 scale with step=2).
    if ((value - q.scale.min) % q.scale.step !== 0) {
      throw new ScoringValidationError(
        "OUT_OF_RANGE",
        {
          stableKey: a.stableKey,
          value,
          reason: "step-misaligned",
          min: q.scale.min,
          step: q.scale.step,
        }
      );
    }

    validatedAnswers.set(a.stableKey, value);
  }

  // 6) Required-key check. Collect ALL missing required keys so the client can
  //    fix the form in one round trip instead of N.
  const missingRequired: string[] = [];
  const unansweredKeys: string[] = [];
  for (const q of v.questions) {
    if (!validatedAnswers.has(q.stableKey)) {
      if (q.isRequired) missingRequired.push(q.stableKey);
      else unansweredKeys.push(q.stableKey);
    }
  }
  if (missingRequired.length > 0) {
    throw new ScoringValidationError(
      "MISSING_REQUIRED_KEY",
      { stableKeys: missingRequired }
    );
  }

  // 7) Compute results.
  const perQuestion: PerQuestionResult[] = [];
  let overallTotal = 0;
  let countAchieved = 0;
  const answeredQuestionCount = validatedAnswers.size;

  for (const q of sortedQuestions) {
    const value = validatedAnswers.get(q.stableKey);
    if (value === undefined) continue; // optional unanswered — skip from per-question
    const achieved = value >= v.scoringConfig.passThreshold;
    if (achieved) countAchieved += 1;
    overallTotal += value;
    perQuestion.push({ stableKey: q.stableKey, value, achieved });
  }

  const overallAverage =
    answeredQuestionCount > 0 ? overallTotal / answeredQuestionCount : 0;

  // Per-section rollup. Iterate in section.sortOrder so output is deterministic.
  const sectionNameByKey = new Map<string, string>();
  for (const s of sortedSections) sectionNameByKey.set(s.stableKey, s.name);

  // Group answered questions by sectionStableKey (questions without a section
  // are excluded from per-section rollup; they still count toward overall totals).
  const sectionBuckets = new Map<
    string,
    {
      stableKey: string;
      name: string;
      totalPoints: number;
      values: number[];
      achievedCount: number;
      totalCount: number;
    }
  >();

  // Seed buckets in section order so the output array is stable.
  for (const s of sortedSections) {
    sectionBuckets.set(s.stableKey, {
      stableKey: s.stableKey,
      name: s.name,
      totalPoints: 0,
      values: [],
      achievedCount: 0,
      totalCount: 0,
    });
  }

  for (const q of sortedQuestions) {
    if (!q.sectionStableKey) continue;
    const bucket = sectionBuckets.get(q.sectionStableKey);
    if (!bucket) continue; // question references unknown section — skip
    const value = validatedAnswers.get(q.stableKey);
    if (value === undefined) continue;
    bucket.totalPoints += value;
    bucket.values.push(value);
    bucket.totalCount += 1;
    if (value >= v.scoringConfig.passThreshold) bucket.achievedCount += 1;
  }

  const perSection: PerSectionResult[] = [];
  for (const s of sortedSections) {
    const b = sectionBuckets.get(s.stableKey);
    if (!b || b.totalCount === 0) continue;
    perSection.push({
      stableKey: b.stableKey,
      name: b.name,
      totalPoints: b.totalPoints,
      averagePoints: b.totalPoints / b.totalCount,
      achievedCount: b.achievedCount,
      totalCount: b.totalCount,
    });
  }

  // Resolve tier metric value + tier.
  let tierMetricValue: number;
  switch (v.scoringConfig.tierMetric) {
    case "countAchieved":
      tierMetricValue = countAchieved;
      break;
    case "overallTotal":
      tierMetricValue = overallTotal;
      break;
    case "overallAvg":
      tierMetricValue = overallAverage;
      break;
  }

  const matchedTier = resolveTier(v.scoringConfig.tiers, tierMetricValue);
  const tier: TierResolution | null = matchedTier
    ? { label: matchedTier.label, message: matchedTier.message }
    : null;

  return {
    perQuestion,
    perSection,
    overallTotal,
    overallAverage,
    countAchieved,
    tier,
    tierMetricValue,
    unansweredKeys,
  };
}
