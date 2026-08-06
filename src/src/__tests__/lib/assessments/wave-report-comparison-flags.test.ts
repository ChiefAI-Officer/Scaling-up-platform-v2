import {
  isReportComparisonEnabled,
  isReportComparisonRolloutActive,
} from "@/lib/assessments/wave-report-comparison-flags";

describe("isReportComparisonEnabled", () => {
  afterEach(() => {
    delete process.env.WAVE_RC_REPORT_COMPARISON_ENABLED;
    delete process.env.WAVE_RC_REPORT_COMPARISON_CANARY;
    delete process.env.WAVE_RC_REPORT_COMPARISON_KILL;
  });

  it("defaults off", () => {
    expect(isReportComparisonEnabled({ organizationId: "org-1", templateId: "tpl-1" })).toBe(false);
  });

  it("matches exact organization or template canary tokens", () => {
    process.env.WAVE_RC_REPORT_COMPARISON_CANARY = "org-1, tpl-2";
    expect(isReportComparisonEnabled({ organizationId: "org-1", templateId: "tpl-x" })).toBe(true);
    expect(isReportComparisonEnabled({ organizationId: "org-x", templateId: "tpl-2" })).toBe(true);
    expect(isReportComparisonEnabled({ organizationId: "org-10", templateId: "tpl-x" })).toBe(false);
  });

  it("lets kill override global and canary", () => {
    process.env.WAVE_RC_REPORT_COMPARISON_ENABLED = "1";
    process.env.WAVE_RC_REPORT_COMPARISON_CANARY = "org-1";
    process.env.WAVE_RC_REPORT_COMPARISON_KILL = "true";
    expect(isReportComparisonEnabled({ organizationId: "org-1", templateId: "tpl-1" })).toBe(false);
  });

  it("reports whether any global or exact-canary rollout can be active without reading campaign scope", () => {
    expect(isReportComparisonRolloutActive()).toBe(false);

    process.env.WAVE_RC_REPORT_COMPARISON_CANARY = "org-1";
    expect(isReportComparisonRolloutActive()).toBe(true);

    delete process.env.WAVE_RC_REPORT_COMPARISON_CANARY;
    process.env.WAVE_RC_REPORT_COMPARISON_ENABLED = "1";
    expect(isReportComparisonRolloutActive()).toBe(true);

    process.env.WAVE_RC_REPORT_COMPARISON_KILL = "1";
    expect(isReportComparisonRolloutActive()).toBe(false);
  });
});
