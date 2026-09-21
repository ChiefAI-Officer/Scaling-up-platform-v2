import { resolveMemberIdentity } from "@/lib/members/identity";

type IdentityRow = {
  id: string;
  organizationId: string;
  teamId: string | null;
  roleType: string | null;
};

function dbWith(rows: IdentityRow[]) {
  return {
    orgRespondent: {
      findMany: jest.fn().mockResolvedValue(rows),
    },
  };
}

describe("resolveMemberIdentity", () => {
  it("normalizes the address and returns every live roster row", async () => {
    const db = dbWith([
      { id: "r1", organizationId: "o1", teamId: "t1", roleType: "employee" },
      { id: "r2", organizationId: "o2", teamId: null, roleType: "teamleader" },
      { id: "r3", organizationId: "o3", teamId: "t3", roleType: null },
    ]);

    await expect(resolveMemberIdentity(db, "  Person@Example.COM ")).resolves.toEqual({
      normalizedEmail: "person@example.com",
      members: [
        { respondentId: "r1", organizationId: "o1", teamId: "t1", roleType: "employee" },
        { respondentId: "r2", organizationId: "o2", teamId: null, roleType: "teamleader" },
        { respondentId: "r3", organizationId: "o3", teamId: "t3", roleType: null },
      ],
    });

    expect(db.orgRespondent.findMany).toHaveBeenCalledWith({
      where: {
        deletedAt: null,
        organization: { deletedAt: null },
        OR: [
          { normalizedEmail: "person@example.com" },
          {
            normalizedEmail: null,
            email: { equals: "person@example.com", mode: "insensitive" },
          },
        ],
      },
      select: {
        id: true,
        organizationId: true,
        teamId: true,
        roleType: true,
      },
    });
  });

  it("never collapses the same address across organizations to one row", async () => {
    const db = dbWith([
      { id: "ceo-row", organizationId: "company-a", teamId: null, roleType: "ceofounder" },
      { id: "employee-row", organizationId: "company-b", teamId: "team-b", roleType: "employee" },
    ]);

    const identity = await resolveMemberIdentity(db, "shared@example.com");

    expect(identity.members).toHaveLength(2);
    expect(identity.members).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ organizationId: "company-a", roleType: "ceofounder" }),
        expect.objectContaining({ organizationId: "company-b", roleType: "employee" }),
      ]),
    );
  });

  it("returns an empty set for an unknown address", async () => {
    const db = dbWith([]);
    await expect(resolveMemberIdentity(db, "missing@example.com")).resolves.toEqual({
      normalizedEmail: "missing@example.com",
      members: [],
    });
  });
});
