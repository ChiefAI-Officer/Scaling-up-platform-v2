/**
 * Wave T (spec 19t §T-4) — computePublishedQuestionUnions.
 */
import { computePublishedQuestionUnions } from "@/lib/assessments/published-question-unions";

describe("computePublishedQuestionUnions", () => {
  it("returns empty unions for no published versions", () => {
    const out = computePublishedQuestionUnions([]);
    expect(out.publishedKeys).toEqual([]);
    expect(out.publishedOptionKeys).toEqual({});
  });

  it("unions stableKeys across multiple published versions", () => {
    const v1 = [
      { stableKey: "P1_a", type: "TEXT" },
      { stableKey: "P1_b", type: "NUMBER" },
    ];
    const v2 = [
      { stableKey: "P1_a", type: "TEXT" },
      { stableKey: "P2_c", type: "SLIDER_LIKERT" },
    ];
    const out = computePublishedQuestionUnions([v1, v2]);
    expect(new Set(out.publishedKeys)).toEqual(
      new Set(["P1_a", "P1_b", "P2_c"]),
    );
  });

  it("unions option keys per question across versions", () => {
    const v1 = [
      {
        stableKey: "S4_gate",
        type: "MULTI_CHOICE",
        options: [
          { key: "cash", label: "Cash" },
          { key: "sales", label: "Sales" },
        ],
      },
    ];
    const v2 = [
      {
        stableKey: "S4_gate",
        type: "MULTI_CHOICE",
        options: [
          { key: "cash", label: "Cash (reworded)" },
          { key: "strategy", label: "Strategy" },
        ],
      },
    ];
    const out = computePublishedQuestionUnions([v1, v2]);
    expect(new Set(out.publishedOptionKeys.S4_gate)).toEqual(
      new Set(["cash", "sales", "strategy"]),
    );
  });

  it("skips malformed payloads, rows, and options defensively", () => {
    const out = computePublishedQuestionUnions([
      null,
      "junk",
      42,
      [
        null,
        "row",
        { noStableKey: true },
        { stableKey: "" },
        { stableKey: "ok_row", options: "not-an-array" },
        {
          stableKey: "ok_mc",
          options: [null, "x", { key: 7 }, { key: "" }, { key: "real" }],
        },
      ],
    ]);
    expect(new Set(out.publishedKeys)).toEqual(new Set(["ok_row", "ok_mc"]));
    expect(out.publishedOptionKeys).toEqual({ ok_mc: ["real"] });
  });

  it("does not emit option entries for questions without valid option keys", () => {
    const out = computePublishedQuestionUnions([
      [{ stableKey: "q1", options: [] }],
    ]);
    expect(out.publishedOptionKeys).toEqual({});
  });
});
