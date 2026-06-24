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
  REPORT_FILTERS,
} from "@/lib/assessments/qualitative-report-model";
import { buildQuestionMetaByKey } from "@/lib/assessments/question-meta";
import { buildLvaContent } from "../../../../prisma/seed-lva-assessment";

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

  it("assigns 'rating' for an all-slider 1-3 section and carries min/max", () => {
    const model = buildQualitativeModel({
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

  // ── C-H1: MULTI_CHOICE keys resolve to option labels ─────────────────────
  describe("MULTI_CHOICE label resolution (C-H1)", () => {
    it("resolves stored option KEYS to their human labels via question.options", () => {
      const model = buildQualitativeModel({
        templateAlias: "leadership-vision-alignment",
        sections: [{ stableKey: "S4_obstacles", name: "Biggest Obstacles" }],
        questionsByKey: {
          S4_biggest_obstacles: {
            type: "MULTI_CHOICE",
            label: "Pick the biggest obstacles",
            sectionStableKey: "S4_obstacles",
            options: [
              { key: "the_leadership", label: "The Leadership" },
              { key: "culture", label: "Culture" },
              { key: "strategy", label: "Strategy" },
            ],
          },
        },
        // The stored value is the option KEYS (NOT labels).
        rawAnswers: [
          { stableKey: "S4_biggest_obstacles", value: ["the_leadership", "culture", "strategy"] },
        ],
      });

      const item = model.sections[0].items[0];
      // The display-ready values are the LABELS, not the raw keys.
      expect(item.displayValues).toEqual(["The Leadership", "Culture", "Strategy"]);
      // The raw keys must not be exposed as the display value.
      expect(item.displayValues).not.toContain("the_leadership");
      expect(item.displayValues).not.toContain("culture");
    });

    it("falls back to the raw key string when an option key has no matching label", () => {
      const model = buildQualitativeModel({
        templateAlias: "leadership-vision-alignment",
        sections: [{ stableKey: "S4_obstacles", name: "Obstacles" }],
        questionsByKey: {
          obs: {
            type: "MULTI_CHOICE",
            label: "Pick obstacles",
            sectionStableKey: "S4_obstacles",
            options: [{ key: "culture", label: "Culture" }],
          },
        },
        rawAnswers: [{ stableKey: "obs", value: ["culture", "mystery_key"] }],
      });

      const item = model.sections[0].items[0];
      expect(item.displayValues).toEqual(["Culture", "mystery_key"]);
    });

    it("falls back to the raw keys when the question carries no options", () => {
      const model = buildQualitativeModel({
        templateAlias: "leadership-vision-alignment",
        sections: [{ stableKey: "S4_obstacles", name: "Obstacles" }],
        questionsByKey: {
          obs: {
            type: "MULTI_CHOICE",
            label: "Pick obstacles",
            sectionStableKey: "S4_obstacles",
          },
        },
        rawAnswers: [{ stableKey: "obs", value: ["sales", "cash"] }],
      });

      const item = model.sections[0].items[0];
      expect(item.displayValues).toEqual(["sales", "cash"]);
    });

    it("does not set displayValues on non-MULTI_CHOICE items", () => {
      const model = buildQualitativeModel({
        templateAlias: "leadership-vision-alignment",
        sections: [{ stableKey: "S2_vision", name: "Vision" }],
        questionsByKey: {
          v1: { type: "TEXT", label: "Products", sectionStableKey: "S2_vision" },
        },
        rawAnswers: [{ stableKey: "v1", value: "SaaS" }],
      });

      expect(model.sections[0].items[0].displayValues).toBeUndefined();
    });
  });

  // ── C-M3: defensive grouping for OLD pinned versions ─────────────────────
  // The qualitative report type is deployment-global and applies retroactively
  // to already-pinned/historical LVA & QSP versions. Older content shapes may
  // carry section membership on the SECTION (sections[].questions) rather than
  // on each question (questionsByKey[*].sectionStableKey). Grouping by
  // sectionStableKey alone would render an EMPTY report for those rows.
  describe("old pinned versions (sections[].questions fallback) — C-M3", () => {
    it("groups questions via sections[].questions when questions lack sectionStableKey (object-form)", () => {
      // Plausible historical LVA version: questions have NO sectionStableKey,
      // but each section embeds its question keys under `questions: [{stableKey}]`.
      const model = buildQualitativeModel({
        templateAlias: "leadership-vision-alignment",
        sections: [
          {
            stableKey: "S2_vision",
            name: "Vision on the Future",
            questions: [
              { stableKey: "S2_main_products" },
              { stableKey: "S2_main_markets" },
            ],
          },
          {
            stableKey: "S1_financials",
            name: "Financials",
            questions: [{ stableKey: "S1_revenue" }, { stableKey: "S1_customers" }],
          },
        ],
        questionsByKey: {
          // No sectionStableKey on any question (the OLD shape).
          S2_main_products: { type: "TEXT", label: "Our main Products in three years" },
          S2_main_markets: { type: "TEXT", label: "Our main Markets in three years" },
          S1_revenue: { type: "NUMBER", label: "Revenue (in million)" },
          S1_customers: { type: "NUMBER", label: "Number of customers" },
        },
        rawAnswers: [
          { stableKey: "S2_main_products", value: "SOFTWARE AND SERVICES" },
          { stableKey: "S2_main_markets", value: "EMEA" },
          { stableKey: "S1_revenue", value: 12 },
          { stableKey: "S1_customers", value: 300 },
        ],
      });

      // The new global flip must NOT render an empty report.
      expect(model.sections).not.toHaveLength(0);
      expect(model.sections.map((s) => s.stableKey)).toEqual([
        "S2_vision",
        "S1_financials",
      ]);
      const vision = model.sections.find((s) => s.stableKey === "S2_vision")!;
      expect(vision.items.map((i) => i.stableKey)).toEqual([
        "S2_main_products",
        "S2_main_markets",
      ]);
      expect(vision.kind).toBe("qa");
      const financials = model.sections.find((s) => s.stableKey === "S1_financials")!;
      expect(financials.items.map((i) => i.stableKey)).toEqual([
        "S1_revenue",
        "S1_customers",
      ]);
      // Type-driven kind still works off the grouped items (all NUMBER).
      expect(financials.kind).toBe("metric-table");
    });

    it("groups questions via sections[].questions in bare-string form", () => {
      const model = buildQualitativeModel({
        templateAlias: "qsp-v1",
        sections: [
          {
            stableKey: "S5_start_stop_continue",
            name: "Start / Stop / Continue",
            // Bare-string membership form (as parseSections also accepts).
            questions: ["S5_start", "S5_stop"],
          },
        ],
        questionsByKey: {
          S5_start: { type: "TEXT", label: "What to start" },
          S5_stop: { type: "TEXT", label: "What to stop" },
        },
        rawAnswers: [
          { stableKey: "S5_start", value: "Daily huddles" },
          { stableKey: "S5_stop", value: "Long meetings" },
        ],
      });

      expect(model.sections).toHaveLength(1);
      expect(model.sections[0].items.map((i) => i.stableKey)).toEqual([
        "S5_start",
        "S5_stop",
      ]);
    });

    it("prefers sectionStableKey but still picks up section-listed members lacking it", () => {
      // Mixed shape: one question carries sectionStableKey (new), one is only
      // referenced via sections[].questions (old). Both must land in the section.
      const model = buildQualitativeModel({
        templateAlias: "leadership-vision-alignment",
        sections: [
          {
            stableKey: "S2_vision",
            name: "Vision",
            questions: [{ stableKey: "via_key" }, { stableKey: "via_list" }],
          },
        ],
        questionsByKey: {
          via_key: { type: "TEXT", label: "Resolved by sectionStableKey", sectionStableKey: "S2_vision" },
          via_list: { type: "TEXT", label: "Resolved by section list only" },
        },
        rawAnswers: [
          { stableKey: "via_key", value: "A" },
          { stableKey: "via_list", value: "B" },
        ],
      });

      expect(model.sections).toHaveLength(1);
      expect(model.sections[0].items.map((i) => i.stableKey).sort()).toEqual([
        "via_key",
        "via_list",
      ]);
      // No duplication — each question appears exactly once.
      expect(model.sections[0].items).toHaveLength(2);
    });

    it("does not duplicate a question that is BOTH section-listed and sectionStableKey-tagged", () => {
      const model = buildQualitativeModel({
        templateAlias: "leadership-vision-alignment",
        sections: [
          { stableKey: "S2_vision", name: "Vision", questions: [{ stableKey: "q1" }] },
        ],
        questionsByKey: {
          q1: { type: "TEXT", label: "Products", sectionStableKey: "S2_vision" },
        },
        rawAnswers: [{ stableKey: "q1", value: "SaaS" }],
      });

      expect(model.sections[0].items).toHaveLength(1);
      expect(model.sections[0].items[0].stableKey).toBe("q1");
    });

    it("still omits a section whose section-listed members are all unanswered", () => {
      const model = buildQualitativeModel({
        templateAlias: "leadership-vision-alignment",
        sections: [
          {
            stableKey: "S2_vision",
            name: "Vision",
            questions: [{ stableKey: "v1" }],
          },
          {
            stableKey: "S5_explained",
            name: "Obstacles Explained",
            questions: [{ stableKey: "e1" }, { stableKey: "e2" }],
          },
        ],
        questionsByKey: {
          v1: { type: "TEXT", label: "Products" },
          e1: { type: "TEXT", label: "Why Sales" },
          e2: { type: "TEXT", label: "Why Cash" },
        },
        rawAnswers: [
          { stableKey: "v1", value: "SaaS" },
          { stableKey: "e1", value: "" },
          { stableKey: "e2", value: "   " },
        ],
      });

      expect(model.sections.map((s) => s.stableKey)).toEqual(["S2_vision"]);
    });
  });

  // ── C-M3: orphan answered questions → "Additional responses" bucket ──────
  describe("orphan answered questions bucket — C-M3", () => {
    it("collects an answered question assigned to NO section into 'Additional responses'", () => {
      const model = buildQualitativeModel({
        templateAlias: "leadership-vision-alignment",
        sections: [{ stableKey: "S2_vision", name: "Vision" }],
        questionsByKey: {
          v1: { type: "TEXT", label: "Products", sectionStableKey: "S2_vision" },
          // orphan: no sectionStableKey AND not referenced by any section.
          orphan_q: { type: "TEXT", label: "An un-sectioned answered question" },
        },
        rawAnswers: [
          { stableKey: "v1", value: "SaaS" },
          { stableKey: "orphan_q", value: "Must not be dropped" },
        ],
      });

      // Real section + a trailing synthetic "Additional responses" section.
      expect(model.sections).toHaveLength(2);
      const bucket = model.sections[model.sections.length - 1];
      expect(bucket.name).toBe("Additional responses");
      expect(bucket.kind).toBe("qa");
      expect(bucket.items.map((i) => i.stableKey)).toEqual(["orphan_q"]);
      expect(bucket.items[0].value).toBe("Must not be dropped");
    });

    it("does NOT add the 'Additional responses' bucket when an orphan is unanswered", () => {
      const model = buildQualitativeModel({
        templateAlias: "leadership-vision-alignment",
        sections: [{ stableKey: "S2_vision", name: "Vision" }],
        questionsByKey: {
          v1: { type: "TEXT", label: "Products", sectionStableKey: "S2_vision" },
          orphan_q: { type: "TEXT", label: "Un-sectioned, unanswered" },
        },
        rawAnswers: [
          { stableKey: "v1", value: "SaaS" },
          { stableKey: "orphan_q", value: "   " },
        ],
      });

      // Only the real section — no empty trailing bucket.
      expect(model.sections.map((s) => s.stableKey)).toEqual(["S2_vision"]);
      expect(model.sections.some((s) => s.name === "Additional responses")).toBe(false);
    });

    it("collects an orphan even when there are NO real sections at all", () => {
      const model = buildQualitativeModel({
        templateAlias: "some-future-template",
        sections: [],
        questionsByKey: {
          orphan_q: { type: "TEXT", label: "Lonely answered question" },
        },
        rawAnswers: [{ stableKey: "orphan_q", value: "kept" }],
      });

      expect(model.sections).toHaveLength(1);
      expect(model.sections[0].name).toBe("Additional responses");
      expect(model.sections[0].items.map((i) => i.stableKey)).toEqual(["orphan_q"]);
    });
  });
});

describe("REPORT_FILTERS (Wave I)", () => {
  it("declares the LVA suppress + conditional-followup contract", () => {
    expect(REPORT_FILTERS["leadership-vision-alignment"]).toEqual({
      suppressSections: ["S3_strengths"],
      conditionalFollowups: { gateKey: "S4_biggest_obstacles", followupPrefix: "S5_why_" },
    });
  });
  it("has no entry for unaffected templates", () => {
    expect(REPORT_FILTERS["qsp-v2"]).toBeUndefined();
    expect(REPORT_FILTERS["RockHabits"]).toBeUndefined();
  });
});

describe("LVA section suppression (Wave I)", () => {
  it("omits S3_strengths for LVA even when every factor is answered", () => {
    const model = buildQualitativeModel({
      templateAlias: "leadership-vision-alignment",
      sections: [
        { stableKey: "S3_strengths", name: "Strengths and Weaknesses" },
        { stableKey: "S2_vision", name: "Vision" },
      ],
      questionsByKey: {
        S3_sales: { type: "SLIDER_LIKERT", label: "Sales", sectionStableKey: "S3_strengths", min: 1, max: 3 },
        S2_products: { type: "TEXT", label: "Products", sectionStableKey: "S2_vision" },
      },
      rawAnswers: [
        { stableKey: "S3_sales", value: 1 },
        { stableKey: "S2_products", value: "robots" },
      ],
    });
    const keys = model.sections.map((s) => s.stableKey);
    expect(keys).not.toContain("S3_strengths");
    expect(keys).toContain("S2_vision");
    expect(keys).not.toContain("__additional_responses__");
  });

  it("does NOT suppress for a template without a REPORT_FILTERS entry", () => {
    const model = buildQualitativeModel({
      templateAlias: "qsp-v2",
      sections: [{ stableKey: "S3_strengths", name: "Strengths" }],
      questionsByKey: { S3_a: { type: "SLIDER_LIKERT", label: "A", sectionStableKey: "S3_strengths", min: 1, max: 3 } },
      rawAnswers: [{ stableKey: "S3_a", value: 2 }],
    });
    expect(model.sections.map((s) => s.stableKey)).toContain("S3_strengths");
  });
});

// ── LVA conditional follow-ups (Wave I, ADR-0014) ───────────────────────────

const lvaGate = (
  s4: unknown,
  explanations: Record<string, unknown>,
  opts: { gateType?: string; omitGate?: boolean } = {},
) => ({
  templateAlias: "leadership-vision-alignment",
  sections: [{ stableKey: "S5_explained", name: "Obstacles Explained" }],
  questionsByKey: {
    // `omitGate` drops the gate QUESTION from the pinned version entirely (the
    // "no gate question in the version" fail-open path). A valid gate with a
    // missing/empty ANSWER is the *empty-selection* path (gate stays present).
    ...(opts.omitGate
      ? {}
      : {
          S4_biggest_obstacles: {
            type: opts.gateType ?? "MULTI_CHOICE",
            label: "Pick the obstacles",
            sectionStableKey: "S4_obstacles",
            options: [
              { key: "sales", label: "Sales" }, { key: "cash", label: "Cash" },
              { key: "execution", label: "Execution" }, { key: "the_leadership", label: "The Leadership" },
            ],
          },
        }),
    S5_why_sales: { type: "TEXT", label: "Why is Sales a hindrance?", sectionStableKey: "S5_explained" },
    S5_why_cash: { type: "TEXT", label: "Why is Cash a hindrance?", sectionStableKey: "S5_explained" },
    S5_why_execution: { type: "TEXT", label: "Why is Execution a hindrance?", sectionStableKey: "S5_explained" },
    S5_why_the_leadership: { type: "TEXT", label: "Why is The Leadership a hindrance?", sectionStableKey: "S5_explained" },
    S5_other_factor: { type: "TEXT", label: "Another factor?", sectionStableKey: "S5_explained" },
    S5_change_one_thing: { type: "TEXT", label: "Change one thing?", sectionStableKey: "S5_explained" },
  },
  rawAnswers: [
    ...(opts.omitGate ? [] : [{ stableKey: "S4_biggest_obstacles", value: s4 }]),
    ...Object.entries(explanations).map(([stableKey, value]) => ({ stableKey, value })),
  ],
});
const s5Keys = (m: ReturnType<typeof buildQualitativeModel>) =>
  (m.sections.find((s) => s.stableKey === "S5_explained")?.items ?? []).map((i) => i.stableKey);

describe("LVA conditional follow-ups (Wave I)", () => {
  it("renders S5_why_<f> only for checked factors; drops unchecked-but-typed", () => {
    const m = buildQualitativeModel(lvaGate(["sales", "cash"], {
      S5_why_sales: "lost reps", S5_why_cash: "long receivables",
      S5_why_execution: "no cadence", S5_why_the_leadership: "friction",
    }));
    const k = s5Keys(m);
    expect(k).toEqual(expect.arrayContaining(["S5_why_sales", "S5_why_cash"]));
    expect(k).not.toContain("S5_why_execution");
    expect(k).not.toContain("S5_why_the_leadership");
  });
  it("always renders the non-followup S5 questions", () => {
    const k = s5Keys(buildQualitativeModel(lvaGate(["sales"], { S5_other_factor: "hiring", S5_change_one_thing: "rhythm" })));
    expect(k).toEqual(expect.arrayContaining(["S5_other_factor", "S5_change_one_thing"]));
  });
  it("omits a checked-but-blank follow-up", () => {
    expect(s5Keys(buildQualitativeModel(lvaGate(["sales"], { S5_why_sales: "   " })))).not.toContain("S5_why_sales");
  });
  it("valid gate + empty selection → all S5_why_ hidden", () => {
    expect(s5Keys(buildQualitativeModel(lvaGate([], { S5_why_sales: "x" })))).not.toContain("S5_why_sales");
  });
  it("FAIL-OPEN: no gate question in the version → renders answered-only", () => {
    expect(s5Keys(buildQualitativeModel(lvaGate(["sales"], { S5_why_sales: "x" }, { omitGate: true })))).toContain("S5_why_sales");
  });
  it("FAIL-OPEN: gate present but NOT MULTI_CHOICE → renders answered-only", () => {
    expect(s5Keys(buildQualitativeModel(lvaGate(["sales"], { S5_why_sales: "x" }, { gateType: "TEXT" })))).toContain("S5_why_sales");
  });
  it("gates orphaned follow-ups too: a CHECKED orphaned S5_why_ IS present and an unchecked one is NOT (both directions)", () => {
    // Gate selects "sales" (checked) but NOT "cash" (unchecked). Both S5_why_
    // follow-ups are ORPHANS (no section, not referenced by any section list),
    // so they route through the "Additional responses" bucket — and the gate
    // must still apply there: checked → present, unchecked → absent.
    const m = buildQualitativeModel({
      templateAlias: "leadership-vision-alignment",
      sections: [],
      questionsByKey: {
        S4_biggest_obstacles: { type: "MULTI_CHOICE", label: "g", options: [{ key: "sales", label: "Sales" }, { key: "cash", label: "Cash" }] },
        S5_why_sales: { type: "TEXT", label: "Why Sales?" },
        S5_why_cash: { type: "TEXT", label: "Why Cash?" },
      },
      rawAnswers: [
        { stableKey: "S4_biggest_obstacles", value: ["sales"] },
        { stableKey: "S5_why_sales", value: "x" },
        { stableKey: "S5_why_cash", value: "x" },
      ],
    });
    const add = m.sections.find((s) => s.stableKey === "__additional_responses__");
    const addKeys = (add?.items ?? []).map((i) => i.stableKey);
    // Positive control: the CHECKED orphaned follow-up IS in the bucket.
    expect(addKeys).toContain("S5_why_sales");
    // Negative control: the UNCHECKED orphaned follow-up is NOT.
    expect(addKeys).not.toContain("S5_why_cash");
  });
});

// ── Real-seed integration (Wave I, ADR-0014) ────────────────────────────────
// Proves the filter's hard-coded keys (suppressSections / gateKey / followupPrefix)
// match the ACTUAL LVA seed content — not a hand-built QMeta fixture. If the seed
// renames a section/question stableKey or changes the S4 option keys, this fails.

describe("LVA report filter against the REAL seed (integration)", () => {
  it("suppresses S3 and gates S5 on the REAL LVA seed content", () => {
    const content = buildLvaContent();
    const questionsByKey = buildQuestionMetaByKey(content.questions);
    const model = buildQualitativeModel({
      templateAlias: "leadership-vision-alignment",
      sections: content.sections,
      questionsByKey,
      rawAnswers: [
        // Answer every S3 strength so the section would render if NOT suppressed.
        ...content.questions
          .filter((q) => q.stableKey.startsWith("S3_"))
          .map((q) => ({ stableKey: q.stableKey, value: 2 })),
        // Flag sales + cash (NOT execution) → only those two S5_why_ explained.
        { stableKey: "S4_biggest_obstacles", value: ["sales", "cash"] },
        { stableKey: "S5_why_sales", value: "real-sales" },
        { stableKey: "S5_why_cash", value: "real-cash" },
        { stableKey: "S5_why_execution", value: "real-exec-UNCHECKED" },
        { stableKey: "S5_other_factor", value: "real-other" },
      ],
    });

    const keys = model.sections.map((s) => s.stableKey);
    // S3_strengths is suppressed by the LVA report filter.
    expect(keys).not.toContain("S3_strengths");

    const s5 = model.sections
      .find((s) => s.stableKey === "S5_explained")
      ?.items.map((i) => i.stableKey) ?? [];
    // Checked factors' "why" rows + the always-on S5_other_factor survive.
    expect(s5).toEqual(
      expect.arrayContaining(["S5_why_sales", "S5_why_cash", "S5_other_factor"]),
    );
    // The unchecked "execution" explanation is gated out even though it was typed.
    expect(s5).not.toContain("S5_why_execution");
  });
});

// ── LVA filter provenance (Wave I, R2-M4) ───────────────────────────────────

describe("LVA filter provenance (Wave I)", () => {
  it("reports suppressed-section and hidden-followup counts for LVA", () => {
    const m = buildQualitativeModel(lvaGate(["sales"], { S5_why_sales: "x", S5_why_cash: "y" }));
    expect(m.filterProvenance).toEqual(
      expect.objectContaining({ filterId: "lva-cond-v1", hiddenFollowupCount: 1 }),
    );
  });
  it("counts a suppressed section", () => {
    const m = buildQualitativeModel({
      templateAlias: "leadership-vision-alignment",
      sections: [{ stableKey: "S3_strengths", name: "S" }, { stableKey: "S2_vision", name: "V" }],
      questionsByKey: {
        S3_a: { type: "SLIDER_LIKERT", label: "a", sectionStableKey: "S3_strengths", min: 1, max: 3 },
        S2_a: { type: "TEXT", label: "v", sectionStableKey: "S2_vision" },
      },
      rawAnswers: [{ stableKey: "S3_a", value: 2 }, { stableKey: "S2_a", value: "hi" }],
    });
    expect(m.filterProvenance?.suppressedSectionCount).toBe(1);
  });
  it("returns no filterProvenance for a template without a filter", () => {
    const m = buildQualitativeModel({
      templateAlias: "qsp-v2",
      sections: [{ stableKey: "P1", name: "P1" }],
      questionsByKey: { p: { type: "TEXT", label: "p", sectionStableKey: "P1" } },
      rawAnswers: [{ stableKey: "p", value: "x" }],
    });
    expect(m.filterProvenance).toBeUndefined();
  });
});
