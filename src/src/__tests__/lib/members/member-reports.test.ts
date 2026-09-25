import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  groupMemberReports,
  listMemberReports,
  MEMBER_REPORT_ACCENT_BY_ALIAS,
  type MemberReportListItem,
} from "@/lib/members/member-reports";

function report(
  overrides: Partial<MemberReportListItem> &
    Pick<MemberReportListItem, "campaignId" | "submissionId">,
): MemberReportListItem {
  return {
    campaignName: "Quarterly Review",
    kind: "personal",
    href: `/member/reports/${overrides.submissionId}`,
    assessmentName: "Scaling Up Full",
    reportName: "Quarterly Review",
    personName: null,
    companyName: null,
    completedAt: new Date("2026-09-01T00:00:00Z"),
    accent: "brown",
    ...overrides,
  };
}

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
    expect(result.reports.every((report) => report.companyName === null)).toBe(true);
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

describe("groupMemberReports", () => {
  it("keeps campaigns with the same display name in separate groups", () => {
    const groups = groupMemberReports([
      report({ campaignId: "campaign-a", submissionId: "submission-a" }),
      report({ campaignId: "campaign-b", submissionId: "submission-b" }),
    ]);

    expect(groups.map((group) => group.campaignId)).toEqual([
      "campaign-a",
      "campaign-b",
    ]);
  });

  it("orders the group report first, the member's report second, then people A-Z", () => {
    const groups = groupMemberReports([
      report({
        campaignId: "campaign-a",
        submissionId: "zara",
        personName: "Zara Young",
      }),
      report({
        campaignId: "campaign-a",
        submissionId: "own",
        personName: null,
      }),
      report({
        campaignId: "campaign-a",
        submissionId: "group",
        kind: "group",
        href: "/member/reports/team/campaign-a",
      }),
      report({
        campaignId: "campaign-a",
        submissionId: "alex",
        personName: "Alex Rivera",
      }),
    ]);

    expect(groups[0].reports.map((item) => item.submissionId)).toEqual([
      "group",
      "own",
      "alex",
      "zara",
    ]);
  });

  it("orders campaigns by their most recent completion date", () => {
    const groups = groupMemberReports([
      report({
        campaignId: "older-campaign",
        submissionId: "older",
        completedAt: new Date("2026-08-01T00:00:00Z"),
      }),
      report({
        campaignId: "newer-campaign",
        submissionId: "newer",
        completedAt: new Date("2026-09-01T00:00:00Z"),
      }),
    ]);

    expect(groups.map((group) => group.campaignId)).toEqual([
      "newer-campaign",
      "older-campaign",
    ]);
  });
});

describe("member report instrument accents", () => {
  it("deliberately maps every seeded assessment alias", () => {
    const seedFiles = [
      "seed-rockefeller-assessment.ts",
      "seed-qsp-v1-assessment.ts",
      "seed-qsp-v2-assessment.ts",
      "seed-lva-assessment.ts",
      "seed-scaling-up-full-assessment.ts",
      "seed-five-dysfunctions.ts",
      "seed-scaling-up-quick-assessment.ts",
    ];
    const seededAliases = seedFiles.map((file) => {
      const source = readFileSync(join(process.cwd(), "prisma", file), "utf8");
      const match = source.match(/(?:TEMPLATE_ALIAS|ALIAS)\s*=\s*"([^"]+)"/);
      if (!match) throw new Error(`No seeded alias found in ${file}`);
      return match[1];
    });

    expect(Object.keys(MEMBER_REPORT_ACCENT_BY_ALIAS).sort()).toEqual(
      seededAliases.sort(),
    );
    expect(MEMBER_REPORT_ACCENT_BY_ALIAS).toEqual({
      RockHabits: "orange",
      "qsp-v1": "green",
      "qsp-v2": "green",
      "leadership-vision-alignment": "blue",
      "scaling-up-full": "brown",
      "five-dysfunctions": "purple",
      "scaling-up-quick": "purple",
    });
  });
});
