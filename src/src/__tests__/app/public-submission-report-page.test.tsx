/**
 * Jeff #83 — authenticated public-referral Results report route.
 *
 * This suite drives the real page → adapter → report-gate-core chain while
 * mocking only request/DB/rendering boundaries. It proves that flag and
 * rate-limit failures stop the loader, forbidden/missing outcomes share the
 * same external 404, the VIEW_REPORT audit is fail-closed, and the canonical
 * report renderer is reused.
 */

jest.mock("next/navigation", () => ({
  redirect: jest.fn().mockImplementation((url: string) => {
    throw Object.assign(new Error("NEXT_REDIRECT"), {
      digest: `NEXT_REDIRECT;${url}`,
    });
  }),
  notFound: jest.fn().mockImplementation(() => {
    throw Object.assign(new Error("NEXT_HTTP_ERROR_FALLBACK;404"), {
      digest: "NEXT_HTTP_ERROR_FALLBACK;404",
    });
  }),
}));

jest.mock("next/headers", () => ({
  headers: jest.fn().mockResolvedValue({
    get: (key: string) =>
      (
        {
          "x-forwarded-for": "203.0.113.83",
          "user-agent": "public-report-test/1.0",
        } as Record<string, string>
      )[key] ?? null,
  }),
}));

jest.mock("@/lib/auth/authorization", () => ({
  getApiActor: jest.fn(),
}));

jest.mock("@/lib/assessments/wave-83-flags", () => ({
  isReferredResultsEnabled: jest.fn(),
}));

jest.mock("@/lib/assessments/public-referrals", () => ({
  getPublicReferralReport: jest.fn(),
}));

jest.mock("@/lib/rate-limit", () => ({
  checkRateLimitAsync: jest.fn(),
  RateLimits: { standard: { interval: 60_000, maxRequests: 100 } },
}));

const mockAuditCreate = jest.fn();
jest.mock("@/lib/db", () => ({
  db: {
    auditLog: {
      create: (...args: unknown[]) => mockAuditCreate(...args),
    },
    assessmentSubmission: {
      findFirst: jest.fn().mockResolvedValue({ campaign: { id: "camp-83", templateId: "tpl-83" } }),
    },
  },
}));

jest.mock("@/lib/assessments/wave-report-styles-flags", () => ({
  isReportStylesEnabled: jest.fn(() => true),
}));
jest.mock("@/lib/assessments/wave-u-flags", () => ({
  isFindingsLogicEnabled: jest.fn(() => true),
}));

const mockBrandedReport = jest.fn(
  ({
    report,
    campaignLabel,
    reportStylesAvailable,
    reportFindingsAvailable,
  }: {
    report: { respondentName: string };
    campaignLabel: string | null;
    reportStylesAvailable?: boolean;
    reportFindingsAvailable?: boolean;
  }) => (
    <div
      data-testid="branded-report"
      data-campaign-label={campaignLabel ?? ""}
      data-report-styles-available={String(reportStylesAvailable)}
      data-report-findings-available={String(reportFindingsAvailable)}
    >
      {report.respondentName}
    </div>
  ),
);
jest.mock("@/components/assessments/BrandedReport", () => ({
  BrandedReport: (props: unknown) => mockBrandedReport(props as never),
}));

const mockPrintReportButton = jest.fn(
  ({ fileName }: { fileName?: string }) => (
    <button data-testid="print-report-button" data-file-name={fileName}>
      Print
    </button>
  ),
);
jest.mock("@/components/assessments/PrintReportButton", () => ({
  PrintReportButton: (props: unknown) =>
    mockPrintReportButton(props as never),
}));

import { renderToStaticMarkup } from "react-dom/server";
import { getApiActor } from "@/lib/auth/authorization";
import { isReferredResultsEnabled } from "@/lib/assessments/wave-83-flags";
import { isReportStylesEnabled } from "@/lib/assessments/wave-report-styles-flags";
import { getPublicReferralReport } from "@/lib/assessments/public-referrals";
import { checkRateLimitAsync } from "@/lib/rate-limit";
import Page from "@/app/(report)/assessments/public-submissions/[submissionId]/report/page";
import type { ApiActor } from "@/lib/auth/access-control";

const mockGetApiActor = getApiActor as jest.Mock;
const mockIsEnabled = isReferredResultsEnabled as jest.Mock;
const mockReportStylesEnabled = isReportStylesEnabled as jest.Mock;
const mockGetPublicReferralReport = getPublicReferralReport as jest.Mock;
const mockRateLimit = checkRateLimitAsync as jest.Mock;

function makeProps(submissionId = "sub-public-83") {
  return { params: Promise.resolve({ submissionId }) };
}

function ownerActor(): ApiActor {
  return {
    userId: "user-coach-83",
    email: "owner@example.com",
    role: "COACH",
    coachId: "coach-83",
  };
}

function okOutcome() {
  return {
    status: "ok",
    report: {
      respondentName: "Taylor Taker",
      jobTitle: "CEO",
      companyName: "Acme",
      assessmentName: "Rockefeller Habits Checklist",
      templateAlias: "RockHabits",
      campaignLabel: "Quick Assessment",
      submittedAt: new Date("2026-07-29T12:00:00Z"),
      result: { perSection: [], perQuestion: [] },
      sections: [],
      questionByKey: {},
      questionsByKey: {},
      rawAnswers: {},
      scoringConfig: {},
      provenance: {
        submissionId: "sub-public-83",
        versionId: "version-83",
        contentHash: "hash-83",
      },
      degraded: false,
    },
  };
}

function auditData(): Record<string, unknown> {
  return mockAuditCreate.mock.calls[0][0].data as Record<string, unknown>;
}

beforeEach(() => {
  jest.clearAllMocks();
  mockGetApiActor.mockResolvedValue(ownerActor());
  mockIsEnabled.mockReturnValue(true);
  mockReportStylesEnabled.mockReturnValue(true);
  mockRateLimit.mockResolvedValue({
    success: true,
    remaining: 99,
    resetAt: 0,
  });
  mockAuditCreate.mockResolvedValue({ id: "audit-83" });
  mockGetPublicReferralReport.mockResolvedValue(okOutcome());
});

describe("public referral report page", () => {
  it("returns a dark 404 before rate limiting or loader work when the flag is off", async () => {
    mockIsEnabled.mockReturnValue(false);

    await expect(Page(makeProps())).rejects.toThrow(
      "NEXT_HTTP_ERROR_FALLBACK",
    );

    expect(mockRateLimit).not.toHaveBeenCalled();
    expect(mockGetPublicReferralReport).not.toHaveBeenCalled();
    expect(mockAuditCreate).not.toHaveBeenCalled();
    expect(mockBrandedReport).not.toHaveBeenCalled();
  });

  it("redirects an unauthenticated visitor before loader work", async () => {
    mockGetApiActor.mockResolvedValue(null);

    await expect(Page(makeProps())).rejects.toThrow("NEXT_REDIRECT");

    expect(mockIsEnabled).not.toHaveBeenCalled();
    expect(mockRateLimit).not.toHaveBeenCalled();
    expect(mockGetPublicReferralReport).not.toHaveBeenCalled();
    expect(mockAuditCreate).not.toHaveBeenCalled();
  });

  it("renders the shared report and print control only after the exact audit succeeds", async () => {
    const actor = ownerActor();
    mockGetApiActor.mockResolvedValue(actor);

    const node = await Page(makeProps());
    const markup = renderToStaticMarkup(node as React.ReactElement);

    expect(markup).toContain('data-testid="branded-report"');
    expect(markup).toContain("Taylor Taker");
    expect(markup).toContain('data-campaign-label="Quick Assessment"');
    expect(markup).toContain('data-report-styles-available="true"');
    expect(markup).toContain('data-report-findings-available="true"');
    expect(markup).toContain('data-testid="print-report-button"');
    expect(markup).toContain(
      'data-file-name="Taylor Taker - Rockefeller Habits Checklist - Report"',
    );

    expect(mockRateLimit).toHaveBeenCalledWith(
      "public-referral-report:coach-83:sub-public-83:203.0.113.83",
      { interval: 60_000, maxRequests: 100 },
    );
    expect(mockGetPublicReferralReport).toHaveBeenCalledWith(
      expect.anything(),
      actor,
      "sub-public-83",
    );
    expect(mockAuditCreate).toHaveBeenCalledTimes(1);
    expect(auditData()).toEqual(
      expect.objectContaining({
        entityType: "AssessmentSubmission",
        entityId: "sub-public-83",
        action: "VIEW_REPORT",
        performedBy: "owner@example.com",
        ipAddress: "203.0.113.83",
        userAgent: "public-report-test/1.0",
      }),
    );
    expect(JSON.parse(auditData().changes as string)).toEqual({
      kind: "public-referral-report",
      templateAlias: "RockHabits",
      reportType: "scored",
      versionId: "version-83",
      contentHash: "hash-83",
    });
  });

  it("retains the existing public-referral report surface when report styles are killed", async () => {
    mockReportStylesEnabled.mockReturnValue(false);

    const node = await Page(makeProps());
    const markup = renderToStaticMarkup(node as React.ReactElement);

    expect(markup).toContain('data-testid="branded-report"');
    expect(markup).toContain('data-report-styles-available="false"');
    expect(markup).toContain('data-testid="print-report-button"');
  });

  it.each(["forbidden", "not-found"] as const)(
    "maps %s to the same enumeration-safe 404 without rendering",
    async (status) => {
      mockGetPublicReferralReport.mockResolvedValue({ status });

      await expect(Page(makeProps())).rejects.toThrow(
        "NEXT_HTTP_ERROR_FALLBACK",
      );

      expect(mockAuditCreate).not.toHaveBeenCalled();
      expect(mockBrandedReport).not.toHaveBeenCalled();
      expect(mockPrintReportButton).not.toHaveBeenCalled();
    },
  );

  it("fails closed on rate-limit exhaustion before loading or rendering", async () => {
    mockRateLimit.mockResolvedValue({
      success: false,
      remaining: 0,
      resetAt: 0,
    });

    await expect(Page(makeProps())).rejects.toThrow(
      "NEXT_HTTP_ERROR_FALLBACK",
    );

    expect(mockGetPublicReferralReport).not.toHaveBeenCalled();
    expect(mockAuditCreate).not.toHaveBeenCalled();
    expect(mockBrandedReport).not.toHaveBeenCalled();
  });

  it("fails closed when the audit write fails and never renders report data", async () => {
    mockAuditCreate.mockRejectedValue(new Error("audit unavailable"));

    await expect(Page(makeProps())).rejects.toThrow("audit unavailable");

    expect(mockGetPublicReferralReport).toHaveBeenCalledTimes(1);
    expect(mockBrandedReport).not.toHaveBeenCalled();
    expect(mockPrintReportButton).not.toHaveBeenCalled();
  });

  it("is force-dynamic with zero revalidation", async () => {
    const mod = await import(
      "@/app/(report)/assessments/public-submissions/[submissionId]/report/page"
    );
    expect((mod as { dynamic?: string }).dynamic).toBe("force-dynamic");
    expect((mod as { revalidate?: number }).revalidate).toBe(0);
  });
});
