import {
  buildScalingUpQuickSuccessorReportConfig,
  buildSunHubSuccessorReportConfig,
} from "@/lib/assessments/public-marketing-presets";
import { loadPublicMarketingResultConfig } from "@/lib/assessments/public-marketing-result";

describe("public Marketing CTA successor presets", () => {
  it("preserves unrelated config and builds Quick", () => {
    const result = buildScalingUpQuickSuccessorReportConfig({ findings: { enabled: true } }) as Record<string, unknown>;
    expect(result.findings).toEqual({ enabled: true });
    expect(loadPublicMarketingResultConfig(result)?.marketingCta.presetOrigin).toBe("SCALING_UP_QUICK");
  });

  it("builds SunHub with exact four bands and Full Marketing", () => {
    const config = loadPublicMarketingResultConfig(buildSunHubSuccessorReportConfig({}));
    expect(config?.scoreBands.map((band) => [band.min, band.max])).toEqual([[0, 24], [25, 49], [50, 74], [75, 100]]);
    expect(config?.marketingCta.presetOrigin).toBe("FULL_MARKETING");
  });
});
