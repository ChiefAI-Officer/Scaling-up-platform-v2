/**
 * Assessment v7.6 — Team CRUD routes.
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
    organization: {
      findUnique: jest.fn(),
    },
    orgTeam: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      count: jest.fn(),
    },
    auditLog: {
      create: jest.fn().mockResolvedValue(undefined),
    },
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

import {
  GET as teamsGet,
  POST as teamsPost,
  buildTeamTree,
} from "@/app/api/organizations/[id]/teams/route";
import {
  PATCH as teamPatch,
  DELETE as teamDelete,
} from "@/app/api/organizations/[id]/teams/[teamId]/route";
import { db } from "@/lib/db";
import { getApiActor } from "@/lib/auth/authorization";

const coachActor = {
  userId: "u1",
  email: "coach@example.com",
  role: "COACH" as const,
  coachId: "coach-1",
};

const otherCoachActor = {
  userId: "u2",
  email: "other@example.com",
  role: "COACH" as const,
  coachId: "coach-2",
};

function jsonReq(body: unknown, method = "POST"): Request {
  return new Request("http://localhost/api/organizations/o1/teams", {
    method,
    body: JSON.stringify(body),
    headers: { "Content-Type": "application/json" },
  });
}

function collParams() {
  return { params: Promise.resolve({ id: "o1" }) };
}

function detailParams(teamId = "t1") {
  return { params: Promise.resolve({ id: "o1", teamId }) };
}

function mockOwnedOrg() {
  (db.organization.findUnique as jest.Mock).mockResolvedValue({
    id: "o1",
    ownerCoachId: "coach-1",
    deletedAt: null,
  });
}

describe("buildTeamTree", () => {
  it("nests children under parents", () => {
    const tree = buildTeamTree([
      {
        id: "a",
        organizationId: "o1",
        parentTeamId: null,
        name: "A",
        type: null,
        description: null,
        createdAt: new Date(),
        updatedAt: new Date(),
        deletedAt: null,
      },
      {
        id: "b",
        organizationId: "o1",
        parentTeamId: "a",
        name: "B",
        type: null,
        description: null,
        createdAt: new Date(),
        updatedAt: new Date(),
        deletedAt: null,
      },
    ]);
    expect(tree).toHaveLength(1);
    expect(tree[0].id).toBe("a");
    expect(tree[0].children[0].id).toBe("b");
  });
});

describe("GET /api/organizations/[id]/teams", () => {
  beforeEach(() => jest.clearAllMocks());

  it("401 unauthenticated", async () => {
    (getApiActor as jest.Mock).mockResolvedValue(null);
    const res = await teamsGet(
      new Request("http://localhost") as never,
      collParams()
    );
    expect(res.status).toBe(401);
  });

  it("404 wrong-coach actor", async () => {
    (getApiActor as jest.Mock).mockResolvedValue(otherCoachActor);
    mockOwnedOrg();
    const res = await teamsGet(
      new Request("http://localhost") as never,
      collParams()
    );
    expect(res.status).toBe(404);
  });

  it("happy path returns tree-shaped data", async () => {
    (getApiActor as jest.Mock).mockResolvedValue(coachActor);
    mockOwnedOrg();
    (db.orgTeam.findMany as jest.Mock).mockResolvedValue([
      {
        id: "t1",
        organizationId: "o1",
        parentTeamId: null,
        name: "Root",
        type: null,
        description: null,
        createdAt: new Date(),
        updatedAt: new Date(),
        deletedAt: null,
      },
    ]);
    const res = await teamsGet(
      new Request("http://localhost") as never,
      collParams()
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data).toHaveLength(1);
    expect(body.data[0].children).toEqual([]);
  });

  it("excludes soft-deleted teams", async () => {
    (getApiActor as jest.Mock).mockResolvedValue(coachActor);
    mockOwnedOrg();
    (db.orgTeam.findMany as jest.Mock).mockResolvedValue([]);
    await teamsGet(new Request("http://localhost") as never, collParams());
    expect(db.orgTeam.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { organizationId: "o1", deletedAt: null },
      })
    );
  });
});

describe("POST /api/organizations/[id]/teams", () => {
  beforeEach(() => jest.clearAllMocks());

  it("400 when name missing", async () => {
    (getApiActor as jest.Mock).mockResolvedValue(coachActor);
    mockOwnedOrg();
    const res = await teamsPost(jsonReq({}) as never, collParams());
    expect(res.status).toBe(400);
  });

  it("400 when parentTeamId is in different org", async () => {
    (getApiActor as jest.Mock).mockResolvedValue(coachActor);
    mockOwnedOrg();
    (db.orgTeam.findUnique as jest.Mock).mockResolvedValue({
      id: "parent-x",
      organizationId: "other-org",
      deletedAt: null,
    });
    const res = await teamsPost(
      jsonReq({ name: "T", parentTeamId: "parent-x" }) as never,
      collParams()
    );
    expect(res.status).toBe(400);
  });

  it("happy path creates team", async () => {
    (getApiActor as jest.Mock).mockResolvedValue(coachActor);
    mockOwnedOrg();
    const created = {
      id: "t-new",
      name: "Team",
      organizationId: "o1",
      parentTeamId: null,
    };
    (db.orgTeam.create as jest.Mock).mockResolvedValue(created);
    const res = await teamsPost(
      jsonReq({ name: "Team" }) as never,
      collParams()
    );
    expect(res.status).toBe(201);
  });
});

describe("PATCH /api/organizations/[id]/teams/[teamId]", () => {
  beforeEach(() => jest.clearAllMocks());

  it("400 when parentTeamId would create a cycle", async () => {
    (getApiActor as jest.Mock).mockResolvedValue(coachActor);
    mockOwnedOrg();
    // First call: existing team
    (db.orgTeam.findUnique as jest.Mock)
      .mockResolvedValueOnce({
        id: "t1",
        organizationId: "o1",
        parentTeamId: null,
        deletedAt: null,
      })
      // Second call: proposed parent t2 exists in this org
      .mockResolvedValueOnce({
        id: "t2",
        organizationId: "o1",
        parentTeamId: "t1",
        deletedAt: null,
      });
    // findMany call inside getDescendantIds: t2 is a child of t1.
    (db.orgTeam.findMany as jest.Mock).mockResolvedValue([
      { id: "t1", parentTeamId: null },
      { id: "t2", parentTeamId: "t1" },
    ]);
    const res = await teamPatch(
      jsonReq({ parentTeamId: "t2" }, "PATCH") as never,
      detailParams("t1")
    );
    expect(res.status).toBe(400);
  });

  it("400 when setting team as its own parent", async () => {
    (getApiActor as jest.Mock).mockResolvedValue(coachActor);
    mockOwnedOrg();
    (db.orgTeam.findUnique as jest.Mock).mockResolvedValueOnce({
      id: "t1",
      organizationId: "o1",
      parentTeamId: null,
      deletedAt: null,
    });
    const res = await teamPatch(
      jsonReq({ parentTeamId: "t1" }, "PATCH") as never,
      detailParams("t1")
    );
    expect(res.status).toBe(400);
  });

  it("happy path: rename team", async () => {
    (getApiActor as jest.Mock).mockResolvedValue(coachActor);
    mockOwnedOrg();
    (db.orgTeam.findUnique as jest.Mock).mockResolvedValue({
      id: "t1",
      organizationId: "o1",
      parentTeamId: null,
      deletedAt: null,
    });
    (db.orgTeam.update as jest.Mock).mockResolvedValue({
      id: "t1",
      name: "Renamed",
    });
    const res = await teamPatch(
      jsonReq({ name: "Renamed" }, "PATCH") as never,
      detailParams("t1")
    );
    expect(res.status).toBe(200);
  });

  it("404 when wrong-coach actor", async () => {
    (getApiActor as jest.Mock).mockResolvedValue(otherCoachActor);
    mockOwnedOrg();
    const res = await teamPatch(
      jsonReq({ name: "X" }, "PATCH") as never,
      detailParams("t1")
    );
    expect(res.status).toBe(404);
  });
});

describe("DELETE /api/organizations/[id]/teams/[teamId]", () => {
  beforeEach(() => jest.clearAllMocks());

  it("409 when team has children", async () => {
    (getApiActor as jest.Mock).mockResolvedValue(coachActor);
    mockOwnedOrg();
    (db.orgTeam.findUnique as jest.Mock).mockResolvedValue({
      id: "t1",
      organizationId: "o1",
      parentTeamId: null,
      deletedAt: null,
    });
    (db.orgTeam.count as jest.Mock).mockResolvedValue(2);
    const res = await teamDelete(
      new Request("http://localhost", { method: "DELETE" }) as never,
      detailParams("t1")
    );
    expect(res.status).toBe(409);
  });

  it("soft-deletes when no children", async () => {
    (getApiActor as jest.Mock).mockResolvedValue(coachActor);
    mockOwnedOrg();
    (db.orgTeam.findUnique as jest.Mock).mockResolvedValue({
      id: "t1",
      organizationId: "o1",
      parentTeamId: null,
      deletedAt: null,
    });
    (db.orgTeam.count as jest.Mock).mockResolvedValue(0);
    (db.orgTeam.update as jest.Mock).mockResolvedValue({});
    const res = await teamDelete(
      new Request("http://localhost", { method: "DELETE" }) as never,
      detailParams("t1")
    );
    expect(res.status).toBe(200);
    expect(db.orgTeam.update).toHaveBeenCalledWith({
      where: { id: "t1" },
      data: { deletedAt: expect.any(Date) },
    });
  });
});
