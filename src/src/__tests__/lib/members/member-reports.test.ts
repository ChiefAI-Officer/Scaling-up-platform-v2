import { listMemberReports } from "@/lib/members/member-reports";

const rows = [
  {
    id: "submission-own",
    respondentId: "ceo",
    submittedAt: new Date("2026-09-20T00:00:00Z"),
    respondent: { firstName: "Casey", lastName: "CEO" },
    invitation: { status: "SUBMITTED" },
    campaign: {
      id: "campaign-1",
      name: "Leadership Alignment",
      accessMode: "INVITED",
      createdByCoachId: "coach-1",
      organizationId: "org-1",
      organization: { name: "Acme" },
      template: { name: "Leadership Vision Alignment", alias: "leadership-vision-alignment" },
      version: { publishedAt: new Date("2026-09-01T00:00:00Z") },
    },
  },
  {
    id: "submission-colleague",
    respondentId: "colleague",
    submittedAt: new Date("2026-09-19T00:00:00Z"),
    respondent: { firstName: "Taylor", lastName: "Teammate" },
    invitation: { status: "SUBMITTED" },
    campaign: {
      id: "campaign-1",
      name: "Leadership Alignment",
      accessMode: "INVITED",
      createdByCoachId: "coach-1",
      organizationId: "org-1",
      organization: { name: "Acme" },
      template: { name: "Leadership Vision Alignment", alias: "leadership-vision-alignment" },
      version: { publishedAt: new Date("2026-09-01T00:00:00Z") },
    },
  },
];

function fixture(roleType: string) {
  const tx = {
    orgRespondent: {
      findMany: jest.fn(async (args: { where?: { organizationId?: string } }) =>
        args.where?.organizationId
          ? [
              { id: "ceo", organizationId: "org-1", teamId: null, roleType, deletedAt: null, organization: { deletedAt: null } },
              { id: "colleague", organizationId: "org-1", teamId: null, roleType: "employee", deletedAt: null, organization: { deletedAt: null } },
            ]
          : [{ id: "ceo", organizationId: "org-1", teamId: null, roleType }],
      ),
    },
    orgTeam: { findMany: jest.fn().mockResolvedValue([]) },
    assessmentSubmission: { findMany: jest.fn().mockResolvedValue(rows) },
    assessmentInvitation: { count: jest.fn().mockResolvedValue(0) },
  };
  return {
    tx,
    db: { $transaction: jest.fn(async (fn: (value: typeof tx) => unknown) => fn(tx)) },
  };
}

describe("listMemberReports hierarchy", () => {
  beforeEach(() => {
    process.env.WAVE_F_GROUP_REPORT_ENABLED = "1";
  });

  afterEach(() => {
    delete process.env.WAVE_F_GROUP_REPORT_ENABLED;
  });

  it("lists every entitled personal report and one distinct group report for a CEO", async () => {
    const f = fixture("ceofounder");
    const result = await listMemberReports(f.db as never, "ceo@example.com");

    expect(result.reports).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ submissionId: "submission-own", personName: null }),
        expect.objectContaining({ submissionId: "submission-colleague", personName: "Taylor Teammate" }),
        expect.objectContaining({
          kind: "group",
          href: "/member/reports/team/campaign-1",
          reportName: "Leadership Alignment",
        }),
      ]),
    );
    expect(result.reports.filter((report) => report.kind === "group")).toHaveLength(1);
  });

  it("keeps an employee to their own personal report and no group report", async () => {
    const f = fixture("employee");
    const result = await listMemberReports(f.db as never, "employee@example.com");

    expect(result.reports).toHaveLength(1);
    expect(result.reports[0]).toMatchObject({ submissionId: "submission-own" });
  });

  it("builds a Prisma-valid submission query for member reports", async () => {
    const testContext = fixture("ceofounder");

    await listMemberReports(testContext.db as never, "ceo@example.com");

    const query = testContext.tx.assessmentSubmission.findMany.mock.calls[0]?.[0];
    expect(query?.where).not.toHaveProperty("submittedAt");
  });
});
