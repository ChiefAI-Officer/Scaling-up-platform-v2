/**
 * GET /api/admin/public-campaigns/[id]/submissions (#83).
 *
 * Public-quiz submissions persist AssessmentSubmission.referringCoachEmail
 * (which coach the self-enrolled taker came in through) + a publicTaker JSON
 * blob, but nothing surfaced them. This admin-only route lists them so admins
 * can see who completed a PUBLIC campaign and via which coach.
 *
 * Covers: 401 unauth · 403 non-privileged · 404 missing · 400 NOT_PUBLIC ·
 * 200 mapped rows (taker name/email + referring coach + submittedAt, newest first).
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
    assessmentCampaign: { findFirst: jest.fn() },
    assessmentSubmission: { findMany: jest.fn() },
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

import { GET } from "@/app/api/admin/public-campaigns/[id]/submissions/route";
import { db } from "@/lib/db";
import { getApiActor } from "@/lib/auth/authorization";

function req(): Request {
  return new Request("http://localhost/api/admin/public-campaigns/c1/submissions");
}
function paramsFor(id: string) {
  return { params: Promise.resolve({ id }) };
}
const adminActor = { userId: "u1", email: "admin@x.com", role: "ADMIN" as const };
const coachActor = { userId: "u2", email: "c@x.com", role: "COACH" as const, coachId: "coach-1" };

beforeEach(() => {
  jest.clearAllMocks();
  (db.assessmentCampaign.findFirst as jest.Mock).mockResolvedValue({
    id: "c1",
    accessMode: "PUBLIC",
    status: "ACTIVE",
  });
  (db.assessmentSubmission.findMany as jest.Mock).mockResolvedValue([]);
});

describe("GET /api/admin/public-campaigns/[id]/submissions", () => {
  it("401 when unauthenticated", async () => {
    (getApiActor as jest.Mock).mockResolvedValue(null);
    const res = await GET(req() as never, paramsFor("c1"));
    expect(res.status).toBe(401);
  });

  it("403 when the actor is not privileged (coach)", async () => {
    (getApiActor as jest.Mock).mockResolvedValue(coachActor);
    const res = await GET(req() as never, paramsFor("c1"));
    expect(res.status).toBe(403);
  });

  it("404 when the campaign does not exist (live-only)", async () => {
    (getApiActor as jest.Mock).mockResolvedValue(adminActor);
    (db.assessmentCampaign.findFirst as jest.Mock).mockResolvedValue(null);
    const res = await GET(req() as never, paramsFor("c1"));
    expect(res.status).toBe(404);
  });

  it("400 NOT_PUBLIC when the campaign is not a PUBLIC campaign", async () => {
    (getApiActor as jest.Mock).mockResolvedValue(adminActor);
    (db.assessmentCampaign.findFirst as jest.Mock).mockResolvedValue({
      id: "c1",
      accessMode: "INVITED",
      status: "ACTIVE",
    });
    const res = await GET(req() as never, paramsFor("c1"));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("NOT_PUBLIC");
  });

  it("200 maps submissions to taker name/email + referring coach + submittedAt, newest first", async () => {
    (getApiActor as jest.Mock).mockResolvedValue(adminActor);
    (db.assessmentSubmission.findMany as jest.Mock).mockResolvedValue([
      {
        id: "s1",
        submittedAt: new Date("2026-07-20T10:00:00Z"),
        publicTaker: { firstName: "Jane", lastName: "Smith", email: "jane@x.com" },
        referringCoachEmail: "coach@x.com",
      },
      {
        id: "s2",
        submittedAt: new Date("2026-07-19T10:00:00Z"),
        publicTaker: { firstName: "", lastName: "", email: "bob@x.com" },
        referringCoachEmail: null,
      },
    ]);
    const res = await GET(req() as never, paramsFor("c1"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data).toHaveLength(2);
    expect(body.data[0]).toMatchObject({
      takerName: "Jane Smith",
      takerEmail: "jane@x.com",
      referringCoachEmail: "coach@x.com",
    });
    // Blank name falls back to the email.
    expect(body.data[1].takerName).toBe("bob@x.com");
    expect(body.data[1].referringCoachEmail).toBeNull();
    // Newest first (query orders by submittedAt desc).
    const args = (db.assessmentSubmission.findMany as jest.Mock).mock.calls[0][0];
    expect(args.where).toMatchObject({ campaignId: "c1" });
    expect(args.orderBy).toMatchObject({ submittedAt: "desc" });
  });
});
