import {
  FRIENDLY_SCORING_COPY,
  formatFriendlyTilingIssue,
  friendlyMetricLabel,
} from "@/components/admin/template-editor/scoring-tier-copy";

describe("scoring-tier-copy", () => {
  it("uses fixed plain-language labels for each scoring metric", () => {
    expect(friendlyMetricLabel("countAchieved")).toBe("Questions passed");
    expect(friendlyMetricLabel("overallTotal")).toBe("Sum of all answers");
    expect(friendlyMetricLabel("overallAvg")).toBe(
      "Average across all questions",
    );
  });

  it("exposes the approved scoring copy", () => {
    expect(FRIENDLY_SCORING_COPY).toMatchObject({
      title: "How results are calculated",
      overallTiers: "Overall result tiers",
      areaTiers: "Results by area",
      noMaximum: "No maximum",
    });
  });

  it("formats each structured tiling issue without engine vocabulary", () => {
    const surfaceLabel = "Overall result tiers";
    const formatted = [
      formatFriendlyTilingIssue(
        {
          code: "EMPTY_TIERS",
          path: [],
          message: "tiers must contain at least one entry",
          details: { reason: "empty tiers" },
        },
        surfaceLabel,
      ),
      formatFriendlyTilingIssue(
        {
          code: "FIRST_RANGE_START",
          path: [0, "minMetric"],
          message: "first tier minMetric must equal domain min (0); got 1",
          details: {
            reason: "first tier minMetric must equal domain min",
            domainMin: 0,
            firstTierMin: 1,
          },
        },
        surfaceLabel,
      ),
      formatFriendlyTilingIssue(
        {
          code: "EARLY_NO_MAXIMUM",
          path: [0, "maxMetric"],
          message: "only the highest tier may omit maxMetric (open-ended above)",
          details: { tierLabel: "Low", tierIndex: 0 },
        },
        surfaceLabel,
      ),
      formatFriendlyTilingIssue(
        {
          code: "RANGE_GAP",
          path: [1, "minMetric"],
          message: "gap between tiers",
          details: {
            tierA: "Low",
            tierB: "High",
            aMax: 4,
            bMin: 6,
            expectedNextMin: 5,
          },
        },
        surfaceLabel,
      ),
      formatFriendlyTilingIssue(
        {
          code: "RANGE_OVERLAP",
          path: [1, "minMetric"],
          message: "overlap between tiers",
          details: {
            tierA: "Low",
            tierB: "High",
            aMax: 6,
            bMin: 5,
            expectedNextMin: 7,
          },
        },
        surfaceLabel,
      ),
      formatFriendlyTilingIssue(
        {
          code: "LAST_RANGE_END",
          path: [0, "maxMetric"],
          message: "last tier maxMetric must equal domain max (10)",
          details: { lastTierLabel: "Only", lastTierMax: 9, domainMax: 10 },
        },
        surfaceLabel,
      ),
      formatFriendlyTilingIssue(
        {
          code: "LAST_RANGE_END",
          path: [0, "maxMetric"],
          message: "last tier maxMetric must equal domain max (10)",
          details: { lastTierLabel: "Only", lastTierMax: 11, domainMax: 10 },
        },
        surfaceLabel,
      ),
    ];

    expect(formatted).toEqual([
      "Overall result tiers: add at least one tier.",
      "Overall result tiers: the first range must start at 0.",
      'Overall result tiers: "Low" can have no maximum only when it is the last range.',
      'Overall result tiers: "Low" ends at 4; "High" must start at 5.',
      'Overall result tiers: "Low" ends at 6; "High" starts at 5.',
      "Overall result tiers: the last range must end at 10 or have no maximum.",
      "Overall result tiers: the last range must end at 10 or have no maximum.",
    ]);

    for (const message of formatted) {
      expect(message).not.toMatch(/minMetric|maxMetric|domain min|tier resolution/i);
    }
  });
});
