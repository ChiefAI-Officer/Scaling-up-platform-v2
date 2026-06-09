/**
 * Tests for findActiveCoachByEmail — guard that decides whether a public-quiz
 * lead email may be routed to a referring coach.
 *
 * All tests are pure: db.coach.findUnique is a jest mock, no real DB contact.
 * Written RED-first per TDD.
 */

import { findActiveCoachByEmail } from "@/lib/assessments/quick-assessment-lead";
import type { ActiveCoachDb } from "@/lib/assessments/quick-assessment-lead";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeDb(
  returnValue: {
    id: string;
    email: string;
    firstName: string;
    lastName: string;
    certificationStatus: string;
    certificationExpiry: Date | null;
  } | null = null
): { db: ActiveCoachDb; findUnique: jest.Mock } {
  const findUnique = jest.fn().mockResolvedValue(returnValue);
  const db: ActiveCoachDb = { coach: { findUnique } };
  return { db, findUnique };
}

const ACTIVE_COACH = {
  id: "coach-1",
  email: "coach@example.com",
  firstName: "Alice",
  lastName: "Smith",
  certificationStatus: "ACTIVE",
  certificationExpiry: null,
};

// ---------------------------------------------------------------------------
// Null / blank / whitespace email → no DB call, return null
// ---------------------------------------------------------------------------

describe("findActiveCoachByEmail — null/blank/whitespace email", () => {
  it("returns null and does not call findUnique when email is null", async () => {
    const { db, findUnique } = makeDb(ACTIVE_COACH);
    const result = await findActiveCoachByEmail(db, null);
    expect(result).toBeNull();
    expect(findUnique).not.toHaveBeenCalled();
  });

  it("returns null and does not call findUnique when email is undefined", async () => {
    const { db, findUnique } = makeDb(ACTIVE_COACH);
    const result = await findActiveCoachByEmail(db, undefined);
    expect(result).toBeNull();
    expect(findUnique).not.toHaveBeenCalled();
  });

  it("returns null and does not call findUnique when email is empty string", async () => {
    const { db, findUnique } = makeDb(ACTIVE_COACH);
    const result = await findActiveCoachByEmail(db, "");
    expect(result).toBeNull();
    expect(findUnique).not.toHaveBeenCalled();
  });

  it("returns null and does not call findUnique when email is whitespace-only", async () => {
    const { db, findUnique } = makeDb(ACTIVE_COACH);
    const result = await findActiveCoachByEmail(db, "   ");
    expect(result).toBeNull();
    expect(findUnique).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Email normalization — trimmed + lowercased in the where clause
// ---------------------------------------------------------------------------

describe("findActiveCoachByEmail — email normalization", () => {
  it("trims and lowercases the email before the where lookup", async () => {
    const { db, findUnique } = makeDb(ACTIVE_COACH);
    await findActiveCoachByEmail(db, "  COACH@EXAMPLE.COM  ");
    expect(findUnique).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { email: "coach@example.com" },
      })
    );
  });

  it("passes an already-normalized email through unchanged", async () => {
    const { db, findUnique } = makeDb(ACTIVE_COACH);
    await findActiveCoachByEmail(db, "coach@example.com");
    expect(findUnique).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { email: "coach@example.com" },
      })
    );
  });
});

// ---------------------------------------------------------------------------
// ACTIVE coach + null expiry → returns coach (id/email/firstName/lastName only)
// ---------------------------------------------------------------------------

describe("findActiveCoachByEmail — ACTIVE coach, null expiry", () => {
  it("returns id/email/firstName/lastName when status is ACTIVE and expiry is null", async () => {
    const { db } = makeDb(ACTIVE_COACH);
    const result = await findActiveCoachByEmail(db, "coach@example.com");
    expect(result).toEqual({
      id: "coach-1",
      email: "coach@example.com",
      firstName: "Alice",
      lastName: "Smith",
    });
  });

  it("does not expose certificationStatus or certificationExpiry in the return value", async () => {
    const { db } = makeDb(ACTIVE_COACH);
    const result = await findActiveCoachByEmail(db, "coach@example.com");
    expect(result).not.toHaveProperty("certificationStatus");
    expect(result).not.toHaveProperty("certificationExpiry");
  });
});

// ---------------------------------------------------------------------------
// ACTIVE coach + future expiry → returns coach
// ---------------------------------------------------------------------------

describe("findActiveCoachByEmail — ACTIVE coach, future expiry", () => {
  it("returns the coach when expiry is in the future relative to now", async () => {
    const futureExpiry = new Date("2099-12-31T00:00:00Z");
    const { db } = makeDb({ ...ACTIVE_COACH, certificationExpiry: futureExpiry });
    const now = new Date("2026-06-09T00:00:00Z");
    const result = await findActiveCoachByEmail(db, "coach@example.com", now);
    expect(result).not.toBeNull();
    expect(result?.id).toBe("coach-1");
  });
});

// ---------------------------------------------------------------------------
// ACTIVE coach + past expiry → null
// ---------------------------------------------------------------------------

describe("findActiveCoachByEmail — ACTIVE coach, expired certification", () => {
  it("returns null when expiry is in the past relative to provided now", async () => {
    const pastExpiry = new Date("2020-01-01T00:00:00Z");
    const { db } = makeDb({ ...ACTIVE_COACH, certificationExpiry: pastExpiry });
    const now = new Date("2026-06-09T00:00:00Z");
    const result = await findActiveCoachByEmail(db, "coach@example.com", now);
    expect(result).toBeNull();
  });

  it("returns null when expiry equals now exactly (boundary: not strictly greater)", async () => {
    const boundary = new Date("2026-06-09T12:00:00Z");
    const { db } = makeDb({ ...ACTIVE_COACH, certificationExpiry: boundary });
    const now = new Date("2026-06-09T12:00:00Z");
    const result = await findActiveCoachByEmail(db, "coach@example.com", now);
    expect(result).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Non-ACTIVE status → null
// ---------------------------------------------------------------------------

describe("findActiveCoachByEmail — non-ACTIVE certificationStatus", () => {
  it("returns null when certificationStatus is PENDING", async () => {
    const { db } = makeDb({ ...ACTIVE_COACH, certificationStatus: "PENDING" });
    const result = await findActiveCoachByEmail(db, "coach@example.com");
    expect(result).toBeNull();
  });

  it("returns null when certificationStatus is DEACTIVATED", async () => {
    const { db } = makeDb({ ...ACTIVE_COACH, certificationStatus: "DEACTIVATED" });
    const result = await findActiveCoachByEmail(db, "coach@example.com");
    expect(result).toBeNull();
  });

  it("returns null when certificationStatus is an unknown value", async () => {
    const { db } = makeDb({ ...ACTIVE_COACH, certificationStatus: "DENIED" });
    const result = await findActiveCoachByEmail(db, "coach@example.com");
    expect(result).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// findUnique returns null (unknown email) → null
// ---------------------------------------------------------------------------

describe("findActiveCoachByEmail — unknown email", () => {
  it("returns null when findUnique returns null", async () => {
    const { db, findUnique } = makeDb(null);
    const result = await findActiveCoachByEmail(db, "nobody@example.com");
    expect(result).toBeNull();
    expect(findUnique).toHaveBeenCalledTimes(1);
  });
});
