import { reportConfigFor, DEFAULT_REPORT_CONFIG } from "@/lib/assessments/report-config";

describe("reportConfigFor", () => {
  it("Rockefeller stays scored but hides the score table (#24)", () => {
    expect(reportConfigFor("RockHabits")).toEqual({
      reportType: "scored",
      showScoreTable: false,
      showTier: true,
    });
  });
  it("QSP v1/v2 + LVA are qualitative (#27/#28/#30/#31)", () => {
    for (const a of ["qsp-v1", "qsp-v2", "leadership-vision-alignment"]) {
      expect(reportConfigFor(a).reportType).toBe("qualitative");
    }
  });
  it("unknown + null fall back to scored + table", () => {
    for (const a of ["scaling-up-quick", "nope", null, undefined]) {
      expect(reportConfigFor(a)).toEqual({
        reportType: "scored",
        showScoreTable: true,
        showTier: true,
      });
    }
  });

  // ── #81: five-dysfunctions hides the "Talk to your coach" CTA ───────────────
  it("five-dysfunctions is scored but hides the coach CTA (#81)", () => {
    expect(reportConfigFor("five-dysfunctions")).toEqual({
      reportType: "scored",
      showScoreTable: true,
      showTier: true,
      showCoachCta: false,
    });
  });

  it("every other scored report shows the coach CTA by default (#81) — only five-dysfunctions opts out", () => {
    for (const a of ["RockHabits", "scaling-up-full", "scaling-up-quick", "nope", null, undefined]) {
      expect(reportConfigFor(a).showCoachCta).not.toBe(false);
    }
  });

  // ── Wave J Task 2: showTier field ──────────────────────────────────────────

  it("DEFAULT_REPORT_CONFIG.showTier is true (back-compat default)", () => {
    expect(DEFAULT_REPORT_CONFIG.showTier).toBe(true);
  });

  it("reportConfigFor('RockHabits').showTier is true", () => {
    expect(reportConfigFor("RockHabits").showTier).toBe(true);
  });

  it("reportConfigFor(null).showTier is true (falls back to default)", () => {
    expect(reportConfigFor(null).showTier).toBe(true);
  });

  it("scaling-up-full has showTier:false (honored by BOTH the group renderer and BrandedReport)", () => {
    expect(reportConfigFor("scaling-up-full")).toEqual({
      reportType: "scored",
      showScoreTable: true,
      showTier: false,
    });
  });

  it("gives the SunHub public quiz its source-owned result actions", () => {
    expect(reportConfigFor("sunhub-quick-quiz")).toEqual({
      reportType: "scored",
      showScoreTable: false,
      showDetailedBreakdown: false,
      showOverallMeta: false,
      showTier: true,
      publicResultActions: [
        {
          label: "Take the 32-question assessment",
          href: "https://scalinguptoolkit.com/s/ScaleUpQA",
        },
        {
          label: "Request a complimentary follow-up",
          href: "https://coaches.scalingup.com/coach-match-after-assessment-form",
        },
        {
          label: "Buy the books",
          href: "https://scalingup.com/book/",
        },
      ],
    });
  });
});
