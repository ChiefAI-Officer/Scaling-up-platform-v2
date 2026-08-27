/**
 * Scaling CEO Full immutable-report peer contract.
 *
 * This contract is intentionally owned by Summary Reporting. It does not
 * change the live/direct group-report benchmark path. Values are transcribed
 * from the de-identified Jeff-approved 2026-08-27 artifact and are frozen into
 * each summary-report snapshot at creation time.
 */
export const SCALING_CEO_FULL_PEER_BENCHMARK_VERSION =
  "2026-08-14.question-controlled-aggregate-provisional";

export const SCALING_CEO_FULL_PEER_BENCHMARK = {
  version: SCALING_CEO_FULL_PEER_BENCHMARK_VERSION,
  status: "provisional",
  cohort: "single Esperto cohort",
  disclosure:
    "Peers = provisional industry benchmark (single Esperto cohort, v2026-08-14.question-controlled-aggregate-provisional); not yet size-matched.",
  questions: {
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
    Q15: 6,
    Q16: 5.4,
    Q17: 5.3,
    Q18: 4.9,
    Q19: 4.2,
    Q20: 2.4,
    Q21: 6.2,
    Q22: 6,
    Q23: 5.9,
    Q24: 4.7,
    Q25: 5.8,
    Q26: 5.9,
    Q27: 5,
    Q28: 5.6,
    Q29: 5.7,
    Q30: 5.6,
    Q31: 6.1,
    Q32: 6.4,
    Q33: 5.9,
    Q34: 5,
    Q35: 6.2,
    Q36: 6.2,
    Q37: 6.3,
    Q38: 6.9,
    Q39: 6.7,
    Q40: 6.2,
    Q41: 8,
    Q42: 7,
    Q43: 5.8,
    Q44: 6.9,
    Q45: 7.8,
    Q46: 5.8,
    Q47: 5,
    Q48: 5.8,
    Q49: 4,
    Q50: 3,
    Q51: 6.5,
    Q52: 6,
    Q53: 5.1,
    Q54: 6.2,
    Q55: 5.9,
    Q56: 4.8,
    Q57: 5.6,
    Q58: 5,
    Q59: 5.9,
    Q60: 6.4,
    Q61: 5.6,
  },
} as const;

export type ScalingCeoFullPeerBenchmark =
  typeof SCALING_CEO_FULL_PEER_BENCHMARK;
