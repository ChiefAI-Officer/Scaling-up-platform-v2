/**
 * Assessment v7.6 Wave E — qualitative-report-model tests (Task 8).
 *
 * Pure data-shaping layer for the new qualitative report. Verifies:
 *   - isReportAnswerPresent: type-aware presence (finite-0 present, NaN/null
 *     absent, trimmed-empty text absent, empty-array absent)
 *   - buildQualitativeModel: answered-only items, fully-empty-section omission,
 *     NUMBER 0 kept, stripLegacyDecimalSuffix applied, per-section/per-alias
 *     presentation kind, and preserved section order.
 *
 * Fixtures are inline — NO DB.
 */

import {
  isReportAnswerPresent,
  buildQualitativeModel,
} from "@/lib/assessments/qualitative-report-model";

// ── isReportAnswerPresent ──────────────────────────────────────────────────

describe("isReportAnswerPresent", () => {
  describe("NUMBER", () => {
    it("present for a finite 0 (a real zero is an answer)", () => {
      expect(isReportAnswerPresent("NUMBER", 0)).toBe(true);
    });
    it("present for a positive number", () => {
      expect(isReportAnswerPresent("NUMBER", 18)).toBe(true);
    });
    it("absent for NaN", () => {
      expect(isReportAnswerPresent("NUMBER", NaN)).toBe(false);
    });
    it("absent for null/undefined", () => {
      expect(isReportAnswerPresent("NUMBER", null)).toBe(false);
      expect(isReportAnswerPresent("NUMBER", undefined)).toBe(false);
    });
    it("absent for a string (wrong type)", () => {
      expect(isReportAnswerPresent("NUMBER", "5")).toBe(false);
    });
  });

  describe("SLIDER_LIKERT", () => {
    it("present for a finite 0", () => {
      expect(isReportAnswerPresent("SLIDER_LIKERT", 0)).toBe(true);
    });
    it("present for an in-range integer", () => {
      expect(isReportAnswerPresent("SLIDER_LIKERT", 3)).toBe(true);
    });
    it("absent for Infinity", () => {
      expect(isReportAnswerPresent("SLIDER_LIKERT", Infinity)).toBe(false);
    });
    it("absent for null", () => {
      expect(isReportAnswerPresent("SLIDER_LIKERT", null)).toBe(false);
    });
  });

  describe("TEXT", () => {
    it("present for non-empty text", () => {
      expect(isReportAnswerPresent("TEXT", "hello")).toBe(true);
    });
    it("absent for empty string", () => {
      expect(isReportAnswerPresent("TEXT", "")).toBe(false);
    });
    it("absent for whitespace-only string (trimmed empty)", () => {
      expect(isReportAnswerPresent("TEXT", "   \n\t ")).toBe(false);
    });
    it("absent for null/number", () => {
      expect(isReportAnswerPresent("TEXT", null)).toBe(false);
      expect(isReportAnswerPresent("TEXT", 5)).toBe(false);
    });
  });

  describe("MULTI_CHOICE", () => {
    it("present for a non-empty array", () => {
      expect(isReportAnswerPresent("MULTI_CHOICE", ["sales", "cash"])).toBe(true);
    });
    it("absent for an empty array", () => {
      expect(isReportAnswerPresent("MULTI_CHOICE", [])).toBe(false);
    });
    it("absent for null", () => {
      expect(isReportAnswerPresent("MULTI_CHOICE", null)).toBe(false);
    });
  });

  describe("unknown / default type", () => {
    it("present for a non-empty value", () => {
      expect(isReportAnswerPresent("SOMETHING_ELSE", "x")).toBe(true);
      expect(isReportAnswerPresent("SOMETHING_ELSE", 0)).toBe(true);
    });
    it("absent for null, empty string, empty array", () => {
      expect(isReportAnswerPresent("SOMETHING_ELSE", null)).toBe(false);
      expect(isReportAnswerPresent("SOMETHING_ELSE", "")).toBe(false);
      expect(isReportAnswerPresent("SOMETHING_ELSE", [])).toBe(false);
    });
  });
});

// ── buildQualitativeModel ───────────────────────────────────────────────────

describe("buildQualitativeModel", () => {
  it("omits unanswered questions (blank text dropped, present text kept)", () => {
    const model = buildQualitativeModel({
      templateAlias: "leadership-vision-alignment",
      sections: [{ stableKey: "S2_vision", name: "Vision on the Future" }],
      questionsByKey: {
        q_answered: {
          type: "TEXT",
          label: "Our main Products in three years",
          sectionStableKey: "S2_vision",
        },
        q_blank: {
          type: "TEXT",
          label: "Our main Partners in three years",
          sectionStableKey: "S2_vision",
        },
      },
      rawAnswers: [
        { stableKey: "q_answered", value: "SOFTWARE AND SERVICES" },
        { stableKey: "q_blank", value: "   " },
      ],
    });

    expect(model.sections).toHaveLength(1);
    const section = model.sections[0];
    expect(section.items).toHaveLength(1);
    expect(section.items[0].stableKey).toBe("q_answered");
    expect(section.items[0].value).toBe("SOFTWARE AND SERVICES");
  });

  it("omits a fully-empty section entirely (Esperto conditional output)", () => {
    const model = buildQualitativeModel({
      templateAlias: "leadership-vision-alignment",
      sections: [
        { stableKey: "S2_vision", name: "Vision on the Future" },
        { stableKey: "S5_explained", name: "Obstacles and Challenges Explained" },
      ],
      questionsByKey: {
        v1: { type: "TEXT", label: "Products", sectionStableKey: "S2_vision" },
        e1: { type: "TEXT", label: "Why Sales", sectionStableKey: "S5_explained" },
        e2: { type: "TEXT", label: "Why Cash", sectionStableKey: "S5_explained" },
      },
      rawAnswers: [
        { stableKey: "v1", value: "SaaS" },
        { stableKey: "e1", value: "" },
        { stableKey: "e2", value: "   " },
      ],
    });

    // S5_explained has zero present items → omitted; only S2_vision survives.
    expect(model.sections.map((s) => s.stableKey)).toEqual(["S2_vision"]);
  });

  it("keeps a NUMBER 0 answer (real zero is present)", () => {
    const model = buildQualitativeModel({
      templateAlias: "leadership-vision-alignment",
      sections: [{ stableKey: "S1_financials", name: "Financials" }],
      questionsByKey: {
        S1_gross_margin: {
          type: "NUMBER",
          label: "Gross margin (in million)",
          sectionStableKey: "S1_financials",
        },
      },
      rawAnswers: [{ stableKey: "S1_gross_margin", value: 0 }],
    });

    expect(model.sections).toHaveLength(1);
    expect(model.sections[0].items).toHaveLength(1);
    expect(model.sections[0].items[0].value).toBe(0);
  });

  it("applies stripLegacyDecimalSuffix to every displayed label", () => {
    const model = buildQualitativeModel({
      templateAlias: "qsp-v2",
      sections: [{ stableKey: "P1_retrospective", name: "PART 1" }],
      questionsByKey: {
        P1_overall_rating: {
          type: "NUMBER",
          label: "How would you rate the past Quarter? (1-10) (with 1 decimal)",
          sectionStableKey: "P1_retrospective",
        },
      },
      rawAnswers: [{ stableKey: "P1_overall_rating", value: 7 }],
    });

    expect(model.sections[0].items[0].label).toBe(
      "How would you rate the past Quarter? (1-10)",
    );
  });

  it("assigns 'metric-table' for the LVA financials section (all NUMBER)", () => {
    const model = buildQualitativeModel({
      templateAlias: "leadership-vision-alignment",
      sections: [{ stableKey: "S1_financials", name: "Financials" }],
      questionsByKey: {
        S1_revenue: { type: "NUMBER", label: "Revenue", sectionStableKey: "S1_financials" },
        S1_customers: { type: "NUMBER", label: "Customers", sectionStableKey: "S1_financials" },
      },
      rawAnswers: [
        { stableKey: "S1_revenue", value: 10 },
        { stableKey: "S1_customers", value: 300 },
      ],
    });

    expect(model.sections[0].kind).toBe("metric-table");
  });

  it("assigns 'rating' for the LVA strengths section (16 SLIDER 1-3) and carries min/max", () => {
    const model = buildQualitativeModel({
      templateAlias: "leadership-vision-alignment",
      sections: [{ stableKey: "S3_strengths", name: "Strengths and Weaknesses" }],
      questionsByKey: {
        S3_sales: {
          type: "SLIDER_LIKERT",
          label: "Sales",
          sectionStableKey: "S3_strengths",
          min: 1,
          max: 3,
        },
      },
      rawAnswers: [{ stableKey: "S3_sales", value: 1 }],
    });

    expect(model.sections[0].kind).toBe("rating");
    expect(model.sections[0].items[0].min).toBe(1);
    expect(model.sections[0].items[0].max).toBe(3);
  });

  it("assigns 'choices' for the LVA obstacles section (MULTI_CHOICE)", () => {
    const model = buildQualitativeModel({
      templateAlias: "leadership-vision-alignment",
      sections: [{ stableKey: "S4_obstacles", name: "Biggest Obstacles" }],
      questionsByKey: {
        S4_biggest_obstacles: {
          type: "MULTI_CHOICE",
          label: "Pick the three biggest obstacles",
          sectionStableKey: "S4_obstacles",
        },
      },
      rawAnswers: [{ stableKey: "S4_biggest_obstacles", value: ["sales", "cash"] }],
    });

    expect(model.sections[0].kind).toBe("choices");
  });

  it("assigns 'rating' for the QSP v1 statement grid (all SLIDER)", () => {
    const model = buildQualitativeModel({
      templateAlias: "qsp-v1",
      sections: [{ stableKey: "S3_quarter_grid", name: "With the past quarter in mind" }],
      questionsByKey: {
        S3_Q1: { type: "SLIDER_LIKERT", label: "Goals", sectionStableKey: "S3_quarter_grid", min: 1, max: 10 },
        S3_Q2: { type: "SLIDER_LIKERT", label: "Leadership", sectionStableKey: "S3_quarter_grid", min: 1, max: 10 },
      },
      rawAnswers: [
        { stableKey: "S3_Q1", value: 6 },
        { stableKey: "S3_Q2", value: 7 },
      ],
    });

    expect(model.sections[0].kind).toBe("rating");
  });

  it("assigns 'qa' for an LVA vision section (all TEXT) and 'qa' fallback for unknown alias text sections", () => {
    const lva = buildQualitativeModel({
      templateAlias: "leadership-vision-alignment",
      sections: [{ stableKey: "S2_vision", name: "Vision" }],
      questionsByKey: {
        S2_main_products: { type: "TEXT", label: "Products", sectionStableKey: "S2_vision" },
      },
      rawAnswers: [{ stableKey: "S2_main_products", value: "SaaS" }],
    });
    expect(lva.sections[0].kind).toBe("qa");

    // Unknown alias + all-TEXT section → type-driven fallback "qa".
    const unknown = buildQualitativeModel({
      templateAlias: "some-future-template",
      sections: [{ stableKey: "X1", name: "Open Questions" }],
      questionsByKey: {
        x_q: { type: "TEXT", label: "Anything?", sectionStableKey: "X1" },
      },
      rawAnswers: [{ stableKey: "x_q", value: "yes" }],
    });
    expect(unknown.sections[0].kind).toBe("qa");
  });

  it("preserves section order from the input sections array", () => {
    const model = buildQualitativeModel({
      templateAlias: "leadership-vision-alignment",
      sections: [
        { stableKey: "S1_financials", name: "Financials" },
        { stableKey: "S2_vision", name: "Vision" },
        { stableKey: "S4_obstacles", name: "Obstacles" },
      ],
      questionsByKey: {
        S1_revenue: { type: "NUMBER", label: "Revenue", sectionStableKey: "S1_financials" },
        S2_main_products: { type: "TEXT", label: "Products", sectionStableKey: "S2_vision" },
        S4_biggest_obstacles: { type: "MULTI_CHOICE", label: "Obstacles", sectionStableKey: "S4_obstacles" },
      },
      rawAnswers: [
        { stableKey: "S2_main_products", value: "SaaS" },
        { stableKey: "S4_biggest_obstacles", value: ["sales"] },
        { stableKey: "S1_revenue", value: 10 },
      ],
    });

    expect(model.sections.map((s) => s.stableKey)).toEqual([
      "S1_financials",
      "S2_vision",
      "S4_obstacles",
    ]);
  });

  it("carries the section description through when present", () => {
    const model = buildQualitativeModel({
      templateAlias: "leadership-vision-alignment",
      sections: [
        { stableKey: "S2_vision", name: "Vision", description: "What you aspire to be." },
      ],
      questionsByKey: {
        S2_main_products: { type: "TEXT", label: "Products", sectionStableKey: "S2_vision" },
      },
      rawAnswers: [{ stableKey: "S2_main_products", value: "SaaS" }],
    });

    expect(model.sections[0].description).toBe("What you aspire to be.");
    expect(model.sections[0].name).toBe("Vision");
  });

  it("guards malformed JSON input without throwing (returns empty sections)", () => {
    expect(buildQualitativeModel({
      sections: "not-an-array",
      questionsByKey: {},
      rawAnswers: null,
    }).sections).toEqual([]);

    expect(buildQualitativeModel({
      sections: null,
      questionsByKey: {},
      rawAnswers: "garbage",
    }).sections).toEqual([]);
  });
});
