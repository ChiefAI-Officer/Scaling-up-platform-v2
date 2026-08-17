/**
 * Assessment v7.6 — coach/admin-gated per-respondent branded report PAGE.
 *
 * Since the Report access gate refactor (ADR-0012, PR2), the cross-cutting
 * protocol lives in `viewRespondentReport` → the pure `viewReport` core. This
 * file mocks ONLY the leaves (getApiActor, headers, the loader, rate-limit,
 * db.auditLog.create, BrandedReport/PrintReportButton) and drives the REAL page
 * → adapter → gate chain — i.e. it is the leaf-mocked INTEGRATION suite (the
 * gate's protocol itself is unit-tested against fakes in report-gate-core.test.ts).
 *
 * Behavior asserted (PR2 intentional changes vs the pre-gate page):
 *  - redirect-login on no actor
 *  - forbidden / not-found → enumeration-safe 404, no audit
 *  - rate-limit exceeded → fail-closed 404 BEFORE the load (no audit)
 *  - ok → EXACTLY ONE fail-closed VIEW_REPORT audit row written via
 *    db.auditLog.create (was fail-open logAudit) — NOW carrying ipAddress +
 *    userAgent (fix #1) — then renders <BrandedReport>
 *  - page-owned `assessment.respondent_report.view` metric on ok
 */

jest.mock("next/navigation", () => ({
  redirect: jest.fn().mockImplementation((url: string) => {
    throw Object.assign(new Error("NEXT_REDIRECT"), {
      digest: `NEXT_REDIRECT;${url}`,
    });
  }),
  // Next 16 notFound() throws a control-flow error with this digest.
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
  checkRateLimitAsync: jest.fn().mockResolvedValue({
    success: true,
    remaining: 99,
    resetAt: 0,
  }),
  RateLimits: { standard: { interval: 60000, maxRequests: 100 } },
}));

// next/headers has no request scope under jest — provide a stand-in carrying an
// IP + UA so the gate's fail-closed audit row's ipAddress/userAgent (fix #1) and
// the rate-limit guard are genuinely exercised.
jest.mock("next/headers", () => ({
  headers: jest.fn().mockResolvedValue({
    get: (k: string) =>
      (({ "x-forwarded-for": "203.0.113.7", "user-agent": "jest-agent/1.0" }) as Record<string, string>)[k] ??
      null,
  }),
}));

// Fail-closed audit write goes directly through db.auditLog.create (the gate),
// NOT the fail-open logAudit wrapper the pre-gate page used.
const mockAuditCreate = jest.fn().mockResolvedValue({ id: "audit-1" });
const mockAssessmentCampaignFindFirst = jest.fn().mockResolvedValue({
  id: "camp-1",
  organizationId: "org-1",
  templateId: "tpl-1",
  template: { alias: "scaling-up-full" },
});
jest.mock("@/lib/db", () => ({
  db: {
    auditLog: { create: (...args: unknown[]) => mockAuditCreate(...args) },
    assessmentCampaign: { findFirst: (...args: unknown[]) => mockAssessmentCampaignFindFirst(...args) },
  },
}));

jest.mock("@/lib/assessments/wave-report-styles-flags", () => ({
  isReportStylesEnabled: jest.fn(() => true),
}));
jest.mock("@/lib/assessments/wave-u-flags", () => ({
  isFindingsLogicEnabled: jest.fn(() => true),
}));
jest.mock("@/lib/assessments/wave-report-comparison-flags", () => ({
  REPORT_COMPARISON_ALIAS: "scaling-up-full",
  isReportComparisonEnabled: jest.fn(() => false),
  isReportComparisonRolloutActive: jest.fn(() => true),
}));
jest.mock("@/lib/assessments/ceo-report-access", () => ({
  resolveCeoViewerFromExactPathSession: jest.fn(),
}));
jest.mock("@/lib/assessments/ceo-report-access-cookie", () => ({
  getCeoReportAccessSession: jest.fn(),
}));
jest.mock("@/lib/assessments/report-comparison", () => ({
  asReportComparisonDb: jest.fn((database) => database),
  listReportComparisonCandidates: jest.fn(),
  loadReportComparison: jest.fn(),
}));
jest.mock("@/lib/assessments/report-access-gate", () => ({
  ...jest.requireActual("@/lib/assessments/report-access-gate"),
  viewCeoSelfRespondentReport: jest.fn(),
}));
jest.mock("@/lib/audit", () => ({
  logAuditStrict: jest.fn(),
}));

jest.mock("@/components/assessments/BrandedReport", () => ({
  BrandedReport: ({
    report,
    campaignLabel,
    reportStylesAvailable,
    reportFindingsAvailable,
    comparison,
  }: {
    report: { respondentName: string; templateAlias: string; reportStyle: string };
    campaignLabel: string | null;
    reportStylesAvailable?: boolean;
    reportFindingsAvailable?: boolean;
    comparison?: { baseline: { submissionId: string } };
  }) => (
    <div data-testid="branded-report" data-campaign-label={campaignLabel ?? ""} data-template-alias={report.templateAlias} data-report-style={report.reportStyle} data-report-styles-available={String(reportStylesAvailable)} data-report-findings-available={String(reportFindingsAvailable)} data-comparison-submission-id={comparison?.baseline.submissionId ?? ""}>
      {report.respondentName}
    </div>
  ),
}));

jest.mock("@/components/assessments/PrintReportButton", () => ({
  PrintReportButton: ({ fileName }: { fileName?: string }) => (
    <button data-testid="print-report-button" data-file-name={fileName ?? ""} type="button">
      Print
    </button>
  ),
}));

jest.mock("@/components/assessments/ReportComparisonControls", () => ({
  ReportComparisonControls: ({ selectedSubmissionId }: { selectedSubmissionId: string | null }) => (
    <div data-testid="report-comparison-controls" data-selected-submission-id={selectedSubmissionId ?? ""} />
  ),
}));

import { renderToStaticMarkup } from "react-dom/server";
import { redirect, notFound } from "next/navigation";
import { getApiActor } from "@/lib/auth/authorization";
import { getRespondentReport } from "@/lib/assessments/respondent-report";
import { checkRateLimitAsync } from "@/lib/rate-limit";
import { isReportStylesEnabled } from "@/lib/assessments/wave-report-styles-flags";
import {
  isReportComparisonEnabled,
  isReportComparisonRolloutActive,
} from "@/lib/assessments/wave-report-comparison-flags";
import { resolveCeoViewerFromExactPathSession } from "@/lib/assessments/ceo-report-access";
import { getCeoReportAccessSession } from "@/lib/assessments/ceo-report-access-cookie";
import { listReportComparisonCandidates, loadReportComparison } from "@/lib/assessments/report-comparison";
import { logAuditStrict } from "@/lib/audit";
import { viewCeoSelfRespondentReport } from "@/lib/assessments/report-access-gate";
import Page from "@/app/(report)/assessments/[id]/respondents/[respondentId]/report/page";
import type { ApiActor } from "@/lib/auth/access-control";

const mockGetApiActor = getApiActor as jest.Mock;
const mockGetRespondentReport = getRespondentReport as jest.Mock;
const mockRedirect = redirect as unknown as jest.Mock;
const mockNotFound = notFound as unknown as jest.Mock;
const mockRateLimit = checkRateLimitAsync as unknown as jest.Mock;
const mockReportStylesEnabled = isReportStylesEnabled as jest.Mock;
const mockReportComparisonEnabled = isReportComparisonEnabled as jest.Mock;
const mockReportComparisonRolloutActive = isReportComparisonRolloutActive as jest.Mock;
const mockResolveCeoViewer = resolveCeoViewerFromExactPathSession as jest.Mock;
const mockGetCeoSession = getCeoReportAccessSession as jest.Mock;
const mockListCandidates = listReportComparisonCandidates as jest.Mock;
const mockLoadComparison = loadReportComparison as jest.Mock;
const mockLogAuditStrict = logAuditStrict as jest.Mock;
const mockViewCeoSelfReport = viewCeoSelfRespondentReport as jest.Mock;

function makeProps(id = "camp-1", respondentId = "resp-1", compareTo?: string) {
  return { params: Promise.resolve({ id, respondentId }), searchParams: Promise.resolve({ compareTo }) };
}

function adminActor(): ApiActor {
  return { userId: "u-admin", email: "admin@example.com", role: "ADMIN", coachId: null };
}

function coachActor(): ApiActor {
  return { userId: "u-coach", email: "coach@example.com", role: "COACH", coachId: "coach-1" };
}

function okReport(reportOverrides: Record<string, unknown> = {}) {
  return {
    status: "ok",
    reportStylesAvailable: true,
    report: {
      respondentName: "Jane Respondent",
      jobTitle: "CEO",
      companyName: "Acme Corp",
      assessmentName: "Rockefeller Habits Checklist",
      templateAlias: "RockHabits",
      reportStyle: "CLASSIC",
      campaignLabel: "Q1 Pulse",
      submittedAt: new Date("2026-01-15T00:00:00Z"),
      result: { perSection: [], perQuestion: [] },
      sections: [],
      questionByKey: {},
      questionsByKey: {},
      rawAnswers: {},
      scoringConfig: {},
      provenance: {
        submissionId: "sub-99",
        versionId: "ver-1",
        contentHash: "abc12345",
      },
      degraded: false,
      ...reportOverrides,
    },
  };
}

function auditData(): Record<string, unknown> {
  return mockAuditCreate.mock.calls[0][0].data as Record<string, unknown>;
}

const comparisonCandidate = {
  submissionId: "sub-prior",
  campaignId: "camp-prior",
  campaignLabel: "Q1 2025",
  submittedAt: new Date("2025-03-31T00:00:00.000Z"),
  versionId: "ver-1",
  versionNumber: 1,
  isImported: false,
};

const comparisonModel = {
  baseline: comparisonCandidate,
  sameVersion: true,
  overall: { current: 72, previous: 64, delta: 8, status: "comparable" as const },
  domains: {},
  sections: {},
  questions: {},
  coverage: { currentQuestionCount: 0, matchedQuestionCount: 0, unmatchedCurrentCount: 0, baselineOnlyCount: 0 },
};

function scalingUpReport() {
  const outcome = okReport();
  return {
    ...outcome,
    report: {
      ...outcome.report,
      assessmentName: "Scaling Up Assessment",
      templateAlias: "scaling-up-full",
      campaignLabel: "Q1 2026",
    },
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  mockRateLimit.mockResolvedValue({ success: true, remaining: 99, resetAt: 0 });
  mockAuditCreate.mockResolvedValue({ id: "audit-1" });
  mockReportStylesEnabled.mockReturnValue(true);
  mockReportComparisonRolloutActive.mockReturnValue(true);
  mockReportComparisonEnabled.mockReturnValue(false);
  mockResolveCeoViewer.mockResolvedValue(null);
  mockGetCeoSession.mockResolvedValue(null);
  mockListCandidates.mockResolvedValue({ kind: "ok", candidates: [], bounded: false });
  mockLoadComparison.mockResolvedValue({ kind: "invalid" });
  mockLogAuditStrict.mockResolvedValue(undefined);
  mockViewCeoSelfReport.mockResolvedValue({ outcome: okReport(), metricRole: "CEO_SELF" });
});

describe("(report) respondent report page", () => {
  it("redirects anonymous visitors to /login (no load, no audit)", async () => {
    mockGetApiActor.mockResolvedValue(null);

    await expect(Page(makeProps())).rejects.toThrow("NEXT_REDIRECT");
    expect(mockRedirect).toHaveBeenCalledWith("/login");
    expect(mockGetRespondentReport).not.toHaveBeenCalled();
    expect(mockAuditCreate).not.toHaveBeenCalled();
  });

  it("renders the branded report for ADMIN and writes ONE fail-closed VIEW_REPORT audit row (with IP/UA)", async () => {
    mockGetApiActor.mockResolvedValue(adminActor());
    mockGetRespondentReport.mockResolvedValue(okReport());

    const node = await Page(makeProps());
    const markup = renderToStaticMarkup(node as React.ReactElement);

    expect(markup).toContain('data-testid="branded-report"');
    expect(markup).toContain("Jane Respondent");
    expect(markup).toContain('data-testid="print-report-button"');

    expect(mockGetRespondentReport).toHaveBeenCalledTimes(1);
    const callArgs = mockGetRespondentReport.mock.calls[0]; // (db, actor, campaignId, respondentId)
    expect(callArgs[2]).toBe("camp-1");
    expect(callArgs[3]).toBe("resp-1");

    expect(mockAuditCreate).toHaveBeenCalledTimes(1);
    const data = auditData();
    expect(data.entityType).toBe("AssessmentSubmission");
    expect(data.action).toBe("VIEW_REPORT");
    expect(data.entityId).toBe("sub-99");
    expect(data.performedBy).toBe("admin@example.com");
    // fix #1: the per-respondent audit row now captures IP/UA (it did not before).
    expect(data.ipAddress).toBe("203.0.113.7");
    expect(data.userAgent).toBe("jest-agent/1.0");
  });

  it("records report provenance (templateAlias + reportType + versionId + contentHash) in the VIEW_REPORT audit changes", async () => {
    mockGetApiActor.mockResolvedValue(adminActor());
    mockGetRespondentReport.mockResolvedValue(okReport());

    await Page(makeProps());

    expect(mockAuditCreate).toHaveBeenCalledTimes(1);
    const changes = JSON.parse(auditData().changes as string) as Record<string, unknown>;
    expect(changes).toEqual(
      expect.objectContaining({
        kind: "respondent-report",
        templateAlias: "RockHabits",
        // RockHabits is a scored template (real reportConfigFor resolves it).
        reportType: "scored",
        versionId: "ver-1",
        contentHash: "abc12345",
      }),
    );
  });

  it("emits the page-owned assessment.respondent_report.view metric on ok", async () => {
    const infoSpy = jest.spyOn(console, "info").mockImplementation(() => {});
    mockGetApiActor.mockResolvedValue(adminActor());
    mockGetRespondentReport.mockResolvedValue(okReport());

    const node = await Page(makeProps());
    renderToStaticMarkup(node as React.ReactElement);

    const view = infoSpy.mock.calls
      .map((c) => {
        try {
          return JSON.parse(c[0] as string) as Record<string, unknown>;
        } catch {
          return null;
        }
      })
      .find((m) => m && m.marker === "assessment.respondent_report.view");
    expect(view).toEqual(
      expect.objectContaining({ surface: "respondent", role: "ADMIN", template: "RockHabits", reportType: "scored" }),
    );
    infoSpy.mockRestore();
  });

  it("passes the campaignLabel through to BrandedReport", async () => {
    mockGetApiActor.mockResolvedValue(adminActor());
    mockGetRespondentReport.mockResolvedValue(okReport());

    const node = await Page(makeProps());
    const markup = renderToStaticMarkup(node as React.ReactElement);

    expect(markup).toContain('data-campaign-label="Q1 Pulse"');
    expect(markup).toContain('data-report-styles-available="true"');
    expect(markup).toContain('data-enabled-report-style="CLASSIC"');
    expect(markup).toContain('data-report-findings-available="true"');
  });

  it("keeps the legacy report renderer available when report styles are off", async () => {
    mockGetApiActor.mockResolvedValue(adminActor());
    mockGetRespondentReport.mockResolvedValue({
      ...okReport(),
      reportStylesAvailable: false,
    });

    const node = await Page(makeProps());
    const markup = renderToStaticMarkup(node as React.ReactElement);

    expect(markup).toContain('data-testid="branded-report"');
    expect(markup).toContain('data-report-styles-available="false"');
    expect(markup).not.toContain("data-enabled-report-style");
    expect(markup).toContain('data-report-findings-available="true"');
    expect(mockReportStylesEnabled).not.toHaveBeenCalled();
  });

  it("renders for an owning COACH actor", async () => {
    mockGetApiActor.mockResolvedValue(coachActor());
    mockGetRespondentReport.mockResolvedValue(okReport());

    const node = await Page(makeProps());
    const markup = renderToStaticMarkup(node as React.ReactElement);

    expect(markup).toContain("Jane Respondent");
    expect(mockNotFound).not.toHaveBeenCalled();
  });

  it.each([
    ["scored", "Admin", adminActor, "RockHabits", "EXECUTIVE_BOARDROOM"],
    ["qualitative", "Admin", adminActor, "qsp-v2", "MODERN_DASHBOARD"],
    ["sparse custom", "Admin", adminActor, "walk-qual-sparse-custom", "EXECUTIVE_BOARDROOM"],
    ["scored", "Coach", coachActor, "RockHabits", "EXECUTIVE_BOARDROOM"],
    ["qualitative", "Coach", coachActor, "qsp-v2", "MODERN_DASHBOARD"],
    ["sparse custom", "Coach", coachActor, "walk-qual-sparse-custom", "EXECUTIVE_BOARDROOM"],
  ] as const)(
    "%s campaign snapshot reaches the authenticated %s individual view",
    async (_anatomy, _role, actorFactory, templateAlias, reportStyle) => {
      mockGetApiActor.mockResolvedValue(actorFactory());
      mockGetRespondentReport.mockResolvedValue(
        okReport({ templateAlias, reportStyle }),
      );

      const node = await Page(makeProps());
      const markup = renderToStaticMarkup(node as React.ReactElement);

      expect(markup).toContain(`data-template-alias="${templateAlias}"`);
      expect(markup).toContain(`data-report-style="${reportStyle}"`);
      expect(markup).toContain('data-report-styles-available="true"');
    },
  );

  it("returns 404 (notFound) when the report is forbidden — no audit row", async () => {
    mockGetApiActor.mockResolvedValue(coachActor());
    mockGetRespondentReport.mockResolvedValue({ status: "forbidden" });

    await expect(Page(makeProps())).rejects.toThrow("NEXT_HTTP_ERROR_FALLBACK");
    expect(mockNotFound).toHaveBeenCalledTimes(1);
    expect(mockAuditCreate).not.toHaveBeenCalled();
  });

  it("returns 404 (notFound) when the report is not-found — enumeration-safe, no audit", async () => {
    mockGetApiActor.mockResolvedValue(coachActor());
    mockGetRespondentReport.mockResolvedValue({ status: "not-found" });

    await expect(Page(makeProps())).rejects.toThrow("NEXT_HTTP_ERROR_FALLBACK");
    expect(mockNotFound).toHaveBeenCalledTimes(1);
    expect(mockAuditCreate).not.toHaveBeenCalled();
  });

  it("fails closed (notFound) when rate-limit is exceeded — load + audit NOT reached", async () => {
    mockGetApiActor.mockResolvedValue(adminActor());
    mockRateLimit.mockResolvedValue({ success: false, remaining: 0, resetAt: 0, retryAfter: 60 });

    await expect(Page(makeProps())).rejects.toThrow("NEXT_HTTP_ERROR_FALLBACK");
    expect(mockNotFound).toHaveBeenCalledTimes(1);
    expect(mockGetRespondentReport).not.toHaveBeenCalled();
    expect(mockAuditCreate).not.toHaveBeenCalled();
  });

  it("marks the segment force-dynamic / no-revalidate (H15 cache/PII)", async () => {
    const mod = await import(
      "@/app/(report)/assessments/[id]/respondents/[respondentId]/report/page"
    );
    expect((mod as { dynamic?: string }).dynamic).toBe("force-dynamic");
    expect((mod as { revalidate?: number }).revalidate).toBe(0);
  });
});

describe("(report) respondent report page — report-native comparison", () => {
  it("uses the existing operator report gate for ADMIN, STAFF, and COACH viewers", async () => {
    for (const actor of [adminActor(), { ...adminActor(), role: "STAFF" as const }, coachActor()]) {
      mockGetApiActor.mockResolvedValue(actor);
      mockGetRespondentReport.mockResolvedValue(scalingUpReport());
      await Page(makeProps());
    }

    expect(mockGetRespondentReport).toHaveBeenCalledTimes(3);
    expect(mockViewCeoSelfReport).not.toHaveBeenCalled();
  });

  it("uses only the CEO self gate for a valid exact-path session", async () => {
    mockGetApiActor.mockResolvedValue(null);
    mockResolveCeoViewer.mockResolvedValue({
      kind: "ceo-self",
      focusCampaignId: "camp-1",
      focusSubmissionId: "sub-99",
      respondentId: "resp-1",
    });
    mockGetCeoSession.mockResolvedValue({
      focusCampaignId: "camp-1",
      focusSubmissionId: "sub-99",
      invitationId: "invite-1",
      respondentId: "resp-1",
      expiresAt: "2026-12-31T00:00:00.000Z",
    });
    mockViewCeoSelfReport.mockResolvedValue({ outcome: scalingUpReport(), metricRole: "CEO_SELF" });

    const node = await Page(makeProps());
    const markup = renderToStaticMarkup(node as React.ReactElement);

    expect(mockViewCeoSelfReport).toHaveBeenCalledTimes(1);
    expect(mockGetRespondentReport).not.toHaveBeenCalled();
    expect(markup).not.toContain("coach-nav");
    expect(markup).not.toContain("View across campaigns");
  });

  it("keeps the existing login redirect when there is no operator or CEO session", async () => {
    mockGetApiActor.mockResolvedValue(null);
    mockResolveCeoViewer.mockResolvedValue(null);

    await expect(Page(makeProps())).rejects.toThrow("NEXT_REDIRECT");
    expect(mockRedirect).toHaveBeenCalledWith("/login");
  });

  it("keeps an invalid CEO binding enumeration-safe", async () => {
    mockGetApiActor.mockResolvedValue(null);
    mockResolveCeoViewer.mockResolvedValue({
      kind: "ceo-self",
      focusCampaignId: "camp-1",
      focusSubmissionId: "sub-99",
      respondentId: "resp-1",
    });
    mockGetCeoSession.mockResolvedValue({
      focusCampaignId: "camp-1",
      focusSubmissionId: "sub-99",
      invitationId: "invite-1",
      respondentId: "resp-1",
      expiresAt: "2026-12-31T00:00:00.000Z",
    });
    mockViewCeoSelfReport.mockResolvedValue({ outcome: { status: "forbidden" }, metricRole: "CEO_SELF" });

    await expect(Page(makeProps())).rejects.toThrow("NEXT_HTTP_ERROR_FALLBACK");
    expect(mockNotFound).toHaveBeenCalledTimes(1);
  });

  it("does no comparison work while the feature is off", async () => {
    mockGetApiActor.mockResolvedValue(adminActor());
    mockGetRespondentReport.mockResolvedValue(scalingUpReport());
    mockReportComparisonEnabled.mockReturnValue(false);

    await Page(makeProps("camp-1", "resp-1", "sub-prior"));

    expect(mockListCandidates).not.toHaveBeenCalled();
    expect(mockLoadComparison).not.toHaveBeenCalled();
  });

  it("performs no comparison campaign pre-read while the rollout is globally inactive", async () => {
    mockGetApiActor.mockResolvedValue(adminActor());
    mockGetRespondentReport.mockResolvedValue(scalingUpReport());
    mockReportComparisonRolloutActive.mockReturnValue(false);

    await Page(makeProps("camp-1", "resp-1", "sub-prior"));

    expect(mockReportComparisonEnabled).not.toHaveBeenCalled();
    expect(mockListCandidates).not.toHaveBeenCalled();
    expect(mockLoadComparison).not.toHaveBeenCalled();
    expect(mockAssessmentCampaignFindFirst.mock.calls).not.toContainEqual([
      expect.objectContaining({
        select: expect.objectContaining({ organizationId: true }),
      }),
    ]);
  });

  it("treats an explicitly empty compareTo value as a malformed selection", async () => {
    mockGetApiActor.mockResolvedValue(adminActor());
    mockGetRespondentReport.mockResolvedValue(scalingUpReport());
    mockReportComparisonEnabled.mockReturnValue(true);
    mockListCandidates.mockResolvedValue({
      kind: "ok",
      candidates: [comparisonCandidate],
      bounded: false,
    });

    const node = await Page(makeProps("camp-1", "resp-1", ""));
    const markup = renderToStaticMarkup(node as React.ReactElement);

    expect(markup).toContain("That earlier assessment cannot be compared with this report.");
    expect(mockLoadComparison).not.toHaveBeenCalled();
  });

  it("leaves the current report actions unchanged when there is no eligible baseline", async () => {
    mockGetApiActor.mockResolvedValue(adminActor());
    mockGetRespondentReport.mockResolvedValue(scalingUpReport());
    mockReportComparisonEnabled.mockReturnValue(true);
    mockListCandidates.mockResolvedValue({ kind: "ok", candidates: [], bounded: false });

    const node = await Page(makeProps());
    const markup = renderToStaticMarkup(node as React.ReactElement);

    expect(markup).toContain('data-testid="print-report-button"');
    expect(markup).toContain('data-file-name="Jane Respondent - Scaling Up Assessment - Report"');
    expect(markup).not.toContain('data-testid="report-comparison-controls"');
  });

  it("keeps the focus report and shows a generic message for an invalid selection", async () => {
    mockGetApiActor.mockResolvedValue(adminActor());
    mockGetRespondentReport.mockResolvedValue(scalingUpReport());
    mockReportComparisonEnabled.mockReturnValue(true);
    mockListCandidates.mockResolvedValue({ kind: "ok", candidates: [comparisonCandidate], bounded: false });
    mockLoadComparison.mockResolvedValue({ kind: "invalid" });

    const node = await Page(makeProps("camp-1", "resp-1", "unknown"));
    const markup = renderToStaticMarkup(node as React.ReactElement);

    expect(markup).toContain("Jane Respondent");
    expect(markup).toContain("That earlier assessment cannot be compared with this report.");
  });

  it("rejects a selected baseline that is outside the bounded candidate list", async () => {
    const outsideCandidateModel = {
      ...comparisonModel,
      baseline: { ...comparisonCandidate, submissionId: "sub-13", campaignId: "camp-13" },
    };
    mockGetApiActor.mockResolvedValue(adminActor());
    mockGetRespondentReport.mockResolvedValue(scalingUpReport());
    mockReportComparisonEnabled.mockReturnValue(true);
    mockListCandidates.mockResolvedValue({ kind: "ok", candidates: [comparisonCandidate], bounded: true });
    mockLoadComparison.mockResolvedValue({ kind: "ok", model: outsideCandidateModel });

    const node = await Page(makeProps("camp-1", "resp-1", "sub-13"));
    const markup = renderToStaticMarkup(node as React.ReactElement);

    expect(markup).toContain("That earlier assessment cannot be compared with this report.");
    expect(markup).toContain('data-comparison-submission-id=""');
    expect(mockLoadComparison).not.toHaveBeenCalled();
    expect(mockLogAuditStrict).not.toHaveBeenCalled();
  });

  it("audits before it passes a valid comparison to the branded report and names both periods in the export", async () => {
    mockGetApiActor.mockResolvedValue(adminActor());
    mockGetRespondentReport.mockResolvedValue(scalingUpReport());
    mockReportComparisonEnabled.mockReturnValue(true);
    mockListCandidates.mockResolvedValue({ kind: "ok", candidates: [comparisonCandidate], bounded: false });
    mockLoadComparison.mockResolvedValue({ kind: "ok", model: comparisonModel });

    const node = await Page(makeProps("camp-1", "resp-1", "sub-prior"));
    const markup = renderToStaticMarkup(node as React.ReactElement);

    expect(mockLogAuditStrict).toHaveBeenCalledWith(expect.objectContaining({
      action: "VIEW_REPORT_COMPARISON",
      entityId: "sub-99",
      performedBy: "u-admin",
      changes: {
        kind: "report-native-comparison",
        focusCampaignId: "camp-1",
        focusSubmissionId: "sub-99",
        baselineCampaignId: "camp-prior",
        baselineSubmissionId: "sub-prior",
      },
    }));
    expect(markup).toContain('data-comparison-submission-id="sub-prior"');
    expect(markup).toContain('data-selected-submission-id="sub-prior"');
    expect(markup).toContain('data-file-name="Jane Respondent - Scaling Up Assessment - Q1 2026 vs Q1 2025"');
  });

  it("uses the canonical CEO_SELF actor for a CEO comparison audit", async () => {
    mockGetApiActor.mockResolvedValue(null);
    mockResolveCeoViewer.mockResolvedValue({
      kind: "ceo-self",
      focusCampaignId: "camp-1",
      focusSubmissionId: "sub-99",
      respondentId: "resp-1",
      invitationId: "invite-1",
      expiresAt: 1_900_000_000,
    });
    mockGetCeoSession.mockResolvedValue({
      focusCampaignId: "camp-1",
      focusSubmissionId: "sub-99",
      invitationId: "invite-1",
      respondentId: "resp-1",
      expiresAt: "2030-03-17T17:46:40.000Z",
    });
    mockViewCeoSelfReport.mockResolvedValue({
      outcome: scalingUpReport(),
      metricRole: "CEO_SELF",
    });
    mockReportComparisonEnabled.mockReturnValue(true);
    mockListCandidates.mockResolvedValue({
      kind: "ok",
      candidates: [comparisonCandidate],
      bounded: false,
    });
    mockLoadComparison.mockResolvedValue({
      kind: "ok",
      model: comparisonModel,
    });

    await Page(makeProps("camp-1", "resp-1", "sub-prior"));

    expect(mockLogAuditStrict).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "VIEW_REPORT_COMPARISON",
        performedBy: "CEO_SELF",
      }),
    );
  });

  it("date-qualifies blank focus and baseline campaign labels in the export filename", async () => {
    const focus = scalingUpReport();
    focus.report.campaignLabel = null;
    const blankBaselineModel = {
      ...comparisonModel,
      baseline: { ...comparisonCandidate, campaignLabel: null },
    };
    mockGetApiActor.mockResolvedValue(adminActor());
    mockGetRespondentReport.mockResolvedValue(focus);
    mockReportComparisonEnabled.mockReturnValue(true);
    mockListCandidates.mockResolvedValue({
      kind: "ok",
      candidates: [blankBaselineModel.baseline],
      bounded: false,
    });
    mockLoadComparison.mockResolvedValue({ kind: "ok", model: blankBaselineModel });

    const node = await Page(makeProps("camp-1", "resp-1", "sub-prior"));
    const markup = renderToStaticMarkup(node as React.ReactElement);

    expect(markup).toContain(
      'data-file-name="Jane Respondent - Scaling Up Assessment - Scaling Up Assessment · Jan 15, 2026 vs Scaling Up Assessment · Mar 31, 2025"',
    );
  });

  it("omits a comparison if its strict audit cannot be written", async () => {
    mockGetApiActor.mockResolvedValue(adminActor());
    mockGetRespondentReport.mockResolvedValue(scalingUpReport());
    mockReportComparisonEnabled.mockReturnValue(true);
    mockListCandidates.mockResolvedValue({ kind: "ok", candidates: [comparisonCandidate], bounded: false });
    mockLoadComparison.mockResolvedValue({ kind: "ok", model: comparisonModel });
    mockLogAuditStrict.mockRejectedValue(new Error("audit unavailable"));

    const node = await Page(makeProps("camp-1", "resp-1", "sub-prior"));
    const markup = renderToStaticMarkup(node as React.ReactElement);

    expect(markup).toContain('data-comparison-submission-id=""');
    expect(markup).toContain("That earlier assessment cannot be compared with this report.");
  });
});

describe("(report) route-group layout — print regression (H1)", () => {
  it("wraps children in one route-level main brand scope and imports no portal nav", async () => {
    const LayoutMod = await import("@/app/(report)/layout");
    const Layout = LayoutMod.default as (props: {
      children: React.ReactNode;
    }) => React.ReactElement;

    const node = Layout({ children: <span data-testid="child">hi</span> });
    const markup = renderToStaticMarkup(node);

    expect(markup).toContain("su-public-brand");
    expect(markup).toContain("su-report");
    expect(markup).toContain('data-testid="child"');
    expect(markup.match(/<main\b/g)).toHaveLength(1);
    expect(markup).toMatch(/^<main\b[^>]*>.*<\/main>$/);

    expect(markup).not.toContain("Scaling Up Coach");
    expect(markup).not.toContain("bg-sidebar");

    const fs = await import("fs");
    const path = await import("path");
    const src = fs.readFileSync(
      path.join(process.cwd(), "src/app/(report)/layout.tsx"),
      "utf8",
    );
    expect(src).not.toMatch(/coach-nav|coach-mobile-nav|coach-nav-link|CoachNav/);
    expect(src).not.toMatch(/(?:import|from)[^\n]*\(portal\)/);
    for (const reportPage of [
      "src/app/(report)/assessments/[id]/respondents/[respondentId]/report/page.tsx",
      "src/app/(report)/assessments/public-submissions/[submissionId]/report/page.tsx",
    ]) {
      expect(fs.readFileSync(path.join(process.cwd(), reportPage), "utf8")).not.toMatch(/<main\b/);
    }
  });
});
