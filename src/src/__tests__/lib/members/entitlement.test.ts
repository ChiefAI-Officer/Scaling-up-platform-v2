import {
  entitlementFor,
  LEVEL_ALIASES,
  normalizeLevel,
  scopeFor,
  type EntitlementReader,
  type ScopedRespondent,
  type TeamNode,
} from "@/lib/members/entitlement";
import type { MemberRow } from "@/lib/members/identity";
import { RESPONDENT_LEVEL_VALUES } from "@/lib/assessments/respondent-levels";

const member = (overrides: Partial<MemberRow> = {}): MemberRow => ({
  respondentId: "self",
  organizationId: "org-a",
  teamId: null,
  roleType: "employee",
  ...overrides,
});

const respondent = (overrides: Partial<ScopedRespondent> = {}): ScopedRespondent => ({
  respondentId: "self",
  organizationId: "org-a",
  teamId: null,
  roleType: "employee",
  deletedAt: null,
  organizationDeletedAt: null,
  ...overrides,
});

function reader(respondents: ScopedRespondent[], teams: TeamNode[] = []): EntitlementReader {
  return {
    respondentsForOrganization: async (organizationId) =>
      respondents.filter((row) => row.organizationId === organizationId),
    teamsForOrganization: async (organizationId) =>
      teams.filter((team) => team.organizationId === organizationId),
  };
}

describe("member entitlement", () => {
  it.each(["employee", "guest", null, "unknown", "CEO", "TEAM_MEMBER"])(
    "%p receives own-only access",
    async (roleType) => {
      await expect(scopeFor(member({ roleType }), reader([]))).resolves.toEqual(new Set(["self"]));
    },
  );

  it("deliberately aliases no legacy level", () => {
    expect(LEVEL_ALIASES).toEqual({});
    expect(normalizeLevel("CEO")).toBe("CEO");
    expect(normalizeLevel("TEAM_MEMBER")).toBe("TEAM_MEMBER");
  });

  it("enumerates every level observed in production", () => {
    const observed = [
      "teamleader",
      null,
      "ceofounderwithteam",
      "TEAM_MEMBER",
      "ceofounder",
      "ceofounderalone",
      "employee",
      "CEO",
    ];
    const deliberatelyUnknown = new Set(["CEO", "TEAM_MEMBER"]);
    for (const value of observed) {
      if (value === null) continue;
      expect(RESPONDENT_LEVEL_VALUES.includes(value as never) || deliberatelyUnknown.has(value)).toBe(true);
    }
  });

  it.each(["ceofounder", "ceofounderwithteam", "ceofounderalone"])(
    "%s reaches every live respondent in its organization only",
    async (roleType) => {
      const rows = [
        respondent(),
        respondent({ respondentId: "peer", teamId: "team-a" }),
        respondent({ respondentId: "deleted", deletedAt: new Date() }),
        respondent({ respondentId: "dead-org", organizationDeletedAt: new Date() }),
        respondent({ respondentId: "other-org", organizationId: "org-b" }),
      ];
      await expect(scopeFor(member({ roleType }), reader(rows))).resolves.toEqual(
        new Set(["self", "peer"]),
      );
    },
  );

  it("walks downward through all descendants, excludes parents and siblings", async () => {
    const teams: TeamNode[] = [
      { teamId: "parent", organizationId: "org-a", parentTeamId: null, deletedAt: null },
      { teamId: "root", organizationId: "org-a", parentTeamId: "parent", deletedAt: null },
      { teamId: "child", organizationId: "org-a", parentTeamId: "root", deletedAt: null },
      { teamId: "grandchild", organizationId: "org-a", parentTeamId: "child", deletedAt: null },
      { teamId: "great-grandchild", organizationId: "org-a", parentTeamId: "grandchild", deletedAt: null },
      { teamId: "sibling", organizationId: "org-a", parentTeamId: "parent", deletedAt: null },
    ];
    const rows = [
      respondent({ respondentId: "parent-person", teamId: "parent" }),
      respondent({ respondentId: "self", teamId: "root", roleType: "teamleader" }),
      respondent({ respondentId: "peer", teamId: "root", roleType: "teamleader" }),
      respondent({ respondentId: "child-person", teamId: "child" }),
      respondent({ respondentId: "deep-person", teamId: "great-grandchild" }),
      respondent({ respondentId: "sibling-person", teamId: "sibling" }),
    ];
    await expect(
      scopeFor(member({ roleType: "teamleader", teamId: "root" }), reader(rows, teams)),
    ).resolves.toEqual(new Set(["self", "peer", "child-person", "deep-person"]));
  });

  it("subtracts CEO-family members in the leader's own and descendant teams", async () => {
    const teams: TeamNode[] = [
      { teamId: "root", organizationId: "org-a", parentTeamId: null, deletedAt: null },
      { teamId: "child", organizationId: "org-a", parentTeamId: "root", deletedAt: null },
    ];
    const rows = [
      respondent({ respondentId: "self", teamId: "root", roleType: "teamleader" }),
      respondent({ respondentId: "peer-leader", teamId: "root", roleType: "teamleader" }),
      respondent({ respondentId: "ceo-here", teamId: "root", roleType: "ceofounder" }),
      respondent({ respondentId: "employee-below", teamId: "child" }),
      respondent({ respondentId: "ceo-below", teamId: "child", roleType: "ceofounderalone" }),
    ];
    await expect(
      scopeFor(member({ roleType: "teamleader", teamId: "root" }), reader(rows, teams)),
    ).resolves.toEqual(new Set(["self", "peer-leader", "employee-below"]));
  });

  it("fails a team leader with no team closed to own-only", async () => {
    await expect(scopeFor(member({ roleType: "teamleader" }), reader([]))).resolves.toEqual(
      new Set(["self"]),
    );
  });

  it("unions per-row scopes without widening the employee organization", async () => {
    const rows = [
      respondent({ respondentId: "ceo-self", organizationId: "org-a", roleType: "ceofounder" }),
      respondent({ respondentId: "a-peer", organizationId: "org-a" }),
      respondent({ respondentId: "employee-self", organizationId: "org-b" }),
      respondent({ respondentId: "b-peer", organizationId: "org-b" }),
    ];
    await expect(
      entitlementFor(
        [
          member({ respondentId: "ceo-self", organizationId: "org-a", roleType: "ceofounder" }),
          member({ respondentId: "employee-self", organizationId: "org-b", roleType: "employee" }),
        ],
        reader(rows),
      ),
    ).resolves.toEqual(new Set(["ceo-self", "a-peer", "employee-self"]));
  });
});
