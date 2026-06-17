/**
 * Assessment v7.6 — GET/POST /api/assessment-campaigns.
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
    coach: { findUnique: jest.fn() },
    accessGroupCoach: { findMany: jest.fn().mockResolvedValue([]) },
    accessGroupTemplate: { findMany: jest.fn().mockResolvedValue([]) },
    assessmentTemplate: { findUnique: jest.fn() },
    assessmentTemplateVersion: { findFirst: jest.fn() },
    assessmentCampaign: {
      findMany: jest.fn(),
      create: jest.fn(),
    },
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

import { GET, POST } from "@/app/api/assessment-campaigns/route";
import { db } from "@/lib/db";
import { getApiActor } from "@/lib/auth/authorization";

const coachActor = {
  userId: "u1",
  email: "coach@example.com",
  role: "COACH" as const,
  coachId: "coach-1",
};
const adminActor = {
  userId: "admin-u",
  email: "admin@example.com",
  role: "ADMIN" as const,
  coachId: null,
};

function jsonReq(body: unknown, method = "POST"): Request {
  return new Request("http://localhost/api/assessment-campaigns", {
    method,
    body: JSON.stringify(body),
    headers: { "Content-Type": "application/json" },
  });
}

beforeEach(() => {
  jest.clearAllMocks();
  // Default access-group state: coach in 1 group that grants the template.
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
  (db.coach.findUnique as jest.Mock).mockResolvedValue({
    id: "coach-1",
    certificationStatus: "ACTIVE",
  });
  (db.organization.findUnique as jest.Mock).mockResolvedValue({
    id: "org-1",
    ownerCoachId: "coach-1",
    deletedAt: null,
    name: "Acme",
  });
  (db.assessmentTemplate.findUnique as jest.Mock).mockResolvedValue({
    id: "tpl-1",
    alias: "rockefeller",
  });
  (db.assessmentTemplateVersion.findFirst as jest.Mock).mockResolvedValue({
    id: "ver-1",
    language: "enUS",
    versionNumber: 1,
    publishedAt: new Date(),
  });
});

describe("GET /api/assessment-campaigns", () => {
  it("401 unauthenticated", async () => {
    (getApiActor as jest.Mock).mockResolvedValue(null);
    const res = await GET(
      new Request("http://localhost/api/assessment-campaigns") as never,
    );
    expect(res.status).toBe(401);
  });

  it("coach: filters by createdByCoachId", async () => {
    (getApiActor as jest.Mock).mockResolvedValue(coachActor);
    (db.assessmentCampaign.findMany as jest.Mock).mockResolvedValue([]);
    await GET(
      new Request("http://localhost/api/assessment-campaigns") as never,
    );
    expect(db.assessmentCampaign.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        // SEC-M6: live guard is always present.
        where: { createdByCoachId: "coach-1", deletedAt: null },
      }),
    );
  });

  it("admin: no createdByCoachId filter", async () => {
    (getApiActor as jest.Mock).mockResolvedValue(adminActor);
    (db.assessmentCampaign.findMany as jest.Mock).mockResolvedValue([]);
    await GET(
      new Request("http://localhost/api/assessment-campaigns") as never,
    );
    expect(db.assessmentCampaign.findMany).toHaveBeenCalledWith(
      // SEC-M6: even admins only see live campaigns in the list.
      expect.objectContaining({ where: { deletedAt: null } }),
    );
  });
});

describe("POST /api/assessment-campaigns", () => {
  const validBody = {
    name: "Q3",
    templateId: "tpl-1",
    organizationId: "org-1",
    openAt: "2026-06-01T10:00:00Z",
    endMode: "OPEN_END",
  };

  it("401 unauthenticated", async () => {
    (getApiActor as jest.Mock).mockResolvedValue(null);
    const res = await POST(jsonReq(validBody) as never);
    expect(res.status).toBe(401);
  });

  it("403 when actor has no coachId (admin)", async () => {
    (getApiActor as jest.Mock).mockResolvedValue(adminActor);
    const res = await POST(jsonReq(validBody) as never);
    expect(res.status).toBe(403);
  });

  it("400 invalid body", async () => {
    (getApiActor as jest.Mock).mockResolvedValue(coachActor);
    const res = await POST(jsonReq({ name: "x" }) as never);
    expect(res.status).toBe(400);
  });

  it("400 ENDS_AFTER missing closeAt", async () => {
    (getApiActor as jest.Mock).mockResolvedValue(coachActor);
    const res = await POST(
      jsonReq({ ...validBody, endMode: "ENDS_AFTER" }) as never,
    );
    expect(res.status).toBe(400);
  });

  it("404 when canAccessOrganization false", async () => {
    (getApiActor as jest.Mock).mockResolvedValue(coachActor);
    (db.organization.findUnique as jest.Mock).mockResolvedValue({
      id: "org-1",
      ownerCoachId: "coach-OTHER",
      deletedAt: null,
    });
    const res = await POST(jsonReq(validBody) as never);
    expect(res.status).toBe(404);
  });

  it("403 when canCreateCampaign false (INTERSECTION denial)", async () => {
    (getApiActor as jest.Mock).mockResolvedValue(coachActor);
    // Coach is in 2 groups, but only 1 grants the template → INTERSECTION fails.
    (db.accessGroupCoach.findMany as jest.Mock).mockResolvedValue([
      {
        accessGroupId: "g1",
        coachId: "coach-1",
        accessGroup: { id: "g1", deletedAt: null },
      },
      {
        accessGroupId: "g2",
        coachId: "coach-1",
        accessGroup: { id: "g2", deletedAt: null },
      },
    ]);
    (db.accessGroupTemplate.findMany as jest.Mock).mockResolvedValue([
      { accessGroupId: "g1", templateId: "tpl-1" },
    ]);
    const res = await POST(jsonReq(validBody) as never);
    expect(res.status).toBe(403);
  });

  it("403 when coach not certified", async () => {
    (getApiActor as jest.Mock).mockResolvedValue(coachActor);
    (db.coach.findUnique as jest.Mock).mockResolvedValue({
      id: "coach-1",
      certificationStatus: "PENDING",
    });
    const res = await POST(jsonReq(validBody) as never);
    expect(res.status).toBe(403);
  });

  it("422 TEMPLATE_VERSION_NOT_PUBLISHED when no published version (D2.1 service-layer gate)", async () => {
    (getApiActor as jest.Mock).mockResolvedValue(coachActor);
    (db.assessmentTemplateVersion.findFirst as jest.Mock).mockResolvedValue(null);
    const res = await POST(jsonReq(validBody) as never);
    expect(res.status).toBe(422);
    const body = await res.json();
    expect(body.error).toBe("TEMPLATE_VERSION_NOT_PUBLISHED");
  });

  it("happy path creates DRAFT campaign with coach ownership", async () => {
    (getApiActor as jest.Mock).mockResolvedValue(coachActor);
    (db.assessmentCampaign.create as jest.Mock).mockResolvedValue({
      id: "c1",
      alias: "acme_rockefeller_260601100000",
      status: "DRAFT",
      templateId: "tpl-1",
      versionId: "ver-1",
      organizationId: "org-1",
    });
    const res = await POST(jsonReq(validBody) as never);
    expect(res.status).toBe(201);
    expect(db.assessmentCampaign.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: "DRAFT",
          createdByCoachId: "coach-1",
          createdBy: "u1",
          templateId: "tpl-1",
          organizationId: "org-1",
          versionId: "ver-1",
          language: "enUS",
        }),
      }),
    );
  });

  it("falls back to suffixed alias on P2002 collision", async () => {
    (getApiActor as jest.Mock).mockResolvedValue(coachActor);
    let calls = 0;
    (db.assessmentCampaign.create as jest.Mock).mockImplementation(() => {
      calls += 1;
      if (calls === 1) {
        throw Object.assign(new Error("dup"), { code: "P2002" });
      }
      return Promise.resolve({
        id: "c1",
        alias: "acme_rockefeller_260601100000_a1b2c3",
      });
    });
    const res = await POST(jsonReq(validBody) as never);
    expect(res.status).toBe(201);
    expect(db.assessmentCampaign.create).toHaveBeenCalledTimes(2);
  });
});
