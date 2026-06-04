/**
 * sections-serialization — pure, framework-free helpers for hydrating the
 * `version.sections` JSON payload into UI-editable `SectionDraft` rows and
 * serializing them back into a version PATCH body.
 *
 * Extracted out of TemplateEditorTabbed (a "use client" component with a heavy
 * dependency graph — @dnd-kit, next/navigation, etc.) so the round-trip can be
 * unit-tested in isolation in jsdom without dragging the whole editor in.
 *
 * CRITICAL — content-hash stability (see lib/assessments/template-content-hash.ts).
 * The seed reseed (ensureTemplateVersionContent) hashes
 *   sha256(JSON.stringify({questions, sections, scoringConfig, reportConfig, ...}))
 * with a FIXED key order and an explicit "do NOT sort/pretty-print" warning.
 * It no-ops when the hash matches and FAILS CLOSED (throws) when an unpublished
 * DRAFT's stored hash differs. Therefore:
 *   - The NOT-dirty path returns the raw stored rows BYTE-FOR-BYTE (same object,
 *     same key order) so a no-change round-trip recomputes the SAME hash.
 *   - The dirty path spreads the RAW stored row FIRST so original key order +
 *     any unknown/future fields survive, and only edited fields are overwritten.
 */

import type { SectionDraft } from "@/components/admin/template-editor/SectionsCard";

export function genUid(): string {
  return `u${Math.random().toString(36).slice(2, 10)}`;
}

/**
 * Hydrate the version.sections JSON payload into UI-editable SectionDraft
 * rows. Tolerant of partial / unknown shapes per the canonical pattern in
 * AssessmentVersionEditor. Reads ALL editable fields (stableKey, name,
 * description, partLabel, domain) so a save can round-trip them.
 */
export function hydrateSectionsFromJson(raw: unknown): SectionDraft[] {
  const arr = Array.isArray(raw) ? raw : [];
  return arr.map((s, idx) => {
    const r = s as {
      stableKey?: unknown;
      name?: unknown;
      description?: unknown;
      partLabel?: unknown;
      domain?: unknown;
    };
    return {
      uid: genUid(),
      stableKey:
        typeof r.stableKey === "string" && r.stableKey.length > 0
          ? r.stableKey
          : `S${idx + 1}`,
      name: typeof r.name === "string" ? r.name : "",
      description: typeof r.description === "string" ? r.description : undefined,
      partLabel: typeof r.partLabel === "string" ? r.partLabel : undefined,
      domain: typeof r.domain === "string" ? r.domain : undefined,
    };
  });
}

/**
 * Serialize the SectionDraft rows back into a version PATCH `sections` body.
 *
 * - NOT dirty → returns the raw stored rows byte-for-byte (hash-stable).
 * - Dirty → rebuilds each row by spreading the matching raw row FIRST (by
 *   stableKey), then overwriting the editable fields. Optional fields are
 *   only emitted when defined, so an absent field is never injected.
 */
export function buildSectionsPayload(
  sections: SectionDraft[],
  opts: { sectionsDirty: boolean; rawSections: unknown[] },
): unknown {
  if (!opts.sectionsDirty) return opts.rawSections; // byte-for-byte passthrough (hash-stable)

  const rawByStableKey = new Map<string, Record<string, unknown>>();
  for (const r of opts.rawSections) {
    if (r && typeof r === "object") {
      const row = r as Record<string, unknown>;
      if (typeof row.stableKey === "string") rawByStableKey.set(row.stableKey, row);
    }
  }

  return sections.map((s, idx) => {
    const raw = rawByStableKey.get(s.stableKey) ?? {};
    return {
      ...raw, // spread raw FIRST → preserve key order + unknown fields (content-hash stable)
      stableKey: s.stableKey && s.stableKey.length > 0 ? s.stableKey : `S${idx + 1}`,
      name: s.name,
      ...(s.description !== undefined ? { description: s.description } : {}),
      ...(s.partLabel !== undefined ? { partLabel: s.partLabel } : {}),
      ...(s.domain !== undefined ? { domain: s.domain } : {}),
    };
  });
}
