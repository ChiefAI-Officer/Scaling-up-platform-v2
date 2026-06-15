/**
 * Assessment v7.6 — POST /api/assessment-campaigns/[id]/ceo (CEO designation post-create).
 *
 * Covers:
 *   - 401 unauthenticated
 *   - 404 canManageCampaign denies (auth-fail hidden)
 *   - 400 bad body shape
 *   - 404 participant not on this campaign
 *   - 409 CAMPAIGN_CLOSED
 *   - 200 happy path: clears prior CEO + sets new CEO atomically
 *   - 200 with participantId=null clears all CEOs (no setter call)
 *   - audit log written
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
    updateMany: jest.fn(),
    update: jest.fn(),
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
      findFirst: jest.fn(),
    },
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

import { POST } from "@/app/api/assessment-campaigns/[id]/ceo/route";
import { db } from "@/lib/db";
import { getApiActor } from "@/lib/auth/authorization";

const coachActor = {
  userId: "u1",
  email: "coach@example.com",
  role: "COACH" as const,
  coachId: "coach-1",
};

function paramsFor(campaignId: string) {
  return { params: Promise.resolve({ id: campaignId }) };
}

function jsonReq(body: unknown): Request {
  return new Request("http://localhost/api/assessment-campaigns/c1/ceo", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

function mockOwningCampaign(status: "DRAFT" | "ACTIVE" | "CLOSED" = "ACTIVE") {
  // canManageCampaign internally calls findUnique with the campaign record;
  // also our route calls findUnique({ select: { status } }).
  (db.assessmentCampaign.findUnique as jest.Mock).mockImplementation(
    (args: { where?: { id?: string }; select?: { status?: boolean } }) => {
      if (args?.select) {
        return Promise.resolve({ status });
      }
      return Promise.resolve({
        id: "c1",
        organizationId: "org-1",
        templateId: "tpl-1",
        createdByCoachId: "coach-1",
        status,
      });
    },
  );
}

beforeEach(() => {
  jest.clearAllMocks();
  (txMock.assessmentCampaignParticipant.updateMany as jest.Mock).mockResolvedValue(
    { count: 1 },
  );
  (txMock.assessmentCampaignParticipant.update as jest.Mock).mockResolvedValue({
    id: "p2",
    isCEO: true,
  });
  // canManageCampaign write-mode checks (org ownership + template access)
  (db.organization.findUnique as jest.Mock).mockResolvedValue({
    id: "org-1",
    ownerCoachId: "coach-1",
    deletedAt: null,
  });
  (db.accessGroupCoach.findMany as jest.Mock).mockResolvedValue([
    { accessGroupId: "g1", accessGroup: { id: "g1", deletedAt: null } },
  ]);
  (db.accessGroupTemplate.findMany as jest.Mock).mockResolvedValue([
    { accessGroupId: "g1", templateId: "tpl-1" },
  ]);
});

describe("POST /api/assessment-campaigns/[id]/ceo", () => {
  it("401 when unauthenticated", async () => {
    (getApiActor as jest.Mock).mockResolvedValue(null);
    const res = await POST(
      jsonReq({ participantId: "p1" }) as never,
      paramsFor("c1"),
    );
    expect(res.status).toBe(401);
  });

  it("404 when canManageCampaign denies (auth-fail hidden)", async () => {
    (getApiActor as jest.Mock).mockResolvedValue({
      ...coachActor,
      coachId: "other-coach",
    });
    (db.assessmentCampaign.findUnique as jest.Mock).mockResolvedValue({
      id: "c1",
      organizationId: "org-1",
      templateId: "tpl-1",
      createdByCoachId: "coach-1",
      status: "ACTIVE",
    });
    const res = await POST(
      jsonReq({ participantId: "p1" }) as never,
      paramsFor("c1"),
    );
    expect(res.status).toBe(404);
  });

  it("400 when body is missing participantId field", async () => {
    (getApiActor as jest.Mock).mockResolvedValue(coachActor);
    mockOwningCampaign("ACTIVE");
    const res = await POST(jsonReq({}) as never, paramsFor("c1"));
    expect(res.status).toBe(400);
  });

  it("409 CAMPAIGN_CLOSED when campaign is CLOSED", async () => {
    (getApiActor as jest.Mock).mockResolvedValue(coachActor);
    mockOwningCampaign("CLOSED");
    const res = await POST(
      jsonReq({ participantId: "p1" }) as never,
      paramsFor("c1"),
    );
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.error).toBe("CAMPAIGN_CLOSED");
  });

  it("404 when participantId is not on this campaign", async () => {
    (getApiActor as jest.Mock).mockResolvedValue(coachActor);
    mockOwningCampaign("ACTIVE");
    (db.assessmentCampaignParticipant.findUnique as jest.Mock).mockResolvedValue({
      campaignId: "c-other",
    });
    const res = await POST(
      jsonReq({ participantId: "p1" }) as never,
      paramsFor("c1"),
    );
    expect(res.status).toBe(404);
  });

  it("happy path: sets CEO, clears prior, writes audit", async () => {
    (getApiActor as jest.Mock).mockResolvedValue(coachActor);
    mockOwningCampaign("ACTIVE");
    (db.assessmentCampaignParticipant.findUnique as jest.Mock).mockResolvedValue({
      campaignId: "c1",
    });
    (db.assessmentCampaignParticipant.findFirst as jest.Mock).mockResolvedValue({
      id: "p-prev",
    });
    const res = await POST(
      jsonReq({ participantId: "p2" }) as never,
      paramsFor("c1"),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.ceoParticipantId).toBe("p2");
    expect(txMock.assessmentCampaignParticipant.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { campaignId: "c1", isCEO: true },
        data: { isCEO: false },
      }),
    );
    expect(txMock.assessmentCampaignParticipant.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "p2" },
        data: { isCEO: true },
      }),
    );
    expect(db.auditLog.create).toHaveBeenCalled();
    const auditCall = (db.auditLog.create as jest.Mock).mock.calls[0][0];
    const changes = JSON.parse(auditCall.data.changes);
    expect(changes.ceoChanged).toBe(true);
    expect(changes.previousCeoParticipantId).toBe("p-prev");
    expect(changes.currentCeoParticipantId).toBe("p2");
  });

  it("participantId=null clears all CEOs (no setter call)", async () => {
    (getApiActor as jest.Mock).mockResolvedValue(coachActor);
    mockOwningCampaign("ACTIVE");
    (db.assessmentCampaignParticipant.findFirst as jest.Mock).mockResolvedValue({
      id: "p-prev",
    });
    const res = await POST(
      jsonReq({ participantId: null }) as never,
      paramsFor("c1"),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.ceoParticipantId).toBe(null);
    expect(txMock.assessmentCampaignParticipant.updateMany).toHaveBeenCalled();
    expect(txMock.assessmentCampaignParticipant.update).not.toHaveBeenCalled();
  });
});
