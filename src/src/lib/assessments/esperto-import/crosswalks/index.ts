/**
 * Esperto → stableKey crosswalk — registry + lookups + validators.
 *
 * Spec ref: docs/specs/v7.6/12-esperto-historical-import.md §7;
 * plan 12a step 6. ADR-0001 (a stableKey never refers to a different question
 * across versions ⇒ key-exists + type + scale is a COMPLETE compatibility check).
 *
 * PURE: no DB. The two validators are called by the results-import PLAN layer:
 *   - validateCrosswalkExhaustive  — guards the per-respondent ANSWER keys.
 *   - validateCrosswalkAgainstVersion — guards the pinned PUBLISHED version's
 *     question types/scales (catches script-driven type drift, e.g.
 *     scripts/patch-qsp-v2-text-to-slider.ts).
 */

import type { Crosswalk } from "./types";
import { qspV2Crosswalk } from "./qsp-v2";
import { rockefellerCrosswalk } from "./rockefeller";
import { lvaCrosswalk } from "./lva";
import { scalingUpFullCrosswalk } from "./scaling-up-full";

export type { Crosswalk, CrosswalkEntry, CrosswalkQuestionType } from "./types";
export { qspV2Crosswalk } from "./qsp-v2";
export { rockefellerCrosswalk } from "./rockefeller";
export { lvaCrosswalk } from "./lva";
export { scalingUpFullCrosswalk } from "./scaling-up-full";

// ────────────────────────────────────────────────────────────────────────
// Registry
// ────────────────────────────────────────────────────────────────────────

/** All known crosswalks. Stubs (Rockefeller/LVA/SU-Full) are present but `locked:false`. */
export const ALL_CROSSWALKS: readonly Crosswalk[] = [
  qspV2Crosswalk,
  rockefellerCrosswalk,
  lvaCrosswalk,
  scalingUpFullCrosswalk,
];

/**
 * Look up a crosswalk by Esperto's self-identifying `variant` string.
 * Stub crosswalks have `espertoVariant: null` and are never matched here.
 */
export function getCrosswalkByVariant(variant: string): Crosswalk | null {
  return ALL_CROSSWALKS.find((c) => c.espertoVariant === variant) ?? null;
}

/** Look up a crosswalk by our template alias (the seed's TEMPLATE_ALIAS). */
export function getCrosswalkByTemplateAlias(alias: string): Crosswalk | null {
  return ALL_CROSSWALKS.find((c) => c.templateAlias === alias) ?? null;
}

// ────────────────────────────────────────────────────────────────────────
// Validators
// ────────────────────────────────────────────────────────────────────────

/**
 * Exhaustiveness guard (answer keys only — §7).
 *
 * Every key in `answerKeys` (the per-respondent `raw_`-stripped Q-codes) must
 * be covered by `map` (by `espertoKey`) OR listed in `droppedKeys`. Any key in
 * neither is "unknown" → `ok:false` + listed. Caller strips the `raw_` prefix;
 * report-level metadata is a SEPARATE enumerated set and is NOT passed here.
 */
export function validateCrosswalkExhaustive(
  crosswalk: Crosswalk,
  answerKeys: string[],
): { ok: boolean; unknownKeys: string[] } {
  const mapped = new Set(crosswalk.map.map((e) => e.espertoKey));
  const dropped = new Set(crosswalk.droppedKeys.map((d) => d.key));

  const unknownKeys: string[] = [];
  for (const key of answerKeys) {
    if (!mapped.has(key) && !dropped.has(key)) {
      unknownKeys.push(key);
    }
  }

  return { ok: unknownKeys.length === 0, unknownKeys };
}

/** A pinned-version question, as the PLAN layer reads it from the published version. */
export interface VersionQuestion {
  stableKey: string;
  type: string;
  scale?: { min: number; max: number };
}

/**
 * Pinned-version type/scale compatibility (ADR-0001 / §7).
 *
 * Every `map` entry's `stableKey` must exist in `versionQuestions` with a
 * matching `type`; SLIDER_LIKERT additionally requires the version question to
 * carry a `scale`. Missing key, type mismatch, or a slider without a scale →
 * `ok:false` + a human-readable problem string naming the offending stableKey.
 */
export function validateCrosswalkAgainstVersion(
  crosswalk: Crosswalk,
  versionQuestions: VersionQuestion[],
): { ok: boolean; problems: string[] } {
  const byStableKey = new Map(versionQuestions.map((q) => [q.stableKey, q]));

  const problems: string[] = [];
  for (const entry of crosswalk.map) {
    const vq = byStableKey.get(entry.stableKey);
    if (!vq) {
      problems.push(
        `crosswalk stableKey "${entry.stableKey}" (Esperto ${entry.espertoKey}) is missing from the pinned version`,
      );
      continue;
    }
    if (vq.type !== entry.ourType) {
      problems.push(
        `crosswalk stableKey "${entry.stableKey}" expects type ${entry.ourType} but the pinned version has type ${vq.type}`,
      );
      continue;
    }
    if (entry.ourType === "SLIDER_LIKERT" && !vq.scale) {
      problems.push(
        `crosswalk stableKey "${entry.stableKey}" is SLIDER_LIKERT but the pinned version question has no scale`,
      );
    }
  }

  return { ok: problems.length === 0, problems };
}
