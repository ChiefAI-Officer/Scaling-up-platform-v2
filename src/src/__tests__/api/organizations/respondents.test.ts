/**
 * Assessment v7.6 — GET/POST /api/organizations/[id]/respondents
 *                   PATCH/DELETE /api/organizations/[id]/respondents/[respondentId]
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
    orgRespondent: {
      findMany: jest.fn(),
      findFirst: jest.fn(),
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
    orgTeam: {
      findUnique: jest.fn(),
    },
    auditLog: {
      create: jest.fn().mockResolvedValue(undefined),
    },
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

jest.mock("@/lib/assessments/access-control", () => ({
  canAccessOrganization: jest.fn(),
  asAccessDb: (x: unknown) => x,
}));

import {
  GET as listGet,
  POST as listPost,
} from "@/app/api/organizations/[id]/respondents/route";
import {
  PATCH as detailPatch,
  DELETE as detailDelete,
} from "@/app/api/organizations/[id]/respondents/[respondentId]/route";
import { db } from "@/lib/db";
import { getApiActor } from "@/lib/auth/authorization";
import { canAccessOrganization } from "@/lib/assessments/access-control";

const coachActor = {
  userId: "u1",
  email: "coach@example.com",
  role: "COACH" as const,
  coachId: "coach-1",
};

function listParams(orgId: string) {
  return { params: Promise.resolve({ id: orgId }) };
}

function detailParams(orgId: string, respondentId: string) {
  return { params: Promise.resolve({ id: orgId, respondentId }) };
}

function listReq(url = "http://localhost/api/organizations/o1/respondents"): Request {
  return new Request(url);
}

function jsonReq(body: unknown, method: string = "POST"): Request {
  return new Request("http://localhost/api/organizations/o1/respondents", {
    method,
    body: JSON.stringify(body),
    headers: { "Content-Type": "application/json" },
  });
}

describe("GET /api/organizations/[id]/respondents", () => {
  beforeEach(() => jest.clearAllMocks());

  it("401 when unauthenticated", async () => {
    (getApiActor as jest.Mock).mockResolvedValue(null);
    const res = await listGet(listReq() as never, listParams("o1"));
    expect(res.status).toBe(401);
  });

  it("404 when canAccessOrganization is false", async () => {
    (getApiActor as jest.Mock).mockResolvedValue(coachActor);
    (canAccessOrganization as jest.Mock).mockResolvedValue(false);
    const res = await listGet(listReq() as never, listParams("o1"));
    expect(res.status).toBe(404);
  });

  it("lists respondents excluding soft-deleted", async () => {
    (getApiActor as jest.Mock).mockResolvedValue(coachActor);
    (canAccessOrganization as jest.Mock).mockResolvedValue(true);
    (db.orgRespondent.findMany as jest.Mock).mockResolvedValue([
      { id: "r1", organizationId: "o1", firstName: "Alice", lastName: "Smith" },
    ]);
    const res = await listGet(listReq() as never, listParams("o1"));
    expect(res.status).toBe(200);
    expect(db.orgRespondent.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { organizationId: "o1", deletedAt: null },
      })
    );
  });

  it("filters by teamId when provided", async () => {
    (getApiActor as jest.Mock).mockResolvedValue(coachActor);
    (canAccessOrganization as jest.Mock).mockResolvedValue(true);
    (db.orgRespondent.findMany as jest.Mock).mockResolvedValue([]);
    await listGet(
      listReq("http://localhost/api/organizations/o1/respondents?teamId=team-7") as never,
      listParams("o1")
    );
    expect(db.orgRespondent.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { organizationId: "o1", deletedAt: null, teamId: "team-7" },
      })
    );
  });
});

describe("POST /api/organizations/[id]/respondents", () => {
  beforeEach(() => jest.clearAllMocks());

  it("401 when unauthenticated", async () => {
    (getApiActor as jest.Mock).mockResolvedValue(null);
    const res = await listPost(
      jsonReq({ email: "a@b.com", firstName: "A", lastName: "B" }) as never,
      listParams("o1")
    );
    expect(res.status).toBe(401);
  });

  it("404 when canAccessOrganization is false", async () => {
    (getApiActor as jest.Mock).mockResolvedValue(coachActor);
    (canAccessOrganization as jest.Mock).mockResolvedValue(false);
    const res = await listPost(
      jsonReq({ email: "a@b.com", firstName: "A", lastName: "B" }) as never,
      listParams("o1")
    );
    expect(res.status).toBe(404);
  });

  it("400 on missing required fields", async () => {
    (getApiActor as jest.Mock).mockResolvedValue(coachActor);
    (canAccessOrganization as jest.Mock).mockResolvedValue(true);
    const res = await listPost(jsonReq({ email: "a@b.com" }) as never, listParams("o1"));
    expect(res.status).toBe(400);
  });

  it("400 on invalid JSON body", async () => {
    (getApiActor as jest.Mock).mockResolvedValue(coachActor);
    (canAccessOrganization as jest.Mock).mockResolvedValue(true);
    const req = new Request("http://localhost/api/organizations/o1/respondents", {
      method: "POST",
      body: "{not-json",
      headers: { "Content-Type": "application/json" },
    });
    const res = await listPost(req as never, listParams("o1"));
    expect(res.status).toBe(400);
  });

  it("happy path: email-only dedupe (no externalId)", async () => {
    (getApiActor as jest.Mock).mockResolvedValue(coachActor);
    (canAccessOrganization as jest.Mock).mockResolvedValue(true);
    (db.orgRespondent.create as jest.Mock).mockResolvedValue({
      id: "r1",
      organizationId: "o1",
      email: "Alice@Example.COM",
      normalizedEmail: "alice@example.com",
      firstName: "Alice",
      lastName: "Smith",
      dedupeSource: "email",
      dedupeValue: "alice@example.com",
    });
    const res = await listPost(
      jsonReq({
        email: "Alice@Example.COM",
        firstName: "Alice",
        lastName: "Smith",
      }) as never,
      listParams("o1")
    );
    expect(res.status).toBe(201);
    expect(db.orgRespondent.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          organizationId: "o1",
          email: "Alice@Example.COM",
          normalizedEmail: "alice@example.com",
          dedupeSource: "email",
          dedupeValue: "alice@example.com",
        }),
      })
    );
  });

  it("happy path: externalId dedupe", async () => {
    (getApiActor as jest.Mock).mockResolvedValue(coachActor);
    (canAccessOrganization as jest.Mock).mockResolvedValue(true);
    (db.orgRespondent.create as jest.Mock).mockResolvedValue({
      id: "r2",
      organizationId: "o1",
      externalId: "HR-123",
      dedupeSource: "external",
      dedupeValue: "HR-123",
    });
    await listPost(
      jsonReq({
        email: "bob@example.com",
        firstName: "Bob",
        lastName: "Jones",
        externalId: "HR-123",
      }) as never,
      listParams("o1")
    );
    expect(db.orgRespondent.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          externalId: "HR-123",
          dedupeSource: "external",
          dedupeValue: "HR-123",
        }),
      })
    );
  });

  it("400 when teamId belongs to a different organization", async () => {
    (getApiActor as jest.Mock).mockResolvedValue(coachActor);
    (canAccessOrganization as jest.Mock).mockResolvedValue(true);
    (db.orgTeam.findUnique as jest.Mock).mockResolvedValue({
      id: "team-foreign",
      organizationId: "other-org",
      deletedAt: null,
    });
    const res = await listPost(
      jsonReq({
        email: "a@b.com",
        firstName: "A",
        lastName: "B",
        teamId: "team-foreign",
      }) as never,
      listParams("o1")
    );
    expect(res.status).toBe(400);
  });

  it("400 when teamId is soft-deleted", async () => {
    (getApiActor as jest.Mock).mockResolvedValue(coachActor);
    (canAccessOrganization as jest.Mock).mockResolvedValue(true);
    (db.orgTeam.findUnique as jest.Mock).mockResolvedValue({
      id: "team-dead",
      organizationId: "o1",
      deletedAt: new Date(),
    });
    const res = await listPost(
      jsonReq({
        email: "a@b.com",
        firstName: "A",
        lastName: "B",
        teamId: "team-dead",
      }) as never,
      listParams("o1")
    );
    expect(res.status).toBe(400);
  });

  it("409 on duplicate dedupe key (Prisma P2002)", async () => {
    (getApiActor as jest.Mock).mockResolvedValue(coachActor);
    (canAccessOrganization as jest.Mock).mockResolvedValue(true);
    (db.orgRespondent.create as jest.Mock).mockRejectedValue({
      code: "P2002",
      meta: { target: ["organizationId", "dedupeSource", "dedupeValue"] },
    });
    (db.orgRespondent.findFirst as jest.Mock).mockResolvedValue({
      id: "existing-r",
    });
    const res = await listPost(
      jsonReq({
        email: "alice@example.com",
        firstName: "Alice",
        lastName: "Smith",
      }) as never,
      listParams("o1")
    );
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.existingId).toBe("existing-r");
  });
});

describe("PATCH /api/organizations/[id]/respondents/[respondentId]", () => {
  beforeEach(() => jest.clearAllMocks());

  it("401 when unauthenticated", async () => {
    (getApiActor as jest.Mock).mockResolvedValue(null);
    const res = await detailPatch(
      jsonReq({ firstName: "X" }, "PATCH") as never,
      detailParams("o1", "r1")
    );
    expect(res.status).toBe(401);
  });

  it("404 when canAccessOrganization is false", async () => {
    (getApiActor as jest.Mock).mockResolvedValue(coachActor);
    (canAccessOrganization as jest.Mock).mockResolvedValue(false);
    const res = await detailPatch(
      jsonReq({ firstName: "X" }, "PATCH") as never,
      detailParams("o1", "r1")
    );
    expect(res.status).toBe(404);
  });

  it("404 when respondent does not belong to org", async () => {
    (getApiActor as jest.Mock).mockResolvedValue(coachActor);
    (canAccessOrganization as jest.Mock).mockResolvedValue(true);
    (db.orgRespondent.findUnique as jest.Mock).mockResolvedValue({
      id: "r1",
      organizationId: "other-org",
      deletedAt: null,
    });
    const res = await detailPatch(
      jsonReq({ firstName: "X" }, "PATCH") as never,
      detailParams("o1", "r1")
    );
    expect(res.status).toBe(404);
  });

  it("404 when respondent is soft-deleted", async () => {
    (getApiActor as jest.Mock).mockResolvedValue(coachActor);
    (canAccessOrganization as jest.Mock).mockResolvedValue(true);
    (db.orgRespondent.findUnique as jest.Mock).mockResolvedValue({
      id: "r1",
      organizationId: "o1",
      deletedAt: new Date(),
    });
    const res = await detailPatch(
      jsonReq({ firstName: "X" }, "PATCH") as never,
      detailParams("o1", "r1")
    );
    expect(res.status).toBe(404);
  });

  it("happy path: updates fields", async () => {
    (getApiActor as jest.Mock).mockResolvedValue(coachActor);
    (canAccessOrganization as jest.Mock).mockResolvedValue(true);
    (db.orgRespondent.findUnique as jest.Mock).mockResolvedValue({
      id: "r1",
      organizationId: "o1",
      deletedAt: null,
    });
    (db.orgRespondent.update as jest.Mock).mockResolvedValue({
      id: "r1",
      firstName: "Alice",
      lastName: "Updated",
    });
    const res = await detailPatch(
      jsonReq({ lastName: "Updated" }, "PATCH") as never,
      detailParams("o1", "r1")
    );
    expect(res.status).toBe(200);
    expect(db.orgRespondent.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "r1" },
        data: expect.objectContaining({ lastName: "Updated" }),
      })
    );
  });
});

describe("DELETE /api/organizations/[id]/respondents/[respondentId]", () => {
  beforeEach(() => jest.clearAllMocks());

  it("401 when unauthenticated", async () => {
    (getApiActor as jest.Mock).mockResolvedValue(null);
    const res = await detailDelete(
      jsonReq({}, "DELETE") as never,
      detailParams("o1", "r1")
    );
    expect(res.status).toBe(401);
  });

  it("404 when canAccessOrganization is false", async () => {
    (getApiActor as jest.Mock).mockResolvedValue(coachActor);
    (canAccessOrganization as jest.Mock).mockResolvedValue(false);
    const res = await detailDelete(
      jsonReq({}, "DELETE") as never,
      detailParams("o1", "r1")
    );
    expect(res.status).toBe(404);
  });

  it("happy path: soft-deletes (sets deletedAt)", async () => {
    (getApiActor as jest.Mock).mockResolvedValue(coachActor);
    (canAccessOrganization as jest.Mock).mockResolvedValue(true);
    (db.orgRespondent.findUnique as jest.Mock).mockResolvedValue({
      id: "r1",
      organizationId: "o1",
      deletedAt: null,
    });
    (db.orgRespondent.update as jest.Mock).mockResolvedValue({
      id: "r1",
      deletedAt: new Date(),
    });
    const res = await detailDelete(
      jsonReq({}, "DELETE") as never,
      detailParams("o1", "r1")
    );
    expect(res.status).toBe(200);
    expect(db.orgRespondent.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "r1" },
        data: expect.objectContaining({ deletedAt: expect.any(Date) }),
      })
    );
  });

  it("404 when already soft-deleted", async () => {
    (getApiActor as jest.Mock).mockResolvedValue(coachActor);
    (canAccessOrganization as jest.Mock).mockResolvedValue(true);
    (db.orgRespondent.findUnique as jest.Mock).mockResolvedValue({
      id: "r1",
      organizationId: "o1",
      deletedAt: new Date(),
    });
    const res = await detailDelete(
      jsonReq({}, "DELETE") as never,
      detailParams("o1", "r1")
    );
    expect(res.status).toBe(404);
  });
});
