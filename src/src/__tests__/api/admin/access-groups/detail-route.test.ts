/**
 * Assessment v7.6 — GET + PATCH /api/admin/access-groups/[id].
 * Admin-only. 404 on not-found or soft-deleted (unless includeArchived).
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
      findUnique: jest.fn(),
      update: jest.fn(),
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

import { GET, PATCH } from "@/app/api/admin/access-groups/[id]/route";
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
  coachId: "c1",
};

function asNextReq(url: string, init?: RequestInit): never {
  const req = new Request(url, init);
  return Object.assign(req, { nextUrl: new URL(url) }) as never;
}

function ctx(id: string) {
  return { params: Promise.resolve({ id }) };
}

beforeEach(() => jest.clearAllMocks());

describe("GET /api/admin/access-groups/[id]", () => {
  it("401 unauthenticated", async () => {
    (getApiActor as jest.Mock).mockResolvedValue(null);
    const res = await GET(
      asNextReq("http://localhost/api/admin/access-groups/ag-1"),
      ctx("ag-1"),
    );
    expect(res.status).toBe(401);
  });

  it("403 coach", async () => {
    (getApiActor as jest.Mock).mockResolvedValue(coachActor);
    const res = await GET(
      asNextReq("http://localhost/api/admin/access-groups/ag-1"),
      ctx("ag-1"),
    );
    expect(res.status).toBe(403);
  });

  it("404 not found", async () => {
    (getApiActor as jest.Mock).mockResolvedValue(adminActor);
    (db.accessGroup.findUnique as jest.Mock).mockResolvedValue(null);
    const res = await GET(
      asNextReq("http://localhost/api/admin/access-groups/missing"),
      ctx("missing"),
    );
    expect(res.status).toBe(404);
  });

  it("404 soft-deleted without includeArchived", async () => {
    (getApiActor as jest.Mock).mockResolvedValue(adminActor);
    (db.accessGroup.findUnique as jest.Mock).mockResolvedValue({
      id: "ag-1",
      deletedAt: new Date(),
      coachMembers: [],
      templateAccess: [],
    });
    const res = await GET(
      asNextReq("http://localhost/api/admin/access-groups/ag-1"),
      ctx("ag-1"),
    );
    expect(res.status).toBe(404);
  });

  it("200 includes coachMembers + templateAccess", async () => {
    (getApiActor as jest.Mock).mockResolvedValue(adminActor);
    (db.accessGroup.findUnique as jest.Mock).mockResolvedValue({
      id: "ag-1",
      name: "Scaling Up Coaches",
      description: null,
      accessPolicyVersion: "v1.intersection",
      createdBy: "admin-1",
      createdAt: new Date(),
      updatedAt: new Date(),
      deletedAt: null,
      creator: { id: "admin-1", email: "admin@scalingup.com", name: null },
      coachMembers: [
        {
          id: "agc-1",
          coachId: "c1",
          accessGroupId: "ag-1",
          addedAt: new Date(),
          addedBy: "admin-1",
          coach: {
            id: "c1",
            firstName: "Jane",
            lastName: "Doe",
            email: "jane@x.com",
            certificationStatus: "CERTIFIED",
          },
        },
      ],
      templateAccess: [
        {
          id: "agt-1",
          templateId: "t1",
          accessGroupId: "ag-1",
          addedAt: new Date(),
          addedBy: "admin-1",
          template: {
            id: "t1",
            name: "Rockefeller",
            alias: "rkf",
            aggregationMode: "FULL_VISIBILITY",
            deletedAt: null,
          },
        },
      ],
    });
    const res = await GET(
      asNextReq("http://localhost/api/admin/access-groups/ag-1"),
      ctx("ag-1"),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.coachMembers).toHaveLength(1);
    expect(body.data.templateAccess).toHaveLength(1);
  });
});

describe("PATCH /api/admin/access-groups/[id]", () => {
  it("403 coach", async () => {
    (getApiActor as jest.Mock).mockResolvedValue(coachActor);
    const res = await PATCH(
      asNextReq("http://localhost/api/admin/access-groups/ag-1", {
        method: "PATCH",
        body: JSON.stringify({ name: "x" }),
      }),
      ctx("ag-1"),
    );
    expect(res.status).toBe(403);
  });

  it("200 updates name", async () => {
    (getApiActor as jest.Mock).mockResolvedValue(adminActor);
    (db.accessGroup.findUnique as jest.Mock).mockResolvedValue({
      id: "ag-1",
      deletedAt: null,
      name: "Old",
      description: null,
    });
    (db.accessGroup.update as jest.Mock).mockResolvedValue({
      id: "ag-1",
      name: "New",
      description: null,
      deletedAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    const res = await PATCH(
      asNextReq("http://localhost/api/admin/access-groups/ag-1", {
        method: "PATCH",
        body: JSON.stringify({ name: "New" }),
      }),
      ctx("ag-1"),
    );
    expect(res.status).toBe(200);
    expect(db.accessGroup.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "ag-1" } }),
    );
  });
});
