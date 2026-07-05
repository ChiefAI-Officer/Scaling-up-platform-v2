/**
 * Wave T (spec 19t §T-4) — published-version question unions.
 *
 * Pure helper the version-editor page uses to compute, across ALL published
 * versions of a template, (a) the union of question stableKeys and (b) the
 * per-question union of MULTI_CHOICE option keys. These drive the editor's
 * inherited-locks (key/type/option-key), the D8 union-scoped slug uniqueness,
 * and the D4/D9 impact warnings.
 *
 * Defensive JSON-guarding mirrors the route's posture: non-array payloads,
 * non-object rows, and rows without a string stableKey are skipped silently
 * (historical pinned versions may carry odd shapes).
 */

export interface PublishedQuestionUnions {
  /** Union of question stableKeys across every published version. */
  publishedKeys: string[];
  /** Per-question union of option keys (MULTI_CHOICE rows only). */
  publishedOptionKeys: Record<string, string[]>;
}

/**
 * @param publishedQuestionPayloads — one entry per PUBLISHED version: that
 * version's raw `questions` JSON value.
 */
export function computePublishedQuestionUnions(
  publishedQuestionPayloads: unknown[],
): PublishedQuestionUnions {
  const keys = new Set<string>();
  const optionKeys = new Map<string, Set<string>>();

  for (const payload of publishedQuestionPayloads) {
    if (!Array.isArray(payload)) continue;
    for (const row of payload) {
      if (!row || typeof row !== "object") continue;
      const r = row as Record<string, unknown>;
      if (typeof r.stableKey !== "string" || r.stableKey.length === 0) continue;
      keys.add(r.stableKey);

      if (Array.isArray(r.options)) {
        const set = optionKeys.get(r.stableKey) ?? new Set<string>();
        for (const opt of r.options) {
          if (opt && typeof opt === "object") {
            const k = (opt as Record<string, unknown>).key;
            if (typeof k === "string" && k.length > 0) set.add(k);
          }
        }
        if (set.size > 0) optionKeys.set(r.stableKey, set);
      }
    }
  }

  const publishedOptionKeys: Record<string, string[]> = {};
  for (const [k, set] of optionKeys) {
    publishedOptionKeys[k] = Array.from(set);
  }
  return { publishedKeys: Array.from(keys), publishedOptionKeys };
}
