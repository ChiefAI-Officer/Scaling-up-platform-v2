import { reportConfigFor, DEFAULT_REPORT_CONFIG } from "@/lib/assessments/report-config";

describe("reportConfigFor", () => {
  it("Rockefeller stays scored but hides the score table (#24)", () => {
    expect(reportConfigFor("RockHabits")).toEqual({ reportType: "scored", showScoreTable: false });
  });
  it("QSP v1/v2 + LVA are qualitative (#27/#28/#30/#31)", () => {
    for (const a of ["qsp-v1", "qsp-v2", "leadership-vision-alignment"]) {
      expect(reportConfigFor(a).reportType).toBe("qualitative");
    }
  });
  it("keep-set + unknown + null fall back to scored + table", () => {
    for (const a of ["five-dysfunctions", "scaling-up-full", "scaling-up-quick", "nope", null, undefined]) {
      expect(reportConfigFor(a)).toEqual({ reportType: "scored", showScoreTable: true });
    }
    expect(DEFAULT_REPORT_CONFIG).toEqual({ reportType: "scored", showScoreTable: true });
  });
});
