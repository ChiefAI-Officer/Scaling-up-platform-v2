import { buildTestModeDisplay } from "@/components/admin/template-editor/test-mode-display";
import type { ScoreResult } from "@/lib/assessments/scoring";

// Real ScoreResult sub-type field names (PerSectionResult / TierResolution /
// ResolvedFinding) so this fixture also documents correct usage for the drawer.
const base: ScoreResult = {
  perQuestion: [],
  perSection: [
    { stableKey: "S1", name: "Section 1", totalPoints: 5, averagePoints: 2.5, achievedCount: 1, totalCount: 2 },
  ],
  overallTotal: 5,
  overallAverage: 2.5,
  countAchieved: 1,
  tier: { label: "Good", message: "Nice work" },
  tierMetricValue: 2.5,
  unansweredKeys: [],
  findings: [
    { stableKey: "S1_q1", questionType: "SLIDER_LIKERT", questionLabel: "Q1", text: "Do X" },
  ],
};

describe("buildTestModeDisplay", () => {
  it("scored alias (scaling-up-full): scored report, score table shown, tier hidden per config; findings present", () => {
    const d = buildTestModeDisplay(base, "scaling-up-full");
    expect(d.reportType).toBe("scored");
    expect(d.showScoreTable).toBe(true);
    expect(d.showTier).toBe(false);
    expect(d.findings).toHaveLength(1); // findings always surfaced
  });

  it("qualitative alias (qsp-v1) → reportType qualitative", () => {
    const d = buildTestModeDisplay(base, "qsp-v1");
    expect(d.reportType).toBe("qualitative");
  });

  it("unknown/new alias → default (scored)", () => {
    expect(buildTestModeDisplay(base, "brand-new-template").reportType).toBe("scored");
  });

  it("reports unanswered count for the partial-tier honesty note", () => {
    const partial = { ...base, unansweredKeys: ["S1_q2", "S1_q3"] };
    expect(buildTestModeDisplay(partial, "scaling-up-full").unansweredCount).toBe(2);
  });
});
