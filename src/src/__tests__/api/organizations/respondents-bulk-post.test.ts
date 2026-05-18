/**
 * Assessment v7.6 — Task M.
 *
 * POST /api/organizations/[id]/respondents/bulk
 *
 * Covered:
 *   - auth (401)
 *   - org access (404)
 *   - bad JSON / bad shape (400)
 *   - oversize (422)
 *   - skip mode: existing → skipped
 *   - merge mode: existing → updated (firstName/lastName/teamId)
 *   - team-path resolution: walks tree, creates missing teams, reuses existing
 *   - dedupe-within-payload errors
 *   - returns arrays of {id,email} for created and updated
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

jest.mock("@/lib/db", () => {
  // Build a tx-shaped mock that the route can call. The route uses
  // `db.$transaction(fn)` and passes the tx into `fn`. We give the tx all
  // the same mocked methods.
  const tx = {
    orgRespondent: {
      findFirst: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
    orgTeam: {
      findMany: jest.fn(),
      create: jest.fn(),
    },
  };
  return {
    db: {
      $transaction: jest.fn(async (fn: (t: typeof tx) => Promise<void>) => {
        await fn(tx);
      }),
      auditLog: {
        create: jest.fn().mockResolvedValue(undefined),
      },
      __tx: tx,
    },
  };
});

jest.mock("@/lib/auth/authorization", () => ({
  getApiActor: jest.fn(),
  isPrivilegedRole: (role: string) => role === "ADMIN" || role === "STAFF",
}));

jest.mock("@/lib/rate-limit", () => ({
  RateLimits: { standard: {} },
  withRateLimit: jest.fn().mockResolvedValue({ allowed: true, headers: {} }),
}));

jest.mock("@/lib/assessments/access-control", () => ({
  canAccessOrganization: jest.fn(),
  asAccessDb: (x: unknown) => x,
}));

// We import the route after mocking.
import { POST } from "@/app/api/organizations/[id]/respondents/bulk/route";
import { db } from "@/lib/db";
import { getApiActor } from "@/lib/auth/authorization";
import { canAccessOrganization } from "@/lib/assessments/access-control";

// Pull out the tx mock for assertions.
type TxMock = {
  orgRespondent: {
    findFirst: jest.Mock;
    create: jest.Mock;
    update: jest.Mock;
  };
  orgTeam: {
    findMany: jest.Mock;
    create: jest.Mock;
  };
};
const tx = (db as unknown as { __tx: TxMock }).__tx;

const coachActor = {
  userId: "u1",
  email: "coach@example.com",
  role: "COACH" as const,
  coachId: "coach-1",
};

function paramsFor(orgId: string) {
  return { params: Promise.resolve({ id: orgId }) };
}

function bulkReq(body: unknown): Request {
  return new Request("http://localhost/api/organizations/o1/respondents/bulk", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  jest.clearAllMocks();
  tx.orgRespondent.findFirst.mockReset();
  tx.orgRespondent.create.mockReset();
  tx.orgRespondent.update.mockReset();
  tx.orgTeam.findMany.mockReset();
  tx.orgTeam.create.mockReset();
  // Default: no preexisting teams, no preexisting respondents.
  tx.orgTeam.findMany.mockResolvedValue([]);
  tx.orgRespondent.findFirst.mockResolvedValue(null);
});

describe("POST /api/organizations/[id]/respondents/bulk — auth + access", () => {
  it("returns 401 when unauthenticated", async () => {
    (getApiActor as jest.Mock).mockResolvedValue(null);
    const res = await POST(
      bulkReq({ rows: [], mode: "skip" }) as unknown as never,
      paramsFor("o1") as never,
    );
    expect(res.status).toBe(401);
  });

  it("returns 404 when canAccessOrganization → false", async () => {
    (getApiActor as jest.Mock).mockResolvedValue(coachActor);
    (canAccessOrganization as jest.Mock).mockResolvedValue(false);
    const res = await POST(
      bulkReq({ rows: [], mode: "skip" }) as unknown as never,
      paramsFor("o1") as never,
    );
    expect(res.status).toBe(404);
  });

  it("returns 400 on malformed body", async () => {
    (getApiActor as jest.Mock).mockResolvedValue(coachActor);
    (canAccessOrganization as jest.Mock).mockResolvedValue(true);
    const req = new Request(
      "http://localhost/api/organizations/o1/respondents/bulk",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "{not json",
      },
    );
    const res = await POST(req as unknown as never, paramsFor("o1") as never);
    expect(res.status).toBe(400);
  });

  it("returns 400 on schema-invalid body (missing mode)", async () => {
    (getApiActor as jest.Mock).mockResolvedValue(coachActor);
    (canAccessOrganization as jest.Mock).mockResolvedValue(true);
    const res = await POST(
      bulkReq({ rows: [] }) as unknown as never,
      paramsFor("o1") as never,
    );
    expect(res.status).toBe(400);
  });
});

describe("POST /api/organizations/[id]/respondents/bulk — happy path", () => {
  beforeEach(() => {
    (getApiActor as jest.Mock).mockResolvedValue(coachActor);
    (canAccessOrganization as jest.Mock).mockResolvedValue(true);
  });

  it("creates new respondents and returns {created, updated, skipped, errors} arrays", async () => {
    tx.orgRespondent.create
      .mockResolvedValueOnce({ id: "r1", email: "alice@example.com" })
      .mockResolvedValueOnce({ id: "r2", email: "bob@example.com" });

    const res = await POST(
      bulkReq({
        rows: [
          { name: "Alice Example", email: "alice@example.com", teamPath: [] },
          { name: "Bob Tester", email: "bob@example.com", teamPath: [] },
        ],
        mode: "skip",
      }) as unknown as never,
      paramsFor("o1") as never,
    );
    expect(res.status).toBe(201);
    const body = (await res.json()) as {
      success: boolean;
      data: {
        created: { id: string; email: string }[];
        updated: { id: string; email: string }[];
        skipped: { email: string }[];
        errors: { row: number; reason: string }[];
      };
    };
    expect(body.success).toBe(true);
    expect(body.data.created).toEqual([
      { id: "r1", email: "alice@example.com" },
      { id: "r2", email: "bob@example.com" },
    ]);
    expect(body.data.updated).toEqual([]);
    expect(body.data.skipped).toEqual([]);
    expect(body.data.errors).toEqual([]);
    expect(tx.orgRespondent.create).toHaveBeenCalledTimes(2);
    expect(db.auditLog.create).toHaveBeenCalledTimes(1);
  });
});

describe("POST /api/organizations/[id]/respondents/bulk — skip vs merge", () => {
  beforeEach(() => {
    (getApiActor as jest.Mock).mockResolvedValue(coachActor);
    (canAccessOrganization as jest.Mock).mockResolvedValue(true);
  });

  it("skip mode: existing → no update, returned in skipped[]", async () => {
    tx.orgRespondent.findFirst.mockResolvedValueOnce({
      id: "r1",
      email: "alice@example.com",
      deletedAt: null,
    });

    const res = await POST(
      bulkReq({
        rows: [
          { name: "Alice Renamed", email: "alice@example.com", teamPath: [] },
        ],
        mode: "skip",
      }) as unknown as never,
      paramsFor("o1") as never,
    );
    const body = await res.json();
    expect(body.data.skipped).toEqual([{ email: "alice@example.com" }]);
    expect(body.data.created).toEqual([]);
    expect(body.data.updated).toEqual([]);
    expect(tx.orgRespondent.update).not.toHaveBeenCalled();
    expect(tx.orgRespondent.create).not.toHaveBeenCalled();
  });

  it("merge mode: existing → update firstName/lastName/teamId, returned in updated[]", async () => {
    tx.orgRespondent.findFirst.mockResolvedValueOnce({
      id: "r1",
      email: "alice@example.com",
      deletedAt: null,
    });
    tx.orgRespondent.update.mockResolvedValueOnce({
      id: "r1",
      email: "alice@example.com",
    });

    const res = await POST(
      bulkReq({
        rows: [
          { name: "Alice Renamed", email: "alice@example.com", teamPath: [] },
        ],
        mode: "merge",
      }) as unknown as never,
      paramsFor("o1") as never,
    );
    const body = await res.json();
    expect(body.data.updated).toEqual([
      { id: "r1", email: "alice@example.com" },
    ]);
    expect(body.data.skipped).toEqual([]);
    expect(tx.orgRespondent.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "r1" },
        data: expect.objectContaining({
          firstName: "Alice",
          lastName: "Renamed",
          teamId: null,
        }),
      }),
    );
  });

  it("merge mode revives soft-deleted respondents", async () => {
    tx.orgRespondent.findFirst.mockResolvedValueOnce({
      id: "r1",
      email: "alice@example.com",
      deletedAt: new Date(),
    });
    tx.orgRespondent.update.mockResolvedValueOnce({
      id: "r1",
      email: "alice@example.com",
    });

    const res = await POST(
      bulkReq({
        rows: [{ name: "Alice", email: "alice@example.com", teamPath: [] }],
        mode: "merge",
      }) as unknown as never,
      paramsFor("o1") as never,
    );
    const body = await res.json();
    expect(body.data.updated).toEqual([
      { id: "r1", email: "alice@example.com" },
    ]);
    expect(tx.orgRespondent.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ deletedAt: null }),
      }),
    );
  });
});

describe("POST /api/organizations/[id]/respondents/bulk — teams", () => {
  beforeEach(() => {
    (getApiActor as jest.Mock).mockResolvedValue(coachActor);
    (canAccessOrganization as jest.Mock).mockResolvedValue(true);
  });

  it("creates missing teams in the path and attaches respondent to the leaf", async () => {
    tx.orgTeam.findMany.mockResolvedValueOnce([]);
    tx.orgTeam.create
      .mockResolvedValueOnce({ id: "t-mk", name: "Marketing", parentTeamId: null })
      .mockResolvedValueOnce({ id: "t-gr", name: "Growth", parentTeamId: "t-mk" });
    tx.orgRespondent.create.mockResolvedValueOnce({
      id: "r1",
      email: "alice@example.com",
    });

    const res = await POST(
      bulkReq({
        rows: [
          {
            name: "Alice Example",
            email: "alice@example.com",
            teamPath: ["Marketing", "Growth"],
          },
        ],
        mode: "skip",
      }) as unknown as never,
      paramsFor("o1") as never,
    );
    expect(res.status).toBe(201);
    expect(tx.orgTeam.create).toHaveBeenCalledTimes(2);
    expect(tx.orgRespondent.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ teamId: "t-gr" }),
      }),
    );
  });

  it("reuses existing teams (case-insensitive name match per parent)", async () => {
    tx.orgTeam.findMany.mockResolvedValueOnce([
      { id: "t-mk", name: "Marketing", parentTeamId: null },
    ]);
    tx.orgTeam.create.mockResolvedValueOnce({
      id: "t-gr",
      name: "Growth",
      parentTeamId: "t-mk",
    });
    tx.orgRespondent.create.mockResolvedValueOnce({
      id: "r1",
      email: "alice@example.com",
    });

    const res = await POST(
      bulkReq({
        rows: [
          {
            name: "Alice Example",
            email: "alice@example.com",
            teamPath: ["marketing", "Growth"],
          },
        ],
        mode: "skip",
      }) as unknown as never,
      paramsFor("o1") as never,
    );
    expect(res.status).toBe(201);
    expect(tx.orgTeam.create).toHaveBeenCalledTimes(1);
    expect(tx.orgRespondent.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ teamId: "t-gr" }),
      }),
    );
  });

  it("records a per-row error when team creation fails (partial failure)", async () => {
    tx.orgTeam.findMany.mockResolvedValueOnce([]);
    tx.orgTeam.create.mockRejectedValueOnce(new Error("boom"));
    tx.orgRespondent.create.mockResolvedValueOnce({
      id: "r2",
      email: "bob@example.com",
    });

    const res = await POST(
      bulkReq({
        rows: [
          {
            name: "Alice",
            email: "alice@example.com",
            teamPath: ["BadTeam"],
          },
          { name: "Bob", email: "bob@example.com", teamPath: [] },
        ],
        mode: "skip",
      }) as unknown as never,
      paramsFor("o1") as never,
    );
    const body = await res.json();
    expect(body.data.created).toEqual([
      { id: "r2", email: "bob@example.com" },
    ]);
    expect(body.data.errors).toHaveLength(1);
    expect(body.data.errors[0].reason).toMatch(/team/i);
  });
});

describe("POST /api/organizations/[id]/respondents/bulk — caps + dedupe", () => {
  beforeEach(() => {
    (getApiActor as jest.Mock).mockResolvedValue(coachActor);
    (canAccessOrganization as jest.Mock).mockResolvedValue(true);
  });

  it("returns 422 when rows exceed the 500 cap (server-side defense)", async () => {
    const rows = Array.from({ length: 501 }, (_, i) => ({
      name: `Row ${i + 1}`,
      email: `row${i + 1}@example.com`,
      teamPath: [],
    }));
    const res = await POST(
      bulkReq({ rows, mode: "skip" }) as unknown as never,
      paramsFor("o1") as never,
    );
    expect(res.status).toBe(422);
  });

  it("dedupes the payload by lowercased email and reports duplicates", async () => {
    tx.orgRespondent.create.mockResolvedValueOnce({
      id: "r1",
      email: "alice@example.com",
    });
    const res = await POST(
      bulkReq({
        rows: [
          { name: "Alice", email: "alice@example.com", teamPath: [] },
          { name: "Alice 2", email: "Alice@example.com", teamPath: [] },
        ],
        mode: "skip",
      }) as unknown as never,
      paramsFor("o1") as never,
    );
    const body = await res.json();
    expect(body.data.created).toEqual([
      { id: "r1", email: "alice@example.com" },
    ]);
    expect(body.data.errors).toHaveLength(1);
    expect(body.data.errors[0].reason).toMatch(/duplicate/i);
  });

  it("returns 200 with empty arrays when rows = []", async () => {
    const res = await POST(
      bulkReq({ rows: [], mode: "skip" }) as unknown as never,
      paramsFor("o1") as never,
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data).toEqual({
      created: [],
      updated: [],
      skipped: [],
      errors: [],
    });
    expect(tx.orgRespondent.create).not.toHaveBeenCalled();
  });
});
