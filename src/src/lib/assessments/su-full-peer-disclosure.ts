import type { SuFullPeerProvenance } from "./su-full-peer-presentation";
import { GROWTH_PHASE_NARRATIVES } from "./su-full-phase";

export const SU_FULL_GOVERNED_PEER_DISCLOSURE =
  "Peers shows the benchmark associated with your organizational phase when you completed this assessment. It is not matched by industry, geography, or a custom peer group.";

export const SU_FULL_LEGACY_PEER_DISCLOSURE =
  "Peers shows the historical benchmark used for this report. It is not matched by industry, geography, or a custom peer group.";

export type SuFullPeerDisclosureModel = Readonly<{
  disclosure: string;
  provenanceLabel: string;
}>;

export function buildSuFullPeerDisclosureModel(
  provenance: SuFullPeerProvenance,
): SuFullPeerDisclosureModel {
  return provenance.legacy
    ? {
        disclosure: SU_FULL_LEGACY_PEER_DISCLOSURE,
        provenanceLabel: "Historical benchmark",
      }
    : {
        disclosure: SU_FULL_GOVERNED_PEER_DISCLOSURE,
        provenanceLabel: `Phase ${provenance.phase} · ${GROWTH_PHASE_NARRATIVES[provenance.phase].name}`,
      };
}
