import type { SuFullPeerProvenance } from "./su-full-peer-presentation";

export const SU_FULL_GOVERNED_PEER_DISCLOSURE =
  "Peers are a governed benchmark snapshot selected by organizational phase and frozen when this result was scored. This is not an industry-, geography-, or cohort-matched comparison.";

export const SU_FULL_LEGACY_PEER_DISCLOSURE =
  "Peers use the governed historical baseline for reports scored before phase-aware peer snapshots were frozen. This is not an industry-, geography-, or cohort-matched comparison.";

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
        provenanceLabel: `Legacy baseline · ${provenance.sourceId}`,
      }
    : {
        disclosure: SU_FULL_GOVERNED_PEER_DISCLOSURE,
        provenanceLabel: `Phase P${provenance.phase} · ${provenance.sourceId}`,
      };
}
