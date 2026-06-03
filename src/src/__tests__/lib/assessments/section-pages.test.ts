// src/src/__tests__/lib/assessments/section-pages.test.ts
import {
  buildSectionPages,
  isAnswered,
  OTHER_PAGE_KEY,
  type PagerSection,
  type PagerQuestion,
} from "@/lib/assessments/section-pages";

const sec = (stableKey: string, sortOrder: number, extra: Partial<PagerSection> = {}): PagerSection => ({
  stableKey, sortOrder, name: stableKey, ...extra,
});
const q = (stableKey: string, sortOrder: number, sectionStableKey: string | undefined): PagerQuestion => ({
  stableKey, sortOrder, sectionStableKey, type: "SLIDER_LIKERT", label: stableKey, isRequired: true,
});

describe("buildSectionPages", () => {
  it("groups questions under their section, sorted by section then question sortOrder", () => {
    const pages = buildSectionPages(
      [sec("S2", 2), sec("S1", 1)],
      [q("S1_b", 2, "S1"), q("S1_a", 1, "S1"), q("S2_a", 1, "S2")],
    );
    expect(pages.map((p) => p.stableKey)).toEqual(["S1", "S2"]);
    expect(pages[0].questions.map((x) => x.stableKey)).toEqual(["S1_a", "S1_b"]);
    expect(pages.every((p) => !p.isOther)).toBe(true);
  });

  it("keeps a section with zero questions (welcome/closing slide)", () => {
    const pages = buildSectionPages([sec("S0", 1, { description: "Welcome" }), sec("S1", 2)], [q("S1_a", 1, "S1")]);
    expect(pages.map((p) => p.stableKey)).toEqual(["S0", "S1"]);
    expect(pages[0].questions).toEqual([]);
    expect(pages[0].description).toBe("Welcome");
  });

  it("routes orphan questions (missing/blank/unresolved key) to a trailing Other page using a trim check, not ??", () => {
    const pages = buildSectionPages(
      [sec("S1", 1)],
      [q("S1_a", 1, "S1"), q("orphan_undef", 2, undefined), q("orphan_blank", 3, "   "), q("orphan_bad", 4, "NOPE")],
    );
    const other = pages.find((p) => p.isOther);
    expect(other?.stableKey).toBe(OTHER_PAGE_KEY);
    expect(other?.questions.map((x) => x.stableKey)).toEqual(["orphan_undef", "orphan_blank", "orphan_bad"]);
    expect(pages[pages.length - 1].isOther).toBe(true); // trailing
  });

  it("emits no Other page when every question resolves", () => {
    const pages = buildSectionPages([sec("S1", 1)], [q("S1_a", 1, "S1")]);
    expect(pages.some((p) => p.isOther)).toBe(false);
  });

  it("handles no sections (all orphan) and no questions", () => {
    expect(buildSectionPages([], []).length).toBe(0);
    const allOrphan = buildSectionPages([], [q("x", 1, undefined)]);
    expect(allOrphan).toHaveLength(1);
    expect(allOrphan[0].isOther).toBe(true);
  });
});

describe("isAnswered", () => {
  it("treats undefined / empty-string / whitespace / empty-array as NOT answered", () => {
    expect(isAnswered(undefined)).toBe(false);
    expect(isAnswered("")).toBe(false);
    expect(isAnswered("   ")).toBe(false);
    expect(isAnswered([])).toBe(false);
  });
  it("treats numeric 0 and any non-empty value as answered", () => {
    expect(isAnswered(0)).toBe(true);
    expect(isAnswered(3)).toBe(true);
    expect(isAnswered("x")).toBe(true);
    expect(isAnswered(["a"])).toBe(true);
  });
});
