/**
 * Verbatim-guard + schema-validation tests for buildQspV1Content().
 *
 * Sourced from the adversarially-verified transcription of 18 Esperto
 * survey screenshots embedded in:
 *   "From Jeff/APP_scaling up assessemnt/APP_qtr session prep v1/qtr session prep v1.xlsx"
 * Confirmed against the 12-page Esperto output PDF (aggregation-only, no tiers).
 *
 * Any accidental mutation to labels, section names, scale shapes, scoring
 * config, or question counts will be caught here before it reaches the DB.
 */

import {
  buildQspV1Content,
  type QspV1Content,
} from "../../../prisma/seed-qsp-v1-assessment";
import { TemplateVersionForScoringSchema } from "../../lib/assessments/scoring";
import expectedLabels from "./fixtures/qsp-v1-labels.json";

const EXPECTED_SLIDER_SCALE = {
  min: 1,
  max: 10,
  step: 1,
  anchorMin: "",
  anchorMax: "",
};

describe("buildQspV1Content()", () => {
  let content: QspV1Content;

  beforeAll(() => {
    content = buildQspV1Content();
  });

  // ── Basic shape ──────────────────────────────────────────────────────────

  it("alias is 'qsp-v1'", () => {
    expect(content.alias).toBe("qsp-v1");
  });

  it("language is 'enUS'", () => {
    expect(content.language).toBe("enUS");
  });

  it("reportConfig is null", () => {
    expect(content.reportConfig).toBeNull();
  });

  // ── Section count ────────────────────────────────────────────────────────

  it("returns exactly 8 sections", () => {
    expect(content.sections).toHaveLength(8);
  });

  it("section sortOrders are unique and sequential from 1..8", () => {
    const orders = content.sections
      .map((s) => s.sortOrder)
      .sort((a, b) => a - b);
    expect(orders).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
  });

  // ── Question count ───────────────────────────────────────────────────────

  it("returns exactly 28 questions", () => {
    expect(content.questions).toHaveLength(28);
  });

  it("question sortOrders are unique and sequential from 1..28", () => {
    const orders = content.questions
      .map((q) => q.sortOrder)
      .sort((a, b) => a - b);
    expect(orders).toEqual(Array.from({ length: 28 }, (_, i) => i + 1));
  });

  // ── Type breakdown ───────────────────────────────────────────────────────

  it("contains exactly 1 NUMBER question", () => {
    const count = content.questions.filter((q) => q.type === "NUMBER").length;
    expect(count).toBe(1);
  });

  it("contains exactly 7 SLIDER_LIKERT questions", () => {
    const count = content.questions.filter(
      (q) => q.type === "SLIDER_LIKERT"
    ).length;
    expect(count).toBe(7);
  });

  it("contains exactly 20 TEXT questions", () => {
    const count = content.questions.filter((q) => q.type === "TEXT").length;
    expect(count).toBe(20);
  });

  // ── Slider scale ─────────────────────────────────────────────────────────

  it("every SLIDER_LIKERT scale deep-equals { min:1, max:10, step:1, anchorMin:'', anchorMax:'' }", () => {
    const sliders = content.questions.filter((q) => q.type === "SLIDER_LIKERT");
    for (const q of sliders) {
      // TypeScript narrows: SLIDER_LIKERT questions have a scale property.
      expect((q as { scale: unknown }).scale).toEqual(EXPECTED_SLIDER_SCALE);
    }
  });

  it("no SLIDER_LIKERT question has a scaleLabels property", () => {
    const sliders = content.questions.filter((q) => q.type === "SLIDER_LIKERT");
    for (const q of sliders) {
      expect("scaleLabels" in q).toBe(false);
    }
  });

  // ── Core-values role-model 3-box constraint ───────────────────────────────

  it("core-values role-model = exactly 3 TEXT questions with stable keys _role_model_1/2/3", () => {
    const roleModelKeys = [
      "S4_core_values_role_model_1",
      "S4_core_values_role_model_2",
      "S4_core_values_role_model_3",
    ];
    for (const key of roleModelKeys) {
      const q = content.questions.find((x) => x.stableKey === key);
      expect(q).toBeDefined();
      expect(q!.type).toBe("TEXT");
    }
  });

  it("the 3 role-model questions are all isRequired: false (optional)", () => {
    const roleModelKeys = [
      "S4_core_values_role_model_1",
      "S4_core_values_role_model_2",
      "S4_core_values_role_model_3",
    ];
    for (const key of roleModelKeys) {
      const q = content.questions.find((x) => x.stableKey === key);
      expect(q!.isRequired).toBe(false);
    }
  });

  // ── Scoring config ───────────────────────────────────────────────────────

  it("scoringConfig.tierMetric === 'overallAvg'", () => {
    expect(content.scoringConfig.tierMetric).toBe("overallAvg");
  });

  it("scoringConfig.passThreshold === 0", () => {
    expect(content.scoringConfig.passThreshold).toBe(0);
  });

  it("scoringConfig has exactly 1 tier (neutral submission tier)", () => {
    expect(content.scoringConfig.tiers).toHaveLength(1);
  });

  it("the single tier covers 1..10 with label 'Submitted'", () => {
    const tier = content.scoringConfig.tiers[0];
    expect(tier.minMetric).toBe(1);
    expect(tier.maxMetric).toBe(10);
    expect(tier.label).toBe("Submitted");
  });

  // ── Required / optional split ────────────────────────────────────────────

  it("department-level start/stop/continue questions are isRequired: false", () => {
    const deptKeys = [
      "S5_Q2_department_start",
      "S5_Q4_department_stop",
      "S5_Q6_department_continue",
    ];
    for (const key of deptKeys) {
      const q = content.questions.find((x) => x.stableKey === key);
      expect(q).toBeDefined();
      expect(q!.isRequired).toBe(false);
    }
  });

  it("closing-remarks question is isRequired: false", () => {
    const q = content.questions.find(
      (x) => x.stableKey === "S8_Q1_closing_remarks"
    );
    expect(q).toBeDefined();
    expect(q!.isRequired).toBe(false);
  });

  it("overall-rating NUMBER question is isRequired: true", () => {
    const q = content.questions.find(
      (x) => x.stableKey === "S2_Q1_overall_rating"
    );
    expect(q).toBeDefined();
    expect(q!.isRequired).toBe(true);
  });

  // ── Section membership ───────────────────────────────────────────────────

  it("every question's sectionStableKey resolves to an existing section", () => {
    const sectionKeys = new Set(content.sections.map((s) => s.stableKey));
    for (const q of content.questions) {
      expect(sectionKeys.has(q.sectionStableKey)).toBe(true);
    }
  });

  it("Welcome section (S1_welcome) has no questions assigned to it", () => {
    const welcomeQs = content.questions.filter(
      (q) => q.sectionStableKey === "S1_welcome"
    );
    expect(welcomeQs).toHaveLength(0);
  });

  // ── Stable key uniqueness ────────────────────────────────────────────────

  it("all question stableKeys are unique", () => {
    const keys = content.questions.map((q) => q.stableKey);
    const uniqueKeys = new Set(keys);
    expect(uniqueKeys.size).toBe(keys.length);
  });

  // ── Verbatim label fixture ───────────────────────────────────────────────

  it("question labels in order match the committed fixture (qsp-v1-labels.json)", () => {
    const actualLabels = content.questions.map((q) => q.label);
    expect(actualLabels).toEqual(expectedLabels);
  });

  it("no QSPv1 question label contains '(with 1 decimal)' (#26/#28 parity with QSPv2)", () => {
    const offenders = content.questions.filter((q) => /with 1 decimal/i.test(q.label));
    expect(offenders).toEqual([]);
  });

  // ── Scoring schema parse (engine contract) ───────────────────────────────
  //
  // TemplateVersionForScoringSchema validates the discriminated-union question
  // shape (SLIDER_LIKERT with scale, TEXT/NUMBER without), the section shape,
  // and the scoringConfig. Passing here means scoreSubmission() will accept
  // this template version without throwing.

  it("passes TemplateVersionForScoringSchema.parse() without throwing", () => {
    // Build a minimal version payload: include only SLIDER_LIKERT questions
    // (scoring engine only scores those; TEXT/NUMBER are stored but pass-through).
    // The schema accepts all types via the discriminated union — pass all questions.
    expect(() => {
      TemplateVersionForScoringSchema.parse({
        questions: content.questions,
        sections: content.sections,
        scoringConfig: content.scoringConfig,
      });
    }).not.toThrow();
  });
});
