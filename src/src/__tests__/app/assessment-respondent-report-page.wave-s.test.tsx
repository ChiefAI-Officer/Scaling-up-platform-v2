/**
 * Wave S (Jeff #12/#13) — respondent-report PAGE flag/alias gating tests.
 *
 * The shared peer-report resolver owns all peer gates and benchmark reads.
 * This page suite proves the authorized route forwards both of its outputs to
 * BrandedReport: LVA's existing peerComparison and a test-only enabled SU Full
 * presentation. Resolver correctness and fail-soft behavior live in its unit
 * suite; this route must not recreate them.
 */

jest.mock("next/navigation", () => ({
  redirect: jest.fn().mockImplementation((url: string) => {
    throw Object.assign(new Error("NEXT_REDIRECT"), { digest: `NEXT_REDIRECT;${url}` });
  }),
  notFound: jest.fn().mockImplementation(() => {
    throw Object.assign(new Error("NEXT_HTTP_ERROR_FALLBACK;404"), {
      digest: "NEXT_HTTP_ERROR_FALLBACK;404",
    });
  }),
}));

jest.mock("@/lib/auth/authorization", () => ({
  getApiActor: jest.fn(),
}));

jest.mock("@/lib/assessments/respondent-report", () => ({
  getRespondentReport: jest.fn(),
}));

jest.mock("@/lib/rate-limit", () => ({
  checkRateLimitAsync: jest
    .fn()
    .mockResolvedValue({ success: true, remaining: 99, resetAt: 0 }),
  RateLimits: { standard: { interval: 60000, maxRequests: 100 } },
}));

jest.mock("next/headers", () => ({
  headers: jest.fn().mockResolvedValue({
    get: (k: string) =>
      (({ "x-forwarded-for": "203.0.113.7", "user-agent": "jest-agent/1.0" }) as Record<
        string,
        string
      >)[k] ?? null,
  }),
}));

const mockAuditCreate = jest.fn().mockResolvedValue({ id: "audit-1" });
const mockCampaignFindFirst = jest.fn();
const mockBenchmarkFindMany = jest.fn();
const mockResolvePeerReportEnhancementsForCampaign = jest.fn();

jest.mock("@/lib/db", () => ({
  db: {
    auditLog: { create: (...args: unknown[]) => mockAuditCreate(...args) },
    assessmentCampaign: {
      findFirst: (...args: unknown[]) => mockCampaignFindFirst(...args),
    },
    assessmentBenchmark: {
      findMany: (...args: unknown[]) => mockBenchmarkFindMany(...args),
    },
  },
}));

jest.mock("@/lib/assessments/peer-report-resolver", () => ({
  resolvePeerReportEnhancementsForCampaign: (input: unknown) =>
    mockResolvePeerReportEnhancementsForCampaign(input),
}));

// Capture the peerComparison prop the page hands the report tree.
const mockBrandedReport = jest.fn(
  ({
    report,
    peerComparison,
    reportStylesAvailable,
  }: {
    report: { respondentName: string; reportStyle: string };
    peerComparison?: { items: unknown[] } | null;
    reportStylesAvailable?: boolean;
  }) => (
    <div
      data-testid="branded-report"
      data-peer-items={peerComparison ? String(peerComparison.items.length) : "none"}
      data-report-style={report.reportStyle}
      data-report-styles-available={String(reportStylesAvailable)}
    >
      {report.respondentName}
    </div>
  ),
);
jest.mock("@/components/assessments/BrandedReport", () => ({
  BrandedReport: (props: unknown) => mockBrandedReport(props as never),
}));

jest.mock("@/components/assessments/PrintReportButton", () => ({
  PrintReportButton: () => <button type="button">Print</button>,
}));

import { renderToStaticMarkup } from "react-dom/server";
import { getApiActor } from "@/lib/auth/authorization";
import { getRespondentReport } from "@/lib/assessments/respondent-report";
import Page from "@/app/(report)/assessments/[id]/respondents/[respondentId]/report/page";

const mockGetApiActor = getApiActor as jest.Mock;
const mockGetRespondentReport = getRespondentReport as jest.Mock;

function okLvaReport() {
  return {
    status: "ok",
    reportStylesAvailable: true,
    report: {
      respondentName: "Jane Respondent",
      jobTitle: "CEO",
      companyName: "Acme Corp",
      assessmentName: "Leadership Vision Alignment",
      templateAlias: "leadership-vision-alignment",
      reportStyle: "MODERN_DASHBOARD",
      campaignLabel: "LVA Q3",
      submittedAt: new Date("2026-06-15T00:00:00Z"),
      result: { perSection: [], perQuestion: [] },
      sections: [{ stableKey: "S3_strengths", name: "Strengths" }],
      questionByKey: {},
      questionsByKey: {
        S3_culture: {
          type: "SLIDER_LIKERT",
          label: "Culture",
          sectionStableKey: "S3_strengths",
          scale: { min: 1, max: 3, step: 1, anchorMin: "Weak", anchorMax: "Strong" },
        },
      },
      rawAnswers: [{ stableKey: "S3_culture", value: 3 }],
      scoringConfig: {},
      provenance: {
        submissionId: "sub-99",
        versionId: "ver-1",
        contentHash: "abc12345",
      },
      degraded: false,
    },
  };
}

async function renderPage(): Promise<string> {
  const el = await Page({
    params: Promise.resolve({ id: "camp-1", respondentId: "resp-1" }),
  });
  return renderToStaticMarkup(el);
}

beforeEach(() => {
  jest.clearAllMocks();
  mockGetApiActor.mockResolvedValue({ id: "u1", role: "ADMIN", coachId: null });
  mockGetRespondentReport.mockResolvedValue(okLvaReport());
  mockResolvePeerReportEnhancementsForCampaign.mockImplementation(
    async ({ report }: { report: unknown }) => ({
      report,
      lvaPeerComparison: null,
    }),
  );
  mockCampaignFindFirst.mockResolvedValue(null);
  delete process.env.WAVE_S_PEER_BENCHMARKS_ENABLED;
  delete process.env.WAVE_S_PEER_BENCHMARKS_KILL;
});

afterEach(() => {
  delete process.env.WAVE_S_PEER_BENCHMARKS_ENABLED;
  delete process.env.WAVE_S_PEER_BENCHMARKS_KILL;
});

test("forwards an unchanged resolver result without direct benchmark reads", async () => {
  const html = await renderPage();
  expect(mockBenchmarkFindMany).not.toHaveBeenCalled();
  expect(html).toContain('data-peer-items="none"');
});

test("forwards the existing LVA peerComparison from the shared resolver", async () => {
  const outcome = okLvaReport();
  mockResolvePeerReportEnhancementsForCampaign.mockResolvedValue({
    report: outcome.report,
    lvaPeerComparison: { items: [{}] },
  });
  const html = await renderPage();
  expect(html).toContain('data-peer-items="1"');
  expect(html).toContain('data-report-style="MODERN_DASHBOARD"');
  expect(html).toContain('data-report-styles-available="true"');
});

test("an ineligible resolver result leaves the report unenhanced", async () => {
  const r = okLvaReport();
  r.report.templateAlias = "qsp-v2";
  mockGetRespondentReport.mockResolvedValue(r);
  const html = await renderPage();
  expect(mockBenchmarkFindMany).not.toHaveBeenCalled();
  expect(html).toContain('data-peer-items="none"');
});

test("forwards the resolver's test-only enabled Classic SU Full presentation", async () => {
  const outcome = okLvaReport();
  const sourceReport = {
    ...outcome.report,
    templateAlias: "scaling-up-full",
    reportStyle: "CLASSIC",
  };
  const enrichedReport = {
    ...sourceReport,
    suFullPeerPresentation: { sections: [] },
  };
  mockGetRespondentReport.mockResolvedValue({ ...outcome, report: sourceReport });
  mockResolvePeerReportEnhancementsForCampaign.mockResolvedValue({
    report: enrichedReport,
    lvaPeerComparison: null,
  });

  const html = await renderPage();
  expect(html).toContain("Jane Respondent");
  expect(mockBrandedReport).toHaveBeenCalledWith(
    expect.objectContaining({
      report: expect.objectContaining({
        suFullPeerPresentation: expect.objectContaining({ sections: expect.any(Array) }),
      }),
    }),
  );
});
