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

async function renderPage(style: string, page: string, variant = "normal") {
  const element = await ReportStylePreviewPage({
    searchParams: Promise.resolve({ style, page, capture: "1", variant }),
  });
  return renderToStaticMarkup(element);
}

beforeEach(() => {
  jest.clearAllMocks();
  mockRequireAdmin.mockResolvedValue(undefined);
});

describe("report style preview page", () => {
  it.each([
    ["CLASSIC", "classic-preview"],
    ["EXECUTIVE_BOARDROOM", "executive-boardroom-report"],
    ["MODERN_DASHBOARD", "modern-dashboard-report"],
  ])("renders %s only from the synthetic fixture", async (style, rootTestId) => {
    const html = await renderPage(style, "cover");

    expect(mockRequireAdmin).toHaveBeenCalledTimes(1);
    expect(html).toContain(`data-testid=\"${rootTestId}\"`);
    expect(html).toContain("ABC Corp");
    expect(html).toContain("Alex Rivera");
    expect(html).toContain('data-testid="report-style-preview-root"');
    expect(html).toContain('data-testid="report-style-preview-safe-bottom"');
  });

  it("renders one requested logical page in deterministic capture mode", async () => {
    const html = await renderPage("MODERN_DASHBOARD", "summary");

    expect(html).toContain('data-testid="report-style-preview-root"');
    expect(html).toContain('data-testid="report-style-preview-page-summary"');
    expect(html).not.toContain('data-testid="report-style-preview-page-cover"');
    expect(html).not.toContain('data-testid="report-style-preview-page-detail"');
  });

  it("uses the frozen Classic renderer with only synthetic content", async () => {
    const html = await renderPage("CLASSIC", "summary");

    expect(html).toContain('class="su-public-brand su-report"');
    expect(html).toContain('class="su-report-overall"');
    expect(html).toContain('class="su-report-decisions"');
    expect(html).toContain("How you scored, by decision");
  });

  it("mounts the complete Boardroom and Dashboard renderers before capture-only selection", async () => {
    const [executive, dashboard] = await Promise.all([
      renderPage("EXECUTIVE_BOARDROOM", "summary"),
      renderPage("MODERN_DASHBOARD", "summary"),
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
    ["partial", 'data-testid="report-style-question-strategy-differentiator"'],
    ["degraded", "Not available"],
    ["max-length", "A deliberately long synthetic assessment label"],
    ["missing-optional", "Alex Rivera"],
    ["long-branding", "The International Association for Deliberately Long"],
  ])("renders the allow-listed %s synthetic fixture variant", async (variant, marker) => {
    const html = await renderPage("EXECUTIVE_BOARDROOM", "detail", variant);

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
    await expect(renderPage("MODERN_DASHBOARD", "cover", "production-data")).rejects.toThrow(
      "NEXT_NOT_FOUND",
    );
  });
});
