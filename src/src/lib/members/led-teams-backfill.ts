import {
  scopeForAuthorityMode,
  type EntitlementReader,
} from "@/lib/members/entitlement";
import type { MemberRow } from "@/lib/members/identity";
import {
  createMemberEntitlementReader,
  type MemberEntitlementDb,
} from "@/lib/members/entitlement-reader";
import type { PrismaClient } from "@prisma/client";

export type MemberLedTeamScopeReader = EntitlementReader;

export type MemberLedTeamScopeMismatch = {
  respondentId: string;
  membershipScope: string[];
  ledTeamsScope: string[];
};

export type MemberLedTeamIntegrityViolation = {
  respondentId: string;
  teamId: string;
  recordedOrganizationId: string;
  respondentOrganizationId: string;
  teamOrganizationId: string;
};

function sorted(scope: Set<string>): string[] {
  return [...scope].sort();
}

/** Compare both authority algorithms for every supplied live membership. */
export async function compareMemberLedTeamScopes(
  members: MemberRow[],
  reader: MemberLedTeamScopeReader,
): Promise<MemberLedTeamScopeMismatch[]> {
  const mismatches: MemberLedTeamScopeMismatch[] = [];
  for (const member of members) {
    const [membershipScope, ledTeamsScope] = await Promise.all([
      scopeForAuthorityMode(member, reader, "membership"),
      scopeForAuthorityMode(member, reader, "led-teams"),
    ]);
    const oldScope = sorted(membershipScope);
    const newScope = sorted(ledTeamsScope);
    if (
      oldScope.length !== newScope.length ||
      oldScope.some((respondentId, index) => respondentId !== newScope[index])
    ) {
      mismatches.push({
        respondentId: member.respondentId,
        membershipScope: oldScope,
        ledTeamsScope: newScope,
      });
    }
  }
  return mismatches;
}

/** Enumerate every persisted cross-organization authority edge. */
export async function findMemberLedTeamIntegrityViolations(
  db: PrismaClient,
): Promise<MemberLedTeamIntegrityViolation[]> {
  const rows = await db.orgRespondentLedTeam.findMany({
    select: {
      respondentId: true,
      teamId: true,
      organizationId: true,
      respondent: { select: { organizationId: true } },
      team: { select: { organizationId: true } },
    },
  });
  return rows
    .filter(
      (row) =>
        row.organizationId !== row.respondent.organizationId ||
        row.organizationId !== row.team.organizationId,
    )
    .map((row) => ({
      respondentId: row.respondentId,
      teamId: row.teamId,
      recordedOrganizationId: row.organizationId,
      respondentOrganizationId: row.respondent.organizationId,
      teamOrganizationId: row.team.organizationId,
    }));
}

/** Verify integrity and old/new scope agreement for every live membership. */
export async function verifyMemberLedTeamsBackfill(db: PrismaClient): Promise<{
  integrityViolations: MemberLedTeamIntegrityViolation[];
  scopeMismatches: MemberLedTeamScopeMismatch[];
}> {
  const [rows, integrityViolations] = await Promise.all([
    db.orgRespondent.findMany({
      where: { deletedAt: null, organization: { deletedAt: null } },
      select: {
        id: true,
        organizationId: true,
        teamId: true,
        roleType: true,
      },
    }),
    findMemberLedTeamIntegrityViolations(db),
  ]);
  const members: MemberRow[] = rows.map((row) => ({
    respondentId: row.id,
    organizationId: row.organizationId,
    teamId: row.teamId,
    roleType: row.roleType,
  }));
  const scopeMismatches = await compareMemberLedTeamScopes(
    members,
    // Prisma's generic delegates are not structurally assignable to the narrow
    // testable reader interface, although these selected queries are identical.
    createMemberEntitlementReader(db as unknown as MemberEntitlementDb),
  );
  return { integrityViolations, scopeMismatches };
}
