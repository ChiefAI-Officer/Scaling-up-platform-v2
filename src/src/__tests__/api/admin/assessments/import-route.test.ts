/**
 * Esperto historical import — POST /api/admin/assessments/import route tests.
 *
 * Spec ref: plan 12a step 7/9. ADMIN-only (STAFF rejected — R2); rate-limited;
 * preview/commit modes; size/row bounds; kind:results→501.
 *
 * Mirrors the existing admin-route test mocking (next/server, db, authorization,
 * rate-limit). The plan/commit modules are real (pure / mocked-tx) — we mock the
 * DB delegates the route touches for org + respondent resolution.
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

jest.mock("@/lib/db", () => ({
  db: {
    organization: { findFirst: jest.fn() },
    orgRespondent: { findMany: jest.fn() },
    $transaction: jest.fn(),
  },
}));

jest.mock("@/lib/auth/authorization", () => ({
  getApiActor: jest.fn(),
}));

jest.mock("@/lib/rate-limit", () => ({
  RateLimits: { standard: { interval: 60000, maxRequests: 100 } },
  withRateLimit: jest.fn().mockResolvedValue({ allowed: true, headers: {} }),
}));

import { POST } from "@/app/api/admin/assessments/import/route";
import { db } from "@/lib/db";
import { getApiActor } from "@/lib/auth/authorization";
import { withRateLimit } from "@/lib/rate-limit";

const adminActor = {
  userId: "admin",
  email: "admin@example.com",
  role: "ADMIN" as const,
  coachId: null,
};
const staffActor = { ...adminActor, role: "STAFF" as const };
const coachActor = {
  userId: "u1",
  email: "coach@example.com",
  role: "COACH" as const,
  coachId: "coach-1",
};

const membersPayload = [
  {
    memberid: "M1",
    title: "CEO",
    firstname: "Jane",
    middlename: "",
    lastname: "Doe",
    email: "jane@example.com",
    status: "active",
    level: "ceofounderwithteam",
    testuser: false,
    extra: [],
  },
];

// Minimal request mock implementing the surface the route uses (`.text()` +
// `.headers.get()`). The jest-env global `Request` lacks a working `.text()`;
// production NextRequest provides both, so this faithfully mirrors runtime.
function req(body: unknown, headers: Record<string, string> = {}): Request {
  const raw = JSON.stringify(body);
  const lower: Record<string, string> = {};
  for (const k of Object.keys(headers)) lower[k.toLowerCase()] = headers[k];
  return {
    headers: { get: (k: string) => lower[k.toLowerCase()] ?? null },
    text: async () => raw,
  } as unknown as Request;
}

beforeEach(() => {
  jest.clearAllMocks();
  (withRateLimit as jest.Mock).mockResolvedValue({ allowed: true, headers: {} });
  (db.organization.findFirst as jest.Mock).mockResolvedValue(null);
  (db.orgRespondent.findMany as jest.Mock).mockResolvedValue([]);
  (db.$transaction as jest.Mock).mockImplementation(
    async (cb: (tx: unknown) => Promise<unknown>) =>
      cb({
        $executeRaw: jest.fn().mockResolvedValue(1),
        organization: {
          findFirst: jest.fn().mockResolvedValue(null),
          create: jest.fn().mockResolvedValue({ id: "org-new" }),
        },
        orgRespondent: {
          findMany: jest.fn().mockResolvedValue([]),
          create: jest.fn().mockResolvedValue({ id: "r-new" }),
          update: jest.fn().mockResolvedValue({ id: "r1" }),
        },
        auditLog: { create: jest.fn().mockResolvedValue({ id: "a1" }) },
      }),
  );
});

describe("POST /api/admin/assessments/import — auth", () => {
  it("401 when unauthenticated", async () => {
    (getApiActor as jest.Mock).mockResolvedValue(null);
    const res = await POST(
      req({ mode: "preview", kind: "roster", ownerCoachId: "c1", companyName: "Acme", payload: membersPayload }),
    );
    expect(res.status).toBe(401);
  });

  it("403 for STAFF (ADMIN-only)", async () => {
    (getApiActor as jest.Mock).mockResolvedValue(staffActor);
    const res = await POST(
      req({ mode: "preview", kind: "roster", ownerCoachId: "c1", companyName: "Acme", payload: membersPayload }),
    );
    expect(res.status).toBe(403);
  });

  it("403 for COACH", async () => {
    (getApiActor as jest.Mock).mockResolvedValue(coachActor);
    const res = await POST(
      req({ mode: "preview", kind: "roster", ownerCoachId: "c1", companyName: "Acme", payload: membersPayload }),
    );
    expect(res.status).toBe(403);
  });

  it("429 when rate-limited", async () => {
    (getApiActor as jest.Mock).mockResolvedValue(adminActor);
    (withRateLimit as jest.Mock).mockResolvedValue({ allowed: false, headers: {} });
    const res = await POST(
      req({ mode: "preview", kind: "roster", ownerCoachId: "c1", companyName: "Acme", payload: membersPayload }),
    );
    expect(res.status).toBe(429);
  });
});

describe("POST /api/admin/assessments/import — validation", () => {
  beforeEach(() => {
    (getApiActor as jest.Mock).mockResolvedValue(adminActor);
  });

  it("400 when payload is not a members export (kind:roster)", async () => {
    const res = await POST(
      req({
        mode: "preview",
        kind: "roster",
        ownerCoachId: "c1",
        companyName: "Acme",
        payload: { personal: [{ variant: "x", campaignid: "y" }], summary: [] },
      }),
    );
    expect(res.status).toBe(400);
  });

  it("400 on malformed / unrecognized payload", async () => {
    const res = await POST(
      req({ mode: "preview", kind: "roster", ownerCoachId: "c1", companyName: "Acme", payload: { nope: true } }),
    );
    expect(res.status).toBe(400);
  });

  it("400 on missing required body fields", async () => {
    const res = await POST(req({ mode: "preview", kind: "roster" }));
    expect(res.status).toBe(400);
  });

  it("413 when the members array exceeds 2000 rows", async () => {
    const big = Array.from({ length: 2001 }, (_, i) => ({
      ...membersPayload[0],
      memberid: `M${i}`,
      email: `u${i}@example.com`,
    }));
    const res = await POST(
      req({ mode: "preview", kind: "roster", ownerCoachId: "c1", companyName: "Acme", payload: big }),
    );
    expect(res.status).toBe(413);
  });

  it("501 for kind:results", async () => {
    const res = await POST(
      req({ mode: "preview", kind: "results", ownerCoachId: "c1", companyName: "Acme", payload: membersPayload }),
    );
    expect(res.status).toBe(501);
  });
});

describe("POST /api/admin/assessments/import — preview", () => {
  beforeEach(() => {
    (getApiActor as jest.Mock).mockResolvedValue(adminActor);
  });

  it("returns the plan with NO writes", async () => {
    const res = await POST(
      req({ mode: "preview", kind: "roster", ownerCoachId: "c1", companyName: "Acme", payload: membersPayload }),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.plan.orgAction).toBe("create");
    expect(body.data.plan.creates).toHaveLength(1);
    // Preview must not open a write transaction.
    expect(db.$transaction).not.toHaveBeenCalled();
  });

  it("reports a resolver-split block in the preview without writing", async () => {
    (db.organization.findFirst as jest.Mock).mockResolvedValue({ id: "org-1" });
    (db.orgRespondent.findMany as jest.Mock).mockResolvedValue([
      { id: "r1", externalId: "OTHER", normalizedEmail: "jane@example.com" },
    ]);
    const res = await POST(
      req({ mode: "preview", kind: "roster", ownerCoachId: "c1", companyName: "Acme", payload: membersPayload }),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.plan.blocks).toEqual([
      { memberid: "M1", reason: "resolver-split" },
    ]);
    expect(db.$transaction).not.toHaveBeenCalled();
  });
});

describe("POST /api/admin/assessments/import — commit", () => {
  beforeEach(() => {
    (getApiActor as jest.Mock).mockResolvedValue(adminActor);
  });

  it("commits and returns counts", async () => {
    const res = await POST(
      req({ mode: "commit", kind: "roster", ownerCoachId: "c1", companyName: "Acme", payload: membersPayload }),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.created).toBe(1);
    expect(db.$transaction).toHaveBeenCalledTimes(1);
  });

  it("409 (no commit) when the plan has blocks", async () => {
    (db.organization.findFirst as jest.Mock).mockResolvedValue({ id: "org-1" });
    (db.orgRespondent.findMany as jest.Mock).mockResolvedValue([
      { id: "r1", externalId: "OTHER", normalizedEmail: "jane@example.com" },
    ]);
    const res = await POST(
      req({ mode: "commit", kind: "roster", ownerCoachId: "c1", companyName: "Acme", payload: membersPayload }),
    );
    expect(res.status).toBe(409);
    expect(db.$transaction).not.toHaveBeenCalled();
  });
});
