import {
  REPORT_STYLE_KEYS,
  getReportStyleMetadata,
  isReportStyleKey,
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
      description: "The current Scaling Up report presentation.",
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
});

describe("report style policy", () => {
  it("limits report styles to the scaling-up-full template alias", () => {
    expect(isReportStyleEligible("scaling-up-full")).toBe(true);
    expect(isReportStyleEligible("scaling-up-full-v2")).toBe(false);
    expect(isReportStyleEligible(undefined)).toBe(false);
  });

  it("falls back to Classic for unknown, ineligible, missing, or unavailable rendering styles", () => {
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
    ).toBe("CLASSIC");
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

  it("uses a valid eligible available stored style for rendering", () => {
    expect(
      effectiveReportStyle({
        alias: "scaling-up-full",
        storedStyle: "MODERN_DASHBOARD",
        available: true,
      }),
    ).toBe("MODERN_DASHBOARD");
  });

  it("records whether a campaign style comes from its template default or override", () => {
    expect(resolveCampaignReportStyle(undefined, "MODERN_DASHBOARD")).toEqual({
      reportStyle: "MODERN_DASHBOARD",
      reportStyleSource: "TEMPLATE_DEFAULT",
    });
    expect(resolveCampaignReportStyle("CLASSIC", "MODERN_DASHBOARD")).toEqual({
      reportStyle: "CLASSIC",
      reportStyleSource: "CAMPAIGN_OVERRIDE",
    });
  });
});
