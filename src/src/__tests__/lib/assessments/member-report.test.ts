// eslint-disable-next-line no-var -- Jest evaluates this mock factory before imports.
var mockMemberGroupLoader = jest.fn();
jest.mock("@/lib/assessments/group-report", () => ({
  ...jest.requireActual("@/lib/assessments/group-report"),
  getCampaignGroupReportForMember: (...args: unknown[]) => mockMemberGroupLoader(...args),
}));

import {
  getMemberGroupReport,
  getMemberRespondentReport,
} from "@/lib/assessments/member-report";

const submission = (overrides: Record<string, unknown> = {}) => ({
  id: "submission-1",
  respondentId: "respondent-2",
  submittedAt: new Date("2026-09-01T00:00:00Z"),
  answers: {},
  result: { perSection: [], perQuestion: [] },
  respondent: {
    id: "respondent-2",
    firstName: "Pat",
    lastName: "Member",
    email: "member@example.com",
    jobTitle: null,
  },
  campaign: {
    id: "campaign-1",
    deletedAt: null,
    name: "Quarterly",
    language: "en",
    reportStyle: "CLASSIC",
    importManifest: null,
    template: { id: "template-1", name: "Assessment", alias: "assessment" },
    organization: { name: "Company" },
    creatorCoach: null,
    version: {
      id: "version-1",
      contentHash: "hash",
      reportConfig: null,
      sections: [],
      questions: [],
      scoringConfig: {},
    },
  },
  ...overrides,
});

type IdentityRow = {
  id: string;
  organizationId: string;
  teamId: string | null;
  roleType: string | null;
};

function fixture(
  value: ReturnType<typeof submission> | null,
  options: {
    identity?: IdentityRow[] | (() => IdentityRow[]);
    respondents?: Array<IdentityRow & { deletedAt: Date | null; organization: { deletedAt: Date | null } }>;
    teams?: Array<{ id: string; organizationId: string; parentTeamId: string | null; deletedAt: Date | null }>;
  } = {},
) {
  const defaultIdentity = [
    { id: "respondent-1", organizationId: "org-1", teamId: null, roleType: "employee" },
    { id: "respondent-2", organizationId: "org-2", teamId: null, roleType: "employee" },
  ];
  const tx = {
    orgRespondent: {
      findMany: jest.fn(async (args: { where?: { organizationId?: string } }) => {
        if (args.where?.organizationId) return options.respondents ?? [];
        return typeof options.identity === "function"
          ? options.identity()
          : options.identity ?? defaultIdentity;
      }),
    },
    orgTeam: { findMany: jest.fn().mockResolvedValue(options.teams ?? []) },
    assessmentSubmission: { findUnique: jest.fn().mockResolvedValue(value) },
    assessmentTemplateVersion: { findFirst: jest.fn().mockResolvedValue(null) },
  };
  return {
    tx,
    db: { $transaction: jest.fn(async (fn: (tx: typeof tx) => unknown) => fn(tx)) },
  };
}

describe("getMemberRespondentReport", () => {
  it("accepts only db and identity-bound input, never caller-supplied scope", () => {
    expect(getMemberRespondentReport).toHaveLength(2);
  });

  it("authorizes from the second row of a multi-row identity inside one transaction", async () => {
    const f = fixture(submission());
    const outcome = await getMemberRespondentReport(f.db, {
      normalizedEmail: "member@example.com",
      submissionId: "submission-1",
    });
    expect(outcome.status).toBe("ok");
    expect(f.db.$transaction).toHaveBeenCalledTimes(1);
    expect(f.tx.orgRespondent.findMany).toHaveBeenCalled();
    expect(f.tx.assessmentSubmission.findUnique).toHaveBeenCalled();
  });

  it("returns not-found for an unknown submission", async () => {
    const f = fixture(null);
    await expect(
      getMemberRespondentReport(f.db, {
        normalizedEmail: "member@example.com",
        submissionId: "missing",
      }),
    ).resolves.toEqual({ status: "not-found" });
  });

  it("forbids an employee from opening a report they do not own", async () => {
    const f = fixture(submission({ respondentId: "someone-else" }));
    await expect(
      getMemberRespondentReport(f.db, {
        normalizedEmail: "member@example.com",
        submissionId: "submission-1",
      }),
    ).resolves.toEqual({ status: "forbidden" });
  });

  it("opens a same-organization report for a CEO-family member", async () => {
    const f = fixture(submission({ respondentId: "colleague" }), {
      identity: [
        { id: "ceo", organizationId: "org-1", teamId: "exec", roleType: "ceofounder" },
      ],
      respondents: [
        { id: "ceo", organizationId: "org-1", teamId: "exec", roleType: "ceofounder", deletedAt: null, organization: { deletedAt: null } },
        { id: "colleague", organizationId: "org-1", teamId: "sales", roleType: "employee", deletedAt: null, organization: { deletedAt: null } },
      ],
    });

    await expect(
      getMemberRespondentReport(f.db, {
        normalizedEmail: "ceo@example.com",
        submissionId: "submission-1",
      }),
    ).resolves.toMatchObject({ status: "ok" });
  });

  it("opens descendant-team reports for the right department head but not a sibling leader", async () => {
    const teams = [
      { id: "root", organizationId: "org-1", parentTeamId: null, deletedAt: null },
      { id: "child", organizationId: "org-1", parentTeamId: "root", deletedAt: null },
      { id: "sibling", organizationId: "org-1", parentTeamId: null, deletedAt: null },
    ];
    const respondents = [
      { id: "leader", organizationId: "org-1", teamId: "root", roleType: "teamleader", deletedAt: null, organization: { deletedAt: null } },
      { id: "sibling-leader", organizationId: "org-1", teamId: "sibling", roleType: "teamleader", deletedAt: null, organization: { deletedAt: null } },
      { id: "child-member", organizationId: "org-1", teamId: "child", roleType: "employee", deletedAt: null, organization: { deletedAt: null } },
    ];
    const entitled = fixture(submission({ respondentId: "child-member" }), {
      identity: [respondents[0]], respondents, teams,
    });
    const sibling = fixture(submission({ respondentId: "child-member" }), {
      identity: [respondents[1]], respondents, teams,
    });

    await expect(getMemberRespondentReport(entitled.db, {
      normalizedEmail: "leader@example.com", submissionId: "submission-1",
    })).resolves.toMatchObject({ status: "ok" });
    await expect(getMemberRespondentReport(sibling.db, {
      normalizedEmail: "sibling@example.com", submissionId: "submission-1",
    })).resolves.toEqual({ status: "forbidden" });
  });

  it("recomputes a changed level on the next request without a new session", async () => {
    let roleType = "employee";
    const respondents = [
      { id: "member", organizationId: "org-1", teamId: null, roleType: "employee", deletedAt: null, organization: { deletedAt: null } },
      { id: "colleague", organizationId: "org-1", teamId: null, roleType: "employee", deletedAt: null, organization: { deletedAt: null } },
    ];
    const f = fixture(submission({ respondentId: "colleague" }), {
      identity: () => [{ id: "member", organizationId: "org-1", teamId: null, roleType }],
      respondents,
    });

    await expect(getMemberRespondentReport(f.db, {
      normalizedEmail: "member@example.com", submissionId: "submission-1",
    })).resolves.toEqual({ status: "forbidden" });
    roleType = "ceofounder";
    await expect(getMemberRespondentReport(f.db, {
      normalizedEmail: "member@example.com", submissionId: "submission-1",
    })).resolves.toMatchObject({ status: "ok" });
  });

  it("keeps CEO-family reports outside a department head's scope even in their own team", async () => {
    const respondents = [
      { id: "leader", organizationId: "org-1", teamId: "team-1", roleType: "teamleader", deletedAt: null, organization: { deletedAt: null } },
      { id: "ceo", organizationId: "org-1", teamId: "team-1", roleType: "ceofounder", deletedAt: null, organization: { deletedAt: null } },
    ];
    const f = fixture(submission({ respondentId: "ceo" }), {
      identity: [respondents[0]],
      respondents,
      teams: [{ id: "team-1", organizationId: "org-1", parentTeamId: null, deletedAt: null }],
    });

    await expect(getMemberRespondentReport(f.db, {
      normalizedEmail: "leader@example.com", submissionId: "submission-1",
    })).resolves.toEqual({ status: "forbidden" });
  });

  it("forbids a soft-deleted campaign", async () => {
    const dead = submission();
    dead.campaign.deletedAt = new Date();
    const f = fixture(dead);
    await expect(
      getMemberRespondentReport(f.db, {
        normalizedEmail: "member@example.com",
        submissionId: "submission-1",
      }),
    ).resolves.toEqual({ status: "forbidden" });
  });
});

describe("getMemberGroupReport", () => {
  const identityTx = {
    orgRespondent: {
      findMany: jest.fn().mockResolvedValue([
        { id: "respondent-1", organizationId: "org-1", teamId: null, roleType: "employee" },
        { id: "respondent-2", organizationId: "org-1", teamId: null, roleType: "employee" },
      ]),
    },
  };

  beforeEach(() => mockMemberGroupLoader.mockReset());

  it("allows only when own-only entitlement covers the entire completed cohort", async () => {
    mockMemberGroupLoader.mockImplementation(
      async (_db, _campaignId, _generatedAt, authorize) =>
        (await authorize(identityTx, ["respondent-1", "respondent-2"], "org-1"))
          ? { kind: "ok", report: {}, provenance: {} }
          : { kind: "forbidden" },
    );
    await expect(
      getMemberGroupReport({} as never, {
        normalizedEmail: "member@example.com",
        campaignId: "campaign-1",
      }),
    ).resolves.toMatchObject({ kind: "ok" });
    expect(identityTx.orgRespondent.findMany).toHaveBeenCalled();
  });

  it("forbids when entitlement covers all but one completed respondent", async () => {
    mockMemberGroupLoader.mockImplementation(
      async (_db, _campaignId, _generatedAt, authorize) =>
        (await authorize(
          identityTx,
          ["respondent-1", "respondent-2", "respondent-3"],
          "org-1",
        ))
          ? { kind: "ok" }
          : { kind: "forbidden" },
    );
    await expect(
      getMemberGroupReport({} as never, {
        normalizedEmail: "member@example.com",
        campaignId: "campaign-1",
      }),
    ).resolves.toEqual({ kind: "forbidden" });
  });

  it.each([
    { kind: "empty", provenance: { completedCount: 0 } },
    { kind: "notApplicable", reason: "public", templateAlias: "lva" },
  ])("passes the shared loader's $kind outcome through", async (outcome) => {
    mockMemberGroupLoader.mockResolvedValue(outcome);
    await expect(
      getMemberGroupReport({} as never, {
        normalizedEmail: "member@example.com",
        campaignId: "campaign-1",
      }),
    ).resolves.toEqual(outcome);
  });
});
