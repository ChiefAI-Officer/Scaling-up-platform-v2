/**
 * Assessment v7.6 — GET /api/admin/assessment-templates.
 * Admin-only. Bypasses INTERSECTION RBAC. Used by the aggregate dashboard.
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
    assessmentTemplate: { findMany: jest.fn() },
  },
}));

jest.mock("@/lib/auth/authorization", () => ({
  getApiActor: jest.fn(),
  isPrivilegedRole: (role: string) => role === "ADMIN" || role === "STAFF",
}));

import { GET } from "@/app/api/admin/assessment-templates/route";
import { db } from "@/lib/db";
import { getApiActor } from "@/lib/auth/authorization";

const adminActor = {
  userId: "admin",
  email: "admin@example.com",
  role: "ADMIN" as const,
  coachId: null,
};

const coachActor = {
  userId: "u1",
  email: "coach@example.com",
  role: "COACH" as const,
  coachId: "coach-1",
};

beforeEach(() => jest.clearAllMocks());

describe("GET /api/admin/assessment-templates", () => {
  it("401 unauthenticated", async () => {
    (getApiActor as jest.Mock).mockResolvedValue(null);
    const res = await GET(
      new Request("http://localhost/api/admin/assessment-templates") as never,
    );
    expect(res.status).toBe(401);
  });

  it("403 coach", async () => {
    (getApiActor as jest.Mock).mockResolvedValue(coachActor);
    const res = await GET(
      new Request("http://localhost/api/admin/assessment-templates") as never,
    );
    expect(res.status).toBe(403);
  });

  it("200 admin → all non-deleted templates", async () => {
    (getApiActor as jest.Mock).mockResolvedValue(adminActor);
    (db.assessmentTemplate.findMany as jest.Mock).mockResolvedValue([
      {
        id: "t1",
        name: "Rockefeller",
        alias: "rkf",
        aggregationMode: "FULL_VISIBILITY",
      },
    ]);
    const res = await GET(
      new Request("http://localhost/api/admin/assessment-templates") as never,
    );
    expect(res.status).toBe(200);
    expect(db.assessmentTemplate.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { deletedAt: null } }),
    );
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data).toHaveLength(1);
  });
});
