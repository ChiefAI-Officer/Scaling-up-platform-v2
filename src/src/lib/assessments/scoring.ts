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
 * - SLIDER_LIKERT questions are fully scored (range validation, tier resolution,
 *   perQuestion output). TEXT / NUMBER / MULTI_CHOICE questions are accepted by
 *   both Zod schemas and stored in the DB, but pass through scoreSubmission
 *   without scoring — they never appear in validatedAnswers or perQuestion.
 */

import { z } from "zod";
import { MAX_TEXT_ANSWER_LENGTH } from "./answer-limits";

// ─── Zod schemas (input validation) ──────────────────────────────────────

export const SliderLikertScaleSchema = z.object({
  min: z.number().int(),
  max: z.number().int(),
  step: z.number().int().positive(),
  anchorMin: z.string(),
  anchorMax: z.string(),
});

// D2 — per-question recommendation band. minScore/maxScore inclusive.
// Coverage / overlap / scale-fit checks are applied at the template level
// in superRefine() blocks below; this base only enforces shape.
export const RecommendationBandSchema = z.object({
  minScore: z.number(),
  maxScore: z.number(),
  text: z.string(),
});

// Named export so downstream code can use as a Zod schema + TypeScript type guard.
export const SliderLikertQuestion = z.object({
  stableKey: z.string(),
  sortOrder: z.number().int(),
  type: z.literal("SLIDER_LIKERT"),
  label: z.string(),
  helpText: z.string().optional(),
  sectionStableKey: z.string().optional(),
  isRequired: z.boolean(),
  scale: SliderLikertScaleSchema,
  recommendations: z.array(RecommendationBandSchema).optional(),
});
export type SliderLikertQuestion = z.infer<typeof SliderLikertQuestion>;

// Qualitative question types: TEXT, NUMBER, MULTI_CHOICE. No scale required.
const QualitativeQuestion = z.object({
  stableKey: z.string(),
  sortOrder: z.number().int(),
  type: z.enum(["TEXT", "NUMBER", "MULTI_CHOICE"]),
  label: z.string(),
  helpText: z.string().optional(),
  sectionStableKey: z.string().optional(),
  isRequired: z.boolean(),
  options: z
    .array(z.object({ key: z.string(), label: z.string() }))
    .optional(),
  maxChoices: z.number().int().optional(),
});

// Discriminated union — accepts all 4 question types.
const QuestionBase = z.discriminatedUnion("type", [
  SliderLikertQuestion,
  QualitativeQuestion,
]);

export const QuestionSchema = QuestionBase;

// SectionBase: D2 adds the optional `domain` key. When set, every used
// domain key must appear in scoringConfig.domains[] (publish-time check).
const SectionBase = z.object({
  stableKey: z.string(),
  sortOrder: z.number().int(),
  name: z.string(),
  description: z.string().optional(),
  partLabel: z.string().optional(),
  domain: z.string().optional(),
});

export const SectionSchema = SectionBase;

export const TierSchema = z.object({
  minMetric: z.number(),
  maxMetric: z.number().optional(),
  label: z.string(),
  message: z.string(),
});

// D2 — domain definition. `tiers[]` here are domain-scoped (resolved
// against the domain's averagePoints).
const DomainDefSchema = z.object({
  key: z.string(),
  label: z.string(),
  tiers: z.array(TierSchema).min(1),
});

// D2 — overall-rollup contract. When set, replaces legacy tierMetric for
// the GLOBAL tier + ScaleUp Score. When omitted, engine runs the legacy
// tierMetric code path byte-for-byte unchanged (Rockefeller/QSP).
const RollupSchema = z.object({
  overall: z.enum(["meanOfQuestions", "meanOfSections", "meanOfDomains"]),
});

const ScoringConfigBase = z.object({
  tierMetric: z.enum(["countAchieved", "overallTotal", "overallAvg"]),
  passThreshold: z.number(),
  tiers: z.array(TierSchema).min(1),
  rollup: RollupSchema.optional(),
  domains: z.array(DomainDefSchema).optional(),
  scaleUpScore: z.boolean().optional(),
});

export const ScoringConfigSchema = ScoringConfigBase;

// ─── Shared validation helpers (used by both runtime + publish schemas) ─
//
// Each helper attaches issues via ctx.addIssue. Centralising the checks
// here keeps the runtime + publish schemas in lock-step.

const PLACEHOLDER_SENTINELS = ["TODO", "PLACEHOLDER", "Lorem"] as const;

function checkRecommendationsRuntime(
  questions: Array<z.infer<typeof QuestionBase>>,
  ctx: z.RefinementCtx
): void {
  const scoredWithIndex = questions
    .map((q, origIdx) => ({ q, origIdx }))
    .filter((x): x is { q: SliderLikertQuestion; origIdx: number } =>
      x.q.type === "SLIDER_LIKERT"
    );
  for (const { q, origIdx } of scoredWithIndex) {
    if (!q.recommendations || q.recommendations.length === 0) continue;
    const bands = q.recommendations;

    // 1) Each band: maxScore >= minScore; within scale bounds.
    for (let bi = 0; bi < bands.length; bi++) {
      const b = bands[bi];
      if (b.maxScore < b.minScore) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["questions", origIdx, "recommendations", bi],
          message: `Recommendation band ${bi}: maxScore < minScore`,
        });
      }
      if (b.minScore < q.scale.min || b.maxScore > q.scale.max) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["questions", origIdx, "recommendations", bi],
          message: `Recommendation band ${bi} falls outside scale [${q.scale.min}, ${q.scale.max}]`,
        });
      }
    }

    // 2) No overlap between bands. Sort by minScore, check adjacent.
    const sorted = [...bands]
      .map((b, i) => ({ ...b, _origIdx: i }))
      .sort((a, b) => a.minScore - b.minScore);
    for (let i = 0; i < sorted.length - 1; i++) {
      const a = sorted[i];
      const b = sorted[i + 1];
      if (b.minScore <= a.maxScore) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["questions", origIdx, "recommendations"],
          message: `Recommendation bands overlap: [${a.minScore}, ${a.maxScore}] and [${b.minScore}, ${b.maxScore}]`,
        });
      }
    }
  }
}

function checkRecommendationsPublish(
  questions: Array<z.infer<typeof QuestionBase>>,
  ctx: z.RefinementCtx
): void {
  const scoredWithIndex = questions
    .map((q, origIdx) => ({ q, origIdx }))
    .filter((x): x is { q: SliderLikertQuestion; origIdx: number } =>
      x.q.type === "SLIDER_LIKERT"
    );
  for (const { q, origIdx } of scoredWithIndex) {
    if (!q.recommendations || q.recommendations.length === 0) continue;
    const bands = q.recommendations;

    // 1) Full-scale coverage (integer scales: every integer in
    //    [scale.min, scale.max] must be in exactly one band; for
    //    fractional scales, the union of bands must equal [min, max]
    //    with no gaps).
    const sorted = [...bands].sort((a, b) => a.minScore - b.minScore);
    if (sorted[0].minScore !== q.scale.min) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["questions", origIdx, "recommendations"],
        message: `First band must start at scale.min (${q.scale.min}); got ${sorted[0].minScore}`,
      });
    }
    if (sorted[sorted.length - 1].maxScore !== q.scale.max) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["questions", origIdx, "recommendations"],
        message: `Last band must end at scale.max (${q.scale.max}); got ${sorted[sorted.length - 1].maxScore}`,
      });
    }
    const isInteger = q.scale.step === 1;
    for (let i = 0; i < sorted.length - 1; i++) {
      const a = sorted[i];
      const b = sorted[i + 1];
      const expectedNext = isInteger ? a.maxScore + 1 : a.maxScore;
      if (b.minScore !== expectedNext) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["questions", origIdx, "recommendations"],
          message:
            b.minScore > expectedNext
              ? `Gap between bands at value ${expectedNext} (next band starts at ${b.minScore})`
              : `Overlap or step misalignment between bands at ${a.maxScore} / ${b.minScore}`,
        });
      }
    }

    // 2) Sentinel-text rejection.
    for (let bi = 0; bi < bands.length; bi++) {
      const txt = bands[bi].text ?? "";
      for (const sentinel of PLACEHOLDER_SENTINELS) {
        if (txt.includes(sentinel)) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ["questions", origIdx, "recommendations", bi, "text"],
            message: `Band text contains placeholder sentinel "${sentinel}"`,
          });
          break;
        }
      }
    }
  }
}

function checkScaleUpScoreOptIn(
  cfg: z.infer<typeof ScoringConfigBase>,
  questions: Array<z.infer<typeof QuestionBase>>,
  ctx: z.RefinementCtx
): void {
  if (cfg.scaleUpScore !== true) return;
  // Requires rollup.overall to be set.
  if (!cfg.rollup) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["scoringConfig", "scaleUpScore"],
      message:
        "scaleUpScore opt-in requires scoringConfig.rollup.overall to be set",
    });
    return;
  }
  // Requires EVERY SLIDER_LIKERT question on a 0-10 scale.
  const sliderQuestions = questions.filter(
    (q): q is SliderLikertQuestion => q.type === "SLIDER_LIKERT"
  );
  for (let qi = 0; qi < sliderQuestions.length; qi++) {
    const s = sliderQuestions[qi].scale;
    if (s.min !== 0 || s.max !== 10) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["questions", qi, "scale"],
        message: `scaleUpScore requires every question on a 0-10 scale; got [${s.min}, ${s.max}]`,
      });
      return;
    }
  }
}

function checkDomainAssignment(
  sections: Array<z.infer<typeof SectionBase>>,
  cfg: z.infer<typeof ScoringConfigBase>,
  ctx: z.RefinementCtx
): void {
  const usedDomainKeys = new Set<string>();
  for (const s of sections) {
    if (s.domain !== undefined) usedDomainKeys.add(s.domain);
  }

  // (a) If any section has a domain, scoringConfig.domains must be defined
  //     AND every used key must appear in domains[].
  if (usedDomainKeys.size > 0) {
    const defined = new Set((cfg.domains ?? []).map((d) => d.key));
    if (!cfg.domains || cfg.domains.length === 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["scoringConfig", "domains"],
        message:
          "scoringConfig.domains[] is required when any section has a `domain` field",
      });
    } else {
      for (const k of usedDomainKeys) {
        if (!defined.has(k)) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ["scoringConfig", "domains"],
            message: `Used domain key "${k}" is missing from scoringConfig.domains[]`,
          });
        }
      }
    }
  }

  // (b) When rollup.overall === "meanOfDomains", EVERY section must have a
  //     domain field (guardrail #2 from the plan).
  if (cfg.rollup?.overall === "meanOfDomains") {
    for (let si = 0; si < sections.length; si++) {
      if (sections[si].domain === undefined) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["sections", si, "domain"],
          message:
            "rollup.overall='meanOfDomains' requires every section to have a `domain` field",
        });
      }
    }
  }
}

function checkSectionRefsResolve(
  sections: Array<z.infer<typeof SectionBase>>,
  questions: Array<z.infer<typeof QuestionBase>>,
  ctx: z.RefinementCtx,
): void {
  const known = new Set(sections.map((s) => s.stableKey));
  for (let qi = 0; qi < questions.length; qi++) {
    const raw = questions[qi].sectionStableKey;
    const key = typeof raw === "string" ? raw.trim() : "";
    if (key.length === 0) continue; // keyless → tolerated (Other fallback), not a publish error
    if (!known.has(key)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["questions", qi, "sectionStableKey"],
        message: `question references unknown section "${key}" — it does not resolve to a defined section`,
      });
    }
  }
}

// Runtime schema — permissive on band coverage (BC for existing seeds) but
// strict on new opt-ins (scaleUpScore requires rollup.overall + 0-10 scale).
export const TemplateVersionForScoringSchema = z
  .object({
    questions: z.array(QuestionBase),
    sections: z.array(SectionBase),
    scoringConfig: ScoringConfigBase,
  })
  .superRefine((data, ctx) => {
    checkRecommendationsRuntime(data.questions, ctx);
    checkScaleUpScoreOptIn(data.scoringConfig, data.questions, ctx);
  });

export type TemplateVersionForScoring = z.infer<
  typeof TemplateVersionForScoringSchema
>;

// Publish schema — strict superset of runtime. Adds full-scale band
// coverage, sentinel-text rejection, and domain-assignment completeness.
export const TemplateVersionForPublishSchema =
  TemplateVersionForScoringSchema.superRefine((data, ctx) => {
    checkRecommendationsPublish(data.questions, ctx);
    checkDomainAssignment(data.sections, data.scoringConfig, ctx);
    checkPerDomainTierTiling(data.sections, data.questions, data.scoringConfig, ctx);
    checkSectionRefsResolve(data.sections, data.questions, ctx);
  });

/**
 * D2 (E1.1) — publish-time per-domain tier-tiling check. Iterates
 * scoringConfig.domains[], computes each domain's metric range from the
 * questions in its sections, and runs `validateTierTiling` in fractional
 * mode. Surfaces issues via ctx.addIssue with full paths so the publish
 * failure modal can route them.
 */
function checkPerDomainTierTiling(
  sections: Array<z.infer<typeof SectionBase>>,
  questions: Array<z.infer<typeof QuestionBase>>,
  cfg: z.infer<typeof ScoringConfigBase>,
  ctx: z.RefinementCtx,
): void {
  if (!cfg.domains || cfg.domains.length === 0) return;
  const sliderQuestions = questions.filter(
    (q): q is SliderLikertQuestion => q.type === "SLIDER_LIKERT"
  );
  let ctxs;
  try {
    ctxs = computePerDomainTierContexts(
      sections,
      sliderQuestions,
      cfg.domains.map((d) => d.key),
    );
  } catch (err) {
    if (err instanceof ScoringValidationError) {
      const domainKey =
        typeof err.details.domainKey === "string" ? err.details.domainKey : "";
      const domainIdx = cfg.domains.findIndex((d) => d.key === domainKey);
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: [
          "scoringConfig",
          "domains",
          domainIdx >= 0 ? domainIdx : 0,
        ],
        message: err.message,
      });
      return;
    }
    throw err;
  }
  const byKey = new Map(ctxs.map((c) => [c.domainKey, c.domain]));
  for (let di = 0; di < cfg.domains.length; di++) {
    const d = cfg.domains[di];
    const domain = byKey.get(d.key);
    if (!domain) continue;
    if (!Number.isFinite(domain.max)) {
      // No questions yet for this domain — publish-time we still require
      // at least one question per domain (sections-without-questions is
      // a separate publish-time failure mode handled elsewhere). Skip
      // tile-touching here; structural emptiness will be flagged when
      // the operator actually publishes a template with empty domains.
      continue;
    }
    const issues = validateTierTiling(d.tiers, domain);
    for (const issue of issues) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["scoringConfig", "domains", di, "tiers", ...issue.path],
        message: issue.message,
      });
    }
  }
}

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
  | "INVALID_SCORING_CONFIG"
  | "ANSWER_TOO_LONG"
  | "INVALID_OPTION_KEY"
  | "DUPLICATE_OPTION_KEY"
  | "TOO_MANY_CHOICES";

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

// ─── Answer value validation ──────────────────────────────────────────────

/** Maximum character length accepted for a TEXT answer. */
export { MAX_TEXT_ANSWER_LENGTH } from "./answer-limits";

/**
 * Validates the runtime value of a single answer against its question's type
 * and constraints. Returns a `ScoringValidationError` if invalid, or `null`
 * if the value is acceptable. Does NOT check required-presence (that is
 * handled separately in `scoreSubmission`); call this when a key IS present.
 *
 * One source of truth — used inside `scoreSubmission` and can be called
 * independently from route handlers for early rejection.
 */
export function validateAnswerValues(
  question: z.infer<typeof QuestionBase>,
  value: unknown
): ScoringValidationError | null {
  const { stableKey } = question;

  switch (question.type) {
    case "SLIDER_LIKERT": {
      // SLIDER validation is handled inline in scoreSubmission (existing code path).
      // This branch is a no-op so the function stays the single source-of-truth
      // callable from both places without duplicating the slider logic.
      return null;
    }

    case "TEXT": {
      if (typeof value !== "string") {
        return new ScoringValidationError("INVALID_TYPE", {
          stableKey,
          expectedType: "string",
          gotType: Array.isArray(value) ? "array" : value === null ? "null" : typeof value,
        });
      }
      if (value.length > MAX_TEXT_ANSWER_LENGTH) {
        return new ScoringValidationError("ANSWER_TOO_LONG", {
          stableKey,
          maxLength: MAX_TEXT_ANSWER_LENGTH,
          got: value.length,
        });
      }
      return null;
    }

    case "NUMBER": {
      if (typeof value !== "number" || !Number.isFinite(value)) {
        return new ScoringValidationError("INVALID_TYPE", {
          stableKey,
          expectedType: "finite number",
          gotType: typeof value === "number" ? "non-finite number" : value === null ? "null" : typeof value,
        });
      }
      return null;
    }

    case "MULTI_CHOICE": {
      if (!Array.isArray(value)) {
        return new ScoringValidationError("INVALID_TYPE", {
          stableKey,
          expectedType: "array",
          gotType: value === null ? "null" : typeof value,
        });
      }

      // Check for duplicate option keys within the answer.
      const seen = new Set<string>();
      for (const item of value) {
        if (typeof item !== "string") {
          return new ScoringValidationError("INVALID_TYPE", {
            stableKey,
            expectedType: "array of strings",
            gotItemType: item === null ? "null" : typeof item,
          });
        }
        if (seen.has(item)) {
          return new ScoringValidationError("DUPLICATE_OPTION_KEY", {
            stableKey,
            duplicateKey: item,
          });
        }
        seen.add(item);
      }

      // Check all submitted keys are valid option keys for this question.
      const validKeys = new Set(
        (question.options ?? []).map((o) => o.key)
      );
      const invalidKeys = value.filter((k) => !validKeys.has(k as string));
      if (invalidKeys.length > 0) {
        return new ScoringValidationError("INVALID_OPTION_KEY", {
          stableKey,
          invalidKeys,
          validKeys: Array.from(validKeys),
        });
      }

      // Enforce maxChoices when set.
      if (question.maxChoices !== undefined && value.length > question.maxChoices) {
        return new ScoringValidationError("TOO_MANY_CHOICES", {
          stableKey,
          maxChoices: question.maxChoices,
          got: value.length,
        });
      }

      return null;
    }
  }
}

// ─── Result types ────────────────────────────────────────────────────────

export interface PerQuestionResult {
  stableKey: string;
  value: number;
  achieved: boolean;
  /** D2 — matched recommendation band text; undefined when no band matches or
   *  the question defines no `recommendations`. Runtime is lenient on gaps. */
  recommendation?: string;
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

/** D2 — per-domain rollup row. Only emitted when scoringConfig.domains[] is set. */
export interface PerDomainResult {
  key: string;
  label: string;
  /** Mean of NON-NULL section means. `null` when no sections in this domain
   *  have any answered question (Codex round 2 #1 — distinguish "no data"
   *  from "scored 0"). */
  averagePoints: number | null;
  answeredSectionCount: number;
  totalSectionCount: number;
  tier: TierResolution | null;
}

export interface ScoreResult {
  perQuestion: PerQuestionResult[];
  perSection: PerSectionResult[];
  /** D2 — only emitted when scoringConfig.domains[] is set. */
  perDomain?: PerDomainResult[];
  overallTotal: number;
  overallAverage: number;
  countAchieved: number;
  tier: TierResolution | null;
  tierMetricValue: number;
  /** D2 — 0-100 score. Emitted only when scoringConfig.scaleUpScore === true. */
  scaleUpScore?: number;
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
  questions: SliderLikertQuestion[],
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
 * D2 — compute the tier domain for the canonical rollup metric.
 *
 * When `scoringConfig.rollup.overall` is set, the global tier resolves against
 * a mean (of questions / sections / domains). Means are always in the range
 * `[scale.min, scale.max]` of the underlying question scale (assumed uniform).
 *
 * Throws INVALID_SCORING_CONFIG when scales are mixed (ambiguous; the rollup
 * mean would span a non-uniform range).
 */
function computeRollupTierDomain(questions: SliderLikertQuestion[]): TierDomain {
  if (questions.length === 0) {
    throw new ScoringValidationError(
      "INVALID_SCORING_CONFIG",
      { reason: "rollup with zero questions" },
      "rollup requires at least one question"
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
      { reason: "rollup with mixed scales is ambiguous; use a uniform scale" },
      "Cannot derive a tier domain for rollup when questions use different scales"
    );
  }
  // Means may be fractional even on integer-step scales; mark as non-integer
  // so the tiling check uses the touching-boundary semantics, not the
  // +1-gap semantics.
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
 *
 * D2 (E1.1) — returns structured issues rather than throwing, so the same
 * helper can power both the runtime engine (where issues become a thrown
 * ScoringValidationError) and the publish-time Zod schema (where issues
 * are routed via ctx.addIssue). Empty array === valid tiling.
 */
export interface TierTilingIssue {
  path: (string | number)[];
  message: string;
  details: Record<string, unknown>;
}

export function validateTierTiling(
  tiers: Tier[],
  domain: TierDomain,
  pathPrefix: (string | number)[] = []
): TierTilingIssue[] {
  const issues: TierTilingIssue[] = [];
  if (tiers.length === 0) {
    issues.push({
      path: [...pathPrefix],
      message: "tiers must contain at least one entry",
      details: { reason: "empty tiers" },
    });
    return issues;
  }

  const sorted = [...tiers]
    .map((t, idx) => ({ t, idx }))
    .sort((a, b) => a.t.minMetric - b.t.minMetric);

  if (sorted[0].t.minMetric !== domain.min) {
    issues.push({
      path: [...pathPrefix, sorted[0].idx, "minMetric"],
      message: `first tier minMetric must equal domain min (${domain.min}); got ${sorted[0].t.minMetric}`,
      details: {
        reason: "first tier minMetric must equal domain min",
        domainMin: domain.min,
        firstTierMin: sorted[0].t.minMetric,
      },
    });
  }

  for (let i = 0; i < sorted.length - 1; i++) {
    const a = sorted[i].t;
    const b = sorted[i + 1].t;

    if (a.maxMetric === undefined) {
      // Only the last tier may have undefined maxMetric.
      issues.push({
        path: [...pathPrefix, sorted[i].idx, "maxMetric"],
        message: "only the highest tier may omit maxMetric (open-ended above)",
        details: {
          reason:
            "only the highest tier may omit maxMetric (open-ended above)",
          tierLabel: a.label,
          tierIndex: sorted[i].idx,
        },
      });
      continue;
    }

    const expectedNextMin = domain.isInteger ? a.maxMetric + 1 : a.maxMetric;
    if (b.minMetric !== expectedNextMin) {
      issues.push({
        path: [...pathPrefix, sorted[i + 1].idx, "minMetric"],
        message:
          b.minMetric > expectedNextMin
            ? `gap between tiers: tier "${a.label}" ends at ${a.maxMetric}; tier "${b.label}" must start at ${expectedNextMin} (no gap)`
            : `overlap between tiers: tier "${a.label}" ends at ${a.maxMetric}; tier "${b.label}" starts at ${b.minMetric} (overlap)`,
        details: {
          reason:
            b.minMetric > expectedNextMin
              ? "gap between tiers"
              : "overlap between tiers",
          tierA: a.label,
          tierB: b.label,
          aMax: a.maxMetric,
          bMin: b.minMetric,
          expectedNextMin,
        },
      });
    }
  }

  const last = sorted[sorted.length - 1].t;
  if (last.maxMetric !== undefined && last.maxMetric !== domain.max) {
    issues.push({
      path: [...pathPrefix, sorted[sorted.length - 1].idx, "maxMetric"],
      message: `last tier maxMetric must equal domain max (${domain.max}) or be omitted (open-ended); got ${last.maxMetric}`,
      details: {
        reason:
          "last tier maxMetric must equal domain max or be omitted (open-ended)",
        lastTierLabel: last.label,
        lastTierMax: last.maxMetric,
        domainMax: domain.max,
      },
    });
  }

  return issues;
}

/**
 * Throw-on-error wrapper around `validateTierTiling`. Preserves the
 * runtime engine's pre-E1 behavior — `scoreSubmission` calls this so any
 * tiling defect becomes a ScoringValidationError("INVALID_SCORING_CONFIG").
 */
function assertTierTiling(tiers: Tier[], domain: TierDomain): void {
  const issues = validateTierTiling(tiers, domain);
  if (issues.length === 0) return;
  // Surface the first issue as the canonical message but include all
  // structured issues in `details` so callers can drill in.
  const first = issues[0];
  throw new ScoringValidationError(
    "INVALID_SCORING_CONFIG",
    { ...first.details, issues },
    first.message,
  );
}

/**
 * D2 (E1.1) — compute the per-domain tier metric range for a domain key.
 *
 * For each domain, find the sections whose `section.domain === domain.key`,
 * then collect the questions in those sections. The metric range is
 * `[min(question.scale.min), max(question.scale.max)]`. Per-domain tier
 * resolution always uses fractional touching semantics because section
 * means (and means-of-section-means) are not integer-aligned.
 *
 * Throws "mixed scales" when questions within the same domain have
 * different scale ranges (the average would span an ambiguous metric).
 */
type Section = z.infer<typeof SectionBase>;

interface PerDomainTierContext {
  domainKey: string;
  domain: TierDomain; // isInteger always false (per-domain tiers are fractional)
}

export function computePerDomainTierContexts(
  sections: Section[],
  questions: SliderLikertQuestion[],
  domainKeys: string[],
): PerDomainTierContext[] {
  const sectionsByDomain = new Map<string, Section[]>();
  for (const s of sections) {
    if (!s.domain) continue;
    const arr = sectionsByDomain.get(s.domain) ?? [];
    arr.push(s);
    sectionsByDomain.set(s.domain, arr);
  }
  const questionsBySectionKey = new Map<string, SliderLikertQuestion[]>();
  for (const q of questions) {
    if (!q.sectionStableKey) continue;
    const arr = questionsBySectionKey.get(q.sectionStableKey) ?? [];
    arr.push(q);
    questionsBySectionKey.set(q.sectionStableKey, arr);
  }

  const contexts: PerDomainTierContext[] = [];
  for (const key of domainKeys) {
    const domainSections = sectionsByDomain.get(key) ?? [];
    const domainQuestions: SliderLikertQuestion[] = [];
    for (const s of domainSections) {
      const qs = questionsBySectionKey.get(s.stableKey) ?? [];
      domainQuestions.push(...qs);
    }
    if (domainQuestions.length === 0) {
      // No questions yet for this domain — can't validate; emit a synthetic
      // open range so the per-domain tier validator simply checks structure.
      contexts.push({
        domainKey: key,
        domain: { min: 0, max: Number.POSITIVE_INFINITY, isInteger: false },
      });
      continue;
    }
    const first = domainQuestions[0].scale;
    const allMatch = domainQuestions.every(
      (q) =>
        q.scale.min === first.min &&
        q.scale.max === first.max &&
        q.scale.step === first.step,
    );
    if (!allMatch) {
      throw new ScoringValidationError(
        "INVALID_SCORING_CONFIG",
        {
          reason:
            "Per-domain mixed scales — domain averages are ambiguous",
          domainKey: key,
        },
        `Domain "${key}" has mixed question scales — averages are ambiguous`,
      );
    }
    contexts.push({
      domainKey: key,
      domain: { min: first.min, max: first.max, isInteger: false },
    });
  }
  return contexts;
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
  answers: Answer[],
  options?: { allowMissingRequired?: boolean }
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

  // Filter to SLIDER_LIKERT questions only — all scoring math operates on
  // these. TEXT / NUMBER / MULTI_CHOICE questions are stored in the template
  // but are not scored; they are silently ignored throughout.
  const scorableQuestions = v.questions.filter(
    (q): q is SliderLikertQuestion => q.type === "SLIDER_LIKERT"
  );

  // 2) Dynamic tier-domain validation.
  //    Legacy path (rollup unset): compute the implied metric domain from
  //    tierMetric and confirm the configured tiers tile it exactly. This is
  //    the byte-for-byte preserved Rockefeller/QSP behavior.
  //    D2 rollup path (rollup set): the global tiers resolve against the
  //    rollup metric scale ([scale.min, scale.max] when uniform). We validate
  //    that the scales are uniform and that tiers tile that domain. The
  //    legacy tierMetric path is skipped entirely so D2 templates can ship
  //    with tier shapes that match the rollup metric (e.g., 0-10) without
  //    being constrained by the legacy domain math.
  if (v.scoringConfig.rollup) {
    const rollupDomain = computeRollupTierDomain(scorableQuestions);
    assertTierTiling(v.scoringConfig.tiers, rollupDomain);
  } else {
    const domain = computeTierDomain(
      scorableQuestions,
      v.scoringConfig.tierMetric
    );
    assertTierTiling(v.scoringConfig.tiers, domain);
  }

  // D2 (E1.1) — belt-and-suspenders runtime validation for per-domain
  // tiers. Pre-E1.1 prod data may have malformed domain tiers (manually
  // seeded, edited outside the admin UI, etc.). Reject at scoring time
  // rather than silently returning null tier resolution.
  if (
    v.scoringConfig.domains &&
    v.scoringConfig.domains.length > 0
  ) {
    const ctxs = computePerDomainTierContexts(
      v.sections,
      scorableQuestions,
      v.scoringConfig.domains.map((d) => d.key),
    );
    const byKey = new Map(ctxs.map((c) => [c.domainKey, c.domain]));
    for (const d of v.scoringConfig.domains) {
      const domain = byKey.get(d.key);
      if (!domain) continue;
      // Skip the tile-touching check when we synthesised an "infinite"
      // range (no questions for this domain) — the structure check
      // inside validateTierTiling still runs on empty + ordering.
      if (!Number.isFinite(domain.max)) continue;
      const issues = validateTierTiling(d.tiers, domain);
      if (issues.length > 0) {
        const first = issues[0];
        throw new ScoringValidationError(
          "INVALID_SCORING_CONFIG",
          { ...first.details, domainKey: d.key, issues },
          `Domain "${d.key}" tier issue: ${first.message}`,
        );
      }
    }
  }

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
  //    Include ALL question types in the lookup so we can detect unknown keys.
  //    Scale-range validation only applies to SLIDER_LIKERT questions.
  const questionByKey = new Map<string, Question>();
  for (const q of v.questions) questionByKey.set(q.stableKey, q);

  // Scorable-question lookup (SLIDER_LIKERT only) — used for range validation.
  const sliderByKey = new Map<string, SliderLikertQuestion>();
  for (const q of scorableQuestions) sliderByKey.set(q.stableKey, q);

  // Sort sections + questions deterministically by sortOrder for stable output.
  // Only SLIDER_LIKERT questions participate in per-question scoring.
  const sortedSections = [...v.sections].sort(
    (a, b) => a.sortOrder - b.sortOrder
  );
  const sortedQuestions = [...scorableQuestions].sort(
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

    // Non-SLIDER answers (TEXT / NUMBER / MULTI_CHOICE) are not scored but ARE
    // validated for correct value shape before we persist them.
    if (q.type !== "SLIDER_LIKERT") {
      const valErr = validateAnswerValues(q, a.value);
      if (valErr !== null) throw valErr;
      continue;
    }

    const sliderQ = sliderByKey.get(a.stableKey)!;

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

    if (value < sliderQ.scale.min || value > sliderQ.scale.max) {
      throw new ScoringValidationError(
        "OUT_OF_RANGE",
        {
          stableKey: a.stableKey,
          value,
          min: sliderQ.scale.min,
          max: sliderQ.scale.max,
        }
      );
    }

    // Step alignment — for SLIDER_LIKERT with step=1 every integer in range is
    // aligned, so this never trips for Rockefeller. Included for forward compat
    // (e.g. a future 0/2/4/6 scale with step=2).
    if ((value - sliderQ.scale.min) % sliderQ.scale.step !== 0) {
      throw new ScoringValidationError(
        "OUT_OF_RANGE",
        {
          stableKey: a.stableKey,
          value,
          reason: "step-misaligned",
          min: sliderQ.scale.min,
          step: sliderQ.scale.step,
        }
      );
    }

    validatedAnswers.set(a.stableKey, value);
  }

  // 6) Required-key check.
  //    SLIDER_LIKERT: use `validatedAnswers` (only slider keys land there).
  //    TEXT / NUMBER / MULTI_CHOICE: check the raw `answers` array — a key is
  //    considered "absent" if it was never submitted OR if it is semantically
  //    empty (empty string for TEXT, empty array for MULTI_CHOICE).
  //    Collect ALL missing required keys in one pass so the client can fix the
  //    form in a single round trip.
  const missingRequired: string[] = [];
  const unansweredKeys: string[] = [];

  // --- SLIDER_LIKERT required-presence (existing path) ---
  for (const q of scorableQuestions) {
    if (!validatedAnswers.has(q.stableKey)) {
      if (q.isRequired) missingRequired.push(q.stableKey);
      else unansweredKeys.push(q.stableKey);
    }
  }

  // --- TEXT / NUMBER / MULTI_CHOICE required-presence (new path) ---
  // Build a lookup of submitted answers for non-slider types.
  const submittedNonSlider = new Map<string, unknown>();
  for (const a of answers) {
    if (questionByKey.get(a.stableKey)?.type !== "SLIDER_LIKERT") {
      submittedNonSlider.set(a.stableKey, a.value);
    }
  }

  for (const q of v.questions) {
    if (q.type === "SLIDER_LIKERT") continue; // already handled above
    if (!q.isRequired) continue;

    const submitted = submittedNonSlider.has(q.stableKey);
    if (!submitted) {
      missingRequired.push(q.stableKey);
      continue;
    }

    // Semantic-empty checks: an empty string or empty array counts as absent.
    const rawValue = submittedNonSlider.get(q.stableKey);
    if (q.type === "TEXT" && rawValue === "") {
      missingRequired.push(q.stableKey);
    } else if (q.type === "MULTI_CHOICE" && Array.isArray(rawValue) && rawValue.length === 0) {
      missingRequired.push(q.stableKey);
    }
  }

  if (missingRequired.length > 0) {
    if (options?.allowMissingRequired === true) {
      // Historical-import mode: do NOT reject the submission for missing
      // required keys (year-old Esperto data may lack a now-required answer).
      // Route the missing-required keys into `unansweredKeys` — appended after
      // the existing optional-unanswered keys, deduped, preserving order — so
      // the scorer returns a normal ScoreResult computed over whatever WAS
      // answered.
      const seen = new Set(unansweredKeys);
      for (const k of missingRequired) {
        if (!seen.has(k)) {
          seen.add(k);
          unansweredKeys.push(k);
        }
      }
    } else {
      throw new ScoringValidationError(
        "MISSING_REQUIRED_KEY",
        { stableKeys: missingRequired }
      );
    }
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
    const row: PerQuestionResult = { stableKey: q.stableKey, value, achieved };
    // D2 — recommendation band resolution. Runtime is lenient on gaps:
    // when no band matches, simply omit `recommendation` (no throw).
    if (q.recommendations && q.recommendations.length > 0) {
      for (const band of q.recommendations) {
        if (value >= band.minScore && value <= band.maxScore) {
          row.recommendation = band.text;
          break;
        }
      }
    }
    perQuestion.push(row);
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
  // Also keep a map of section average (or null if zero answered) for the
  // D2 per-domain + rollup passes below. We track null sections too — they
  // are excluded from per-domain averages but counted as totalSectionCount.
  const sectionAverageByKey = new Map<string, number | null>();
  for (const s of sortedSections) {
    const b = sectionBuckets.get(s.stableKey);
    if (!b) continue;
    if (b.totalCount === 0) {
      sectionAverageByKey.set(s.stableKey, null);
      continue;
    }
    const avg = b.totalPoints / b.totalCount;
    sectionAverageByKey.set(s.stableKey, avg);
    perSection.push({
      stableKey: b.stableKey,
      name: b.name,
      totalPoints: b.totalPoints,
      averagePoints: avg,
      achievedCount: b.achievedCount,
      totalCount: b.totalCount,
    });
  }

  // D2 — per-domain rollup. Only emitted when scoringConfig.domains[] is set.
  // Group sections by their `domain` field; compute mean of NON-NULL section
  // means; resolve domain tier from `scoringConfig.domains[].tiers[]`.
  const domainsCfg = v.scoringConfig.domains;
  let perDomain: PerDomainResult[] | undefined;
  if (domainsCfg && domainsCfg.length > 0) {
    perDomain = [];
    for (const domainDef of domainsCfg) {
      const sectionsInDomain = sortedSections.filter(
        (s) => s.domain === domainDef.key
      );
      const totalSectionCount = sectionsInDomain.length;
      const nonNullMeans: number[] = [];
      for (const s of sectionsInDomain) {
        const avg = sectionAverageByKey.get(s.stableKey);
        if (avg !== null && avg !== undefined) nonNullMeans.push(avg);
      }
      const answeredSectionCount = nonNullMeans.length;
      let averagePoints: number | null;
      let tier: TierResolution | null;
      if (answeredSectionCount === 0) {
        averagePoints = null;
        tier = null;
      } else {
        averagePoints =
          nonNullMeans.reduce((acc, x) => acc + x, 0) / nonNullMeans.length;
        const matched = resolveTier(domainDef.tiers, averagePoints);
        tier = matched
          ? { label: matched.label, message: matched.message }
          : null;
      }
      perDomain.push({
        key: domainDef.key,
        label: domainDef.label,
        averagePoints,
        answeredSectionCount,
        totalSectionCount,
        tier,
      });
    }
  }

  // Resolve tier metric value + global tier.
  // Legacy path (rollup unset): tierMetric switch — byte-for-byte preserved.
  // D2 canonical rollup path: tierMetricValue = the configured rollup metric.
  let tierMetricValue: number;
  if (v.scoringConfig.rollup) {
    switch (v.scoringConfig.rollup.overall) {
      case "meanOfQuestions": {
        // Mean of answered question values.
        const vals = perQuestion.map((q) => q.value);
        tierMetricValue =
          vals.length > 0
            ? vals.reduce((acc, x) => acc + x, 0) / vals.length
            : 0;
        break;
      }
      case "meanOfSections": {
        // Mean of non-null section means.
        const vals: number[] = [];
        for (const s of sortedSections) {
          const avg = sectionAverageByKey.get(s.stableKey);
          if (avg !== null && avg !== undefined) vals.push(avg);
        }
        tierMetricValue =
          vals.length > 0
            ? vals.reduce((acc, x) => acc + x, 0) / vals.length
            : 0;
        break;
      }
      case "meanOfDomains": {
        // Mean of non-null domain means (perDomain[] required by domain
        // assignment rule but defensively handle missing).
        const vals: number[] = [];
        for (const d of perDomain ?? []) {
          if (d.averagePoints !== null) vals.push(d.averagePoints);
        }
        tierMetricValue =
          vals.length > 0
            ? vals.reduce((acc, x) => acc + x, 0) / vals.length
            : 0;
        break;
      }
    }
  } else {
    // LEGACY PATH — byte-for-byte preserved.
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
  }

  const matchedTier = resolveTier(v.scoringConfig.tiers, tierMetricValue);
  const tier: TierResolution | null = matchedTier
    ? { label: matchedTier.label, message: matchedTier.message }
    : null;

  // D2 — ScaleUp Score 0-100. Opt-in via scoringConfig.scaleUpScore === true.
  // Requires rollup.overall to be set (enforced at schema time too). Scaling
  // assumes a 0-10 underlying scale (enforced at schema time).
  let scaleUpScore: number | undefined;
  if (
    v.scoringConfig.scaleUpScore === true &&
    v.scoringConfig.rollup !== undefined
  ) {
    scaleUpScore = Math.round(tierMetricValue * 10);
  }

  const result: ScoreResult = {
    perQuestion,
    perSection,
    overallTotal,
    overallAverage,
    countAchieved,
    tier,
    tierMetricValue,
    unansweredKeys,
  };
  if (perDomain !== undefined) result.perDomain = perDomain;
  if (scaleUpScore !== undefined) result.scaleUpScore = scaleUpScore;
  return result;
}
