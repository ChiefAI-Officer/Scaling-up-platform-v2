/**
 * Esperto → stableKey crosswalk — Rockefeller Habits Checklist (Wave X).
 *
 * Spec ref: docs/specs/v7.6/19x-wave-x-lva-rockefeller-import.md (X-5);
 * 12-esperto-historical-import.md §7 lock rules.
 *
 * IDENTITY MAP by construction: our seed (`prisma/seed-rockefeller-assessment.ts`)
 * derives its stableKeys as `Q{section}_{question}` — byte-identical to
 * Esperto's own raw export codes (Esperto's variant is even named
 * "RockHabits", which our TEMPLATE_ALIAS mirrors). 10 sections × 4
 * SLIDER_LIKERT questions on the 4-pt (0–3) scale — the source workbook
 * documents "Uses a 4 pt scale"; a 0 is a VALID answer and may appear in
 * historical exports.
 *
 * Raw universe: exactly the 40 slider keys (verified against the sample
 * export's xlsx header 2026-07-06 — no other raw keys exist), so
 * `droppedKeys` is empty. `processed.*` / `reportid`/`date`/`mat`/`cid`/
 * `mid`/`name`/`tags` are top-level metadata, never answer keys.
 *
 * `espertoVariant` stays null DELIBERATELY: restricted exports carry no
 * `variant`, and the report-kind import path (which matches by variant) has
 * never been verified for Rockefeller — it must keep refusing.
 *
 * `locked: true` (2026-07-07): the D4 controlled verification submission
 * proved within-section row order live — all 40 raw values equalled the
 * designed (s+j)%4 pattern and recompute reproduced the totals. Golden
 * fixture `fixtures/wavex-rock-golden.json` (crosswalk-golden.wave-x.test.ts).
 * NOTE the export's `mat` is a per-participant token, NOT a per-instrument
 * schema id (verified: LVA + Rock submissions carry different mats), so the
 * registry's `knownMats` stays null — schema-drift protection falls to the
 * shape detector + exhaustiveness guard (spec 19x D8 case-b).
 */

import type { Crosswalk, CrosswalkEntry } from "./types";

function buildIdentityMap(): CrosswalkEntry[] {
  const map: CrosswalkEntry[] = [];
  for (let section = 1; section <= 10; section++) {
    for (let question = 1; question <= 4; question++) {
      const code = `Q${section}_${question}`;
      map.push({ espertoKey: code, stableKey: code, ourType: "SLIDER_LIKERT" });
    }
  }
  return map;
}

export const rockefellerCrosswalk: Crosswalk = {
  templateAlias: "RockHabits",
  espertoVariant: null,
  locked: true,
  map: buildIdentityMap(),
  droppedKeys: [],
};
