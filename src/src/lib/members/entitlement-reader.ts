import type {
  EntitlementReader,
  ScopedRespondent,
  TeamNode,
} from "@/lib/members/entitlement";

export type MemberEntitlementDb = {
  orgRespondent: {
    findMany(args: {
      where: Record<string, unknown>;
      select: Record<string, unknown>;
    }): Promise<Array<{
      id: string;
      organizationId: string;
      teamId: string | null;
      roleType: string | null;
      deletedAt?: Date | null;
      organization?: { deletedAt: Date | null };
    }>>;
  };
  orgTeam: {
    findMany(args: {
      where: Record<string, unknown>;
      select: Record<string, unknown>;
    }): Promise<Array<{
      id: string;
      organizationId: string;
      parentTeamId: string | null;
      deletedAt: Date | null;
    }>>;
  };
};

/** Prisma-backed reader for the pure hierarchy entitlement rules. */
export function createMemberEntitlementReader(db: MemberEntitlementDb): EntitlementReader {
  return {
    async respondentsForOrganization(organizationId): Promise<ScopedRespondent[]> {
      const rows = await db.orgRespondent.findMany({
        where: { organizationId, deletedAt: null, organization: { deletedAt: null } },
        select: {
          id: true,
          organizationId: true,
          teamId: true,
          roleType: true,
          deletedAt: true,
          organization: { select: { deletedAt: true } },
        },
      });
      return rows.map((row) => ({
        respondentId: row.id,
        organizationId: row.organizationId,
        teamId: row.teamId,
        roleType: row.roleType,
        deletedAt: row.deletedAt ?? null,
        organizationDeletedAt: row.organization?.deletedAt ?? null,
      }));
    },
    async teamsForOrganization(organizationId): Promise<TeamNode[]> {
      const rows = await db.orgTeam.findMany({
        where: { organizationId, deletedAt: null },
        select: {
          id: true,
          organizationId: true,
          parentTeamId: true,
          deletedAt: true,
        },
      });
      return rows.map((row) => ({
        teamId: row.id,
        organizationId: row.organizationId,
        parentTeamId: row.parentTeamId,
        deletedAt: row.deletedAt,
      }));
    },
  };
}
