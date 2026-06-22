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
jest.mock("@/lib/db", () => ({
  db: {
    auditLog: { create: (...args: unknown[]) => mockAuditCreate(...args) },
  },
}));

jest.mock("@/components/assessments/BrandedReport", () => ({
  BrandedReport: ({
    report,
    campaignLabel,
  }: {
    report: { respondentName: string };
    campaignLabel: string | null;
  }) => (
    <div data-testid="branded-report" data-campaign-label={campaignLabel ?? ""}>
      {report.respondentName}
    </div>
  ),
}));

jest.mock("@/components/assessments/PrintReportButton", () => ({
  PrintReportButton: () => (
    <button data-testid="print-report-button" type="button">
      Print
    </button>
  ),
}));

import { renderToStaticMarkup } from "react-dom/server";
import { redirect, notFound } from "next/navigation";
import { getApiActor } from "@/lib/auth/authorization";
import { getRespondentReport } from "@/lib/assessments/respondent-report";
import { checkRateLimitAsync } from "@/lib/rate-limit";
import Page from "@/app/(report)/assessments/[id]/respondents/[respondentId]/report/page";
import type { ApiActor } from "@/lib/auth/access-control";

const mockGetApiActor = getApiActor as jest.Mock;
const mockGetRespondentReport = getRespondentReport as jest.Mock;
const mockRedirect = redirect as unknown as jest.Mock;
const mockNotFound = notFound as unknown as jest.Mock;
const mockRateLimit = checkRateLimitAsync as unknown as jest.Mock;

function makeProps(id = "camp-1", respondentId = "resp-1") {
  return { params: Promise.resolve({ id, respondentId }) };
}

function adminActor(): ApiActor {
  return { userId: "u-admin", email: "admin@example.com", role: "ADMIN", coachId: null };
}

function coachActor(): ApiActor {
  return { userId: "u-coach", email: "coach@example.com", role: "COACH", coachId: "coach-1" };
}

function okReport() {
  return {
    status: "ok",
    report: {
      respondentName: "Jane Respondent",
      jobTitle: "CEO",
      companyName: "Acme Corp",
      assessmentName: "Rockefeller Habits Checklist",
      templateAlias: "RockHabits",
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
    },
  };
}

function auditData(): Record<string, unknown> {
  return mockAuditCreate.mock.calls[0][0].data as Record<string, unknown>;
}

beforeEach(() => {
  jest.clearAllMocks();
  mockRateLimit.mockResolvedValue({ success: true, remaining: 99, resetAt: 0 });
  mockAuditCreate.mockResolvedValue({ id: "audit-1" });
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
  });

  it("renders for an owning COACH actor", async () => {
    mockGetApiActor.mockResolvedValue(coachActor());
    mockGetRespondentReport.mockResolvedValue(okReport());

    const node = await Page(makeProps());
    const markup = renderToStaticMarkup(node as React.ReactElement);

    expect(markup).toContain("Jane Respondent");
    expect(mockNotFound).not.toHaveBeenCalled();
  });

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

describe("(report) route-group layout — print regression (H1)", () => {
  it("wraps children in the brand scope and imports no portal nav", async () => {
    const LayoutMod = await import("@/app/(report)/layout");
    const Layout = LayoutMod.default as (props: {
      children: React.ReactNode;
    }) => React.ReactElement;

    const node = Layout({ children: <span data-testid="child">hi</span> });
    const markup = renderToStaticMarkup(node);

    expect(markup).toContain("su-public-brand");
    expect(markup).toContain("su-report");
    expect(markup).toContain('data-testid="child"');

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
  });
});
