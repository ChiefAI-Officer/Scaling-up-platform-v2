import {
  listSummaryReportCandidates,
  type SummaryReportCandidateDb,
} from "@/lib/assessments/summary-reports/candidates";
import type { AccessControlDb } from "@/lib/assessments/access-control";
import type { ApiActor } from "@/lib/auth/access-control";

function requireStrictAccessContract(
  db: SummaryReportCandidateDb,
): AccessControlDb {
  return db;
}

const actor: ApiActor = {
  userId: "user-1",
  email: "coach@example.com",
  role: "COACH",
  coachId: "coach-1",
};

const adminActor: ApiActor = {
  userId: "admin-1",
  email: "admin@example.com",
  role: "ADMIN",
  coachId: null,
};

function campaign(overrides: Record<string, unknown> = {}) {
  return {
    id: "campaign-destination",
    name: "Scaling Q3",
    organizationId: "organization-1",
    templateId: "template-scaling",
    versionId: "version-1",
    language: "en",
    status: "ACTIVE" as const,
    accessMode: "INVITED" as const,
    createdByCoachId: "coach-1",
    deletedAt: null,
    template: { id: "template-scaling", alias: "scaling-up-full" },
    version: {
      id: "version-1",
      templateId: "template-scaling",
      versionNumber: 1,
      language: "en",
    },
    organization: { id: "organization-1", name: "Acme", deletedAt: null },
    ...overrides,
  };
}

function submission(overrides: Record<string, unknown> = {}) {
  const candidate = {
    id: "submission-1",
    campaignId: "campaign-destination",
    respondentId: "respondent-1",
    submittedAt: new Date("2026-08-27T09:00:00.000Z"),
    respondent: {
      id: "respondent-1",
      firstName: "Avery",
      lastName: "Stone",
      jobTitle: "CEO",
      organizationId: "organization-1",
      deletedAt: null,
    },
    invitation: {
      campaignId: "campaign-destination",
      respondentId: "respondent-1",
      status: "SUBMITTED" as const,
      revokedAt: null,
    },
    campaign: campaign(),
    ...overrides,
  };
  if (!Object.hasOwn(overrides, "invitation")) {
    candidate.invitation = {
      campaignId: candidate.campaignId,
      respondentId: candidate.respondentId,
      status: "SUBMITTED" as const,
      revokedAt: null,
    };
  }
  return candidate;
}

function buildDb(
  options: {
    campaigns?: ReturnType<typeof campaign>[];
    submissions?: Awaited<
      ReturnType<SummaryReportCandidateDb["assessmentSubmission"]["findMany"]>
    >;
    grantedTemplateIds?: string[];
  } = {},
) {
  const campaigns = options.campaigns ?? [campaign()];
  const campaignById = new Map(campaigns.map((row) => [row.id, row]));
  const grantedTemplateIds = new Set(
    options.grantedTemplateIds ?? ["template-scaling"],
  );

  const db = {
    accessGroupCoach: {
      findMany: jest.fn(async () => [
        {
          accessGroupId: "group-1",
          coachId: "coach-1",
          accessGroup: { id: "group-1", deletedAt: null },
        },
      ]),
    },
    accessGroupTemplate: {
      findMany: jest.fn(async (args: { where?: { templateId?: string } }) =>
        args.where?.templateId && grantedTemplateIds.has(args.where.templateId)
          ? [{ accessGroupId: "group-1", templateId: args.where.templateId }]
          : [],
      ),
    },
    organization: {
      findUnique: jest.fn(async (args: { where: { id: string } }) => {
        const row = campaigns.find(
          (candidate) => candidate.organizationId === args.where.id,
        );
        return row
          ? { id: row.organizationId, ownerCoachId: "coach-1", deletedAt: null }
          : null;
      }),
    },
    coach: {
      findUnique: jest.fn(async () => ({
        id: "coach-1",
        certificationStatus: "ACTIVE",
      })),
    },
    assessmentCampaign: {
      findFirst: jest.fn(
        async (args: { where: { id: string } }) =>
          campaignById.get(args.where.id) ?? null,
      ),
    },
    assessmentSubmission: {
      findMany: jest.fn(async () => options.submissions ?? []),
    },
  } satisfies SummaryReportCandidateDb;

  requireStrictAccessContract(db);
  return db;
}

describe("listSummaryReportCandidates", () => {
  it("returns not-found without loading submissions when destination authorization fails", async () => {
    const db = buildDb({
      campaigns: [campaign({ createdByCoachId: "coach-other" })],
    });

    await expect(
      listSummaryReportCandidates(db, actor, {
        destinationCampaignId: "campaign-destination",
        reportType: "SCALING_CEO_FULL",
        scope: "current",
      }),
    ).resolves.toEqual({ kind: "not-found" });
    expect(db.assessmentSubmission.findMany).not.toHaveBeenCalled();
  });

  it("returns not-found without loading submissions for a PUBLIC destination", async () => {
    const db = buildDb({
      campaigns: [campaign({ accessMode: "PUBLIC" })],
    });

    await expect(
      listSummaryReportCandidates(db, adminActor, {
        destinationCampaignId: "campaign-destination",
        reportType: "SCALING_CEO_FULL",
        scope: "current",
      }),
    ).resolves.toEqual({ kind: "not-found" });
    expect(db.assessmentSubmission.findMany).not.toHaveBeenCalled();
  });

  it.each(["current", "all"] as const)(
    "rejects an organization-less destination before querying %s sources",
    async (scope) => {
      const db = buildDb({
        campaigns: [campaign({ organizationId: null, organization: null })],
      });

      await expect(
        listSummaryReportCandidates(db, adminActor, {
          destinationCampaignId: "campaign-destination",
          reportType: "SCALING_CEO_FULL",
          scope,
        }),
      ).resolves.toEqual({ kind: "not-found" });
      expect(db.assessmentSubmission.findMany).not.toHaveBeenCalled();
    },
  );

  it.each(["current", "all"] as const)(
    "excludes sources with missing organization data in %s scope",
    async (scope) => {
      const db = buildDb({
        submissions: [
          submission(),
          submission({
            id: "submission-no-organization",
            campaign: campaign({ organizationId: null, organization: null }),
          }),
          submission({
            id: "submission-missing-organization-relation",
            campaign: campaign({ organization: null }),
          }),
        ],
      });

      await expect(
        listSummaryReportCandidates(db, adminActor, {
          destinationCampaignId: "campaign-destination",
          reportType: "SCALING_CEO_FULL",
          scope,
        }),
      ).resolves.toEqual({
        kind: "ok",
        candidates: [expect.objectContaining({ submissionId: "submission-1" })],
      });
      expect(db.assessmentSubmission.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            campaign: expect.objectContaining({ organizationId: "organization-1" }),
          }),
        }),
      );
    },
  );

  it("lists only frozen invited Scaling personal reports from the current campaign", async () => {
    const wrongFamilyCampaign = campaign({
      templateId: "template-lva",
      template: { id: "template-lva", alias: "leadership-vision-alignment" },
      version: {
        id: "version-lva",
        templateId: "template-lva",
        versionNumber: 1,
        language: "en",
      },
      versionId: "version-lva",
    });
    const db = buildDb({
      campaigns: [campaign(), campaign({ id: "campaign-other" })],
      submissions: [
        submission(),
        submission({
          id: "submission-public",
          respondentId: null,
          respondent: null,
        }),
        submission({
          id: "submission-wrong-family",
          campaign: wrongFamilyCampaign,
        }),
        submission({
          id: "submission-other-campaign",
          campaignId: "campaign-other",
          campaign: campaign({ id: "campaign-other" }),
        }),
        submission({
          id: "submission-public-campaign",
          campaign: campaign({ accessMode: "PUBLIC" }),
        }),
      ],
    });

    await expect(
      listSummaryReportCandidates(db, adminActor, {
        destinationCampaignId: "campaign-destination",
        reportType: "SCALING_CEO_FULL",
        scope: "current",
      }),
    ).resolves.toEqual({
      kind: "ok",
      candidates: [
        {
          submissionId: "submission-1",
          campaignId: "campaign-destination",
          campaignName: "Scaling Q3",
          respondentId: "respondent-1",
          respondentName: "Avery Stone",
          jobTitle: "CEO",
          organizationId: "organization-1",
          organizationName: "Acme",
          templateId: "template-scaling",
          templateAlias: "scaling-up-full",
          versionId: "version-1",
          versionNumber: 1,
          language: "en",
          submittedAt: "2026-08-27T09:00:00.000Z",
          eligible: true,
          disabledReason: null,
        },
      ],
    });

    const query = (db.assessmentSubmission.findMany as jest.Mock).mock
      .calls[0][0];
    expect(query.where.campaignId).toBe("campaign-destination");
    expect(query.where.respondentId).toEqual({ not: null });
    expect(query.select).not.toHaveProperty("answers");
    expect(query.select).not.toHaveProperty("result");
    expect(query.select).not.toHaveProperty("publicTaker");
    expect(query.select).not.toHaveProperty("summaryReportSources");
  });

  it("lists authorized same-organization ended reports, retains incompatible cards, and memoizes source authorization", async () => {
    const closed = campaign({
      id: "campaign-closed",
      name: "Scaling Q2",
      status: "CLOSED",
    });
    const incompatible = campaign({
      id: "campaign-incompatible",
      name: "Scaling Q1",
      status: "CLOSED",
      versionId: "version-2",
      version: {
        id: "version-2",
        templateId: "template-scaling",
        versionNumber: 2,
        language: "en",
      },
    });
    const inaccessible = campaign({
      id: "campaign-inaccessible",
      createdByCoachId: "coach-other",
    });
    const otherOrganization = campaign({
      id: "campaign-other-org",
      organizationId: "organization-2",
      organization: { id: "organization-2", name: "Other Co", deletedAt: null },
    });
    const wrongFamily = campaign({
      id: "campaign-lva",
      templateId: "template-lva",
      versionId: "version-lva",
      template: { id: "template-lva", alias: "leadership-vision-alignment" },
      version: {
        id: "version-lva",
        templateId: "template-lva",
        versionNumber: 1,
        language: "en",
      },
    });
    const db = buildDb({
      campaigns: [
        campaign(),
        closed,
        incompatible,
        inaccessible,
        otherOrganization,
        wrongFamily,
      ],
      submissions: [
        submission(),
        submission({
          id: "submission-b",
          campaignId: "campaign-closed",
          campaign: closed,
          respondentId: "respondent-b",
          respondent: {
            id: "respondent-b",
            firstName: "Blair",
            lastName: "Quinn",
            jobTitle: null,
            organizationId: "organization-1",
            deletedAt: null,
          },
          submittedAt: new Date("2026-08-27T10:00:00.000Z"),
        }),
        submission({
          id: "submission-a",
          campaignId: "campaign-closed",
          campaign: closed,
          respondentId: "respondent-a",
          respondent: {
            id: "respondent-a",
            firstName: "Alex",
            lastName: "Quinn",
            jobTitle: "COO",
            organizationId: "organization-1",
            deletedAt: null,
          },
          submittedAt: new Date("2026-08-27T10:00:00.000Z"),
        }),
        submission({
          id: "submission-incompatible",
          campaignId: "campaign-incompatible",
          campaign: incompatible,
          submittedAt: new Date("2026-08-27T11:00:00.000Z"),
        }),
        submission({
          id: "submission-inaccessible",
          campaignId: "campaign-inaccessible",
          campaign: inaccessible,
          submittedAt: new Date("2026-08-27T12:00:00.000Z"),
        }),
        submission({
          id: "submission-other-org",
          campaignId: "campaign-other-org",
          campaign: otherOrganization,
          respondent: {
            id: "respondent-1",
            firstName: "Avery",
            lastName: "Stone",
            jobTitle: "CEO",
            organizationId: "organization-2",
          },
          submittedAt: new Date("2026-08-27T13:00:00.000Z"),
        }),
        submission({
          id: "submission-lva",
          campaignId: "campaign-lva",
          campaign: wrongFamily,
          submittedAt: new Date("2026-08-27T14:00:00.000Z"),
        }),
      ],
      grantedTemplateIds: ["template-scaling", "template-lva"],
    });

    const result = await listSummaryReportCandidates(db, actor, {
      destinationCampaignId: "campaign-destination",
      reportType: "SCALING_CEO_FULL",
      scope: "all",
    });

    expect(result.kind).toBe("ok");
    if (result.kind !== "ok") return;
    expect(
      result.candidates.map((candidate) => candidate.submissionId),
    ).toEqual([
      "submission-incompatible",
      "submission-a",
      "submission-b",
      "submission-1",
    ]);
    expect(result.candidates[0]).toEqual(
      expect.objectContaining({
        eligible: false,
        disabledReason: "INCOMPATIBLE_VERSION",
        versionId: "version-2",
        versionNumber: 2,
      }),
    );
    expect(result.candidates.slice(1)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ eligible: true, disabledReason: null }),
      ]),
    );

    const query = (db.assessmentSubmission.findMany as jest.Mock).mock
      .calls[0][0];
    expect(query.where).not.toHaveProperty("campaignId");
    expect(query.where.campaign).toEqual(
      expect.objectContaining({
        organizationId: "organization-1",
        accessMode: "INVITED",
        status: { in: ["ACTIVE", "CLOSED"] },
        deletedAt: null,
      }),
    );

    const sourceAuthCalls = (
      db.assessmentCampaign.findFirst as jest.Mock
    ).mock.calls.filter(
      ([args]) =>
        args.where.id === "campaign-closed" && args.select === undefined,
    );
    expect(sourceAuthCalls).toHaveLength(1);
    expect(db.coach.findUnique).toHaveBeenCalledWith({
      where: { id: "coach-1" },
    });
    expect(db.organization.findUnique).toHaveBeenCalledWith({
      where: { id: "organization-1" },
    });
    expect(db.accessGroupCoach.findMany).toHaveBeenCalled();
    expect(db.accessGroupTemplate.findMany).toHaveBeenCalled();
  });

  it.each(["current", "all"] as const)(
    "excludes deleted, revoked, incomplete, and mismatched personal sources in %s scope",
    async (scope) => {
      const staleCampaign = campaign({ id: "campaign-stale" });
      const sourceCampaignId =
        scope === "current" ? "campaign-destination" : "campaign-stale";
      const sourceCampaign = scope === "current" ? campaign() : staleCampaign;
      const valid = submission({
        id: `submission-${scope}-valid`,
        campaignId: sourceCampaignId,
        campaign: sourceCampaign,
        invitation: {
          campaignId: sourceCampaignId,
          respondentId: "respondent-1",
          status: "SUBMITTED",
          revokedAt: null,
        },
      });
      const db = buildDb({
        campaigns: [campaign(), staleCampaign],
        submissions: [
          valid,
          submission({
            id: `submission-${scope}-deleted`,
            campaignId: sourceCampaignId,
            campaign: sourceCampaign,
            respondent: {
              ...valid.respondent!,
              deletedAt: new Date("2026-08-27T10:00:00.000Z"),
            },
            invitation: valid.invitation,
          }),
          submission({
            id: `submission-${scope}-revoked`,
            campaignId: sourceCampaignId,
            campaign: sourceCampaign,
            invitation: {
              ...valid.invitation!,
              revokedAt: new Date("2026-08-27T10:00:00.000Z"),
            },
          }),
          submission({
            id: `submission-${scope}-incomplete`,
            campaignId: sourceCampaignId,
            campaign: sourceCampaign,
            invitation: { ...valid.invitation!, status: "VIEWED" },
          }),
          submission({
            id: `submission-${scope}-campaign-mismatch`,
            campaignId: sourceCampaignId,
            campaign: sourceCampaign,
            invitation: { ...valid.invitation!, campaignId: "campaign-other" },
          }),
          submission({
            id: `submission-${scope}-respondent-mismatch`,
            campaignId: sourceCampaignId,
            campaign: sourceCampaign,
            invitation: {
              ...valid.invitation!,
              respondentId: "respondent-other",
            },
          }),
        ],
      });

      const result = await listSummaryReportCandidates(db, adminActor, {
        destinationCampaignId: "campaign-destination",
        reportType: "SCALING_CEO_FULL",
        scope,
      });

      expect(result).toEqual(
        expect.objectContaining({
          kind: "ok",
          candidates: [expect.objectContaining({ submissionId: valid.id })],
        }),
      );
      if (result.kind !== "ok") return;
      expect(result.candidates).toHaveLength(1);
      expect(result.candidates[0]?.submissionId).toBe(valid.id);

      const query = (db.assessmentSubmission.findMany as jest.Mock).mock
        .calls[0][0];
      expect(query.where.respondent).toEqual({ is: { deletedAt: null } });
      expect(query.where.invitation).toEqual({
        is: { status: "SUBMITTED", revokedAt: null },
      });
    },
  );
});
