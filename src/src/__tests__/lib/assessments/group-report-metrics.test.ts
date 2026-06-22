/**
 * Assessment v7.6 Wave F #22 (R3-M1) — emitGroupReportMetric.
 *
 * Asserts the helper:
 *   - emits a single console.info(JSON.stringify(...)) line (the codebase
 *     structured-log convention)
 *   - namespaces the marker as `assessment.group_report.<event>`
 *   - carries the low-cardinality fields it is given
 *   - NEVER emits PII / high-cardinality fields (defensive strip)
 *   - never throws
 */

import {
  emitGroupReportMetric,
  type GroupReportMetricFields,
} from "@/lib/assessments/group-report-metrics";

function lastMarker(spy: jest.SpyInstance): Record<string, unknown> {
  const call = spy.mock.calls[spy.mock.calls.length - 1];
  return JSON.parse(call[0] as string) as Record<string, unknown>;
}

describe("emitGroupReportMetric", () => {
  let infoSpy: jest.SpyInstance;

  beforeEach(() => {
    infoSpy = jest.spyOn(console, "info").mockImplementation(() => {});
  });

  afterEach(() => {
    infoSpy.mockRestore();
  });

  it("emits one structured console.info line with the assessment.group_report.<event> marker", () => {
    emitGroupReportMetric("view", { role: "ADMIN", latencyMs: 42 });

    expect(infoSpy).toHaveBeenCalledTimes(1);
    const payload = lastMarker(infoSpy);
    expect(payload.marker).toBe("assessment.group_report.view");
    expect(payload.role).toBe("ADMIN");
    expect(payload.latencyMs).toBe(42);
  });

  it("namespaces each event under assessment.group_report.*", () => {
    const events = [
      "view",
      "rate_limited",
      "authz_deny",
      "not_applicable",
      "empty",
      "render_failure",
      "audit_failure",
      "degraded",
      "orphan_submission",
    ] as const;

    for (const ev of events) {
      emitGroupReportMetric(ev);
    }
    const markers = infoSpy.mock.calls.map(
      (c) => (JSON.parse(c[0] as string) as { marker: string }).marker,
    );
    expect(markers).toEqual(events.map((e) => `assessment.group_report.${e}`));
  });

  it("carries low-cardinality fields (counts, reportType, degraded, errorClass)", () => {
    emitGroupReportMetric("view", {
      role: "COACH",
      reportType: "qualitative",
      template: "lva",
      completedCount: 3,
      invitedCount: 5,
      orphanCount: 1,
      degraded: true,
      latencyMs: 123,
      errorClass: "Error",
    });
    const payload = lastMarker(infoSpy);
    expect(payload).toEqual({
      marker: "assessment.group_report.view",
      surface: "group",
      role: "COACH",
      reportType: "qualitative",
      template: "lva",
      completedCount: 3,
      invitedCount: 5,
      orphanCount: 1,
      degraded: true,
      latencyMs: 123,
      errorClass: "Error",
    });
  });

  it("drops undefined fields (only present signals are emitted)", () => {
    emitGroupReportMetric("empty", {
      role: "ADMIN",
      latencyMs: undefined,
      completedCount: 0,
    });
    const payload = lastMarker(infoSpy);
    expect(payload).toEqual({
      marker: "assessment.group_report.empty",
      surface: "group",
      role: "ADMIN",
      completedCount: 0,
    });
    expect("latencyMs" in payload).toBe(false);
  });

  it("NEVER emits PII / high-cardinality fields even if passed (defensive strip)", () => {
    // Cast through unknown — these keys are not on the public type, but a
    // careless future caller must still be unable to leak them.
    emitGroupReportMetric("view", {
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
    } as unknown as GroupReportMetricFields);

    const payload = lastMarker(infoSpy);
    const json = JSON.stringify(payload);

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
      expect(payload).not.toHaveProperty(forbidden);
    }
    // The actual PII values must not appear anywhere in the serialized marker.
    expect(json).not.toContain("Jane CEO");
    expect(json).not.toContain("jane@acme.com");
    expect(json).not.toContain("203.0.113.7");
    expect(json).not.toContain("secret");
    // The allowed field still made it through.
    expect(payload.role).toBe("ADMIN");
  });

  it("never throws (instrumentation is best-effort)", () => {
    // Force JSON.stringify to throw via a circular structure injected through
    // a forbidden-but-stripped path is not enough; instead make console.info
    // throw and confirm the helper swallows it.
    infoSpy.mockImplementation(() => {
      throw new Error("transport down");
    });
    expect(() => emitGroupReportMetric("view", { role: "ADMIN" })).not.toThrow();
  });
});
