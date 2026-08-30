import { SUMMARY_REPORT_REGISTRY } from "@/lib/assessments/summary-reports/registry";
import { resolveSummaryReportingState } from "@/lib/assessments/summary-reports/flags";

describe("SUMMARY_REPORT_REGISTRY", () => {
  it("contains the approved seven-report catalog in order", () => {
    expect(SUMMARY_REPORT_REGISTRY).toEqual([
      {
        type: "SCALING_CEO_FULL",
        templateAliases: ["scaling-up-full"],
        label: "Scaling Up · CEO Full",
        description: "Compare one CEO with an explicitly selected leadership team.",
        implemented: true,
        roles: [
          { role: "CEO", min: 1, max: 1 },
          { role: "TEAM", min: 0, max: null },
        ],
        hasRemarksStep: false,
        rendererVersion: "scaling-ceo-full-pdf-v1",
      },
      {
        type: "SCALING_CONDENSED_CEO",
        templateAliases: ["scaling-up-full"],
        label: "Scaling Up · Condensed CEO",
        description: "Create a two-page CEO score and peer appendix.",
        implemented: true,
        roles: [{ role: "CEO", min: 1, max: 1 }],
        hasRemarksStep: false,
        rendererVersion: "scaling-condensed-ceo-html-v1",
      },
      {
        type: "SCALING_SELF_COMPARISON",
        templateAliases: ["scaling-up-full"],
        label: "Scaling Up · Self Comparison",
        description: "Compare one current report with one earlier report for the same person.",
        implemented: false,
        roles: [
          { role: "FOCUS", min: 1, max: 1 },
          { role: "EARLIER", min: 1, max: 1 },
        ],
        hasRemarksStep: false,
        rendererVersion: "scaling-self-comparison-pdf-v1",
      },
      {
        type: "LVA_CEO_FULL",
        templateAliases: ["leadership-vision-alignment"],
        label: "Leadership Vision Alignment · CEO Full",
        description: "Combine one CEO and selected team responses into the full alignment report.",
        implemented: false,
        roles: [
          { role: "CEO", min: 1, max: 1 },
          { role: "TEAM", min: 0, max: null },
        ],
        hasRemarksStep: false,
        rendererVersion: "lva-ceo-full-pdf-v1",
      },
      {
        type: "QSP_V1_CEO_FULL",
        templateAliases: ["qsp-v1"],
        label: "Quarterly Session Preparation v1 · CEO Full",
        description: "Combine one CEO and selected team responses into the v1 quarterly summary.",
        implemented: false,
        roles: [
          { role: "CEO", min: 1, max: 1 },
          { role: "TEAM", min: 0, max: null },
        ],
        hasRemarksStep: true,
        rendererVersion: "qsp-v1-ceo-full-pdf-v1",
      },
      {
        type: "QSP_V2_CEO_FULL",
        templateAliases: ["qsp-v2"],
        label: "Quarterly Session Preparation v2 · CEO Full",
        description: "Combine one CEO and selected team responses into the v2 quarterly summary.",
        implemented: false,
        roles: [
          { role: "CEO", min: 1, max: 1 },
          { role: "TEAM", min: 0, max: null },
        ],
        hasRemarksStep: true,
        rendererVersion: "qsp-v2-ceo-full-pdf-v1",
      },
      {
        type: "ROCKEFELLER_FULL",
        templateAliases: ["RockHabits"],
        label: "Rockefeller Habits · Full Report",
        description: "Combine one or more team reports into the five-page Rockefeller Habits summary.",
        implemented: false,
        roles: [{ role: "TEAM", min: 1, max: null }],
        hasRemarksStep: false,
        rendererVersion: "rockefeller-full-pdf-v1",
      },
    ]);
  });

  it("uses unique identifiers and exposes only the two implemented Scaling report types", () => {
    const types = SUMMARY_REPORT_REGISTRY.map((definition) => definition.type);

    expect(new Set(types).size).toBe(7);
    expect(SUMMARY_REPORT_REGISTRY.filter((definition) => definition.implemented)).toEqual([
      expect.objectContaining({ type: "SCALING_CEO_FULL" }),
      expect.objectContaining({ type: "SCALING_CONDENSED_CEO" }),
    ]);
  });
});

describe("resolveSummaryReportingState", () => {
  const campaignId = "campaign-allowed";

  function resolve(overrides: NodeJS.ProcessEnv = {}) {
    return resolveSummaryReportingState(overrides, campaignId);
  }

  it("defaults off when flags are missing or false", () => {
    expect(resolve()).toEqual({ enabled: false, killed: false });
    expect(resolve({ SUMMARY_REPORTING_ENABLED: "false" })).toEqual({
      enabled: false,
      killed: false,
    });
  });

  it("enables globally for each accepted truthy value", () => {
    for (const value of ["1", "true", "TRUE", "yes"]) {
      expect(resolve({ SUMMARY_REPORTING_ENABLED: value })).toEqual({
        enabled: true,
        killed: false,
      });
    }
  });

  it("enables an exact trimmed campaign ID in the comma-separated canary", () => {
    expect(
      resolve({ SUMMARY_REPORTING_CANARY: "another-campaign, campaign-allowed ,third-campaign" }),
    ).toEqual({ enabled: true, killed: false });
  });

  it("does not treat coach or organization IDs as a campaign canary match", () => {
    expect(resolve({ SUMMARY_REPORTING_CANARY: "coach-allowed,org-allowed" })).toEqual({
      enabled: false,
      killed: false,
    });
  });

  it("lets kill override both global and canary enablement", () => {
    expect(
      resolve({
        SUMMARY_REPORTING_ENABLED: "1",
        SUMMARY_REPORTING_CANARY: campaignId,
        SUMMARY_REPORTING_KILL: "yes",
      }),
    ).toEqual({ enabled: false, killed: true });
  });
});
