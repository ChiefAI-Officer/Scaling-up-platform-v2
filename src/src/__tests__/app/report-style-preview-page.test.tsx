import { renderToStaticMarkup } from "react-dom/server";

jest.mock("next/navigation", () => ({
  notFound: jest.fn(() => {
    throw new Error("NEXT_NOT_FOUND");
  }),
}));

const mockRequireAdmin = jest.fn();
jest.mock("@/lib/auth/authorization", () => ({
  requireAdmin: (...args: unknown[]) => mockRequireAdmin(...args),
}));

// These deliberately explode if the preview route ever reaches production data.
jest.mock("@/lib/db", () => {
  throw new Error("Preview route must not import Prisma");
});
jest.mock("@/lib/assessments/respondent-report", () => {
  throw new Error("Preview route must not import respondent-report loaders");
});

import ReportStylePreviewPage from "@/app/(dashboard)/admin/surveys/report-style-preview/page";

async function renderPage(
  style: string,
  page: string,
  anatomy = "scored",
  variant = "normal",
) {
  const element = await ReportStylePreviewPage({
    searchParams: Promise.resolve({ style, page, capture: "1", anatomy, variant }),
  });
  return renderToStaticMarkup(element);
}

beforeEach(() => {
  jest.clearAllMocks();
  mockRequireAdmin.mockResolvedValue(undefined);
});

describe("report style preview page", () => {
  it.each([
    ["scored", "CLASSIC", "branded-report"],
    ["qualitative", "CLASSIC", "qualitative-report"],
    ["sparse-custom", "CLASSIC", "qualitative-report"],
    ["scored", "EXECUTIVE_BOARDROOM", "executive-boardroom-report"],
    ["qualitative", "EXECUTIVE_BOARDROOM", "executive-boardroom-report"],
    ["sparse-custom", "EXECUTIVE_BOARDROOM", "executive-boardroom-report"],
    ["scored", "MODERN_DASHBOARD", "modern-dashboard-report"],
    ["qualitative", "MODERN_DASHBOARD", "modern-dashboard-report"],
    ["sparse-custom", "MODERN_DASHBOARD", "modern-dashboard-report"],
  ])("renders %s through %s using only the synthetic fixture", async (anatomy, style, rootTestId) => {
    const html = await renderPage(style, "cover", anatomy);

    expect(mockRequireAdmin).toHaveBeenCalledTimes(1);
    expect(html).toContain(`data-testid=\"${rootTestId}\"`);
    expect(html).toContain("ABC Corp");
    expect(html).toContain("Alex Rivera");
    expect(html).toContain('data-testid="report-style-preview-root"');
    expect(html).toContain('data-testid="report-style-preview-safe-bottom"');
    expect(html).toContain(`data-preview-anatomy="${anatomy}"`);
  });

  it("renders one requested logical page in deterministic capture mode", async () => {
    const html = await renderPage("MODERN_DASHBOARD", "summary", "qualitative");

    expect(html).toContain('data-testid="report-style-preview-root"');
    expect(html).toContain('data-testid="report-style-preview-page-summary"');
    expect(html).not.toContain('data-testid="report-style-preview-page-cover"');
    expect(html).not.toContain('data-testid="report-style-preview-page-detail"');
  });

  it("uses the frozen scored and qualitative Classic renderers with only synthetic content", async () => {
    const [scored, qualitative] = await Promise.all([
      renderPage("CLASSIC", "summary", "scored"),
      renderPage("CLASSIC", "summary", "qualitative"),
    ]);

    expect(scored).toContain('data-testid="branded-report"');
    expect(scored).toContain('class="su-report-overall"');
    expect(scored).toContain("How you scored, by decision");
    expect(qualitative).toContain('data-testid="qualitative-report"');
    expect(qualitative).toContain("Your Quarterly Reflection Report");
    expect(qualitative).not.toContain("Overall result");
  });

  it("mounts the complete Boardroom and Dashboard renderers before capture-only selection", async () => {
    const [executive, dashboard] = await Promise.all([
      renderPage("EXECUTIVE_BOARDROOM", "summary", "scored"),
      renderPage("MODERN_DASHBOARD", "summary", "scored"),
    ]);

    // These elements are intentionally present in the actual renderer DOM even
    // when preview CSS hides them to keep a representative canvas uncut.
    expect(executive).toContain('data-report-block="score-summary"');
    expect(executive).toContain('data-report-role="domain"');
    expect(executive).toContain("su-report--executive");
    expect(dashboard).toContain('data-report-block="score-summary"');
    expect(dashboard).toContain('data-report-role="domain"');
    expect(dashboard).toContain("su-report--dashboard");
    expect(executive).toContain(
      ".report-action-group ~ .report-action-group",
    );
  });

  it.each([
    ["partial", 'data-testid="report-style-question-strategy-2"'],
    ["degraded", "Not available"],
    ["max-length", "A deliberately long synthetic assessment label"],
    ["missing-blocks", "Alex Rivera"],
    ["long-branding", "The International Association for Deliberately Long"],
  ])("renders the allow-listed %s synthetic fixture variant", async (variant, marker) => {
    const html = await renderPage("EXECUTIVE_BOARDROOM", "detail", "scored", variant);

    expect(html).toContain(`data-preview-variant="${variant}"`);
    expect(html).toContain(marker);
    expect(mockRequireAdmin).toHaveBeenCalledTimes(1);
  });

  it.each([
    ["UNKNOWN", "cover"],
    ["CLASSIC", "unknown"],
    ["classic", "cover"],
  ])("rejects invalid preview values (%s, %s)", async (style, page) => {
    await expect(renderPage(style, page)).rejects.toThrow("NEXT_NOT_FOUND");
  });

  it("rejects an unknown fixture variant before it can render", async () => {
    await expect(renderPage("MODERN_DASHBOARD", "cover", "scored", "production-data")).rejects.toThrow(
      "NEXT_NOT_FOUND",
    );
  });

  it("rejects an unknown anatomy before it can render", async () => {
    await expect(
      renderPage("MODERN_DASHBOARD", "cover", "production-record"),
    ).rejects.toThrow("NEXT_NOT_FOUND");
  });

  it.each(["EXECUTIVE_BOARDROOM", "MODERN_DASHBOARD"])(
    "%s collapses missing optional blocks without empty report cards",
    async (style) => {
      const html = await renderPage(style, "detail", "sparse-custom", "missing-blocks");

      expect(html).toContain('data-report-block="narrative-response"');
      expect(html).not.toContain('<section data-report-block="score-summary"');
      expect(html).not.toContain('<section data-report-block="recommendation"');
      expect(html).not.toContain('<footer data-report-block="coach-cta"');
      expect(html).not.toMatch(/data-report-block="[^"]+"[^>]*>\s*<\/section>/);
    },
  );
});
