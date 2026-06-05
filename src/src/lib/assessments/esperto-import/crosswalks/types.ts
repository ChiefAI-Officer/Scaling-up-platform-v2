/**
 * Esperto historical import — crosswalk domain types.
 *
 * Spec ref: docs/specs/v7.6/12-esperto-historical-import.md §7 (D10);
 * plan 12a steps 5, 5b, 6.
 *
 * A Crosswalk maps an Esperto export's per-respondent answer Q-codes onto OUR
 * pinned-version `stableKey`s (+ the question `type` we expect that key to be).
 * It is the single source of truth that turns a verbatim Esperto answer block
 * into an answer payload our submission rows understand.
 *
 * PURE: no DB, no React. The map/droppedKeys are authored from the Esperto
 * export + the seed and are unit-verifiable against fixtures.
 *
 * Invariants:
 *   - Every per-respondent ANSWER key (the `raw_`-stripped Q-code) must appear
 *     either in `map` (by `espertoKey`) or in `droppedKeys` — an unrecognized
 *     answer key is a hard error (exhaustiveness guard, §7).
 *   - `locked: false` means the results import is REFUSED for this template
 *     until a human confirms the ambiguous orderings against the seed
 *     screenshots and flips it true (step 5b lock checklist).
 */

/** The four question types our templates support (mirrors the seed payloads). */
export type CrosswalkQuestionType =
  | "SLIDER_LIKERT"
  | "NUMBER"
  | "TEXT"
  | "MULTI_CHOICE";

/** One Esperto-answer-key → our-stableKey binding. */
export interface CrosswalkEntry {
  /** Esperto Q-code, `raw_`-stripped (e.g. "Q3_1", "Remarks1"). */
  espertoKey: string;
  /** Our pinned-version question stableKey (must exist in the published version). */
  stableKey: string;
  /** The question type we expect that stableKey to be in the pinned version. */
  ourType: CrosswalkQuestionType;
}

/** A per-template crosswalk. */
export interface Crosswalk {
  /** Our template alias (verified against the seed's TEMPLATE_ALIAS). */
  templateAlias: string;
  /** Esperto's self-identifying `variant` string, or null when none exists in-file. */
  espertoVariant: string | null;
  /** false ⇒ results import refused for this template until the lock checklist clears. */
  locked: boolean;
  /** Esperto-key → stableKey bindings. */
  map: CrosswalkEntry[];
  /** Every export answer key NOT in `map`, with a reason (exhaustiveness guard). */
  droppedKeys: { key: string; reason: string }[];
}
