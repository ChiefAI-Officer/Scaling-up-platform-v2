import {
  resolvePublicAttribution,
  type AttributionDb,
} from "@/lib/assessments/public-attribution";

function makeDb(
  rows: Array<{
    coachId: string;
    email: string;
    firstName: string;
    lastName: string;
    source: "REFERRAL_KEY" | "LEGACY_EMAIL";
  }>,
): AttributionDb & { query: jest.Mock } {
  const query = jest.fn().mockResolvedValue(rows);
  return { $queryRaw: query, query };
}

describe("resolvePublicAttribution", () => {
  const now = new Date("2026-07-30T03:00:00.000Z");

  it("returns a transactionally validated referral-key owner", async () => {
    const db = makeDb([
      {
        coachId: "coach-1",
        email: "Coach@Example.com",
        firstName: "Casey",
        lastName: "Coach",
        source: "REFERRAL_KEY",
      },
    ]);

    await expect(
      resolvePublicAttribution(db, { referralKey: "opaque", legacyEmail: null }, now),
    ).resolves.toEqual({
      coachId: "coach-1",
      emailSnapshot: "coach@example.com",
      firstName: "Casey",
      lastName: "Coach",
      source: "REFERRAL_KEY",
    });
  });

  it("normalizes a legacy email before the locked identity lookup", async () => {
    const db = makeDb([
      {
        coachId: "coach-1",
        email: "coach@example.com",
        firstName: "Casey",
        lastName: "Coach",
        source: "LEGACY_EMAIL",
      },
    ]);

    await resolvePublicAttribution(
      db,
      { referralKey: null, legacyEmail: "  COACH@EXAMPLE.COM  " },
      now,
    );

    expect(db.query.mock.calls[0][0].values).toContain("coach@example.com");
  });

  it("returns null for unknown, revoked, deleted, inactive, or expired references", async () => {
    const db = makeDb([]);
    await expect(
      resolvePublicAttribution(db, { referralKey: "invalid", legacyEmail: null }, now),
    ).resolves.toBeNull();
  });

  it("does not query when neither reference is present", async () => {
    const db = makeDb([]);
    await expect(
      resolvePublicAttribution(db, { referralKey: null, legacyEmail: null }, now),
    ).resolves.toBeNull();
    expect(db.query).not.toHaveBeenCalled();
  });

  it("prefers the opaque key when both legacy and new clients submit references", async () => {
    const db = makeDb([]);
    await resolvePublicAttribution(
      db,
      { referralKey: "opaque", legacyEmail: "coach@example.com" },
      now,
    );
    expect(db.query.mock.calls[0][0].values).toContain("opaque");
    expect(db.query.mock.calls[0][0].values).not.toContain("coach@example.com");
  });
});
