import { hashToken } from "@/lib/assessments/invitation-tokens";
import {
  COACH_TOKEN_TTL_MS,
  issueMemberSignInToken,
  redeemMemberSignInToken,
  SELF_TOKEN_TTL_MS,
} from "@/lib/members/sign-in-token";

const NOW = new Date("2026-09-21T12:00:00.000Z");

function tokenDb() {
  return {
    memberSignInToken: {
      create: jest.fn(async ({ data }) => ({ ...data, id: "token-row" })),
      findUnique: jest.fn(),
      updateMany: jest.fn(),
    },
  };
}

describe("member sign-in token", () => {
  it.each([
    ["SELF" as const, SELF_TOKEN_TTL_MS],
    ["COACH" as const, COACH_TOKEN_TTL_MS],
  ])("stores the %s expiry as the source of truth", async (issuedVia, ttl) => {
    const db = tokenDb();
    const issued = await issueMemberSignInToken(db, {
      normalizedEmail: "person@example.com",
      issuedVia,
      now: NOW,
    });

    expect(issued.expiresAt).toEqual(new Date(NOW.getTime() + ttl));
    expect(db.memberSignInToken.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ issuedVia, expiresAt: issued.expiresAt }),
    });
  });

  it("persists only the hash and never the raw token", async () => {
    const db = tokenDb();
    const issued = await issueMemberSignInToken(db, {
      normalizedEmail: "person@example.com",
      issuedVia: "SELF",
      now: NOW,
    });
    const data = db.memberSignInToken.create.mock.calls[0][0].data;
    expect(data.tokenHash).toBe(hashToken(issued.rawToken));
    expect(JSON.stringify(data)).not.toContain(issued.rawToken);
  });

  it("atomically redeems once and only once", async () => {
    const db = tokenDb();
    db.memberSignInToken.findUnique.mockResolvedValue({ normalizedEmail: "person@example.com" });
    db.memberSignInToken.updateMany.mockResolvedValueOnce({ count: 1 }).mockResolvedValueOnce({ count: 0 });
    const isEligible = jest.fn().mockResolvedValue(true);

    await expect(redeemMemberSignInToken(db, "raw", isEligible, NOW)).resolves.toEqual({
      normalizedEmail: "person@example.com",
      redeemedAt: NOW,
    });
    await expect(redeemMemberSignInToken(db, "raw", isEligible, NOW)).resolves.toBeNull();
    expect(db.memberSignInToken.updateMany).toHaveBeenCalledWith({
      where: { tokenHash: hashToken("raw"), redeemedAt: null, expiresAt: { gt: NOW } },
      data: { redeemedAt: NOW },
    });
  });

  it("allows exactly one winner across concurrent redemption attempts", async () => {
    const db = tokenDb();
    db.memberSignInToken.findUnique.mockResolvedValue({ normalizedEmail: "person@example.com" });
    let available = true;
    db.memberSignInToken.updateMany.mockImplementation(async () => {
      if (!available) return { count: 0 };
      available = false;
      return { count: 1 };
    });
    const results = await Promise.all([
      redeemMemberSignInToken(db, "raw", async () => true, NOW),
      redeemMemberSignInToken(db, "raw", async () => true, NOW),
    ]);
    expect(results.filter(Boolean)).toHaveLength(1);
  });

  it("refuses missing tokens and addresses with no live roster row before redemption", async () => {
    const db = tokenDb();
    db.memberSignInToken.findUnique.mockResolvedValueOnce(null).mockResolvedValueOnce({
      normalizedEmail: "removed@example.com",
    });
    await expect(redeemMemberSignInToken(db, "missing", async () => true, NOW)).resolves.toBeNull();
    await expect(redeemMemberSignInToken(db, "removed", async () => false, NOW)).resolves.toBeNull();
    expect(db.memberSignInToken.updateMany).not.toHaveBeenCalled();
  });

  it("fails an expired token through the guarded atomic update", async () => {
    const db = tokenDb();
    db.memberSignInToken.findUnique.mockResolvedValue({ normalizedEmail: "person@example.com" });
    db.memberSignInToken.updateMany.mockResolvedValue({ count: 0 });
    await expect(redeemMemberSignInToken(db, "expired", async () => true, NOW)).resolves.toBeNull();
  });
});
