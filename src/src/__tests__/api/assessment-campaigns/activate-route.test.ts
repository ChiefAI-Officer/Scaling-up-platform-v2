/**
 * Assessment v7.6 — POST /api/assessment-campaigns/[id]/activate.
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

import { POST } from "@/app/api/assessment-campaigns/[id]/activate/route";
import { db } from "@/lib/db";
import { getApiActor } from "@/lib/auth/authorization";

const coachActor = {
  userId: "u1",
  email: "coach@example.com",
  role: "COACH" as const,
  coachId: "coach-1",
};

function detailParams(id: string) {
  return { params: Promise.resolve({ id }) };
}

function postReq(): Request {
  return new Request("http://localhost/api/assessment-campaigns/c1/activate", {
    method: "POST",
  });
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

describe("POST /activate", () => {
  it("401 unauthenticated", async () => {
    (getApiActor as jest.Mock).mockResolvedValue(null);
    const res = await POST(postReq() as never, detailParams("c1"));
    expect(res.status).toBe(401);
  });

  it("409 when status not DRAFT", async () => {
    (getApiActor as jest.Mock).mockResolvedValue(coachActor);
    // canManageCampaign findUnique call
    (db.assessmentCampaign.findUnique as jest.Mock).mockResolvedValueOnce({
      id: "c1",
      organizationId: "org-1",
      templateId: "tpl-1",
      createdByCoachId: "coach-1",
      status: "ACTIVE",
    });
    // Activate route's own findUnique call
    (db.assessmentCampaign.findUnique as jest.Mock).mockResolvedValueOnce({
      id: "c1",
      status: "ACTIVE",
      organizationId: "org-1",
      templateId: "tpl-1",
      createdByCoachId: "coach-1",
      template: { id: "tpl-1", aggregationMode: "FULL_VISIBILITY" },
      participants: [{ id: "p1", isCEO: false }],
    });
    const res = await POST(postReq() as never, detailParams("c1"));
    expect(res.status).toBe(409);
  });

  it("409 zero participants", async () => {
    (getApiActor as jest.Mock).mockResolvedValue(coachActor);
    (db.assessmentCampaign.findUnique as jest.Mock).mockResolvedValueOnce({
      id: "c1",
      organizationId: "org-1",
      templateId: "tpl-1",
      createdByCoachId: "coach-1",
      status: "DRAFT",
    });
    (db.assessmentCampaign.findUnique as jest.Mock).mockResolvedValueOnce({
      id: "c1",
      status: "DRAFT",
      organizationId: "org-1",
      templateId: "tpl-1",
      createdByCoachId: "coach-1",
      template: { id: "tpl-1", aggregationMode: "FULL_VISIBILITY" },
      participants: [],
    });
    const res = await POST(postReq() as never, detailParams("c1"));
    expect(res.status).toBe(409);
  });

  it("409 CEO_ONLY template with no CEO", async () => {
    (getApiActor as jest.Mock).mockResolvedValue(coachActor);
    (db.assessmentCampaign.findUnique as jest.Mock).mockResolvedValueOnce({
      id: "c1",
      organizationId: "org-1",
      templateId: "tpl-1",
      createdByCoachId: "coach-1",
      status: "DRAFT",
    });
    (db.assessmentCampaign.findUnique as jest.Mock).mockResolvedValueOnce({
      id: "c1",
      status: "DRAFT",
      organizationId: "org-1",
      templateId: "tpl-1",
      createdByCoachId: "coach-1",
      template: { id: "tpl-1", aggregationMode: "CEO_ONLY" },
      participants: [{ id: "p1", isCEO: false }],
    });
    const res = await POST(postReq() as never, detailParams("c1"));
    expect(res.status).toBe(409);
  });

  it("happy path: DRAFT → ACTIVE", async () => {
    (getApiActor as jest.Mock).mockResolvedValue(coachActor);
    (db.assessmentCampaign.findUnique as jest.Mock).mockResolvedValueOnce({
      id: "c1",
      organizationId: "org-1",
      templateId: "tpl-1",
      createdByCoachId: "coach-1",
      status: "DRAFT",
    });
    (db.assessmentCampaign.findUnique as jest.Mock).mockResolvedValueOnce({
      id: "c1",
      status: "DRAFT",
      organizationId: "org-1",
      templateId: "tpl-1",
      createdByCoachId: "coach-1",
      template: { id: "tpl-1", aggregationMode: "FULL_VISIBILITY" },
      participants: [{ id: "p1", isCEO: false }],
    });
    (db.assessmentCampaign.update as jest.Mock).mockResolvedValue({
      id: "c1",
      status: "ACTIVE",
    });
    const res = await POST(postReq() as never, detailParams("c1"));
    expect(res.status).toBe(200);
    expect(db.assessmentCampaign.update).toHaveBeenCalledWith({
      where: { id: "c1" },
      data: { status: "ACTIVE" },
    });
  });

  it("happy path: CEO_ONLY with 1 CEO activates", async () => {
    (getApiActor as jest.Mock).mockResolvedValue(coachActor);
    (db.assessmentCampaign.findUnique as jest.Mock).mockResolvedValueOnce({
      id: "c1",
      organizationId: "org-1",
      templateId: "tpl-1",
      createdByCoachId: "coach-1",
      status: "DRAFT",
    });
    (db.assessmentCampaign.findUnique as jest.Mock).mockResolvedValueOnce({
      id: "c1",
      status: "DRAFT",
      organizationId: "org-1",
      templateId: "tpl-1",
      createdByCoachId: "coach-1",
      template: { id: "tpl-1", aggregationMode: "CEO_ONLY" },
      participants: [{ id: "p1", isCEO: true }],
    });
    (db.assessmentCampaign.update as jest.Mock).mockResolvedValue({
      id: "c1",
      status: "ACTIVE",
    });
    const res = await POST(postReq() as never, detailParams("c1"));
    expect(res.status).toBe(200);
  });
});
