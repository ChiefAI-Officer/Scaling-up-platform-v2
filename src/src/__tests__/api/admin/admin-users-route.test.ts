/**
 * Wave Q (#7, ADR-0018) — /api/admin/admin-users routes.
 *
 * GET  — ADMIN-only live admin/staff listing (available regardless of flag).
 * DELETE [id] — the REMOVE capability (flag-gated) + guard ladder + one
 * transaction (deletedAt + adminInvite.deleteMany + ADMIN_USER_REMOVED audit).
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

jest.mock("@/lib/auth/authorization", () => ({
  getApiActor: jest.fn(),
}));

const txMock = {
  user: { update: jest.fn() },
  adminInvite: { deleteMany: jest.fn() },
  auditLog: { create: jest.fn() },
};

jest.mock("@/lib/db", () => ({
  db: {
    user: { findMany: jest.fn(), findUnique: jest.fn() },
    $transaction: jest.fn(),
  },
}));

import { GET } from "@/app/api/admin/admin-users/route";
import { DELETE } from "@/app/api/admin/admin-users/[id]/route";
import { getApiActor } from "@/lib/auth/authorization";
import { db } from "@/lib/db";

const ADMIN_ACTOR = {
  userId: "actor-1",
  email: "suzanne@scalingup.com",
  role: "ADMIN" as const,
  coachId: null,
};
const STAFF_ACTOR = { ...ADMIN_ACTOR, userId: "actor-2", role: "STAFF" as const };

const CANONICAL_EMAIL = "canonical-admin@scalingup.com";

function makeTarget(overrides: Record<string, unknown> = {}) {
  return {
    id: "target-1",
    email: "departed@scalingup.com",
    name: "Departed Admin",
    role: "ADMIN",
    deletedAt: null,
    coachProfile: null,
    ...overrides,
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const req = () => ({}) as any;
const params = (id: string) => ({ params: Promise.resolve({ id }) });

beforeEach(() => {
  jest.clearAllMocks();
  process.env.ADMIN_EMAIL = CANONICAL_EMAIL;
  // Capability flag ON by default in this suite; individual tests turn it off.
  process.env.WAVE_Q_ADMIN_CONTROLS_ENABLED = "1";
  delete process.env.WAVE_Q_ADMIN_CONTROLS_KILL;
  (db.$transaction as jest.Mock).mockImplementation(async (fn) => fn(txMock));
});

afterAll(() => {
  delete process.env.WAVE_Q_ADMIN_CONTROLS_ENABLED;
});

describe("GET /api/admin/admin-users", () => {
  it("401 when unauthenticated", async () => {
    (getApiActor as jest.Mock).mockResolvedValue(null);
    const res = await GET();
    expect(res.status).toBe(401);
  });

  it("403 for STAFF (ADMIN-only, mirrors the invite route)", async () => {
    (getApiActor as jest.Mock).mockResolvedValue(STAFF_ACTOR);
    const res = await GET();
    expect(res.status).toBe(403);
  });

  it("is available with the flag OFF (read-only list is not the gated capability)", async () => {
    delete process.env.WAVE_Q_ADMIN_CONTROLS_ENABLED;
    (getApiActor as jest.Mock).mockResolvedValue(ADMIN_ACTOR);
    (db.user.findMany as jest.Mock).mockResolvedValue([]);

    const res = await GET();
    expect(res.status).toBe(200);
  });

  it("returns live ADMIN/STAFF users ordered by email, with hasCoachProfile/self/canonical flags", async () => {
    (getApiActor as jest.Mock).mockResolvedValue(ADMIN_ACTOR);
    (db.user.findMany as jest.Mock).mockResolvedValue([
      {
        id: "actor-1",
        email: "suzanne@scalingup.com",
        name: "Suzanne",
        role: "ADMIN",
        coachProfile: null,
      },
      {
        id: "u-2",
        email: CANONICAL_EMAIL,
        name: "Canonical",
        role: "ADMIN",
        coachProfile: null,
      },
      {
        id: "u-3",
        email: "hybrid@scalingup.com",
        name: "Hybrid Staff",
        role: "STAFF",
        coachProfile: { id: "coach-3" },
      },
    ]);

    const res = await GET();
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(db.user.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          deletedAt: null,
          role: { in: ["ADMIN", "STAFF"] },
        }),
        orderBy: { email: "asc" },
      })
    );
    expect(body.data).toEqual([
      {
        id: "actor-1",
        email: "suzanne@scalingup.com",
        name: "Suzanne",
        role: "ADMIN",
        hasCoachProfile: false,
        self: true,
        canonical: false,
      },
      {
        id: "u-2",
        email: CANONICAL_EMAIL,
        name: "Canonical",
        role: "ADMIN",
        hasCoachProfile: false,
        self: false,
        canonical: true,
      },
      {
        id: "u-3",
        email: "hybrid@scalingup.com",
        name: "Hybrid Staff",
        role: "STAFF",
        hasCoachProfile: true,
        self: false,
        canonical: false,
      },
    ]);
  });
});

describe("DELETE /api/admin/admin-users/[id] — guard ladder", () => {
  beforeEach(() => {
    (getApiActor as jest.Mock).mockResolvedValue(ADMIN_ACTOR);
    (db.user.findUnique as jest.Mock).mockResolvedValue(makeTarget());
  });

  it("401 when unauthenticated", async () => {
    (getApiActor as jest.Mock).mockResolvedValue(null);
    const res = await DELETE(req(), params("target-1"));
    expect(res.status).toBe(401);
    expect(db.$transaction).not.toHaveBeenCalled();
  });

  it("403 for a STAFF actor (remove is ADMIN-only)", async () => {
    (getApiActor as jest.Mock).mockResolvedValue(STAFF_ACTOR);
    const res = await DELETE(req(), params("target-1"));
    expect(res.status).toBe(403);
    expect(db.$transaction).not.toHaveBeenCalled();
  });

  it("403 when the Wave Q flag is OFF — the remove CAPABILITY is gated", async () => {
    delete process.env.WAVE_Q_ADMIN_CONTROLS_ENABLED;
    const res = await DELETE(req(), params("target-1"));
    expect(res.status).toBe(403);
    expect(db.$transaction).not.toHaveBeenCalled();
  });

  it("403 when the kill switch is set even if enabled", async () => {
    process.env.WAVE_Q_ADMIN_CONTROLS_KILL = "1";
    const res = await DELETE(req(), params("target-1"));
    expect(res.status).toBe(403);
    expect(db.$transaction).not.toHaveBeenCalled();
  });

  it("404 when the target does not exist", async () => {
    (db.user.findUnique as jest.Mock).mockResolvedValue(null);
    const res = await DELETE(req(), params("nope"));
    expect(res.status).toBe(404);
  });

  it("404 when the target is already soft-removed", async () => {
    (db.user.findUnique as jest.Mock).mockResolvedValue(
      makeTarget({ deletedAt: new Date("2026-06-01") })
    );
    const res = await DELETE(req(), params("target-1"));
    expect(res.status).toBe(404);
    expect(db.$transaction).not.toHaveBeenCalled();
  });

  it("400 when the target is a COACH-role user", async () => {
    (db.user.findUnique as jest.Mock).mockResolvedValue(
      makeTarget({ role: "COACH" })
    );
    const res = await DELETE(req(), params("target-1"));
    expect(res.status).toBe(400);
    expect(db.$transaction).not.toHaveBeenCalled();
  });

  it("400 on self-removal", async () => {
    (db.user.findUnique as jest.Mock).mockResolvedValue(
      makeTarget({ id: ADMIN_ACTOR.userId, email: ADMIN_ACTOR.email })
    );
    const res = await DELETE(req(), params(ADMIN_ACTOR.userId));
    expect(res.status).toBe(400);
    expect(db.$transaction).not.toHaveBeenCalled();
  });

  it("400 when the target is the canonical ADMIN_EMAIL (case-insensitive)", async () => {
    (db.user.findUnique as jest.Mock).mockResolvedValue(
      makeTarget({ email: CANONICAL_EMAIL.toUpperCase() })
    );
    const res = await DELETE(req(), params("target-1"));
    expect(res.status).toBe(400);
    expect(db.$transaction).not.toHaveBeenCalled();
  });

  it("fails closed when ADMIN_EMAIL is unset — no implicit canonical protection, removal proceeds", async () => {
    delete process.env.ADMIN_EMAIL;
    const res = await DELETE(req(), params("target-1"));
    expect(res.status).toBe(200);
  });
});

describe("DELETE /api/admin/admin-users/[id] — successful removal transaction", () => {
  beforeEach(() => {
    (getApiActor as jest.Mock).mockResolvedValue(ADMIN_ACTOR);
  });

  it("sets deletedAt, deletes the AdminInvite row, and audit-logs ADMIN_USER_REMOVED in ONE transaction", async () => {
    (db.user.findUnique as jest.Mock).mockResolvedValue(makeTarget());

    const res = await DELETE(req(), params("target-1"));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body).toEqual({ success: true });

    expect(db.$transaction).toHaveBeenCalledTimes(1);
    expect(txMock.user.update).toHaveBeenCalledWith({
      where: { id: "target-1" },
      data: { deletedAt: expect.any(Date) },
    });
    expect(txMock.adminInvite.deleteMany).toHaveBeenCalledWith({
      where: { email: "departed@scalingup.com" },
    });
    expect(txMock.auditLog.create).toHaveBeenCalledTimes(1);
    const audit = txMock.auditLog.create.mock.calls[0][0].data;
    expect(audit).toMatchObject({
      entityType: "User",
      entityId: "target-1",
      action: "ADMIN_USER_REMOVED",
      performedBy: ADMIN_ACTOR.email,
    });
    expect(JSON.parse(audit.changes)).toMatchObject({
      removedEmail: "departed@scalingup.com",
      removedRole: "ADMIN",
      hadCoachProfile: false,
    });
  });

  it("hybrid accounts (coach profile present) ARE removable — whole-account lock, audit records hadCoachProfile", async () => {
    (db.user.findUnique as jest.Mock).mockResolvedValue(
      makeTarget({ role: "STAFF", coachProfile: { id: "coach-1" } })
    );

    const res = await DELETE(req(), params("target-1"));

    expect(res.status).toBe(200);
    const audit = txMock.auditLog.create.mock.calls[0][0].data;
    expect(JSON.parse(audit.changes)).toMatchObject({
      removedRole: "STAFF",
      hadCoachProfile: true,
    });
  });
});
