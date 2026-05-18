/**
 * Task J — GET /api/admin/assessments/aggregate/submissions.csv.
 *
 * Admin-only. Verifies: 401 unauth, 403 coach, 400 missing params,
 * 200 happy path emits text/csv with one row per submission + dynamic
 * Section_<stableKey>_Total columns.
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
    assessmentTemplate: { findUnique: jest.fn() },
    assessmentTemplateVersion: { findUnique: jest.fn() },
    assessmentSubmission: { findMany: jest.fn() },
    assessmentCampaignParticipant: { findMany: jest.fn() },
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

import { GET } from "@/app/api/admin/assessments/aggregate/submissions.csv/route";
import { db } from "@/lib/db";
import { getApiActor } from "@/lib/auth/authorization";
import { logAudit } from "@/lib/audit";

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

function asNextReq(search: string): Request {
  const url = `http://localhost/api/admin/assessments/aggregate/submissions.csv${search}`;
  const req = new Request(url);
  return Object.assign(req, { nextUrl: new URL(url) });
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
  (db.assessmentTemplate.findUnique as jest.Mock).mockResolvedValue({
    id: "tpl-1",
    alias: "RockHabits",
  });
  (db.assessmentTemplateVersion.findUnique as jest.Mock).mockResolvedValue({
    id: "ver-1",
    versionNumber: 1,
    sections: [{ stableKey: "S1", name: "Section One", sortOrder: 0 }],
  });
  (db.assessmentSubmission.findMany as jest.Mock).mockResolvedValue([]);
  (db.assessmentCampaignParticipant.findMany as jest.Mock).mockResolvedValue([]);
});

describe("GET /api/admin/assessments/aggregate/submissions.csv", () => {
  it("401 unauthenticated", async () => {
    (getApiActor as jest.Mock).mockResolvedValue(null);
    const res = await GET(
      asNextReq("?templateId=tpl-1&versionId=ver-1") as never,
    );
    expect(res.status).toBe(401);
  });

  it("403 coach", async () => {
    (getApiActor as jest.Mock).mockResolvedValue(coachActor);
    const res = await GET(
      asNextReq("?templateId=tpl-1&versionId=ver-1") as never,
    );
    expect(res.status).toBe(403);
  });

  it("400 missing templateId", async () => {
    (getApiActor as jest.Mock).mockResolvedValue(adminActor);
    const res = await GET(asNextReq("?versionId=ver-1") as never);
    expect(res.status).toBe(400);
  });

  it("400 missing versionId", async () => {
    (getApiActor as jest.Mock).mockResolvedValue(adminActor);
    const res = await GET(asNextReq("?templateId=tpl-1") as never);
    expect(res.status).toBe(400);
  });

  it("200 happy path emits per-submission CSV with section columns", async () => {
    (getApiActor as jest.Mock).mockResolvedValue(adminActor);

    (db.assessmentSubmission.findMany as jest.Mock).mockResolvedValue([
      {
        id: "sub-1",
        campaignId: "c1",
        respondentId: "r1",
        submittedAt: new Date("2026-05-03T10:00:00Z"),
        result: {
          countAchieved: 30,
          overallTotal: 120,
          overallAverage: 4,
          tier: { label: "Great", message: "Great work" },
          perSection: [
            {
              stableKey: "S1",
              name: "Section One",
              totalPoints: 50,
              averagePoints: 4.5,
              achievedCount: 10,
              totalCount: 10,
            },
          ],
        },
        publicTaker: null,
        respondent: {
          firstName: "Alice",
          lastName: "Anderson",
          email: "alice@example.com",
          jobTitle: "CEO",
        },
        campaign: {
          name: "Q2 Rockefeller",
          organization: { name: "Acme Corp" },
          creatorCoach: {
            firstName: "Coach",
            lastName: "One",
            email: "coach@example.com",
          },
        },
      },
    ]);
    (db.assessmentCampaignParticipant.findMany as jest.Mock).mockResolvedValue([
      { campaignId: "c1", respondentId: "r1", isCEO: true },
    ]);

    const res = await GET(
      asNextReq("?templateId=tpl-1&versionId=ver-1") as never,
    );
    expect(res.status).toBe(200);
    expect(readHeader(res, "Content-Type")).toBe("text/csv; charset=utf-8");
    expect(readHeader(res, "Content-Disposition")).toMatch(
      /attachment; filename="rockhabits-v1-submissions-\d{4}-\d{2}-\d{2}\.csv"/,
    );
    const body = readBody(res);
    const header250 = body.slice(0, 250);
    expect(header250).toContain('"Submitted At"');
    expect(header250).toContain('"Organization"');
    expect(header250).toContain('"Coach (Campaign Creator)"');
    expect(header250).toContain('"Campaign Name"');
    expect(header250).toContain('"Respondent Name"');
    expect(header250).toContain('"Respondent Email"');
    expect(header250).toContain('"Is CEO"');
    expect(header250).toContain('"Section_S1_Total"');
    expect(body).toContain('"Acme Corp"');
    expect(body).toContain('"Coach One"');
    expect(body).toContain('"Q2 Rockefeller"');
    expect(body).toContain('"Alice Anderson"');
    expect(body).toContain('"alice@example.com"');
    expect(body).toContain('"Yes"'); // isCEO
    expect(body).toContain('"30"'); // countAchieved
    expect(body).toContain('"Great"'); // tier

    expect(logAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        entityType: "AssessmentTemplate",
        entityId: "tpl-1",
        action: "EXPORT",
        changes: { kind: "aggregate-submissions", versionId: "ver-1" },
      }),
    );
  });
});
