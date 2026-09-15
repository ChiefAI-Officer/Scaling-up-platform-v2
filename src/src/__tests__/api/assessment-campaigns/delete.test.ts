/**
 * Assessment Wave D — DELETE /api/assessment-campaigns/[id] (soft-delete, #1).
 *
 * Authorization is a DISTINCT ownership predicate (admin/privileged OR the
 * campaign creator coach) — NOT canManageCampaign("write"), so a creator
 * coach who later lost template/org access can still delete (ownership
 * cleanup). Deletable in ANY state (DRAFT/ACTIVE/CLOSED); soft-delete only
 * (sets deletedAt). Already-deleted / non-existent live → 404. Audited.
 * Rate-limited. An optional expectedStatus query parameter makes deletion
 * conditional for lifecycle UIs without changing legacy callers.
 *
 * Also includes a regression for the publish-resurrect gap (Part C #1):
 * publishing a soft-deleted PUBLIC campaign must be blocked (404).
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
    accessGroupCoach: { findMany: jest.fn().mockResolvedValue([]) },
    accessGroupTemplate: { findMany: jest.fn().mockResolvedValue([]) },
    assessmentCampaign: {
      findFirst: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
    },
    auditLog: { create: jest.fn().mockResolvedValue(undefined) },
  },
}));

jest.mock("@/lib/auth/authorization", () => ({
  getApiActor: jest.fn(),
  isPrivilegedRole: (role: string) => role === "ADMIN" || role === "STAFF",
}));

let allowRateLimit = true;
jest.mock("@/lib/rate-limit", () => ({
  RateLimits: { standard: {} },
  withRateLimit: jest.fn(async () => ({
    allowed: allowRateLimit,
    headers: {},
  })),
}));

jest.mock("@/lib/assessments/wave-public-campaign-lifecycle-flags", () => ({
  isPublicCampaignLifecycleEnabled: jest.fn(),
}));

import { DELETE } from "@/app/api/assessment-campaigns/[id]/route";
import { POST as PUBLISH } from "@/app/api/admin/public-campaigns/[id]/publish/route";
import { db } from "@/lib/db";
import { getApiActor } from "@/lib/auth/authorization";
import { isPublicCampaignLifecycleEnabled } from "@/lib/assessments/wave-public-campaign-lifecycle-flags";

const adminActor = {
  userId: "admin-1",
  email: "admin@example.com",
  role: "ADMIN" as const,
  coachId: null,
};
const ownerCoach = {
  userId: "u1",
  email: "owner@example.com",
  role: "COACH" as const,
  coachId: "coach-1",
};
const otherCoach = {
  userId: "u2",
  email: "other@example.com",
  role: "COACH" as const,
  coachId: "coach-2",
};

function params(id: string) {
  return { params: Promise.resolve({ id }) };
}

function delReq(expectedStatus?: "DRAFT" | "CLOSED"): Request {
  const suffix = expectedStatus ? `?expectedStatus=${expectedStatus}` : "";
  return new Request(`http://localhost/api/assessment-campaigns/c1${suffix}`, {
    method: "DELETE",
  });
}

beforeEach(() => {
  jest.clearAllMocks();
  allowRateLimit = true;
  (isPublicCampaignLifecycleEnabled as jest.Mock).mockReturnValue(false);
});

describe("DELETE /api/assessment-campaigns/[id]", () => {
  it("401 when unauthenticated", async () => {
    (getApiActor as jest.Mock).mockResolvedValue(null);
    const res = await DELETE(delReq() as never, params("c1"));
    expect(res.status).toBe(401);
    expect(db.assessmentCampaign.update).not.toHaveBeenCalled();
  });

  it("429 when rate-limited", async () => {
    allowRateLimit = false;
    (getApiActor as jest.Mock).mockResolvedValue(adminActor);
    const res = await DELETE(delReq() as never, params("c1"));
    expect(res.status).toBe(429);
    expect(db.assessmentCampaign.update).not.toHaveBeenCalled();
  });

  it("admin soft-deletes a campaign (sets deletedAt, audited, 200)", async () => {
    (getApiActor as jest.Mock).mockResolvedValue(adminActor);
    (db.assessmentCampaign.findFirst as jest.Mock).mockResolvedValue({
      id: "c1",
      createdByCoachId: "coach-1",
      status: "ACTIVE",
      deletedAt: null,
    });
    (db.assessmentCampaign.update as jest.Mock).mockResolvedValue({ id: "c1" });

    const res = await DELETE(delReq() as never, params("c1"));
    expect(res.status).toBe(200);

    const updateArg = (db.assessmentCampaign.update as jest.Mock).mock
      .calls[0][0];
    expect(updateArg.where).toEqual({ id: "c1" });
    expect(updateArg.data.deletedAt).toBeInstanceOf(Date);

    expect(db.auditLog.create).toHaveBeenCalledTimes(1);
    const auditArg = (db.auditLog.create as jest.Mock).mock.calls[0][0];
    expect(auditArg.data.entityType).toBe("AssessmentCampaign");
    expect(auditArg.data.entityId).toBe("c1");
    expect(auditArg.data.action).toBe("DELETE");
    expect(auditArg.data.performedBy).toBe("admin@example.com");
  });

  it("the OWNING coach (createdByCoachId === actor.coachId) can delete", async () => {
    (getApiActor as jest.Mock).mockResolvedValue(ownerCoach);
    (db.assessmentCampaign.findFirst as jest.Mock).mockResolvedValue({
      id: "c1",
      createdByCoachId: "coach-1",
      status: "DRAFT",
      deletedAt: null,
    });
    (db.assessmentCampaign.update as jest.Mock).mockResolvedValue({ id: "c1" });

    const res = await DELETE(delReq() as never, params("c1"));
    expect(res.status).toBe(200);
    expect(db.assessmentCampaign.update).toHaveBeenCalledTimes(1);
  });

  it("the owning coach can delete even when status is CLOSED", async () => {
    (getApiActor as jest.Mock).mockResolvedValue(ownerCoach);
    (db.assessmentCampaign.findFirst as jest.Mock).mockResolvedValue({
      id: "c1",
      createdByCoachId: "coach-1",
      status: "CLOSED",
      deletedAt: null,
    });
    (db.assessmentCampaign.update as jest.Mock).mockResolvedValue({ id: "c1" });

    const res = await DELETE(delReq() as never, params("c1"));
    expect(res.status).toBe(200);
  });

  it("rejects direct deletion of a lifecycle-enabled ACTIVE public campaign", async () => {
    (isPublicCampaignLifecycleEnabled as jest.Mock).mockReturnValue(true);
    (getApiActor as jest.Mock).mockResolvedValue(adminActor);
    (db.assessmentCampaign.findFirst as jest.Mock).mockResolvedValue({
      id: "c1",
      createdByCoachId: null,
      status: "ACTIVE",
      accessMode: "PUBLIC",
      deletedAt: null,
    });

    const res = await DELETE(delReq() as never, params("c1"));

    expect(res.status).toBe(409);
    expect(await res.json()).toMatchObject({
      success: false,
      code: "CAMPAIGN_STATUS_CHANGED",
    });
    expect(db.assessmentCampaign.update).not.toHaveBeenCalled();
    expect(db.assessmentCampaign.updateMany).not.toHaveBeenCalled();
    expect(db.auditLog.create).not.toHaveBeenCalled();
  });

  it("soft-deletes a lifecycle-enabled DRAFT public campaign conditionally", async () => {
    (isPublicCampaignLifecycleEnabled as jest.Mock).mockReturnValue(true);
    (getApiActor as jest.Mock).mockResolvedValue(adminActor);
    (db.assessmentCampaign.findFirst as jest.Mock).mockResolvedValue({
      id: "c1",
      createdByCoachId: null,
      status: "DRAFT",
      accessMode: "PUBLIC",
      deletedAt: null,
    });
    (db.assessmentCampaign.updateMany as jest.Mock).mockResolvedValue({ count: 1 });

    const res = await DELETE(delReq("DRAFT") as never, params("c1"));

    expect(res.status).toBe(200);
    expect(db.assessmentCampaign.updateMany).toHaveBeenCalledWith({
      where: { id: "c1", deletedAt: null, status: "DRAFT" },
      data: { deletedAt: expect.any(Date) },
    });
    expect(db.assessmentCampaign.update).not.toHaveBeenCalled();
  });

  it("atomically rejects deletion when a lifecycle-enabled public campaign status changed", async () => {
    (isPublicCampaignLifecycleEnabled as jest.Mock).mockReturnValue(true);
    (getApiActor as jest.Mock).mockResolvedValue(adminActor);
    (db.assessmentCampaign.findFirst as jest.Mock).mockResolvedValue({
      id: "c1",
      createdByCoachId: null,
      status: "DRAFT",
      accessMode: "PUBLIC",
      deletedAt: null,
    });
    (db.assessmentCampaign.updateMany as jest.Mock).mockResolvedValue({ count: 0 });

    const res = await DELETE(delReq("DRAFT") as never, params("c1"));
    expect(res.status).toBe(409);
    expect(await res.json()).toMatchObject({
      success: false,
      code: "CAMPAIGN_STATUS_CHANGED",
    });
    expect(db.assessmentCampaign.updateMany).toHaveBeenCalledWith({
      where: { id: "c1", deletedAt: null, status: "DRAFT" },
      data: { deletedAt: expect.any(Date) },
    });
    expect(db.assessmentCampaign.update).not.toHaveBeenCalled();
    expect(db.auditLog.create).not.toHaveBeenCalled();
  });

  it("keeps legacy any-state deletion for PUBLIC campaigns while the flag is off", async () => {
    (getApiActor as jest.Mock).mockResolvedValue(adminActor);
    (db.assessmentCampaign.findFirst as jest.Mock).mockResolvedValue({
      id: "c1",
      createdByCoachId: null,
      status: "ACTIVE",
      accessMode: "PUBLIC",
      deletedAt: null,
    });
    (db.assessmentCampaign.update as jest.Mock).mockResolvedValue({ id: "c1" });

    const res = await DELETE(delReq() as never, params("c1"));

    expect(res.status).toBe(200);
    expect(db.assessmentCampaign.update).toHaveBeenCalledTimes(1);
    expect(db.assessmentCampaign.updateMany).not.toHaveBeenCalled();
  });

  it("keeps legacy any-state deletion for INVITED campaigns while the flag is on", async () => {
    (isPublicCampaignLifecycleEnabled as jest.Mock).mockReturnValue(true);
    (getApiActor as jest.Mock).mockResolvedValue(ownerCoach);
    (db.assessmentCampaign.findFirst as jest.Mock).mockResolvedValue({
      id: "c1",
      createdByCoachId: "coach-1",
      status: "ACTIVE",
      accessMode: "INVITED",
      deletedAt: null,
    });
    (db.assessmentCampaign.update as jest.Mock).mockResolvedValue({ id: "c1" });

    const res = await DELETE(delReq() as never, params("c1"));

    expect(res.status).toBe(200);
    expect(db.assessmentCampaign.update).toHaveBeenCalledTimes(1);
    expect(db.assessmentCampaign.updateMany).not.toHaveBeenCalled();
  });

  it("400 for an invalid expected status on a lifecycle-enabled PUBLIC campaign", async () => {
    (isPublicCampaignLifecycleEnabled as jest.Mock).mockReturnValue(true);
    (getApiActor as jest.Mock).mockResolvedValue(adminActor);
    const request = new Request(
      "http://localhost/api/assessment-campaigns/c1?expectedStatus=ACTIVE",
      { method: "DELETE" },
    );
    (db.assessmentCampaign.findFirst as jest.Mock).mockResolvedValue({
      id: "c1",
      createdByCoachId: null,
      status: "DRAFT",
      accessMode: "PUBLIC",
      deletedAt: null,
    });

    const res = await DELETE(request as never, params("c1"));
    expect(res.status).toBe(400);
    expect(db.assessmentCampaign.findFirst).toHaveBeenCalled();
    expect(db.assessmentCampaign.update).not.toHaveBeenCalled();
    expect(db.assessmentCampaign.updateMany).not.toHaveBeenCalled();
  });

  it("403 when a DIFFERENT coach attempts to delete", async () => {
    (getApiActor as jest.Mock).mockResolvedValue(otherCoach);
    (db.assessmentCampaign.findFirst as jest.Mock).mockResolvedValue({
      id: "c1",
      createdByCoachId: "coach-1",
      status: "ACTIVE",
      deletedAt: null,
    });

    const res = await DELETE(delReq() as never, params("c1"));
    expect(res.status).toBe(403);
    expect(db.assessmentCampaign.update).not.toHaveBeenCalled();
  });

  it("403 for an admin-created PUBLIC campaign (createdByCoachId null) when actor is a coach", async () => {
    (getApiActor as jest.Mock).mockResolvedValue(ownerCoach);
    (db.assessmentCampaign.findFirst as jest.Mock).mockResolvedValue({
      id: "c1",
      createdByCoachId: null,
      status: "ACTIVE",
      deletedAt: null,
    });

    const res = await DELETE(delReq() as never, params("c1"));
    expect(res.status).toBe(403);
    expect(db.assessmentCampaign.update).not.toHaveBeenCalled();
  });

  it("404 when the live campaign does not exist (or is already deleted)", async () => {
    (getApiActor as jest.Mock).mockResolvedValue(adminActor);
    // loadLiveCampaign uses findFirst with deletedAt:null → null for a
    // soft-deleted or non-existent row.
    (db.assessmentCampaign.findFirst as jest.Mock).mockResolvedValue(null);

    const res = await DELETE(delReq() as never, params("c1"));
    expect(res.status).toBe(404);
    expect(db.assessmentCampaign.update).not.toHaveBeenCalled();
  });

  it("loads the campaign LIVE-only (findFirst with deletedAt: null)", async () => {
    (getApiActor as jest.Mock).mockResolvedValue(adminActor);
    (db.assessmentCampaign.findFirst as jest.Mock).mockResolvedValue({
      id: "c1",
      createdByCoachId: "coach-1",
      status: "ACTIVE",
      deletedAt: null,
    });
    (db.assessmentCampaign.update as jest.Mock).mockResolvedValue({ id: "c1" });

    await DELETE(delReq() as never, params("c1"));

    const findArg = (db.assessmentCampaign.findFirst as jest.Mock).mock
      .calls[0][0];
    expect(findArg.where).toMatchObject({ id: "c1", deletedAt: null });
  });
});

// ── Part C #1 regression: publish must not resurrect a soft-deleted campaign ──
describe("POST /api/admin/public-campaigns/[id]/publish — soft-delete guard", () => {
  it("404 when the campaign is soft-deleted (cannot republish)", async () => {
    (getApiActor as jest.Mock).mockResolvedValue(adminActor);
    // The publish route must load LIVE-only (findFirst with deletedAt:null);
    // a soft-deleted row returns null → 404.
    (db.assessmentCampaign.findFirst as jest.Mock).mockResolvedValue(null);
    (db.assessmentCampaign.findUnique as jest.Mock).mockResolvedValue(null);

    const res = await PUBLISH(
      new Request(
        "http://localhost/api/admin/public-campaigns/c1/publish",
        { method: "POST" },
      ) as never,
      params("c1"),
    );
    expect(res.status).toBe(404);
    expect(db.assessmentCampaign.update).not.toHaveBeenCalled();
  });

  it("publishes a LIVE PUBLIC DRAFT campaign (200)", async () => {
    (getApiActor as jest.Mock).mockResolvedValue(adminActor);
    (db.assessmentCampaign.findFirst as jest.Mock).mockResolvedValue({
      id: "c1",
      status: "DRAFT",
      accessMode: "PUBLIC",
      deletedAt: null,
    });
    (db.assessmentCampaign.update as jest.Mock).mockResolvedValue({
      id: "c1",
      status: "ACTIVE",
    });

    const res = await PUBLISH(
      new Request(
        "http://localhost/api/admin/public-campaigns/c1/publish",
        { method: "POST" },
      ) as never,
      params("c1"),
    );
    expect(res.status).toBe(200);
    expect(db.assessmentCampaign.update).toHaveBeenCalledTimes(1);
  });
});
