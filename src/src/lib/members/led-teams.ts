import { normalizeLevel } from "@/lib/members/entitlement";

export type MemberLedTeamSource = "coach" | "csv" | "esperto" | "backfill-0040";

export type MemberLedTeamWriteErrorCode =
  | "respondent-not-found"
  | "level-cannot-lead"
  | "team-not-found"
  | "cross-organization-team";

export class MemberLedTeamWriteError extends Error {
  constructor(public readonly code: MemberLedTeamWriteErrorCode) {
    super(code);
    this.name = "MemberLedTeamWriteError";
  }
}

export type MemberLedTeamsTx = {
  $queryRawUnsafe<T = unknown>(query: string, ...values: unknown[]): Promise<T>;
  orgRespondent: {
    findFirst(args: {
      where: Record<string, unknown>;
      select: Record<string, boolean>;
    }): Promise<{
      id: string;
      organizationId: string;
      roleType: string | null;
    } | null>;
  };
  orgTeam: {
    findMany(args: {
      where: Record<string, unknown>;
      select: Record<string, boolean>;
    }): Promise<Array<{ id: string; organizationId: string }>>;
  };
  orgRespondentLedTeam: {
    deleteMany(args: { where: { respondentId: string } }): Promise<{ count: number }>;
    createMany(args: {
      data: Array<{
        respondentId: string;
        teamId: string;
        organizationId: string;
        createdBy: string;
        source: MemberLedTeamSource;
      }>;
    }): Promise<{ count: number }>;
  };
};

export type MemberLedTeamsDb = {
  $transaction<T>(run: (tx: MemberLedTeamsTx) => Promise<T>): Promise<T>;
};

export type ReplaceMemberLedTeamsInput = {
  respondentId: string;
  teamIds: string[];
  createdBy: string;
  source: MemberLedTeamSource;
};

/** Replace one organization membership's delegated report-authority roots. */
export function replaceMemberLedTeams(
  db: MemberLedTeamsDb,
  input: ReplaceMemberLedTeamsInput,
): Promise<{ respondentId: string; organizationId: string; teamIds: string[] }> {
  return db.$transaction(async (tx) => {
    // Serialize all authority replacements for this membership. Without this
    // lock, concurrent delete-then-insert transactions can commit a union of
    // both callers' team sets and unintentionally broaden report access.
    await tx.$queryRawUnsafe<Array<{ id: string }>>(
      'SELECT "id" FROM "org_respondents" WHERE "id" = $1 FOR UPDATE',
      input.respondentId,
    );

    const respondent = await tx.orgRespondent.findFirst({
      where: {
        id: input.respondentId,
        deletedAt: null,
        organization: { deletedAt: null },
      },
      select: { id: true, organizationId: true, roleType: true },
    });
    if (respondent === null) {
      throw new MemberLedTeamWriteError("respondent-not-found");
    }

    const teamIds = [...new Set(input.teamIds)];
    if (teamIds.length > 0 && normalizeLevel(respondent.roleType) !== "teamleader") {
      throw new MemberLedTeamWriteError("level-cannot-lead");
    }

    const teams =
      teamIds.length === 0
        ? []
        : await tx.orgTeam.findMany({
            where: { id: { in: teamIds }, deletedAt: null },
            select: { id: true, organizationId: true },
          });
    const teamsById = new Map(teams.map((team) => [team.id, team]));
    for (const teamId of teamIds) {
      const team = teamsById.get(teamId);
      if (!team) throw new MemberLedTeamWriteError("team-not-found");
      if (team.organizationId !== respondent.organizationId) {
        throw new MemberLedTeamWriteError("cross-organization-team");
      }
    }

    await tx.orgRespondentLedTeam.deleteMany({
      where: { respondentId: respondent.id },
    });
    if (teamIds.length > 0) {
      await tx.orgRespondentLedTeam.createMany({
        data: teamIds.map((teamId) => ({
          respondentId: respondent.id,
          teamId,
          organizationId: respondent.organizationId,
          createdBy: input.createdBy,
          source: input.source,
        })),
      });
    }

    return {
      respondentId: respondent.id,
      organizationId: respondent.organizationId,
      teamIds,
    };
  });
}
