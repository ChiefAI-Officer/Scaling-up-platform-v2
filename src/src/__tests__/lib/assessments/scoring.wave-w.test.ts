/**
 * Wave W (spec 19w) — showIf schema shape + checkShowIfIntegrity publish gate.
 *
 * Contract under test:
 *  - `showIf: { questionKey, optionKey }` is an optional, shape-validated
 *    field on ALL FOUR question types (save-tier: shape only; drafts may be
 *    referentially dangling — publish is the wall).
 *  - TemplateVersionForPublishSchema rejects, with issues routed under
 *    ["questions", i, "showIf"], any published showIf whose:
 *      1. questionKey doesn't resolve to a question in the version;
 *      2. gate is not MULTI_CHOICE;
 *      3. gate is not STRICTLY EARLIER in canonical survey render order
 *         (buildSectionPages order — C1);
 *      4. optionKey is not one of the gate's option keys;
 *      5. gate itself carries a showIf (no chaining);
 *      6. carrier question is isRequired (D4).
 *  - Versions without showIf publish exactly as before (vacuous pass).
 */
import {
  QuestionSchema,
  TemplateVersionForPublishSchema,
} from "@/lib/assessments/scoring";
import { canonicalQuestionOrderIndex } from "@/lib/assessments/section-pages";

// ── Fixtures ─────────────────────────────────────────────────────────────

const section = (stableKey: string, sortOrder: number) => ({
  stableKey,
  sortOrder,
  name: stableKey,
});

const slider = (
  stableKey: string,
  sortOrder: number,
  overrides: Record<string, unknown> = {},
) => ({
  stableKey,
  sortOrder,
  type: "SLIDER_LIKERT" as const,
  label: stableKey,
  sectionStableKey: "S1",
  isRequired: true,
  scale: { min: 0, max: 3, step: 1, anchorMin: "low", anchorMax: "high" },
  ...overrides,
});

const mc = (
  stableKey: string,
  sortOrder: number,
  overrides: Record<string, unknown> = {},
) => ({
  stableKey,
  sortOrder,
  type: "MULTI_CHOICE" as const,
  label: stableKey,
  sectionStableKey: "S1",
  isRequired: false,
  options: [
    { key: "sales", label: "Sales" },
    { key: "cash", label: "Cash" },
  ],
  ...overrides,
});

const text = (
  stableKey: string,
  sortOrder: number,
  overrides: Record<string, unknown> = {},
) => ({
  stableKey,
  sortOrder,
  type: "TEXT" as const,
  label: stableKey,
  sectionStableKey: "S1",
  isRequired: false,
  ...overrides,
});

const scoringConfig = {
  tierMetric: "overallAvg" as const,
  passThreshold: 0,
  tiers: [{ minMetric: 0, maxMetric: 3, label: "Tier", message: "m" }],
};

/** Minimal publishable version: one slider (keeps tier tiling valid). */
function version(questions: unknown[], sections: unknown[] = [section("S1", 1)]) {
  return {
    questions: [slider("Q_SLIDER", 0), ...questions],
    sections,
    scoringConfig,
  };
}

function publishIssues(v: unknown) {
  const parsed = TemplateVersionForPublishSchema.safeParse(v);
  return parsed.success ? [] : parsed.error.issues;
}

function showIfIssues(v: unknown) {
  return publishIssues(v).filter(
    (i) => i.path[0] === "questions" && i.path.includes("showIf"),
  );
}

// ── Save-tier shape validation ───────────────────────────────────────────

describe("showIf schema shape (save tier)", () => {
  it.each([
    ["TEXT", text("Q_T", 1)],
    ["NUMBER", { ...text("Q_N", 1), type: "NUMBER" as const }],
    ["MULTI_CHOICE", mc("Q_M", 1)],
    ["SLIDER_LIKERT", { ...slider("Q_S", 1), isRequired: false }],
  ])("accepts a valid showIf on %s", (_type, base) => {
    const parsed = QuestionSchema.safeParse({
      ...base,
      showIf: { questionKey: "Q_GATE", optionKey: "sales" },
    });
    expect(parsed.success).toBe(true);
  });

  it("accepts a question without showIf (every existing version valid unchanged)", () => {
    expect(QuestionSchema.safeParse(text("Q_T", 1)).success).toBe(true);
  });

  it.each([
    ["missing optionKey", { questionKey: "Q_GATE" }],
    ["missing questionKey", { optionKey: "sales" }],
    ["empty questionKey", { questionKey: "", optionKey: "sales" }],
    ["empty optionKey", { questionKey: "Q_GATE", optionKey: "" }],
    ["non-string values", { questionKey: 3, optionKey: "sales" }],
    ["non-object", "Q_GATE:sales"],
  ])("rejects a malformed showIf (%s)", (_name, showIf) => {
    const parsed = QuestionSchema.safeParse({ ...text("Q_T", 1), showIf });
    expect(parsed.success).toBe(false);
  });

  it("does NOT check references at save (drafts may dangle — publish is the wall)", () => {
    const parsed = QuestionSchema.safeParse({
      ...text("Q_T", 1),
      showIf: { questionKey: "NOPE_NOT_A_QUESTION", optionKey: "nope" },
    });
    expect(parsed.success).toBe(true);
  });
});

// ── Canonical order helper (C1) ──────────────────────────────────────────

describe("canonicalQuestionOrderIndex", () => {
  it("matches buildSectionPages order: sections by sortOrder, questions by sortOrder within", () => {
    const sections = [section("S2", 2), section("S1", 1)];
    const questions = [
      { stableKey: "B", sortOrder: 2, sectionStableKey: "S1" },
      { stableKey: "D", sortOrder: 2, sectionStableKey: "S2" },
      { stableKey: "A", sortOrder: 1, sectionStableKey: "S1" },
      { stableKey: "C", sortOrder: 1, sectionStableKey: "S2" },
    ];
    const idx = canonicalQuestionOrderIndex(sections, questions);
    expect([...idx.entries()].sort((a, b) => a[1] - b[1]).map(([k]) => k)).toEqual([
      "A",
      "B",
      "C",
      "D",
    ]);
  });

  it("puts orphan questions (blank/unknown section) LAST — the trailing Other page", () => {
    const sections = [section("S1", 1)];
    const questions = [
      { stableKey: "ORPHAN", sortOrder: 0, sectionStableKey: "NOPE" },
      { stableKey: "A", sortOrder: 5, sectionStableKey: "S1" },
    ];
    const idx = canonicalQuestionOrderIndex(sections, questions);
    expect(idx.get("A")).toBeLessThan(idx.get("ORPHAN")!);
  });

  it("cross-section: a question with LOWER raw sortOrder in a LATER section is still later", () => {
    // Raw sortOrder alone would order GATE_LATE (1) before DEP_EARLY (9) — the
    // canonical order must not.
    const sections = [section("S1", 1), section("S2", 2)];
    const questions = [
      { stableKey: "DEP_EARLY", sortOrder: 9, sectionStableKey: "S1" },
      { stableKey: "GATE_LATE", sortOrder: 1, sectionStableKey: "S2" },
    ];
    const idx = canonicalQuestionOrderIndex(sections, questions);
    expect(idx.get("DEP_EARLY")).toBeLessThan(idx.get("GATE_LATE")!);
  });
});

// ── Publish gate (checkShowIfIntegrity) ──────────────────────────────────

describe("checkShowIfIntegrity (publish tier)", () => {
  const gate = () => mc("Q_GATE", 1);
  const dep = (overrides: Record<string, unknown> = {}) =>
    text("Q_DEP", 2, {
      showIf: { questionKey: "Q_GATE", optionKey: "sales" },
      ...overrides,
    });

  it("passes a valid showIf (gate earlier, MULTI_CHOICE, real option, optional carrier)", () => {
    expect(showIfIssues(version([gate(), dep()]))).toHaveLength(0);
  });

  it("passes a version with no showIf at all (vacuous — existing versions unchanged)", () => {
    expect(showIfIssues(version([gate(), text("Q_T", 2)]))).toHaveLength(0);
  });

  it("rejects an unresolvable questionKey", () => {
    const issues = showIfIssues(
      version([gate(), dep({ showIf: { questionKey: "Q_MISSING", optionKey: "sales" } })]),
    );
    expect(issues.length).toBeGreaterThan(0);
    expect(issues[0].message).toContain("Q_MISSING");
  });

  it("rejects a non-MULTI_CHOICE gate", () => {
    const issues = showIfIssues(
      version([
        text("Q_TEXTGATE", 1),
        dep({ showIf: { questionKey: "Q_TEXTGATE", optionKey: "sales" } }),
      ]),
    );
    expect(issues.length).toBeGreaterThan(0);
    expect(issues[0].message).toContain("MULTI_CHOICE");
  });

  it("rejects a gate that is NOT strictly earlier (later in canonical order)", () => {
    const issues = showIfIssues(version([dep(), mc("Q_GATE", 3)]));
    expect(issues.length).toBeGreaterThan(0);
    expect(issues[0].message.toLowerCase()).toContain("earlier");
  });

  it("rejects a self-reference", () => {
    const issues = showIfIssues(
      version([mc("Q_SELF", 1, { showIf: { questionKey: "Q_SELF", optionKey: "sales" } })]),
    );
    expect(issues.length).toBeGreaterThan(0);
  });

  it("cross-section earlier gate PASSES; raw-sortOrder-earlier-but-later-section gate REJECTS (C1)", () => {
    const sections = [section("S1", 1), section("S2", 2)];
    // Gate in S1 (earlier section), dependent in S2 — the LVA S4→S5 shape.
    const ok = version(
      [
        mc("Q_GATE", 9, { sectionStableKey: "S1" }),
        text("Q_DEP", 1, {
          sectionStableKey: "S2",
          showIf: { questionKey: "Q_GATE", optionKey: "sales" },
        }),
      ],
      sections,
    );
    expect(showIfIssues(ok)).toHaveLength(0);

    // Gate in S2 with a SMALLER raw sortOrder than the dependent in S1 — raw
    // sortOrder says "earlier", canonical order says "later". Must reject.
    const bad = version(
      [
        mc("Q_GATE", 1, { sectionStableKey: "S2" }),
        text("Q_DEP", 9, {
          sectionStableKey: "S1",
          showIf: { questionKey: "Q_GATE", optionKey: "sales" },
        }),
      ],
      sections,
    );
    expect(showIfIssues(bad).length).toBeGreaterThan(0);
  });

  it("rejects an optionKey that is not one of the gate's options", () => {
    const issues = showIfIssues(
      version([gate(), dep({ showIf: { questionKey: "Q_GATE", optionKey: "nope" } })]),
    );
    expect(issues.length).toBeGreaterThan(0);
    expect(issues[0].message).toContain("nope");
  });

  it("rejects a chained gate (the gate itself carries showIf)", () => {
    const issues = showIfIssues(
      version([
        mc("Q_ROOT", 1),
        mc("Q_GATE", 2, { showIf: { questionKey: "Q_ROOT", optionKey: "sales" } }),
        text("Q_DEP", 3, { showIf: { questionKey: "Q_GATE", optionKey: "sales" } }),
      ]),
    );
    // The chain issue anchors on Q_DEP's showIf (its gate is conditional).
    expect(issues.some((i) => i.message.toLowerCase().includes("conditional"))).toBe(true);
  });

  it("rejects required + showIf (D4 — conditional questions are always optional)", () => {
    const issues = showIfIssues(version([gate(), dep({ isRequired: true })]));
    expect(issues.length).toBeGreaterThan(0);
    expect(issues[0].message.toLowerCase()).toContain("required");
  });

  it("routes issues under the offending question index", () => {
    const v = version([gate(), dep({ showIf: { questionKey: "Q_MISSING", optionKey: "x" } })]);
    const issues = showIfIssues(v);
    // questions[0] = Q_SLIDER (fixture), [1] = Q_GATE, [2] = Q_DEP.
    expect(issues[0].path.slice(0, 3)).toEqual(["questions", 2, "showIf"]);
  });

  it("collects ALL showIf issues in one pass (multi-question fix in one round trip)", () => {
    const v = version([
      gate(),
      text("Q_D1", 2, { showIf: { questionKey: "Q_MISSING", optionKey: "x" } }),
      text("Q_D2", 3, { showIf: { questionKey: "Q_GATE", optionKey: "nope" } }),
    ]);
    expect(showIfIssues(v).length).toBeGreaterThanOrEqual(2);
  });
});
