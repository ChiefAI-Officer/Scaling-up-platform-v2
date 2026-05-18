/**
 * Assessment v7.6 — POST/GET /api/organizations + GET/PATCH/DELETE /api/organizations/[id]
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
      findMany: jest.fn(),
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
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
  GET as listGet,
  POST as listPost,
} from "@/app/api/organizations/route";
import {
  GET as detailGet,
  PATCH as detailPatch,
  DELETE as detailDelete,
} from "@/app/api/organizations/[id]/route";
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

const adminActor = {
  userId: "admin-u",
  email: "admin@example.com",
  role: "ADMIN" as const,
  coachId: null,
};

function jsonReq(body: unknown, method = "POST"): Request {
  return new Request("http://localhost/api/organizations", {
    method,
    body: JSON.stringify(body),
    headers: { "Content-Type": "application/json" },
  });
}

function detailParams(id: string) {
  return { params: Promise.resolve({ id }) };
}

describe("GET /api/organizations", () => {
  beforeEach(() => jest.clearAllMocks());

  it("401 when unauthenticated", async () => {
    (getApiActor as jest.Mock).mockResolvedValue(null);
    const res = await listGet(
      new Request("http://localhost/api/organizations") as never
    );
    expect(res.status).toBe(401);
  });

  it("coach: lists only orgs they own", async () => {
    (getApiActor as jest.Mock).mockResolvedValue(coachActor);
    (db.organization.findMany as jest.Mock).mockResolvedValue([
      { id: "o1", ownerCoachId: "coach-1" },
    ]);
    const res = await listGet(
      new Request("http://localhost/api/organizations") as never
    );
    expect(res.status).toBe(200);
    expect(db.organization.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { deletedAt: null, ownerCoachId: "coach-1" },
      })
    );
  });

  it("admin: lists all non-deleted orgs", async () => {
    (getApiActor as jest.Mock).mockResolvedValue(adminActor);
    (db.organization.findMany as jest.Mock).mockResolvedValue([]);
    await listGet(
      new Request("http://localhost/api/organizations") as never
    );
    expect(db.organization.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { deletedAt: null },
      })
    );
  });
});

describe("POST /api/organizations", () => {
  beforeEach(() => jest.clearAllMocks());

  it("401 when unauthenticated", async () => {
    (getApiActor as jest.Mock).mockResolvedValue(null);
    const res = await listPost(jsonReq({ name: "x" }) as never);
    expect(res.status).toBe(401);
  });

  it("403 when actor has no coachId (admin)", async () => {
    (getApiActor as jest.Mock).mockResolvedValue(adminActor);
    const res = await listPost(jsonReq({ name: "x" }) as never);
    expect(res.status).toBe(403);
  });

  it("400 when body missing name", async () => {
    (getApiActor as jest.Mock).mockResolvedValue(coachActor);
    const res = await listPost(jsonReq({}) as never);
    expect(res.status).toBe(400);
  });

  it("happy path: creates org owned by coach", async () => {
    (getApiActor as jest.Mock).mockResolvedValue(coachActor);
    const created = {
      id: "o1",
      name: "Acme",
      externalId: null,
      ownerCoachId: "coach-1",
    };
    (db.organization.create as jest.Mock).mockResolvedValue(created);
    const res = await listPost(jsonReq({ name: "Acme" }) as never);
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.data).toEqual(created);
    expect(db.organization.create).toHaveBeenCalledWith({
      data: { name: "Acme", externalId: null, ownerCoachId: "coach-1" },
    });
  });

  it("409 on duplicate externalId (P2002)", async () => {
    (getApiActor as jest.Mock).mockResolvedValue(coachActor);
    const err = Object.assign(new Error("dup"), { code: "P2002" });
    (db.organization.create as jest.Mock).mockRejectedValue(err);
    const res = await listPost(
      jsonReq({ name: "Acme", externalId: "ext-1" }) as never
    );
    expect(res.status).toBe(409);
  });
});

describe("GET /api/organizations/[id]", () => {
  beforeEach(() => jest.clearAllMocks());

  it("401 unauthenticated", async () => {
    (getApiActor as jest.Mock).mockResolvedValue(null);
    const res = await detailGet(
      new Request("http://localhost/api/organizations/o1") as never,
      detailParams("o1")
    );
    expect(res.status).toBe(401);
  });

  it("404 when wrong-coach actor", async () => {
    (getApiActor as jest.Mock).mockResolvedValue(otherCoachActor);
    (db.organization.findUnique as jest.Mock).mockResolvedValue({
      id: "o1",
      ownerCoachId: "coach-1",
      deletedAt: null,
    });
    const res = await detailGet(
      new Request("http://localhost/api/organizations/o1") as never,
      detailParams("o1")
    );
    expect(res.status).toBe(404);
  });

  it("happy path: owner coach reads org", async () => {
    (getApiActor as jest.Mock).mockResolvedValue(coachActor);
    (db.organization.findUnique as jest.Mock).mockResolvedValue({
      id: "o1",
      ownerCoachId: "coach-1",
      deletedAt: null,
      name: "Acme",
    });
    const res = await detailGet(
      new Request("http://localhost/api/organizations/o1") as never,
      detailParams("o1")
    );
    expect(res.status).toBe(200);
  });

  it("404 when soft-deleted", async () => {
    (getApiActor as jest.Mock).mockResolvedValue(coachActor);
    (db.organization.findUnique as jest.Mock).mockResolvedValue({
      id: "o1",
      ownerCoachId: "coach-1",
      deletedAt: new Date(),
    });
    const res = await detailGet(
      new Request("http://localhost/api/organizations/o1") as never,
      detailParams("o1")
    );
    expect(res.status).toBe(404);
  });
});

describe("PATCH /api/organizations/[id]", () => {
  beforeEach(() => jest.clearAllMocks());

  it("404 wrong-coach actor", async () => {
    (getApiActor as jest.Mock).mockResolvedValue(otherCoachActor);
    (db.organization.findUnique as jest.Mock).mockResolvedValue({
      id: "o1",
      ownerCoachId: "coach-1",
      deletedAt: null,
    });
    const res = await detailPatch(
      jsonReq({ name: "New" }, "PATCH") as never,
      detailParams("o1")
    );
    expect(res.status).toBe(404);
  });

  it("happy path: owner updates name", async () => {
    (getApiActor as jest.Mock).mockResolvedValue(coachActor);
    (db.organization.findUnique as jest.Mock).mockResolvedValue({
      id: "o1",
      ownerCoachId: "coach-1",
      deletedAt: null,
    });
    (db.organization.update as jest.Mock).mockResolvedValue({
      id: "o1",
      name: "Renamed",
    });
    const res = await detailPatch(
      jsonReq({ name: "Renamed" }, "PATCH") as never,
      detailParams("o1")
    );
    expect(res.status).toBe(200);
    expect(db.organization.update).toHaveBeenCalledWith({
      where: { id: "o1" },
      data: { name: "Renamed" },
    });
  });
});

describe("DELETE /api/organizations/[id]", () => {
  beforeEach(() => jest.clearAllMocks());

  it("soft-deletes (sets deletedAt)", async () => {
    (getApiActor as jest.Mock).mockResolvedValue(coachActor);
    (db.organization.findUnique as jest.Mock).mockResolvedValue({
      id: "o1",
      ownerCoachId: "coach-1",
      deletedAt: null,
    });
    (db.organization.update as jest.Mock).mockResolvedValue({});
    const res = await detailDelete(
      new Request("http://localhost/api/organizations/o1", {
        method: "DELETE",
      }) as never,
      detailParams("o1")
    );
    expect(res.status).toBe(200);
    expect(db.organization.update).toHaveBeenCalledWith({
      where: { id: "o1" },
      data: { deletedAt: expect.any(Date) },
    });
  });

  it("404 wrong-coach actor", async () => {
    (getApiActor as jest.Mock).mockResolvedValue(otherCoachActor);
    (db.organization.findUnique as jest.Mock).mockResolvedValue({
      id: "o1",
      ownerCoachId: "coach-1",
      deletedAt: null,
    });
    const res = await detailDelete(
      new Request("http://localhost/api/organizations/o1", {
        method: "DELETE",
      }) as never,
      detailParams("o1")
    );
    expect(res.status).toBe(404);
  });
});
