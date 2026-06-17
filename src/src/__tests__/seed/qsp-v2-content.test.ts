/**
 * Verbatim-guard + schema-validation tests for buildQspV2Content().
 *
 * Content sourced verbatim from adversarially-verified transcription of 14
 * Esperto survey screenshots (image9–image22) embedded in:
 *   "From Jeff/APP_scaling up assessemnt/APP_qtr session prep v2/qtr session prep v2.xlsx"
 * image1–8 are the Add-Campaign wizard + invitation email — skipped.
 * Confirmed against three personal report PDFs + one Group report PDF.
 *
 * Any accidental mutation to labels, section names, scale shapes, scoring
 * config, or question counts will be caught here before it reaches the DB.
 */

import {
  buildQspV2Content,
  type QspV2Content,
} from "../../../prisma/seed-qsp-v2-assessment";
import { TemplateVersionForScoringSchema } from "../../lib/assessments/scoring";
import expectedLabels from "./fixtures/qsp-v2-labels.json";

const EXPECTED_SLIDER_SCALE = {
  min: 1,
  max: 10,
  step: 1,
  anchorMin: "",
  anchorMax: "",
};

describe("buildQspV2Content()", () => {
  let content: QspV2Content;

  beforeAll(() => {
    content = buildQspV2Content();
  });

  // ── Basic shape ──────────────────────────────────────────────────────────

  it("alias is 'qsp-v2'", () => {
    expect(content.alias).toBe("qsp-v2");
  });

  it("language is 'enUS'", () => {
    expect(content.language).toBe("enUS");
  });

  it("reportConfig is null", () => {
    expect(content.reportConfig).toBeNull();
  });

  // ── Section count ────────────────────────────────────────────────────────

  it("returns exactly 5 sections (Parts 1-5)", () => {
    expect(content.sections).toHaveLength(5);
  });

  it("section sortOrders are unique and sequential from 1..5", () => {
    const orders = content.sections
      .map((s) => s.sortOrder)
      .sort((a, b) => a - b);
    expect(orders).toEqual([1, 2, 3, 4, 5]);
  });

  // ── Question count ───────────────────────────────────────────────────────

  it("returns exactly 22 questions", () => {
    expect(content.questions).toHaveLength(22);
  });

  it("question sortOrders are unique and sequential from 1..22", () => {
    const orders = content.questions
      .map((q) => q.sortOrder)
      .sort((a, b) => a - b);
    expect(orders).toEqual(Array.from({ length: 22 }, (_, i) => i + 1));
  });

  // ── Type breakdown ───────────────────────────────────────────────────────

  it("contains exactly 1 NUMBER question (P1 overall rating)", () => {
    const count = content.questions.filter((q) => q.type === "NUMBER").length;
    expect(count).toBe(1);
  });

  it("contains exactly 6 SLIDER_LIKERT questions (5 P1 matrix + 1 P2)", () => {
    const count = content.questions.filter(
      (q) => q.type === "SLIDER_LIKERT"
    ).length;
    expect(count).toBe(6);
  });

  it("contains exactly 15 TEXT questions", () => {
    const count = content.questions.filter((q) => q.type === "TEXT").length;
    expect(count).toBe(15);
  });

  // ── P1 matrix: exactly 5 sliders, none matches /you have performed/ ──────

  it("P1 matrix has exactly 5 SLIDER_LIKERT questions in section P1_retrospective", () => {
    const p1Sliders = content.questions.filter(
      (q) => q.type === "SLIDER_LIKERT" && q.sectionStableKey === "P1_retrospective"
    );
    expect(p1Sliders).toHaveLength(5);
  });

  it("no P1 slider label matches /you have performed/i", () => {
    const p1Sliders = content.questions.filter(
      (q) => q.type === "SLIDER_LIKERT" && q.sectionStableKey === "P1_retrospective"
    );
    for (const q of p1Sliders) {
      expect(q.label).not.toMatch(/you have performed/i);
    }
  });

  it("P1 slider labels use 'rocks' not 'priorities'", () => {
    const rocksQuestion = content.questions.find(
      (q) => q.stableKey === "P1_rate_success_rocks"
    );
    expect(rocksQuestion).toBeDefined();
    expect(rocksQuestion!.label).toContain("rocks");
    expect(rocksQuestion!.label).not.toContain("priorities");
  });

  // ── No department/methodology questions ─────────────────────────────────

  it("no question label contains 'your department should'", () => {
    for (const q of content.questions) {
      expect(q.label).not.toMatch(/your department should/i);
    }
  });

  it("no question label contains 'methodology now serving'", () => {
    for (const q of content.questions) {
      expect(q.label).not.toMatch(/methodology now serving/i);
    }
  });

  it("no question label contains 'Rockefeller Habits'", () => {
    for (const q of content.questions) {
      expect(q.label).not.toMatch(/Rockefeller Habits/i);
    }
  });

  // ── #26: no '(with 1 decimal)' suffix; scale is integer (step:1) ──────────

  it("no question label mentions decimals (#26 — scale is integer, step:1)", () => {
    for (const q of content.questions) {
      expect(q.label).not.toMatch(/with 1 decimal/i);
    }
  });

  it("P1 overall-rating label is exactly 'How would you rate the past Quarter? (1-10)' (#26)", () => {
    const labels = content.questions.map((q) => q.label);
    expect(labels).toContain("How would you rate the past Quarter? (1-10)");
  });

  // ── Slider scale ─────────────────────────────────────────────────────────

  it("every SLIDER_LIKERT scale deep-equals { min:1, max:10, step:1, anchorMin:'', anchorMax:'' }", () => {
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

  // ── Core-values stories 3-box constraint ─────────────────────────────────

  it("core-values stories = exactly 3 TEXT questions with stable keys P1_core_values_story_1/2/3", () => {
    const storyKeys = [
      "P1_core_values_story_1",
      "P1_core_values_story_2",
      "P1_core_values_story_3",
    ];
    for (const key of storyKeys) {
      const q = content.questions.find((x) => x.stableKey === key);
      expect(q).toBeDefined();
      expect(q!.type).toBe("TEXT");
    }
  });

  it("the 3 core-values story questions are all isRequired: false (optional — no asterisk in source)", () => {
    const storyKeys = [
      "P1_core_values_story_1",
      "P1_core_values_story_2",
      "P1_core_values_story_3",
    ];
    for (const key of storyKeys) {
      const q = content.questions.find((x) => x.stableKey === key);
      expect(q!.isRequired).toBe(false);
    }
  });

  // ── Start/Stop/Continue: 3 company-level TEXT only, no department variants ─

  it("start/stop/continue = exactly 3 company-level TEXT questions", () => {
    const sscKeys = ["P1_company_start", "P1_company_stop", "P1_company_continue"];
    for (const key of sscKeys) {
      const q = content.questions.find((x) => x.stableKey === key);
      expect(q).toBeDefined();
      expect(q!.type).toBe("TEXT");
    }
  });

  it("no question stableKey contains 'department'", () => {
    for (const q of content.questions) {
      expect(q.stableKey).not.toMatch(/department/i);
    }
  });

  // ── P2 Personal Check-in ──────────────────────────────────────────────────

  it("P2 has exactly 1 SLIDER_LIKERT and 1 TEXT", () => {
    const p2Sliders = content.questions.filter(
      (q) => q.type === "SLIDER_LIKERT" && q.sectionStableKey === "P2_personal_checkin"
    );
    const p2Text = content.questions.filter(
      (q) => q.type === "TEXT" && q.sectionStableKey === "P2_personal_checkin"
    );
    expect(p2Sliders).toHaveLength(1);
    expect(p2Text).toHaveLength(1);
  });

  it("P2 explain includes 'How are you truly feeling about your work right now?'", () => {
    const q = content.questions.find((x) => x.stableKey === "P2_checkin_explain");
    expect(q).toBeDefined();
    expect(q!.label).toContain("How are you truly feeling about your work right now?");
  });

  // ── P3 Growth Challenge ───────────────────────────────────────────────────

  it("P3 has exactly 3 TEXT questions", () => {
    const p3 = content.questions.filter(
      (q) => q.sectionStableKey === "P3_growth_challenge"
    );
    expect(p3).toHaveLength(3);
    for (const q of p3) {
      expect(q.type).toBe("TEXT");
    }
  });

  it("P3 includes 'Where do you believe the solution lies?' (stableKey P3_solution)", () => {
    const q = content.questions.find((x) => x.stableKey === "P3_solution");
    expect(q).toBeDefined();
    expect(q!.label).toBe("Where do you believe the solution lies?");
  });

  it("P3 includes 'biggest growth challenge' (not 'biggest challenge' alone)", () => {
    const q = content.questions.find((x) => x.stableKey === "P3_growth_challenge");
    expect(q).toBeDefined();
    expect(q!.label).toContain("biggest growth challenge");
  });

  // ── P4 Focus ─────────────────────────────────────────────────────────────

  it("P4 has exactly 2 TEXT questions", () => {
    const p4 = content.questions.filter(
      (q) => q.sectionStableKey === "P4_focus"
    );
    expect(p4).toHaveLength(2);
    for (const q of p4) {
      expect(q.type).toBe("TEXT");
    }
  });

  it("P4 Critical Number label starts with 'Critical Number Identification:'", () => {
    const q = content.questions.find((x) => x.stableKey === "P4_critical_number");
    expect(q).toBeDefined();
    expect(q!.label).toMatch(/^Critical Number Identification:/);
  });

  it("P4 Top Priorities label starts with 'Top Priorities:'", () => {
    const q = content.questions.find((x) => x.stableKey === "P4_top_priorities");
    expect(q).toBeDefined();
    expect(q!.label).toMatch(/^Top Priorities:/);
  });

  // ── P5 Closing ───────────────────────────────────────────────────────────

  it("P5 has exactly 1 TEXT question and it is optional", () => {
    const p5 = content.questions.filter(
      (q) => q.sectionStableKey === "P5_closing"
    );
    expect(p5).toHaveLength(1);
    expect(p5[0].type).toBe("TEXT");
    expect(p5[0].isRequired).toBe(false);
  });

  it("P5 closing label is verbatim from image21", () => {
    const q = content.questions.find((x) => x.stableKey === "P5_closing");
    expect(q).toBeDefined();
    expect(q!.label).toBe(
      "Any other remarks, thoughts, concerns, or ideas for the upcoming Quarterly session?"
    );
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

  // ── Required markers per screenshots ─────────────────────────────────────

  it("P1_overall_rating is isRequired: true (red * on image10)", () => {
    const q = content.questions.find((x) => x.stableKey === "P1_overall_rating");
    expect(q!.isRequired).toBe(true);
  });

  it("P1_rating_explanation is isRequired: true (red * on image11)", () => {
    const q = content.questions.find((x) => x.stableKey === "P1_rating_explanation");
    expect(q!.isRequired).toBe(true);
  });

  it("P1_leadership_rocks_view is isRequired: true (red * on image13)", () => {
    const q = content.questions.find((x) => x.stableKey === "P1_leadership_rocks_view");
    expect(q!.isRequired).toBe(true);
  });

  it("P2_checkin_slider is isRequired: true (red * on image18)", () => {
    const q = content.questions.find((x) => x.stableKey === "P2_checkin_slider");
    expect(q!.isRequired).toBe(true);
  });

  it("P2_checkin_explain is isRequired: true (red * on image18)", () => {
    const q = content.questions.find((x) => x.stableKey === "P2_checkin_explain");
    expect(q!.isRequired).toBe(true);
  });

  it("P3 questions are all isRequired: true (red * on image19)", () => {
    const p3 = content.questions.filter(
      (q) => q.sectionStableKey === "P3_growth_challenge"
    );
    for (const q of p3) {
      expect(q.isRequired).toBe(true);
    }
  });

  // ── Section membership ───────────────────────────────────────────────────

  it("every question's sectionStableKey resolves to an existing section", () => {
    const sectionKeys = new Set(content.sections.map((s) => s.stableKey));
    for (const q of content.questions) {
      expect(sectionKeys.has(q.sectionStableKey)).toBe(true);
    }
  });

  // ── Stable key uniqueness ────────────────────────────────────────────────

  it("all question stableKeys are unique", () => {
    const keys = content.questions.map((q) => q.stableKey);
    const uniqueKeys = new Set(keys);
    expect(uniqueKeys.size).toBe(keys.length);
  });

  it("all section stableKeys are unique", () => {
    const keys = content.sections.map((s) => s.stableKey);
    const uniqueKeys = new Set(keys);
    expect(uniqueKeys.size).toBe(keys.length);
  });

  // ── Verbatim label fixture ───────────────────────────────────────────────

  it("question labels in sortOrder sequence match the committed fixture (qsp-v2-labels.json)", () => {
    const sorted = [...content.questions].sort((a, b) => a.sortOrder - b.sortOrder);
    const actualLabels = sorted.map((q) => q.label);
    expect(actualLabels).toEqual(expectedLabels);
  });

  // ── Scoring schema parse (engine contract) ───────────────────────────────
  //
  // TemplateVersionForScoringSchema validates the discriminated-union question
  // shape (SLIDER_LIKERT with scale, TEXT/NUMBER without), the section shape,
  // and the scoringConfig. Passing here means scoreSubmission() will accept
  // this template version without throwing.

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
