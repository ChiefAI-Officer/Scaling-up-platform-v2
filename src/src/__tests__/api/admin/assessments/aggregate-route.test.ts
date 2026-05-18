/**
 * Assessment v7.6 — GET /api/admin/assessments/aggregate.
 * Admin-only. Coach 403. Missing query params → 400.
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
    assessmentTemplateVersion: { findUnique: jest.fn() },
    assessmentSubmission: { findMany: jest.fn() },
  },
}));

jest.mock("@/lib/auth/authorization", () => ({
  getApiActor: jest.fn(),
  isPrivilegedRole: (role: string) => role === "ADMIN" || role === "STAFF",
}));

import { GET } from "@/app/api/admin/assessments/aggregate/route";
import { db } from "@/lib/db";
import { getApiActor } from "@/lib/auth/authorization";

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

function reqWithSearch(search: string): Request {
  // The route uses request.nextUrl.searchParams. Build a real NextRequest
  // by passing a URL with the search string.
  const url = `http://localhost/api/admin/assessments/aggregate${search}`;
  return new Request(url);
}

beforeEach(() => {
  jest.clearAllMocks();
  // Default DB state: empty submissions for happy-path 200.
  (db.assessmentTemplateVersion.findUnique as jest.Mock).mockResolvedValue({
    id: "ver-1",
    sections: [],
    scoringConfig: { tiers: [] },
  });
  (db.assessmentSubmission.findMany as jest.Mock).mockResolvedValue([]);
});

// Stand in for `NextRequest` since the route reads `request.nextUrl.searchParams`.
// In the prod build Next.js wraps it; in tests we cast to satisfy the signature.
function asNextReq(req: Request) {
  // Attach a nextUrl wrapper that mirrors what NextRequest exposes.
  const url = new URL(req.url);
  return Object.assign(req, { nextUrl: url }) as never;
}

describe("GET /api/admin/assessments/aggregate", () => {
  it("401 unauthenticated", async () => {
    (getApiActor as jest.Mock).mockResolvedValue(null);
    const res = await GET(
      asNextReq(reqWithSearch("?templateId=t1&versionId=v1")),
    );
    expect(res.status).toBe(401);
  });

  it("403 coach actor", async () => {
    (getApiActor as jest.Mock).mockResolvedValue(coachActor);
    const res = await GET(
      asNextReq(reqWithSearch("?templateId=t1&versionId=v1")),
    );
    expect(res.status).toBe(403);
  });

  it("400 missing templateId", async () => {
    (getApiActor as jest.Mock).mockResolvedValue(adminActor);
    const res = await GET(asNextReq(reqWithSearch("?versionId=v1")));
    expect(res.status).toBe(400);
  });

  it("400 missing versionId", async () => {
    (getApiActor as jest.Mock).mockResolvedValue(adminActor);
    const res = await GET(asNextReq(reqWithSearch("?templateId=t1")));
    expect(res.status).toBe(400);
  });

  it("200 admin happy path", async () => {
    (getApiActor as jest.Mock).mockResolvedValue(adminActor);
    const res = await GET(
      asNextReq(reqWithSearch("?templateId=t1&versionId=v1")),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.templateId).toBe("t1");
    expect(body.data.versionId).toBe("v1");
    expect(body.data.totalSubmissions).toBe(0);
  });
});
