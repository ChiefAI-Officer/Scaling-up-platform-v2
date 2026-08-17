/**
 * Wave Q (#7, ADR-0018) — POST /api/auth/accept-invite revives a soft-removed
 * ADMIN/STAFF tombstone IN PLACE (update, never a second row), records the
 * revival + role transition in the audit log, and keeps rejecting live users
 * and COACH-role tombstones.
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

jest.mock("@/lib/rate-limit", () => ({
  withRateLimit: jest.fn(),
  RateLimits: { auth: {}, standard: {} },
}));

jest.mock("bcryptjs", () => ({
  hash: jest.fn().mockResolvedValue("$2a$12$freshhash"),
  compare: jest.fn(),
}));

const txMock = {
  user: { create: jest.fn(), update: jest.fn() },
  adminInvite: { update: jest.fn() },
  auditLog: { create: jest.fn() },
};

jest.mock("@/lib/db", () => ({
  db: {
    adminInvite: { findUnique: jest.fn() },
    user: { findUnique: jest.fn() },
    $transaction: jest.fn(),
  },
}));

import { POST } from "@/app/api/auth/accept-invite/route";
import { withRateLimit } from "@/lib/rate-limit";
import { db } from "@/lib/db";

const TOKEN = "ab".repeat(32);

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const req = (body: unknown) => ({ json: async () => body }) as any;

const validBody = {
  email: "returning@scalingup.com",
  token: TOKEN,
  name: "Returning Admin",
  password: "Str0ng!Pass1",
  confirmPassword: "Str0ng!Pass1",
};

function makeInvite(overrides: Record<string, unknown> = {}) {
  return {
    id: "invite-1",
    email: "returning@scalingup.com",
    token: TOKEN,
    acceptedAt: null,
    expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
    invitedBy: "actor-1",
    ...overrides,
  };
}

function makeExisting(overrides: Record<string, unknown> = {}) {
  return {
    id: "user-9",
    email: "returning@scalingup.com",
    name: "Old Name",
    role: "ADMIN",
    deletedAt: new Date("2026-06-01"),
    ...overrides,
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  (withRateLimit as jest.Mock).mockResolvedValue({ allowed: true, headers: {} });
  (db.adminInvite.findUnique as jest.Mock).mockResolvedValue(makeInvite());
  (db.$transaction as jest.Mock).mockImplementation(async (fn) => fn(txMock));
});

describe("POST /api/auth/accept-invite — revive-on-accept", () => {
  it("still rejects a LIVE existing user (400)", async () => {
    (db.user.findUnique as jest.Mock).mockResolvedValue(
      makeExisting({ deletedAt: null })
    );

    const res = await POST(req(validBody));
    const json = await res.json();

    expect(res.status).toBe(400);
    expect(json.error).toMatch(/already exists/i);
    expect(db.$transaction).not.toHaveBeenCalled();
  });

  it("rejects a soft-deleted COACH-role tombstone (never converts a coach)", async () => {
    (db.user.findUnique as jest.Mock).mockResolvedValue(
      makeExisting({ role: "COACH" })
    );

    const res = await POST(req(validBody));

    expect(res.status).toBe(400);
    expect(db.$transaction).not.toHaveBeenCalled();
  });

  it("revives a soft-deleted ADMIN tombstone IN PLACE — update, never create", async () => {
    (db.user.findUnique as jest.Mock).mockResolvedValue(makeExisting());

    const res = await POST(req(validBody));
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.success).toBe(true);

    expect(txMock.user.update).toHaveBeenCalledWith({
      where: { id: "user-9" },
      data: {
        deletedAt: null,
        passwordHash: "$2a$12$freshhash",
        authVersion: { increment: 1 },
        role: "ADMIN",
        name: "Returning Admin",
      },
    });
    expect(txMock.user.create).not.toHaveBeenCalled();
    expect(txMock.adminInvite.update).toHaveBeenCalledWith({
      where: { id: "invite-1" },
      data: { acceptedAt: expect.any(Date) },
    });
  });

  it("audit ADMIN_INVITE_ACCEPTED records the revival + role transition (STAFF → ADMIN)", async () => {
    (db.user.findUnique as jest.Mock).mockResolvedValue(
      makeExisting({ role: "STAFF" })
    );

    const res = await POST(req(validBody));

    expect(res.status).toBe(200);
    expect(txMock.auditLog.create).toHaveBeenCalledTimes(1);
    const audit = txMock.auditLog.create.mock.calls[0][0].data;
    expect(audit.action).toBe("ADMIN_INVITE_ACCEPTED");
    expect(JSON.parse(audit.changes)).toMatchObject({
      revived: true,
      previousRole: "STAFF",
      newRole: "ADMIN",
    });
  });

  it("regression: a brand-new email still CREATES a user (create path untouched)", async () => {
    (db.user.findUnique as jest.Mock).mockResolvedValue(null);

    const res = await POST(req(validBody));

    expect(res.status).toBe(200);
    expect(txMock.user.create).toHaveBeenCalledWith({
      data: {
        email: "returning@scalingup.com",
        name: "Returning Admin",
        role: "ADMIN",
        passwordHash: "$2a$12$freshhash",
      },
    });
    expect(txMock.user.create.mock.calls[0][0].data).not.toHaveProperty("authVersion");
    expect(txMock.user.update).not.toHaveBeenCalled();
    const audit = txMock.auditLog.create.mock.calls[0][0].data;
    expect(JSON.parse(audit.changes)).not.toMatchObject({ revived: true });
  });
});
