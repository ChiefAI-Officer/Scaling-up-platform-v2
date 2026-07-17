/**
 * Wave S (spec 19s S-3) — PUT /api/admin/assessment-templates/[id]/benchmarks.
 *
 * Guard ladder: rate limit → 401 (no actor) → 403 (not privileged) →
 * 404 (flag off) → 404 (template missing/deleted) → 404 (alias not
 * render-enabled) → Zod 400 → 409 (no published version) →
 * PeerBenchmarkValidationError 400 → reconcile + audit + saved-set 200.
 *
 * Harness mirrors templates-crud.test.ts (mocked next/server, db,
 * authorization, rate-limit). The peer-benchmarks lib is jest.fn-wrapped
 * around the REAL implementation so call args (validKeys) can be asserted
 * and a throw can be injected, while the success path exercises the real
 * reconcile against the mocked transaction client.
 */

jest.mock("next/server", () => ({
  NextResponse: {
    json: (body: unknown, init?: ResponseInit) =>
      new Response(JSON.stringify(body), {
        status: init?.status || 200,
        headers: init?.headers,
      }),
  },
}));

const txMock = {
  assessmentBenchmark: {
    findMany: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    deleteMany: jest.fn(),
  },
};

jest.mock("@/lib/db", () => ({
  db: {
    assessmentTemplate: { findFirst: jest.fn() },
    assessmentTemplateVersion: { findFirst: jest.fn() },
    auditLog: { create: jest.fn().mockResolvedValue(undefined) },
    $transaction: jest.fn((fn: (tx: typeof txMock) => unknown) => fn(txMock)),
  },
}));

jest.mock("@/lib/auth/authorization", () => ({
  getApiActor: jest.fn(),
  isPrivilegedRole: (role: string) => role === "ADMIN" || role === "STAFF",
}));

jest.mock("@/lib/rate-limit", () => ({
  RateLimits: { standard: {} },
  withRateLimit: jest.fn().mockResolvedValue({ allowed: true, headers: {} }),
}));

jest.mock("@/lib/assessments/peer-benchmarks", () => {
  const actual = jest.requireActual("@/lib/assessments/peer-benchmarks");
  return {
    ...actual,
    reconcileQuestionBenchmarks: jest.fn(actual.reconcileQuestionBenchmarks),
  };
});

import { PUT } from "@/app/api/admin/assessment-templates/[id]/benchmarks/route";
import { db } from "@/lib/db";
import { getApiActor } from "@/lib/auth/authorization";
import { withRateLimit } from "@/lib/rate-limit";
import {
  reconcileQuestionBenchmarks,
  PeerBenchmarkValidationError,
} from "@/lib/assessments/peer-benchmarks";
import { LVA_TEMPLATE_ALIAS } from "@/lib/assessments/lva-report-display";

const adminActor = {
  userId: "u1",
  email: "admin@example.com",
  role: "ADMIN" as const,
  coachId: null,
};

const coachActor = {
  userId: "u2",
  email: "coach@example.com",
  role: "COACH" as const,
  coachId: "coach-1",
};

const routeParams = { params: Promise.resolve({ id: "tpl-1" }) };

function putReq(body: unknown): Request {
  return new Request(
    "http://localhost/api/admin/assessment-templates/tpl-1/benchmarks",
    {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    },
  );
}

/** The published LVA version's questions Json (2 rating + 1 non-rating). */
const PUBLISHED_QUESTIONS = [
  {
    stableKey: "S3_recruitment",
    type: "SLIDER_LIKERT",
    label: "Recruitment of new employees",
  },
  { stableKey: "S3_market", type: "SLIDER_LIKERT", label: "The market" },
  { stableKey: "S1_revenue", type: "NUMBER", label: "Revenue (in million)" },
];

const savedEnabled = process.env.WAVE_S_PEER_BENCHMARKS_ENABLED;
const savedKill = process.env.WAVE_S_PEER_BENCHMARKS_KILL;

beforeEach(() => {
  jest.clearAllMocks();
  process.env.WAVE_S_PEER_BENCHMARKS_ENABLED = "1";
  delete process.env.WAVE_S_PEER_BENCHMARKS_KILL;
  (withRateLimit as jest.Mock).mockResolvedValue({ allowed: true, headers: {} });
  (getApiActor as jest.Mock).mockResolvedValue(adminActor);
  (db.assessmentTemplate.findFirst as jest.Mock).mockResolvedValue({
    id: "tpl-1",
    alias: LVA_TEMPLATE_ALIAS,
  });
  (db.assessmentTemplateVersion.findFirst as jest.Mock).mockResolvedValue({
    id: "ver-1",
    questions: PUBLISHED_QUESTIONS,
  });
  (txMock.assessmentBenchmark.findMany as jest.Mock).mockResolvedValue([]);
  (txMock.assessmentBenchmark.create as jest.Mock).mockResolvedValue({});
  (txMock.assessmentBenchmark.update as jest.Mock).mockResolvedValue({});
  (txMock.assessmentBenchmark.deleteMany as jest.Mock).mockResolvedValue({});
});

afterAll(() => {
  if (savedEnabled === undefined) delete process.env.WAVE_S_PEER_BENCHMARKS_ENABLED;
  else process.env.WAVE_S_PEER_BENCHMARKS_ENABLED = savedEnabled;
  if (savedKill === undefined) delete process.env.WAVE_S_PEER_BENCHMARKS_KILL;
  else process.env.WAVE_S_PEER_BENCHMARKS_KILL = savedKill;
});

describe("PUT /api/admin/assessment-templates/[id]/benchmarks", () => {
  it("429 when rate-limited (withRateLimit wired first)", async () => {
    (withRateLimit as jest.Mock).mockResolvedValueOnce({
      allowed: false,
      headers: {},
    });
    const res = await PUT(putReq({ entries: [] }) as never, routeParams);
    expect(res.status).toBe(429);
    expect(withRateLimit).toHaveBeenCalled();
    expect(getApiActor).not.toHaveBeenCalled();
  });

  it("401 when unauthenticated", async () => {
    (getApiActor as jest.Mock).mockResolvedValue(null);
    const res = await PUT(putReq({ entries: [] }) as never, routeParams);
    expect(res.status).toBe(401);
  });

  it("403 when actor is a coach", async () => {
    (getApiActor as jest.Mock).mockResolvedValue(coachActor);
    const res = await PUT(putReq({ entries: [] }) as never, routeParams);
    expect(res.status).toBe(403);
  });

  it("404 when the Wave S flag is OFF (no DB reads)", async () => {
    delete process.env.WAVE_S_PEER_BENCHMARKS_ENABLED;
    const res = await PUT(putReq({ entries: [] }) as never, routeParams);
    expect(res.status).toBe(404);
    expect(db.assessmentTemplate.findFirst).not.toHaveBeenCalled();
  });

  it("404 when the KILL switch is set even with ENABLED=1", async () => {
    process.env.WAVE_S_PEER_BENCHMARKS_KILL = "1";
    const res = await PUT(putReq({ entries: [] }) as never, routeParams);
    expect(res.status).toBe(404);
  });

  it("404 when template is missing or deleted", async () => {
    (db.assessmentTemplate.findFirst as jest.Mock).mockResolvedValue(null);
    const res = await PUT(putReq({ entries: [] }) as never, routeParams);
    expect(res.status).toBe(404);
    // Soft-deleted templates must be excluded by the query itself.
    const where = (db.assessmentTemplate.findFirst as jest.Mock).mock
      .calls[0][0].where;
    expect(where).toMatchObject({ id: "tpl-1", deletedAt: null });
  });

  it("404 when the template alias is not render-enabled (e.g. qsp-v2)", async () => {
    (db.assessmentTemplate.findFirst as jest.Mock).mockResolvedValue({
      id: "tpl-1",
      alias: "qsp-v2",
    });
    const res = await PUT(
      putReq({ entries: [{ stableKey: "S3_market", value: 5 }] }) as never,
      routeParams,
    );
    expect(res.status).toBe(404);
    expect(reconcileQuestionBenchmarks).not.toHaveBeenCalled();
  });

  it("400 on Zod bad shape (entries not an array)", async () => {
    const res = await PUT(putReq({ entries: "nope" }) as never, routeParams);
    expect(res.status).toBe(400);
    expect(reconcileQuestionBenchmarks).not.toHaveBeenCalled();
  });

  it("400 on Zod bad shape (missing body / not JSON)", async () => {
    const req = new Request(
      "http://localhost/api/admin/assessment-templates/tpl-1/benchmarks",
      { method: "PUT" },
    );
    const res = await PUT(req as never, routeParams);
    expect(res.status).toBe(400);
  });

  it("400 on Zod bad shape (value not a number)", async () => {
    const res = await PUT(
      putReq({ entries: [{ stableKey: "S3_market", value: "6" }] }) as never,
      routeParams,
    );
    expect(res.status).toBe(400);
  });

  it("400 when more than 64 entries (Zod array bound)", async () => {
    const entries = Array.from({ length: 65 }, (_, i) => ({
      stableKey: `S3_k${i}`,
      value: 5,
    }));
    const res = await PUT(putReq({ entries }) as never, routeParams);
    expect(res.status).toBe(400);
    expect(reconcileQuestionBenchmarks).not.toHaveBeenCalled();
  });

  it("409 TEMPLATE_VERSION_NOT_PUBLISHED when no published version exists", async () => {
    (db.assessmentTemplateVersion.findFirst as jest.Mock).mockResolvedValue(null);
    const res = await PUT(
      putReq({ entries: [{ stableKey: "S3_market", value: 5 }] }) as never,
      routeParams,
    );
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.error).toBe("TEMPLATE_VERSION_NOT_PUBLISHED");
    expect(reconcileQuestionBenchmarks).not.toHaveBeenCalled();
  });

  it("ED8: validKeys resolve from the ACTIVE version — where excludes archived (never flag-gated)", async () => {
    // Archived-exclusion is PERSISTED admin intent (Wave-Q doctrine); an
    // all-archived template models as findFirst → null → the 409 above.
    // Here: the latest-published query itself must carry archivedAt: null.
    (db.assessmentTemplateVersion.findFirst as jest.Mock).mockResolvedValue(null);
    const res = await PUT(
      putReq({ entries: [{ stableKey: "S3_market", value: 5 }] }) as never,
      routeParams,
    );
    expect(res.status).toBe(409);
    expect(db.assessmentTemplateVersion.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          templateId: "tpl-1",
          publishedAt: { not: null },
          archivedAt: null,
        },
        orderBy: { versionNumber: "desc" },
      }),
    );
  });

  it("400 with the validation code when reconcile throws PeerBenchmarkValidationError", async () => {
    (reconcileQuestionBenchmarks as jest.Mock).mockImplementationOnce(() => {
      throw new PeerBenchmarkValidationError(
        "UNKNOWN_KEY",
        'Unknown benchmark key "S3_bogus" — not a rating question of the published version.',
      );
    });
    const res = await PUT(
      putReq({ entries: [{ stableKey: "S3_bogus", value: 5 }] }) as never,
      routeParams,
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("UNKNOWN_KEY");
    expect(body.message).toMatch(/S3_bogus/);
    expect(db.auditLog.create).not.toHaveBeenCalled();
  });

  it("400 UNKNOWN_KEY end-to-end for a key outside the published version (real reconcile)", async () => {
    const res = await PUT(
      putReq({ entries: [{ stableKey: "S1_revenue", value: 5 }] }) as never,
      routeParams,
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("UNKNOWN_KEY");
  });

  it("500 (house error handler) on an unexpected reconcile failure", async () => {
    (reconcileQuestionBenchmarks as jest.Mock).mockRejectedValueOnce(
      new Error("db exploded"),
    );
    const consoleSpy = jest
      .spyOn(console, "error")
      .mockImplementation(() => {});
    const res = await PUT(
      putReq({ entries: [{ stableKey: "S3_market", value: 5 }] }) as never,
      routeParams,
    );
    expect(res.status).toBe(500);
    consoleSpy.mockRestore();
  });

  it("success: reconciles with validKeys from the published version, audits before/after, returns the saved set", async () => {
    // One pre-existing row that the submission drops (S3_recruitment) and one
    // new entry (S3_market, rounded 6.25 → 6.3).
    (txMock.assessmentBenchmark.findMany as jest.Mock).mockResolvedValue([
      { id: "b1", metricKey: "S3_recruitment", value: 4 },
    ]);
    const res = await PUT(
      putReq({ entries: [{ stableKey: "S3_market", value: 6.25 }] }) as never,
      routeParams,
    );
    expect(res.status).toBe(200);

    // Reconcile received the validKeys derived from the published version's
    // SLIDER_LIKERT questions only (NUMBER question excluded).
    expect(reconcileQuestionBenchmarks).toHaveBeenCalledTimes(1);
    const input = (reconcileQuestionBenchmarks as jest.Mock).mock.calls[0][1];
    expect(input.templateId).toBe("tpl-1");
    expect([...input.validKeys].sort()).toEqual(["S3_market", "S3_recruitment"]);

    // The real reconcile ran: stale row deleted, new row created (rounded).
    expect(txMock.assessmentBenchmark.deleteMany).toHaveBeenCalledWith({
      where: { id: { in: ["b1"] } },
    });
    expect(txMock.assessmentBenchmark.create).toHaveBeenCalledWith({
      data: {
        templateId: "tpl-1",
        metricKind: "QUESTION",
        metricKey: "S3_market",
        value: 6.3,
      },
    });

    // Audit: BENCHMARKS_RECONCILED with before/after delta.
    expect(db.auditLog.create).toHaveBeenCalledTimes(1);
    const auditData = (db.auditLog.create as jest.Mock).mock.calls[0][0].data;
    expect(auditData.entityType).toBe("ASSESSMENT_TEMPLATE");
    expect(auditData.entityId).toBe("tpl-1");
    expect(auditData.action).toBe("BENCHMARKS_RECONCILED");
    expect(auditData.performedBy).toBe(adminActor.email);
    const changes = JSON.parse(auditData.changes);
    expect(changes.before).toEqual({ S3_recruitment: 4 });
    expect(changes.after).toEqual({ S3_market: 6.3 });

    // Response body: the saved (after) set.
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.entries).toEqual([{ stableKey: "S3_market", value: 6.3 }]);
  });

  it("success with an empty submission clears all rows and returns an empty set", async () => {
    (txMock.assessmentBenchmark.findMany as jest.Mock).mockResolvedValue([
      { id: "b1", metricKey: "S3_market", value: 7 },
    ]);
    const res = await PUT(putReq({ entries: [] }) as never, routeParams);
    expect(res.status).toBe(200);
    expect(txMock.assessmentBenchmark.deleteMany).toHaveBeenCalledWith({
      where: { id: { in: ["b1"] } },
    });
    const body = await res.json();
    expect(body.data.entries).toEqual([]);
  });
});
