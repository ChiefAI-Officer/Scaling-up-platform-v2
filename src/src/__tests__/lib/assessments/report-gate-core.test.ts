/**
 * Report access gate (PR1) — viewReport core protocol.
 *
 * The single place the cross-cutting report-view protocol lives. These tests
 * assert it against FAKES (no Next/Prisma/loader runtime imports). notFound()/
 * redirect() are mocked as SENTINELS — NO digest string and NO fake
 * unstable_rethrow (Codex C6): the gate calls notFound() OUTSIDE every try, so
 * there is no control-flow-in-catch to simulate.
 */

jest.mock("next/navigation", () => ({
  notFound: jest.fn(() => {
    throw new Error("NEXT_NOTFOUND_SENTINEL");
  }),
  redirect: jest.fn((url: string) => {
    throw new Error(`NEXT_REDIRECT_SENTINEL:${url}`);
  }),
}));

import { notFound, redirect } from "next/navigation";
import { viewReport } from "@/lib/assessments/report-gate-core";

const mockNotFound = notFound as unknown as jest.Mock;
const mockRedirect = redirect as unknown as jest.Mock;

type AnyOutcome = { status?: string; kind?: string; report?: unknown };

const OK = {
  status: "ok",
  report: {
    provenance: { submissionId: "sub-1", versionId: "v-1", contentHash: "h-1" },
    templateAlias: "lva",
    assessmentName: "X",
  },
};

function makeDeps(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    auditSink: { create: jest.fn().mockResolvedValue({ id: "audit-1" }) },
    rateLimiter: jest.fn().mockResolvedValue({ success: true, remaining: 99, resetAt: 0 }),
    emitMetric: jest.fn(),
    ...overrides,
  } as never;
}

function makeOpts(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    surface: "respondent",
    actor: { userId: "u1", email: "admin@example.com", role: "ADMIN", coachId: null },
    noActorPolicy: "redirect-login",
    flagGate: undefined,
    ip: "203.0.113.7",
    userAgent: "jest-agent/1.0",
    rateLimitKey: "report:u1:c1:r1:203.0.113.7",
    rateLimitConfig: { interval: 60000, maxRequests: 100 },
    load: jest.fn().mockResolvedValue(OK as AnyOutcome),
    classify: (o: AnyOutcome) =>
      o.status === "ok" || o.kind === "ok"
        ? "ok"
        : o.status === "forbidden" || o.kind === "forbidden"
          ? "forbidden"
          : o.status === "not-found"
            ? "not-found"
            : "passthrough",
    auditOf: (o: AnyOutcome) => ({
      entityType: "AssessmentSubmission",
      action: "VIEW_REPORT",
      entityId: (o.report as { provenance: { submissionId: string } }).provenance.submissionId,
      changes: { versionId: (o.report as { provenance: { versionId: string } }).provenance.versionId },
    }),
    metricRole: "ADMIN",
    ...overrides,
  } as never;
}

const events = (emit: jest.Mock) => emit.mock.calls.map((c) => c[1]);

beforeEach(() => {
  mockNotFound.mockClear();
  mockRedirect.mockClear();
});

describe("viewReport core protocol", () => {
  // Task 1 — rate-limit EXCEEDED (the regression that shipped twice)
  it.each([
    { surface: "respondent", rateLimitKey: "report:u1:c1:r1:1.2.3.4" },
    { surface: "group", rateLimitKey: "group-report:u1:c1:1.2.3.4" },
  ])("EXCEEDED → notFound, no load, no audit — surface=%s", async ({ surface, rateLimitKey }) => {
    const deps = makeDeps({ rateLimiter: jest.fn().mockResolvedValue({ success: false, remaining: 0, resetAt: 0 }) });
    const opts = makeOpts({ surface, rateLimitKey });
    await expect(viewReport(deps, opts)).rejects.toThrow("NEXT_NOTFOUND_SENTINEL");
    expect((opts as { load: jest.Mock }).load).not.toHaveBeenCalled();
    expect((deps as { auditSink: { create: jest.Mock } }).auditSink.create).not.toHaveBeenCalled();
    expect((deps as { emitMetric: jest.Mock }).emitMetric).toHaveBeenCalledWith(surface, "rate_limited", expect.any(Object));
  });

  // Task 2 — rate-limiter OUTAGE (the exact distinction the old bug got wrong)
  it("OUTAGE → does NOT throw, proceeds, audits, returns OK; no rate_limited / no view", async () => {
    const errSpy = jest.spyOn(console, "error").mockImplementation(() => {});
    const deps = makeDeps({ rateLimiter: jest.fn().mockRejectedValue(new Error("Redis timeout")) });
    const opts = makeOpts();
    const result = await viewReport(deps, opts);
    expect(result).toBe(OK);
    expect((opts as { load: jest.Mock }).load).toHaveBeenCalledTimes(1);
    expect((deps as { auditSink: { create: jest.Mock } }).auditSink.create).toHaveBeenCalledTimes(1);
    expect(errSpy).toHaveBeenCalledWith(expect.stringContaining("rate limiter"), expect.anything());
    const emit = (deps as { emitMetric: jest.Mock }).emitMetric;
    expect(events(emit)).not.toContain("rate_limited");
    expect(events(emit)).not.toContain("view"); // view is PAGE-owned
    errSpy.mockRestore();
  });

  // Task 3 — forbidden (authz_deny) vs not-found (silent)
  it("forbidden → authz_deny + notFound, no audit (both surfaces)", async () => {
    for (const surface of ["respondent", "group"] as const) {
      const deps = makeDeps();
      const opts = makeOpts({ surface, load: jest.fn().mockResolvedValue({ status: "forbidden", kind: "forbidden" }) });
      await expect(viewReport(deps, opts)).rejects.toThrow("NEXT_NOTFOUND_SENTINEL");
      expect((deps as { auditSink: { create: jest.Mock } }).auditSink.create).not.toHaveBeenCalled();
      expect((deps as { emitMetric: jest.Mock }).emitMetric).toHaveBeenCalledWith(surface, "authz_deny", expect.any(Object));
    }
  });

  it("not-found → silent notFound, NO authz_deny, no audit", async () => {
    const deps = makeDeps();
    const opts = makeOpts({ load: jest.fn().mockResolvedValue({ status: "not-found" }) });
    await expect(viewReport(deps, opts)).rejects.toThrow("NEXT_NOTFOUND_SENTINEL");
    expect((deps as { auditSink: { create: jest.Mock } }).auditSink.create).not.toHaveBeenCalled();
    expect(events((deps as { emitMetric: jest.Mock }).emitMetric)).not.toContain("authz_deny");
  });

  // Task 4 — OK + audit THROWS → re-throw; render_failure THEN audit_failure (with surface fields)
  it("OK + audit throw → rejects, emits render_failure then audit_failure (with auditFailureFields)", async () => {
    const deps = makeDeps({ auditSink: { create: jest.fn().mockRejectedValue(new Error("db down")) } });
    const opts = makeOpts({
      surface: "group",
      load: jest.fn().mockResolvedValue({ kind: "ok", report: OK.report, provenance: { templateAlias: "lva" } }),
      auditFailureFields: () => ({ template: "lva" }),
    });
    await expect(viewReport(deps, opts)).rejects.toThrow("db down");
    const emit = (deps as { emitMetric: jest.Mock }).emitMetric;
    expect(events(emit)).toEqual(["render_failure", "audit_failure"]);
    expect(emit).toHaveBeenCalledWith("group", "audit_failure", expect.objectContaining({ template: "lva", errorClass: "Error" }));
  });

  // Task 4b — LOAD throws → only render_failure, no audit_failure
  it("LOAD throw → rejects, render_failure only, no audit_failure, no audit write", async () => {
    const deps = makeDeps();
    const opts = makeOpts({ load: jest.fn().mockRejectedValue(new Error("normalize failed")) });
    await expect(viewReport(deps, opts)).rejects.toThrow("normalize failed");
    const emit = (deps as { emitMetric: jest.Mock }).emitMetric;
    expect(events(emit)).toContain("render_failure");
    expect(events(emit)).not.toContain("audit_failure");
    expect((deps as { auditSink: { create: jest.Mock } }).auditSink.create).not.toHaveBeenCalled();
  });

  // Task 5 — OK + audit OK → returns by reference; row carries IP/UA + provenance + performedBy; no gate view
  it("OK → returns outcome by reference; audit row carries IP/UA + provenance + performedBy; gate emits no view", async () => {
    const deps = makeDeps();
    const opts = makeOpts();
    const result = await viewReport(deps, opts);
    expect(result).toBe(OK);
    const create = (deps as { auditSink: { create: jest.Mock } }).auditSink.create;
    expect(create).toHaveBeenCalledTimes(1);
    expect(create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        ipAddress: "203.0.113.7",
        userAgent: "jest-agent/1.0",
        performedBy: "admin@example.com",
        action: "VIEW_REPORT",
        changes: expect.stringContaining("versionId"),
      }),
    });
    expect(events((deps as { emitMetric: jest.Mock }).emitMetric)).not.toContain("view");
  });

  // Task 6 — passthrough (empty / notApplicable) NOT 404'd, returned by reference
  it("passthrough → returns outcome by reference; no notFound, no audit, no metric", async () => {
    for (const o of [{ kind: "empty", provenance: {} }, { kind: "notApplicable" }]) {
      const deps = makeDeps();
      const opts = makeOpts({ surface: "group", load: jest.fn().mockResolvedValue(o) });
      const result = await viewReport(deps, opts);
      expect(result).toBe(o);
      expect(mockNotFound).not.toHaveBeenCalled();
      expect((deps as { auditSink: { create: jest.Mock } }).auditSink.create).not.toHaveBeenCalled();
      expect((deps as { emitMetric: jest.Mock }).emitMetric).not.toHaveBeenCalled();
    }
  });

  // Task 7 — noActorPolicy
  it("null actor + redirect-login → redirect, no flag/rate-limit/load", async () => {
    const deps = makeDeps();
    const opts = makeOpts({ actor: null, noActorPolicy: "redirect-login", flagGate: jest.fn() });
    await expect(viewReport(deps, opts)).rejects.toThrow("NEXT_REDIRECT_SENTINEL:/login");
    expect((opts as { flagGate: jest.Mock }).flagGate).not.toHaveBeenCalled();
    expect((deps as { rateLimiter: jest.Mock }).rateLimiter).not.toHaveBeenCalled();
    expect((opts as { load: jest.Mock }).load).not.toHaveBeenCalled();
  });

  it("null actor + tolerate + flag true → proceeds to OK", async () => {
    const deps = makeDeps();
    const opts = makeOpts({ actor: null, noActorPolicy: "tolerate", flagGate: () => true });
    const result = await viewReport(deps, opts);
    expect(result).toBe(OK);
    expect((opts as { load: jest.Mock }).load).toHaveBeenCalledTimes(1);
  });

  // Task 8 — flagGate FIRST (before rate-limit / load)
  it("flagGate false → notFound BEFORE rate-limit and load", async () => {
    const order: string[] = [];
    const deps = makeDeps({
      rateLimiter: jest.fn(() => {
        order.push("rateLimiter");
        return Promise.resolve({ success: true, remaining: 1, resetAt: 0 });
      }),
    });
    const opts = makeOpts({
      surface: "group",
      flagGate: jest.fn(() => {
        order.push("flagGate");
        return false;
      }),
      load: jest.fn(() => {
        order.push("load");
        return Promise.resolve(OK);
      }),
    });
    await expect(viewReport(deps, opts)).rejects.toThrow("NEXT_NOTFOUND_SENTINEL");
    expect(order).toEqual(["flagGate"]);
    expect((deps as { rateLimiter: jest.Mock }).rateLimiter).not.toHaveBeenCalled();
    expect((opts as { load: jest.Mock }).load).not.toHaveBeenCalled();
  });
});
