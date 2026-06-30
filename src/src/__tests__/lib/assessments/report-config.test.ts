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
    for (const a of ["five-dysfunctions", "scaling-up-quick", "nope", null, undefined]) {
      expect(reportConfigFor(a)).toEqual({
        reportType: "scored",
        showScoreTable: true,
        showTier: true,
      });
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
});
