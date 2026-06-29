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
export const SU_FULL_BENCHMARKS_VERSION = "2026-06-28.cohort1.provisional";

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
} as const;

/** Literal key types derived from the canonical key set (above). */
type DomainKey = (typeof SU_FULL_BENCHMARK_KEYS.domains)[number];
type SectionKey = (typeof SU_FULL_BENCHMARK_KEYS.sections)[number];

export interface SuFullBenchmarks {
  version: string;
  /** Per-domain peer mean; 0–10 scale. Keys are bound to the canonical set. */
  domain: Record<DomainKey, number>;
  /** Per-section peer mean; 0–10 scale. Keys are bound to the canonical set. */
  section: Record<SectionKey, number>;
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
