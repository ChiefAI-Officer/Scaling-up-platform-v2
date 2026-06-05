/**
 * Esperto → stableKey crosswalk — Leadership Vision Alignment (STUB).
 *
 * Spec ref: docs/specs/v7.6/12-esperto-historical-import.md §7, §14.
 *
 * templateAlias is the seed's TEMPLATE_ALIAS = "leadership-vision-alignment"
 * (prisma/seed-lva-assessment.ts).
 *
 * // STUB — gated on Jeff's sample exports (spec 12 §14). Do not author until a
 * // real LVA export exists. `locked: false` ⇒ results import refused.
 */

import type { Crosswalk } from "./types";

export const lvaCrosswalk: Crosswalk = {
  templateAlias: "leadership-vision-alignment",
  espertoVariant: null,
  locked: false,
  map: [],
  droppedKeys: [],
};
