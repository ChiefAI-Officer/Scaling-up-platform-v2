/**
 * Task J — GET /api/admin/assessments/aggregate/export.csv.
 *
 * Admin-only. Verifies: 401 unauth, 403 coach, 400 missing params,
 * 200 happy path emits text/csv with summary + per-section blocks.
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

import { GET } from "@/app/api/admin/assessments/aggregate/export.csv/route";
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
  const url = `http://localhost/api/admin/assessments/aggregate/export.csv${search}`;
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
    sections: [
      { stableKey: "S1", name: "Section One", sortOrder: 0 },
    ],
    scoringConfig: {
      tiers: [
        { label: "Low", message: "msg-low", minMetric: 0, maxMetric: 10 },
        { label: "Mid", message: "msg-mid", minMetric: 11, maxMetric: 20 },
      ],
    },
  });
  (db.assessmentSubmission.findMany as jest.Mock).mockResolvedValue([]);
});

describe("GET /api/admin/assessments/aggregate/export.csv", () => {
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

  it("200 happy path emits summary + per-section blocks", async () => {
    (getApiActor as jest.Mock).mockResolvedValue(adminActor);

    // getAggregateReport calls assessmentTemplateVersion.findUnique with a
    // specific shape. It returns the same version row we mocked above.
    // The submissions findMany returns one submission so the aggregate has
    // a non-zero totals row.
    (db.assessmentSubmission.findMany as jest.Mock).mockResolvedValue([
      {
        submittedAt: new Date("2026-05-03T10:00:00Z"),
        result: {
          countAchieved: 15,
          overallTotal: 60,
          overallAverage: 4,
          tier: { label: "Mid", message: "msg-mid" },
          perSection: [
            {
              stableKey: "S1",
              name: "Section One",
              totalPoints: 60,
              averagePoints: 4,
              achievedCount: 15,
              totalCount: 15,
            },
          ],
        },
        campaign: { organizationId: "org-1" },
      },
    ]);

    const res = await GET(
      asNextReq("?templateId=tpl-1&versionId=ver-1") as never,
    );
    expect(res.status).toBe(200);
    expect(readHeader(res, "Content-Type")).toBe("text/csv; charset=utf-8");
    expect(readHeader(res, "Content-Disposition")).toMatch(
      /attachment; filename="rockhabits-v1-aggregate-summary-\d{4}-\d{2}-\d{2}\.csv"/,
    );
    const body = readBody(res);
    const header250 = body.slice(0, 250);
    expect(header250).toContain('"Metric","Value"');
    expect(body).toContain('"totalSubmissions"');
    expect(body).toContain('"distinctOrgs"');
    expect(body).toContain('"avgCountAchieved"');
    expect(body).toContain('"avgOverallTotal"');
    expect(body).toContain('"avgOverallAverage"');
    expect(body).toContain('"Tier: Low"');
    expect(body).toContain('"Tier: Mid"');
    expect(body).toContain('"Section Stable Key"');
    expect(body).toContain('"Section Name"');
    expect(body).toContain('"Avg Total Points"');
    expect(body).toContain('"Avg Per-Question"');
    expect(body).toContain('"S1"');

    expect(logAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        entityType: "AssessmentTemplate",
        entityId: "tpl-1",
        action: "EXPORT",
        changes: { kind: "aggregate-summary", versionId: "ver-1" },
      }),
    );
  });
});
