import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

import goldenSnapshotJson from "@/__tests__/fixtures/summary-reports/scaling-ceo-full-snapshot.json";
import { buildGroupReportModel } from "@/lib/assessments/group-report-model";
import {
  buildScalingCeoFullSnapshot,
  freezeCampaignGroupReportModel,
  rehydrateCampaignGroupReportModel,
  type SummaryReportSnapshotDb,
} from "@/lib/assessments/summary-reports/scaling-ceo-full-snapshot";
import {
  canonicalJson,
  sha256Hex,
  type FrozenCampaignGroupReport,
  type ScalingCeoFullSnapshot,
  type SelectedSummarySource,
} from "@/lib/assessments/summary-reports/canonical";
import type { AccessControlDb } from "@/lib/assessments/access-control";
import type { ApiActor } from "@/lib/auth/access-control";

import { fixtureScalingUpFull } from "../fixtures/group-report-fixtures";

function requireStrictAccessContract(
  db: SummaryReportSnapshotDb,
): AccessControlDb {
  return db;
}

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

const goldenSnapshot = goldenSnapshotJson as unknown as ScalingCeoFullSnapshot;

jest.setTimeout(60_000);

const rendererScratchRoot = join(process.cwd(), "tmp", "pdfs");
mkdirSync(rendererScratchRoot, { recursive: true });
const rendererBuildDir = mkdtempSync(
  join(rendererScratchRoot, "summary-ordering-test-"),
);
const rendererBuildPath = join(rendererBuildDir, "renderer.mjs");

beforeAll(() => {
  execFileSync(join(process.cwd(), "node_modules", ".bin", "esbuild"), [
    "src/lib/assessments/summary-reports/renderers/index.tsx",
    "--bundle",
    "--platform=node",
    "--format=esm",
    "--packages=external",
    "--jsx=automatic",
    `--outfile=${rendererBuildPath}`,
  ]);
});

afterAll(() => {
  rmSync(rendererBuildDir, { recursive: true, force: true });
});

function renderPdfVisibleText(snapshot: ScalingCeoFullSnapshot): string {
  const rendererUrl = pathToFileURL(rendererBuildPath).href;
  const script = `
    import { readFileSync } from "node:fs";
    import { PDFParse } from "pdf-parse";
    import { renderSummaryReportPdf } from ${JSON.stringify(rendererUrl)};

    const snapshot = JSON.parse(readFileSync(0, "utf8"));
    const rendered = await renderSummaryReportPdf("SCALING_CEO_FULL", snapshot);
    const parser = new PDFParse({ data: rendered.bytes });
    try {
      const text = await parser.getText();
      process.stdout.write(text.text.replace(/\\r/g, "").replace(/\\s+/g, " ").trim());
    } finally {
      await parser.destroy();
    }
  `;
  return execFileSync(
    process.execPath,
    ["--input-type=module", "--eval", script],
    { input: JSON.stringify(snapshot), maxBuffer: 20 * 1024 * 1024 },
  ).toString("utf8");
}

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
      deletedAt: null as Date | null,
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

function selectedFixtureModel() {
  const fixture = fixtureScalingUpFull();
  const modelId = (respondentId: string | null): string | null =>
    respondentId ? `summary-source:submission-${respondentId}` : null;
  return buildGroupReportModel({
    ...fixture,
    participants: fixture.participants.map((participant) => ({
      ...participant,
      respondentId: modelId(participant.respondentId)!,
    })),
    submissions: fixture.submissions.map((submission) => ({
      ...submission,
      respondentId: modelId(submission.respondentId),
    })),
  });
}

const GOLDEN_SECTION_DOMAINS: Record<string, string> = {
  S_PEOPLE_YE: "people",
  S_PEOPLE_CC: "people",
  S_STRATEGY: "strategy",
  S_EXEC_LT: "execution",
  S_EXEC_OP: "execution",
  S_EXEC_SM: "execution",
  S_EXEC_SIT: "execution",
  S_CASH: "cash",
  S_YOU_LEAD: "you",
  S_YOU_IC: "you",
};

function goldenDestinationCampaign(): CampaignRow {
  const questions = Object.entries(
    goldenSnapshot.reportModel.questionsByKey,
  ).map(([stableKey, meta]) => ({
    stableKey,
    type: meta.type,
    label: meta.label,
    sectionStableKey: meta.sectionStableKey,
    scale: { min: meta.min, max: meta.max, step: 1 },
  }));
  const sections = goldenSnapshot.reportModel.scored!.sections.map(
    (section, index) => ({
      stableKey: section.stableKey,
      sortOrder: index + 1,
      name: section.name,
      domain: GOLDEN_SECTION_DOMAINS[section.stableKey],
    }),
  );

  return destinationCampaign({
    id: goldenSnapshot.destination.campaignId,
    name: goldenSnapshot.destination.campaignName,
    organizationId: goldenSnapshot.destination.organizationId,
    templateId: goldenSnapshot.destination.templateId,
    versionId: goldenSnapshot.destination.versionId,
    language: goldenSnapshot.destination.language,
    status: "ACTIVE",
    organization: {
      id: goldenSnapshot.destination.organizationId,
      name: goldenSnapshot.destination.organizationName,
    },
    template: {
      id: goldenSnapshot.destination.templateId,
      alias: goldenSnapshot.destination.templateAlias,
      name: goldenSnapshot.provenance.assessmentName,
    },
    version: {
      id: goldenSnapshot.destination.versionId,
      templateId: goldenSnapshot.destination.templateId,
      versionNumber: goldenSnapshot.destination.versionNumber,
      language: goldenSnapshot.destination.language,
      publishedAt: new Date("2026-08-01T00:00:00.000Z"),
      questions,
      sections,
      scoringConfig: {},
    },
    creatorCoach: {
      profileImage: goldenSnapshot.provenance.coachLogoUrl,
      firstName: "Jordan",
      lastName: "Coach",
    },
  });
}

function goldenSourceSubmission() {
  const campaign = goldenDestinationCampaign();
  const source = goldenSnapshot.sources[0];
  return sourceSubmission(0, campaign, {
    id: source.submissionId,
    campaignId: source.sourceCampaignId,
    respondentId: source.respondent.id,
    submittedAt: new Date(source.submittedAt),
    answers: source.answers,
    result: source.result,
    respondent: {
      id: source.respondent.id,
      organizationId: goldenSnapshot.destination.organizationId,
      firstName: "Avery",
      lastName: "Morgan",
      jobTitle: source.respondent.jobTitle,
      deletedAt: null,
    },
    invitation: {
      campaignId: source.sourceCampaignId,
      respondentId: source.respondent.id,
      status: "SUBMITTED",
      revokedAt: null,
    },
    campaign: {
      id: source.sourceCampaignId,
      organizationId: goldenSnapshot.destination.organizationId,
      templateId: goldenSnapshot.destination.templateId,
      versionId: goldenSnapshot.destination.versionId,
      language: goldenSnapshot.destination.language,
      status: "ACTIVE",
      accessMode: "INVITED",
      createdByCoachId: null,
      deletedAt: null,
      template: { alias: goldenSnapshot.destination.templateAlias },
    },
  });
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
        select: Record<string, unknown>;
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
  } satisfies SummaryReportSnapshotDb;

  requireStrictAccessContract(db);

  return { db, assessmentCampaign, assessmentSubmission };
}

describe("buildScalingCeoFullSnapshot", () => {
  it("freezes and JSON-round-trips the approved model through an explicit typed boundary", () => {
    const approvedModel = selectedFixtureModel();
    const frozen: FrozenCampaignGroupReport =
      freezeCampaignGroupReportModel(approvedModel);

    expect(frozen.answersByRespondent).not.toBeInstanceOf(Map);
    expect(() => canonicalJson(frozen)).not.toThrow();

    const persisted: FrozenCampaignGroupReport = JSON.parse(
      JSON.stringify(frozen),
    );
    expect(rehydrateCampaignGroupReportModel(persisted)).toEqual(approvedModel);
  });

  it("freezes the exact selected cohort into the approved existing model", async () => {
    const later = sourceSubmission(2, destinationCampaign(), {
      id: "submission-later-not-selected",
      respondentId: "respondent-later",
    });
    const { db, assessmentCampaign, assessmentSubmission } = buildDb({
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
    const approvedModel = selectedFixtureModel();
    const frozenModel: FrozenCampaignGroupReport = result.snapshot.reportModel;
    // Main now applies the controlled question peers to direct reports too.
    // Summary still freezes its independently owned benchmark/provenance below.
    expect(approvedModel.benchmarkVersion).toBe(
      "2026-08-14.question-controlled-aggregate-provisional",
    );
    expect(rehydrateCampaignGroupReportModel(frozenModel)).toEqual({
      ...approvedModel,
      benchmarkVersion: "2026-08-14.question-controlled-aggregate-provisional",
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
        ceoRespondentId: "s-ceo",
      }),
    );
    expect(result.snapshot.provenance).not.toHaveProperty("ceoParticipantId");
    expect(result.inputHash).toBe(sha256Hex(canonicalJson(result.snapshot)));
    expect(assessmentSubmission.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          id: { in: selectedSources().map((source) => source.submissionId) },
          campaignId: { in: ["campaign-destination"] },
        },
      }),
    );
    const sourceQuery = assessmentSubmission.findMany.mock.calls[0][0];
    expect(sourceQuery.select).not.toHaveProperty("publicTaker");
    expect(sourceQuery.select).not.toHaveProperty("referringCoachEmail");
    expect(sourceQuery.select).not.toHaveProperty("resultsTokenHash");
    expect(sourceQuery.select.respondent).toEqual({
      select: {
        id: true,
        organizationId: true,
        firstName: true,
        lastName: true,
        jobTitle: true,
        deletedAt: true,
      },
    });
    expect(sourceQuery.select.invitation).toEqual({
      select: {
        campaignId: true,
        respondentId: true,
        status: true,
        revokedAt: true,
      },
    });
    const destinationQuery = assessmentCampaign.findFirst.mock.calls.find(
      ([args]) => args.select !== undefined,
    )?.[0];
    expect(destinationQuery?.select).not.toHaveProperty("participants");
    expect(destinationQuery?.select).not.toHaveProperty("submissions");
    expect(destinationQuery?.select).not.toHaveProperty("invitations");
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

  it("freezes the summary-specific question benchmark and version into the snapshot", async () => {
    const { db } = buildDb();

    const result = await buildScalingCeoFullSnapshot(db, actor, {
      destinationCampaignId: "campaign-destination",
      sources: selectedSources(),
      createdAt: new Date("2026-08-27T12:34:56.789Z"),
    });

    expect(result.kind).toBe("ok");
    if (result.kind !== "ok") return;

    const frozen = result.snapshot.peerBenchmark;
    expect(frozen).toEqual(
      expect.objectContaining({
        version: "2026-08-14.question-controlled-aggregate-provisional",
        status: "provisional",
        cohort: "single Esperto cohort",
        disclosure:
          "Peers = provisional industry benchmark (single Esperto cohort, v2026-08-14.question-controlled-aggregate-provisional); not yet size-matched.",
      }),
    );
    expect(Object.keys(frozen.questions)).toHaveLength(61);
    expect(frozen.questions).toEqual(
      expect.objectContaining({ Q01: 6.3, Q30: 5.6, Q61: 5.6 }),
    );
    expect(result.snapshot.reportModel.benchmarkVersion).toBe(
      "2026-08-14.question-controlled-aggregate-provisional",
    );
    expect(result.snapshot.provenance.benchmarkVersion).toBe(
      "2026-08-14.question-controlled-aggregate-provisional",
    );
    expect(() => canonicalJson(result.snapshot)).not.toThrow();
  });

  it("reproduces the committed de-identified golden snapshot through the production builder", async () => {
    const destination = goldenDestinationCampaign();
    const source = goldenSourceSubmission();
    const { db } = buildDb({
      destination,
      campaigns: [destination],
      submissions: [source],
    });

    const result = await buildScalingCeoFullSnapshot(db, actor, {
      destinationCampaignId: destination.id,
      sources: [
        {
          submissionId: source.id,
          sourceCampaignId: source.campaignId,
          role: "CEO",
          position: 0,
        },
      ],
      createdAt: new Date(goldenSnapshot.createdAt),
    });

    expect(result.kind).toBe("ok");
    if (result.kind !== "ok") return;
    expect(result.snapshot).toEqual(goldenSnapshot);
    expect(result.inputHash).toBe(sha256Hex(canonicalJson(goldenSnapshot)));
  });

  it("keeps the approved PDF unchanged by main's added question-peer fields", () => {
    const legacy = JSON.parse(JSON.stringify(goldenSnapshot)) as ScalingCeoFullSnapshot;
    for (const question of legacy.reportModel.scored!.questions) {
      delete question.peers;
      delete question.devPeers;
      delete question.devPeersTeam;
    }
    const conflicting = JSON.parse(JSON.stringify(goldenSnapshot)) as ScalingCeoFullSnapshot;
    for (const question of conflicting.reportModel.scored!.questions) {
      // A renderer that switches from the immutable Summary benchmark to these
      // live-model fields would alter the displayed question peers and fail.
      question.peers = 0;
      question.devPeers = 99;
      question.devPeersTeam = 99;
    }

    const approvedText = renderPdfVisibleText(legacy);
    expect(renderPdfVisibleText(goldenSnapshot)).toBe(approvedText);
    expect(renderPdfVisibleText(conflicting)).toBe(approvedText);
  });

  it("preserves explicit Team positions through the frozen model, Appendix, and PDF when names sort in reverse", async () => {
    const campaign = destinationCampaign();
    const ceo = sourceSubmission(0, campaign);
    const zulu = sourceSubmission(1, campaign, {
      respondent: {
        ...sourceSubmission(1, campaign).respondent!,
        firstName: "Zulu",
        lastName: "Team",
      },
    });
    const alpha = sourceSubmission(2, campaign, {
      respondent: {
        ...sourceSubmission(2, campaign).respondent!,
        firstName: "Alpha",
        lastName: "Team",
      },
    });
    const { db } = buildDb({
      destination: campaign,
      campaigns: [campaign],
      submissions: [ceo, zulu, alpha],
    });

    const result = await buildScalingCeoFullSnapshot(db, actor, {
      destinationCampaignId: campaign.id,
      sources: selectedSources(),
      createdAt: new Date("2026-08-27T13:00:00.000Z"),
    });

    expect(result.kind).toBe("ok");
    if (result.kind !== "ok") return;

    const expectedModelIds = [
      "summary-source:submission-s-ceo",
      "summary-source:submission-s-dee",
      "summary-source:submission-s-ed",
    ];
    expect(
      result.snapshot.sources.map((source) => ({
        modelId: `summary-source:${source.submissionId}`,
        role: source.role,
        position: source.position,
        name: source.respondent.displayName,
      })),
    ).toEqual([
      {
        modelId: expectedModelIds[0],
        role: "CEO",
        position: 0,
        name: "Sue Summit",
      },
      {
        modelId: expectedModelIds[1],
        role: "TEAM",
        position: 0,
        name: "Zulu Team",
      },
      {
        modelId: expectedModelIds[2],
        role: "TEAM",
        position: 1,
        name: "Alpha Team",
      },
    ]);
    expect(
      result.snapshot.reportModel.respondents.map((respondent) => ({
        id: respondent.respondentId,
        name: respondent.name,
        jobTitle: respondent.jobTitle,
      })),
    ).toEqual([
      { id: expectedModelIds[0], name: "Sue Summit", jobTitle: "CEO" },
      {
        id: expectedModelIds[1],
        name: "Zulu Team",
        jobTitle: "VP People",
      },
      { id: expectedModelIds[2], name: "Alpha Team", jobTitle: "VP Ops" },
    ]);
    expect(
      Object.keys(result.snapshot.reportModel.answersByRespondent),
    ).toEqual(expectedModelIds);
    expect(result.snapshot.reportModel.scored?.appendixB).toEqual([
      {
        personLabel: "CEO",
        domainScores: { people: 8, strategy: 6, execution: 7, cash: 9 },
      },
      {
        personLabel: "Person 1",
        domainScores: { people: 4, strategy: 6, execution: 5, cash: 3 },
      },
      {
        personLabel: "Person 2",
        domainScores: { people: 2, strategy: 6, execution: 3, cash: 3 },
      },
    ]);
    expect(
      result.snapshot.reportModel.scored?.domains?.map((domain) => ({
        key: domain.key,
        ceo: domain.ceo,
        teamAvg: domain.teamAvg,
        dev: domain.dev,
      })),
    ).toEqual([
      { key: "people", ceo: 8, teamAvg: 3, dev: 5 },
      { key: "strategy", ceo: 6, teamAvg: 6, dev: 0 },
      { key: "execution", ceo: 7, teamAvg: 4, dev: 3 },
      { key: "cash", ceo: 9, teamAvg: 3, dev: 6 },
      { key: "you", ceo: 5, teamAvg: 8, dev: -3 },
    ]);
    expect(result.snapshot.reportModel.scored?.scaleUpScore).toEqual(
      expect.objectContaining({ ceo: 70, teamAvg: 48 }),
    );

    const visibleText = renderPdfVisibleText(result.snapshot);
    const appendixText = visibleText.slice(visibleText.indexOf("Appendix B"));
    expect(appendixText).toContain(
      "CEO 8 6 7 9 Person 1 4 6 5 3 Person 2 2 6 3 3",
    );
    expect(visibleText).not.toContain("Zulu Team");
    expect(visibleText).not.toContain("Alpha Team");

    const legacyFixture = fixtureScalingUpFull();
    const reverseProfiles = {
      "s-ceo": { firstName: "Sue", lastName: "Summit", jobTitle: "CEO" },
      "s-dee": {
        firstName: "Zulu",
        lastName: "Team",
        jobTitle: "VP People",
      },
      "s-ed": { firstName: "Alpha", lastName: "Team", jobTitle: "VP Ops" },
    };
    const legacy = buildGroupReportModel({
      ...legacyFixture,
      participants: legacyFixture.participants.map((participant) => ({
        ...participant,
        respondent:
          reverseProfiles[
            participant.respondentId as keyof typeof reverseProfiles
          ],
      })),
      submissions: legacyFixture.submissions.map((submission) => ({
        ...submission,
        respondent:
          reverseProfiles[
            submission.respondentId as keyof typeof reverseProfiles
          ],
      })),
    });
    expect(legacy.respondents.map((respondent) => respondent.name)).toEqual([
      "Sue Summit",
      "Alpha Team",
      "Zulu Team",
    ]);
    expect(
      legacy.scored?.appendixB?.map((row) => [
        row.personLabel,
        row.domainScores.people,
      ]),
    ).toEqual([
      ["CEO", 8],
      ["Person 1", 2],
      ["Person 2", 4],
    ]);
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

  it.each([
    {
      label: "organization ID and relation",
      overrides: { organizationId: null, organization: null },
    },
    {
      label: "organization relation",
      overrides: { organization: null },
    },
  ])("rejects a destination missing its $label before source reads", async ({ overrides }) => {
    const destination = destinationCampaign(overrides);
    const { db, assessmentSubmission } = buildDb({
      destination,
      campaigns: [destination],
    });

    await expect(
      buildScalingCeoFullSnapshot(db, actor, {
        destinationCampaignId: destination.id,
        sources: selectedSources(),
        createdAt: new Date("2026-08-27T12:00:00.000Z"),
      }),
    ).resolves.toEqual({ kind: "not-found" });
    expect(assessmentSubmission.findMany).not.toHaveBeenCalled();
  });

  it("rejects a selected source with no organization instead of freezing it", async () => {
    const ceo = sourceSubmission(0);
    const { db } = buildDb({
      submissions: [
        sourceSubmission(0, destinationCampaign(), {
          campaign: { ...ceo.campaign, organizationId: null },
        }),
        sourceSubmission(1),
        sourceSubmission(2),
      ],
    });

    await expect(
      buildScalingCeoFullSnapshot(db, actor, {
        destinationCampaignId: "campaign-destination",
        sources: selectedSources(),
        createdAt: new Date("2026-08-27T12:00:00.000Z"),
      }),
    ).resolves.toEqual({
      kind: "invalid",
      errors: [
        expect.objectContaining({
          code: "source_incompatible",
          submissionId: "submission-s-ceo",
        }),
      ],
    });
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

  it("rejects a selected source whose respondent was soft-deleted", async () => {
    const ceo = sourceSubmission(0);
    const { db } = buildDb({
      submissions: [
        {
          ...ceo,
          respondent: {
            ...ceo.respondent,
            deletedAt: new Date("2026-08-27T10:00:00.000Z"),
          },
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
          code: "source_not_completed",
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
          expect.objectContaining({
            respondentId: "summary-source:submission-s-ceo",
            isCEO: true,
          }),
          expect.objectContaining({
            respondentId: "summary-source:submission-s-dee",
            isCEO: false,
          }),
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

  it("keeps cross-campaign selections for the same canonical respondent collision-free", async () => {
    const destination = destinationCampaign();
    const historical = destinationCampaign({
      id: "campaign-historical",
      name: "Scaling Q2",
      status: "CLOSED",
    });
    const canonicalRespondentId = "respondent-shared";
    const ceoBase = sourceSubmission(0, destination);
    const teamBase = sourceSubmission(1, historical);
    const ceo = {
      ...ceoBase,
      id: "submission-current-ceo",
      respondentId: canonicalRespondentId,
      respondent: {
        ...ceoBase.respondent,
        id: canonicalRespondentId,
      },
      invitation: {
        ...ceoBase.invitation,
        respondentId: canonicalRespondentId,
      },
    };
    const team = {
      ...teamBase,
      id: "submission-historical-team",
      respondentId: canonicalRespondentId,
      respondent: {
        ...teamBase.respondent,
        id: canonicalRespondentId,
      },
      invitation: {
        ...teamBase.invitation,
        respondentId: canonicalRespondentId,
      },
    };
    const sources: SelectedSummarySource[] = [
      {
        submissionId: ceo.id,
        sourceCampaignId: destination.id,
        role: "CEO",
        position: 0,
      },
      {
        submissionId: team.id,
        sourceCampaignId: historical.id,
        role: "TEAM",
        position: 0,
      },
    ];
    const { db } = buildDb({
      destination,
      campaigns: [destination, historical],
      submissions: [ceo, team],
    });

    const result = await buildScalingCeoFullSnapshot(db, actor, {
      destinationCampaignId: destination.id,
      sources,
      createdAt: new Date("2026-08-27T12:00:00.000Z"),
    });

    expect(result.kind).toBe("ok");
    if (result.kind === "ok") {
      expect(
        result.snapshot.sources.map((source) => source.respondent.id),
      ).toEqual([canonicalRespondentId, canonicalRespondentId]);
      expect(result.snapshot.reportModel.respondents).toEqual([
        expect.objectContaining({ isCEO: true }),
        expect.objectContaining({ isCEO: false }),
      ]);
      expect(
        new Set(
          result.snapshot.reportModel.respondents.map(
            (respondent) => respondent.respondentId,
          ),
        ).size,
      ).toBe(2);
      const people = result.snapshot.reportModel.scored!.domains!.find(
        (domain) => domain.key === "people",
      );
      expect(people).toEqual(
        expect.objectContaining({ ceo: 8, teamAvg: 4, dev: 4 }),
      );
      expect(result.snapshot.reportModel.scored!.appendixB).toEqual([
        expect.objectContaining({
          personLabel: "CEO",
          domainScores: expect.objectContaining({ people: 8 }),
        }),
        expect.objectContaining({
          personLabel: "Person 1",
          domainScores: expect.objectContaining({ people: 4 }),
        }),
      ]);
    }
  });
});
