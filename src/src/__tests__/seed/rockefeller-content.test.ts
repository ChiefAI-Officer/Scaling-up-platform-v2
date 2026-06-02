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
