/**
 * Assessment v7.6 — Task 4 — coach/admin-gated branded report PAGE.
 *
 * The page is a server component that:
 *  - resolves the actor server-side (getApiActor)
 *  - redirects unauthenticated visitors to /login
 *  - gates on getRespondentReport (forbidden / not-found → notFound(),
 *    enumeration-safe — same 404 for both)
 *  - renders <BrandedReport> + <PrintReportButton> on "ok"
 *  - writes a VIEW_REPORT audit row (H17) and emits an ops marker (H16)
 *
 * The (report) route group is a SIBLING to (portal): its minimal layout
 * renders ONLY {children} wrapped in the brand scope — no portal nav/sidebar
 * (H1 print regression).
 */

jest.mock("next/navigation", () => ({
  redirect: jest.fn().mockImplementation((url: string) => {
    throw Object.assign(new Error("NEXT_REDIRECT"), {
      digest: `NEXT_REDIRECT;${url}`,
    });
  }),
  // Real Next 16 notFound() throws a control-flow error with this digest —
  // NOT "NEXT_NOT_FOUND". Mock the true shape so the rate-limit fail-closed
  // path is faithfully exercised (the prior mock's stale digest let the
  // rate-limit guard's bad `err.message === "NEXT_NOT_FOUND"` check pass).
  notFound: jest.fn().mockImplementation(() => {
    throw Object.assign(new Error("NEXT_HTTP_ERROR_FALLBACK;404"), {
      digest: "NEXT_HTTP_ERROR_FALLBACK;404",
    });
  }),
  // Mirrors Next's unstable_rethrow: re-throw navigation control-flow
  // (notFound/redirect), return for anything else.
  unstable_rethrow: jest.fn().mockImplementation((err: unknown) => {
    const digest =
      typeof err === "object" && err !== null
        ? (err as { digest?: string }).digest
        : undefined;
    if (
      typeof digest === "string" &&
      (digest.startsWith("NEXT_HTTP_ERROR_FALLBACK") ||
        digest.startsWith("NEXT_REDIRECT"))
    ) {
      throw err;
    }
  }),
}));

jest.mock("@/lib/auth/authorization", () => ({
  getApiActor: jest.fn(),
}));

jest.mock("@/lib/assessments/respondent-report", () => ({
  getRespondentReport: jest.fn(),
}));

jest.mock("@/lib/audit", () => ({
  logAudit: jest.fn().mockResolvedValue(undefined),
}));

jest.mock("@/lib/rate-limit", () => ({
  checkRateLimitAsync: jest.fn().mockResolvedValue({
    success: true,
    remaining: 99,
    resetAt: Date.now() + 60000,
  }),
  RateLimits: { standard: { interval: 60000, maxRequests: 100 } },
}));

// next/headers has no request scope under jest; provide a stand-in so the
// rate-limit guard is genuinely exercised (without this, headers() throws,
// the catch swallows it, and the rate-limit branch is never reached).
jest.mock("next/headers", () => ({
  headers: jest.fn().mockResolvedValue({
    get: () => null,
  }),
}));

// Real BrandedReport renders deep markup; render a thin stand-in so the page
// test stays focused on the page's own behavior (auth, gating, audit) and so
// we have a stable marker to assert on.
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
import { logAudit } from "@/lib/audit";
import { checkRateLimitAsync } from "@/lib/rate-limit";
import Page from "@/app/(report)/assessments/[id]/respondents/[respondentId]/report/page";
import type { ApiActor } from "@/lib/auth/access-control";

const mockGetApiActor = getApiActor as jest.Mock;
const mockGetRespondentReport = getRespondentReport as jest.Mock;
const mockLogAudit = logAudit as jest.Mock;
const mockRedirect = redirect as unknown as jest.Mock;
const mockNotFound = notFound as unknown as jest.Mock;
const mockRateLimit = checkRateLimitAsync as unknown as jest.Mock;

function makeProps(id = "camp-1", respondentId = "resp-1") {
  return { params: Promise.resolve({ id, respondentId }) };
}

function adminActor(): ApiActor {
  return {
    userId: "u-admin",
    email: "admin@example.com",
    role: "ADMIN",
    coachId: null,
  };
}

function coachActor(): ApiActor {
  return {
    userId: "u-coach",
    email: "coach@example.com",
    role: "COACH",
    coachId: "coach-1",
  };
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
        templateName: "Rockefeller Habits Checklist",
      },
      degraded: false,
    },
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  // Default to an allowed request; the rate-limit-exceeded test overrides this.
  mockRateLimit.mockResolvedValue({
    success: true,
    remaining: 99,
    resetAt: Date.now() + 60000,
  });
});

describe("(report) respondent report page", () => {
  it("redirects anonymous visitors to /login", async () => {
    mockGetApiActor.mockResolvedValue(null);

    await expect(Page(makeProps())).rejects.toThrow("NEXT_REDIRECT");
    expect(mockRedirect).toHaveBeenCalledWith("/login");
    expect(mockGetRespondentReport).not.toHaveBeenCalled();
    expect(mockLogAudit).not.toHaveBeenCalled();
  });

  it("renders the branded report for an ADMIN actor and writes a VIEW_REPORT audit row", async () => {
    mockGetApiActor.mockResolvedValue(adminActor());
    mockGetRespondentReport.mockResolvedValue(okReport());

    const node = await Page(makeProps());
    const markup = renderToStaticMarkup(node as React.ReactElement);

    expect(markup).toContain('data-testid="branded-report"');
    expect(markup).toContain("Jane Respondent");
    expect(markup).toContain('data-testid="print-report-button"');

    expect(mockGetRespondentReport).toHaveBeenCalledTimes(1);
    const callArgs = mockGetRespondentReport.mock.calls[0];
    // (db, actor, campaignId, respondentId)
    expect(callArgs[2]).toBe("camp-1");
    expect(callArgs[3]).toBe("resp-1");

    expect(mockLogAudit).toHaveBeenCalledTimes(1);
    expect(mockLogAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        entityType: "AssessmentSubmission",
        action: "VIEW_REPORT",
        entityId: "sub-99",
      }),
    );
  });

  it("records report provenance (templateAlias + reportType + versionId + contentHash) in the VIEW_REPORT audit changes (R2-L8)", async () => {
    // #25 removed the visible footer provenance stamp; the traceability moves
    // into the VIEW_REPORT audit entry so we can always reconstruct which
    // renderer (scored vs qualitative) produced what was shown.
    mockGetApiActor.mockResolvedValue(adminActor());
    mockGetRespondentReport.mockResolvedValue(okReport());

    await Page(makeProps());

    expect(mockLogAudit).toHaveBeenCalledTimes(1);
    const auditArg = mockLogAudit.mock.calls[0][0] as {
      changes?: Record<string, unknown>;
    };
    expect(auditArg.changes).toEqual(
      expect.objectContaining({
        templateAlias: "RockHabits",
        // RockHabits is a scored template (reportConfigFor resolves it)
        reportType: "scored",
        versionId: "ver-1",
        contentHash: "abc12345",
      }),
    );
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
    expect(mockLogAudit).not.toHaveBeenCalled();
  });

  it("returns 404 (notFound) when the report is not-found — enumeration-safe", async () => {
    mockGetApiActor.mockResolvedValue(coachActor());
    mockGetRespondentReport.mockResolvedValue({ status: "not-found" });

    await expect(Page(makeProps())).rejects.toThrow("NEXT_HTTP_ERROR_FALLBACK");
    expect(mockNotFound).toHaveBeenCalledTimes(1);
    expect(mockLogAudit).not.toHaveBeenCalled();
  });

  it("fails closed (notFound) when rate-limit is exceeded — load + audit NOT reached (Wave I hardening)", async () => {
    // Regression: the catch around the rate-limit guard used to test
    // `err.message === "NEXT_NOT_FOUND"`, but Next 16's notFound() throws the
    // digest "NEXT_HTTP_ERROR_FALLBACK;404" — so the guard never matched and
    // the fail-closed notFound() was SWALLOWED, letting the report render
    // (and audit) past an exceeded rate limit. unstable_rethrow fixes it.
    mockGetApiActor.mockResolvedValue(adminActor());
    mockRateLimit.mockResolvedValue({
      success: false,
      remaining: 0,
      resetAt: 0,
      retryAfter: 60,
    });

    await expect(Page(makeProps())).rejects.toThrow("NEXT_HTTP_ERROR_FALLBACK");
    expect(mockNotFound).toHaveBeenCalledTimes(1);
    expect(mockGetRespondentReport).not.toHaveBeenCalled();
    expect(mockLogAudit).not.toHaveBeenCalled();
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

    // Sibling group — must NOT pull in any portal chrome.
    expect(markup).not.toContain("Scaling Up Coach");
    expect(markup).not.toContain("bg-sidebar");

    // Structural proof: the layout source imports no coach-nav/portal modules.
    const fs = await import("fs");
    const path = await import("path");
    const src = fs.readFileSync(
      path.join(process.cwd(), "src/app/(report)/layout.tsx"),
      "utf8",
    );
    expect(src).not.toMatch(/coach-nav|coach-mobile-nav|coach-nav-link|CoachNav/);
    // No import that pulls anything out of the (portal) route group.
    expect(src).not.toMatch(/(?:import|from)[^\n]*\(portal\)/);
  });
});
