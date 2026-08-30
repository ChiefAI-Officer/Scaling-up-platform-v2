jest.mock("next/navigation", () => ({
  notFound: jest.fn().mockImplementation(() => {
    throw Object.assign(new Error("NEXT_HTTP_ERROR_FALLBACK;404"), {
      digest: "NEXT_HTTP_ERROR_FALLBACK;404",
    });
  }),
  redirect: jest.fn(),
}));

jest.mock("next/headers", () => ({
  headers: jest.fn().mockResolvedValue(new Map([
    ["x-forwarded-for", "203.0.113.7"],
    ["user-agent", "jest-agent/1.0"],
  ])),
}));

jest.mock("@/lib/auth/authorization", () => ({ getApiActor: jest.fn() }));
jest.mock("@/lib/assessments/summary-reports/scaling-condensed-ceo-snapshot", () => ({
  getScalingCondensedCeoSnapshot: jest.fn(),
}));
jest.mock("@/lib/rate-limit", () => ({
  checkRateLimitAsync: jest.fn().mockResolvedValue({ success: true, remaining: 99, resetAt: 0 }),
  RateLimits: { standard: { interval: 60_000, maxRequests: 100 } },
}));

const mockAuditCreate = jest.fn().mockResolvedValue({ id: "audit-1" });
jest.mock("@/lib/db", () => ({
  db: {
    auditLog: { create: (...args: unknown[]) => mockAuditCreate(...args) },
    $transaction: jest.fn(),
  },
}));

jest.mock("@/components/assessments/ScalingCondensedCeoReport", () => ({
  ScalingCondensedCeoReport: () => <div data-testid="condensed-report">Condensed report</div>,
}));
jest.mock("@/components/assessments/PrintReportButton", () => ({
  PrintReportButton: () => (
    <div>
      <button type="button">Print</button>
      <button type="button">Download PDF</button>
    </div>
  ),
}));

import { renderToStaticMarkup } from "react-dom/server";
import { getApiActor } from "@/lib/auth/authorization";
import { getScalingCondensedCeoSnapshot } from "@/lib/assessments/summary-reports/scaling-condensed-ceo-snapshot";
import { checkRateLimitAsync } from "@/lib/rate-limit";
import Page, {
  dynamic,
  revalidate,
} from "@/app/(report)/assessments/[id]/report/condensed/page";

const mockActor = getApiActor as jest.Mock;
const mockLoad = getScalingCondensedCeoSnapshot as jest.Mock;
const mockRateLimit = checkRateLimitAsync as jest.Mock;

function props() {
  return { params: Promise.resolve({ id: "campaign-1" }) };
}

function okResult() {
  return {
    kind: "ok",
    snapshot: {
      schemaVersion: 1,
      reportType: "SCALING_CONDENSED_CEO",
      generatedAt: "2026-08-30T00:00:00.000Z",
      destination: {
        campaignId: "campaign-1",
        campaignName: "Annual Scaling Up",
        assessmentName: "Scaling Up Full",
        companyName: "Acme",
        versionId: "version-1",
        versionLabel: "Version 6",
      },
      source: {
        participantId: "participant-ceo",
        submissionId: "submission-ceo",
        respondentName: "Ari Founder",
        submittedAt: "2026-08-29T00:00:00.000Z",
      },
      model: {
        respondentName: "Ari Founder",
        peerProvenance: {
          sourceId: "peer-source",
          contentHash: "peer-hash",
          phase: 4,
          legacy: false,
        },
        groups: [],
      },
      provenance: {
        coachLogoUrl: null,
        coachName: "Casey Coach",
        versionContentHash: "version-hash",
        peer: {
          sourceId: "peer-source",
          contentHash: "peer-hash",
          phase: 4,
          legacy: false,
        },
      },
    },
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  mockActor.mockResolvedValue({
    userId: "coach-user",
    email: "coach@example.com",
    role: "COACH",
    coachId: "coach-1",
  });
  mockRateLimit.mockResolvedValue({ success: true, remaining: 99, resetAt: 0 });
  mockAuditCreate.mockResolvedValue({ id: "audit-1" });
});

test("is dynamic, no-cache route metadata", () => {
  expect(dynamic).toBe("force-dynamic");
  expect(revalidate).toBe(0);
});

test.each(["not-found"])("keeps %s outcomes dark with no audit", async (kind) => {
  mockLoad.mockResolvedValue({ kind });
  await expect(Page(props())).rejects.toThrow("NEXT_HTTP_ERROR_FALLBACK");
  expect(mockAuditCreate).not.toHaveBeenCalled();
});

test("rate-limits before loading", async () => {
  mockRateLimit.mockResolvedValue({ success: false, remaining: 0, resetAt: 0 });
  await expect(Page(props())).rejects.toThrow("NEXT_HTTP_ERROR_FALLBACK");
  expect(mockLoad).not.toHaveBeenCalled();
});

test.each([
  ["no-ceo", "No CEO is designated"],
  ["ceo-not-submitted", "CEO has not submitted"],
  ["source-incomplete", "CEO report is incomplete"],
] as const)("renders a clean %s panel with no actions or audit", async (reason, copy) => {
  mockLoad.mockResolvedValue({ kind: "unavailable", reason });
  const markup = renderToStaticMarkup(await Page(props()));
  expect(markup).toContain(copy);
  expect(markup).not.toContain("Download PDF");
  expect(mockAuditCreate).not.toHaveBeenCalled();
});

test.each(["public", "unsupported-template", "unpublished"] as const)(
  "renders a clean %s not-applicable panel",
  async (reason) => {
    mockLoad.mockResolvedValue({ kind: "not-applicable", reason });
    const markup = renderToStaticMarkup(await Page(props()));
    expect(markup).toContain('data-testid="condensed-report-not-applicable"');
    expect(markup).not.toContain("Download PDF");
    expect(mockAuditCreate).not.toHaveBeenCalled();
  },
);

test("renders both print actions and writes one fail-closed view audit", async () => {
  mockLoad.mockResolvedValue(okResult());
  const markup = renderToStaticMarkup(await Page(props()));

  expect(markup).toContain('data-testid="condensed-report"');
  expect(markup).toContain("Print");
  expect(markup).toContain("Download PDF");
  expect(mockAuditCreate).toHaveBeenCalledTimes(1);
  const data = mockAuditCreate.mock.calls[0][0].data;
  expect(data).toMatchObject({
    entityType: "AssessmentCampaign",
    entityId: "campaign-1",
    action: "GROUP_REPORT_VIEW",
    performedBy: "coach@example.com",
  });
  expect(JSON.parse(data.changes)).toEqual(expect.objectContaining({
    kind: "condensed-ceo",
    submissionId: "submission-ceo",
    versionId: "version-1",
    versionContentHash: "version-hash",
    peer: expect.objectContaining({ sourceId: "peer-source" }),
  }));
  expect(JSON.parse(data.changes)).not.toHaveProperty("teamSubmissionIds");
});

test("fails closed when the view audit cannot be written", async () => {
  mockLoad.mockResolvedValue(okResult());
  mockAuditCreate.mockRejectedValue(new Error("audit unavailable"));
  await expect(Page(props())).rejects.toThrow("audit unavailable");
});
