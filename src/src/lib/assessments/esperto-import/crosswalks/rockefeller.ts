/**
 * Esperto → stableKey crosswalk — Rockefeller Habits Checklist (STUB).
 *
 * Spec ref: docs/specs/v7.6/12-esperto-historical-import.md §7, §14.
 *
 * templateAlias is the seed's TEMPLATE_ALIAS = "RockHabits"
 * (prisma/seed-rockefeller-assessment.ts).
 *
 * // STUB — gated on Jeff's sample exports (spec 12 §14). Do not author until a
 * // real Rockefeller export exists. `locked: false` ⇒ results import refused.
 */

import type { Crosswalk } from "./types";

export const rockefellerCrosswalk: Crosswalk = {
  templateAlias: "RockHabits",
  espertoVariant: null,
  locked: false,
  map: [],
  droppedKeys: [],
};
