/**
 * GENERATED FILE — DO NOT EDIT.
 *
 * Source: docs/research/esperto-feedback-five-phase-full-matrix-2026-08-20.csv
 * Regenerate: npm run generate:scaling-up-full-phase-peers
 */

import type { PhasePeerBenchmark } from "./scoring";
import type { GrowthPhaseNumber } from "./su-full-phase";

export type { PhasePeerBenchmark } from "./scoring";

export const SU_FULL_PHASE_PEER_SOURCE_ID =
  "2026-08-20.esperto-five-phase-peers-v1";

const P1_P2_P3_P5_VECTOR: Readonly<Record<string, number>> = Object.freeze({
  "Q01": 6.3,
  "Q02": 7.2,
  "Q03": 5.6,
  "Q04": 5.9,
  "Q05": 6.2,
  "Q06": 4.6,
  "Q07": 4.4,
  "Q08": 5.5,
  "Q09": 7.2,
  "Q10": 6.4,
  "Q11": 5.7,
  "Q12": 5.2,
  "Q13": 7.3,
  "Q14": 6.7,
  "Q15": 6,
  "Q16": 5.4,
  "Q17": 5.3,
  "Q18": 4.9,
  "Q19": 4.2,
  "Q20": 2.4,
  "Q21": 6.2,
  "Q22": 6,
  "Q23": 5.9,
  "Q24": 4.7,
  "Q25": 5.8,
  "Q26": 5.9,
  "Q27": 5,
  "Q28": 5.6,
  "Q29": 5.7,
  "Q30": 5.6,
  "Q31": 6.1,
  "Q32": 6.4,
  "Q33": 5.9,
  "Q34": 5,
  "Q35": 6.2,
  "Q36": 6.2,
  "Q37": 6.3,
  "Q38": 6.9,
  "Q39": 6.7,
  "Q40": 6.2,
  "Q41": 8,
  "Q42": 7,
  "Q43": 5.8,
  "Q44": 6.9,
  "Q45": 7.8,
  "Q46": 5.8,
  "Q47": 5,
  "Q48": 5.8,
  "Q49": 4,
  "Q50": 3,
  "Q51": 6.5,
  "Q52": 6,
  "Q53": 5.1,
  "Q54": 6.2,
  "Q55": 5.9,
  "Q56": 4.8,
  "Q57": 5.6,
  "Q58": 5,
  "Q59": 5.9,
  "Q60": 6.4,
  "Q61": 5.6,
});

const P4_VECTOR: Readonly<Record<string, number>> = Object.freeze({
  "Q01": 6.6,
  "Q02": 7.3,
  "Q03": 5.9,
  "Q04": 6.5,
  "Q05": 6.1,
  "Q06": 4.8,
  "Q07": 4.5,
  "Q08": 5.3,
  "Q09": 7.8,
  "Q10": 6.2,
  "Q11": 6.3,
  "Q12": 5.3,
  "Q13": 7,
  "Q14": 7,
  "Q15": 6.5,
  "Q16": 5.9,
  "Q17": 5.8,
  "Q18": 5.2,
  "Q19": 4.6,
  "Q20": 2.5,
  "Q21": 6.5,
  "Q22": 6.5,
  "Q23": 6.7,
  "Q24": 5,
  "Q25": 6,
  "Q26": 5.8,
  "Q27": 5,
  "Q28": 6,
  "Q29": 5.9,
  "Q30": 5.6,
  "Q31": 6,
  "Q32": 6.6,
  "Q33": 6.6,
  "Q34": 5.2,
  "Q35": 6.1,
  "Q36": 6.1,
  "Q37": 6.4,
  "Q38": 6.9,
  "Q39": 6.9,
  "Q40": 6.1,
  "Q41": 8,
  "Q42": 7.5,
  "Q43": 6.3,
  "Q44": 6.6,
  "Q45": 7.9,
  "Q46": 5.6,
  "Q47": 5.2,
  "Q48": 5.9,
  "Q49": 3.6,
  "Q50": 2.8,
  "Q51": 6.4,
  "Q52": 6.4,
  "Q53": 5.5,
  "Q54": 6.3,
  "Q55": 6.6,
  "Q56": 5.1,
  "Q57": 5.6,
  "Q58": 5.2,
  "Q59": 6.1,
  "Q60": 6,
  "Q61": 5.7,
});

export const SU_FULL_PHASE_PEER_CONTENT_HASHES = Object.freeze({
  1: "fe63364e3b5e42897b3b3886135310f673e320b4a07b1453ad300a49a91b4dbd",
  2: "fe63364e3b5e42897b3b3886135310f673e320b4a07b1453ad300a49a91b4dbd",
  3: "fe63364e3b5e42897b3b3886135310f673e320b4a07b1453ad300a49a91b4dbd",
  4: "ae9e9e2fbfc8525f4e6d8c3ca65775a50b85476371f29a74934dbe6dd3a965ff",
  5: "fe63364e3b5e42897b3b3886135310f673e320b4a07b1453ad300a49a91b4dbd",
});

export const SU_FULL_PHASE_PEER_VECTORS: Readonly<
  Record<GrowthPhaseNumber, Readonly<Record<string, number>>>
> = Object.freeze({
  1: P1_P2_P3_P5_VECTOR,
  2: P1_P2_P3_P5_VECTOR,
  3: P1_P2_P3_P5_VECTOR,
  4: P4_VECTOR,
  5: P1_P2_P3_P5_VECTOR,
});

export function buildPhasePeerBenchmarks(
  stableKey: string,
): readonly PhasePeerBenchmark[] {
  if (SU_FULL_PHASE_PEER_VECTORS[1][stableKey] === undefined) {
    throw new Error(
      `Unknown canonical Scaling Up Full question key: ${JSON.stringify(stableKey)}.`,
    );
  }
  return [1, 2, 3, 4, 5].map((phase) => ({
    phase: phase as GrowthPhaseNumber,
    value: SU_FULL_PHASE_PEER_VECTORS[phase as GrowthPhaseNumber][stableKey],
  }));
}

export function getGovernedPeerValue(
  stableKey: string,
  phase: GrowthPhaseNumber,
): number | null {
  return SU_FULL_PHASE_PEER_VECTORS[phase][stableKey] ?? null;
}
