/**
 * Assessment v7.6 — POST /api/admin/access-groups/[id]/preview-change.
 * DRY-RUN: must NOT call any mutating DB method and MUST NOT write audit logs.
 * Returns a per-coach BEFORE/AFTER diff usable by the preview modal.
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
    accessGroup: { findUnique: jest.fn() },
    accessGroupCoach: { findMany: jest.fn() },
    accessGroupTemplate: { findMany: jest.fn() },
    coach: { findMany: jest.fn() },
    assessmentTemplate: { findUnique: jest.fn() },
    assessmentCampaign: { groupBy: jest.fn() },
    auditLog: { create: jest.fn() },
  },
}));

jest.mock("@/lib/auth/authorization", () => ({
  getApiActor: jest.fn(),
  isPrivilegedRole: (role: string) => role === "ADMIN" || role === "STAFF",
}));

import { POST } from "@/app/api/admin/access-groups/[id]/preview-change/route";
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

beforeEach(() => {
  jest.clearAllMocks();
  (db.accessGroup.findUnique as jest.Mock).mockResolvedValue({
    id: "ag-1",
    deletedAt: null,
  });
  (db.assessmentCampaign.groupBy as jest.Mock).mockResolvedValue([]);
});

describe("POST /api/admin/access-groups/[id]/preview-change", () => {
  it("403 coach", async () => {
    (getApiActor as jest.Mock).mockResolvedValue(coachActor);
    const res = await POST(
      asNextReq("http://localhost/api/admin/access-groups/ag-1/preview-change", {
        method: "POST",
        body: JSON.stringify({
          kind: "REMOVE_COACH_FROM_GROUP",
          coachId: "c1",
        }),
      }),
      ctx("ag-1"),
    );
    expect(res.status).toBe(403);
  });

  it("400 invalid body", async () => {
    (getApiActor as jest.Mock).mockResolvedValue(adminActor);
    const res = await POST(
      asNextReq("http://localhost/api/admin/access-groups/ag-1/preview-change", {
        method: "POST",
        body: JSON.stringify({ kind: "BAD" }),
      }),
      ctx("ag-1"),
    );
    expect(res.status).toBe(400);
  });

  it("404 archived group", async () => {
    (getApiActor as jest.Mock).mockResolvedValue(adminActor);
    (db.accessGroup.findUnique as jest.Mock).mockResolvedValue({
      id: "ag-1",
      deletedAt: new Date(),
    });
    const res = await POST(
      asNextReq("http://localhost/api/admin/access-groups/ag-1/preview-change", {
        method: "POST",
        body: JSON.stringify({
          kind: "REMOVE_TEMPLATE_FROM_GROUP",
          templateId: "t1",
        }),
      }),
      ctx("ag-1"),
    );
    expect(res.status).toBe(404);
  });

  it("200 REMOVE_TEMPLATE_FROM_GROUP → per-coach diff, no DB writes", async () => {
    (getApiActor as jest.Mock).mockResolvedValue(adminActor);
    (db.accessGroupCoach.findMany as jest.Mock).mockImplementation(
      ({ where }) => {
        if (where?.accessGroupId === "ag-1") {
          return Promise.resolve([{ coachId: "c1" }]);
        }
        return Promise.resolve([
          {
            coachId: "c1",
            accessGroupId: "ag-1",
            accessGroup: { id: "ag-1", deletedAt: null },
          },
        ]);
      },
    );
    (db.coach.findMany as jest.Mock).mockResolvedValue([
      { id: "c1", firstName: "Jane", lastName: "Doe", email: "j@x.com" },
    ]);
    (db.accessGroupTemplate.findMany as jest.Mock).mockResolvedValue([
      {
        accessGroupId: "ag-1",
        templateId: "t1",
        template: { id: "t1", name: "Rockefeller", alias: "rkf" },
      },
      {
        accessGroupId: "ag-1",
        templateId: "t2",
        template: { id: "t2", name: "Vision", alias: "vision" },
      },
    ]);

    const res = await POST(
      asNextReq("http://localhost/api/admin/access-groups/ag-1/preview-change", {
        method: "POST",
        body: JSON.stringify({
          kind: "REMOVE_TEMPLATE_FROM_GROUP",
          templateId: "t2",
        }),
      }),
      ctx("ag-1"),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.affectedCoachIds).toEqual(["c1"]);
    expect(body.data.coaches).toHaveLength(1);
    const diff = body.data.coaches[0];
    expect(diff.beforeCount).toBe(2);
    expect(diff.afterCount).toBe(1);
    expect(diff.removedTemplateIds).toEqual(["t2"]);
    expect(diff.wouldDropToZero).toBe(false);
    expect(body.data.wouldBlock).toBe(false);

    // No mutations whatsoever.
    expect(db.auditLog.create).not.toHaveBeenCalled();
  });

  it("flags wouldDropToZero when AFTER is empty AND coach owns active campaigns", async () => {
    (getApiActor as jest.Mock).mockResolvedValue(adminActor);
    (db.accessGroupCoach.findMany as jest.Mock).mockImplementation(
      ({ where }) => {
        if (where?.accessGroupId === "ag-1") {
          return Promise.resolve([{ coachId: "c1" }]);
        }
        return Promise.resolve([
          {
            coachId: "c1",
            accessGroupId: "ag-1",
            accessGroup: { id: "ag-1", deletedAt: null },
          },
        ]);
      },
    );
    (db.coach.findMany as jest.Mock).mockResolvedValue([
      { id: "c1", firstName: "Z", lastName: "Q", email: "zq@x.com" },
    ]);
    (db.accessGroupTemplate.findMany as jest.Mock).mockResolvedValue([
      {
        accessGroupId: "ag-1",
        templateId: "t1",
        template: { id: "t1", name: "Rockefeller", alias: "rkf" },
      },
    ]);
    (db.assessmentCampaign.groupBy as jest.Mock).mockResolvedValue([
      { createdByCoachId: "c1", _count: { _all: 2 } },
    ]);

    const res = await POST(
      asNextReq("http://localhost/api/admin/access-groups/ag-1/preview-change", {
        method: "POST",
        body: JSON.stringify({
          kind: "REMOVE_TEMPLATE_FROM_GROUP",
          templateId: "t1",
        }),
      }),
      ctx("ag-1"),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.wouldBlock).toBe(true);
    expect(body.data.forcedZeroCoachIds).toEqual(["c1"]);
    expect(body.data.coaches[0].wouldDropToZero).toBe(true);
    expect(db.auditLog.create).not.toHaveBeenCalled();
  });
});
