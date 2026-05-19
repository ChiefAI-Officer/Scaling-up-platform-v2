/**
 * Assessment v7.6 — Admin observability route tests.
 *
 * Covers:
 *   - 401 unauth, 403 non-admin
 *   - 200 returns expected shape from db counters
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
    coach: { count: jest.fn() },
    organization: { count: jest.fn() },
    assessmentTemplate: { count: jest.fn() },
    assessmentTemplateVersion: { count: jest.fn() },
    assessmentCampaign: { count: jest.fn() },
    assessmentSubmission: { count: jest.fn() },
    auditLog: { count: jest.fn(), groupBy: jest.fn() },
  },
}));

jest.mock("@/lib/auth/authorization", () => ({
  getApiActor: jest.fn(),
  isPrivilegedRole: (role: string) => role === "ADMIN" || role === "STAFF",
}));

import { GET } from "@/app/api/admin/observability/route";
import { db } from "@/lib/db";
import { getApiActor } from "@/lib/auth/authorization";

const adminActor = {
  userId: "u1",
  email: "admin@example.com",
  role: "ADMIN" as const,
  coachId: null,
};

function emptyReq(): Request {
  return new Request("http://localhost/api/admin/observability");
}

beforeEach(() => {
  jest.clearAllMocks();
  // Default all counters to 0 so each test only mocks what it cares about.
  (db.coach.count as jest.Mock).mockResolvedValue(0);
  (db.organization.count as jest.Mock).mockResolvedValue(0);
  (db.assessmentTemplate.count as jest.Mock).mockResolvedValue(0);
  (db.assessmentTemplateVersion.count as jest.Mock).mockResolvedValue(0);
  (db.assessmentCampaign.count as jest.Mock).mockResolvedValue(0);
  (db.assessmentSubmission.count as jest.Mock).mockResolvedValue(0);
  (db.auditLog.count as jest.Mock).mockResolvedValue(0);
  (db.auditLog.groupBy as jest.Mock).mockResolvedValue([]);
});

describe("GET /api/admin/observability", () => {
  it("401 when unauthenticated", async () => {
    (getApiActor as jest.Mock).mockResolvedValue(null);
    const res = await GET(emptyReq() as never);
    expect(res.status).toBe(401);
  });

  it("403 when actor is not admin/staff", async () => {
    (getApiActor as jest.Mock).mockResolvedValue({
      ...adminActor,
      role: "COACH",
    });
    const res = await GET(emptyReq() as never);
    expect(res.status).toBe(403);
  });

  it("200 returns counters in the documented shape", async () => {
    (getApiActor as jest.Mock).mockResolvedValue(adminActor);
    (db.coach.count as jest.Mock)
      .mockResolvedValueOnce(5) // active
      .mockResolvedValueOnce(2) // pending
      .mockResolvedValueOnce(1); // deactivated
    (db.organization.count as jest.Mock)
      .mockResolvedValueOnce(10)
      .mockResolvedValueOnce(7);
    (db.assessmentTemplate.count as jest.Mock).mockResolvedValue(3);
    (db.assessmentTemplateVersion.count as jest.Mock)
      .mockResolvedValueOnce(4) // published
      .mockResolvedValueOnce(2); // draft
    (db.assessmentCampaign.count as jest.Mock)
      .mockResolvedValueOnce(3) // draft
      .mockResolvedValueOnce(5) // active
      .mockResolvedValueOnce(2) // closed
      .mockResolvedValueOnce(9) // invited
      .mockResolvedValueOnce(1); // public
    (db.assessmentSubmission.count as jest.Mock)
      .mockResolvedValueOnce(100) // total
      .mockResolvedValueOnce(12) // 24h
      .mockResolvedValueOnce(45) // 7d
      .mockResolvedValueOnce(8) // public
      .mockResolvedValueOnce(92); // invited
    (db.auditLog.count as jest.Mock).mockResolvedValue(30);
    (db.auditLog.groupBy as jest.Mock).mockResolvedValue([
      { action: "CREATE", _count: { _all: 20 } },
      { action: "UPDATE", _count: { _all: 10 } },
    ]);

    const res = await GET(emptyReq() as never);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.coaches).toEqual({ active: 5, pending: 2, deactivated: 1 });
    expect(body.data.orgs).toEqual({ total: 10, withCampaigns: 7 });
    expect(body.data.templates).toEqual({
      total: 3,
      publishedVersions: 4,
      draftVersions: 2,
    });
    expect(body.data.campaigns).toEqual({
      draft: 3,
      active: 5,
      closed: 2,
      invited: 9,
      public: 1,
    });
    expect(body.data.submissions).toEqual({
      total: 100,
      last24h: 12,
      last7d: 45,
      public: 8,
      invited: 92,
    });
    expect(body.data.auditLog.last24h).toBe(30);
    expect(body.data.auditLog.byAction).toEqual({ CREATE: 20, UPDATE: 10 });
    expect(typeof body.data.timestamp).toBe("string");
  });
});
