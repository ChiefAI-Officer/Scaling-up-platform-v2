/**
 * Assessment v7.6 — DELETE /api/assessment-campaigns/[id]/participants/[participantId] (Task L).
 *
 * Covers:
 *   - 401 unauthenticated
 *   - 404 canManageCampaign denies
 *   - 404 participant missing or belongs to a different campaign
 *   - 409 if respondent has any submission row (results immutable)
 *   - 204 happy path + invitation row + participant row deleted in a txn
 *   - audit log written with action DELETE
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
  assessmentInvitation: {
    deleteMany: jest.fn(),
  },
  assessmentCampaignParticipant: {
    delete: jest.fn(),
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
    assessmentSubmission: {
      findFirst: jest.fn(),
    },
    assessmentInvitation: {},
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

import { DELETE } from "@/app/api/assessment-campaigns/[id]/participants/[participantId]/route";
import { db } from "@/lib/db";
import { getApiActor } from "@/lib/auth/authorization";

const coachActor = {
  userId: "u1",
  email: "coach@example.com",
  role: "COACH" as const,
  coachId: "coach-1",
};

function paramsFor(campaignId: string, participantId: string) {
  return { params: Promise.resolve({ id: campaignId, participantId }) };
}

function delReq(): Request {
  return new Request(
    "http://localhost/api/assessment-campaigns/c1/participants/p1",
    { method: "DELETE" },
  );
}

function mockOwningCampaign(status: "DRAFT" | "ACTIVE" | "CLOSED" = "ACTIVE") {
  (db.assessmentCampaign.findUnique as jest.Mock).mockResolvedValueOnce({
    id: "c1",
    organizationId: "org-1",
    templateId: "tpl-1",
    createdByCoachId: "coach-1",
    status,
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
  (db.assessmentCampaignParticipant.findUnique as jest.Mock).mockResolvedValue({
    id: "p1",
    campaignId: "c1",
    respondentId: "r1",
  });
  (db.assessmentSubmission.findFirst as jest.Mock).mockResolvedValue(null);
  txMock.assessmentInvitation.deleteMany.mockResolvedValue({ count: 1 });
  txMock.assessmentCampaignParticipant.delete.mockResolvedValue({ id: "p1" });
});

describe("DELETE /api/assessment-campaigns/[id]/participants/[participantId]", () => {
  it("401 when unauthenticated", async () => {
    (getApiActor as jest.Mock).mockResolvedValue(null);
    const res = await DELETE(delReq() as never, paramsFor("c1", "p1"));
    expect(res.status).toBe(401);
  });

  it("404 when canManageCampaign denies (campaign missing)", async () => {
    (getApiActor as jest.Mock).mockResolvedValue(coachActor);
    (db.assessmentCampaign.findUnique as jest.Mock).mockResolvedValueOnce(null);
    const res = await DELETE(delReq() as never, paramsFor("c1", "p1"));
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
    const res = await DELETE(delReq() as never, paramsFor("c1", "p1"));
    expect(res.status).toBe(404);
  });

  it("404 when participant does not exist", async () => {
    (getApiActor as jest.Mock).mockResolvedValue(coachActor);
    mockOwningCampaign();
    (
      db.assessmentCampaignParticipant.findUnique as jest.Mock
    ).mockResolvedValue(null);
    const res = await DELETE(delReq() as never, paramsFor("c1", "p1"));
    expect(res.status).toBe(404);
  });

  it("404 when participant belongs to a different campaign (path mismatch)", async () => {
    (getApiActor as jest.Mock).mockResolvedValue(coachActor);
    mockOwningCampaign();
    (
      db.assessmentCampaignParticipant.findUnique as jest.Mock
    ).mockResolvedValue({
      id: "p1",
      campaignId: "DIFFERENT-campaign",
      respondentId: "r1",
    });
    const res = await DELETE(delReq() as never, paramsFor("c1", "p1"));
    expect(res.status).toBe(404);
    expect(txMock.assessmentCampaignParticipant.delete).not.toHaveBeenCalled();
  });

  it("409 when respondent has already submitted (results locked)", async () => {
    (getApiActor as jest.Mock).mockResolvedValue(coachActor);
    mockOwningCampaign();
    (db.assessmentSubmission.findFirst as jest.Mock).mockResolvedValue({
      id: "sub-1",
    });
    const res = await DELETE(delReq() as never, paramsFor("c1", "p1"));
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.code).toBe("ALREADY_SUBMITTED");
    expect(txMock.assessmentInvitation.deleteMany).not.toHaveBeenCalled();
    expect(txMock.assessmentCampaignParticipant.delete).not.toHaveBeenCalled();
    expect(db.auditLog.create).not.toHaveBeenCalled();
  });

  it("204 happy path: deletes invitation + participant inside a transaction; writes audit log", async () => {
    (getApiActor as jest.Mock).mockResolvedValue(coachActor);
    mockOwningCampaign();
    const res = await DELETE(delReq() as never, paramsFor("c1", "p1"));
    expect(res.status).toBe(204);
    expect(txMock.assessmentInvitation.deleteMany).toHaveBeenCalledWith({
      where: { campaignId: "c1", respondentId: "r1" },
    });
    expect(txMock.assessmentCampaignParticipant.delete).toHaveBeenCalledWith({
      where: { id: "p1" },
    });
    expect(db.auditLog.create).toHaveBeenCalledTimes(1);
    const auditArgs = (db.auditLog.create as jest.Mock).mock.calls[0][0];
    expect(auditArgs.data.action).toBe("DELETE");
    expect(auditArgs.data.entityType).toBe("AssessmentCampaignParticipant");
    expect(auditArgs.data.entityId).toBe("p1");
    expect(auditArgs.data.performedBy).toBe("coach@example.com");
    const changes = JSON.parse(auditArgs.data.changes);
    expect(changes.campaignId).toBe("c1");
    expect(changes.respondentId).toBe("r1");
  });

  it("204 even when campaign is DRAFT (status doesn't block remove as long as no submission)", async () => {
    (getApiActor as jest.Mock).mockResolvedValue(coachActor);
    mockOwningCampaign("DRAFT");
    const res = await DELETE(delReq() as never, paramsFor("c1", "p1"));
    expect(res.status).toBe(204);
  });
});
