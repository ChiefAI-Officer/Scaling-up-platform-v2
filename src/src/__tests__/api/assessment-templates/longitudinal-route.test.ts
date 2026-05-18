/**
 * Assessment v7.6 — GET /api/assessment-templates/[id]/longitudinal (Task H).
 *
 * Covers:
 *   - 401 unauth
 *   - 400 missing organizationId
 *   - 404 wrong-org (canAccessOrganization false)
 *   - 200 admin happy path
 *   - 200 coach owning the org
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
    assessmentTemplate: { findUnique: jest.fn() },
    assessmentTemplateVersion: { findMany: jest.fn() },
    assessmentCampaign: { findMany: jest.fn() },
    assessmentSubmission: { findMany: jest.fn() },
  },
}));

jest.mock("@/lib/auth/authorization", () => ({
  getApiActor: jest.fn(),
  isPrivilegedRole: (role: string) => role === "ADMIN" || role === "STAFF",
}));

import { GET } from "@/app/api/assessment-templates/[id]/longitudinal/route";
import { db } from "@/lib/db";
import { getApiActor } from "@/lib/auth/authorization";

const adminActor = {
  userId: "admin",
  email: "admin@example.com",
  role: "ADMIN" as const,
  coachId: null,
};

const coachActorOwner = {
  userId: "u1",
  email: "coach@example.com",
  role: "COACH" as const,
  coachId: "coach-owner",
};

const coachActorOther = {
  userId: "u2",
  email: "other@example.com",
  role: "COACH" as const,
  coachId: "coach-other",
};

function reqWithSearch(search: string): Request {
  const url = `http://localhost/api/assessment-templates/tpl-1/longitudinal${search}`;
  return new Request(url);
}

function asNextReq(req: Request) {
  const url = new URL(req.url);
  return Object.assign(req, { nextUrl: url }) as never;
}

const paramsP = Promise.resolve({ id: "tpl-1" });

beforeEach(() => {
  jest.clearAllMocks();
  // Default DB state for happy path: org owned by coach-owner, template
  // present, single published version, zero campaigns.
  (db.organization.findUnique as jest.Mock).mockResolvedValue({
    id: "org-1",
    name: "Acme",
    ownerCoachId: "coach-owner",
    deletedAt: null,
  });
  (db.assessmentTemplate.findUnique as jest.Mock).mockResolvedValue({
    id: "tpl-1",
    name: "Rockefeller",
    alias: "RockHabits",
  });
  (db.assessmentTemplateVersion.findMany as jest.Mock).mockResolvedValue([
    {
      id: "ver-1",
      templateId: "tpl-1",
      versionNumber: 1,
      language: "enUS",
      publishedAt: new Date("2026-01-01T00:00:00Z"),
      questions: [],
    },
  ]);
  (db.assessmentCampaign.findMany as jest.Mock).mockResolvedValue([]);
  (db.assessmentSubmission.findMany as jest.Mock).mockResolvedValue([]);
});

describe("GET /api/assessment-templates/[id]/longitudinal", () => {
  it("401 unauthenticated", async () => {
    (getApiActor as jest.Mock).mockResolvedValue(null);
    const res = await GET(
      asNextReq(reqWithSearch("?organizationId=org-1")),
      { params: paramsP },
    );
    expect(res.status).toBe(401);
  });

  it("400 missing organizationId", async () => {
    (getApiActor as jest.Mock).mockResolvedValue(adminActor);
    const res = await GET(asNextReq(reqWithSearch("")), { params: paramsP });
    expect(res.status).toBe(400);
  });

  it("404 coach who does not own the org", async () => {
    (getApiActor as jest.Mock).mockResolvedValue(coachActorOther);
    const res = await GET(
      asNextReq(reqWithSearch("?organizationId=org-1")),
      { params: paramsP },
    );
    expect(res.status).toBe(404);
  });

  it("200 admin happy path", async () => {
    (getApiActor as jest.Mock).mockResolvedValue(adminActor);
    const res = await GET(
      asNextReq(reqWithSearch("?organizationId=org-1")),
      { params: paramsP },
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.template.id).toBe("tpl-1");
    expect(body.data.organization.id).toBe("org-1");
    expect(body.data.campaigns).toEqual([]);
  });

  it("200 coach who owns the org", async () => {
    (getApiActor as jest.Mock).mockResolvedValue(coachActorOwner);
    const res = await GET(
      asNextReq(reqWithSearch("?organizationId=org-1")),
      { params: paramsP },
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.template.id).toBe("tpl-1");
  });
});
