/**
 * Wave U (spec 19u U-3, ADR-0021) — resolveFindings, the pure findings
 * resolver frozen into `result.findings` at scoring time.
 *
 * Pins: band hit/miss/boundary (min/max INCLUSIVE), NUMBER gaps, MC
 * multi-fire in AUTHORED OPTION order (not selection order), TEXT never
 * fires, total tolerance (malformed anything → skipped, never throws),
 * output ordering by question sortOrder, determinism.
 */
import { resolveFindings } from "@/lib/assessments/findings";

const sliderQ = {
  stableKey: "S1_vision",
  sortOrder: 2,
  type: "SLIDER_LIKERT",
  label: "Vision alignment",
  sectionStableKey: "S1",
  isRequired: true,
  scale: { min: 0, max: 10, step: 1, anchorMin: "Low", anchorMax: "High" },
  recommendations: [
    { minScore: 0, maxScore: 4, text: "Low band" },
    { minScore: 5, maxScore: 10, text: "High band" },
  ],
};

const numberQ = {
  stableKey: "S1_headcount",
  sortOrder: 1,
  type: "NUMBER",
  label: "Headcount",
  sectionStableKey: "S1",
  isRequired: false,
  recommendations: [
    { minScore: 0, maxScore: 9, text: "Tiny team" },
    { minScore: 50, maxScore: 249, text: "Scale-up sized" }, // gap 10-49
  ],
};

const multiQ = {
  stableKey: "S2_obstacles",
  sortOrder: 3,
  type: "MULTI_CHOICE",
  label: "Biggest obstacles",
  sectionStableKey: "S2",
  isRequired: true,
  options: [
    { key: "cash", label: "Cash" },
    { key: "people", label: "People" },
    { key: "market", label: "Market" },
  ],
  maxChoices: 3,
  recommendations: [
    { optionKey: "people", text: "People finding" },
    { optionKey: "cash", text: "Cash finding" },
    // no rule for "market"
  ],
};

const textQ = {
  stableKey: "S2_notes",
  sortOrder: 0,
  type: "TEXT",
  label: "Notes",
  isRequired: false,
  // Stray rules on TEXT (a publish-tier error) must never fire.
  recommendations: [{ minScore: 0, maxScore: 99, text: "never" }],
};

const QUESTIONS = [sliderQ, numberQ, multiQ, textQ];

function answers(entries: Record<string, unknown>): Map<string, unknown> {
  return new Map(Object.entries(entries));
}

describe("resolveFindings — bands (SLIDER + NUMBER)", () => {
  it("fires the band containing the value; boundaries are INCLUSIVE both ends", () => {
    for (const [value, text] of [
      [0, "Low band"],
      [4, "Low band"],
      [5, "High band"],
      [10, "High band"],
    ] as const) {
      const fired = resolveFindings(QUESTIONS, answers({ S1_vision: value }));
      expect(fired).toEqual([
        {
          stableKey: "S1_vision",
          questionType: "SLIDER_LIKERT",
          sectionStableKey: "S1",
          questionLabel: "Vision alignment",
          text,
        },
      ]);
    }
  });

  it("NUMBER: value in a gap fires nothing (gaps are legal — D4)", () => {
    expect(resolveFindings(QUESTIONS, answers({ S1_headcount: 25 }))).toEqual([]);
  });

  it("NUMBER: band hit fires with questionType NUMBER", () => {
    const fired = resolveFindings(QUESTIONS, answers({ S1_headcount: 100 }));
    expect(fired).toEqual([
      {
        stableKey: "S1_headcount",
        questionType: "NUMBER",
        sectionStableKey: "S1",
        questionLabel: "Headcount",
        text: "Scale-up sized",
      },
    ]);
  });

  it("non-numeric / absent / null answers fire nothing", () => {
    for (const v of ["7", [7], {}, null, undefined, NaN, Infinity]) {
      expect(resolveFindings(QUESTIONS, answers({ S1_vision: v }))).toEqual([]);
    }
    expect(resolveFindings(QUESTIONS, new Map())).toEqual([]);
  });

  it("on (malformed) overlapping bands, the FIRST matching band wins deterministically", () => {
    const q = {
      ...numberQ,
      recommendations: [
        { minScore: 0, maxScore: 100, text: "first" },
        { minScore: 50, maxScore: 60, text: "second" },
      ],
    };
    expect(resolveFindings([q], answers({ S1_headcount: 55 }))[0].text).toBe("first");
  });
});

describe("resolveFindings — MULTI_CHOICE", () => {
  it("fires one finding per SELECTED option that has a rule", () => {
    const fired = resolveFindings(QUESTIONS, answers({ S2_obstacles: ["cash"] }));
    expect(fired).toEqual([
      {
        stableKey: "S2_obstacles",
        questionType: "MULTI_CHOICE",
        sectionStableKey: "S2",
        questionLabel: "Biggest obstacles",
        text: "Cash finding",
      },
    ]);
  });

  it("multi-fire follows AUTHORED OPTION order, not selection order", () => {
    // Selection lists people BEFORE cash; options order is cash, people.
    const fired = resolveFindings(
      QUESTIONS,
      answers({ S2_obstacles: ["people", "cash"] })
    );
    expect(fired.map((f) => f.text)).toEqual(["Cash finding", "People finding"]);
  });

  it("selected options without a rule fire nothing", () => {
    expect(
      resolveFindings(QUESTIONS, answers({ S2_obstacles: ["market"] }))
    ).toEqual([]);
  });

  it("non-array / empty / non-string-entry answers fire nothing", () => {
    for (const v of ["cash", 7, {}, [], [1, 2], null]) {
      expect(resolveFindings(QUESTIONS, answers({ S2_obstacles: v }))).toEqual([]);
    }
  });

  it("unknown selected keys are ignored", () => {
    expect(
      resolveFindings(QUESTIONS, answers({ S2_obstacles: ["ghost"] }))
    ).toEqual([]);
  });
});

describe("resolveFindings — TEXT + ordering + tolerance", () => {
  it("TEXT never fires, even with stray rules attached", () => {
    expect(
      resolveFindings(QUESTIONS, answers({ S2_notes: "long answer" }))
    ).toEqual([]);
  });

  it("output is ordered by question sortOrder across types", () => {
    const fired = resolveFindings(
      QUESTIONS,
      answers({
        S1_vision: 7, // sortOrder 2
        S1_headcount: 5, // sortOrder 1
        S2_obstacles: ["cash"], // sortOrder 3
      })
    );
    expect(fired.map((f) => f.stableKey)).toEqual([
      "S1_headcount",
      "S1_vision",
      "S2_obstacles",
    ]);
  });

  it("is deterministic (same inputs → deep-equal output)", () => {
    const input = answers({ S1_vision: 3, S2_obstacles: ["cash", "people"] });
    expect(resolveFindings(QUESTIONS, input)).toEqual(
      resolveFindings(QUESTIONS, input)
    );
  });

  it("never throws on garbage questions", () => {
    for (const qs of [null, undefined, "x", 42, {}, [null, "y", 7, {}]]) {
      expect(resolveFindings(qs, answers({ a: 1 }))).toEqual([]);
    }
  });

  it("skips malformed rules but keeps good ones on the same question", () => {
    const q = {
      ...numberQ,
      recommendations: [
        null,
        "junk",
        { minScore: "0", maxScore: 9, text: "bad types" },
        { minScore: 0, maxScore: 9, text: "" }, // blank text
        { minScore: 0, maxScore: 9, text: "good" },
      ],
    };
    expect(resolveFindings([q], answers({ S1_headcount: 5 }))).toEqual([
      expect.objectContaining({ text: "good" }),
    ]);
  });

  it("questionLabel falls back to stableKey; missing sortOrder falls back to array index", () => {
    const q = {
      stableKey: "q_bare",
      type: "NUMBER",
      isRequired: false,
      recommendations: [{ minScore: 0, maxScore: 9, text: "t" }],
    };
    const fired = resolveFindings([q], answers({ q_bare: 1 }));
    expect(fired).toEqual([
      {
        stableKey: "q_bare",
        questionType: "NUMBER",
        sectionStableKey: undefined,
        questionLabel: "q_bare",
        text: "t",
      },
    ]);
  });
});
