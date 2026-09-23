import type { MemberRow } from "@/lib/members/identity";
import {
  compareMemberLedTeamScopes,
  type MemberLedTeamScopeReader,
} from "@/lib/members/led-teams-backfill";

const members: MemberRow[] = [
  { respondentId: "dana", organizationId: "org-a", teamId: "company", roleType: "ceofounder" },
  { respondentId: "sam", organizationId: "org-a", teamId: "sales", roleType: "teamleader" },
  { respondentId: "riley", organizationId: "org-a", teamId: "engineering", roleType: "teamleader" },
  { respondentId: "jamie", organizationId: "org-a", teamId: "sales", roleType: "employee" },
  { respondentId: "alex", organizationId: "org-a", teamId: "sdr", roleType: "employee" },
  { respondentId: "morgan", organizationId: "org-a", teamId: "engineering", roleType: "employee" },
  { respondentId: "casey", organizationId: "org-a", teamId: null, roleType: "teamleader" },
  { respondentId: "jordan", organizationId: "org-a", teamId: "company", roleType: "teamleader" },
];

function fixtureReader(
  ledTeams: Record<string, string[]>,
): MemberLedTeamScopeReader {
  const teams = [
    { teamId: "company", organizationId: "org-a", parentTeamId: null, deletedAt: null },
    { teamId: "sales", organizationId: "org-a", parentTeamId: "company", deletedAt: null },
    { teamId: "sdr", organizationId: "org-a", parentTeamId: "sales", deletedAt: null },
    { teamId: "engineering", organizationId: "org-a", parentTeamId: "company", deletedAt: null },
  ];
  return {
    respondentsForOrganization: async () =>
      members.map((row) => ({
        ...row,
        deletedAt: null,
        organizationDeletedAt: null,
      })),
    teamsForOrganization: async () => teams,
    ledTeamIdsForRespondent: async (respondentId) => ledTeams[respondentId] ?? [],
  };
}

describe("compareMemberLedTeamScopes", () => {
  it("proves the backfill makes old and new authority identical for every live member", async () => {
    await expect(
      compareMemberLedTeamScopes(
        members,
        fixtureReader({
          sam: ["sales"],
          riley: ["engineering"],
          jordan: ["company"],
        }),
      ),
    ).resolves.toEqual([]);
  });

  it("reports the exact member whose inferred Led team is missing", async () => {
    await expect(
      compareMemberLedTeamScopes(
        members,
        fixtureReader({ sam: ["sales"], riley: ["engineering"] }),
      ),
    ).resolves.toEqual([
      {
        respondentId: "jordan",
        membershipScope: ["alex", "jamie", "jordan", "morgan", "riley", "sam"],
        ledTeamsScope: ["jordan"],
      },
    ]);
  });
});
