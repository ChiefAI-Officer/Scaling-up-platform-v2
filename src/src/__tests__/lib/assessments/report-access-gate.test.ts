/**
 * Report access gate (PR1) — viewGroupReport adapter wiring.
 *
 * The adapter is thin: it resolves actor/headers and pre-binds the per-surface
 * policy, then calls the core `viewReport`. These tests mock the core and the
 * Next/Prisma leaves, then assert the OPTS the adapter hands the core — the key
 * shape (preserved verbatim), classify mapping, auditOf spec, auditFailureFields,
 * and the flag wiring.
 */

jest.mock("@/lib/assessments/report-gate-core", () => ({
  viewReport: jest.fn().mockResolvedValue(undefined),
}));
jest.mock("@/lib/auth/authorization", () => ({ getApiActor: jest.fn() }));
jest.mock("next/headers", () => ({ headers: jest.fn() }));
jest.mock("@/lib/assessments/wave-f-flags", () => ({ isGroupReportEnabled: jest.fn(() => true) }));
jest.mock("@/lib/db", () => ({ db: { auditLog: { create: jest.fn() } } }));
jest.mock("@/lib/assessments/group-report", () => ({ getCampaignGroupReport: jest.fn() }));
jest.mock("@/lib/assessments/report-metrics", () => ({ emitReportMetric: jest.fn() }));
jest.mock("@/lib/rate-limit", () => ({
  checkRateLimitAsync: jest.fn(),
  RateLimits: { standard: { interval: 60000, maxRequests: 100 } },
}));
jest.mock("@/lib/assessments/respondent-report", () => ({ getRespondentReport: jest.fn() }));
jest.mock("@/lib/assessments/report-config", () => ({
  reportConfigFor: jest.fn(() => ({ reportType: "qualitative" })),
}));

import { viewReport } from "@/lib/assessments/report-gate-core";
import { getApiActor } from "@/lib/auth/authorization";
import { headers } from "next/headers";
import { isGroupReportEnabled } from "@/lib/assessments/wave-f-flags";
import {
  viewGroupReport,
  viewRespondentReport,
  ipFromHeaders,
} from "@/lib/assessments/report-access-gate";

const mockViewReport = viewReport as jest.Mock;
const mockGetApiActor = getApiActor as jest.Mock;
const mockHeaders = headers as jest.Mock;
const mockIsEnabled = isGroupReportEnabled as jest.Mock;

function fakeHeaders(map: Record<string, string>) {
  return { get: (k: string) => map[k] ?? null };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function lastOpts(): any {
  return mockViewReport.mock.calls[0][1];
}

beforeEach(() => {
  jest.clearAllMocks();
  mockHeaders.mockResolvedValue(fakeHeaders({ "x-forwarded-for": "9.9.9.9, 1.1.1.1", "user-agent": "UA/1" }));
  mockIsEnabled.mockReturnValue(true);
});

describe("viewGroupReport adapter", () => {
  it("wires surface/policy + the group key with actorKey = coachId first", async () => {
    mockGetApiActor.mockResolvedValue({ userId: "u1", email: "c@x.com", role: "COACH", coachId: "coach-9" });
    await viewGroupReport({} as never, { campaignId: "camp-1", generatedAt: new Date("2026-06-22T00:00:00Z") });
    const opts = lastOpts();
    expect(opts.surface).toBe("group");
    expect(opts.noActorPolicy).toBe("tolerate");
    expect(opts.rateLimitKey).toBe("group-report:coach-9:camp-1:9.9.9.9");
    expect(opts.metricRole).toBe("COACH");
    expect(opts.ip).toBe("9.9.9.9");
    expect(opts.userAgent).toBe("UA/1");
  });

  it("actorKey falls back userId → anon", async () => {
    mockGetApiActor.mockResolvedValue({ userId: "u2", email: "a@x.com", role: "ADMIN", coachId: null });
    await viewGroupReport({} as never, { campaignId: "camp-2", generatedAt: new Date() });
    expect(lastOpts().rateLimitKey).toBe("group-report:u2:camp-2:9.9.9.9");

    mockViewReport.mockClear();
    mockGetApiActor.mockResolvedValue(null);
    await viewGroupReport({} as never, { campaignId: "camp-3", generatedAt: new Date() });
    expect(lastOpts().rateLimitKey).toBe("group-report:anon:camp-3:9.9.9.9");
    expect(lastOpts().metricRole).toBeNull();
  });

  it("classify maps kinds → dispositions (notEnabled → not-found; empty/notApplicable → passthrough)", async () => {
    mockGetApiActor.mockResolvedValue({ userId: "u1", email: "a@x.com", role: "ADMIN", coachId: null });
    await viewGroupReport({} as never, { campaignId: "c", generatedAt: new Date() });
    const { classify } = lastOpts();
    expect(classify({ kind: "ok" })).toBe("ok");
    expect(classify({ kind: "forbidden" })).toBe("forbidden");
    // Wave J (J-3): the loader's dark on/off → SILENT 404 (no audit, no leak).
    expect(classify({ kind: "notEnabled" })).toBe("not-found");
    expect(classify({ kind: "empty" })).toBe("passthrough");
    expect(classify({ kind: "notApplicable" })).toBe("passthrough");
  });

  it("has NO pre-rate-limit flagGate (enablement moved into the loader — Wave J J-3)", async () => {
    const actor = { userId: "u1", email: "a@x.com", role: "ADMIN", coachId: null };
    mockGetApiActor.mockResolvedValue(actor);
    await viewGroupReport({} as never, { campaignId: "camp-9", generatedAt: new Date() });
    // The adapter no longer pre-binds an alias-blind flagGate; the rate limiter
    // runs first and the loader makes the alias-aware enablement decision.
    expect(lastOpts().flagGate).toBeUndefined();
    expect(mockIsEnabled).not.toHaveBeenCalled();
  });

  it("auditOf builds the GROUP_REPORT_VIEW spec from ok provenance", async () => {
    mockGetApiActor.mockResolvedValue({ userId: "u1", email: "a@x.com", role: "ADMIN", coachId: null });
    const gen = new Date("2026-06-22T12:00:00Z");
    await viewGroupReport({} as never, { campaignId: "camp-X", generatedAt: gen });
    const spec = lastOpts().auditOf({
      kind: "ok",
      report: {},
      provenance: {
        versionId: "v-1",
        templateAlias: "lva",
        contentHash: "h",
        ceoParticipantId: "p-1",
        completedCount: 3,
        invitedCount: 5,
        submissionIds: ["s1", "s2"],
      },
    });
    expect(spec.entityType).toBe("AssessmentCampaign");
    expect(spec.action).toBe("GROUP_REPORT_VIEW");
    expect(spec.entityId).toBe("camp-X");
    expect(spec.changes).toMatchObject({
      kind: "group-report",
      generatedAt: gen.toISOString(),
      versionId: "v-1",
      templateAlias: "lva",
      contentHash: "h",
      ceoParticipantId: "p-1",
      completedCount: 3,
      invitedCount: 5,
      submissionIds: ["s1", "s2"],
    });
  });

  it("auditFailureFields returns { template } for ok, {} otherwise", async () => {
    mockGetApiActor.mockResolvedValue({ userId: "u1", email: "a@x.com", role: "ADMIN", coachId: null });
    await viewGroupReport({} as never, { campaignId: "c", generatedAt: new Date() });
    expect(lastOpts().auditFailureFields({ kind: "ok", provenance: { templateAlias: "lva" } })).toEqual({ template: "lva" });
    expect(lastOpts().auditFailureFields({ kind: "empty", provenance: {} })).toEqual({});
  });

  it("ipFromHeaders: first x-forwarded-for hop → x-real-ip → localhost", () => {
    expect(ipFromHeaders(fakeHeaders({ "x-forwarded-for": "9.9.9.9, 1.1.1.1" }) as never)).toBe("9.9.9.9");
    expect(ipFromHeaders(fakeHeaders({ "x-real-ip": "8.8.8.8" }) as never)).toBe("8.8.8.8");
    expect(ipFromHeaders(fakeHeaders({}) as never)).toBe("localhost");
  });
});

describe("viewRespondentReport adapter", () => {
  it("wires surface/policy + the strengthened key (actorKey = coachId first)", async () => {
    mockGetApiActor.mockResolvedValue({ userId: "u1", email: "c@x.com", role: "COACH", coachId: "coach-9" });
    await viewRespondentReport({} as never, { campaignId: "camp-1", respondentId: "resp-7" });
    const opts = lastOpts();
    expect(opts.surface).toBe("respondent");
    expect(opts.noActorPolicy).toBe("redirect-login");
    expect(opts.flagGate).toBeUndefined();
    // fix #2: strengthened from IP-only to actor+campaign+respondent+IP.
    expect(opts.rateLimitKey).toBe("report:coach-9:camp-1:resp-7:9.9.9.9");
    expect(opts.metricRole).toBe("COACH");
    expect(opts.userAgent).toBe("UA/1");
  });

  it("actorKey falls back userId → anon", async () => {
    mockGetApiActor.mockResolvedValue({ userId: "u2", email: "a@x.com", role: "ADMIN", coachId: null });
    await viewRespondentReport({} as never, { campaignId: "c", respondentId: "r" });
    expect(lastOpts().rateLimitKey).toBe("report:u2:c:r:9.9.9.9");

    mockViewReport.mockClear();
    mockGetApiActor.mockResolvedValue(null);
    await viewRespondentReport({} as never, { campaignId: "c", respondentId: "r" });
    expect(lastOpts().rateLimitKey).toBe("report:anon:c:r:9.9.9.9");
    expect(lastOpts().metricRole).toBeNull();
  });

  it("classify maps statuses → dispositions", async () => {
    mockGetApiActor.mockResolvedValue({ userId: "u1", email: "a@x.com", role: "ADMIN", coachId: null });
    await viewRespondentReport({} as never, { campaignId: "c", respondentId: "r" });
    const { classify } = lastOpts();
    expect(classify({ status: "ok" })).toBe("ok");
    expect(classify({ status: "forbidden" })).toBe("forbidden");
    expect(classify({ status: "not-found" })).toBe("not-found");
  });

  it("auditOf builds the VIEW_REPORT spec (templateAlias + reportType + provenance)", async () => {
    mockGetApiActor.mockResolvedValue({ userId: "u1", email: "a@x.com", role: "ADMIN", coachId: null });
    await viewRespondentReport({} as never, { campaignId: "c", respondentId: "r" });
    const spec = lastOpts().auditOf({
      status: "ok",
      report: {
        templateAlias: "lva",
        provenance: { submissionId: "sub-1", versionId: "v-1", contentHash: "h" },
      },
    });
    expect(spec).toMatchObject({
      entityType: "AssessmentSubmission",
      action: "VIEW_REPORT",
      entityId: "sub-1",
    });
    expect(spec.changes).toMatchObject({
      kind: "respondent-report",
      templateAlias: "lva",
      reportType: "qualitative",
      versionId: "v-1",
      contentHash: "h",
    });
  });

  it("auditOf preserves templateAlias ?? null when the alias is undefined", async () => {
    mockGetApiActor.mockResolvedValue({ userId: "u1", email: "a@x.com", role: "ADMIN", coachId: null });
    await viewRespondentReport({} as never, { campaignId: "c", respondentId: "r" });
    const spec = lastOpts().auditOf({
      status: "ok",
      report: { provenance: { submissionId: "s", versionId: "v", contentHash: "h" } },
    });
    expect(spec.changes.templateAlias).toBeNull();
  });

  it("has no auditFailureFields (respondent had no audit_failure metric before)", async () => {
    mockGetApiActor.mockResolvedValue({ userId: "u1", email: "a@x.com", role: "ADMIN", coachId: null });
    await viewRespondentReport({} as never, { campaignId: "c", respondentId: "r" });
    expect(lastOpts().auditFailureFields).toBeUndefined();
  });
});
