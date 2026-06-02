/**
 * Verbatim-guard + schema-validation tests for buildLvaContent().
 *
 * Content sourced verbatim from:
 *   "From Jeff/APP_scaling up assessemnt/APP_leadership vision alignment
 *    assessment/leadership visin alignment assement.xlsx"
 * Adversarially verified against Kathy HR-Exec individual report and
 * John CEO group report.
 *
 * Any accidental mutation to labels, section names, scale anchors, scoring
 * config, or question counts will be caught here before it reaches the DB.
 */

import {
  buildLvaContent,
  type LvaContent,
} from "../../../prisma/seed-lva-assessment";
import { TemplateVersionForScoringSchema } from "../../lib/assessments/scoring";
import expectedLabels from "./fixtures/lva-labels.json";

const EXPECTED_SLIDER_SCALE = {
  min: 1,
  max: 3,
  step: 1,
  anchorMin: "Weak",
  anchorMax: "Strong",
};

describe("buildLvaContent()", () => {
  let content: LvaContent;

  beforeAll(() => {
    content = buildLvaContent();
  });

  // ── Basic shape ──────────────────────────────────────────────────────────

  it("alias is 'leadership-vision-alignment'", () => {
    expect(content.alias).toBe("leadership-vision-alignment");
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

  it("Welcome section (S0_welcome) has no questions assigned to it", () => {
    const welcomeQs = content.questions.filter(
      (q) => q.sectionStableKey === "S0_welcome"
    );
    expect(welcomeQs).toHaveLength(0);
  });

  it("Completion section (S7_completion) has no questions assigned to it", () => {
    const completionQs = content.questions.filter(
      (q) => q.sectionStableKey === "S7_completion"
    );
    expect(completionQs).toHaveLength(0);
  });

  // ── Question count ───────────────────────────────────────────────────────

  it("returns exactly 67 questions", () => {
    expect(content.questions).toHaveLength(67);
  });

  it("question sortOrders are unique and sequential from 1..67", () => {
    const orders = content.questions
      .map((q) => q.sortOrder)
      .sort((a, b) => a - b);
    expect(orders).toEqual(Array.from({ length: 67 }, (_, i) => i + 1));
  });

  // ── Type breakdown ───────────────────────────────────────────────────────

  it("contains exactly 10 NUMBER questions", () => {
    const count = content.questions.filter((q) => q.type === "NUMBER").length;
    expect(count).toBe(10);
  });

  it("contains exactly 40 TEXT questions", () => {
    const count = content.questions.filter((q) => q.type === "TEXT").length;
    expect(count).toBe(40);
  });

  it("contains exactly 16 SLIDER_LIKERT questions", () => {
    const count = content.questions.filter(
      (q) => q.type === "SLIDER_LIKERT"
    ).length;
    expect(count).toBe(16);
  });

  it("contains exactly 1 MULTI_CHOICE question", () => {
    const count = content.questions.filter(
      (q) => q.type === "MULTI_CHOICE"
    ).length;
    expect(count).toBe(1);
  });

  // ── S1 Financial section — three-year aspirational framing ───────────────

  it("S1 has exactly 9 NUMBER questions", () => {
    const s1Nums = content.questions.filter(
      (q) => q.sectionStableKey === "S1_financials" && q.type === "NUMBER"
    );
    expect(s1Nums).toHaveLength(9);
  });

  it("S1 revenue label contains 'three years' (aspirational framing)", () => {
    const revenueQ = content.questions.find((q) => q.stableKey === "S1_revenue");
    expect(revenueQ).toBeDefined();
    expect(revenueQ!.label).toMatch(/three years/i);
  });

  it("all 9 S1 NUMBER labels contain 'three years'", () => {
    const s1Nums = content.questions.filter(
      (q) => q.sectionStableKey === "S1_financials" && q.type === "NUMBER"
    );
    for (const q of s1Nums) {
      expect(q.label).toMatch(/three years/i);
    }
  });

  it("all S1 NUMBER questions are isRequired: false", () => {
    const s1Nums = content.questions.filter(
      (q) => q.sectionStableKey === "S1_financials" && q.type === "NUMBER"
    );
    for (const q of s1Nums) {
      expect(q.isRequired).toBe(false);
    }
  });

  // ── S2 Vision — 8 required TEXT ──────────────────────────────────────────

  it("S2 has exactly 8 TEXT questions, all isRequired: true", () => {
    const s2Qs = content.questions.filter(
      (q) => q.sectionStableKey === "S2_vision"
    );
    expect(s2Qs).toHaveLength(8);
    for (const q of s2Qs) {
      expect(q.type).toBe("TEXT");
      expect(q.isRequired).toBe(true);
    }
  });

  // ── S3 Matrix — 16 SLIDER_LIKERT ─────────────────────────────────────────

  it("S3 has exactly 16 SLIDER_LIKERT questions", () => {
    const sliders = content.questions.filter(
      (q) => q.sectionStableKey === "S3_strengths"
    );
    expect(sliders).toHaveLength(16);
    for (const q of sliders) {
      expect(q.type).toBe("SLIDER_LIKERT");
    }
  });

  it("every SLIDER_LIKERT scale deep-equals { min:1, max:3, step:1, anchorMin:'Weak', anchorMax:'Strong' }", () => {
    const sliders = content.questions.filter((q) => q.type === "SLIDER_LIKERT");
    for (const q of sliders) {
      expect((q as { scale: unknown }).scale).toEqual(EXPECTED_SLIDER_SCALE);
    }
  });

  it("no SLIDER_LIKERT question has a scaleLabels property", () => {
    const sliders = content.questions.filter((q) => q.type === "SLIDER_LIKERT");
    for (const q of sliders) {
      expect("scaleLabels" in q).toBe(false);
    }
  });

  it("all 16 SLIDER_LIKERT questions are isRequired: true", () => {
    const sliders = content.questions.filter((q) => q.type === "SLIDER_LIKERT");
    for (const q of sliders) {
      expect(q.isRequired).toBe(true);
    }
  });

  it("both 'Leadership Team' and 'The leadership' are distinct slider factors", () => {
    const sliders = content.questions.filter((q) => q.type === "SLIDER_LIKERT");
    const labels = sliders.map((q) => q.label);
    expect(labels).toContain("Leadership Team");
    expect(labels).toContain("The leadership");
  });

  // ── S4 MULTI_CHOICE — obstacle picker ────────────────────────────────────

  it("S4 MULTI_CHOICE has maxChoices === 3", () => {
    const mc = content.questions.find((q) => q.type === "MULTI_CHOICE");
    expect(mc).toBeDefined();
    expect((mc as { maxChoices: number }).maxChoices).toBe(3);
  });

  it("MULTI_CHOICE has exactly 16 options", () => {
    const mc = content.questions.find((q) => q.type === "MULTI_CHOICE");
    expect(mc).toBeDefined();
    expect((mc as { options: unknown[] }).options).toHaveLength(16);
  });

  it("MULTI_CHOICE is isRequired: false", () => {
    const mc = content.questions.find((q) => q.type === "MULTI_CHOICE");
    expect(mc!.isRequired).toBe(false);
  });

  it("MULTI_CHOICE option keys are unique", () => {
    const mc = content.questions.find((q) => q.type === "MULTI_CHOICE");
    const options = (mc as { options: Array<{ key: string }> }).options;
    const keys = options.map((o) => o.key);
    expect(new Set(keys).size).toBe(keys.length);
  });

  // ── S5 Obstacles Explained — 16 optional + 2 required ───────────────────

  it("S5 has exactly 18 questions (16 optional why-TEXT + 2 required)", () => {
    const s5Qs = content.questions.filter(
      (q) => q.sectionStableKey === "S5_explained"
    );
    expect(s5Qs).toHaveLength(18);
  });

  it("S5 has exactly 16 optional TEXT 'Why is ... a hindrance?' questions", () => {
    const whyQs = content.questions.filter(
      (q) =>
        q.sectionStableKey === "S5_explained" &&
        q.type === "TEXT" &&
        !q.isRequired
    );
    expect(whyQs).toHaveLength(16);
    for (const q of whyQs) {
      expect(q.label).toMatch(/^Why is .+ a hindrance\?$/);
    }
  });

  it("S5 has exactly 2 required TEXT questions (other factor + change one thing)", () => {
    const requiredQs = content.questions.filter(
      (q) => q.sectionStableKey === "S5_explained" && q.isRequired === true
    );
    expect(requiredQs).toHaveLength(2);
  });

  it("S5 optional why-TEXT stableKeys follow S5_why_{factor} pattern", () => {
    const whyQs = content.questions.filter(
      (q) =>
        q.sectionStableKey === "S5_explained" &&
        !q.isRequired
    );
    for (const q of whyQs) {
      expect(q.stableKey).toMatch(/^S5_why_/);
    }
  });

  // ── S6 Focus Areas ───────────────────────────────────────────────────────

  it("S6 has exactly 1 NUMBER (rehire %) + 14 TEXT (all required)", () => {
    const s6Qs = content.questions.filter(
      (q) => q.sectionStableKey === "S6_focus"
    );
    expect(s6Qs).toHaveLength(15);
    const nums = s6Qs.filter((q) => q.type === "NUMBER");
    expect(nums).toHaveLength(1);
    expect(nums[0].isRequired).toBe(false);
    const texts = s6Qs.filter((q) => q.type === "TEXT");
    expect(texts).toHaveLength(14);
    for (const q of texts) {
      expect(q.isRequired).toBe(true);
    }
  });

  // ── Scoring config — neutral tier, NO fabricated Developing/Building/Scaling
  it("scoringConfig.tierMetric === 'overallAvg'", () => {
    expect(content.scoringConfig.tierMetric).toBe("overallAvg");
  });

  it("scoringConfig.passThreshold === 0", () => {
    expect(content.scoringConfig.passThreshold).toBe(0);
  });

  it("scoringConfig has exactly 1 tier (neutral Submitted)", () => {
    expect(content.scoringConfig.tiers).toHaveLength(1);
  });

  it("single tier covers full 1-3 slider range with label 'Submitted'", () => {
    const tier = content.scoringConfig.tiers[0];
    expect(tier.minMetric).toBe(1);
    expect(tier.maxMetric).toBe(3);
    expect(tier.label).toBe("Submitted");
  });

  it("no tier is labeled Developing, Building, or Scaling", () => {
    const fabricatedLabels = ["Developing", "Building", "Scaling"];
    for (const tier of content.scoringConfig.tiers) {
      expect(fabricatedLabels).not.toContain(tier.label);
    }
  });

  // ── Stable key uniqueness ────────────────────────────────────────────────

  it("all question stableKeys are unique", () => {
    const keys = content.questions.map((q) => q.stableKey);
    const uniqueKeys = new Set(keys);
    expect(uniqueKeys.size).toBe(keys.length);
  });

  it("every question's sectionStableKey resolves to an existing section", () => {
    const sectionKeys = new Set(content.sections.map((s) => s.stableKey));
    for (const q of content.questions) {
      expect(sectionKeys.has(q.sectionStableKey)).toBe(true);
    }
  });

  // ── Verbatim label fixture ───────────────────────────────────────────────

  it("question labels in order match the committed fixture (lva-labels.json)", () => {
    const actualLabels = content.questions.map((q) => q.label);
    expect(actualLabels).toEqual(expectedLabels);
  });

  // ── Scoring schema parse (engine contract) ───────────────────────────────

  it("passes TemplateVersionForScoringSchema.parse() without throwing", () => {
    expect(() => {
      TemplateVersionForScoringSchema.parse({
        questions: content.questions,
        sections: content.sections,
        scoringConfig: content.scoringConfig,
      });
    }).not.toThrow();
  });
});
