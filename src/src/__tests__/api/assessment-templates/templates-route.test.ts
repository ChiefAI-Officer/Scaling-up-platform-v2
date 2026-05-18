/**
 * Assessment v7.6 — GET /api/assessment-templates.
 * INTERSECTION RBAC enforcement.
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
    accessGroupCoach: { findMany: jest.fn() },
    accessGroupTemplate: { findMany: jest.fn() },
    assessmentTemplate: { findMany: jest.fn() },
  },
}));

jest.mock("@/lib/auth/authorization", () => ({
  getApiActor: jest.fn(),
  isPrivilegedRole: (role: string) => role === "ADMIN" || role === "STAFF",
}));

import { GET } from "@/app/api/assessment-templates/route";
import { db } from "@/lib/db";
import { getApiActor } from "@/lib/auth/authorization";

const coachActor = {
  userId: "u1",
  email: "coach@example.com",
  role: "COACH" as const,
  coachId: "coach-1",
};
const adminActor = {
  userId: "admin",
  email: "admin@example.com",
  role: "ADMIN" as const,
  coachId: null,
};

beforeEach(() => jest.clearAllMocks());

describe("GET /api/assessment-templates", () => {
  it("401 unauthenticated", async () => {
    (getApiActor as jest.Mock).mockResolvedValue(null);
    const res = await GET(
      new Request("http://localhost/api/assessment-templates") as never,
    );
    expect(res.status).toBe(401);
  });

  it("admin sees all non-deleted templates", async () => {
    (getApiActor as jest.Mock).mockResolvedValue(adminActor);
    (db.assessmentTemplate.findMany as jest.Mock).mockResolvedValue([
      { id: "t1", name: "Rockefeller", alias: "rkf", description: null, aggregationMode: "FULL_VISIBILITY" },
    ]);
    const res = await GET(
      new Request("http://localhost/api/assessment-templates") as never,
    );
    expect(res.status).toBe(200);
    expect(db.assessmentTemplate.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { deletedAt: null } }),
    );
  });

  it("coach with no active groups gets empty list", async () => {
    (getApiActor as jest.Mock).mockResolvedValue(coachActor);
    (db.accessGroupCoach.findMany as jest.Mock).mockResolvedValue([]);
    const res = await GET(
      new Request("http://localhost/api/assessment-templates") as never,
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data).toEqual([]);
    expect(db.assessmentTemplate.findMany).not.toHaveBeenCalled();
  });

  it("coach: INTERSECTION — only templates granted by EVERY active group", async () => {
    (getApiActor as jest.Mock).mockResolvedValue(coachActor);
    (db.accessGroupCoach.findMany as jest.Mock).mockResolvedValue([
      { accessGroupId: "g1", coachId: "coach-1", accessGroup: { id: "g1", deletedAt: null } },
      { accessGroupId: "g2", coachId: "coach-1", accessGroup: { id: "g2", deletedAt: null } },
    ]);
    // tpl-1 is granted by BOTH groups → accessible
    // tpl-2 is granted only by g1 → blocked
    (db.accessGroupTemplate.findMany as jest.Mock).mockResolvedValue([
      { accessGroupId: "g1", templateId: "tpl-1" },
      { accessGroupId: "g2", templateId: "tpl-1" },
      { accessGroupId: "g1", templateId: "tpl-2" },
    ]);
    (db.assessmentTemplate.findMany as jest.Mock).mockResolvedValue([
      { id: "tpl-1", name: "R", alias: "r", description: null, aggregationMode: "FULL_VISIBILITY" },
    ]);
    const res = await GET(
      new Request("http://localhost/api/assessment-templates") as never,
    );
    expect(res.status).toBe(200);
    expect(db.assessmentTemplate.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: { in: ["tpl-1"] }, deletedAt: null },
      }),
    );
  });

  it("coach: soft-deleted groups excluded from INTERSECTION denominator", async () => {
    (getApiActor as jest.Mock).mockResolvedValue(coachActor);
    (db.accessGroupCoach.findMany as jest.Mock).mockResolvedValue([
      { accessGroupId: "g1", coachId: "coach-1", accessGroup: { id: "g1", deletedAt: null } },
      { accessGroupId: "g2", coachId: "coach-1", accessGroup: { id: "g2", deletedAt: new Date() } },
    ]);
    // tpl-1 granted only by g1 → accessible because g2 is soft-deleted.
    (db.accessGroupTemplate.findMany as jest.Mock).mockResolvedValue([
      { accessGroupId: "g1", templateId: "tpl-1" },
    ]);
    (db.assessmentTemplate.findMany as jest.Mock).mockResolvedValue([
      { id: "tpl-1", name: "R", alias: "r", description: null, aggregationMode: "FULL_VISIBILITY" },
    ]);
    const res = await GET(
      new Request("http://localhost/api/assessment-templates") as never,
    );
    expect(res.status).toBe(200);
    expect(db.assessmentTemplate.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: { in: ["tpl-1"] }, deletedAt: null },
      }),
    );
  });
});
