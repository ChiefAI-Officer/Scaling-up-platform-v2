/**
 * Esperto -> stableKey crosswalk -- Scaling Up Full (STUB).
 *
 * Spec ref: docs/specs/v7.6/12-esperto-historical-import.md section 7; PLAN.md
 * (Historical Esperto Import -- SU-Full first) work item 2.
 *
 * templateAlias is the seed's ALIAS = "scaling-up-full"
 * (prisma/seed-scaling-up-full-assessment.ts).
 *
 * STUB -- Phase 1 ships this empty, locked:false, so the restricted-individual
 * import path can resolve a REAL Crosswalk object (a clean "crosswalk-locked"
 * block, not a registry miss / 500) while carrying ZERO mapping risk. Phase 2
 * authors the real `map` (61 sliders Q3_1..Q12_10 -> Q01..Q61 + conditional FTE)
 * and flips `locked: true` only after a PR-reviewed lock-checklist verifies the
 * 6 count-tied families (Q5/Q7/Q9/Q11 + Q6/Q10) against the Esperto source.
 */

import type { Crosswalk } from "./types";

export const scalingUpFullCrosswalk: Crosswalk = {
  templateAlias: "scaling-up-full",
  espertoVariant: null,
  locked: false,
  map: [],
  droppedKeys: [],
};
