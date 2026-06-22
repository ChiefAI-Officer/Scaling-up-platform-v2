/**
 * Report access gate (PR1) — emitReportMetric.
 *
 * The surface-tagged generalization of emitGroupReportMetric. Asserts:
 *   - per-surface marker namespace (group → assessment.group_report.*,
 *     respondent → assessment.respondent_report.*)
 *   - every line carries a `surface` field
 *   - undefined fields dropped
 *   - PII / high-cardinality keys stripped defensively (never leaks)
 *   - never throws
 */

import { emitReportMetric } from "@/lib/assessments/report-metrics";

function lastPayload(spy: jest.SpyInstance): Record<string, unknown> {
  const call = spy.mock.calls[spy.mock.calls.length - 1];
  return JSON.parse(call[0] as string) as Record<string, unknown>;
}

describe("emitReportMetric", () => {
  let infoSpy: jest.SpyInstance;

  beforeEach(() => {
    infoSpy = jest.spyOn(console, "info").mockImplementation(() => {});
  });

  afterEach(() => {
    infoSpy.mockRestore();
  });

  it("namespaces the group surface as assessment.group_report.<event> + tags surface", () => {
    emitReportMetric("group", "view", { role: "ADMIN", latencyMs: 42 });
    const p = lastPayload(infoSpy);
    expect(p.marker).toBe("assessment.group_report.view");
    expect(p.surface).toBe("group");
    expect(p.role).toBe("ADMIN");
    expect(p.latencyMs).toBe(42);
  });

  it("namespaces the respondent surface as assessment.respondent_report.<event> + tags surface", () => {
    emitReportMetric("respondent", "authz_deny", { role: "COACH" });
    const p = lastPayload(infoSpy);
    expect(p.marker).toBe("assessment.respondent_report.authz_deny");
    expect(p.surface).toBe("respondent");
    expect(p.role).toBe("COACH");
  });

  it("drops undefined fields (only present signals are emitted)", () => {
    emitReportMetric("respondent", "rate_limited", {
      role: "ADMIN",
      latencyMs: undefined,
    });
    const p = lastPayload(infoSpy);
    expect("latencyMs" in p).toBe(false);
    expect(p).toEqual({
      marker: "assessment.respondent_report.rate_limited",
      surface: "respondent",
      role: "ADMIN",
    });
  });

  it("strips PII / high-cardinality keys defensively (never leaks values)", () => {
    emitReportMetric("respondent", "view", {
      role: "ADMIN",
      name: "Jane CEO",
      email: "jane@acme.com",
      answer: "free-text secret",
      answers: ["a", "b"],
      message: "stack with email jane@acme.com",
      respondentId: "r-1",
      respondentIds: ["r-1"],
      submissionId: "sub-1",
      submissionIds: ["sub-1"],
      ip: "203.0.113.7",
      ipAddress: "203.0.113.7",
      userAgent: "Mozilla/5.0",
      jobTitle: "Chief Executive",
    });
    const p = lastPayload(infoSpy);
    const json = JSON.stringify(p);
    for (const forbidden of [
      "name",
      "email",
      "answer",
      "answers",
      "message",
      "respondentId",
      "respondentIds",
      "submissionId",
      "submissionIds",
      "ip",
      "ipAddress",
      "userAgent",
      "jobTitle",
    ]) {
      expect(p).not.toHaveProperty(forbidden);
    }
    expect(json).not.toContain("Jane CEO");
    expect(json).not.toContain("jane@acme.com");
    expect(json).not.toContain("203.0.113.7");
    expect(json).not.toContain("secret");
    expect(p.role).toBe("ADMIN");
    expect(p.surface).toBe("respondent");
  });

  it("never throws (instrumentation is best-effort)", () => {
    infoSpy.mockImplementation(() => {
      throw new Error("transport down");
    });
    expect(() => emitReportMetric("group", "view", { role: "ADMIN" })).not.toThrow();
  });
});
