/**
 * Assessment v7.6 — POST /api/assessment-campaigns/[id]/close (Task I).
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

jest.mock("@/lib/db", () => {
  const assessmentCampaign = (() => {
    // SEC-M6: canManageCampaign now loads via findFirst → delegate to
    // findUnique so existing sequencing is preserved.
    const findUnique = jest.fn();
    const findFirst = jest.fn((args) => findUnique(args));
    return { findUnique, findFirst, update: jest.fn(), updateMany: jest.fn() };
  })();
  const auditLog = { create: jest.fn().mockResolvedValue(undefined) };
  return {
    db: {
    organization: { findUnique: jest.fn() },
    accessGroupCoach: { findMany: jest.fn().mockResolvedValue([]) },
    accessGroupTemplate: { findMany: jest.fn().mockResolvedValue([]) },
      assessmentCampaign,
      auditLog,
      $transaction: jest.fn((callback) =>
        callback({ assessmentCampaign, auditLog }),
      ),
    },
  };
});

jest.mock("@/lib/auth/authorization", () => ({
  getApiActor: jest.fn(),
  isPrivilegedRole: (role: string) => role === "ADMIN" || role === "STAFF",
}));

jest.mock("@/lib/rate-limit", () => ({
  RateLimits: { standard: {} },
  withRateLimit: jest.fn().mockResolvedValue({ allowed: true, headers: {} }),
}));

jest.mock("@/lib/assessments/wave-public-campaign-lifecycle-flags", () => ({
  isPublicCampaignLifecycleEnabled: jest.fn(),
}));

import { POST } from "@/app/api/assessment-campaigns/[id]/close/route";
import { db } from "@/lib/db";
import { getApiActor } from "@/lib/auth/authorization";
import { isPublicCampaignLifecycleEnabled } from "@/lib/assessments/wave-public-campaign-lifecycle-flags";

const coachActor = {
  userId: "u1",
  email: "coach@example.com",
  role: "COACH" as const,
  coachId: "coach-1",
};

const adminActor = {
  userId: "admin-1",
  email: "admin@example.com",
  role: "ADMIN" as const,
  coachId: null,
};

function detailParams(id: string) {
  return { params: Promise.resolve({ id }) };
}

function postReq(body?: unknown): Request {
  return new Request("http://localhost/api/assessment-campaigns/c1/close", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

function conditionalPostReq(
  expectedStatus: "DRAFT" | "ACTIVE",
  body?: unknown,
): Request {
  return new Request(
    `http://localhost/api/assessment-campaigns/c1/close?expectedStatus=${expectedStatus}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    },
  );
}

function mockOwningCampaign(
  status: "DRAFT" | "ACTIVE" | "CLOSED",
  accessMode: "INVITED" | "PUBLIC" = "INVITED",
  closedAt: Date | null = null,
) {
  // canManageCampaign's internal findUnique call
  (db.assessmentCampaign.findUnique as jest.Mock).mockResolvedValueOnce({
    id: "c1",
    organizationId: "org-1",
    templateId: "tpl-1",
    createdByCoachId: "coach-1",
    status,
    accessMode,
  });
  // The route's second findUnique
  (db.assessmentCampaign.findUnique as jest.Mock).mockResolvedValueOnce({
    id: "c1",
    status,
    accessMode,
    closedAt,
  });
}

beforeEach(() => {
  jest.clearAllMocks();
  (db.auditLog.create as jest.Mock).mockResolvedValue(undefined);
  (isPublicCampaignLifecycleEnabled as jest.Mock).mockReturnValue(false);
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
});

describe("POST /api/assessment-campaigns/[id]/close", () => {
  it("401 when unauthenticated", async () => {
    (getApiActor as jest.Mock).mockResolvedValue(null);
    const res = await POST(postReq() as never, detailParams("c1"));
    expect(res.status).toBe(401);
  });

  it("404 when canManageCampaign denies (campaign does not exist)", async () => {
    (getApiActor as jest.Mock).mockResolvedValue(coachActor);
    // canManageCampaign findUnique returns null → not found
    (db.assessmentCampaign.findUnique as jest.Mock).mockResolvedValueOnce(null);
    const res = await POST(postReq() as never, detailParams("c1"));
    expect(res.status).toBe(404);
  });

  it("404 when campaign belongs to a different coach (not-mine)", async () => {
    (getApiActor as jest.Mock).mockResolvedValue(coachActor);
    (db.assessmentCampaign.findUnique as jest.Mock).mockResolvedValueOnce({
      id: "c1",
      organizationId: "org-1",
      templateId: "tpl-1",
      createdByCoachId: "other-coach",
      status: "ACTIVE",
    });
    const res = await POST(postReq() as never, detailParams("c1"));
    expect(res.status).toBe(404);
  });

  it("200 DRAFT → CLOSED happy path + audit log captures fromStatus + toStatus + reason", async () => {
    (getApiActor as jest.Mock).mockResolvedValue(coachActor);
    mockOwningCampaign("DRAFT");
    (db.assessmentCampaign.update as jest.Mock).mockResolvedValue({
      id: "c1",
      status: "CLOSED",
    });
    const res = await POST(
      postReq({ reason: "no longer needed" }) as never,
      detailParams("c1"),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.id).toBe("c1");
    expect(body.data.status).toBe("CLOSED");
    expect(typeof body.data.closedAt).toBe("string");
    expect(db.assessmentCampaign.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "c1" },
        data: { status: "CLOSED" },
      }),
    );
    expect(db.auditLog.create).toHaveBeenCalledTimes(1);
    const auditArgs = (db.auditLog.create as jest.Mock).mock.calls[0][0];
    expect(auditArgs.data.entityType).toBe("AssessmentCampaign");
    expect(auditArgs.data.entityId).toBe("c1");
    expect(auditArgs.data.action).toBe("CLOSE");
    expect(auditArgs.data.performedBy).toBe("coach@example.com");
    const changes = JSON.parse(auditArgs.data.changes);
    expect(changes.fromStatus).toBe("DRAFT");
    expect(changes.toStatus).toBe("CLOSED");
    expect(changes.reason).toBe("no longer needed");
  });

  it("200 ACTIVE → CLOSED happy path; reason omitted → null in audit changes", async () => {
    (getApiActor as jest.Mock).mockResolvedValue(coachActor);
    mockOwningCampaign("ACTIVE");
    (db.assessmentCampaign.update as jest.Mock).mockResolvedValue({
      id: "c1",
      status: "CLOSED",
    });
    const res = await POST(postReq({}) as never, detailParams("c1"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.status).toBe("CLOSED");
    expect(db.auditLog.create).toHaveBeenCalledTimes(1);
    const auditArgs = (db.auditLog.create as jest.Mock).mock.calls[0][0];
    const changes = JSON.parse(auditArgs.data.changes);
    expect(changes.fromStatus).toBe("ACTIVE");
    expect(changes.toStatus).toBe("CLOSED");
    expect(changes.reason).toBeNull();
  });

  it("409 ALREADY_CLOSED when campaign already closed", async () => {
    (getApiActor as jest.Mock).mockResolvedValue(coachActor);
    mockOwningCampaign("CLOSED");
    const res = await POST(postReq() as never, detailParams("c1"));
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.success).toBe(false);
    expect(body.code).toBe("ALREADY_CLOSED");
    expect(db.assessmentCampaign.update).not.toHaveBeenCalled();
    expect(db.auditLog.create).not.toHaveBeenCalled();
  });

  it("persists closedAt atomically for a lifecycle-enabled PUBLIC campaign", async () => {
    (isPublicCampaignLifecycleEnabled as jest.Mock).mockReturnValue(true);
    (getApiActor as jest.Mock).mockResolvedValue(adminActor);
    mockOwningCampaign("ACTIVE", "PUBLIC");
    (db.assessmentCampaign.updateMany as jest.Mock).mockResolvedValue({ count: 1 });

    const res = await POST(
      conditionalPostReq("ACTIVE", { reason: "launch cleanup" }) as never,
      detailParams("c1"),
    );

    expect(res.status).toBe(200);
    const body = await res.json();
    const update = (db.assessmentCampaign.updateMany as jest.Mock).mock.calls[0][0];
    expect(update.where).toEqual({
      id: "c1",
      deletedAt: null,
      status: "ACTIVE",
    });
    expect(update.data.status).toBe("CLOSED");
    expect(update.data.closedAt).toBeInstanceOf(Date);
    expect(body.data.closedAt).toBe(update.data.closedAt.toISOString());
    expect(db.$transaction).toHaveBeenCalledTimes(1);
    expect(db.auditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        entityType: "AssessmentCampaign",
        entityId: "c1",
        action: "CLOSE",
        performedBy: "admin@example.com",
      }),
    });
    expect(db.assessmentCampaign.update).not.toHaveBeenCalled();
  });

  it("fails the flagged PUBLIC transaction when its close audit cannot persist", async () => {
    (isPublicCampaignLifecycleEnabled as jest.Mock).mockReturnValue(true);
    (getApiActor as jest.Mock).mockResolvedValue(adminActor);
    mockOwningCampaign("ACTIVE", "PUBLIC");
    (db.assessmentCampaign.updateMany as jest.Mock).mockResolvedValue({ count: 1 });
    (db.auditLog.create as jest.Mock).mockRejectedValue(new Error("audit unavailable"));

    const res = await POST(
      conditionalPostReq("ACTIVE", { reason: "launch cleanup" }) as never,
      detailParams("c1"),
    );

    expect(res.status).toBe(500);
    expect(db.$transaction).toHaveBeenCalledTimes(1);
  });

  it("keeps the legacy status-only write for PUBLIC campaigns while the flag is off", async () => {
    (getApiActor as jest.Mock).mockResolvedValue(adminActor);
    mockOwningCampaign("ACTIVE", "PUBLIC");
    (db.assessmentCampaign.update as jest.Mock).mockResolvedValue({ id: "c1" });

    await POST(conditionalPostReq("ACTIVE") as never, detailParams("c1"));

    expect(db.assessmentCampaign.update).toHaveBeenCalledWith({
      where: { id: "c1" },
      data: { status: "CLOSED" },
    });
    expect(db.assessmentCampaign.updateMany).not.toHaveBeenCalled();
  });

  it("keeps the legacy status-only write for INVITED campaigns while the flag is on", async () => {
    (isPublicCampaignLifecycleEnabled as jest.Mock).mockReturnValue(true);
    (getApiActor as jest.Mock).mockResolvedValue(coachActor);
    mockOwningCampaign("ACTIVE", "INVITED");
    (db.assessmentCampaign.update as jest.Mock).mockResolvedValue({ id: "c1" });

    await POST(conditionalPostReq("ACTIVE") as never, detailParams("c1"));

    expect(db.assessmentCampaign.update).toHaveBeenCalledWith({
      where: { id: "c1" },
      data: { status: "CLOSED" },
    });
    expect(db.assessmentCampaign.updateMany).not.toHaveBeenCalled();
  });

  it("returns authoritative closure data when a concurrent PUBLIC close wins", async () => {
    (isPublicCampaignLifecycleEnabled as jest.Mock).mockReturnValue(true);
    (getApiActor as jest.Mock).mockResolvedValue(adminActor);
    mockOwningCampaign("ACTIVE", "PUBLIC");
    (db.assessmentCampaign.updateMany as jest.Mock).mockResolvedValue({ count: 0 });
    const winnerClosedAt = new Date("2026-09-15T03:04:05.000Z");
    (db.assessmentCampaign.findUnique as jest.Mock).mockResolvedValueOnce({
      id: "c1",
      status: "CLOSED",
      accessMode: "PUBLIC",
      closedAt: winnerClosedAt,
    });

    const res = await POST(
      conditionalPostReq("ACTIVE") as never,
      detailParams("c1"),
    );
    expect(res.status).toBe(409);
    expect(await res.json()).toMatchObject({
      success: false,
      code: "ALREADY_CLOSED",
      data: {
        id: "c1",
        status: "CLOSED",
        closedAt: winnerClosedAt.toISOString(),
      },
    });
    expect(db.assessmentCampaign.updateMany).toHaveBeenCalledWith({
      where: { id: "c1", deletedAt: null, status: "ACTIVE" },
      data: { status: "CLOSED", closedAt: expect.any(Date) },
    });
    expect(db.assessmentCampaign.update).not.toHaveBeenCalled();
    expect(db.auditLog.create).not.toHaveBeenCalled();
  });

  it("400 when reason is longer than 500 chars (body schema rejects)", async () => {
    (getApiActor as jest.Mock).mockResolvedValue(coachActor);
    const longReason = "x".repeat(501);
    const res = await POST(
      postReq({ reason: longReason }) as never,
      detailParams("c1"),
    );
    expect(res.status).toBe(400);
    // Body validation must short-circuit BEFORE we touch the DB
    expect(db.assessmentCampaign.update).not.toHaveBeenCalled();
  });
});
