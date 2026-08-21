/**
 * Historical Esperto per-question peer baseline for Scaling Up Full.
 *
 * The values were captured on 2026-08-14 from controlled Esperto reports.
 * Eleven assessments varied Q01 across every answer from 0 through 10. Later
 * five-phase evidence superseded the phase-control conclusion for newly scored
 * results, while these values remain the executable historical baseline.
 *
 * These values are not a mutable current reference. New governed reports use
 * peer values frozen into their score result; only reports with neither frozen
 * rows nor snapshot provenance render this baseline.
 */

export const SCALING_UP_FULL_TEMPLATE_ALIAS = "scaling-up-full";

export const SU_FULL_LEGACY_PEER_SOURCE_ID =
  "2026-08-14.esperto-controlled-v1";
export const SU_FULL_LEGACY_PEER_CONTENT_HASH =
  "fe63364e3b5e42897b3b3886135310f673e320b4a07b1453ad300a49a91b4dbd";

export const SU_FULL_QUESTION_BENCHMARKS_VERSION =
  SU_FULL_LEGACY_PEER_SOURCE_ID;
export const SU_FULL_QUESTION_BENCHMARKS_EFFECTIVE_DATE = "2026-08-14";
export const SU_FULL_QUESTION_BENCHMARKS_SOURCE =
  "Esperto controlled reports: 11 answer-level variants plus company-size and organizational-phase controls";

export interface SuFullQuestionBenchmark {
  stableKey: string;
  value: number;
}

/**
 * Ordered exactly like the 61 scored questions in the Scaling Up Full seed.
 * Values use Esperto's displayed one-decimal precision on a 0-10 scale.
 */
export const SU_FULL_QUESTION_BENCHMARKS = [
  { stableKey: "Q01", value: 6.3 },
  { stableKey: "Q02", value: 7.2 },
  { stableKey: "Q03", value: 5.6 },
  { stableKey: "Q04", value: 5.9 },
  { stableKey: "Q05", value: 6.2 },
  { stableKey: "Q06", value: 4.6 },
  { stableKey: "Q07", value: 4.4 },
  { stableKey: "Q08", value: 5.5 },
  { stableKey: "Q09", value: 7.2 },
  { stableKey: "Q10", value: 6.4 },
  { stableKey: "Q11", value: 5.7 },
  { stableKey: "Q12", value: 5.2 },
  { stableKey: "Q13", value: 7.3 },
  { stableKey: "Q14", value: 6.7 },
  { stableKey: "Q15", value: 6.0 },
  { stableKey: "Q16", value: 5.4 },
  { stableKey: "Q17", value: 5.3 },
  { stableKey: "Q18", value: 4.9 },
  { stableKey: "Q19", value: 4.2 },
  { stableKey: "Q20", value: 2.4 },
  { stableKey: "Q21", value: 6.2 },
  { stableKey: "Q22", value: 6.0 },
  { stableKey: "Q23", value: 5.9 },
  { stableKey: "Q24", value: 4.7 },
  { stableKey: "Q25", value: 5.8 },
  { stableKey: "Q26", value: 5.9 },
  { stableKey: "Q27", value: 5.0 },
  { stableKey: "Q28", value: 5.6 },
  { stableKey: "Q29", value: 5.7 },
  { stableKey: "Q30", value: 5.6 },
  { stableKey: "Q31", value: 6.1 },
  { stableKey: "Q32", value: 6.4 },
  { stableKey: "Q33", value: 5.9 },
  { stableKey: "Q34", value: 5.0 },
  { stableKey: "Q35", value: 6.2 },
  { stableKey: "Q36", value: 6.2 },
  { stableKey: "Q37", value: 6.3 },
  { stableKey: "Q38", value: 6.9 },
  { stableKey: "Q39", value: 6.7 },
  { stableKey: "Q40", value: 6.2 },
  { stableKey: "Q41", value: 8.0 },
  { stableKey: "Q42", value: 7.0 },
  { stableKey: "Q43", value: 5.8 },
  { stableKey: "Q44", value: 6.9 },
  { stableKey: "Q45", value: 7.8 },
  { stableKey: "Q46", value: 5.8 },
  { stableKey: "Q47", value: 5.0 },
  { stableKey: "Q48", value: 5.8 },
  { stableKey: "Q49", value: 4.0 },
  { stableKey: "Q50", value: 3.0 },
  { stableKey: "Q51", value: 6.5 },
  { stableKey: "Q52", value: 6.0 },
  { stableKey: "Q53", value: 5.1 },
  { stableKey: "Q54", value: 6.2 },
  { stableKey: "Q55", value: 5.9 },
  { stableKey: "Q56", value: 4.8 },
  { stableKey: "Q57", value: 5.6 },
  { stableKey: "Q58", value: 5.0 },
  { stableKey: "Q59", value: 5.9 },
  { stableKey: "Q60", value: 6.4 },
  { stableKey: "Q61", value: 5.6 },
] as const satisfies readonly SuFullQuestionBenchmark[];
