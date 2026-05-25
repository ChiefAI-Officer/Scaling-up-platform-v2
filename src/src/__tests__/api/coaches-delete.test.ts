jest.mock("next/server", () => ({
  NextResponse: {
    json: (body: unknown, init?: ResponseInit) =>
      new Response(JSON.stringify(body), { status: init?.status ?? 200 }),
  },
}));

jest.mock("@/lib/auth/authorization", () => ({
  getApiActor: jest.fn(),
}));

jest.mock("@/lib/db", () => ({
  db: {
    coach: {
      findUnique: jest.fn(),
      delete: jest.fn(),
    },
    user: {
      delete: jest.fn(),
    },
    accessGroupCoach: {
      deleteMany: jest.fn(),
    },
    organization: {
      count: jest.fn(),
    },
    organizationOwnershipEvent: {
      updateMany: jest.fn(),
    },
    assessmentCampaign: {
      updateMany: jest.fn(),
    },
    approvalQueue: {
      count: jest.fn(),
    },
    followUpReport: {
      count: jest.fn(),
    },
    auditLog: {
      create: jest.fn(),
    },
    $transaction: jest.fn(),
  },
}));

import { DELETE } from "@/app/api/coaches/[id]/route";
import { db } from "@/lib/db";
import { getApiActor } from "@/lib/auth/authorization";

function routeParams(id: string) {
  return { params: Promise.resolve({ id }) };
}

function makeRequest(id: string) {
  return new Request(`http://localhost/api/coaches/${id}`, { method: "DELETE" });
}

const adminActor = { userId: "admin-1", email: "admin@example.com", role: "ADMIN", coachId: null };

const baseCoach = {
  id: "coach-1",
  firstName: "Jane",
  lastName: "Smith",
  email: "jane@example.com",
  userId: "user-1",
  workshops: [],
};

describe("DELETE /api/coaches/[id]", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (getApiActor as jest.Mock).mockResolvedValue(adminActor);
    (db.coach.findUnique as jest.Mock).mockResolvedValue(baseCoach);
    (db.$transaction as jest.Mock).mockImplementation(
      async (fn: (...args: unknown[]) => unknown) => fn(db)
    );
    (db.organization.count as jest.Mock).mockResolvedValue(0);
    (db.accessGroupCoach.deleteMany as jest.Mock).mockResolvedValue({ count: 0 });
    (db.organizationOwnershipEvent.updateMany as jest.Mock).mockResolvedValue({ count: 0 });
    (db.assessmentCampaign.updateMany as jest.Mock).mockResolvedValue({ count: 0 });
    (db.approvalQueue.count as jest.Mock).mockResolvedValue(0);
    (db.followUpReport.count as jest.Mock).mockResolvedValue(0);
    (db.coach.delete as jest.Mock).mockResolvedValue({});
    (db.user.delete as jest.Mock).mockResolvedValue({});
    (db.auditLog.create as jest.Mock).mockResolvedValue({});
  });

  it("returns 401 when unauthenticated", async () => {
    (getApiActor as jest.Mock).mockResolvedValue(null);
    const res = await DELETE(makeRequest("coach-1"), routeParams("coach-1"));
    expect(res.status).toBe(401);
  });

  it("returns 403 when not admin", async () => {
    (getApiActor as jest.Mock).mockResolvedValue({ ...adminActor, role: "STAFF" });
    const res = await DELETE(makeRequest("coach-1"), routeParams("coach-1"));
    expect(res.status).toBe(403);
  });

  it("returns 404 when coach not found", async () => {
    (db.coach.findUnique as jest.Mock).mockResolvedValue(null);
    const res = await DELETE(makeRequest("coach-1"), routeParams("coach-1"));
    expect(res.status).toBe(404);
  });

  it("returns 400 when coach has active workshops", async () => {
    (db.coach.findUnique as jest.Mock).mockResolvedValue({
      ...baseCoach,
      workshops: [{ id: "ws-1", status: "PRE_EVENT" }],
    });
    const res = await DELETE(makeRequest("coach-1"), routeParams("coach-1"));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/active workshop/i);
  });

  it("blocks deletion if coach owns organizations", async () => {
    (db.organization.count as jest.Mock).mockResolvedValue(2);
    const res = await DELETE(makeRequest("coach-1"), routeParams("coach-1"));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/organization/i);
  });

  it("deletes accessGroupCoach entries before deleting coach (BUG-MAY25)", async () => {
    const res = await DELETE(makeRequest("coach-1"), routeParams("coach-1"));
    expect(res.status).toBe(200);
    expect(db.accessGroupCoach.deleteMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ coachId: "coach-1" }) })
    );
    expect(db.coach.delete).toHaveBeenCalledWith({ where: { id: "coach-1" } });
  });

  it("nullifies assessment campaign coach links before deleting coach", async () => {
    const res = await DELETE(makeRequest("coach-1"), routeParams("coach-1"));
    expect(res.status).toBe(200);
    expect(db.assessmentCampaign.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ createdByCoachId: "coach-1" }),
        data: expect.objectContaining({ createdByCoachId: null }),
      })
    );
  });

  it("deletes the linked user account when present", async () => {
    const res = await DELETE(makeRequest("coach-1"), routeParams("coach-1"));
    expect(res.status).toBe(200);
    expect(db.user.delete).toHaveBeenCalledWith({ where: { id: "user-1" } });
  });

  it("succeeds even if user deletion fails due to FK constraints (best-effort)", async () => {
    const { PrismaClientKnownRequestError } = await import("@prisma/client/runtime/library");
    (db.user.delete as jest.Mock).mockRejectedValue(
      new PrismaClientKnownRequestError("FK constraint", { code: "P2003", clientVersion: "6.0" })
    );
    const res = await DELETE(makeRequest("coach-1"), routeParams("coach-1"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
  });
});
