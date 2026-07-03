/**
 * Wave Q (#7, ADR-0018) — canAccessWorkshop liveness (adversarial-review
 * catch). The ADMIN branch bypassed deletedAt: a removed HYBRID admin
 * (coach profile + live 30-day JWT) could clone / request-edit ANY workshop
 * via the two mutation routes that gate on canAccessWorkshop. Enforcement is
 * UNCONDITIONAL — no Wave Q flag env is set in these tests.
 */

jest.mock("next-auth/next", () => ({
  getServerSession: jest.fn(),
}));

jest.mock("@/lib/auth/auth", () => ({
  authOptions: {},
}));

jest.mock("@/lib/db", () => ({
  db: {
    user: { findUnique: jest.fn() },
    coach: { findUnique: jest.fn() },
    workshop: { findFirst: jest.fn() },
  },
}));

import { getServerSession } from "next-auth/next";
import { canAccessWorkshop } from "@/lib/auth/authorization";
import { db } from "@/lib/db";

const SESSION = { user: { email: "admin@example.com" } };

describe("canAccessWorkshop — deletedAt liveness", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (getServerSession as jest.Mock).mockResolvedValue(SESSION);
  });

  it("live ADMIN passes (regression)", async () => {
    (db.user.findUnique as jest.Mock).mockResolvedValue({
      id: "u1",
      email: "admin@example.com",
      role: "ADMIN",
      deletedAt: null,
    });
    await expect(canAccessWorkshop("ws-1")).resolves.toBe(true);
  });

  it("soft-removed ADMIN is refused, even with a valid session", async () => {
    (db.user.findUnique as jest.Mock).mockResolvedValue({
      id: "u1",
      email: "admin@example.com",
      role: "ADMIN",
      deletedAt: new Date("2026-07-02T00:00:00Z"),
    });
    await expect(canAccessWorkshop("ws-1")).resolves.toBe(false);
    expect(db.workshop.findFirst).not.toHaveBeenCalled();
  });

  it("soft-removed hybrid never reaches the coach-ownership branch", async () => {
    (db.user.findUnique as jest.Mock).mockResolvedValue({
      id: "u1",
      email: "admin@example.com",
      role: "STAFF",
      deletedAt: new Date("2026-07-02T00:00:00Z"),
    });
    await expect(canAccessWorkshop("ws-1")).resolves.toBe(false);
    expect(db.coach.findUnique).not.toHaveBeenCalled();
    expect(db.workshop.findFirst).not.toHaveBeenCalled();
  });
});
