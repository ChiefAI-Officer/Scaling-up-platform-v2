/**
 * Assessment v7.6 — GET /api/assessment-campaigns/[id]/respondents (Task F).
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
    assessmentCampaign: {
      findUnique: jest.fn(),
    },
    assessmentCampaignParticipant: {
      findMany: jest.fn().mockResolvedValue([]),
    },
    assessmentInvitation: {
      findMany: jest.fn().mockResolvedValue([]),
    },
    assessmentSubmission: {
      findMany: jest.fn().mockResolvedValue([]),
    },
  },
}));

jest.mock("@/lib/auth/authorization", () => ({
  getApiActor: jest.fn(),
  isPrivilegedRole: (role: string) => role === "ADMIN" || role === "STAFF",
}));

import { GET } from "@/app/api/assessment-campaigns/[id]/respondents/route";
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
  (db.assessmentCampaignParticipant.findMany as jest.Mock).mockResolvedValue([]);
  (db.assessmentInvitation.findMany as jest.Mock).mockResolvedValue([]);
  (db.assessmentSubmission.findMany as jest.Mock).mockResolvedValue([]);
});

describe("GET /api/assessment-campaigns/[id]/respondents", () => {
  it("401 when unauthenticated", async () => {
    (getApiActor as jest.Mock).mockResolvedValue(null);
    const res = await GET(
      new Request(
        "http://localhost/api/assessment-campaigns/c1/respondents",
      ) as never,
      detailParams("c1"),
    );
    expect(res.status).toBe(401);
  });

  it("404 when coach does not own the campaign", async () => {
    (getApiActor as jest.Mock).mockResolvedValue(otherCoachActor);
    (db.assessmentCampaign.findUnique as jest.Mock).mockResolvedValue({
      id: "c1",
      organizationId: "org-1",
      templateId: "tpl-1",
      createdByCoachId: "coach-1", // owned by someone else
      status: "ACTIVE",
    });
    const res = await GET(
      new Request(
        "http://localhost/api/assessment-campaigns/c1/respondents",
      ) as never,
      detailParams("c1"),
    );
    expect(res.status).toBe(404);
  });

  it("404 when campaign does not exist", async () => {
    (getApiActor as jest.Mock).mockResolvedValue(coachActor);
    (db.assessmentCampaign.findUnique as jest.Mock).mockResolvedValue(null);
    const res = await GET(
      new Request(
        "http://localhost/api/assessment-campaigns/c1/respondents",
      ) as never,
      detailParams("c1"),
    );
    expect(res.status).toBe(404);
  });

  it("200 happy path returns overview + respondents", async () => {
    (getApiActor as jest.Mock).mockResolvedValue(coachActor);
    // First call: canManageCampaign. Second call: getCampaignOverview.
    (db.assessmentCampaign.findUnique as jest.Mock)
      .mockResolvedValueOnce({
        id: "c1",
        organizationId: "org-1",
        templateId: "tpl-1",
        createdByCoachId: "coach-1",
        status: "ACTIVE",
      })
      .mockResolvedValueOnce({
        id: "c1",
        name: "Q2 Rockefeller",
        alias: "acme_rock_q2",
        status: "ACTIVE",
        openAt: new Date("2026-05-01T10:00:00Z"),
        closeAt: new Date("2026-05-20T23:59:00Z"),
        createdAt: new Date("2026-04-25T08:00:00Z"),
        template: { id: "tpl-1", name: "Rockefeller Habits" },
        organization: { id: "org-1", name: "Acme Corp" },
      });

    (db.assessmentCampaignParticipant.findMany as jest.Mock).mockResolvedValue([
      {
        id: "p1",
        isCEO: false,
        respondent: {
          id: "r1",
          firstName: "Alice",
          lastName: "A",
          email: "a@example.com",
          jobTitle: null,
        },
      },
    ]);
    (db.assessmentInvitation.findMany as jest.Mock).mockResolvedValue([
      {
        id: "i1",
        respondentId: "r1",
        status: "SUBMITTED",
        sentAt: new Date("2026-05-02T10:00:00Z"),
        submittedAt: new Date("2026-05-03T10:00:00Z"),
        expiresAt: new Date("2026-08-02T10:00:00Z"),
        resentCount: 0,
        revokedAt: null,
      },
    ]);
    (db.assessmentSubmission.findMany as jest.Mock).mockResolvedValue([
      {
        id: "sub-1",
        respondentId: "r1",
        submittedAt: new Date("2026-05-03T10:00:00Z"),
      },
    ]);

    const res = await GET(
      new Request(
        "http://localhost/api/assessment-campaigns/c1/respondents",
      ) as never,
      detailParams("c1"),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.overview.stats.totalParticipants).toBe(1);
    expect(body.data.overview.stats.submitted).toBe(1);
    expect(body.data.respondents).toHaveLength(1);
    expect(body.data.respondents[0].hasSubmission).toBe(true);
  });

  it("200 admin can read any campaign", async () => {
    const adminActor = {
      userId: "u-admin",
      email: "admin@example.com",
      role: "ADMIN" as const,
      coachId: null,
    };
    (getApiActor as jest.Mock).mockResolvedValue(adminActor);
    (db.assessmentCampaign.findUnique as jest.Mock)
      .mockResolvedValueOnce({
        id: "c1",
        organizationId: "org-1",
        templateId: "tpl-1",
        createdByCoachId: "coach-1",
        status: "ACTIVE",
      })
      .mockResolvedValueOnce({
        id: "c1",
        name: "Q2",
        alias: "alias",
        status: "ACTIVE",
        openAt: new Date(),
        closeAt: null,
        createdAt: new Date(),
        template: { id: "tpl-1", name: "T" },
        organization: { id: "org-1", name: "O" },
      });
    const res = await GET(
      new Request(
        "http://localhost/api/assessment-campaigns/c1/respondents",
      ) as never,
      detailParams("c1"),
    );
    expect(res.status).toBe(200);
  });
});
