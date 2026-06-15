/**
 * Assessment v7.6 — GET/PATCH /api/assessment-campaigns/[id].
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
    organization: { findUnique: jest.fn() },
    accessGroupCoach: { findMany: jest.fn().mockResolvedValue([]) },
    accessGroupTemplate: { findMany: jest.fn().mockResolvedValue([]) },
    assessmentCampaign: (() => {
      // SEC-M6: canManageCampaign now loads via findFirst → delegate to
      // findUnique so existing sequencing is preserved.
      const findUnique = jest.fn();
      const findFirst = jest.fn((args) => findUnique(args));
      return { findUnique, findFirst, update: jest.fn() };
    })(),
    auditLog: { create: jest.fn().mockResolvedValue(undefined) },
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

import { GET, PATCH } from "@/app/api/assessment-campaigns/[id]/route";
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

function detailParams(id: string) {
  return { params: Promise.resolve({ id }) };
}

beforeEach(() => {
  jest.clearAllMocks();
  (db.accessGroupCoach.findMany as jest.Mock).mockResolvedValue([
    {
      accessGroupId: "g1",
      coachId: "coach-1",
      accessGroup: { id: "g1", deletedAt: null },
    },
  ]);
  (db.accessGroupTemplate.findMany as jest.Mock).mockResolvedValue([
    { accessGroupId: "g1", templateId: "tpl-1" },
  ]);
  (db.organization.findUnique as jest.Mock).mockResolvedValue({
    id: "org-1",
    ownerCoachId: "coach-1",
    deletedAt: null,
  });
});

describe("GET /api/assessment-campaigns/[id]", () => {
  it("401 unauthenticated", async () => {
    (getApiActor as jest.Mock).mockResolvedValue(null);
    const res = await GET(
      new Request("http://localhost/api/assessment-campaigns/c1") as never,
      detailParams("c1"),
    );
    expect(res.status).toBe(401);
  });

  it("404 wrong-coach actor (createdByCoachId mismatch)", async () => {
    (getApiActor as jest.Mock).mockResolvedValue(otherCoachActor);
    (db.assessmentCampaign.findUnique as jest.Mock).mockResolvedValue({
      id: "c1",
      organizationId: "org-1",
      templateId: "tpl-1",
      createdByCoachId: "coach-1",
      status: "DRAFT",
    });
    const res = await GET(
      new Request("http://localhost/api/assessment-campaigns/c1") as never,
      detailParams("c1"),
    );
    expect(res.status).toBe(404);
  });

  it("happy path: creator coach reads campaign", async () => {
    (getApiActor as jest.Mock).mockResolvedValue(coachActor);
    (db.assessmentCampaign.findUnique as jest.Mock).mockResolvedValue({
      id: "c1",
      organizationId: "org-1",
      templateId: "tpl-1",
      createdByCoachId: "coach-1",
      status: "DRAFT",
    });
    const res = await GET(
      new Request("http://localhost/api/assessment-campaigns/c1") as never,
      detailParams("c1"),
    );
    expect(res.status).toBe(200);
  });
});

describe("PATCH /api/assessment-campaigns/[id]", () => {
  function patchReq(body: unknown): Request {
    return new Request("http://localhost/api/assessment-campaigns/c1", {
      method: "PATCH",
      body: JSON.stringify(body),
      headers: { "Content-Type": "application/json" },
    });
  }

  it("404 when wrong coach", async () => {
    (getApiActor as jest.Mock).mockResolvedValue(otherCoachActor);
    (db.assessmentCampaign.findUnique as jest.Mock).mockResolvedValue({
      id: "c1",
      organizationId: "org-1",
      templateId: "tpl-1",
      createdByCoachId: "coach-1",
      status: "DRAFT",
    });
    const res = await PATCH(
      patchReq({ name: "Renamed" }) as never,
      detailParams("c1"),
    );
    expect(res.status).toBe(404);
  });

  it("409 when status !== DRAFT", async () => {
    (getApiActor as jest.Mock).mockResolvedValue(coachActor);
    (db.assessmentCampaign.findUnique as jest.Mock).mockResolvedValue({
      id: "c1",
      organizationId: "org-1",
      templateId: "tpl-1",
      createdByCoachId: "coach-1",
      status: "ACTIVE",
    });
    const res = await PATCH(
      patchReq({ name: "Renamed" }) as never,
      detailParams("c1"),
    );
    expect(res.status).toBe(409);
  });

  it("happy path updates name", async () => {
    (getApiActor as jest.Mock).mockResolvedValue(coachActor);
    (db.assessmentCampaign.findUnique as jest.Mock).mockResolvedValue({
      id: "c1",
      organizationId: "org-1",
      templateId: "tpl-1",
      createdByCoachId: "coach-1",
      status: "DRAFT",
    });
    (db.assessmentCampaign.update as jest.Mock).mockResolvedValue({
      id: "c1",
      name: "Renamed",
    });
    const res = await PATCH(
      patchReq({ name: "Renamed" }) as never,
      detailParams("c1"),
    );
    expect(res.status).toBe(200);
    expect(db.assessmentCampaign.update).toHaveBeenCalledWith({
      where: { id: "c1" },
      data: { name: "Renamed" },
    });
  });
});
