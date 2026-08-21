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
import { resolveFindings, type ResolvedFinding } from "./findings";
import { canonicalQuestionOrderIndex } from "./section-pages";
import type { GrowthPhaseNumber } from "./su-full-phase";

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

export const GrowthPhaseSchema: z.ZodType<GrowthPhaseNumber> = z.union([
  z.literal(1),
  z.literal(2),
  z.literal(3),
  z.literal(4),
  z.literal(5),
]);

/** A recommendation-band set for one Scaling Up growth phase. */
export const GrowthPhaseRecommendationSchema = z.object({
  phase: GrowthPhaseSchema,
  // Slider answers are integers; integer endpoints guarantee every score in
  // the required 0-10 publish range can be covered by a contiguous band set.
  bands: z.array(
    RecommendationBandSchema.extend({
      minScore: z.number().int(),
      maxScore: z.number().int(),
    }),
  ),
});
export type GrowthPhaseRecommendation = z.infer<
  typeof GrowthPhaseRecommendationSchema
>;

export const PhasePeerBenchmarkSchema = z.object({
  phase: GrowthPhaseSchema,
  value: z.number().finite().min(0).max(10),
});
export type PhasePeerBenchmark = z.infer<typeof PhasePeerBenchmarkSchema>;

// Wave W (spec 19w) — authored show-if: the question renders only while
// `optionKey` is selected on the (earlier, MULTI_CHOICE) gate question.
// Save tier validates SHAPE only; drafts may be referentially dangling —
// referential integrity (gate exists / MULTI_CHOICE / strictly earlier /
// real option / no chain / carrier optional) is the publish-tier
// checkShowIfIntegrity below.
export const ShowIfSchema = z.object({
  questionKey: z.string().min(1),
  optionKey: z.string().min(1),
});
export type ShowIf = z.infer<typeof ShowIfSchema>;

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
  phaseRecommendations: z.array(GrowthPhaseRecommendationSchema).optional(),
  phasePeerBenchmarks: z.array(PhasePeerBenchmarkSchema).optional(),
  showIf: ShowIfSchema.optional(),
});
export type SliderLikertQuestion = z.infer<typeof SliderLikertQuestion>;

// Wave U (spec 19u U-2, ADR-0021) — MULTI_CHOICE findings rule: one optional
// text per option, keyed by the option's key. The question's TYPE
// discriminates the `recommendations` item shape (bands vs option rules).
export const FindingOptionRuleSchema = z.object({
  optionKey: z.string(),
  text: z.string(),
});

// Qualitative question types: TEXT, NUMBER, MULTI_CHOICE. No scale required.
// Wave U split the former single enum-typed QualitativeQuestion into three
// literal-discriminated arms so `recommendations` can be typed per question
// type (spec D3). Every shared field keeps its original optionality — the
// acceptance behavior for rule-free payloads is byte-identical to before.
const qualitativeShape = {
  stableKey: z.string(),
  sortOrder: z.number().int(),
  label: z.string(),
  helpText: z.string().optional(),
  sectionStableKey: z.string().optional(),
  isRequired: z.boolean(),
  options: z
    .array(z.object({ key: z.string(), label: z.string() }))
    .optional(),
  maxChoices: z.number().int().optional(),
  showIf: ShowIfSchema.optional(),
} as const;

// TEXT declares `recommendations` as unknown ONLY so a stray value SURVIVES
// the (stripping) parse and the PUBLISH check can reject it explicitly —
// TEXT questions can never carry findings rules, but that rejection is a
// publish-tier concern, not a save-shape concern (spec D10 layering).
const TextQuestion = z.object({
  ...qualitativeShape,
  type: z.literal("TEXT"),
  recommendations: z.unknown().optional(),
});

const NumberQuestion = z.object({
  ...qualitativeShape,
  type: z.literal("NUMBER"),
  // NUMBER findings rules are bands over the (unbounded) answer value.
  recommendations: z.array(RecommendationBandSchema).optional(),
});

const MultiChoiceQuestion = z.object({
  ...qualitativeShape,
  type: z.literal("MULTI_CHOICE"),
  recommendations: z.array(FindingOptionRuleSchema).optional(),
});

// Discriminated union — accepts all 4 question types.
const QuestionBase = z.discriminatedUnion("type", [
  SliderLikertQuestion,
  TextQuestion,
  NumberQuestion,
  MultiChoiceQuestion,
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

const PhasePeerBenchmarkCatalogueSchema = z.object({
  sourceId: z.string().min(1),
  phases: z
    .array(z.object({
      phase: GrowthPhaseSchema,
      contentHash: z.string().regex(/^[a-f0-9]{64}$/),
    }))
    .length(5),
});

const ScoringConfigBase = z.object({
  tierMetric: z.enum(["countAchieved", "overallTotal", "overallAvg"]),
  passThreshold: z.number(),
  tiers: z.array(TierSchema).min(1),
  rollup: RollupSchema.optional(),
  domains: z.array(DomainDefSchema).optional(),
  scaleUpScore: z.boolean().optional(),
  phasePeerBenchmarkCatalogue: PhasePeerBenchmarkCatalogueSchema.optional(),
});

export const ScoringConfigSchema = ScoringConfigBase;

// ─── Shared validation helpers (used by both runtime + publish schemas) ─
//
// Each helper attaches issues via ctx.addIssue. Centralising the checks
// here keeps the runtime + publish schemas in lock-step.

const PLACEHOLDER_SENTINELS = ["TODO", "PLACEHOLDER", "Lorem"] as const;
const GROWTH_PHASES = [1, 2, 3, 4, 5] as const satisfies readonly GrowthPhaseNumber[];

function checkPhasePeerCatalogue(
  questions: Array<z.infer<typeof QuestionBase>>,
  cfg: z.infer<typeof ScoringConfigBase>,
  ctx: z.RefinementCtx,
): void {
  const scorableWithIndex = questions
    .map((question, index) => ({ question, index }))
    .filter((row): row is { question: SliderLikertQuestion; index: number } =>
      row.question.type === "SLIDER_LIKERT"
    );
  const catalogue = cfg.phasePeerBenchmarkCatalogue;
  const questionsWithPeers = scorableWithIndex.filter(
    ({ question }) => question.phasePeerBenchmarks !== undefined,
  );

  if (!catalogue && questionsWithPeers.length > 0) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["scoringConfig", "phasePeerBenchmarkCatalogue"],
      message: "Phase peer question rows require catalogue metadata",
    });
    return;
  }
  if (!catalogue) return;

  if (questionsWithPeers.length === 0) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["scoringConfig", "phasePeerBenchmarkCatalogue"],
      message: "Phase peer catalogue requires at least one peer-bearing scorable question",
    });
    return;
  }

  if (questionsWithPeers.length !== scorableWithIndex.length) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["questions"],
      message: `Phase peer catalogue requires every scorable question to carry five rows; found ${questionsWithPeers.length} of ${scorableWithIndex.length}`,
    });
  }

  const metadataPhases = new Set<GrowthPhaseNumber>();
  for (let index = 0; index < catalogue.phases.length; index += 1) {
    const row = catalogue.phases[index];
    if (metadataPhases.has(row.phase)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["scoringConfig", "phasePeerBenchmarkCatalogue", "phases", index, "phase"],
        message: `Duplicate phase peer catalogue metadata for phase ${row.phase}`,
      });
    }
    metadataPhases.add(row.phase);
  }
  for (const phase of GROWTH_PHASES) {
    if (!metadataPhases.has(phase)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["scoringConfig", "phasePeerBenchmarkCatalogue", "phases"],
        message: `Missing phase peer catalogue metadata for phase ${phase}`,
      });
    }
  }

  for (const { question, index: questionIndex } of scorableWithIndex) {
    const rows = question.phasePeerBenchmarks;
    if (!rows) continue;
    if (rows.length !== GROWTH_PHASES.length) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["questions", questionIndex, "phasePeerBenchmarks"],
        message: `Question ${question.stableKey} must carry exactly five phase peer rows`,
      });
    }
    const rowPhases = new Set<GrowthPhaseNumber>();
    for (let rowIndex = 0; rowIndex < rows.length; rowIndex += 1) {
      const row = rows[rowIndex];
      if (rowPhases.has(row.phase)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["questions", questionIndex, "phasePeerBenchmarks", rowIndex, "phase"],
          message: `Duplicate phase peer row for phase ${row.phase}`,
        });
      }
      rowPhases.add(row.phase);
    }
    for (const phase of GROWTH_PHASES) {
      if (!rowPhases.has(phase)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["questions", questionIndex, "phasePeerBenchmarks"],
          message: `Question ${question.stableKey} is missing phase peer row ${phase}`,
        });
      }
    }
  }
}

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

  for (const { q, origIdx } of scoredWithIndex) {
    for (let pi = 0; pi < (q.phaseRecommendations?.length ?? 0); pi++) {
      const bands = q.phaseRecommendations![pi].bands;
      for (let bi = 0; bi < bands.length; bi++) {
        const band = bands[bi];
        if (band.maxScore < band.minScore) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ["questions", origIdx, "phaseRecommendations", pi, "bands", bi],
            message: `Phase recommendation band ${bi}: maxScore < minScore`,
          });
        }
        if (band.minScore < q.scale.min || band.maxScore > q.scale.max) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ["questions", origIdx, "phaseRecommendations", pi, "bands", bi],
            message: `Phase recommendation band ${bi} falls outside scale [${q.scale.min}, ${q.scale.max}]`,
          });
        }
      }
      const sorted = [...bands].sort((a, b) => a.minScore - b.minScore);
      for (let bi = 0; bi < sorted.length - 1; bi++) {
        if (sorted[bi + 1].minScore <= sorted[bi].maxScore) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ["questions", origIdx, "phaseRecommendations", pi, "bands"],
            message: `Phase recommendation bands overlap: [${sorted[bi].minScore}, ${sorted[bi].maxScore}] and [${sorted[bi + 1].minScore}, ${sorted[bi + 1].maxScore}]`,
          });
        }
      }
    }
  }

  // Wave U (spec 19u U-2/D4) — NUMBER findings bands: max>=min + non-overlap.
  // NO scale-bounds or coverage check — the NUMBER domain is unbounded and
  // gaps are legal (a value in no band simply produces no finding).
  for (let qi = 0; qi < questions.length; qi++) {
    const q = questions[qi];
    if (q.type !== "NUMBER") continue;
    const bands = q.recommendations;
    if (!bands || bands.length === 0) continue;

    for (let bi = 0; bi < bands.length; bi++) {
      if (bands[bi].maxScore < bands[bi].minScore) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["questions", qi, "recommendations", bi],
          message: `Finding band ${bi}: maxScore < minScore`,
        });
      }
    }
    const sorted = [...bands].sort((a, b) => a.minScore - b.minScore);
    for (let i = 0; i < sorted.length - 1; i++) {
      const a = sorted[i];
      const b = sorted[i + 1];
      if (b.minScore <= a.maxScore) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["questions", qi, "recommendations"],
          message: `Finding bands overlap: [${a.minScore}, ${a.maxScore}] and [${b.minScore}, ${b.maxScore}]`,
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
      // Wave U (D21) — length cap applies to ALL rule kinds at publish.
      checkFindingTextCap(txt, ["questions", origIdx, "recommendations", bi, "text"], ctx);
    }
  }

  for (const { q, origIdx } of scoredWithIndex) {
    const phaseRows = q.phaseRecommendations;
    if (!phaseRows) continue;

    const seenPhases = new Set<GrowthPhaseNumber>();
    for (let pi = 0; pi < phaseRows.length; pi++) {
      const phaseRow = phaseRows[pi];
      if (seenPhases.has(phaseRow.phase)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["questions", origIdx, "phaseRecommendations", pi, "phase"],
          message: `Duplicate phase recommendation for phase ${phaseRow.phase}`,
        });
      }
      seenPhases.add(phaseRow.phase);

      const bands = phaseRow.bands;
      if (bands.length === 0) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["questions", origIdx, "phaseRecommendations", pi, "bands"],
          message: `Phase ${phaseRow.phase} must define recommendation bands that tile 0-10`,
        });
        continue;
      }

      const sorted = [...bands].sort((a, b) => a.minScore - b.minScore);
      if (sorted[0].minScore !== 0) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["questions", origIdx, "phaseRecommendations", pi, "bands"],
          message: `Phase ${phaseRow.phase} first band must start at 0; got ${sorted[0].minScore}`,
        });
      }
      if (sorted[sorted.length - 1].maxScore !== 10) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["questions", origIdx, "phaseRecommendations", pi, "bands"],
          message: `Phase ${phaseRow.phase} last band must end at 10; got ${sorted[sorted.length - 1].maxScore}`,
        });
      }
      for (let bi = 0; bi < sorted.length - 1; bi++) {
        const expectedNext = sorted[bi].maxScore + 1;
        if (sorted[bi + 1].minScore !== expectedNext) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ["questions", origIdx, "phaseRecommendations", pi, "bands"],
            message:
              sorted[bi + 1].minScore > expectedNext
                ? `Gap between phase recommendation bands at value ${expectedNext} (next band starts at ${sorted[bi + 1].minScore})`
                : `Overlap or step misalignment between phase recommendation bands at ${sorted[bi].maxScore} / ${sorted[bi + 1].minScore}`,
          });
        }
      }

      for (let bi = 0; bi < bands.length; bi++) {
        const text = bands[bi].text;
        if (text.trim().length === 0) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ["questions", origIdx, "phaseRecommendations", pi, "bands", bi, "text"],
            message: "Phase recommendation text cannot be blank",
          });
        }
        for (const sentinel of PLACEHOLDER_SENTINELS) {
          if (text.includes(sentinel)) {
            ctx.addIssue({
              code: z.ZodIssueCode.custom,
              path: ["questions", origIdx, "phaseRecommendations", pi, "bands", bi, "text"],
              message: `Phase recommendation text contains placeholder sentinel "${sentinel}"`,
            });
            break;
          }
        }
        checkFindingTextCap(text, ["questions", origIdx, "phaseRecommendations", pi, "bands", bi, "text"], ctx);
      }
    }

    for (const phase of [1, 2, 3, 4, 5] as const) {
      if (!seenPhases.has(phase)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["questions", origIdx, "phaseRecommendations"],
          message: `Missing phase recommendation for phase ${phase}`,
        });
      }
    }
  }

  // ── Wave U (spec 19u U-2) — publish-tier checks for the new rule kinds ──
  for (let qi = 0; qi < questions.length; qi++) {
    const q = questions[qi];

    // TEXT questions can never carry findings rules. The value survives the
    // parse only because TextQuestion declares `recommendations: unknown` —
    // rejection deliberately lives HERE, not at save (spec D10 layering).
    if (q.type === "TEXT") {
      if (q.recommendations !== undefined && q.recommendations !== null) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["questions", qi, "recommendations"],
          message: `TEXT question "${q.stableKey}" cannot carry findings rules`,
        });
      }
      continue;
    }

    // NUMBER — sentinels + length cap (max>=min + non-overlap already run in
    // the runtime tier, which publish includes; gaps are legal per D4).
    if (q.type === "NUMBER") {
      const bands = q.recommendations;
      if (!bands || bands.length === 0) continue;
      for (let bi = 0; bi < bands.length; bi++) {
        const txt = bands[bi].text ?? "";
        for (const sentinel of PLACEHOLDER_SENTINELS) {
          if (txt.includes(sentinel)) {
            ctx.addIssue({
              code: z.ZodIssueCode.custom,
              path: ["questions", qi, "recommendations", bi, "text"],
              message: `Finding text contains placeholder sentinel "${sentinel}"`,
            });
            break;
          }
        }
        checkFindingTextCap(txt, ["questions", qi, "recommendations", bi, "text"], ctx);
      }
      continue;
    }

    // MULTI_CHOICE — every rule's optionKey must exist on THIS question,
    // duplicate rule optionKeys are rejected, sentinels + cap on text.
    if (q.type === "MULTI_CHOICE") {
      const rules = q.recommendations;
      if (!rules || rules.length === 0) continue;
      const optionKeys = new Set((q.options ?? []).map((o) => o.key));
      const seen = new Set<string>();
      for (let ri = 0; ri < rules.length; ri++) {
        const rule = rules[ri];
        if (!optionKeys.has(rule.optionKey)) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ["questions", qi, "recommendations", ri, "optionKey"],
            message: `Finding rule optionKey "${rule.optionKey}" is not among the question's options`,
          });
        }
        if (seen.has(rule.optionKey)) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ["questions", qi, "recommendations", ri, "optionKey"],
            message: `Duplicate finding rule for optionKey "${rule.optionKey}"`,
          });
        }
        seen.add(rule.optionKey);
        const txt = rule.text ?? "";
        for (const sentinel of PLACEHOLDER_SENTINELS) {
          if (txt.includes(sentinel)) {
            ctx.addIssue({
              code: z.ZodIssueCode.custom,
              path: ["questions", qi, "recommendations", ri, "text"],
              message: `Finding text contains placeholder sentinel "${sentinel}"`,
            });
            break;
          }
        }
        checkFindingTextCap(txt, ["questions", qi, "recommendations", ri, "text"], ctx);
      }
    }
  }
}

// Wave U (D21) — publish-tier cap on rule text. 2,000 chars comfortably
// clears the longest live SU-Full band (482 chars, measured 2026-07-05)
// while guarding report/print blowup from a runaway paste.
const MAX_FINDING_TEXT_LENGTH = 2000;

function checkFindingTextCap(
  text: string,
  path: (string | number)[],
  ctx: z.RefinementCtx
): void {
  if (text.length > MAX_FINDING_TEXT_LENGTH) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path,
      message: `Finding text is ${text.length} chars — max ${MAX_FINDING_TEXT_LENGTH}`,
    });
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
    checkPhasePeerCatalogue(data.questions, data.scoringConfig, ctx);
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
    checkGlobalTierTiling(data.questions, data.scoringConfig, ctx);
    checkSectionRefsResolve(data.sections, data.questions, ctx);
    checkShowIfIntegrity(data.sections, data.questions, ctx);
  });

/**
 * Wave ED2 (spec 19ad C1) — the ONE publish-validation entry point. Both the
 * publish route AND the editor's live Safe-to-Publish badge call this, so the
 * live readout can never drift from the server gate (extract-don't-fork, the
 * same move Wave 1 made for computeScoreResult). Returns [] when the version is
 * publishable; otherwise the Zod issues the 422 carries. Pure, no db.
 */
export function getPublishValidationIssues(input: {
  questions: unknown;
  sections: unknown;
  scoringConfig: unknown;
}): z.ZodIssue[] {
  const res = TemplateVersionForPublishSchema.safeParse(input);
  return res.success ? [] : res.error.issues;
}

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

/**
 * V-1 (Wave V) — publish-time GLOBAL tier-tiling gate.
 *
 * `scoreSubmission` step 2 asserts `scoringConfig.tiers` tile the version's
 * metric domain; a version failing it 400s (INVALID_SCORING_CONFIG) on EVERY
 * submit, so it must never publish — walk-found during the Wave U launch,
 * where a non-tiling draft published fine and then failed every submission.
 * Ambiguous-domain configs (mixed scales under overallAvg/rollup, zero
 * sliders under rollup) reject here too: the domain computation throws the
 * same INVALID_SCORING_CONFIG at runtime.
 *
 * Parity is the contract: the domain comes from `computeGlobalTierDomain`,
 * the SAME helper step 2 calls (SLIDER_LIKERT-only filter, rollup vs legacy
 * branches), so publish-pass ⇒ step-2-pass and qualitative templates that
 * score today can never be newly blocked.
 */
function checkGlobalTierTiling(
  questions: Array<z.infer<typeof QuestionBase>>,
  cfg: z.infer<typeof ScoringConfigBase>,
  ctx: z.RefinementCtx,
): void {
  const sliderQuestions = questions.filter(
    (q): q is SliderLikertQuestion => q.type === "SLIDER_LIKERT"
  );
  let domain: TierDomain;
  try {
    domain = computeGlobalTierDomain(sliderQuestions, cfg);
  } catch (err) {
    if (err instanceof ScoringValidationError) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["scoringConfig", "tiers"],
        message: err.message,
      });
      return;
    }
    throw err;
  }
  const issues = validateTierTiling(cfg.tiers, domain, [
    "scoringConfig",
    "tiers",
  ]);
  for (const issue of issues) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: issue.path,
      message: issue.message,
    });
  }
}

/**
 * Wave W (spec 19w §2.3) — publish-time showIf referential integrity. For
 * every question carrying a showIf: the gate must exist, be MULTI_CHOICE,
 * appear STRICTLY EARLIER in canonical survey render order (C1 — the shared
 * buildSectionPages order, never raw sortOrder), carry the referenced
 * optionKey, and not itself be conditional (no chains); the carrier must be
 * optional (D4 — a hidden required question would block every submit).
 * Collects ALL issues in one pass, routed under ["questions", i, "showIf"].
 *
 * Runtime evaluation fails open on every state rejected here, so
 * publish-pass ⇒ the renderer never sees an invalid rule.
 */
function checkShowIfIntegrity(
  sections: Array<z.infer<typeof SectionBase>>,
  questions: Array<z.infer<typeof QuestionBase>>,
  ctx: z.RefinementCtx,
): void {
  if (!questions.some((q) => q.showIf)) return;
  const byKey = new Map(questions.map((q) => [q.stableKey, q]));
  const order = canonicalQuestionOrderIndex(sections, questions);

  questions.forEach((q, i) => {
    const rule = q.showIf;
    if (!rule) return;
    const path = ["questions", i, "showIf"];
    const issue = (message: string, tail: string[] = []) =>
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: [...path, ...tail], message });

    const gate = byKey.get(rule.questionKey);
    if (!gate) {
      issue(
        `question "${q.stableKey}": showIf references "${rule.questionKey}", which is not a question in this version`,
        ["questionKey"],
      );
      return;
    }
    if (gate.type !== "MULTI_CHOICE") {
      issue(
        `question "${q.stableKey}": showIf gate "${gate.stableKey}" must be a MULTI_CHOICE question (got ${gate.type})`,
        ["questionKey"],
      );
      return;
    }
    const gateOrder = order.get(gate.stableKey);
    const ownOrder = order.get(q.stableKey);
    if (gateOrder === undefined || ownOrder === undefined || gateOrder >= ownOrder) {
      issue(
        `question "${q.stableKey}": showIf gate "${gate.stableKey}" must appear strictly earlier in the survey`,
        ["questionKey"],
      );
    }
    const optionKeys = new Set((gate.options ?? []).map((o) => o.key));
    if (!optionKeys.has(rule.optionKey)) {
      issue(
        `question "${q.stableKey}": showIf option "${rule.optionKey}" is not an option of gate "${gate.stableKey}"`,
        ["optionKey"],
      );
    }
    if (gate.showIf) {
      issue(
        `question "${q.stableKey}": showIf gate "${gate.stableKey}" is itself conditional — chained conditions are not supported`,
        ["questionKey"],
      );
    }
    if (q.isRequired) {
      issue(
        `question "${q.stableKey}": a conditional question cannot be required — a hidden required question would block every submission`,
      );
    }
  });
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
  | "TOO_MANY_CHOICES"
  | "SU_FULL_PHASE_PEERS_CATALOGUE_INCOMPLETE"
  | "SU_FULL_PHASE_PEERS_PHASE_MISSING"
  | "SU_FULL_PHASE_PEERS_HASH_MISMATCH";

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
  /** Governed peer value selected from the same frozen organizational phase. */
  peerValue?: number;
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
  /**
   * Wave U (spec 19u D18, ADR-0021) — the frozen findings snapshot: every
   * findings rule that FIRED for this respondent, resolved once at scoring
   * time. ALWAYS written by current code (empty array when nothing fires);
   * typed optional only because pre-Wave-U frozen results lack it — readers
   * must tolerate absence. Reports render this snapshot; they never
   * re-resolve. Sliders ALSO keep their legacy per-row `recommendation`
   * (scored reports render sliders from the rows — no double display).
   */
  findings?: ResolvedFinding[];
  /** The organizational phase used to resolve phase-aware recommendations. */
  recommendationPhase?: GrowthPhaseNumber;
  /** Provenance for the governed peer vector frozen into perQuestion rows. */
  peerBenchmarkSnapshot?: {
    sourceId: string;
    contentHash: string;
    phase: GrowthPhaseNumber;
  };
}

// ─── Helpers ─────────────────────────────────────────────────────────────

type Question = z.infer<typeof QuestionSchema>;
type ScoringConfig = z.infer<typeof ScoringConfigSchema>;
type Tier = z.infer<typeof TierSchema>;

export interface TierDomain {
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
 * V-1 (Wave V) — the GLOBAL tier metric domain, shared VERBATIM by
 * `scoreSubmission` step 2 and the publish-time `checkGlobalTierTiling` so
 * the two paths can never diverge. Rollup set → rollup metric scale; unset →
 * the legacy tierMetric-implied domain (byte-for-byte preserved
 * Rockefeller/QSP behavior). Throws ScoringValidationError on ambiguous
 * configs (mixed scales, zero questions), matching runtime behavior.
 */
export function computeGlobalTierDomain(
  scorableQuestions: SliderLikertQuestion[],
  scoringConfig: Pick<ScoringConfig, "rollup" | "tierMetric">
): TierDomain {
  if (scoringConfig.rollup) {
    return computeRollupTierDomain(scorableQuestions);
  }
  return computeTierDomain(scorableQuestions, scoringConfig.tierMetric);
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
export type TierTilingIssueCode =
  | "EMPTY_TIERS"
  | "FIRST_RANGE_START"
  | "EARLY_NO_MAXIMUM"
  | "RANGE_GAP"
  | "RANGE_OVERLAP"
  | "LAST_RANGE_END";

export interface TierTilingIssue {
  code: TierTilingIssueCode;
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
      code: "EMPTY_TIERS",
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
      code: "FIRST_RANGE_START",
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
        code: "EARLY_NO_MAXIMUM",
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
        code: b.minMetric > expectedNextMin ? "RANGE_GAP" : "RANGE_OVERLAP",
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
      code: "LAST_RANGE_END",
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function assertSelectedPhasePeerMetadata(
  version: TemplateVersionForScoring,
  selectedPhase: GrowthPhaseNumber | undefined,
): void {
  if (selectedPhase === undefined) return;
  const scoringConfig = isRecord(version.scoringConfig)
    ? version.scoringConfig
    : undefined;
  const catalogue = scoringConfig?.phasePeerBenchmarkCatalogue;
  if (!isRecord(catalogue)) return;
  if (!Array.isArray(catalogue.phases)) return;
  const phases = catalogue.phases;
  const selectedMetadata = phases.find(
    (row) => isRecord(row) && row.phase === selectedPhase,
  );
  if (!selectedMetadata) {
    throw new ScoringValidationError("SU_FULL_PHASE_PEERS_PHASE_MISSING", {
      phase: selectedPhase,
    });
  }

  if (!Array.isArray(version.questions)) return;
  for (const rawQuestion of version.questions) {
    if (!isRecord(rawQuestion) || rawQuestion.type !== "SLIDER_LIKERT") continue;
    const rows = rawQuestion.phasePeerBenchmarks;
    if (rows === undefined || !Array.isArray(rows)) continue;
    const selectedRows = rows.filter(
      (row) => isRecord(row) && row.phase === selectedPhase,
    );
    if (selectedRows.length !== 1) {
      throw new ScoringValidationError("SU_FULL_PHASE_PEERS_HASH_MISMATCH", {
        stableKey: rawQuestion.stableKey,
        phase: selectedPhase,
      });
    }
  }
}

function hasPhasePeerValidationIssue(issues: z.ZodIssue[]): boolean {
  return issues.some(
    (issue) =>
      issue.path.includes("phasePeerBenchmarks") ||
      issue.path.includes("phasePeerBenchmarkCatalogue") ||
      issue.message.startsWith(
        "Phase peer catalogue requires every scorable question",
      ),
  );
}

// ─── Main entry point ────────────────────────────────────────────────────

export function scoreSubmission(
  version: TemplateVersionForScoring,
  answers: Answer[],
  options?: {
    allowMissingRequired?: boolean;
    recommendationPhase?: GrowthPhaseNumber;
  }
): ScoreResult {
  assertSelectedPhasePeerMetadata(version, options?.recommendationPhase);

  // 1) Validate the version shape with Zod first so downstream code can
  //    trust the shape.
  const parsed = TemplateVersionForScoringSchema.safeParse(version);
  if (!parsed.success) {
    if (hasPhasePeerValidationIssue(parsed.error.issues)) {
      throw new ScoringValidationError(
        "SU_FULL_PHASE_PEERS_CATALOGUE_INCOMPLETE",
        { issues: parsed.error.issues },
      );
    }
    throw new ScoringValidationError(
      "INVALID_SCORING_CONFIG",
      { issues: parsed.error.issues },
      "Template version failed schema validation"
    );
  }
  const v = parsed.data;
  const peerCatalogue = v.scoringConfig.phasePeerBenchmarkCatalogue;
  const selectedPeerPhase = options?.recommendationPhase;
  const selectedPeerMetadata = peerCatalogue?.phases.find(
    (row) => row.phase === selectedPeerPhase,
  );

  if (peerCatalogue && selectedPeerPhase !== undefined && !selectedPeerMetadata) {
    throw new ScoringValidationError("SU_FULL_PHASE_PEERS_PHASE_MISSING", {
      phase: selectedPeerPhase,
    });
  }

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
  assertTierTiling(
    v.scoringConfig.tiers,
    computeGlobalTierDomain(scorableQuestions, v.scoringConfig)
  );

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
    // Phase-aware recommendations take precedence. Runtime is lenient on gaps
    // and unmatched/missing phases: omit `recommendation` rather than throw.
    if (q.phaseRecommendations !== undefined) {
      const phaseRow = q.phaseRecommendations.find(
        (row) => row.phase === options?.recommendationPhase,
      );
      row.recommendation = phaseRow?.bands.find(
        (band) => value >= band.minScore && value <= band.maxScore,
      )?.text;
    } else if (q.recommendations && q.recommendations.length > 0) {
      for (const band of q.recommendations) {
        if (value >= band.minScore && value <= band.maxScore) {
          row.recommendation = band.text;
          break;
        }
      }
    }
    if (selectedPeerPhase !== undefined && q.phasePeerBenchmarks !== undefined) {
      const peerRow = q.phasePeerBenchmarks.find(
        (candidate) => candidate.phase === selectedPeerPhase,
      );
      if (!peerRow) {
        throw new ScoringValidationError("SU_FULL_PHASE_PEERS_HASH_MISMATCH", {
          stableKey: q.stableKey,
          phase: selectedPeerPhase,
        });
      }
      row.peerValue = peerRow.value;
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

  // Wave U (D18) — resolve + freeze the findings snapshot UNCONDITIONALLY
  // (the flag gates authoring + rendering, never this write). Empty array
  // when no rules fire. Total-tolerant: resolveFindings never throws.
  const findingsAnswerMap = new Map<string, unknown>();
  for (const a of answers) findingsAnswerMap.set(a.stableKey, a.value);
  const findings = resolveFindings(v.questions, findingsAnswerMap);

  const result: ScoreResult = {
    perQuestion,
    perSection,
    overallTotal,
    overallAverage,
    countAchieved,
    tier,
    tierMetricValue,
    unansweredKeys,
    findings,
  };
  if (perDomain !== undefined) result.perDomain = perDomain;
  if (scaleUpScore !== undefined) result.scaleUpScore = scaleUpScore;
  if (options?.recommendationPhase !== undefined) {
    result.recommendationPhase = options.recommendationPhase;
  }
  if (
    peerCatalogue &&
    selectedPeerPhase !== undefined &&
    selectedPeerMetadata &&
    scorableQuestions.length > 0 &&
    perQuestion.length === scorableQuestions.length &&
    perQuestion.every((row) => Number.isFinite(row.peerValue))
  ) {
    result.peerBenchmarkSnapshot = {
      sourceId: peerCatalogue.sourceId,
      contentHash: selectedPeerMetadata.contentHash,
      phase: selectedPeerPhase,
    };
  }
  return result;
}
