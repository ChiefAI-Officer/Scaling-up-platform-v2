import {
  MemberLedTeamWriteError,
  replaceMemberLedTeams,
  type MemberLedTeamsTx,
} from "@/lib/members/led-teams";

function databaseFixture(options?: {
  roleType?: string | null;
  respondentOrganizationId?: string;
  teams?: Array<{ id: string; organizationId: string }>;
}) {
  const respondentOrganizationId = options?.respondentOrganizationId ?? "org-a";
  const deletes: unknown[] = [];
  const creates: unknown[] = [];
  const tx: MemberLedTeamsTx = {
    $queryRawUnsafe: jest.fn().mockResolvedValue([{ id: "member-1" }]),
    orgRespondent: {
      findFirst: jest.fn().mockResolvedValue({
        id: "member-1",
        organizationId: respondentOrganizationId,
        roleType: options?.roleType ?? "teamleader",
      }),
    },
    orgTeam: {
      findMany: jest.fn().mockResolvedValue(
        options?.teams ?? [
          { id: "sales", organizationId: respondentOrganizationId },
          { id: "engineering", organizationId: respondentOrganizationId },
        ],
      ),
    },
    orgRespondentLedTeam: {
      deleteMany: jest.fn(async (args) => {
        deletes.push(args);
        return { count: 1 };
      }),
      createMany: jest.fn(async (args) => {
        creates.push(args);
        return { count: args.data.length };
      }),
    },
  };
  const db = {
    $transaction: jest.fn(async (run: (client: MemberLedTeamsTx) => Promise<unknown>) => run(tx)),
  };
  return { db, tx, deletes, creates };
}

describe("replaceMemberLedTeams", () => {
  it("atomically replaces a leadership member's deduplicated Led teams", async () => {
    const { db, tx, deletes, creates } = databaseFixture();

    await expect(
      replaceMemberLedTeams(db, {
        respondentId: "member-1",
        teamIds: ["sales", "engineering", "sales"],
        createdBy: "coach-user-1",
        source: "coach",
      }),
    ).resolves.toEqual({
      respondentId: "member-1",
      organizationId: "org-a",
      teamIds: ["sales", "engineering"],
    });

    expect(deletes).toEqual([{ where: { respondentId: "member-1" } }]);
    expect(tx.$queryRawUnsafe).toHaveBeenCalledWith(
      'SELECT "id" FROM "org_respondents" WHERE "id" = $1 FOR UPDATE',
      "member-1",
    );
    expect(creates).toEqual([
      {
        data: [
          {
            respondentId: "member-1",
            teamId: "sales",
            organizationId: "org-a",
            createdBy: "coach-user-1",
            source: "coach",
          },
          {
            respondentId: "member-1",
            teamId: "engineering",
            organizationId: "org-a",
            createdBy: "coach-user-1",
            source: "coach",
          },
        ],
      },
    ]);
  });

  it.each(["ceofounder", "ceofounderwithteam", "ceofounderalone", "employee", "guest"])(
    "rejects Led teams on %s before writing",
    async (roleType) => {
      const { db, tx } = databaseFixture({ roleType });

      await expect(
        replaceMemberLedTeams(db, {
          respondentId: "member-1",
          teamIds: ["sales"],
          createdBy: "coach-user-1",
          source: "coach",
        }),
      ).rejects.toEqual(
        expect.objectContaining<MemberLedTeamWriteError>({
          code: "level-cannot-lead",
        }),
      );
      expect(tx.orgRespondentLedTeam.deleteMany).not.toHaveBeenCalled();
      expect(tx.orgRespondentLedTeam.createMany).not.toHaveBeenCalled();
    },
  );

  it("rejects a Led team from another organization before writing", async () => {
    const { db, tx } = databaseFixture({
      teams: [{ id: "foreign-team", organizationId: "org-b" }],
    });

    await expect(
      replaceMemberLedTeams(db, {
        respondentId: "member-1",
        teamIds: ["foreign-team"],
        createdBy: "coach-user-1",
        source: "coach",
      }),
    ).rejects.toEqual(
      expect.objectContaining<MemberLedTeamWriteError>({
        code: "cross-organization-team",
      }),
    );
    expect(tx.orgRespondentLedTeam.deleteMany).not.toHaveBeenCalled();
    expect(tx.orgRespondentLedTeam.createMany).not.toHaveBeenCalled();
  });
});
