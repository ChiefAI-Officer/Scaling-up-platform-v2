import { normalizeLevel } from "@/lib/members/entitlement";

export type MemberLedTeamSource = "coach" | "csv" | "esperto" | "backfill-0040";

export type MemberLedTeamWriteErrorCode =
  | "respondent-not-found"
  | "level-cannot-lead"
  | "team-not-found"
  | "cross-organization-team"
  | "confirmation-not-assigned"
  | "confirmation-not-inferred";

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
    }): Promise<Array<{ id: string; organizationId: string; name?: string }>>;
  };
  orgRespondentLedTeam: {
    findMany(args: {
      where: { respondentId: string };
      select: Record<string, unknown>;
      orderBy?: Record<string, string>;
    }): Promise<Array<{
      teamId: string;
      source: string;
      createdBy: string;
      createdAt?: Date;
      team?: { name: string };
    }>>;
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
  /** Keep provenance for retained edges unless the coach explicitly confirms them. */
  preserveExistingSources?: boolean;
  /** Retained inferred edges whose provenance should become coach-authored. */
  confirmTeamIds?: string[];
};

export type MemberLedTeamAssignment = {
  teamId: string;
  teamName: string;
  source: string;
  createdBy: string;
  createdAt?: Date;
};

export type MemberLedTeamsTransactionResult = {
  respondentId: string;
  organizationId: string;
  roleType: string | null;
  teamIds: string[];
  previousAssignments: MemberLedTeamAssignment[];
  assignments: MemberLedTeamAssignment[];
};

/** Transaction-aware core used when member fields and authority must commit together. */
export async function replaceMemberLedTeamsInTransaction(
  tx: MemberLedTeamsTx,
  input: ReplaceMemberLedTeamsInput,
): Promise<MemberLedTeamsTransactionResult> {
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

  const previousRows = await tx.orgRespondentLedTeam.findMany({
    where: { respondentId: respondent.id },
    select: {
      teamId: true,
      source: true,
      createdBy: true,
      createdAt: true,
      team: { select: { name: true } },
    },
    orderBy: { teamId: "asc" },
  });
  const previousAssignments = previousRows.map((row) => ({
    teamId: row.teamId,
    teamName: row.team?.name ?? row.teamId,
    source: row.source,
    createdBy: row.createdBy,
    createdAt: row.createdAt,
  }));
  const previousByTeamId = new Map(previousAssignments.map((row) => [row.teamId, row]));

  const teamIds = [...new Set(input.teamIds)];
  const confirmTeamIds = [...new Set(input.confirmTeamIds ?? [])];
  if (confirmTeamIds.some((teamId) => !teamIds.includes(teamId) || !previousByTeamId.has(teamId))) {
    throw new MemberLedTeamWriteError("confirmation-not-assigned");
  }
  if (confirmTeamIds.some((teamId) => previousByTeamId.get(teamId)?.source !== "backfill-0040")) {
    throw new MemberLedTeamWriteError("confirmation-not-inferred");
  }
  if (teamIds.length > 0 && normalizeLevel(respondent.roleType) !== "teamleader") {
    throw new MemberLedTeamWriteError("level-cannot-lead");
  }

  const teams =
    teamIds.length === 0
      ? []
      : await tx.orgTeam.findMany({
          where: { id: { in: teamIds }, deletedAt: null },
          select: { id: true, organizationId: true, name: true },
        });
  const teamsById = new Map(teams.map((team) => [team.id, team]));
  for (const teamId of teamIds) {
    const team = teamsById.get(teamId);
    if (!team) throw new MemberLedTeamWriteError("team-not-found");
    if (team.organizationId !== respondent.organizationId) {
      throw new MemberLedTeamWriteError("cross-organization-team");
    }
  }

  const confirmations = new Set(confirmTeamIds);
  const rows = teamIds.map((teamId) => {
    const previous = previousByTeamId.get(teamId);
    const preserve = input.preserveExistingSources && previous && !confirmations.has(teamId);
    return {
      respondentId: respondent.id,
      teamId,
      organizationId: respondent.organizationId,
      createdBy: preserve ? previous.createdBy : input.createdBy,
      source: (preserve ? previous.source : input.source) as MemberLedTeamSource,
    };
  });

  await tx.orgRespondentLedTeam.deleteMany({
    where: { respondentId: respondent.id },
  });
  if (rows.length > 0) {
    await tx.orgRespondentLedTeam.createMany({ data: rows });
  }

  return {
    respondentId: respondent.id,
    organizationId: respondent.organizationId,
    roleType: respondent.roleType,
    teamIds,
    previousAssignments,
    assignments: rows.map((row) => ({
      teamId: row.teamId,
      teamName: teamsById.get(row.teamId)?.name ?? row.teamId,
      source: row.source,
      createdBy: row.createdBy,
    })),
  };
}

/** Replace one organization membership's delegated report-authority roots. */
export function replaceMemberLedTeams(
  db: MemberLedTeamsDb,
  input: ReplaceMemberLedTeamsInput,
): Promise<{ respondentId: string; organizationId: string; teamIds: string[] }> {
  return db.$transaction(async (tx) => {
    const result = await replaceMemberLedTeamsInTransaction(tx, input);
    return {
      respondentId: result.respondentId,
      organizationId: result.organizationId,
      teamIds: result.teamIds,
    };
  });
}
