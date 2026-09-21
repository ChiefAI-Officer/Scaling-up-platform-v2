import { listMemberEvaluations } from "@/lib/members/member-evaluations";

const NOW = new Date("2026-10-01T12:00:00.000Z");

function invitation(overrides: Record<string, unknown> = {}) {
  return {
    id: "inv-own",
    respondentId: "ceo",
    status: "SENT",
    expiresAt: new Date("2026-10-02T12:00:00.000Z"),
    revokedAt: null,
    createdAt: new Date("2026-09-20T12:00:00.000Z"),
    campaign: {
      alias: "leadership-alignment",
      name: "Leadership Alignment",
      status: "ACTIVE",
      openAt: new Date("2026-09-01T00:00:00.000Z"),
      closeAt: new Date("2026-10-10T00:00:00.000Z"),
      deletedAt: null,
      template: { name: "Leadership Vision Alignment" },
    },
    ...overrides,
  };
}

function fixture(rows: ReturnType<typeof invitation>[]) {
  const tx = {
    orgRespondent: {
      findMany: jest.fn().mockResolvedValue([
        { id: "ceo", organizationId: "org-1", teamId: null, roleType: "ceofounder" },
      ]),
    },
    assessmentInvitation: { findMany: jest.fn().mockResolvedValue(rows) },
  };
  return {
    tx,
    db: { $transaction: jest.fn(async (fn: (value: typeof tx) => unknown) => fn(tx)) },
  };
}

describe("listMemberEvaluations", () => {
  it("lists only the signed-in member's own usable invitations, even for a CEO", async () => {
    const f = fixture([
      invitation(),
      invitation({ id: "inv-colleague", respondentId: "colleague" }),
      invitation({ id: "inv-revoked", revokedAt: new Date("2026-09-30T00:00:00.000Z") }),
      invitation({ id: "inv-submitted", status: "SUBMITTED" }),
      invitation({ id: "inv-expired", expiresAt: new Date("2026-10-01T11:59:59.000Z") }),
      invitation({
        id: "inv-deleted-campaign",
        campaign: { ...invitation().campaign, deletedAt: new Date("2026-09-30T00:00:00.000Z") },
      }),
    ]);

    await expect(
      listMemberEvaluations(f.db as never, "ceo@example.com", NOW),
    ).resolves.toEqual([
      expect.objectContaining({
        invitationId: "inv-own",
        assessmentName: "Leadership Alignment",
        href: "/member/evaluations/inv-own/open",
      }),
    ]);
  });

  it("sorts the soonest campaign close first and undated evaluations last", async () => {
    const f = fixture([
      invitation({
        id: "inv-undated",
        campaign: { ...invitation().campaign, alias: "undated", closeAt: null },
      }),
      invitation({
        id: "inv-later",
        campaign: {
          ...invitation().campaign,
          alias: "later",
          closeAt: new Date("2026-10-20T00:00:00.000Z"),
        },
      }),
      invitation({
        id: "inv-sooner",
        campaign: {
          ...invitation().campaign,
          alias: "sooner",
          closeAt: new Date("2026-10-05T00:00:00.000Z"),
        },
      }),
    ]);

    const result = await listMemberEvaluations(f.db as never, "ceo@example.com", NOW);
    expect(result.map((item) => item.invitationId)).toEqual([
      "inv-sooner",
      "inv-later",
      "inv-undated",
    ]);
  });
});
