// src/src/lib/assessments/section-pages.ts
export interface PagerSection { stableKey: string; sortOrder: number; name: string; description?: string; partLabel?: string; domain?: string; }
export interface PagerQuestion {
  stableKey: string; sortOrder: number; sectionStableKey?: string; type: string; label: string; isRequired: boolean;
  helpText?: string;
  scale?: { min: number; max: number; step: number; anchorMin: string; anchorMax: string };
  options?: { key: string; label: string }[];
  maxChoices?: number;
}
export interface SectionPage {
  stableKey: string; name: string; description?: string; partLabel?: string; domain?: string;
  isOther: boolean; questions: PagerQuestion[];
}
export const OTHER_PAGE_KEY = "__other__";

/** A question's section key "resolves" when it is a non-blank string matching a defined section. */
function resolvedSectionKey(q: PagerQuestion, known: Set<string>): string | null {
  const k = typeof q.sectionStableKey === "string" ? q.sectionStableKey.trim() : "";
  return k.length > 0 && known.has(k) ? k : null;
}

export function buildSectionPages(sections: PagerSection[], questions: PagerQuestion[]): SectionPage[] {
  const known = new Set(sections.map((s) => s.stableKey));
  const byKey = new Map<string, PagerQuestion[]>();
  const orphans: PagerQuestion[] = [];
  for (const q of [...questions].sort((a, b) => a.sortOrder - b.sortOrder)) {
    const k = resolvedSectionKey(q, known);
    if (k === null) { orphans.push(q); continue; }
    const arr = byKey.get(k) ?? [];
    arr.push(q);
    byKey.set(k, arr);
  }
  const pages: SectionPage[] = [...sections]
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .map((s) => ({
      stableKey: s.stableKey, name: s.name, description: s.description, partLabel: s.partLabel, domain: s.domain,
      isOther: false, questions: byKey.get(s.stableKey) ?? [],
    }));
  if (orphans.length > 0) {
    pages.push({ stableKey: OTHER_PAGE_KEY, name: "Other", isOther: true, questions: orphans });
  }
  return pages;
}

export function isAnswered(value: number | string | string[] | null | undefined): boolean {
  if (value === undefined || value === null) return false;
  if (typeof value === "string") return value.trim() !== "";
  if (Array.isArray(value)) return value.length > 0;
  return true; // number — incl 0
}
