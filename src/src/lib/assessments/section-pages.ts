// src/src/lib/assessments/section-pages.ts
export interface PagerSection { stableKey: string; sortOrder: number; name: string; description?: string; partLabel?: string; domain?: string; }
export interface PagerQuestion {
  stableKey: string; sortOrder: number; sectionStableKey?: string; type: string; label: string; isRequired: boolean;
  helpText?: string;
  scale?: { min: number; max: number; step: number; anchorMin: string; anchorMax: string };
  options?: { key: string; label: string }[];
  maxChoices?: number;
  /** Wave W — authored show-if: visible only while `optionKey` is selected on the (earlier, MULTI_CHOICE) gate question. */
  showIf?: { questionKey: string; optionKey: string };
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

/**
 * Wave W (C1) — THE canonical survey render order: sections by sortOrder, then
 * questions by sortOrder within each section, orphans last (exactly
 * buildSectionPages' order — derived FROM it so the two can never drift).
 * Shared by the editor's gate dropdown, the publish-time strictly-earlier
 * check, and the tests. Raw question sortOrder alone is NOT globally unique
 * across sections and must never be used for cross-section comparisons.
 */
export function canonicalQuestionOrderIndex(
  sections: Array<Pick<PagerSection, "stableKey" | "sortOrder">>,
  questions: Array<Pick<PagerQuestion, "stableKey" | "sortOrder" | "sectionStableKey">>,
): Map<string, number> {
  const pages = buildSectionPages(
    sections.map((s) => ({ ...s, name: "" })),
    questions.map((q) => ({ ...q, type: "TEXT", label: "", isRequired: false })),
  );
  const index = new Map<string, number>();
  let i = 0;
  for (const page of pages) {
    for (const q of page.questions) index.set(q.stableKey, i++);
  }
  return index;
}

/**
 * Wave W (D7) — suppress conditionally-emptied pages: a section page is
 * dropped when the VERSION has ≥1 question in that section, EVERY one of
 * them carries an authored `showIf`, and the filtered (visible) list has 0.
 * The all-showIf requirement attributes the emptying to authored rules by
 * construction: a section emptied by a hardcoded filter (the LVA alias
 * branch, or any future one) keeps its pre-Wave-W rendering, so D3's
 * "LVA byte-identical" holds structurally, not by luck. Authored-empty
 * sections (zero questions in the version — true intro pages like LVA
 * "Welcome") always render. The Other page never needs this:
 * buildSectionPages only appends it when visible orphans exist.
 */
export function filterConditionallyEmptiedPages(
  pages: SectionPage[],
  allQuestions: Array<Pick<PagerQuestion, "sectionStableKey" | "showIf">>,
): SectionPage[] {
  const authored = new Map<string, { any: boolean; allShowIf: boolean }>();
  for (const q of allQuestions) {
    const k = typeof q.sectionStableKey === "string" ? q.sectionStableKey.trim() : "";
    if (k.length === 0) continue;
    const entry = authored.get(k) ?? { any: false, allShowIf: true };
    entry.any = true;
    if (!q.showIf) entry.allShowIf = false;
    authored.set(k, entry);
  }
  const next = pages.filter((p) => {
    if (p.isOther || p.questions.length > 0) return true;
    const entry = authored.get(p.stableKey);
    return !(entry?.any && entry.allShowIf);
  });
  return next.length === pages.length ? pages : next;
}

export function isAnswered(value: number | string | string[] | null | undefined): boolean {
  if (value === undefined || value === null) return false;
  if (typeof value === "string") return value.trim() !== "";
  if (Array.isArray(value)) return value.length > 0;
  return true; // number — incl 0
}
