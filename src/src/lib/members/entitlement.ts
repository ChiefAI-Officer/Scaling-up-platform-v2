import { isCEOFamily } from "@/lib/assessments/respondent-levels";
import type { MemberRow } from "@/lib/members/identity";

/** Deliberately empty: unknown stored levels must fail closed to own-only. */
export const LEVEL_ALIASES: Readonly<Record<string, string>> = Object.freeze({});

export type ScopedRespondent = MemberRow & {
  deletedAt: Date | null;
  organizationDeletedAt: Date | null;
};

export type TeamNode = {
  teamId: string;
  organizationId: string;
  parentTeamId: string | null;
  deletedAt: Date | null;
};

export type EntitlementReader = {
  respondentsForOrganization(organizationId: string): Promise<ScopedRespondent[]>;
  teamsForOrganization(organizationId: string): Promise<TeamNode[]>;
};

export function normalizeLevel(level: string | null): string | null {
  if (level === null) return null;
  return LEVEL_ALIASES[level] ?? level;
}

function isLive(row: ScopedRespondent): boolean {
  return row.deletedAt === null && row.organizationDeletedAt === null;
}

function descendantTeamIds(rootTeamId: string, teams: TeamNode[]): Set<string> {
  const included = new Set([rootTeamId]);
  let changed = true;
  while (changed) {
    changed = false;
    for (const team of teams) {
      if (
        team.deletedAt === null &&
        team.parentTeamId !== null &&
        included.has(team.parentTeamId) &&
        !included.has(team.teamId)
      ) {
        included.add(team.teamId);
        changed = true;
      }
    }
  }
  return included;
}

export async function scopeFor(row: MemberRow, reader: EntitlementReader): Promise<Set<string>> {
  const scope = new Set([row.respondentId]);
  const level = normalizeLevel(row.roleType);

  if (isCEOFamily(level)) {
    const respondents = await reader.respondentsForOrganization(row.organizationId);
    for (const respondent of respondents) {
      if (isLive(respondent)) scope.add(respondent.respondentId);
    }
    return scope;
  }

  if (level !== "teamleader" || row.teamId === null) return scope;

  const [respondents, teams] = await Promise.all([
    reader.respondentsForOrganization(row.organizationId),
    reader.teamsForOrganization(row.organizationId),
  ]);
  const teamIds = descendantTeamIds(row.teamId, teams);
  for (const respondent of respondents) {
    if (
      isLive(respondent) &&
      respondent.teamId !== null &&
      teamIds.has(respondent.teamId) &&
      !isCEOFamily(normalizeLevel(respondent.roleType))
    ) {
      scope.add(respondent.respondentId);
    }
  }
  return scope;
}

export async function entitlementFor(
  members: MemberRow[],
  reader: EntitlementReader,
): Promise<Set<string>> {
  const scopes = await Promise.all(members.map((member) => scopeFor(member, reader)));
  return new Set(scopes.flatMap((scope) => [...scope]));
}
