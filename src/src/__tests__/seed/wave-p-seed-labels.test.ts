/**
 * Wave P seed label edits (Jeff July-1 quick fixes, 2026-07-02).
 *
 * Guards the three DELIBERATE departures from verbatim-Esperto copy:
 *   - QSP v2: the 3 identical core-values story labels are differentiated
 *     with "(Story N of 3)" suffixes (Jeff item #3) — stableKeys unchanged
 *     (crosswalk Q5a/b/c depends on all three).
 *   - LVA: "Leadership Team" → "Leadership team" in BOTH factor lists
 *     (Jeff item #14), matching the 13 sentence-case sibling factors.
 *     "The leadership"/"The Leadership" (item #15) remains pending.
 *   - LVA: "Growth Financing" → "Access to financing for growth" in both
 *     factor lists (July 10 row #42), with keys and factor order unchanged.
 *   - LVA: S6_core_values label replaced with Jeff's copy (item #17).
 */

import { buildQspV2Content } from "../../../prisma/seed-qsp-v2-assessment";
import { buildLvaContent } from "../../../prisma/seed-lva-assessment";

const STORY_PREFIX =
  "Which employees have demonstrated that they live the core values? Why? Share the stories.";

describe("Wave P — QSP v2 core-values story-label differentiation (Jeff #3)", () => {
  const content = buildQspV2Content();
  const storyKeys = [
    "P1_core_values_story_1",
    "P1_core_values_story_2",
    "P1_core_values_story_3",
  ] as const;

  it("all three story stableKeys are still present", () => {
    for (const key of storyKeys) {
      expect(content.questions.find((q) => q.stableKey === key)).toBeDefined();
    }
  });

  it("labels are exactly the differentiated strings", () => {
    const expected = [
      `${STORY_PREFIX} (Story 1 of 3)`,
      `${STORY_PREFIX} (Story 2 of 3)`,
      `${STORY_PREFIX} (Story 3 of 3)`,
    ];
    const actual = storyKeys.map(
      (key) => content.questions.find((q) => q.stableKey === key)!.label
    );
    expect(actual).toEqual(expected);
  });

  it("each label ends with its own '(Story N of 3)' suffix", () => {
    storyKeys.forEach((key, i) => {
      const q = content.questions.find((x) => x.stableKey === key)!;
      expect(q.label.endsWith(`(Story ${i + 1} of 3)`)).toBe(true);
    });
  });

  it("all three labels share the identical Esperto-faithful prefix", () => {
    for (const key of storyKeys) {
      const q = content.questions.find((x) => x.stableKey === key)!;
      expect(q.label.startsWith(`${STORY_PREFIX} (Story `)).toBe(true);
    }
  });
});

describe("Wave P — LVA factor sentence-casing (Jeff #14)", () => {
  const content = buildLvaContent();

  // FACTORS_FOR_MATRIX surfaces as the 16 S3 SLIDER_LIKERT labels;
  // FACTORS_FOR_CHECKBOX surfaces as the 16 S4 MULTI_CHOICE option labels.
  const matrixLabels = content.questions
    .filter((q) => q.sectionStableKey === "S3_strengths")
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .map((q) => q.label);
  const checkboxLabels = (
    content.questions.find((q) => q.stableKey === "S4_biggest_obstacles") as {
      options: Array<{ key: string; label: string }>;
    }
  ).options.map((o) => o.label);

  it("both factor lists contain 'Leadership team' (sentence case)", () => {
    expect(matrixLabels).toContain("Leadership team");
    expect(checkboxLabels).toContain("Leadership team");
  });

  it("neither factor list still contains 'Leadership Team' (old casing)", () => {
    expect(matrixLabels).not.toContain("Leadership Team");
    expect(checkboxLabels).not.toContain("Leadership Team");
  });

  it("lists are lockstep except the known 'The leadership'/'The Leadership' xlsx divergence", () => {
    expect(matrixLabels).toHaveLength(16);
    expect(checkboxLabels).toHaveLength(16);
    for (let i = 0; i < 16; i++) {
      if (matrixLabels[i] === "The leadership") {
        // Deliberate xlsx mirror (pending item #15) — must stay divergent.
        expect(checkboxLabels[i]).toBe("The Leadership");
      } else {
        expect(checkboxLabels[i]).toBe(matrixLabels[i]);
      }
    }
  });

  it("uses the approved growth-financing wording in both factor lists", () => {
    expect(matrixLabels[15]).toBe("Access to financing for growth");
    expect(checkboxLabels[15]).toBe("Access to financing for growth");
    expect(matrixLabels).not.toContain("Growth Financing");
    expect(checkboxLabels).not.toContain("Growth Financing");
  });

  it("retains the growth-financing stable keys and factor position", () => {
    const matrixQuestion = content.questions.find(
      (q) => q.stableKey === "S3_growth_financing"
    );
    const obstacleQuestion = content.questions.find(
      (q) => q.stableKey === "S4_biggest_obstacles"
    ) as { options: Array<{ key: string; label: string }> };

    expect(matrixQuestion?.sortOrder).toBe(
      content.questions.find((q) => q.stableKey === "S3_cash")!.sortOrder + 1
    );
    expect(obstacleQuestion.options[15]).toEqual({
      key: "growth_financing",
      label: "Access to financing for growth",
    });
  });

  it("updates the derived follow-up label without changing its stable key", () => {
    const whyQ = content.questions.find(
      (q) => q.stableKey === "S5_why_growth_financing"
    );
    expect(whyQ?.label).toBe(
      "Why is Access to financing for growth a hindrance?"
    );
  });

  it("the derived S5 follow-up label reads 'Why is Leadership team a hindrance?'", () => {
    const whyQ = content.questions.find(
      (q) => q.stableKey === "S5_why_leadership_team"
    );
    expect(whyQ).toBeDefined();
    expect(whyQ!.label).toBe("Why is Leadership team a hindrance?");
  });
});

describe("Wave P — LVA S6 core-values reword (Jeff #17)", () => {
  const content = buildLvaContent();

  it("S6_core_values label is exactly Jeff's copy; stableKey/shape unchanged", () => {
    const q = content.questions.find((x) => x.stableKey === "S6_core_values");
    expect(q).toBeDefined();
    expect(q!.label).toBe(
      "What are your core values? If not yet set, what do you think the top 3 should be?"
    );
    expect(q!.type).toBe("TEXT");
    expect(q!.sectionStableKey).toBe("S6_focus");
    expect(q!.isRequired).toBe(true);
  });
});
