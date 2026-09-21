export type MemberRow = {
  respondentId: string;
  organizationId: string;
  teamId: string | null;
  roleType: string | null;
};

type IdentityRow = {
  id: string;
  organizationId: string;
  teamId: string | null;
  roleType: string | null;
};

type MemberIdentityDb = {
  orgRespondent: {
    findMany(args: {
      where: Record<string, unknown>;
      select: Record<string, boolean>;
    }): Promise<IdentityRow[]>;
  };
};

export function normalizeMemberEmail(email: string): string {
  return email.trim().toLowerCase();
}

/** Resolve an email address to every live roster identity carrying it. */
export async function resolveMemberIdentity(
  db: MemberIdentityDb,
  email: string,
): Promise<{ normalizedEmail: string; members: MemberRow[] }> {
  const normalizedEmail = normalizeMemberEmail(email);
  const rows = await db.orgRespondent.findMany({
    where: {
      deletedAt: null,
      organization: { deletedAt: null },
      OR: [
        { normalizedEmail },
        {
          normalizedEmail: null,
          email: { equals: normalizedEmail, mode: "insensitive" },
        },
      ],
    },
    select: {
      id: true,
      organizationId: true,
      teamId: true,
      roleType: true,
    },
  });

  return {
    normalizedEmail,
    members: rows.map((row) => ({
      respondentId: row.id,
      organizationId: row.organizationId,
      teamId: row.teamId,
      roleType: row.roleType,
    })),
  };
}
