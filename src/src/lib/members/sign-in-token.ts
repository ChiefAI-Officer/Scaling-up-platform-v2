/**
 * Address-scoped, single-use member sign-in tokens.
 *
 * Do not reuse AssessmentSubmission.resultsToken*: those vestigial v7.5
 * columns have no application implementation and are submission-scoped.
 */
import { generateRawToken, hashToken } from "@/lib/assessments/invitation-tokens";
import { normalizeMemberEmail } from "@/lib/members/identity";

export const SELF_TOKEN_TTL_MS = 60 * 60 * 1000;
export const COACH_TOKEN_TTL_MS = 24 * 60 * 60 * 1000;

export type MemberTokenIssuer = "SELF" | "COACH";

type TokenDb = {
  memberSignInToken: {
    create(args: { data: Record<string, unknown> }): Promise<unknown>;
    findUnique(args: {
      where: { tokenHash: string };
      select: { normalizedEmail: true };
    }): Promise<{ normalizedEmail: string } | null>;
    updateMany(args: {
      where: {
        tokenHash: string;
        redeemedAt: null;
        expiresAt: { gt: Date };
      };
      data: { redeemedAt: Date };
    }): Promise<{ count: number }>;
  };
};

export async function issueMemberSignInToken(
  db: Pick<TokenDb, "memberSignInToken">,
  input: {
    normalizedEmail: string;
    issuedVia: MemberTokenIssuer;
    issuedByUserId?: string | null;
    campaignId?: string | null;
    now?: Date;
  },
): Promise<{ rawToken: string; expiresAt: Date }> {
  const now = input.now ?? new Date();
  const ttl = input.issuedVia === "COACH" ? COACH_TOKEN_TTL_MS : SELF_TOKEN_TTL_MS;
  const expiresAt = new Date(now.getTime() + ttl);
  const rawToken = generateRawToken();

  await db.memberSignInToken.create({
    data: {
      tokenHash: hashToken(rawToken),
      normalizedEmail: normalizeMemberEmail(input.normalizedEmail),
      issuedAt: now,
      expiresAt,
      issuedVia: input.issuedVia,
      issuedByUserId: input.issuedByUserId ?? null,
      campaignId: input.campaignId ?? null,
    },
  });

  return { rawToken, expiresAt };
}

export async function redeemMemberSignInToken(
  db: Pick<TokenDb, "memberSignInToken">,
  rawToken: string,
  isEligible: (normalizedEmail: string) => Promise<boolean>,
  now: Date = new Date(),
): Promise<{ normalizedEmail: string; redeemedAt: Date } | null> {
  const tokenHash = hashToken(rawToken);
  const token = await db.memberSignInToken.findUnique({
    where: { tokenHash },
    select: { normalizedEmail: true },
  });
  if (!token || !(await isEligible(token.normalizedEmail))) return null;

  const claimed = await db.memberSignInToken.updateMany({
    where: { tokenHash, redeemedAt: null, expiresAt: { gt: now } },
    data: { redeemedAt: now },
  });
  if (claimed.count !== 1) return null;

  return { normalizedEmail: token.normalizedEmail, redeemedAt: now };
}
