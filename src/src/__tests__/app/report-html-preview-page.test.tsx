import { renderToStaticMarkup } from "react-dom/server";

const mockNotFound = jest.fn(() => { throw new Error("NEXT_NOT_FOUND"); });
jest.mock("next/navigation", () => ({ notFound: () => mockNotFound() }));
const mockRequireAdmin = jest.fn();
jest.mock("@/lib/auth/authorization", () => ({ requireAdmin: () => mockRequireAdmin() }));
const mockFindUnique = jest.fn();
jest.mock("@/lib/db", () => ({ db: { assessmentTemplate: { findUnique: (...args: unknown[]) => mockFindUnique(...args) } } }));
jest.mock("@/components/assessments/BrandedReport", () => ({ BrandedReport: ({ report }: { report: { reportHtml?: { introductionHtml: string | null } } }) => <div data-testid="branded-report">{report.reportHtml?.introductionHtml}</div> }));

import ReportHtmlPreviewPage from "@/app/(dashboard)/admin/assessments/templates/[id]/versions/[versionId]/preview-report/page";

const version = { id: "ver_2", templateId: "tpl_1", questions: [], sections: [], scoringConfig: {}, reportConfig: { reportHtml: { schemaVersion: 1, introductionHtml: "<p>Saved welcome</p>", conclusionHtml: null } } };

beforeEach(() => {
  jest.clearAllMocks();
  mockRequireAdmin.mockResolvedValue(undefined);
  mockFindUnique.mockResolvedValue({ id: "tpl_1", alias: "other", name: "Other", versions: [version] });
});

describe("report HTML full preview page", () => {
  it("authorizes before querying and renders saved content through the branded report", async () => {
    const page = await ReportHtmlPreviewPage({ params: Promise.resolve({ id: "tpl_1", versionId: "ver_2" }), searchParams: Promise.resolve({}) });
    const html = renderToStaticMarkup(page);

    expect(mockRequireAdmin.mock.invocationCallOrder[0]).toBeLessThan(mockFindUnique.mock.invocationCallOrder[0]);
    expect(html).toContain('data-testid="report-html-full-preview"');
    expect(html).toContain('data-print-hidden');
    expect(html).toContain('data-testid="branded-report"');
    expect(html).toContain("Saved welcome");
    expect(html).toContain('data-enabled-report-style="CLASSIC"');
  });

  it("rejects a version that is not owned by the requested template", async () => {
    mockFindUnique.mockResolvedValue({ id: "tpl_1", alias: "other", name: "Other", versions: [{ ...version, templateId: "another" }] });
    await expect(ReportHtmlPreviewPage({ params: Promise.resolve({ id: "tpl_1", versionId: "ver_2" }), searchParams: Promise.resolve({}) })).rejects.toThrow("NEXT_NOT_FOUND");
    expect(mockNotFound).toHaveBeenCalledTimes(1);
  });

  it("ignores a historical peer query for non-Scaling-Up templates", async () => {
    const current = await ReportHtmlPreviewPage({ params: Promise.resolve({ id: "tpl_1", versionId: "ver_2" }), searchParams: Promise.resolve({}) });
    const historical = await ReportHtmlPreviewPage({ params: Promise.resolve({ id: "tpl_1", versionId: "ver_2" }), searchParams: Promise.resolve({ peerReference: "historical" }) });
    expect(renderToStaticMarkup(historical)).toBe(renderToStaticMarkup(current));
  });
});
