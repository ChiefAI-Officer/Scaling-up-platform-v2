/**
 * Assessment v7.6 — GET + POST /api/admin/access-groups.
 * Admin-only. includeArchived flag. POST duplicate-name → 409.
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
    accessGroup: {
      findMany: jest.fn(),
      findFirst: jest.fn(),
      create: jest.fn(),
    },
  },
}));

jest.mock("@/lib/auth/authorization", () => ({
  getApiActor: jest.fn(),
  isPrivilegedRole: (role: string) => role === "ADMIN" || role === "STAFF",
}));

jest.mock("@/lib/audit", () => ({
  logAudit: jest.fn().mockResolvedValue(undefined),
}));

import { GET, POST } from "@/app/api/admin/access-groups/route";
import { db } from "@/lib/db";
import { getApiActor } from "@/lib/auth/authorization";

const adminActor = {
  userId: "admin-1",
  email: "admin@scalingup.com",
  role: "ADMIN" as const,
  coachId: null,
};

const coachActor = {
  userId: "u1",
  email: "coach@scalingup.com",
  role: "COACH" as const,
  coachId: "coach-1",
};

function asNextReq(url: string, init?: RequestInit): never {
  const req = new Request(url, init);
  return Object.assign(req, { nextUrl: new URL(url) }) as never;
}

beforeEach(() => jest.clearAllMocks());

describe("GET /api/admin/access-groups", () => {
  it("401 unauthenticated", async () => {
    (getApiActor as jest.Mock).mockResolvedValue(null);
    const res = await GET(asNextReq("http://localhost/api/admin/access-groups"));
    expect(res.status).toBe(401);
  });

  it("403 coach actor", async () => {
    (getApiActor as jest.Mock).mockResolvedValue(coachActor);
    const res = await GET(asNextReq("http://localhost/api/admin/access-groups"));
    expect(res.status).toBe(403);
  });

  it("200 admin → excludes archived by default", async () => {
    (getApiActor as jest.Mock).mockResolvedValue(adminActor);
    (db.accessGroup.findMany as jest.Mock).mockResolvedValue([
      {
        id: "ag-1",
        name: "Scaling Up Coaches",
        description: null,
        deletedAt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
        _count: { coachMembers: 3, templateAccess: 2 },
      },
    ]);

    const res = await GET(asNextReq("http://localhost/api/admin/access-groups"));
    expect(res.status).toBe(200);
    expect(db.accessGroup.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { deletedAt: null } }),
    );
    const body = await res.json();
    expect(body.data).toHaveLength(1);
    expect(body.data[0].coachCount).toBe(3);
    expect(body.data[0].templateCount).toBe(2);
  });

  it("200 admin → includeArchived=true returns all rows", async () => {
    (getApiActor as jest.Mock).mockResolvedValue(adminActor);
    (db.accessGroup.findMany as jest.Mock).mockResolvedValue([]);
    const res = await GET(
      asNextReq(
        "http://localhost/api/admin/access-groups?includeArchived=true",
      ),
    );
    expect(res.status).toBe(200);
    expect(db.accessGroup.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: {} }),
    );
  });
});

describe("POST /api/admin/access-groups", () => {
  it("401 unauthenticated", async () => {
    (getApiActor as jest.Mock).mockResolvedValue(null);
    const res = await POST(
      asNextReq("http://localhost/api/admin/access-groups", {
        method: "POST",
        body: JSON.stringify({ name: "x" }),
      }),
    );
    expect(res.status).toBe(401);
  });

  it("400 invalid body", async () => {
    (getApiActor as jest.Mock).mockResolvedValue(adminActor);
    const res = await POST(
      asNextReq("http://localhost/api/admin/access-groups", {
        method: "POST",
        body: JSON.stringify({ name: "" }),
      }),
    );
    expect(res.status).toBe(400);
  });

  it("409 duplicate active name (pre-check)", async () => {
    (getApiActor as jest.Mock).mockResolvedValue(adminActor);
    (db.accessGroup.findFirst as jest.Mock).mockResolvedValue({ id: "ag-1" });
    const res = await POST(
      asNextReq("http://localhost/api/admin/access-groups", {
        method: "POST",
        body: JSON.stringify({ name: "Existing" }),
      }),
    );
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.code).toBe("DUPLICATE_NAME");
  });

  it("201 happy path", async () => {
    (getApiActor as jest.Mock).mockResolvedValue(adminActor);
    (db.accessGroup.findFirst as jest.Mock).mockResolvedValue(null);
    const now = new Date();
    (db.accessGroup.create as jest.Mock).mockResolvedValue({
      id: "new-id",
      name: "New Group",
      description: null,
      deletedAt: null,
      createdAt: now,
      updatedAt: now,
    });
    const res = await POST(
      asNextReq("http://localhost/api/admin/access-groups", {
        method: "POST",
        body: JSON.stringify({ name: "New Group" }),
      }),
    );
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.data.id).toBe("new-id");
    expect(db.accessGroup.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          name: "New Group",
          createdBy: "admin-1",
        }),
      }),
    );
  });
});
