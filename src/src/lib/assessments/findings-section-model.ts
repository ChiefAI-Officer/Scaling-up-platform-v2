/**
 * Wave U (spec 19u U-5) — the pure model layer for rendering the frozen
 * `result.findings` snapshot (ADR-0021).
 *
 * Two pieces:
 *  - `parseResolvedFindings` — total-tolerant parser for the raw snapshot
 *    value read off a submission's frozen `result` JSON (absent/malformed →
 *    []; reports must never 500 on bad frozen data — house rule since the
 *    Wave N hotfix).
 *  - `buildFindingsSection` — groups parsed findings by survey section for
 *    the qualitative report's consolidated findings block (scored-parity
 *    copy). Groups follow the VERSION's section order; findings whose
 *    section is unknown/absent trail in an unnamed group. Deliberately
 *    suppression-agnostic (D21): REPORT_FILTERS suppression is presentation
 *    of raw answers, an authored finding is explicit intent.
 */

export interface ResolvedFinding {
  stableKey: string;
  questionType: string;
  sectionStableKey?: string;
  questionLabel: string;
  text: string;
}

export interface FindingsGroup {
  /** Resolved section name; null for the trailing unnamed (orphan) group. */
  sectionName: string | null;
  items: Array<{ stableKey: string; text: string }>;
}

export interface FindingsSection {
  eyebrow: string;
  title: string;
  groups: FindingsGroup[];
}

/** Scored-report parity copy (BrandedReport's "What to work on next" block). */
export const FINDINGS_EYEBROW = "What to work on next";
export const FINDINGS_TITLE = "Your recommendations";

/**
 * Parse the raw `result.findings` value. Entry-level tolerance: keep only
 * entries with a usable stableKey + questionType + non-blank text;
 * questionLabel falls back to the stableKey; non-string sectionStableKey is
 * dropped. Never throws.
 */
export function parseResolvedFindings(raw: unknown): ResolvedFinding[] {
  if (!Array.isArray(raw)) return [];
  const out: ResolvedFinding[] = [];
  for (const entry of raw) {
    if (!entry || typeof entry !== "object") continue;
    const e = entry as Record<string, unknown>;
    if (typeof e.stableKey !== "string" || e.stableKey === "") continue;
    if (typeof e.questionType !== "string" || e.questionType === "") continue;
    if (typeof e.text !== "string" || e.text.trim() === "") continue;
    out.push({
      stableKey: e.stableKey,
      questionType: e.questionType,
      sectionStableKey:
        typeof e.sectionStableKey === "string" && e.sectionStableKey !== ""
          ? e.sectionStableKey
          : undefined,
      questionLabel:
        typeof e.questionLabel === "string" && e.questionLabel !== ""
          ? e.questionLabel
          : e.stableKey,
      text: e.text,
    });
  }
  return out;
}

interface SectionEntry {
  stableKey: string;
  name: string;
}

function parseSections(raw: unknown): SectionEntry[] {
  if (!Array.isArray(raw)) return [];
  const out: SectionEntry[] = [];
  for (const entry of raw) {
    if (!entry || typeof entry !== "object") continue;
    const s = entry as Record<string, unknown>;
    if (typeof s.stableKey !== "string" || s.stableKey === "") continue;
    out.push({
      stableKey: s.stableKey,
      name: typeof s.name === "string" && s.name !== "" ? s.name : s.stableKey,
    });
  }
  return out;
}

/**
 * Build the consolidated findings section, or null when nothing fired.
 * Group order follows the version's section order; within a group, finding
 * order is preserved (the snapshot is already question-sortOrder ordered).
 */
export function buildFindingsSection(
  findings: ResolvedFinding[],
  sectionsRaw: unknown
): FindingsSection | null {
  if (!findings || findings.length === 0) return null;

  const sections = parseSections(sectionsRaw);
  const nameByKey = new Map(sections.map((s) => [s.stableKey, s.name]));

  const byKnownSection = new Map<string, FindingsGroup>();
  const orphans: FindingsGroup = { sectionName: null, items: [] };

  for (const f of findings) {
    const item = { stableKey: f.stableKey, text: f.text };
    const name = f.sectionStableKey ? nameByKey.get(f.sectionStableKey) : undefined;
    if (f.sectionStableKey && name !== undefined) {
      let group = byKnownSection.get(f.sectionStableKey);
      if (!group) {
        group = { sectionName: name, items: [] };
        byKnownSection.set(f.sectionStableKey, group);
      }
      group.items.push(item);
    } else {
      orphans.items.push(item);
    }
  }

  // Version-section order first, orphans trail.
  const groups: FindingsGroup[] = [];
  for (const s of sections) {
    const group = byKnownSection.get(s.stableKey);
    if (group) groups.push(group);
  }
  if (orphans.items.length > 0) groups.push(orphans);

  return { eyebrow: FINDINGS_EYEBROW, title: FINDINGS_TITLE, groups };
}
