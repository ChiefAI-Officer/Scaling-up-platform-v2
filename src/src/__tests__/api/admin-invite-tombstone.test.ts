/**
 * Wave Q (#7, ADR-0018) — POST /api/admin/invite allows re-inviting a
 * soft-removed ADMIN/STAFF tombstone, while keeping every existing rejection:
 * live users are still rejected, and a soft-deleted COACH-role tombstone is
 * NEVER silently convertible to ADMIN via an invite.
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

jest.mock("@/lib/db", () => ({
  db: {
    user: { findUnique: jest.fn() },
    adminInvite: { findUnique: jest.fn(), upsert: jest.fn() },
    auditLog: { create: jest.fn() },
  },
}));

jest.mock("@/services/notifications", () => ({
  sendAdminInviteEmail: jest.fn().mockResolvedValue(undefined),
}));

import { POST } from "@/app/api/admin/invite/route";
import { getApiActor } from "@/lib/auth/authorization";
import { db } from "@/lib/db";
import { sendAdminInviteEmail } from "@/services/notifications";

const ADMIN_ACTOR = {
  userId: "actor-1",
  email: "suzanne@scalingup.com",
  role: "ADMIN" as const,
  coachId: null,
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const req = (body: unknown) => ({ json: async () => body }) as any;

function makeExisting(overrides: Record<string, unknown> = {}) {
  return {
    id: "user-9",
    email: "returning@scalingup.com",
    name: "Returning Admin",
    role: "ADMIN",
    deletedAt: null,
    ...overrides,
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  (getApiActor as jest.Mock).mockResolvedValue(ADMIN_ACTOR);
  (db.adminInvite.findUnique as jest.Mock).mockResolvedValue(null);
  (db.adminInvite.upsert as jest.Mock).mockResolvedValue({
    id: "invite-1",
    email: "returning@scalingup.com",
  });
});

const body = { email: "returning@scalingup.com", name: "Returning Admin" };

describe("POST /api/admin/invite — soft-deleted tombstone allowance", () => {
  it("still rejects a LIVE ADMIN user (400, existing message)", async () => {
    (db.user.findUnique as jest.Mock).mockResolvedValue(makeExisting());

    const res = await POST(req(body));
    const json = await res.json();

    expect(res.status).toBe(400);
    expect(json.error).toMatch(/already has admin access/i);
    expect(db.adminInvite.upsert).not.toHaveBeenCalled();
  });

  it("still rejects a LIVE non-admin user (400, existing message)", async () => {
    (db.user.findUnique as jest.Mock).mockResolvedValue(
      makeExisting({ role: "COACH" })
    );

    const res = await POST(req(body));
    const json = await res.json();

    expect(res.status).toBe(400);
    expect(json.error).toMatch(/already exists/i);
    expect(db.adminInvite.upsert).not.toHaveBeenCalled();
  });

  it("still rejects a soft-deleted COACH-role tombstone — never silently convert a coach to ADMIN", async () => {
    (db.user.findUnique as jest.Mock).mockResolvedValue(
      makeExisting({ role: "COACH", deletedAt: new Date("2026-06-01") })
    );

    const res = await POST(req(body));

    expect(res.status).toBe(400);
    expect(db.adminInvite.upsert).not.toHaveBeenCalled();
  });

  it("allows re-inviting a soft-deleted ADMIN tombstone (invite created + email sent)", async () => {
    (db.user.findUnique as jest.Mock).mockResolvedValue(
      makeExisting({ deletedAt: new Date("2026-06-01") })
    );

    const res = await POST(req(body));
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.success).toBe(true);
    expect(db.adminInvite.upsert).toHaveBeenCalledTimes(1);
    expect(sendAdminInviteEmail).toHaveBeenCalledTimes(1);
  });

  it("allows re-inviting a soft-deleted STAFF tombstone", async () => {
    (db.user.findUnique as jest.Mock).mockResolvedValue(
      makeExisting({ role: "STAFF", deletedAt: new Date("2026-06-01") })
    );

    const res = await POST(req(body));

    expect(res.status).toBe(200);
    expect(db.adminInvite.upsert).toHaveBeenCalledTimes(1);
  });

  it("regression: a brand-new email (no user row) is still invitable", async () => {
    (db.user.findUnique as jest.Mock).mockResolvedValue(null);

    const res = await POST(req(body));

    expect(res.status).toBe(200);
    expect(db.adminInvite.upsert).toHaveBeenCalledTimes(1);
  });
});
