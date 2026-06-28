/**
 * Assessment v7.6 Wave F #22 — T8 — coach/admin-gated campaign GROUP report PAGE.
 *
 * URL: /assessments/[id]/report (sibling to the per-respondent report; same
 * (report) brand-scoped route group, no portal chrome).
 *
 * Since the Report access gate refactor (ADR-0012, PR1), the cross-cutting
 * protocol lives in `viewGroupReport` → the pure `viewReport` core. This file
 * mocks ONLY the leaves (getApiActor, headers, the flag, the loader, rate-limit,
 * db.auditLog.create, the GroupReport components) and drives the REAL page →
 * adapter → gate chain — i.e. it is the leaf-mocked INTEGRATION suite proving
 * the wiring is connected end-to-end (the gate's protocol itself is unit-tested
 * against fakes in report-gate-core.test.ts). The asserted, observable behavior
 * is unchanged from the pre-gate inline implementation:
 *  - FLAG-GATES first: isGroupReportEnabled(actor, {id}) === false → notFound()
 *    (404, loader NOT called)
 *  - rate-limits BEFORE the load; exceeded → notFound() (fail-closed, no load)
 *  - forbidden → notFound() (enumeration-safe; no audit)
 *  - notApplicable / empty → the panels (no audit)
 *  - ok → EXACTLY ONE fail-closed GROUP_REPORT_VIEW audit row, then <GroupReport>
 *  - structured assessment.group_report.* metrics (now via emitReportMetric, with
 *    an additive `surface: "group"` field); marks force-dynamic / revalidate 0.
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
  it("returns 404 (notFound) when the loader reports notEnabled (flag OFF) — no audit, dark", async () => {
    // Wave J (J-3): the enablement decision is now the LOADER's (single source
    // of truth). The route has NO pre-rate-limit flagGate; a disabled campaign
    // surfaces as `notEnabled` → classify "not-found" → a SILENT dark 404,
    // enumeration-safe (no existence leak), and never audited.
    mockGetApiActor.mockResolvedValue(adminActor());
    mockGetGroupReport.mockResolvedValue({ kind: "notEnabled" });

    await expect(Page(makeProps())).rejects.toThrow("NEXT_HTTP_ERROR_FALLBACK");
    expect(mockNotFound).toHaveBeenCalledTimes(1);
    expect(mockAuditCreate).not.toHaveBeenCalled();
    // The route no longer calls isGroupReportEnabled directly (loader owns it).
    expect(mockIsEnabled).not.toHaveBeenCalled();
  });

  it("rate limiter runs BEFORE the loader (alias-hydration query) — no pre-auth DB lookup", async () => {
    // R2-M5 ordering: the rate limiter must fire before any campaign/alias
    // hydration. The loader is where the campaign (template.alias +
    // version.publishedAt) is read, so assert the limiter was invoked first.
    mockGetApiActor.mockResolvedValue(adminActor());
    mockGetGroupReport.mockResolvedValue(okResult());

    const node = await Page(makeProps());
    renderToStaticMarkup(node as React.ReactElement);

    expect(mockRateLimit).toHaveBeenCalledTimes(1);
    expect(mockGetGroupReport).toHaveBeenCalledTimes(1);
    const limiterOrder = mockRateLimit.mock.invocationCallOrder[0];
    const loaderOrder = mockGetGroupReport.mock.invocationCallOrder[0];
    expect(limiterOrder).toBeLessThan(loaderOrder);
  });

  it("renders the unpublished panel for a DRAFT SU-Full campaign (notApplicable, NOT a 404) — no audit", async () => {
    // The publish-guard hit is OBSERVABLE — it must NEVER collapse into a 404.
    mockGetApiActor.mockResolvedValue(adminActor());
    mockGetGroupReport.mockResolvedValue({
      kind: "notApplicable",
      reason: "unpublished",
      templateAlias: "scaling-up-full",
    });

    const node = await Page(makeProps());
    const markup = renderToStaticMarkup(node as React.ReactElement);

    expect(markup).toContain('data-testid="group-report-not-applicable"');
    expect(markup).toContain("not available yet");
    expect(mockNotFound).not.toHaveBeenCalled();
    expect(mockAuditCreate).not.toHaveBeenCalled();
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

describe("(report) group report page — R3-M1 ops metrics (assessment.group_report.*)", () => {
  let infoSpy: jest.SpyInstance;

  // The route emits via emitGroupReportMetric → console.info(JSON.stringify).
  // Collect every parsed marker for assertion (route behavior is unchanged —
  // these are additive logging assertions on the existing paths).
  function markers(): Array<Record<string, unknown>> {
    return infoSpy.mock.calls
      .map((c) => {
        try {
          return JSON.parse(c[0] as string) as Record<string, unknown>;
        } catch {
          return null;
        }
      })
      .filter(
        (m): m is Record<string, unknown> =>
          !!m && typeof m.marker === "string" &&
          (m.marker as string).startsWith("assessment.group_report."),
      );
  }

  beforeEach(() => {
    jest.clearAllMocks();
    mockRateLimit.mockResolvedValue({
      success: true,
      remaining: 99,
      resetAt: Date.now() + 60000,
    });
    mockAuditCreate.mockResolvedValue({ id: "audit-1" });
    infoSpy = jest.spyOn(console, "info").mockImplementation(() => {});
  });

  afterEach(() => {
    infoSpy.mockRestore();
  });

  it("emits assessment.group_report.view with latencyMs (and no PII) on ok", async () => {
    mockGetApiActor.mockResolvedValue(adminActor());
    mockIsEnabled.mockReturnValue(true);
    mockGetGroupReport.mockResolvedValue(okResult());

    const node = await Page(makeProps());
    renderToStaticMarkup(node as React.ReactElement);

    const view = markers().find((m) => m.marker === "assessment.group_report.view");
    expect(view).toBeDefined();
    expect(view).toEqual(
      expect.objectContaining({
        role: "ADMIN",
        template: "lva",
        reportType: "qualitative",
        completedCount: 3,
        invitedCount: 5,
        orphanCount: 0,
        degraded: false,
      }),
    );
    expect(typeof view!.latencyMs).toBe("number");

    // PII guard: no name/email/answer/submissionId across ALL emitted markers.
    const serialized = JSON.stringify(markers());
    expect(serialized).not.toContain("Jane CEO");
    expect(serialized).not.toMatch(/@/);
    expect(serialized).not.toContain("submissionId");
  });

  it("emits assessment.group_report.authz_deny on the forbidden path (no view)", async () => {
    mockGetApiActor.mockResolvedValue(adminActor());
    mockIsEnabled.mockReturnValue(true);
    mockGetGroupReport.mockResolvedValue({ kind: "forbidden" });

    await expect(Page(makeProps())).rejects.toThrow("NEXT_HTTP_ERROR_FALLBACK");

    const ms = markers();
    expect(ms.some((m) => m.marker === "assessment.group_report.authz_deny")).toBe(true);
    expect(ms.some((m) => m.marker === "assessment.group_report.view")).toBe(false);
  });

  it("emits assessment.group_report.rate_limited (and not view) when shed", async () => {
    mockGetApiActor.mockResolvedValue(adminActor());
    mockIsEnabled.mockReturnValue(true);
    mockRateLimit.mockResolvedValue({ success: false, remaining: 0, resetAt: 0, retryAfter: 60 });

    await expect(Page(makeProps())).rejects.toThrow("NEXT_HTTP_ERROR_FALLBACK");

    const ms = markers();
    expect(ms.some((m) => m.marker === "assessment.group_report.rate_limited")).toBe(true);
    expect(ms.some((m) => m.marker === "assessment.group_report.view")).toBe(false);
  });

  it("emits assessment.group_report.not_applicable for a PUBLIC campaign", async () => {
    mockGetApiActor.mockResolvedValue(adminActor());
    mockIsEnabled.mockReturnValue(true);
    mockGetGroupReport.mockResolvedValue({ kind: "notApplicable", reason: "public" });

    const node = await Page(makeProps());
    renderToStaticMarkup(node as React.ReactElement);

    expect(
      markers().some((m) => m.marker === "assessment.group_report.not_applicable"),
    ).toBe(true);
  });

  it("emits assessment.group_report.empty (with invitedCount) for zero completions", async () => {
    mockGetApiActor.mockResolvedValue(adminActor());
    mockIsEnabled.mockReturnValue(true);
    mockGetGroupReport.mockResolvedValue({
      kind: "empty",
      provenance: { ...provenance(), completedCount: 0 },
    });

    const node = await Page(makeProps());
    renderToStaticMarkup(node as React.ReactElement);

    const empty = markers().find((m) => m.marker === "assessment.group_report.empty");
    expect(empty).toEqual(
      expect.objectContaining({ role: "ADMIN", invitedCount: 5, completedCount: 0 }),
    );
  });

  it("emits audit_failure + render_failure (and re-raises) when the audit write throws", async () => {
    mockGetApiActor.mockResolvedValue(adminActor());
    mockIsEnabled.mockReturnValue(true);
    mockGetGroupReport.mockResolvedValue(okResult());
    mockAuditCreate.mockRejectedValue(new Error("db down"));

    await expect(Page(makeProps())).rejects.toThrow("db down");

    const ms = markers();
    expect(ms.some((m) => m.marker === "assessment.group_report.audit_failure")).toBe(true);
    expect(ms.some((m) => m.marker === "assessment.group_report.render_failure")).toBe(true);
    // No success marker on a failed render.
    expect(ms.some((m) => m.marker === "assessment.group_report.view")).toBe(false);
  });

  it("emits degraded + orphan_submission when the model reports them", async () => {
    mockGetApiActor.mockResolvedValue(adminActor());
    mockIsEnabled.mockReturnValue(true);
    const res = okResult();
    res.report.degraded = true;
    res.report.respondents = [
      { respondentId: "r-ceo", name: "Jane CEO", jobTitle: "CEO", isCEO: true, isOrphan: false },
      { respondentId: "r-x", name: "Unknown respondent", jobTitle: null, isCEO: false, isOrphan: true },
    ];
    mockGetGroupReport.mockResolvedValue(res);

    const node = await Page(makeProps());
    renderToStaticMarkup(node as React.ReactElement);

    const ms = markers();
    const degraded = ms.find((m) => m.marker === "assessment.group_report.degraded");
    expect(degraded).toEqual(expect.objectContaining({ degraded: true, template: "lva" }));
    const orphan = ms.find((m) => m.marker === "assessment.group_report.orphan_submission");
    expect(orphan).toEqual(expect.objectContaining({ orphanCount: 1, template: "lva" }));
  });
});
