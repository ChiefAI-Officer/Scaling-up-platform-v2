/**
 * Assessment v7.6 — GET /api/admin/assessment-templates/[id]/versions.
 * Admin-only. Returns published versions sorted desc by publishedAt.
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
    assessmentTemplateVersion: { findMany: jest.fn() },
  },
}));

jest.mock("@/lib/auth/authorization", () => ({
  getApiActor: jest.fn(),
  isPrivilegedRole: (role: string) => role === "ADMIN" || role === "STAFF",
}));

import { GET } from "@/app/api/admin/assessment-templates/[id]/versions/route";
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

function params(id: string): Promise<{ id: string }> {
  return Promise.resolve({ id });
}

beforeEach(() => jest.clearAllMocks());

describe("GET /api/admin/assessment-templates/[id]/versions", () => {
  it("401 unauthenticated", async () => {
    (getApiActor as jest.Mock).mockResolvedValue(null);
    const res = await GET(
      new Request("http://localhost/x") as never,
      { params: params("t1") },
    );
    expect(res.status).toBe(401);
  });

  it("403 coach", async () => {
    (getApiActor as jest.Mock).mockResolvedValue(coachActor);
    const res = await GET(
      new Request("http://localhost/x") as never,
      { params: params("t1") },
    );
    expect(res.status).toBe(403);
  });

  it("200 admin → only published versions, sorted desc by publishedAt", async () => {
    (getApiActor as jest.Mock).mockResolvedValue(adminActor);
    const now = new Date("2026-05-15T00:00:00Z");
    (db.assessmentTemplateVersion.findMany as jest.Mock).mockResolvedValue([
      { id: "v2", versionNumber: 2, language: "enUS", publishedAt: now },
      {
        id: "v1",
        versionNumber: 1,
        language: "enUS",
        publishedAt: new Date("2026-05-01T00:00:00Z"),
      },
    ]);

    const res = await GET(
      new Request("http://localhost/x") as never,
      { params: params("t1") },
    );

    expect(res.status).toBe(200);
    expect(db.assessmentTemplateVersion.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { templateId: "t1", publishedAt: { not: null } },
        orderBy: { publishedAt: "desc" },
      }),
    );
    const body = await res.json();
    expect(body.data[0].id).toBe("v2");
    expect(body.data[1].id).toBe("v1");
    expect(typeof body.data[0].publishedAt).toBe("string");
  });
});
