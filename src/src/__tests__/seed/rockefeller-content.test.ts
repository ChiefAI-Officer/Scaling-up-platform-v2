/**
 * Verbatim-guard test for buildRockefellerContent().
 *
 * This test suite is the source-of-truth lock for Rockefeller content:
 * any accidental mutation to labels, section names, scale anchors, or
 * scoring messages will be caught here before it reaches the DB.
 */

import {
  buildRockefellerContent,
  type RockefellerContent,
} from "../../../prisma/seed-rockefeller-assessment";
import expectedLabels from "./fixtures/rockefeller-labels.json";

const EXPECTED_SCALE = { min: 0, max: 3, step: 1, anchorMin: "", anchorMax: "" };

const EXPECTED_SCORING_MESSAGES = [
  "That is a very low overall score.",
  "You're doing quite okay, and have a lot to improve further upon.",
  "That is a great overall score.",
];

// Verbatim section intro-slide copy (body text rendered under the section
// name on the one-section pager). Indexed S1..S10 by section order.
const EXPECTED_SECTION_DESCRIPTIONS = [
  "A healthy, aligned leadership team is the foundation for scaling. Rate how well your executive team trusts one another, debates openly, and operates as a genuine team.",
  "Rate how clearly the team is aligned on the single most important priority for this quarter — and whether everyone could actually name it.",
  "A predictable meeting rhythm keeps information moving quickly. Rate how well your daily, weekly, monthly, and quarterly cadence is working.",
  "Every function and process should have one clear owner. Rate how completely accountability is assigned across the organization.",
  "Frontline employees see obstacles and opportunities first. Rate how consistently you collect and act on their input.",
  "Customer insight should be as timely and rigorous as your financials. Rate how well you gather, analyze, and act on customer feedback.",
  "Core Values and Purpose should guide real decisions, not just sit on a wall. Rate how 'alive' they are in day-to-day work.",
  "Everyone should describe the company's strategy the same way. Rate how clearly the strategy is understood across the team.",
  "People do their best when they know whether they're winning. Rate whether employees can quantitatively tell if they had a good day or week.",
  "Visible plans and metrics keep everyone rowing in the same direction. Rate how transparent your plans and performance are to the whole company.",
];

describe("buildRockefellerContent()", () => {
  let content: RockefellerContent;

  beforeAll(() => {
    content = buildRockefellerContent();
  });

  it("returns exactly 10 sections", () => {
    expect(content.sections).toHaveLength(10);
  });

  it("returns exactly 40 questions", () => {
    expect(content.questions).toHaveLength(40);
  });

  it("every question has type SLIDER_LIKERT", () => {
    for (const q of content.questions) {
      expect(q.type).toBe("SLIDER_LIKERT");
    }
  });

  it("every question scale deep-equals { min:0, max:3, step:1, anchorMin:'', anchorMax:'' }", () => {
    for (const q of content.questions) {
      expect(q.scale).toEqual(EXPECTED_SCALE);
    }
  });

  it("no question has a scaleLabels property", () => {
    for (const q of content.questions) {
      expect("scaleLabels" in q).toBe(false);
    }
  });

  it("Q1_1 label ends with 'styles' (no trailing period)", () => {
    const q1_1 = content.questions.find((q) => q.stableKey === "Q1_1");
    expect(q1_1).toBeDefined();
    expect(q1_1!.label).toMatch(/styles$/);
    expect(q1_1!.label).not.toMatch(/styles\.$/);
  });

  it("section 7 name uses straight ASCII double-quotes around 'alive'", () => {
    const s7 = content.sections.find((s) => s.stableKey === "S7");
    expect(s7).toBeDefined();
    expect(s7!.name).toContain('"alive"');
    // Must NOT use smart/curly quotes or single quotes around alive
    expect(s7!.name).not.toContain("'alive'");
  });

  it("every section has a non-empty description (intro-slide copy)", () => {
    for (const s of content.sections) {
      expect(typeof s.description).toBe("string");
      expect(s.description!.length).toBeGreaterThan(0);
    }
  });

  it("section descriptions in order (S1..S10) match the verbatim copy", () => {
    const actual = content.sections
      .slice()
      .sort((a, b) => a.sortOrder - b.sortOrder)
      .map((s) => s.description);
    expect(actual).toEqual(EXPECTED_SECTION_DESCRIPTIONS);
  });

  it("scoringConfig.tierMetric === 'countAchieved'", () => {
    expect(content.scoringConfig.tierMetric).toBe("countAchieved");
  });

  it("scoringConfig.passThreshold === 2", () => {
    expect(content.scoringConfig.passThreshold).toBe(2);
  });

  it("scoringConfig.tiers messages match verbatim (3 tiers)", () => {
    const messages = content.scoringConfig.tiers.map((t) => t.message);
    expect(messages).toEqual(EXPECTED_SCORING_MESSAGES);
  });

  it("question labels in order match the committed fixture", () => {
    const actualLabels = content.questions.map((q) => q.label);
    expect(actualLabels).toEqual(expectedLabels);
  });

  it("all stableKeys use Q{section}_{position} pattern", () => {
    for (const q of content.questions) {
      expect(q.stableKey).toMatch(/^Q\d+_\d+$/);
    }
  });

  it("question sortOrders are unique and sequential from 1..40", () => {
    const orders = content.questions.map((q) => q.sortOrder).sort((a, b) => a - b);
    expect(orders).toEqual(Array.from({ length: 40 }, (_, i) => i + 1));
  });

  it("every question's sectionStableKey resolves to an existing section", () => {
    const sectionKeys = new Set(content.sections.map((s) => s.stableKey));
    for (const q of content.questions) {
      expect(sectionKeys.has(q.sectionStableKey)).toBe(true);
    }
  });

  it("alias is 'RockHabits'", () => {
    expect(content.alias).toBe("RockHabits");
  });

  it("language is 'enUS'", () => {
    expect(content.language).toBe("enUS");
  });

  it("reportConfig is null", () => {
    expect(content.reportConfig).toBeNull();
  });
});
