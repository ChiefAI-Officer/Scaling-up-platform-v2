import {
  REPORT_STYLE_KEYS,
  getReportStyleMetadata,
  getReportStylePreviewPath,
  isReportStyleKey,
  resolveReportStylePreviewAnatomy,
} from "@/lib/assessments/report-style-registry";
import {
  effectiveReportStyle,
  isReportStyleEligible,
  resolveCampaignReportStyle,
} from "@/lib/assessments/report-style-policy";

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
      capabilities: { hasMetrics: false, hasNarrativeResponses: true },
    })).toBe("sparse-custom");

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
});

describe("report style policy", () => {
  it("makes every template alias eligible for catalog report styles", () => {
    expect(isReportStyleEligible("scaling-up-full")).toBe(true);
    expect(isReportStyleEligible("scored-instrument")).toBe(true);
    expect(isReportStyleEligible("qualitative-instrument")).toBe(true);
    expect(isReportStyleEligible("custom-instrument")).toBe(true);
    expect(isReportStyleEligible(null)).toBe(true);
    expect(isReportStyleEligible(undefined)).toBe(true);
  });

  it("falls back to Classic for unknown, missing, or unavailable rendering styles", () => {
    expect(
      effectiveReportStyle({
        alias: "scaling-up-full",
        storedStyle: "NOT_A_STYLE",
        available: true,
      }),
    ).toBe("CLASSIC");
    expect(
      effectiveReportStyle({
        alias: "another-template",
        storedStyle: "MODERN_DASHBOARD",
        available: true,
      }),
    ).toBe("MODERN_DASHBOARD");
    expect(
      effectiveReportStyle({
        alias: "scaling-up-full",
        storedStyle: undefined,
        available: true,
      }),
    ).toBe("CLASSIC");
    expect(
      effectiveReportStyle({
        alias: "scaling-up-full",
        storedStyle: "MODERN_DASHBOARD",
        available: false,
      }),
    ).toBe("CLASSIC");
  });

  it("uses a valid available stored style for every template", () => {
    expect(
      effectiveReportStyle({
        alias: "scaling-up-full",
        storedStyle: "MODERN_DASHBOARD",
        available: true,
      }),
    ).toBe("MODERN_DASHBOARD");
    expect(
      effectiveReportStyle({
        alias: null,
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
