/**
 * Wave Q (#7, ADR-0018) — API liveness: getUserForApiRoute()/getApiActor()
 * return null for soft-removed users, cutting off every getApiActor-gated
 * API route within one request.
 *
 * UNCONDITIONAL enforcement: tests run with the WAVE_Q flag env vars DELETED.
 */

jest.mock("next-auth/next", () => ({
  getServerSession: jest.fn(),
}));

jest.mock("@/lib/auth/auth", () => ({
  authOptions: {},
}));

jest.mock("next/navigation", () => ({
  redirect: jest.fn(),
}));

jest.mock("@/lib/db", () => ({
  db: {
    user: { findUnique: jest.fn() },
    coach: { findUnique: jest.fn() },
  },
}));

import { getServerSession } from "next-auth/next";
import { db } from "@/lib/db";
import { getApiActor, getUserForApiRoute } from "@/lib/auth/authorization";

const SESSION = { user: { email: "admin@example.com" } };

function makeUser(overrides: Record<string, unknown> = {}) {
  return {
    id: "user-1",
    email: "admin@example.com",
    name: "Some Admin",
    role: "ADMIN",
    deletedAt: null,
    coachProfile: null,
    ...overrides,
  };
}

describe("getUserForApiRoute / getApiActor — liveness check on deletedAt", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    delete process.env.WAVE_Q_ADMIN_CONTROLS_ENABLED;
    delete process.env.WAVE_Q_ADMIN_CONTROLS_KILL;
    (getServerSession as jest.Mock).mockResolvedValue(SESSION);
  });

  it("returns the user + actor for a live user (regression)", async () => {
    (db.user.findUnique as jest.Mock).mockResolvedValue(makeUser());

    expect(await getUserForApiRoute()).toMatchObject({ id: "user-1" });

    const actor = await getApiActor();
    expect(actor).toEqual({
      userId: "user-1",
      email: "admin@example.com",
      role: "ADMIN",
      coachId: null,
    });
  });

  it("returns null from getUserForApiRoute when deletedAt is set (flag OFF — unconditional)", async () => {
    (db.user.findUnique as jest.Mock).mockResolvedValue(
      makeUser({ deletedAt: new Date("2026-07-01") })
    );

    expect(await getUserForApiRoute()).toBeNull();
  });

  it("returns null from getApiActor when deletedAt is set — every getApiActor route 401s", async () => {
    (db.user.findUnique as jest.Mock).mockResolvedValue(
      makeUser({ deletedAt: new Date("2026-07-01") })
    );

    expect(await getApiActor()).toBeNull();
  });

  it("returns null with no session (regression)", async () => {
    (getServerSession as jest.Mock).mockResolvedValue(null);

    expect(await getUserForApiRoute()).toBeNull();
    expect(await getApiActor()).toBeNull();
  });

  it("still resolves coachId for a live hybrid user (regression)", async () => {
    (db.user.findUnique as jest.Mock).mockResolvedValue(
      makeUser({ coachProfile: { id: "coach-9" } })
    );

    const actor = await getApiActor();
    expect(actor?.coachId).toBe("coach-9");
  });
});
