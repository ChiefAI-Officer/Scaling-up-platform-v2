import { isCEOFamily } from "@/lib/assessments/respondent-levels";
import type { MemberRow } from "@/lib/members/identity";
import { isMemberLedTeamsEnabled } from "@/lib/members/flags";

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
  ledTeamIdsForRespondent(
    respondentId: string,
    organizationId: string,
  ): Promise<string[]>;
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

export type MemberTeamAuthorityMode = "membership" | "led-teams";

export async function scopeForAuthorityMode(
  row: MemberRow,
  reader: EntitlementReader,
  authorityMode: MemberTeamAuthorityMode,
): Promise<Set<string>> {
  const scope = new Set([row.respondentId]);
  const level = normalizeLevel(row.roleType);

  if (isCEOFamily(level)) {
    const respondents = await reader.respondentsForOrganization(row.organizationId);
    for (const respondent of respondents) {
      if (isLive(respondent)) scope.add(respondent.respondentId);
    }
    return scope;
  }

  if (level !== "teamleader") return scope;

  const rootTeamIds = authorityMode === "led-teams"
    ? await reader.ledTeamIdsForRespondent(row.respondentId, row.organizationId)
    : row.teamId === null
      ? []
      : [row.teamId];
  if (rootTeamIds.length === 0) return scope;

  const [respondents, teams] = await Promise.all([
    reader.respondentsForOrganization(row.organizationId),
    reader.teamsForOrganization(row.organizationId),
  ]);
  const teamIds = new Set<string>();
  for (const rootTeamId of rootTeamIds) {
    for (const teamId of descendantTeamIds(rootTeamId, teams)) {
      teamIds.add(teamId);
    }
  }
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

export function scopeFor(
  row: MemberRow,
  reader: EntitlementReader,
): Promise<Set<string>> {
  return scopeForAuthorityMode(
    row,
    reader,
    isMemberLedTeamsEnabled() ? "led-teams" : "membership",
  );
}

export async function entitlementFor(
  members: MemberRow[],
  reader: EntitlementReader,
): Promise<Set<string>> {
  const scopes = await Promise.all(members.map((member) => scopeFor(member, reader)));
  return new Set(scopes.flatMap((scope) => [...scope]));
}
