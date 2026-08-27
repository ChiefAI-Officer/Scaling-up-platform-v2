import { buildGroupReportModel } from "@/lib/assessments/group-report-model";
import {
  buildScalingCeoFullSnapshot,
  type SummaryReportSnapshotDb,
} from "@/lib/assessments/summary-reports/scaling-ceo-full-snapshot";
import {
  canonicalJson,
  sha256Hex,
  type SelectedSummarySource,
} from "@/lib/assessments/summary-reports/canonical";
import type { ApiActor } from "@/lib/auth/access-control";

import { fixtureScalingUpFull } from "../fixtures/group-report-fixtures";

const actor: ApiActor = {
  userId: "admin-1",
  email: "admin@example.com",
  role: "ADMIN",
  coachId: null,
};

const coachActor: ApiActor = {
  userId: "coach-user-1",
  email: "coach@example.com",
  role: "COACH",
  coachId: "coach-1",
};

function destinationCampaign(overrides: Record<string, unknown> = {}) {
  const fixture = fixtureScalingUpFull();
  return {
    id: "campaign-destination",
    name: "Scaling Q3",
    organizationId: "organization-1",
    templateId: "template-scaling",
    versionId: "version-1",
    language: "en",
    status: "DRAFT" as const,
    accessMode: "INVITED" as const,
    createdByCoachId: null,
    deletedAt: null,
    importManifest: null,
    organization: { id: "organization-1", name: "Acme" },
    template: {
      id: "template-scaling",
      alias: "scaling-up-full",
      name: "Scaling Up Assessment",
    },
    version: {
      id: "version-1",
      templateId: "template-scaling",
      versionNumber: 1,
      language: "en",
      publishedAt: new Date("2026-08-01T00:00:00.000Z"),
      questions: fixture.version.questions,
      sections: fixture.version.sections,
      scoringConfig: fixture.version.scoringConfig,
    },
    creatorCoach: {
      profileImage: "https://assets.example/coach.png",
      firstName: "Casey",
      lastName: "Coach",
    },
    ...overrides,
  };
}

type CampaignRow = ReturnType<typeof destinationCampaign>;

function sourceSubmission(
  index: number,
  campaign: CampaignRow = destinationCampaign(),
  overrides: Record<string, unknown> = {},
) {
  const fixture = fixtureScalingUpFull();
  const source = fixture.submissions[index];
  const respondentId = source.respondentId!;
  return {
    id: `submission-${respondentId}`,
    campaignId: campaign.id,
    respondentId,
    submittedAt: new Date(`2026-08-2${index + 1}T09:00:00.000Z`),
    answers: source.answers,
    result: source.result,
    respondent: {
      id: respondentId,
      organizationId: campaign.organizationId,
      firstName: source.respondent?.firstName ?? "",
      lastName: source.respondent?.lastName ?? "",
      jobTitle: source.respondent?.jobTitle ?? null,
    },
    invitation: {
      campaignId: campaign.id,
      respondentId,
      status: "SUBMITTED" as const,
      revokedAt: null,
    },
    campaign: {
      id: campaign.id,
      organizationId: campaign.organizationId,
      templateId: campaign.templateId,
      versionId: campaign.versionId,
      language: campaign.language,
      status: "ACTIVE" as const,
      accessMode: campaign.accessMode,
      createdByCoachId: campaign.createdByCoachId,
      deletedAt: campaign.deletedAt,
      template: { alias: campaign.template.alias },
    },
    ...overrides,
  };
}

function selectedSources(): SelectedSummarySource[] {
  return [
    {
      submissionId: "submission-s-ed",
      sourceCampaignId: "campaign-destination",
      role: "TEAM",
      position: 1,
    },
    {
      submissionId: "submission-s-ceo",
      sourceCampaignId: "campaign-destination",
      role: "CEO",
      position: 0,
    },
    {
      submissionId: "submission-s-dee",
      sourceCampaignId: "campaign-destination",
      role: "TEAM",
      position: 0,
    },
  ];
}

function buildDb(
  options: {
    destination?: CampaignRow | null;
    campaigns?: CampaignRow[];
    submissions?: ReturnType<typeof sourceSubmission>[];
    grantedTemplateIds?: string[];
  } = {},
) {
  const destination =
    options.destination === undefined
      ? destinationCampaign()
      : options.destination;
  const campaigns = options.campaigns ?? (destination ? [destination] : []);
  const campaignById = new Map(
    campaigns.map((campaign) => [campaign.id, campaign]),
  );
  const submissions = options.submissions ?? [
    sourceSubmission(0),
    sourceSubmission(1),
    sourceSubmission(2),
  ];
  const grantedTemplateIds = new Set(
    options.grantedTemplateIds ?? ["template-scaling"],
  );

  const assessmentCampaign = {
    findFirst: jest.fn(
      async (args: { where: { id: string }; select?: unknown }) => {
        const row = campaignById.get(args.where.id) ?? null;
        if (!row) return null;
        return row;
      },
    ),
  };
  const assessmentSubmission = {
    findMany: jest.fn(
      async (args: {
        where: { id: { in: string[] }; campaignId: { in: string[] } };
      }) => {
        const selected = new Set(args.where.id.in);
        const authorizedCampaigns = new Set(args.where.campaignId.in);
        return submissions.filter(
          (submission) =>
            selected.has(submission.id) &&
            authorizedCampaigns.has(submission.campaignId),
        );
      },
    ),
  };

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
          (campaign) => campaign.organizationId === args.where.id,
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
    assessmentCampaign,
    assessmentSubmission,
  } as unknown as SummaryReportSnapshotDb;

  return { db, assessmentCampaign, assessmentSubmission };
}

describe("buildScalingCeoFullSnapshot", () => {
  it("freezes the exact selected cohort into the approved existing model", async () => {
    const later = sourceSubmission(2, destinationCampaign(), {
      id: "submission-later-not-selected",
      respondentId: "respondent-later",
    });
    const { db, assessmentSubmission } = buildDb({
      submissions: [
        sourceSubmission(0),
        sourceSubmission(1),
        sourceSubmission(2),
        later,
      ],
    });
    const createdAt = new Date("2026-08-27T12:34:56.789Z");

    const result = await buildScalingCeoFullSnapshot(db, actor, {
      destinationCampaignId: "campaign-destination",
      sources: selectedSources(),
      createdAt,
    });

    expect(result.kind).toBe("ok");
    if (result.kind !== "ok") return;

    expect(
      result.snapshot.sources.map((source) => source.submissionId),
    ).toEqual(["submission-s-ceo", "submission-s-dee", "submission-s-ed"]);
    expect(result.snapshot.sources.map((source) => source.role)).toEqual([
      "CEO",
      "TEAM",
      "TEAM",
    ]);
    const approvedModel = buildGroupReportModel(fixtureScalingUpFull());
    const { answersByRespondent: approvedAnswers, ...approvedVisibleModel } =
      approvedModel;
    const { answersByRespondent: frozenAnswers, ...frozenVisibleModel } =
      result.snapshot.reportModel;
    expect(frozenVisibleModel).toEqual(approvedVisibleModel);
    expect(frozenAnswers).toEqual({
      "s-ceo": Object.fromEntries(approvedAnswers.get("s-ceo")!),
      "s-dee": Object.fromEntries(approvedAnswers.get("s-dee")!),
      "s-ed": Object.fromEntries(approvedAnswers.get("s-ed")!),
    });
    expect(result.snapshot.createdAt).toBe(createdAt.toISOString());
    expect(result.snapshot.destination).toEqual({
      campaignId: "campaign-destination",
      campaignName: "Scaling Q3",
      organizationId: "organization-1",
      organizationName: "Acme",
      templateId: "template-scaling",
      templateAlias: "scaling-up-full",
      versionId: "version-1",
      versionNumber: 1,
      language: "en",
    });
    expect(result.snapshot.provenance).toEqual(
      expect.objectContaining({
        generatedAt: createdAt.toISOString(),
        completedCount: 3,
        invitedCount: 3,
        submissionIds: [
          "submission-s-ceo",
          "submission-s-dee",
          "submission-s-ed",
        ],
        companyName: "Acme",
        assessmentName: "Scaling Up Assessment",
        versionLabel: "scaling-up-full-v1",
        coachLogoUrl: "https://assets.example/coach.png",
        coachName: "Casey Coach",
      }),
    );
    expect(result.inputHash).toBe(sha256Hex(canonicalJson(result.snapshot)));
    expect(assessmentSubmission.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          id: { in: selectedSources().map((source) => source.submissionId) },
          campaignId: { in: ["campaign-destination"] },
        },
      }),
    );
    expect(
      result.snapshot.sources.some(
        (source) => source.submissionId === "submission-later-not-selected",
      ),
    ).toBe(false);

    const people = result.snapshot.reportModel.scored!.domains!.find(
      (domain) => domain.key === "people",
    );
    expect(people).toEqual(
      expect.objectContaining({ ceo: 8, teamAvg: 3, dev: 5 }),
    );
    expect(result.snapshot.reportModel.scored!.scaleUpScore).toEqual(
      expect.objectContaining({ ceo: 70, teamAvg: 48 }),
    );
  });

  it("rejects invalid CEO composition before reading destination or sources", async () => {
    const { db, assessmentCampaign, assessmentSubmission } = buildDb();
    const noCeo = selectedSources().filter((source) => source.role !== "CEO");

    const result = await buildScalingCeoFullSnapshot(db, actor, {
      destinationCampaignId: "campaign-destination",
      sources: noCeo,
      createdAt: new Date("2026-08-27T12:00:00.000Z"),
    });

    expect(result).toEqual({
      kind: "invalid",
      errors: [expect.objectContaining({ code: "role_minimum" })],
    });
    expect(assessmentCampaign.findFirst).not.toHaveBeenCalled();
    expect(assessmentSubmission.findMany).not.toHaveBeenCalled();

    const duplicateCeo = [
      ...selectedSources(),
      {
        submissionId: "submission-ceo-2",
        sourceCampaignId: "campaign-destination",
        role: "CEO" as const,
        position: 1,
      },
    ];
    const duplicated = await buildScalingCeoFullSnapshot(db, actor, {
      destinationCampaignId: "campaign-destination",
      sources: duplicateCeo,
      createdAt: new Date("2026-08-27T12:00:00.000Z"),
    });
    expect(duplicated.kind).toBe("invalid");
    if (duplicated.kind === "invalid") {
      expect(duplicated.errors.map((error) => error.code)).toContain(
        "role_maximum",
      );
    }
  });

  it("keeps destination status neutral but rejects unsafe destination state", async () => {
    const unsafeDestinations = [
      destinationCampaign({ accessMode: "PUBLIC" }),
      destinationCampaign({ deletedAt: new Date("2026-08-27T00:00:00.000Z") }),
      destinationCampaign({
        template: {
          id: "template-scaling",
          alias: "leadership-vision-alignment",
          name: "Wrong family",
        },
      }),
      destinationCampaign({
        version: {
          ...destinationCampaign().version,
          publishedAt: null,
        },
      }),
    ];

    for (const destination of unsafeDestinations) {
      const { db } = buildDb({ destination, campaigns: [destination] });
      await expect(
        buildScalingCeoFullSnapshot(db, actor, {
          destinationCampaignId: destination.id,
          sources: selectedSources(),
          createdAt: new Date("2026-08-27T12:00:00.000Z"),
        }),
      ).resolves.toEqual({ kind: "not-found" });
    }
  });

  it("returns not-found before source reads when strict destination authorization fails", async () => {
    const destination = destinationCampaign({
      createdByCoachId: "coach-other",
    });
    const { db, assessmentSubmission } = buildDb({
      destination,
      campaigns: [destination],
    });

    await expect(
      buildScalingCeoFullSnapshot(db, coachActor, {
        destinationCampaignId: destination.id,
        sources: selectedSources(),
        createdAt: new Date("2026-08-27T12:00:00.000Z"),
      }),
    ).resolves.toEqual({ kind: "not-found" });
    expect(assessmentSubmission.findMany).not.toHaveBeenCalled();
  });

  it("rechecks and memoizes strict authorization for each distinct source campaign", async () => {
    const destination = destinationCampaign({ createdByCoachId: "coach-1" });
    const sourceCampaign = destinationCampaign({
      id: "campaign-source",
      name: "Scaling Q2",
      createdByCoachId: "coach-1",
      status: "CLOSED",
    });
    const sources = selectedSources().map((source) =>
      source.role === "CEO"
        ? source
        : { ...source, sourceCampaignId: "campaign-source" },
    );
    const rows = [
      sourceSubmission(0, destination),
      sourceSubmission(1, sourceCampaign),
      sourceSubmission(2, sourceCampaign),
    ];
    const { db, assessmentCampaign } = buildDb({
      destination,
      campaigns: [destination, sourceCampaign],
      submissions: rows,
    });

    const result = await buildScalingCeoFullSnapshot(db, coachActor, {
      destinationCampaignId: destination.id,
      sources,
      createdAt: new Date("2026-08-27T12:00:00.000Z"),
    });

    expect(result.kind).toBe("ok");
    const sourceAuthCalls = assessmentCampaign.findFirst.mock.calls.filter(
      ([args]) =>
        args.where.id === "campaign-source" && args.select === undefined,
    );
    expect(sourceAuthCalls).toHaveLength(1);
  });

  it("fails closed without respondent PII when authorization to a source is lost", async () => {
    const destination = destinationCampaign({ createdByCoachId: "coach-1" });
    const inaccessible = destinationCampaign({
      id: "campaign-source",
      createdByCoachId: "coach-other",
      status: "CLOSED",
    });
    const sources = selectedSources().map((source) =>
      source.role === "CEO"
        ? source
        : { ...source, sourceCampaignId: "campaign-source" },
    );
    const { db, assessmentSubmission } = buildDb({
      destination,
      campaigns: [destination, inaccessible],
      submissions: [
        sourceSubmission(0, destination),
        sourceSubmission(1, inaccessible),
        sourceSubmission(2, inaccessible),
      ],
    });

    await expect(
      buildScalingCeoFullSnapshot(db, coachActor, {
        destinationCampaignId: destination.id,
        sources,
        createdAt: new Date("2026-08-27T12:00:00.000Z"),
      }),
    ).resolves.toEqual({
      kind: "invalid",
      errors: [
        {
          code: "source_unavailable",
          message:
            "One or more selected sources are unavailable or unauthorized.",
        },
      ],
    });
    expect(assessmentSubmission.findMany).not.toHaveBeenCalled();
  });

  it.each([
    ["missing", [], "source_not_found"],
    [
      "null respondent",
      [sourceSubmission(0, destinationCampaign(), { respondentId: null })],
      "source_not_completed",
    ],
    [
      "non-submitted invitation",
      [
        sourceSubmission(0, destinationCampaign(), {
          invitation: {
            campaignId: "campaign-destination",
            respondentId: "s-ceo",
            status: "SENT",
            revokedAt: null,
          },
        }),
      ],
      "source_not_completed",
    ],
    [
      "public source campaign",
      [
        sourceSubmission(0, destinationCampaign(), {
          campaign: {
            ...sourceSubmission(0).campaign,
            accessMode: "PUBLIC",
          },
        }),
      ],
      "source_not_completed",
    ],
  ])("rejects a selected source that is %s", async (_label, ceoRows, code) => {
    const teamRows = [sourceSubmission(1), sourceSubmission(2)];
    const { db } = buildDb({
      submissions: [
        ...(ceoRows as ReturnType<typeof sourceSubmission>[]),
        ...teamRows,
      ],
    });

    const result = await buildScalingCeoFullSnapshot(db, actor, {
      destinationCampaignId: "campaign-destination",
      sources: selectedSources(),
      createdAt: new Date("2026-08-27T12:00:00.000Z"),
    });

    expect(result.kind).toBe("invalid");
    if (result.kind === "invalid") {
      expect(result.errors).toContainEqual(
        expect.objectContaining({
          code,
          submissionId: "submission-s-ceo",
        }),
      );
    }
  });

  it.each([
    ["organizationId", "organization-other"],
    ["templateId", "template-other"],
    ["versionId", "version-other"],
    ["language", "fr"],
  ] as const)("rejects a stale source %s mismatch", async (field, value) => {
    const ceo = sourceSubmission(0);
    const { db } = buildDb({
      submissions: [
        {
          ...ceo,
          campaign: { ...ceo.campaign, [field]: value },
        },
        sourceSubmission(1),
        sourceSubmission(2),
      ],
    });

    const result = await buildScalingCeoFullSnapshot(db, actor, {
      destinationCampaignId: "campaign-destination",
      sources: selectedSources(),
      createdAt: new Date("2026-08-27T12:00:00.000Z"),
    });

    expect(result.kind).toBe("invalid");
    if (result.kind === "invalid") {
      expect(result.errors).toContainEqual(
        expect.objectContaining({
          code: "source_incompatible",
          submissionId: "submission-s-ceo",
        }),
      );
    }
  });

  it.each([
    [
      "template alias",
      (row: ReturnType<typeof sourceSubmission>) => ({
        ...row,
        campaign: {
          ...row.campaign,
          template: { alias: "leadership-vision-alignment" },
        },
      }),
    ],
    [
      "respondent organization",
      (row: ReturnType<typeof sourceSubmission>) => ({
        ...row,
        respondent: {
          ...row.respondent!,
          organizationId: "organization-other",
        },
      }),
    ],
  ])("rejects a stale %s mismatch", async (_label, mutate) => {
    const ceo = mutate(sourceSubmission(0));
    const { db } = buildDb({
      submissions: [ceo, sourceSubmission(1), sourceSubmission(2)],
    });

    const result = await buildScalingCeoFullSnapshot(db, actor, {
      destinationCampaignId: "campaign-destination",
      sources: selectedSources(),
      createdAt: new Date("2026-08-27T12:00:00.000Z"),
    });

    expect(result.kind).toBe("invalid");
    if (result.kind === "invalid") {
      expect(result.errors).toContainEqual(
        expect.objectContaining({
          code: "source_incompatible",
          submissionId: "submission-s-ceo",
        }),
      );
    }
  });

  it("uses explicit wizard roles instead of any candidate-roster CEO flag", async () => {
    const ceoRow = sourceSubmission(0, destinationCampaign(), {
      candidateRoster: { isCEO: false },
    });
    const teamRow = sourceSubmission(1, destinationCampaign(), {
      candidateRoster: { isCEO: true },
    });
    const { db } = buildDb({
      submissions: [ceoRow, teamRow, sourceSubmission(2)],
    });

    const result = await buildScalingCeoFullSnapshot(db, actor, {
      destinationCampaignId: "campaign-destination",
      sources: selectedSources(),
      createdAt: new Date("2026-08-27T12:00:00.000Z"),
    });

    expect(result.kind).toBe("ok");
    if (result.kind === "ok") {
      expect(result.snapshot.reportModel.respondents).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ respondentId: "s-ceo", isCEO: true }),
          expect.objectContaining({ respondentId: "s-dee", isCEO: false }),
        ]),
      );
    }
  });

  it("allows Team 0 and preserves the current null not-available model values", async () => {
    const ceoOnly = selectedSources().filter((source) => source.role === "CEO");
    const { db } = buildDb({ submissions: [sourceSubmission(0)] });

    const result = await buildScalingCeoFullSnapshot(db, actor, {
      destinationCampaignId: "campaign-destination",
      sources: ceoOnly,
      createdAt: new Date("2026-08-27T12:00:00.000Z"),
    });

    expect(result.kind).toBe("ok");
    if (result.kind === "ok") {
      const people = result.snapshot.reportModel.scored!.domains!.find(
        (domain) => domain.key === "people",
      );
      expect(people).toEqual(
        expect.objectContaining({ ceo: 8, teamAvg: null, dev: null }),
      );
      expect(result.snapshot.reportModel.scored!.scaleUpScore).toEqual(
        expect.objectContaining({ ceo: 70, teamAvg: null }),
      );
      expect(result.snapshot.provenance.completedCount).toBe(1);
      expect(result.snapshot.provenance.invitedCount).toBe(1);
    }
  });

  it("converts every frozen Date to ISO text and includes createdAt in the hash", async () => {
    const ceo = sourceSubmission(0);
    const nestedDate = new Date("2026-08-20T01:02:03.004Z");
    const { db } = buildDb({
      submissions: [
        {
          ...ceo,
          result: { ...(ceo.result as object), frozenAt: nestedDate },
        },
        sourceSubmission(1),
        sourceSubmission(2),
      ],
    });
    const first = await buildScalingCeoFullSnapshot(db, actor, {
      destinationCampaignId: "campaign-destination",
      sources: selectedSources(),
      createdAt: new Date("2026-08-27T12:00:00.000Z"),
    });
    const second = await buildScalingCeoFullSnapshot(db, actor, {
      destinationCampaignId: "campaign-destination",
      sources: selectedSources(),
      createdAt: new Date("2026-08-27T12:00:01.000Z"),
    });

    expect(first.kind).toBe("ok");
    expect(second.kind).toBe("ok");
    if (first.kind === "ok" && second.kind === "ok") {
      expect(
        (first.snapshot.sources[0].result as { frozenAt: string }).frozenAt,
      ).toBe(nestedDate.toISOString());
      expect(() => canonicalJson(first.snapshot)).not.toThrow();
      expect(first.inputHash).not.toBe(second.inputHash);
    }
  });
});
