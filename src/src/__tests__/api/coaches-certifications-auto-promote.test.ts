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
    coach: {
      findUnique: jest.fn(),
      updateMany: jest.fn(),
    },
    workshopType: {
      findUnique: jest.fn(),
    },
    coachCertification: {
      findUnique: jest.fn(),
      create: jest.fn(),
    },
    $transaction: jest.fn(),
  },
}));

jest.mock("@/lib/auth/authorization", () => ({
  getApiActor: jest.fn(),
  isPrivilegedRole: (role: string) => role === "ADMIN" || role === "STAFF",
}));

jest.mock("@/lib/audit", () => ({
  logAudit: jest.fn().mockResolvedValue(undefined),
}));

jest.mock("@prisma/client", () => {
  class PrismaClientKnownRequestError extends Error {
    code: string;
    clientVersion = "test";
    meta?: unknown;
    constructor(message: string, code = "P2002", meta?: unknown) {
      super(message);
      this.code = code;
      this.meta = meta;
    }
  }
  return { Prisma: { PrismaClientKnownRequestError } };
});

import { Prisma } from "@prisma/client";

import { POST } from "@/app/api/coaches/[id]/certifications/route";
import { db } from "@/lib/db";
import { getApiActor } from "@/lib/auth/authorization";
import { logAudit } from "@/lib/audit";

function routeParams(id = "coach-1") {
  return { params: Promise.resolve({ id }) };
}

function buildRequest(body: unknown) {
  return new Request("http://localhost/api/coaches/coach-1/certifications", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "Content-Type": "application/json" },
  }) as Parameters<typeof POST>[0];
}

const certPayload = { workshopTypeId: "wt-1" };

const createdCertSentinel = {
  id: "cert-sentinel",
  coachId: "coach-1",
  workshopTypeId: "wt-1",
  status: "ACTIVE",
  workshopType: { id: "wt-1", name: "AI Workshop" },
};
const promotionSentinel = { count: 1 };
const promotionNoOpSentinel = { count: 0 };

describe("POST /api/coaches/[id]/certifications — auto-promote PENDING → ACTIVE", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (getApiActor as jest.Mock).mockResolvedValue({
      userId: "admin-1",
      email: "admin@example.com",
      role: "ADMIN",
      coachId: null,
    });
    (db.workshopType.findUnique as jest.Mock).mockResolvedValue({ id: "wt-1" });
    (db.coachCertification.findUnique as jest.Mock).mockResolvedValue(null);
    (db.coachCertification.create as jest.Mock).mockReturnValue("cert-create-token");
    (db.coach.updateMany as jest.Mock).mockReturnValue("coach-update-token");
  });

  it("promotes a PENDING coach to ACTIVE atomically when granting a cert", async () => {
    (db.coach.findUnique as jest.Mock).mockResolvedValue({
      id: "coach-1",
      certificationStatus: "PENDING",
    });
    (db.$transaction as jest.Mock).mockResolvedValue([createdCertSentinel, promotionSentinel]);

    const res = await POST(buildRequest(certPayload), routeParams());
    const body = await res.json();

    expect(res.status).toBe(201);
    expect(body.success).toBe(true);
    expect(body.data).toMatchObject({ id: "cert-sentinel" });

    // Assert $transaction received cert-create then coach-updateMany in order.
    expect(db.$transaction).toHaveBeenCalledTimes(1);
    expect(db.$transaction).toHaveBeenCalledWith(["cert-create-token", "coach-update-token"]);

    // updateMany must include the PENDING predicate (race-guard).
    expect(db.coach.updateMany).toHaveBeenCalledWith({
      where: { id: "coach-1", certificationStatus: "PENDING" },
      data: { certificationStatus: "ACTIVE" },
    });

    // Audit log records both the cert add and the status promotion.
    expect(logAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        entityType: "Coach",
        entityId: "coach-1",
        action: "UPDATE",
        performedBy: "admin@example.com",
        changes: {
          certificationAdded: "wt-1",
          certificationStatus: { from: "PENDING", to: "ACTIVE" },
        },
      })
    );
  });

  it("does NOT record a status change in audit when updateMany hits the race-guard (count=0)", async () => {
    (db.coach.findUnique as jest.Mock).mockResolvedValue({
      id: "coach-1",
      certificationStatus: "PENDING",
    });
    (db.$transaction as jest.Mock).mockResolvedValue([createdCertSentinel, promotionNoOpSentinel]);

    const res = await POST(buildRequest(certPayload), routeParams());
    expect(res.status).toBe(201);

    const auditCall = (logAudit as jest.Mock).mock.calls[0][0];
    expect(auditCall.changes).toEqual({ certificationAdded: "wt-1" });
    expect(auditCall.changes.certificationStatus).toBeUndefined();
  });

  it("returns 500 and does not echo a created cert when the transaction rejects", async () => {
    (db.coach.findUnique as jest.Mock).mockResolvedValue({
      id: "coach-1",
      certificationStatus: "PENDING",
    });
    (db.$transaction as jest.Mock).mockRejectedValue(new Error("DB exploded"));

    const res = await POST(buildRequest(certPayload), routeParams());
    const body = await res.json();

    expect(res.status).toBe(500);
    expect(body.success).toBe(false);
    expect(body.data).toBeUndefined();
    expect(logAudit).not.toHaveBeenCalled();
  });

  it("does NOT change status when the coach is already ACTIVE", async () => {
    (db.coach.findUnique as jest.Mock).mockResolvedValue({
      id: "coach-1",
      certificationStatus: "ACTIVE",
    });
    (db.coachCertification.create as jest.Mock).mockResolvedValue(createdCertSentinel);

    const res = await POST(buildRequest(certPayload), routeParams());
    const body = await res.json();

    expect(res.status).toBe(201);
    expect(body.success).toBe(true);
    expect(db.coach.updateMany).not.toHaveBeenCalled();
    expect(db.$transaction).not.toHaveBeenCalled();

    // Audit log still fires for the cert addition.
    expect(logAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        entityType: "Coach",
        action: "UPDATE",
        changes: { certificationAdded: "wt-1" },
      })
    );
  });

  it("does NOT promote a DEACTIVATED coach (explicit reactivation required)", async () => {
    (db.coach.findUnique as jest.Mock).mockResolvedValue({
      id: "coach-1",
      certificationStatus: "DEACTIVATED",
    });
    (db.coachCertification.create as jest.Mock).mockResolvedValue(createdCertSentinel);

    const res = await POST(buildRequest(certPayload), routeParams());
    const body = await res.json();

    expect(res.status).toBe(201);
    expect(body.success).toBe(true);
    expect(db.coach.updateMany).not.toHaveBeenCalled();
  });

  it("returns 409 on pre-flight duplicate without touching coach status", async () => {
    (db.coach.findUnique as jest.Mock).mockResolvedValue({
      id: "coach-1",
      certificationStatus: "PENDING",
    });
    (db.coachCertification.findUnique as jest.Mock).mockResolvedValue({ id: "cert-existing" });

    const res = await POST(buildRequest(certPayload), routeParams());
    const body = await res.json();

    expect(res.status).toBe(409);
    expect(body.success).toBe(false);
    expect(db.coach.updateMany).not.toHaveBeenCalled();
    expect(db.$transaction).not.toHaveBeenCalled();
    expect(db.coachCertification.create).not.toHaveBeenCalled();
  });

  it("returns 409 when a concurrent P2002 unique-constraint violation lands at DB time", async () => {
    (db.coach.findUnique as jest.Mock).mockResolvedValue({
      id: "coach-1",
      certificationStatus: "ACTIVE",
    });
    const p2002 = new Prisma.PrismaClientKnownRequestError("Unique constraint failed");
    (db.coachCertification.create as jest.Mock).mockRejectedValue(p2002);

    const res = await POST(buildRequest(certPayload), routeParams());
    const body = await res.json();

    expect(res.status).toBe(409);
    expect(body.success).toBe(false);
  });

  it("returns 404 when coach does not exist", async () => {
    (db.coach.findUnique as jest.Mock).mockResolvedValue(null);

    const res = await POST(buildRequest(certPayload), routeParams());
    const body = await res.json();

    expect(res.status).toBe(404);
    expect(body.success).toBe(false);
    expect(db.coach.updateMany).not.toHaveBeenCalled();
  });
});
