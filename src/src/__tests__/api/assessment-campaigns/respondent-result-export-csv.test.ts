/**
 * Task J — GET /api/assessment-campaigns/[id]/respondents/[respondentId]/result/export.csv.
 *
 * Verifies: 401 unauth, 404 wrong-actor / no-submission, 200 happy path
 * emits text/csv with spec header row + per-question rows.
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

jest.mock("@/lib/audit", () => ({
  logAudit: jest.fn().mockResolvedValue(undefined),
}));

jest.mock("@/lib/rate-limit", () => ({
  withRateLimit: jest
    .fn()
    .mockResolvedValue({ allowed: true, headers: {} }),
  RateLimits: { standard: { interval: 60000, maxRequests: 100 } },
}));

import { GET } from "@/app/api/assessment-campaigns/[id]/respondents/[respondentId]/result/export.csv/route";
import { db } from "@/lib/db";
import { getApiActor } from "@/lib/auth/authorization";
import { logAudit } from "@/lib/audit";

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

function ctx(campaignId: string, respondentId: string) {
  return {
    params: Promise.resolve({ id: campaignId, respondentId }),
  };
}

function readBody(res: Response): string {
  return String((res as unknown as { _body: unknown })._body ?? "");
}

function readHeader(res: Response, name: string): string | null {
  const map = res.headers as unknown as Map<string, string>;
  return (
    map.get(name) ??
    map.get(name.toLowerCase()) ??
    map.get(
      name
        .split("-")
        .map((p) => p.charAt(0).toUpperCase() + p.slice(1).toLowerCase())
        .join("-"),
    ) ??
    null
  );
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

describe("GET /api/assessment-campaigns/[id]/respondents/[respondentId]/result/export.csv", () => {
  it("401 unauthenticated", async () => {
    (getApiActor as jest.Mock).mockResolvedValue(null);
    const res = await GET(
      new Request(
        "http://localhost/api/assessment-campaigns/c1/respondents/r1/result/export.csv",
      ) as never,
      ctx("c1", "r1"),
    );
    expect(res.status).toBe(401);
  });

  it("404 when coach does not own the campaign", async () => {
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
        "http://localhost/api/assessment-campaigns/c1/respondents/r1/result/export.csv",
      ) as never,
      ctx("c1", "r1"),
    );
    expect(res.status).toBe(404);
  });

  it("404 when no submission exists for this respondent", async () => {
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
        "http://localhost/api/assessment-campaigns/c1/respondents/r1/result/export.csv",
      ) as never,
      ctx("c1", "r1"),
    );
    expect(res.status).toBe(404);
  });

  it("200 happy path returns CSV with spec header + per-question rows", async () => {
    (getApiActor as jest.Mock).mockResolvedValue(coachActor);
    (db.assessmentCampaign.findUnique as jest.Mock).mockResolvedValue({
      id: "c1",
      organizationId: "org-1",
      templateId: "tpl-1",
      createdByCoachId: "coach-1",
      status: "ACTIVE",
    });
    (db.assessmentSubmission.findFirst as jest.Mock).mockResolvedValue({
      id: "sub-1",
      result: {
        countAchieved: 1,
        overallTotal: 8,
        overallAverage: 4,
        tier: null,
        perQuestion: [
          { stableKey: "Q1", value: 5, achieved: true },
          { stableKey: "Q2", value: 3, achieved: false },
        ],
        perSection: [],
        tierMetricValue: 1,
        unansweredKeys: [],
      },
      respondent: { id: "r1", firstName: "Alice", lastName: "Anderson" },
      campaign: {
        alias: "acme_rock_q2",
        version: {
          sections: [
            { stableKey: "S1", name: "Section One", sortOrder: 0 },
          ],
          questions: [
            {
              stableKey: "Q1",
              label: "Team is healthy",
              sectionStableKey: "S1",
              sortOrder: 0,
            },
            {
              stableKey: "Q2",
              label: "Clear priorities",
              sectionStableKey: "S1",
              sortOrder: 1,
            },
          ],
          scoringConfig: { passThreshold: 4 },
        },
      },
    });

    const res = await GET(
      new Request(
        "http://localhost/api/assessment-campaigns/c1/respondents/r1/result/export.csv",
      ) as never,
      ctx("c1", "r1"),
    );
    expect(res.status).toBe(200);
    expect(readHeader(res, "Content-Type")).toBe("text/csv; charset=utf-8");
    expect(readHeader(res, "Content-Disposition")).toMatch(
      /attachment; filename="acme-rock-q2-anderson-result-\d{4}-\d{2}-\d{2}\.csv"/,
    );
    const body = readBody(res);
    const header200 = body.slice(0, 250);
    expect(header200).toContain('"Section Stable Key"');
    expect(header200).toContain('"Section Name"');
    expect(header200).toContain('"Question Stable Key"');
    expect(header200).toContain('"Question Label"');
    expect(header200).toContain('"Value"');
    expect(header200).toContain('"Achieved"');
    expect(body).toContain('"Q1"');
    expect(body).toContain('"Team is healthy"');
    expect(body).toContain('"5"');
    expect(body).toContain('"Yes"');
    expect(body).toContain('"Q2"');
    expect(body).toContain('"No"');
    expect(logAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        entityType: "AssessmentSubmission",
        entityId: "sub-1",
        action: "EXPORT",
        changes: { kind: "per-question-result" },
      }),
    );
  });
});
