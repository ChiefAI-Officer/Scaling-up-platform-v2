import type { Prisma, PrismaClient } from "@prisma/client";
import { scopeForAuthorityMode } from "@/lib/members/entitlement";
import {
  createMemberEntitlementReader,
  type MemberEntitlementDb,
} from "@/lib/members/entitlement-reader";
import {
  MemberLedTeamWriteError,
  replaceMemberLedTeamsInTransaction,
  type MemberLedTeamSource,
  type MemberLedTeamsTx,
} from "@/lib/members/led-teams";

export type CoachLedTeamAssignment = {
  teamId: string;
  teamName: string;
  source: MemberLedTeamSource;
  createdBy: string;
  createdAt: Date;
};

export type CoachMemberLedTeams = {
  respondentId: string;
  organizationId: string;
  assignments: CoachLedTeamAssignment[];
  scopeSize: number;
};

type CoachLedTeamsDb = PrismaClient | Prisma.TransactionClient;

async function readWithinClient(
  db: CoachLedTeamsDb,
  input: { organizationId: string; respondentId: string },
): Promise<CoachMemberLedTeams> {
  const respondent = await db.orgRespondent.findFirst({
    where: {
      id: input.respondentId,
      organizationId: input.organizationId,
      deletedAt: null,
      organization: { deletedAt: null },
    },
    select: {
      id: true,
      organizationId: true,
      teamId: true,
      roleType: true,
      ledTeams: {
        where: { team: { deletedAt: null } },
        orderBy: { team: { name: "asc" } },
        select: {
          teamId: true,
          source: true,
          createdBy: true,
          createdAt: true,
          team: { select: { name: true } },
        },
      },
    },
  });
  if (!respondent) throw new MemberLedTeamWriteError("respondent-not-found");

  const scope = await scopeForAuthorityMode(
    {
      respondentId: respondent.id,
      organizationId: respondent.organizationId,
      teamId: respondent.teamId,
      roleType: respondent.roleType,
    },
    createMemberEntitlementReader(db as unknown as MemberEntitlementDb),
    "led-teams",
  );

  return {
    respondentId: respondent.id,
    organizationId: respondent.organizationId,
    assignments: respondent.ledTeams.map((edge) => ({
      teamId: edge.teamId,
      teamName: edge.team.name,
      source: edge.source as MemberLedTeamSource,
      createdBy: edge.createdBy,
      createdAt: edge.createdAt,
    })),
    scopeSize: scope.size,
  };
}

export function readCoachMemberLedTeams(
  db: PrismaClient,
  input: { organizationId: string; respondentId: string },
): Promise<CoachMemberLedTeams> {
  return readWithinClient(db, input);
}

export type SaveCoachMemberLedTeamsInput = {
  organizationId: string;
  respondentId: string;
  teamIds: string[];
  confirmTeamIds?: string[];
  actorId: string;
  performedBy: string;
};

export async function saveCoachMemberLedTeamsInTransaction(
  tx: Prisma.TransactionClient,
  input: SaveCoachMemberLedTeamsInput,
): Promise<CoachMemberLedTeams> {
  const replacement = await replaceMemberLedTeamsInTransaction(
    tx as unknown as MemberLedTeamsTx,
    {
      respondentId: input.respondentId,
      teamIds: input.teamIds,
      createdBy: input.actorId,
      source: "coach",
      preserveExistingSources: true,
      confirmTeamIds: input.confirmTeamIds,
    },
  );
  if (replacement.organizationId !== input.organizationId) {
    throw new MemberLedTeamWriteError("respondent-not-found");
  }

  const result = await readWithinClient(tx, input);
  const before = new Map(replacement.previousAssignments.map((edge) => [edge.teamId, edge]));
  const after = new Map(result.assignments.map((edge) => [edge.teamId, edge]));
  const teamIds = new Set([...before.keys(), ...after.keys()]);

  for (const teamId of teamIds) {
    const oldEdge = before.get(teamId);
    const newEdge = after.get(teamId);
    const direction = !oldEdge
      ? "GRANT"
      : !newEdge
        ? "REVOKE"
        : oldEdge.source !== newEdge.source || oldEdge.createdBy !== newEdge.createdBy
          ? "CONFIRM"
          : null;
    if (!direction) continue;

    await tx.auditLog.create({
      data: {
        entityType: "OrgRespondentLedTeam",
        entityId: `${input.respondentId}:${teamId}`,
        action: direction === "GRANT" ? "CREATE" : direction === "REVOKE" ? "DELETE" : "UPDATE",
        performedBy: input.performedBy,
        changes: JSON.stringify({
          organizationId: input.organizationId,
          respondentId: input.respondentId,
          teamId,
          teamName: newEdge?.teamName ?? oldEdge?.teamName ?? teamId,
          direction,
          sourceBefore: oldEdge?.source ?? null,
          sourceAfter: newEdge?.source ?? null,
          resultingScopeSize: result.scopeSize,
        }),
      },
    });
  }

  return result;
}

export function saveCoachMemberLedTeams(
  db: PrismaClient,
  input: SaveCoachMemberLedTeamsInput,
): Promise<CoachMemberLedTeams> {
  return db.$transaction((tx) => saveCoachMemberLedTeamsInTransaction(tx, input));
}
