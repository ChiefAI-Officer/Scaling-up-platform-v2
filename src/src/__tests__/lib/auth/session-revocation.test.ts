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
}));

import { authOptions } from "@/lib/auth/auth";
import { db } from "@/lib/db";

type AuthCallbacks = {
  jwt: (input: Record<string, unknown>) => Promise<Record<string, unknown>>;
  session: (input: Record<string, unknown>) => Promise<Record<string, unknown>>;
};

type Authorize = (
  credentials: Record<"email" | "password", string>,
) => Promise<Record<string, unknown> | null>;

function callbacks(): AuthCallbacks {
  return authOptions.callbacks as unknown as AuthCallbacks;
}

function authorize(): Authorize {
  const provider = authOptions.providers[0] as unknown as {
    authorize?: Authorize;
    options?: { authorize?: Authorize };
  };
  const callback = provider.options?.authorize ?? provider.authorize;
  if (!callback) throw new Error("credentials authorize callback missing");
  return callback;
}

const liveUser = {
  id: "user-1",
  email: "coach@example.com",
  name: "Coach One",
  role: "COACH",
  image: null,
  passwordHash: "$2a$12$hash",
  authVersion: 4,
  deletedAt: null,
};

describe("credential session revocation", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (db.user.findUnique as jest.Mock).mockResolvedValue(liveUser);
  });

  it("copies the live authVersion into a newly authorized user and JWT", async () => {
    const user = await authorize()({
      email: "coach@example.com",
      password: "StrongPass1!",
    });
    expect(user?.authVersion).toBe(4);

    const token = await callbacks().jwt({ token: {}, user });
    expect(token).toMatchObject({
      id: "user-1",
      role: "COACH",
      authVersion: 4,
      sessionRevoked: false,
    });
  });

  it("keeps a matching live token active", async () => {
    const token = await callbacks().jwt({
      token: { id: "user-1", role: "COACH", authVersion: 4 },
    });

    expect(token.sessionRevoked).not.toBe(true);
    expect(db.user.findUnique).toHaveBeenCalledWith({
      where: { id: "user-1" },
      select: { authVersion: true, deletedAt: true },
    });
  });

  it("keeps a legacy versionless token active while the live version is zero", async () => {
    (db.user.findUnique as jest.Mock).mockResolvedValue({
      authVersion: 0,
      deletedAt: null,
    });

    const token = await callbacks().jwt({
      token: { id: "user-1", role: "COACH" },
    });

    expect(token).toMatchObject({ authVersion: 0, sessionRevoked: false });
  });

  it("marks a stale version, deleted user, or missing user as revoked", async () => {
    for (const live of [
      { authVersion: 5, deletedAt: null },
      { authVersion: 4, deletedAt: new Date("2026-08-17") },
      null,
    ]) {
      (db.user.findUnique as jest.Mock).mockResolvedValueOnce(live);
      const token = await callbacks().jwt({
        token: { id: "user-1", role: "COACH", authVersion: 4 },
      });
      expect(token.sessionRevoked).toBe(true);
    }
  });

  it("forwards only the revocation marker to the session", async () => {
    const session = await callbacks().session({
      session: { user: { email: "coach@example.com" } },
      token: {
        id: "user-1",
        role: "COACH",
        authVersion: 4,
        sessionRevoked: true,
      },
    });

    expect(session).toMatchObject({
      user: { id: "user-1", role: "COACH" },
      sessionRevoked: true,
    });
    expect(session).not.toHaveProperty("authVersion");
  });
});
