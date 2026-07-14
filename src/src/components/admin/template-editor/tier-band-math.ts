/**
 * tier-band-math — ED5 T16 (B-5 / co-validate C2).
 *
 * The CANONICAL boundary conversion shared by the visual TierBandBar AND the
 * (client-side) tiling validation, so the bar and the validator can never
 * disagree about what a divider position means.
 *
 * A "boundary" is the shared edge between two adjacent tiers on the metric
 * domain. The rule differs by mode (matches the publish-time validator's
 * adjacency rule exactly):
 *   - fractional → upper.minMetric === lower.maxMetric        (touching)
 *   - integer    → upper.minMetric === lower.maxMetric + 1    (no inclusive overlap)
 * Representing the boundary VALUE as the lower tier's `maxMetric` keeps a single
 * source of truth; the upper tier's `minMetric` is derived from it by the rule.
 */

export type TierMode = "integer" | "fractional";

export interface BoundaryTier {
  minMetric: number;
  maxMetric?: number;
}

/** Interior boundary values (length = tiers.length - 1), left-to-right by
 *  ascending minMetric. Each is the lower tier's maxMetric. Tiers whose
 *  maxMetric is undefined (only the last, open-ended, legitimately is) yield no
 *  boundary. */
export function tiersToBoundaries(tiers: readonly BoundaryTier[]): number[] {
  const sorted = [...tiers].sort((a, b) => a.minMetric - b.minMetric);
  const out: number[] = [];
  for (let i = 0; i < sorted.length - 1; i++) {
    const max = sorted[i].maxMetric;
    if (typeof max === "number") out.push(max);
  }
  return out;
}

/** Move the i-th interior boundary (between the i-th and (i+1)-th tiers in
 *  ascending-minMetric order) to `newValue`, applying the mode's adjacency rule.
 *  Returns a NEW array (immutable); preserves every other field on each tier. */
export function boundaryToTiers<T extends BoundaryTier>(
  tiers: readonly T[],
  mode: TierMode,
  boundaryIndex: number,
  newValue: number,
): T[] {
  const order = tiers
    .map((t, i) => ({ t, i }))
    .sort((a, b) => a.t.minMetric - b.t.minMetric);
  const lower = order[boundaryIndex];
  const upper = order[boundaryIndex + 1];
  const next = tiers.map((t) => ({ ...t }));
  if (!lower || !upper) return next; // out-of-range index → no-op copy
  next[lower.i] = { ...next[lower.i], maxMetric: newValue };
  next[upper.i] = {
    ...next[upper.i],
    minMetric: mode === "integer" ? newValue + 1 : newValue,
  };
  return next;
}

/** Clamp a proposed boundary value into `[range.min, range.max]` and snap it to
 *  the mode's grid (integer → whole numbers; fractional → multiples of `step`).
 *  The bar computes `range` from the divider's neighbours + the domain so tiers
 *  never invert or leave a zero-width band. */
export function clampBoundary(
  value: number,
  range: { min: number; max: number },
  mode: TierMode,
  step = 1,
): number {
  let v = Math.max(range.min, Math.min(range.max, value));
  if (mode === "integer") {
    v = Math.round(v);
  } else if (step > 0) {
    v = Math.round(v / step) * step;
  }
  // Re-clamp after snapping so rounding never pushes us back out of range.
  return Math.max(range.min, Math.min(range.max, v));
}
