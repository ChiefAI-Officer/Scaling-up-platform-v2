jest.mock("@/lib/assessments/report-gate-core", () => ({
  viewReport: jest.fn().mockResolvedValue({ status: "not-found" }),
}));
jest.mock("next/headers", () => ({
  headers: jest.fn().mockResolvedValue({
    get: (name: string) => (name === "x-forwarded-for" ? "203.0.113.9" : "jest"),
  }),
}));
jest.mock("@/lib/db", () => ({ db: {} }));
jest.mock("@/lib/rate-limit", () => ({
  RateLimits: { standard: { interval: 60_000, maxRequests: 100 } },
}));
jest.mock("@/lib/assessments/member-report", () => ({
  getMemberRespondentReport: jest.fn(),
  getMemberGroupReport: jest.fn(),
}));
jest.mock("@/lib/assessments/report-config", () => ({
  reportConfigFor: () => ({ reportType: "scored" }),
}));

import { viewReport } from "@/lib/assessments/report-gate-core";
import {
  memberRateLimitSubject,
  viewMemberGroupReport,
  viewMemberRespondentReport,
} from "@/lib/assessments/member-report-gate";

const mockViewReport = viewReport as jest.Mock;

describe("member report gate adapters", () => {
  beforeEach(() => mockViewReport.mockClear());

  it("hashes the address in rate-limit keys and never includes the raw address", async () => {
    await viewMemberRespondentReport({} as never, {
      normalizedEmail: "member@example.com",
      submissionId: "submission-1",
    });
    const options = mockViewReport.mock.calls[0][1];
    expect(options.surface).toBe("member");
    expect(options.noActorPolicy).toBe("tolerate");
    expect(options.actor).toBeNull();
    expect(options.auditPrincipal).toBe("member@example.com");
    expect(options.rateLimitKey).toContain(memberRateLimitSubject("member@example.com"));
    expect(options.rateLimitKey).not.toContain("member@example.com");
    expect(options.rateLimitConfig).toEqual({ interval: 60_000, maxRequests: 100 });
  });

  it("uses the member-team audit discriminator and pass-through classifications", async () => {
    await viewMemberGroupReport({} as never, {
      normalizedEmail: "member@example.com",
      campaignId: "campaign-1",
      generatedAt: new Date("2026-09-21T12:00:00Z"),
    });
    const options = mockViewReport.mock.calls[0][1];
    expect(options.classify({ kind: "empty" })).toBe("passthrough");
    expect(options.classify({ kind: "notApplicable" })).toBe("passthrough");
    expect(options.classify({ kind: "forbidden" })).toBe("forbidden");
    expect(
      options.auditOf({
        kind: "ok",
        report: {},
        provenance: {
          versionId: "v1",
          templateAlias: "lva",
          contentHash: "hash",
          completedCount: 2,
          invitedCount: 3,
          submissionIds: ["s1", "s2"],
        },
      }).changes.kind,
    ).toBe("member-team-report");
  });
});
