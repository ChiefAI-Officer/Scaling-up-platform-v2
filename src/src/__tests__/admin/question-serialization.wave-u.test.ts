/**
 * Wave U (spec 19u U-4) — findings-rule serialization + the slider band
 * coverage helper.
 *
 * Pins: per-type emission (bands on SLIDER/NUMBER, option rules in OPTION
 * order on MULTI_CHOICE, never on TEXT), half-typed rows dropped, blank
 * texts not emitted, anti-resurrection (also covered in the Wave T suite),
 * not-dirty passthrough untouched, and sliderBandCoverage's advisory states.
 */
import {
  buildQuestionsPayload,
  sliderBandCoverage,
  type QuestionDraftRow,
  type FindingBandDraft,
} from "@/components/admin/template-editor/question-serialization";

function makeDraft(overrides: Partial<QuestionDraftRow> = {}): QuestionDraftRow {
  return {
    uid: "u1",
    stableKey: "S1_q",
    sectionStableKey: "S1_sec",
    label: "Q",
    helpText: "",
    isRequired: true,
    type: "SLIDER_LIKERT",
    sortOrder: 1,
    scaleMin: 0,
    scaleMax: 10,
    scaleStep: 1,
    anchorMin: "Low",
    anchorMax: "High",
    options: [],
    maxChoices: null,
    isInherited: false,
    isNewToDraft: false,
    findingBands: [],
    findingOptionTexts: {},
    ...overrides,
  };
}

function build(drafts: QuestionDraftRow[], rawQuestions: unknown[] = []) {
  return buildQuestionsPayload(drafts, {
    questionsDirty: true,
    rawQuestions,
    publishedKeys: new Set<string>(),
    publishedOptionKeys: {},
  });
}

function rows(payload: unknown): Array<Record<string, unknown>> {
  return payload as Array<Record<string, unknown>>;
}

describe("findings emission — bands (SLIDER / NUMBER)", () => {
  it("emits complete bands on both band types", () => {
    const bands: FindingBandDraft[] = [
      { minScore: 0, maxScore: 4, text: "Low" },
      { minScore: 5, maxScore: 10, text: "High" },
    ];
    const { payload } = build([
      makeDraft({ findingBands: bands }),
      makeDraft({
        uid: "u2",
        stableKey: "S1_n",
        type: "NUMBER",
        findingBands: [{ minScore: 0, maxScore: 9, text: "Tiny" }],
      }),
    ]);
    expect(rows(payload)[0].recommendations).toEqual([
      { minScore: 0, maxScore: 4, text: "Low" },
      { minScore: 5, maxScore: 10, text: "High" },
    ]);
    expect(rows(payload)[1].recommendations).toEqual([
      { minScore: 0, maxScore: 9, text: "Tiny" },
    ]);
  });

  it("drops half-typed rows (null bounds or blank text) without failing the save", () => {
    const { payload } = build([
      makeDraft({
        type: "NUMBER",
        findingBands: [
          { minScore: null, maxScore: 9, text: "no min yet" },
          { minScore: 0, maxScore: null, text: "no max yet" },
          { minScore: 0, maxScore: 9, text: "   " },
          { minScore: 10, maxScore: 20, text: "keep me" },
        ],
      }),
    ]);
    expect(rows(payload)[0].recommendations).toEqual([
      { minScore: 10, maxScore: 20, text: "keep me" },
    ]);
  });

  it("emits NO recommendations key when every row is unusable", () => {
    const { payload } = build([
      makeDraft({
        findingBands: [{ minScore: null, maxScore: null, text: "" }],
      }),
    ]);
    expect("recommendations" in rows(payload)[0]).toBe(false);
  });
});

describe("findings emission — MULTI_CHOICE", () => {
  const mc = (texts: Record<string, string>) =>
    makeDraft({
      type: "MULTI_CHOICE",
      options: [
        { key: "cash", label: "Cash", isNew: false },
        { key: "people", label: "People", isNew: false },
        { key: "market", label: "Market", isNew: false },
      ],
      findingOptionTexts: texts,
    });

  it("emits rules in the question's OPTION order regardless of map insertion order", () => {
    const { payload } = build(
      [mc({ market: "M finding", cash: "C finding" })],
      [
        {
          stableKey: "S1_q",
          type: "MULTI_CHOICE",
          options: [
            { key: "cash", label: "Cash" },
            { key: "people", label: "People" },
            { key: "market", label: "Market" },
          ],
        },
      ],
    );
    expect(rows(payload)[0].recommendations).toEqual([
      { optionKey: "cash", text: "C finding" },
      { optionKey: "market", text: "M finding" },
    ]);
  });

  it("blank texts and stale keys (no matching option) are not emitted", () => {
    const { payload } = build(
      [mc({ cash: "  ", ghost: "dangling", people: "P" })],
      [
        {
          stableKey: "S1_q",
          type: "MULTI_CHOICE",
          options: [
            { key: "cash", label: "Cash" },
            { key: "people", label: "People" },
            { key: "market", label: "Market" },
          ],
        },
      ],
    );
    expect(rows(payload)[0].recommendations).toEqual([
      { optionKey: "people", text: "P" },
    ]);
  });
});

describe("findings emission — TEXT + not-dirty passthrough", () => {
  it("TEXT rows never emit recommendations, even when the raw row carried them", () => {
    const raw = [
      {
        stableKey: "S1_q",
        type: "TEXT",
        label: "Q",
        recommendations: [{ minScore: 0, maxScore: 9, text: "stray" }],
      },
    ];
    const { payload } = build([makeDraft({ type: "TEXT" })], raw);
    expect("recommendations" in rows(payload)[0]).toBe(false);
  });

  it("NOT-dirty saves pass raw rows through by reference (stray rules and all)", () => {
    const raw = [
      { stableKey: "S1_q", type: "TEXT", recommendations: ["anything"] },
    ];
    const { payload } = buildQuestionsPayload([], {
      questionsDirty: false,
      rawQuestions: raw,
      publishedKeys: new Set(),
      publishedOptionKeys: {},
    });
    expect(payload).toBe(raw);
  });
});

describe("sliderBandCoverage (advisory hint — D11)", () => {
  const band = (min: number, max: number): FindingBandDraft => ({
    minScore: min,
    maxScore: max,
    text: "t",
  });

  it("no bands (or only half-typed rows) → complete (rules are opt-in)", () => {
    expect(sliderBandCoverage(0, 10, 1, [])).toEqual({ complete: true });
    expect(
      sliderBandCoverage(0, 10, 1, [{ minScore: null, maxScore: 5, text: "x" }]),
    ).toEqual({ complete: true });
  });

  it("full integer tiling → complete (band count irrelevant)", () => {
    expect(sliderBandCoverage(0, 10, 1, [band(0, 4), band(5, 10)])).toEqual({
      complete: true,
    });
    expect(
      sliderBandCoverage(0, 10, 1, [
        band(0, 2),
        band(3, 4),
        band(5, 6),
        band(7, 9),
        band(10, 10),
      ]),
    ).toEqual({ complete: true });
  });

  it("gap in the middle / missing head / missing tail → named ranges", () => {
    expect(sliderBandCoverage(0, 10, 1, [band(0, 4), band(7, 10)])).toEqual({
      complete: false,
      message: expect.stringContaining("missing 5–6"),
    });
    expect(sliderBandCoverage(0, 10, 1, [band(2, 10)])).toEqual({
      complete: false,
      message: expect.stringContaining("missing 0–1"),
    });
    expect(sliderBandCoverage(0, 10, 1, [band(0, 6)])).toEqual({
      complete: false,
      message: expect.stringContaining("missing 7–10"),
    });
  });

  it("overlap → named overlap point", () => {
    expect(sliderBandCoverage(0, 10, 1, [band(0, 5), band(5, 10)])).toEqual({
      complete: false,
      message: "Bands overlap at 5",
    });
  });

  it("fractional step: contiguity is next.min === prev.max", () => {
    expect(
      sliderBandCoverage(0, 10, 0.5, [band(0, 5), band(5, 10)]),
    ).toEqual({ complete: true });
    expect(
      sliderBandCoverage(0, 10, 0.5, [band(0, 4.5), band(5, 10)]),
    ).toEqual({
      complete: false,
      message: expect.stringContaining("missing"),
    });
  });

  it("max < min inside a band → named", () => {
    expect(sliderBandCoverage(0, 10, 1, [band(5, 2)])).toEqual({
      complete: false,
      message: expect.stringContaining("max < min"),
    });
  });

  it("launch-found regression: a band OUTSIDE the scale is named directly (never an inverted gap range)", () => {
    // The Wave U launch walk authored 0–6 on a 0–3 scale and got
    // "missing 7–3" — inverted garbage. The overshoot must be named.
    expect(sliderBandCoverage(0, 3, 1, [band(0, 6)])).toEqual({
      complete: false,
      message: "Band 0–6 extends outside the 0–3 scale",
    });
    expect(sliderBandCoverage(0, 3, 1, [band(-2, 3)])).toEqual({
      complete: false,
      message: "Band -2–3 extends outside the 0–3 scale",
    });
    // A band ENTIRELY above the scale — pre-fix this produced both a real
    // gap ("missing 0–4") and the inverted range ("missing 7–3").
    expect(sliderBandCoverage(0, 3, 1, [band(5, 6)])).toEqual({
      complete: false,
      message: "Band 5–6 extends outside the 0–3 scale",
    });
    // Fractional step: the check is scale-bound, not integer-only.
    expect(sliderBandCoverage(0, 3, 0.5, [band(0, 3.5)])).toEqual({
      complete: false,
      message: "Band 0–3.5 extends outside the 0–3 scale",
    });
  });
});
