/**
 * Task J — GET /api/assessment-campaigns/[id]/respondents/export.csv.
 *
 * Verifies: 401 unauth, 404 wrong-actor, 200 happy path emits
 * text/csv with attachment Content-Disposition + the spec header row.
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
    assessmentCampaignParticipant: {
      findMany: jest.fn().mockResolvedValue([]),
    },
    assessmentInvitation: { findMany: jest.fn().mockResolvedValue([]) },
    assessmentSubmission: { findMany: jest.fn().mockResolvedValue([]) },
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

import { GET } from "@/app/api/assessment-campaigns/[id]/respondents/export.csv/route";
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

function detailParams(id: string) {
  return { params: Promise.resolve({ id }) };
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

describe("GET /api/assessment-campaigns/[id]/respondents/export.csv", () => {
  it("401 unauthenticated", async () => {
    (getApiActor as jest.Mock).mockResolvedValue(null);
    const res = await GET(
      new Request(
        "http://localhost/api/assessment-campaigns/c1/respondents/export.csv",
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
      createdByCoachId: "coach-1",
      status: "ACTIVE",
    });
    const res = await GET(
      new Request(
        "http://localhost/api/assessment-campaigns/c1/respondents/export.csv",
      ) as never,
      detailParams("c1"),
    );
    expect(res.status).toBe(404);
  });

  it("200 happy path returns CSV with spec header + 1 data row + audit", async () => {
    (getApiActor as jest.Mock).mockResolvedValue(coachActor);
    // 1st findUnique: canManageCampaign. 2nd: campaign meta (alias).
    (db.assessmentCampaign.findUnique as jest.Mock)
      .mockResolvedValueOnce({
        id: "c1",
        organizationId: "org-1",
        templateId: "tpl-1",
        createdByCoachId: "coach-1",
        status: "ACTIVE",
      })
      .mockResolvedValueOnce({ id: "c1", alias: "acme_rock_q2" });

    (db.assessmentCampaignParticipant.findMany as jest.Mock).mockResolvedValue([
      {
        id: "p1",
        isCEO: true,
        respondent: {
          id: "r1",
          firstName: "Alice",
          lastName: "A",
          email: "a@example.com",
          jobTitle: "CEO",
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
        result: {
          countAchieved: 37,
          overallTotal: 192,
          overallAverage: 4.8,
          tier: { label: "Great", message: "Looking solid" },
          perQuestion: [],
          perSection: [],
          tierMetricValue: 37,
          unansweredKeys: [],
        },
      },
    ]);

    const res = await GET(
      new Request(
        "http://localhost/api/assessment-campaigns/c1/respondents/export.csv",
      ) as never,
      detailParams("c1"),
    );
    expect(res.status).toBe(200);
    expect(readHeader(res, "Content-Type")).toBe("text/csv; charset=utf-8");
    expect(readHeader(res, "Content-Disposition")).toMatch(
      /attachment; filename="acme-rock-q2-respondents-\d{4}-\d{2}-\d{2}\.csv"/,
    );
    const body = readBody(res);
    const header200 = body.slice(0, 250);
    expect(header200).toContain('"Respondent Name"');
    expect(header200).toContain('"Respondent Email"');
    expect(header200).toContain('"Is CEO"');
    expect(header200).toContain('"Count Achieved"');
    expect(header200).toContain('"Tier Label"');
    // Body row contains values
    expect(body).toContain('"Alice A"');
    expect(body).toContain('"a@example.com"');
    expect(body).toContain('"Yes"'); // isCEO
    expect(body).toContain('"SUBMITTED"');
    expect(body).toContain('"37"'); // countAchieved
    expect(body).toContain('"Great"');
    expect(logAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        entityType: "AssessmentCampaign",
        entityId: "c1",
        action: "EXPORT",
        changes: { kind: "respondents", rows: 1 },
      }),
    );
  });
});
