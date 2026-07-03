/**
 * Wave Q (#7, ADR-0018) — authorize() rejects soft-removed users.
 *
 * UNCONDITIONAL enforcement: every test here runs with the WAVE_Q flag env
 * vars DELETED to prove the login block is never flag-gated. A kill switch
 * must not un-fire an offboarding.
 */

jest.mock("@/lib/db", () => ({
  db: {
    user: { findUnique: jest.fn() },
    adminInvite: { findUnique: jest.fn() },
  },
}));

jest.mock("@/lib/auth/auth-posture", () => ({
  enforceProductionSafeAuthPosture: jest.fn(() => ({
    effectiveDemoMode: false,
    deploymentContext: "test",
  })),
}));

jest.mock("bcryptjs", () => ({
  compare: jest.fn().mockResolvedValue(true),
  hash: jest.fn(),
}));

import { authOptions } from "@/lib/auth/auth";
import { db } from "@/lib/db";

type AuthorizeFn = (
  credentials: Record<"email" | "password", string> | undefined
) => Promise<unknown>;

function getAuthorize(): AuthorizeFn {
  const provider = authOptions.providers[0] as unknown as {
    authorize?: AuthorizeFn;
    options?: { authorize?: AuthorizeFn };
  };
  // next-auth v4 keeps the user-supplied config under `options`; the
  // top-level `authorize` is the provider default stub.
  const authorize = provider.options?.authorize ?? provider.authorize;
  if (!authorize) throw new Error("credentials authorize() not found");
  return authorize;
}

const CANONICAL_EMAIL = "canonical-admin@scalingup.com";

function makeUser(overrides: Record<string, unknown> = {}) {
  return {
    id: "user-1",
    email: "admin@example.com",
    name: "Some Admin",
    role: "ADMIN",
    image: null,
    passwordHash: "$2a$12$hash",
    deletedAt: null,
    ...overrides,
  };
}

describe("authorize() — soft-removed (deletedAt) users are rejected for ALL roles", () => {
  const authorize = getAuthorize();
  const credentials = { email: "admin@example.com", password: "Str0ng!Pass" };

  beforeEach(() => {
    jest.clearAllMocks();
    // Prove unconditionality: enforcement must hold with the wave flag OFF.
    delete process.env.WAVE_Q_ADMIN_CONTROLS_ENABLED;
    delete process.env.WAVE_Q_ADMIN_CONTROLS_KILL;
    process.env.ADMIN_EMAIL = CANONICAL_EMAIL;
    // Default: an accepted invite exists, so a rejection is attributable to
    // deletedAt, not the invite guard.
    (db.adminInvite.findUnique as jest.Mock).mockResolvedValue({
      email: "admin@example.com",
      acceptedAt: new Date("2026-01-01"),
    });
  });

  it.each(["ADMIN", "STAFF", "COACH"] as const)(
    "rejects a soft-removed %s with the generic INVALID_CREDENTIALS message",
    async (role) => {
      (db.user.findUnique as jest.Mock).mockResolvedValue(
        makeUser({ role, deletedAt: new Date("2026-07-01") })
      );

      await expect(authorize(credentials)).rejects.toThrow(
        "Invalid email or password"
      );
    }
  );

  it("still allows a LIVE canonical admin (no invite row needed — invite-guard bypass intact)", async () => {
    (db.user.findUnique as jest.Mock).mockResolvedValue(
      makeUser({ email: CANONICAL_EMAIL })
    );
    (db.adminInvite.findUnique as jest.Mock).mockResolvedValue(null);

    const result = await authorize({
      email: CANONICAL_EMAIL,
      password: "Str0ng!Pass",
    });

    expect(result).toMatchObject({ email: CANONICAL_EMAIL, role: "ADMIN" });
  });

  it("rejects even the canonical admin when deletedAt is set (fail closed — canonical bypasses the INVITE guard, never the liveness check)", async () => {
    (db.user.findUnique as jest.Mock).mockResolvedValue(
      makeUser({ email: CANONICAL_EMAIL, deletedAt: new Date("2026-07-01") })
    );
    (db.adminInvite.findUnique as jest.Mock).mockResolvedValue(null);

    await expect(
      authorize({ email: CANONICAL_EMAIL, password: "Str0ng!Pass" })
    ).rejects.toThrow("Invalid email or password");
  });

  it("regression: a live non-canonical ADMIN with an accepted invite still logs in", async () => {
    (db.user.findUnique as jest.Mock).mockResolvedValue(makeUser());

    const result = await authorize(credentials);

    expect(result).toMatchObject({ email: "admin@example.com", role: "ADMIN" });
  });

  it("regression: a live non-canonical ADMIN without an accepted invite is still blocked (invite guard intact)", async () => {
    (db.user.findUnique as jest.Mock).mockResolvedValue(makeUser());
    (db.adminInvite.findUnique as jest.Mock).mockResolvedValue(null);

    await expect(authorize(credentials)).rejects.toThrow(
      "Invalid email or password"
    );
  });

  it("regression: a live COACH still logs in", async () => {
    (db.user.findUnique as jest.Mock).mockResolvedValue(
      makeUser({ role: "COACH", email: "coach@example.com" })
    );

    const result = await authorize({
      email: "coach@example.com",
      password: "Str0ng!Pass",
    });

    expect(result).toMatchObject({ email: "coach@example.com", role: "COACH" });
  });
});
