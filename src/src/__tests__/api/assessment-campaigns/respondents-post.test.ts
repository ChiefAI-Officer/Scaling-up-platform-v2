/**
 * Assessment v7.6 — POST /api/assessment-campaigns/[id]/respondents (Task L).
 *
 * Adds an existing OrgRespondent to a campaign after creation. Covers:
 *   - happy add to DRAFT (no invitation row)
 *   - happy add to ACTIVE (invitation row created)
 *   - 409 already a participant
 *   - 422 wrong organization
 *   - 401 unauthenticated
 *   - 404 canManageCampaign denies
 *   - 409 campaign is CLOSED
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

const txMock = {
  assessmentCampaignParticipant: {
    create: jest.fn(),
  },
  assessmentInvitation: {
    create: jest.fn(),
  },
};

jest.mock("@/lib/db", () => ({
  db: {
    organization: { findUnique: jest.fn() },
    accessGroupCoach: { findMany: jest.fn().mockResolvedValue([]) },
    accessGroupTemplate: { findMany: jest.fn().mockResolvedValue([]) },
    assessmentCampaign: (() => {
      // SEC-M6: canManageCampaign now loads via findFirst. Delegate to
      // findUnique so existing mockResolvedValueOnce sequencing (authz row
      // first, then any route meta reads) is preserved unchanged.
      const findUnique = jest.fn();
      const findFirst = jest.fn((args) => findUnique(args));
      return { findUnique, findFirst };
    })(),
    assessmentCampaignParticipant: {
      findUnique: jest.fn(),
    },
    orgRespondent: { findUnique: jest.fn() },
    orgTeam: { findMany: jest.fn().mockResolvedValue([]) },
    auditLog: { create: jest.fn().mockResolvedValue(undefined) },
    $transaction: jest.fn((fn: (tx: typeof txMock) => unknown) => fn(txMock)),
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

import { POST } from "@/app/api/assessment-campaigns/[id]/respondents/route";
import { db } from "@/lib/db";
import { getApiActor } from "@/lib/auth/authorization";

const coachActor = {
  userId: "u1",
  email: "coach@example.com",
  role: "COACH" as const,
  coachId: "coach-1",
};

function detailParams(id: string) {
  return { params: Promise.resolve({ id }) };
}

function postReq(body: unknown): Request {
  return new Request(
    "http://localhost/api/assessment-campaigns/c1/respondents",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    },
  );
}

function mockOwningCampaign(status: "DRAFT" | "ACTIVE" | "CLOSED") {
  // canManageCampaign internal findUnique
  (db.assessmentCampaign.findUnique as jest.Mock).mockResolvedValueOnce({
    id: "c1",
    organizationId: "org-1",
    templateId: "tpl-1",
    createdByCoachId: "coach-1",
    status,
  });
  // Route's own findUnique
  (db.assessmentCampaign.findUnique as jest.Mock).mockResolvedValueOnce({
    id: "c1",
    organizationId: "org-1",
    status,
    closeAt: null,
  });
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
  (db.assessmentCampaignParticipant.findUnique as jest.Mock).mockResolvedValue(
    null,
  );
  (db.orgRespondent.findUnique as jest.Mock).mockResolvedValue({
    id: "r1",
    organizationId: "org-1",
    teamId: null,
    firstName: "Alice",
    lastName: "Anderson",
    email: "alice@example.com",
    deletedAt: null,
  });
  txMock.assessmentCampaignParticipant.create.mockImplementation((args) =>
    Promise.resolve({
      id: "p-" + args.data.respondentId,
      campaignId: args.data.campaignId,
      respondentId: args.data.respondentId,
      isCEO: args.data.isCEO,
      addedAt: new Date("2026-05-18T12:00:00Z"),
    }),
  );
  txMock.assessmentInvitation.create.mockImplementation((args) =>
    Promise.resolve({
      id: "inv-" + args.data.respondentId,
      status: args.data.status,
      expiresAt: args.data.expiresAt,
    }),
  );
});

describe("POST /api/assessment-campaigns/[id]/respondents", () => {
  it("401 when unauthenticated", async () => {
    (getApiActor as jest.Mock).mockResolvedValue(null);
    const res = await POST(
      postReq({ orgRespondentId: "r1" }) as never,
      detailParams("c1"),
    );
    expect(res.status).toBe(401);
  });

  it("404 when canManageCampaign denies (campaign does not exist)", async () => {
    (getApiActor as jest.Mock).mockResolvedValue(coachActor);
    (db.assessmentCampaign.findUnique as jest.Mock).mockResolvedValueOnce(null);
    const res = await POST(
      postReq({ orgRespondentId: "r1" }) as never,
      detailParams("c1"),
    );
    expect(res.status).toBe(404);
  });

  it("404 when canManageCampaign denies (wrong coach)", async () => {
    (getApiActor as jest.Mock).mockResolvedValue(coachActor);
    (db.assessmentCampaign.findUnique as jest.Mock).mockResolvedValueOnce({
      id: "c1",
      organizationId: "org-1",
      templateId: "tpl-1",
      createdByCoachId: "other-coach",
      status: "ACTIVE",
    });
    const res = await POST(
      postReq({ orgRespondentId: "r1" }) as never,
      detailParams("c1"),
    );
    expect(res.status).toBe(404);
  });

  it("400 when body schema rejects (missing orgRespondentId)", async () => {
    (getApiActor as jest.Mock).mockResolvedValue(coachActor);
    const res = await POST(postReq({}) as never, detailParams("c1"));
    expect(res.status).toBe(400);
  });

  it("happy path: adds to DRAFT campaign WITHOUT creating an invitation row", async () => {
    (getApiActor as jest.Mock).mockResolvedValue(coachActor);
    mockOwningCampaign("DRAFT");
    const res = await POST(
      postReq({ orgRespondentId: "r1" }) as never,
      detailParams("c1"),
    );
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.participant.respondentId).toBe("r1");
    expect(body.data.invitation).toBeNull();
    expect(
      txMock.assessmentCampaignParticipant.create,
    ).toHaveBeenCalledTimes(1);
    expect(txMock.assessmentInvitation.create).not.toHaveBeenCalled();
    expect(db.auditLog.create).toHaveBeenCalledTimes(1);
    const auditArgs = (db.auditLog.create as jest.Mock).mock.calls[0][0];
    expect(auditArgs.data.action).toBe("CREATE");
    expect(auditArgs.data.entityType).toBe("AssessmentCampaignParticipant");
    const changes = JSON.parse(auditArgs.data.changes);
    expect(changes.invitationCreated).toBe(false);
    expect(changes.campaignStatus).toBe("DRAFT");
  });

  it("happy path: adds to ACTIVE campaign AND creates a PENDING invitation row", async () => {
    (getApiActor as jest.Mock).mockResolvedValue(coachActor);
    mockOwningCampaign("ACTIVE");
    const res = await POST(
      postReq({ orgRespondentId: "r1" }) as never,
      detailParams("c1"),
    );
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.invitation).not.toBeNull();
    expect(body.data.invitation.status).toBe("PENDING");
    expect(txMock.assessmentInvitation.create).toHaveBeenCalledTimes(1);
    const inviteArgs = txMock.assessmentInvitation.create.mock.calls[0][0];
    expect(inviteArgs.data.campaignId).toBe("c1");
    expect(inviteArgs.data.respondentId).toBe("r1");
    expect(inviteArgs.data.status).toBe("PENDING");
    expect(typeof inviteArgs.data.tokenHash).toBe("string");
    expect(inviteArgs.data.tokenHash.length).toBeGreaterThan(0);
    const auditArgs = (db.auditLog.create as jest.Mock).mock.calls[0][0];
    const changes = JSON.parse(auditArgs.data.changes);
    expect(changes.invitationCreated).toBe(true);
    expect(changes.campaignStatus).toBe("ACTIVE");
  });

  it("409 when respondent is already a participant", async () => {
    (getApiActor as jest.Mock).mockResolvedValue(coachActor);
    mockOwningCampaign("ACTIVE");
    (
      db.assessmentCampaignParticipant.findUnique as jest.Mock
    ).mockResolvedValue({ id: "p-existing" });
    const res = await POST(
      postReq({ orgRespondentId: "r1" }) as never,
      detailParams("c1"),
    );
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.code).toBe("ALREADY_PARTICIPANT");
    expect(txMock.assessmentCampaignParticipant.create).not.toHaveBeenCalled();
  });

  it("422 when respondent belongs to a different organization", async () => {
    (getApiActor as jest.Mock).mockResolvedValue(coachActor);
    mockOwningCampaign("ACTIVE");
    (db.orgRespondent.findUnique as jest.Mock).mockResolvedValue({
      id: "r1",
      organizationId: "DIFFERENT-org",
      teamId: null,
      firstName: "Alice",
      lastName: "Anderson",
      email: "alice@example.com",
      deletedAt: null,
    });
    const res = await POST(
      postReq({ orgRespondentId: "r1" }) as never,
      detailParams("c1"),
    );
    expect(res.status).toBe(422);
    const body = await res.json();
    expect(body.code).toBe("WRONG_ORGANIZATION");
    expect(txMock.assessmentCampaignParticipant.create).not.toHaveBeenCalled();
  });

  it("404 when the respondent does not exist", async () => {
    (getApiActor as jest.Mock).mockResolvedValue(coachActor);
    mockOwningCampaign("ACTIVE");
    (db.orgRespondent.findUnique as jest.Mock).mockResolvedValue(null);
    const res = await POST(
      postReq({ orgRespondentId: "r-missing" }) as never,
      detailParams("c1"),
    );
    expect(res.status).toBe(404);
  });

  it("404 when the respondent is soft-deleted", async () => {
    (getApiActor as jest.Mock).mockResolvedValue(coachActor);
    mockOwningCampaign("ACTIVE");
    (db.orgRespondent.findUnique as jest.Mock).mockResolvedValue({
      id: "r1",
      organizationId: "org-1",
      teamId: null,
      firstName: "Alice",
      lastName: "Anderson",
      email: "alice@example.com",
      deletedAt: new Date("2026-05-01T00:00:00Z"),
    });
    const res = await POST(
      postReq({ orgRespondentId: "r1" }) as never,
      detailParams("c1"),
    );
    expect(res.status).toBe(404);
  });

  it("409 when campaign is CLOSED (terminal state)", async () => {
    (getApiActor as jest.Mock).mockResolvedValue(coachActor);
    mockOwningCampaign("CLOSED");
    const res = await POST(
      postReq({ orgRespondentId: "r1" }) as never,
      detailParams("c1"),
    );
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.code).toBe("CAMPAIGN_CLOSED");
    expect(txMock.assessmentCampaignParticipant.create).not.toHaveBeenCalled();
  });
});
