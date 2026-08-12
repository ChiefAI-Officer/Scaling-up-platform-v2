/**
 * SU-Full Peers benchmark — static, versioned, key-set bound.
 *
 * PROVISIONAL: values are derived from a single Esperto cohort (cohort1) and
 * are NOT cohort-matched to any particular company size, geography, or
 * industry. They will be updated when a larger reference cohort is available.
 *
 * Scale conventions:
 *   domain / section  — 0–10  (Esperto's 0–100 section SUM ÷ #questions,
 *                               e.g. 47.3 / 8 = 5.9)
 *   scaleUp           — 0–100  Esperto's independently-reported cohort ScaleUp
 *                              Score, stored VERBATIM. Do NOT re-derive it from
 *                              the domain means above — those are stored rounded,
 *                              and Esperto computes ScaleUp by its own weighting,
 *                              not as (mean of domains × 10). (A naive
 *                              mean-of-domains × 10 gives ~60.2, not 53.1.)
 *
 * Keys mirror the SU-Full seed exactly (prisma/seed-scaling-up-full-assessment.ts).
 * Bump SU_FULL_BENCHMARKS_VERSION on ANY value change — the snapshot test
 * (R2-L1) will fail if values change without a version bump.
 */

/** Semver-style provenance string — bump on every value change. */
export const SU_FULL_BENCHMARKS_VERSION = "2026-08-12.cohort1.provisional";

/** Canonical key sets — must stay in sync with the SU-Full seed. */
export const SU_FULL_BENCHMARK_KEYS = {
  domains: ["people", "strategy", "execution", "cash", "you"] as const,
  sections: [
    "S_PEOPLE_YE",
    "S_PEOPLE_CC",
    "S_STRATEGY",
    "S_EXEC_LT",
    "S_EXEC_OP",
    "S_EXEC_SM",
    "S_EXEC_SIT",
    "S_CASH",
    "S_YOU_LEAD",
    "S_YOU_IC",
  ] as const,
  questions: [
    "Q01", "Q02", "Q03", "Q04", "Q05", "Q06", "Q07", "Q08", "Q09", "Q10",
    "Q11", "Q12", "Q13", "Q14", "Q15", "Q16", "Q17", "Q18", "Q19", "Q20",
    "Q21", "Q22", "Q23", "Q24", "Q25", "Q26", "Q27", "Q28", "Q29", "Q30",
    "Q31", "Q32", "Q33", "Q34", "Q35", "Q36", "Q37", "Q38", "Q39", "Q40",
    "Q41", "Q42", "Q43", "Q44", "Q45", "Q46", "Q47", "Q48", "Q49", "Q50",
    "Q51", "Q52", "Q53", "Q54", "Q55", "Q56", "Q57", "Q58", "Q59", "Q60",
    "Q61",
  ] as const,
} as const;

/** Literal key types derived from the canonical key set (above). */
type DomainKey = (typeof SU_FULL_BENCHMARK_KEYS.domains)[number];
type SectionKey = (typeof SU_FULL_BENCHMARK_KEYS.sections)[number];
type QuestionKey = (typeof SU_FULL_BENCHMARK_KEYS.questions)[number];

export interface SuFullBenchmarks {
  version: string;
  /** Per-domain peer mean; 0–10 scale. Keys are bound to the canonical set. */
  domain: Record<DomainKey, number>;
  /** Per-section peer mean; 0–10 scale. Keys are bound to the canonical set. */
  section: Record<SectionKey, number>;
  /** Per-question peer mean; 0–10 scale. Keys are bound to the canonical set. */
  question: Record<QuestionKey, number>;
  /** Overall ScaleUp peer mean; 0–100 scale. */
  scaleUp: number;
}

const SU_FULL_DATA: SuFullBenchmarks = {
  version: SU_FULL_BENCHMARKS_VERSION,
  domain: {
    people: 6.1,
    strategy: 5.0,
    execution: 5.8,
    cash: 7.8,
    you: 5.4,
  },
  section: {
    S_PEOPLE_YE: 5.9,
    S_PEOPLE_CC: 6.3,
    S_STRATEGY: 5.0,
    S_EXEC_LT: 4.5,
    S_EXEC_OP: 5.6,
    S_EXEC_SM: 6.4,
    S_EXEC_SIT: 6.6,
    S_CASH: 7.8,
    S_YOU_LEAD: 6.1,
    S_YOU_IC: 4.6,
  },
  // Extracted in canonical question order from Jeff's Esperto Scaling Up Full
  // group + CEO reports. These are the same single-cohort, provisional values
  // as the aggregate benchmark above; the renderer labels that provenance.
  question: {
    Q01: 6.3,
    Q02: 7.2,
    Q03: 5.6,
    Q04: 5.9,
    Q05: 6.2,
    Q06: 4.6,
    Q07: 4.4,
    Q08: 5.5,
    Q09: 7.2,
    Q10: 6.4,
    Q11: 5.7,
    Q12: 5.2,
    Q13: 7.3,
    Q14: 6.7,
    Q15: 6.0,
    Q16: 5.4,
    Q17: 5.3,
    Q18: 4.9,
    Q19: 4.2,
    Q20: 2.4,
    Q21: 6.2,
    Q22: 6.0,
    Q23: 5.9,
    Q24: 4.7,
    Q25: 5.8,
    Q26: 5.9,
    Q27: 5.0,
    Q28: 5.6,
    Q29: 5.7,
    Q30: 5.6,
    Q31: 6.1,
    Q32: 6.4,
    Q33: 5.9,
    Q34: 5.0,
    Q35: 6.2,
    Q36: 6.2,
    Q37: 6.3,
    Q38: 6.9,
    Q39: 6.7,
    Q40: 6.2,
    Q41: 8.0,
    Q42: 7.0,
    Q43: 5.8,
    Q44: 6.9,
    Q45: 7.8,
    Q46: 5.8,
    Q47: 5.0,
    Q48: 5.8,
    Q49: 4.0,
    Q50: 3.0,
    Q51: 6.5,
    Q52: 6.0,
    Q53: 5.1,
    Q54: 6.2,
    Q55: 5.9,
    Q56: 4.8,
    Q57: 5.6,
    Q58: 5.0,
    Q59: 5.9,
    Q60: 6.4,
    Q61: 5.6,
  },
  scaleUp: 53.1,
};

/**
 * Returns the Peers benchmark set for the given assessment alias.
 * Returns `null` for any alias that is not "scaling-up-full" (omit-empty).
 */
export function benchmarksFor(
  alias: string | null | undefined
): SuFullBenchmarks | null {
  if (alias === "scaling-up-full") {
    return SU_FULL_DATA;
  }
  return null;
}
