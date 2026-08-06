import {
  REPORT_STYLE_KEYS,
  deriveReportStylePreviewCapabilities,
  getReportStyleMetadata,
  getReportStylePreviewPath,
  isReportStyleKey,
  resolveReportStylePreviewAnatomy,
} from "@/lib/assessments/report-style-registry";
import {
  effectiveReportStyle,
  resolveCampaignReportStyle,
} from "@/lib/assessments/report-style-policy";
import { classifyPresentationByTypes } from "@/lib/assessments/qualitative-report-model";

describe("report style registry", () => {
  it("exposes the three closed report styles with their presentation metadata", () => {
    expect(REPORT_STYLE_KEYS).toEqual([
      "CLASSIC",
      "EXECUTIVE_BOARDROOM",
      "MODERN_DASHBOARD",
    ]);
    expect(Object.isFrozen(REPORT_STYLE_KEYS)).toBe(true);
    expect(getReportStyleMetadata("CLASSIC")).toEqual({
      label: "Classic",
      description: "A clear, familiar report presentation.",
      paperFormat: "A4",
      rendererKey: "classic",
      previews: {
        cover: "/report-style-previews/classic/cover.webp",
        summary: "/report-style-previews/classic/summary.webp",
        detail: "/report-style-previews/classic/detail.webp",
      },
    });
    expect(getReportStyleMetadata("EXECUTIVE_BOARDROOM")).toMatchObject({
      label: "Executive Boardroom",
      description: "Editorial, restrained, and board-ready.",
      paperFormat: "US Letter",
      rendererKey: "executive-boardroom",
    });
    expect(getReportStyleMetadata("MODERN_DASHBOARD")).toMatchObject({
      label: "Modern Dashboard",
      description: "Compact, visual, and data-forward.",
      paperFormat: "US Letter",
      rendererKey: "modern-dashboard",
    });
  });

  it("recognizes only closed catalog keys", () => {
    expect(isReportStyleKey("CLASSIC")).toBe(true);
    expect(isReportStyleKey("MODERN_DASHBOARD")).toBe(true);
    expect(isReportStyleKey("classic")).toBe(false);
    expect(isReportStyleKey("FUTURE_STYLE")).toBe(false);
    expect(isReportStyleKey(undefined)).toBe(false);
  });

  it("selects preview anatomy from the canonical report family and optional content capabilities", () => {
    expect(resolveReportStylePreviewAnatomy({ templateAlias: "scaling-up-full" }))
      .toBe("scored");
    expect(resolveReportStylePreviewAnatomy({ templateAlias: "qsp-v2" }))
      .toBe("qualitative");
    expect(resolveReportStylePreviewAnatomy({
      templateAlias: "qsp-v2",
      capabilities: {
        reportType: "qualitative",
        hasMetrics: false,
        hasNarrativeResponses: true,
      },
    })).toBe("sparse-custom");
    expect(resolveReportStylePreviewAnatomy({
      templateAlias: "custom-founder-prompts",
      capabilities: {
        reportType: "scored",
        hasMetrics: false,
        hasNarrativeResponses: true,
      },
    })).toBe("sparse-custom");

    expect(deriveReportStylePreviewCapabilities({
      templateAlias: "custom-founder-prompts",
      questions: [
        { stableKey: "reflection", type: "TEXT" },
        { stableKey: "plan", type: "TEXTAREA" },
      ],
    })).toEqual({
      reportType: "scored",
      hasMetrics: false,
      hasNarrativeResponses: true,
    });
    expect(deriveReportStylePreviewCapabilities({
      templateAlias: "qsp-v2",
      questions: [
        { stableKey: "confidence", type: "SLIDER_LIKERT" },
        { stableKey: "reflection", type: "TEXT" },
      ],
    })).toEqual({
      reportType: "qualitative",
      hasMetrics: true,
      hasNarrativeResponses: true,
    });

    expect(getReportStylePreviewPath(
      "EXECUTIVE_BOARDROOM",
      "qualitative",
      "detail",
    )).toBe(
      "/report-style-previews/qualitative/executive-boardroom/detail.webp",
    );
    expect(getReportStylePreviewPath("CLASSIC", "scored", "cover")).toBe(
      "/report-style-previews/classic/cover.webp",
    );
  });

  it("does not invent metric eligibility for categorical multi-choice answers", () => {
    expect(classifyPresentationByTypes(["MULTI_CHOICE"])).toBe("choices");
    expect(
      deriveReportStylePreviewCapabilities({
        templateAlias: "custom-categorical",
        questions: [{ stableKey: "priorities", type: "MULTI_CHOICE" }],
      }),
    ).toEqual({
      reportType: "scored",
      hasMetrics: false,
      hasNarrativeResponses: false,
    });
    expect(
      deriveReportStylePreviewCapabilities({
        templateAlias: "custom-numeric",
        questions: [{ stableKey: "revenue", type: "NUMBER" }],
      }),
    ).toEqual({
      reportType: "scored",
      hasMetrics: true,
      hasNarrativeResponses: false,
    });
  });
});

describe("report style policy", () => {
  it("falls back to Classic for unknown, missing, or unavailable rendering styles", () => {
    expect(
      effectiveReportStyle({
        storedStyle: "NOT_A_STYLE",
        available: true,
      }),
    ).toBe("CLASSIC");
    expect(
      effectiveReportStyle({
        storedStyle: "MODERN_DASHBOARD",
        available: true,
      }),
    ).toBe("MODERN_DASHBOARD");
    expect(
      effectiveReportStyle({
        storedStyle: undefined,
        available: true,
      }),
    ).toBe("CLASSIC");
    expect(
      effectiveReportStyle({
        storedStyle: "MODERN_DASHBOARD",
        available: false,
      }),
    ).toBe("CLASSIC");
  });

  it("uses a valid available stored style for every template", () => {
    expect(
      effectiveReportStyle({
        storedStyle: "MODERN_DASHBOARD",
        available: true,
      }),
    ).toBe("MODERN_DASHBOARD");
    expect(
      effectiveReportStyle({
        storedStyle: "EXECUTIVE_BOARDROOM",
        available: true,
      }),
    ).toBe("EXECUTIVE_BOARDROOM");
  });

  it("records whether a campaign style comes from its template default or override", () => {
    expect(resolveCampaignReportStyle(undefined, "MODERN_DASHBOARD")).toEqual({
      reportStyle: "MODERN_DASHBOARD",
      reportStyleSource: "TEMPLATE_DEFAULT",
    });
    expect(resolveCampaignReportStyle("MODERN_DASHBOARD", "MODERN_DASHBOARD")).toEqual({
      reportStyle: "MODERN_DASHBOARD",
      reportStyleSource: "CAMPAIGN_OVERRIDE",
    });
    expect(resolveCampaignReportStyle("CLASSIC", "MODERN_DASHBOARD")).toEqual({
      reportStyle: "CLASSIC",
      reportStyleSource: "CAMPAIGN_OVERRIDE",
    });
  });
});
