/**
 * Assessment v7.6 Wave F #22 — T8 — coach/admin-gated campaign GROUP report PAGE.
 *
 * URL: /assessments/[id]/report (sibling to the per-respondent report; same
 * (report) brand-scoped route group, no portal chrome).
 *
 * The page is a server component that:
 *  - resolves the actor server-side (getApiActor)
 *  - FLAG-GATES first: isGroupReportEnabled(actor, {id}) === false → notFound()
 *    (404, loader NOT called)
 *  - rate-limits BEFORE the expensive load; exceeded → notFound() (fail-closed,
 *    loader NOT called)
 *  - gates on getCampaignGroupReport:
 *      forbidden     → notFound() (enumeration-safe; no existence leak)
 *      notApplicable → the invited-only informative panel (no audit)
 *      empty         → the empty-state panel (no audit)
 *      ok            → writes EXACTLY ONE GROUP_REPORT_VIEW audit row DIRECTLY
 *                      via db.auditLog.create (fail-CLOSED — a write failure
 *                      throws, never a silent render) then renders <GroupReport>
 *  - marks the segment force-dynamic / revalidate 0 (H15 cache/PII)
 */

jest.mock("next/navigation", () => ({
  redirect: jest.fn().mockImplementation((url: string) => {
    throw Object.assign(new Error("NEXT_REDIRECT"), {
      digest: `NEXT_REDIRECT;${url}`,
    });
  }),
  // Real Next 16 notFound() throws a control-flow error with this digest —
  // NOT "NEXT_NOT_FOUND". Mock the true shape so the rate-limit fail-closed
  // path is faithfully exercised.
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

jest.mock("next/headers", () => ({
  headers: jest.fn().mockResolvedValue(
    new Map([
      ["x-forwarded-for", "203.0.113.7"],
      ["user-agent", "jest-agent/1.0"],
    ]),
  ),
}));

jest.mock("@/lib/auth/authorization", () => ({
  getApiActor: jest.fn(),
}));

jest.mock("@/lib/assessments/wave-f-flags", () => ({
  isGroupReportEnabled: jest.fn(),
}));

jest.mock("@/lib/assessments/group-report", () => ({
  getCampaignGroupReport: jest.fn(),
}));

jest.mock("@/lib/rate-limit", () => ({
  checkRateLimitAsync: jest.fn().mockResolvedValue({
    success: true,
    remaining: 99,
    resetAt: Date.now() + 60000,
  }),
  RateLimits: { standard: { interval: 60000, maxRequests: 100 } },
}));

// Direct fail-closed audit write — the page calls db.auditLog.create itself
// (NOT the fail-open logAudit wrapper).
const mockAuditCreate = jest.fn().mockResolvedValue({ id: "audit-1" });
jest.mock("@/lib/db", () => ({
  db: {
    auditLog: { create: (...args: unknown[]) => mockAuditCreate(...args) },
  },
}));

// Thin stand-in for the real GroupReport renderer so this page test stays
// focused on the page's own behavior (flag, rate-limit, gating, audit).
jest.mock("@/components/assessments/GroupReport", () => ({
  GroupReport: ({
    assessmentName,
    companyName,
    completedCount,
    invitedCount,
    versionLabel,
    ceoName,
  }: {
    assessmentName: string;
    companyName: string;
    completedCount: number;
    invitedCount: number;
    versionLabel?: string | null;
    ceoName?: string | null;
  }) => (
    <div
      data-testid="group-report"
      data-assessment={assessmentName}
      data-company={companyName}
      data-completed={completedCount}
      data-invited={invitedCount}
      data-version={versionLabel ?? ""}
      data-ceo={ceoName ?? ""}
    >
      group report
    </div>
  ),
  GroupReportEmpty: () => (
    <div data-testid="group-report-empty">No completed submissions yet</div>
  ),
}));

import { renderToStaticMarkup } from "react-dom/server";
import { notFound } from "next/navigation";
import { getApiActor } from "@/lib/auth/authorization";
import { isGroupReportEnabled } from "@/lib/assessments/wave-f-flags";
import { getCampaignGroupReport } from "@/lib/assessments/group-report";
import { checkRateLimitAsync } from "@/lib/rate-limit";
import Page from "@/app/(report)/assessments/[id]/report/page";
import type { ApiActor } from "@/lib/auth/access-control";
import type { AuditAction } from "@/lib/audit";

const mockGetApiActor = getApiActor as jest.Mock;
const mockIsEnabled = isGroupReportEnabled as jest.Mock;
const mockGetGroupReport = getCampaignGroupReport as jest.Mock;
const mockRateLimit = checkRateLimitAsync as jest.Mock;
const mockNotFound = notFound as unknown as jest.Mock;

function makeProps(id = "camp-1") {
  return { params: Promise.resolve({ id }) };
}

function adminActor(): ApiActor {
  return {
    userId: "u-admin",
    email: "admin@example.com",
    role: "ADMIN",
    coachId: null,
  };
}

function provenance() {
  return {
    generatedAt: new Date("2026-06-18T12:00:00Z"),
    completedCount: 3,
    invitedCount: 5,
    versionId: "ver-1",
    templateAlias: "lva",
    ceoParticipantId: "part-ceo",
    contentHash: "deadbeef",
    submissionIds: ["sub-1", "sub-2", "sub-3"],
    companyName: "Acme Corp",
    assessmentName: "Leadership Vision Alignment",
    versionLabel: "lva-v2",
  };
}

function okResult() {
  return {
    kind: "ok",
    report: {
      reportType: "qualitative",
      respondentCount: 3,
      respondents: [
        { respondentId: "r-ceo", name: "Jane CEO", jobTitle: "CEO", isCEO: true, isOrphan: false },
        { respondentId: "r-2", name: "Bob Two", jobTitle: null, isCEO: false, isOrphan: false },
      ],
      degraded: false,
      questionsByKey: {},
      answersByRespondent: {},
    },
    provenance: provenance(),
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  mockRateLimit.mockResolvedValue({
    success: true,
    remaining: 99,
    resetAt: Date.now() + 60000,
  });
  mockAuditCreate.mockResolvedValue({ id: "audit-1" });
});

describe("(report) campaign group report page", () => {
  it("returns 404 (notFound) when the flag is OFF — loader NOT called", async () => {
    mockGetApiActor.mockResolvedValue(adminActor());
    mockIsEnabled.mockReturnValue(false);

    await expect(Page(makeProps())).rejects.toThrow("NEXT_HTTP_ERROR_FALLBACK");
    expect(mockNotFound).toHaveBeenCalledTimes(1);
    expect(mockGetGroupReport).not.toHaveBeenCalled();
    expect(mockAuditCreate).not.toHaveBeenCalled();
    // Flag gate is passed {id: campaignId} from params.
    expect(mockIsEnabled).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ id: "camp-1" }),
    );
  });

  it("fails closed (notFound) when rate-limit is exceeded — BEFORE the loader", async () => {
    mockGetApiActor.mockResolvedValue(adminActor());
    mockIsEnabled.mockReturnValue(true);
    mockRateLimit.mockResolvedValue({ success: false, remaining: 0, resetAt: 0, retryAfter: 60 });

    await expect(Page(makeProps())).rejects.toThrow("NEXT_HTTP_ERROR_FALLBACK");
    expect(mockNotFound).toHaveBeenCalledTimes(1);
    expect(mockGetGroupReport).not.toHaveBeenCalled();
    expect(mockAuditCreate).not.toHaveBeenCalled();
  });

  it("returns 404 (notFound) when the loader is forbidden — no existence leak, no audit", async () => {
    mockGetApiActor.mockResolvedValue(adminActor());
    mockIsEnabled.mockReturnValue(true);
    mockGetGroupReport.mockResolvedValue({ kind: "forbidden" });

    await expect(Page(makeProps())).rejects.toThrow("NEXT_HTTP_ERROR_FALLBACK");
    expect(mockNotFound).toHaveBeenCalledTimes(1);
    expect(mockAuditCreate).not.toHaveBeenCalled();
  });

  it("renders the invited-only panel for a PUBLIC (notApplicable) campaign — no audit", async () => {
    mockGetApiActor.mockResolvedValue(adminActor());
    mockIsEnabled.mockReturnValue(true);
    mockGetGroupReport.mockResolvedValue({ kind: "notApplicable", reason: "public" });

    const node = await Page(makeProps());
    const markup = renderToStaticMarkup(node as React.ReactElement);

    expect(markup).toContain("invited");
    expect(mockNotFound).not.toHaveBeenCalled();
    expect(mockAuditCreate).not.toHaveBeenCalled();
  });

  it("renders the empty-state panel when the cohort has zero completions — no audit", async () => {
    mockGetApiActor.mockResolvedValue(adminActor());
    mockIsEnabled.mockReturnValue(true);
    mockGetGroupReport.mockResolvedValue({
      kind: "empty",
      provenance: { ...provenance(), completedCount: 0 },
    });

    const node = await Page(makeProps());
    const markup = renderToStaticMarkup(node as React.ReactElement);

    expect(markup).toContain('data-testid="group-report-empty"');
    expect(mockAuditCreate).not.toHaveBeenCalled();
  });

  it("renders the group report on ok and writes exactly one GROUP_REPORT_VIEW audit row", async () => {
    mockGetApiActor.mockResolvedValue(adminActor());
    mockIsEnabled.mockReturnValue(true);
    mockGetGroupReport.mockResolvedValue(okResult());

    const node = await Page(makeProps());
    const markup = renderToStaticMarkup(node as React.ReactElement);

    expect(markup).toContain('data-testid="group-report"');
    expect(markup).toContain('data-company="Acme Corp"');
    expect(markup).toContain('data-assessment="Leadership Vision Alignment"');
    // CEO name derived from the model's respondents (isCEO row).
    expect(markup).toContain('data-ceo="Jane CEO"');
    expect(markup).toContain('data-version="lva-v2"');

    // generatedAt threaded into the loader call (route boundary new Date()).
    expect(mockGetGroupReport).toHaveBeenCalledTimes(1);
    const args = mockGetGroupReport.mock.calls[0];
    expect(args[2]).toBe("camp-1");
    expect(args[3]).toBeInstanceOf(Date);

    expect(mockAuditCreate).toHaveBeenCalledTimes(1);
    const data = mockAuditCreate.mock.calls[0][0].data as Record<string, unknown>;
    expect(data.entityType).toBe("AssessmentCampaign");
    expect(data.entityId).toBe("camp-1");
    expect(data.action).toBe("GROUP_REPORT_VIEW");
    expect(data.performedBy).toBe("admin@example.com");
    expect(data.ipAddress).toBe("203.0.113.7");
    expect(data.userAgent).toBe("jest-agent/1.0");

    const changes = JSON.parse(data.changes as string) as Record<string, unknown>;
    expect(changes).toEqual(
      expect.objectContaining({
        versionId: "ver-1",
        contentHash: "deadbeef",
        ceoParticipantId: "part-ceo",
        completedCount: 3,
        invitedCount: 5,
        submissionIds: ["sub-1", "sub-2", "sub-3"],
      }),
    );
  });

  it("fails the request (throws) when the audit write fails — never a silent render (fail-closed)", async () => {
    mockGetApiActor.mockResolvedValue(adminActor());
    mockIsEnabled.mockReturnValue(true);
    mockGetGroupReport.mockResolvedValue(okResult());
    mockAuditCreate.mockRejectedValue(new Error("db down"));

    await expect(Page(makeProps())).rejects.toThrow("db down");
  });

  it("marks the segment force-dynamic / no-revalidate (H15 cache/PII)", async () => {
    const mod = await import("@/app/(report)/assessments/[id]/report/page");
    expect((mod as { dynamic?: string }).dynamic).toBe("force-dynamic");
    expect((mod as { revalidate?: number }).revalidate).toBe(0);
  });

  it("GROUP_REPORT_VIEW is a valid member of the AuditAction type", () => {
    // Compile-time: this assignment fails to typecheck if the union is missing
    // the member. Runtime: a usage assertion so the test is observable.
    const action: AuditAction = "GROUP_REPORT_VIEW";
    expect(action).toBe("GROUP_REPORT_VIEW");
  });
});
