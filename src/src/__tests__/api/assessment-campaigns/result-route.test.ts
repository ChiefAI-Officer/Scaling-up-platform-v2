/**
 * Assessment v7.6 — GET /api/assessment-campaigns/[id]/respondents/[respondentId]/result (Task F).
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
    assessmentCampaign: { findUnique: jest.fn() },
    assessmentSubmission: { findFirst: jest.fn() },
  },
}));

jest.mock("@/lib/auth/authorization", () => ({
  getApiActor: jest.fn(),
  isPrivilegedRole: (role: string) => role === "ADMIN" || role === "STAFF",
}));

import { GET } from "@/app/api/assessment-campaigns/[id]/respondents/[respondentId]/result/route";
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

function resultParams(id: string, respondentId: string) {
  return { params: Promise.resolve({ id, respondentId }) };
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

describe("GET /api/assessment-campaigns/[id]/respondents/[respondentId]/result", () => {
  it("401 when unauthenticated", async () => {
    (getApiActor as jest.Mock).mockResolvedValue(null);
    const res = await GET(
      new Request(
        "http://localhost/api/assessment-campaigns/c1/respondents/r1/result",
      ) as never,
      resultParams("c1", "r1"),
    );
    expect(res.status).toBe(401);
  });

  it("404 when coach does not own campaign", async () => {
    (getApiActor as jest.Mock).mockResolvedValue(otherCoachActor);
    (db.assessmentCampaign.findUnique as jest.Mock).mockResolvedValue({
      id: "c1",
      organizationId: "org-1",
      templateId: "tpl-1",
      createdByCoachId: "coach-1",
      status: "ACTIVE",
    });
    const res = await GET(
      new Request(
        "http://localhost/api/assessment-campaigns/c1/respondents/r1/result",
      ) as never,
      resultParams("c1", "r1"),
    );
    expect(res.status).toBe(404);
  });

  it("404 when no submission exists", async () => {
    (getApiActor as jest.Mock).mockResolvedValue(coachActor);
    (db.assessmentCampaign.findUnique as jest.Mock).mockResolvedValue({
      id: "c1",
      organizationId: "org-1",
      templateId: "tpl-1",
      createdByCoachId: "coach-1",
      status: "ACTIVE",
    });
    (db.assessmentSubmission.findFirst as jest.Mock).mockResolvedValue(null);
    const res = await GET(
      new Request(
        "http://localhost/api/assessment-campaigns/c1/respondents/r1/result",
      ) as never,
      resultParams("c1", "r1"),
    );
    expect(res.status).toBe(404);
  });

  it("200 happy path returns result + version", async () => {
    (getApiActor as jest.Mock).mockResolvedValue(coachActor);
    (db.assessmentCampaign.findUnique as jest.Mock).mockResolvedValue({
      id: "c1",
      organizationId: "org-1",
      templateId: "tpl-1",
      createdByCoachId: "coach-1",
      status: "ACTIVE",
    });
    const fakeResult = {
      perQuestion: [],
      perSection: [],
      overallTotal: 100,
      overallAverage: 2.5,
      countAchieved: 30,
      tier: { label: "OK", message: "Good progress" },
      tierMetricValue: 30,
      unansweredKeys: [],
    };
    const fakeVersion = {
      sections: [{ stableKey: "S1", name: "Strategy", sortOrder: 1 }],
      scoringConfig: {
        tierMetric: "countAchieved",
        passThreshold: 4,
        tiers: [
          { minMetric: 0, maxMetric: 20, label: "Low", message: "Low" },
          { minMetric: 21, maxMetric: 32, label: "OK", message: "OK" },
          { minMetric: 33, maxMetric: 40, label: "Great", message: "Great" },
        ],
      },
    };
    (db.assessmentSubmission.findFirst as jest.Mock).mockResolvedValue({
      id: "sub-1",
      submittedAt: new Date("2026-05-04T12:00:00Z"),
      result: fakeResult,
      respondent: {
        id: "r1",
        firstName: "Alice",
        lastName: "A",
        email: "a@example.com",
        jobTitle: "CEO",
      },
      campaign: {
        id: "c1",
        version: {
          id: "ver-1",
          sections: fakeVersion.sections,
          scoringConfig: fakeVersion.scoringConfig,
        },
      },
    });
    const res = await GET(
      new Request(
        "http://localhost/api/assessment-campaigns/c1/respondents/r1/result",
      ) as never,
      resultParams("c1", "r1"),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.submissionId).toBe("sub-1");
    expect(body.data.result).toEqual(fakeResult);
    expect(body.data.version.sections).toEqual(fakeVersion.sections);
    expect(body.data.version.scoringConfig).toEqual(fakeVersion.scoringConfig);
  });
});
