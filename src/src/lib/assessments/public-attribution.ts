import { Prisma } from "@prisma/client";
import { normalizeMailbox } from "@/lib/assessments/quick-assessment-lead";

export interface AttributionDb {
  $queryRaw<T>(query: Prisma.Sql): Promise<T>;
}

export interface PublicAttribution {
  coachId: string;
  emailSnapshot: string;
  firstName: string;
  lastName: string;
  source: "REFERRAL_KEY" | "LEGACY_EMAIL";
}

interface AttributionRow {
  coachId: string;
  email: string;
  firstName: string;
  lastName: string;
  source: "REFERRAL_KEY" | "LEGACY_EMAIL";
}

/**
 * Resolve and lock the attribution evidence and Coach eligibility inside the
 * submission transaction. Missing/invalid rows deliberately collapse to null.
 */
export async function resolvePublicAttribution(
  tx: AttributionDb,
  input: {
    referralKey: string | null | undefined;
    legacyEmail: string | null | undefined;
  },
  now = new Date(),
): Promise<PublicAttribution | null> {
  const referralKey = input.referralKey?.trim() ?? "";
  let rows: AttributionRow[];

  if (referralKey) {
    rows = await tx.$queryRaw<AttributionRow[]>(Prisma.sql`
      SELECT
        coach."id" AS "coachId",
        coach."email",
        coach."firstName",
        coach."lastName",
        'REFERRAL_KEY'::text AS "source"
      FROM "coach_referral_keys" AS referral
      INNER JOIN "coaches" AS coach ON coach."id" = referral."coachId"
      WHERE referral."key" = ${referralKey}
        AND referral."revokedAt" IS NULL
        AND coach."deletedAt" IS NULL
        AND coach."certificationStatus" = 'ACTIVE'
        AND (
          coach."certificationExpiry" IS NULL
          OR coach."certificationExpiry" > ${now}
        )
      LIMIT 1
      FOR SHARE OF referral, coach
    `);
  } else {
    const normalizedEmail = normalizeMailbox(input.legacyEmail);
    if (!normalizedEmail) return null;

    rows = await tx.$queryRaw<AttributionRow[]>(Prisma.sql`
      SELECT
        coach."id" AS "coachId",
        coach."email",
        coach."firstName",
        coach."lastName",
        'LEGACY_EMAIL'::text AS "source"
      FROM "coach_email_identities" AS identity
      INNER JOIN "coaches" AS coach ON coach."id" = identity."coachId"
      WHERE identity."normalizedEmail" = ${normalizedEmail}
        AND identity."revokedAt" IS NULL
        AND coach."deletedAt" IS NULL
        AND coach."certificationStatus" = 'ACTIVE'
        AND (
          coach."certificationExpiry" IS NULL
          OR coach."certificationExpiry" > ${now}
        )
      LIMIT 1
      FOR SHARE OF identity, coach
    `);
  }

  const row = rows[0];
  if (!row) return null;
  return {
    coachId: row.coachId,
    emailSnapshot: normalizeMailbox(row.email),
    firstName: row.firstName,
    lastName: row.lastName,
    source: row.source,
  };
}
