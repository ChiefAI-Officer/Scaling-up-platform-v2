import { canManageCampaign } from "@/lib/assessments/access-control";
import {
  listSummarySelfComparisonCandidates,
  listReportComparisonCandidates,
  loadSummarySelfComparison,
  loadReportComparison,
  type ReportComparisonDb,
  type ReportComparisonFocus,
  type ReportComparisonViewer,
} from "@/lib/assessments/report-comparison";

jest.mock("@/lib/assessments/access-control", () => ({
  asAccessDb: (db: unknown) => db,
  canManageCampaign: jest.fn(),
}));

const mockCanManageCampaign = canManageCampaign as jest.MockedFunction<typeof canManageCampaign>;

const operatorViewer: ReportComparisonViewer = {
  kind: "operator",
  actor: { userId: "user-1", email: "coach@example.com", role: "COACH", coachId: "coach-1" },
};
const ceoViewer = {
  kind: "ceo-self",
  focusCampaignId: "focus-campaign",
  focusSubmissionId: "focus-submission",
  respondentId: "focus-respondent",
  invitationId: "focus-invitation",
  expiresAt: 2_000_000_000,
} as ReportComparisonViewer;
const focus: ReportComparisonFocus = {
  campaignId: "focus-campaign",
  respondentId: "focus-respondent",
  submissionId: "focus-submission",
};

type RowOptions = Partial<{
  id: string;
  campaignId: string;
  respondentId: string | null;
  submittedAt: Date;
  organizationId: string;
  templateId: string;
  alias: string;
  accessMode: "INVITED" | "PUBLIC";
  campaignDeletedAt: Date | null;
  respondentDeletedAt: Date | null;
  result: unknown;
  openAt: Date;
  importManifest: unknown;
  versionId: string;
  versionNumber: number;
  questions: unknown;
}>;

const validResult = { scaleUpScore: 70, perDomain: [], perSection: [], perQuestion: [] };

function row(options: RowOptions = {}) {
  return {
    id: options.id ?? "prior-native",
    campaignId: options.campaignId ?? "prior-campaign",
    respondentId: options.respondentId ?? "prior-respondent",
    submittedAt: options.submittedAt ?? new Date("2025-01-01T00:00:00.000Z"),
    result: options.result ?? validResult,
    respondent: {
      id: options.respondentId ?? "prior-respondent",
      organizationId: options.organizationId ?? "org-1",
      normalizedEmail: "ceo@example.com",
      deletedAt: options.respondentDeletedAt ?? null,
    },
    campaign: {
      id: options.campaignId ?? "prior-campaign",
      organizationId: options.organizationId ?? "org-1",
      templateId: options.templateId ?? "template-1",
      name: "Prior assessment",
      openAt: options.openAt ?? new Date("2024-12-01T00:00:00.000Z"),
      accessMode: options.accessMode ?? "INVITED",
      deletedAt: options.campaignDeletedAt ?? null,
      importManifest: options.importManifest ?? null,
      template: { alias: options.alias ?? "scaling-up-full" },
      version: {
        id: options.versionId ?? "version-1",
        versionNumber: options.versionNumber ?? 1,
        questions: options.questions ?? [],
      },
    },
  };
}

function makeReportComparisonDbFixture(options: {
  focus?: ReportComparisonFocus;
  normalizedEmail?: string | null;
  identityRows?: Array<{
    id: string;
    organizationId: string;
    normalizedEmail: string;
    deletedAt: Date | null;
  }>;
  priorRows?: ReturnType<typeof row>[];
  canRead?: (campaignId: string) => boolean;
} = {}): ReportComparisonDb & {
  limits: number[];
  submissionQueries: Array<{ where: Record<string, unknown>; take?: number }>;
  transactions: number;
  rows: ReturnType<typeof row>[];
  ceoAccess: {
    invitation: {
      id: string;
      campaignId: string;
      respondentId: string;
      status: "SUBMITTED";
      revokedAt: Date | null;
      submission: {
        id: string;
        campaignId: string;
        respondentId: string;
        invitationId: string;
        submittedAt: Date;
      };
      campaign: {
        id: string;
        organizationId: string;
        templateId: string;
        deletedAt: Date | null;
        accessMode: "INVITED" | "PUBLIC";
        showResultsOnScreen: boolean;
        sendResultsToRespondent: boolean;
        template: { alias: string };
        organization: { id: string; deletedAt: Date | null };
      };
      respondent: {
        id: string;
        organizationId: string;
        deletedAt: Date | null;
      };
    };
    participant: {
      campaignId: string;
      respondentId: string;
      isCEO: boolean;
    } | null;
  };
  ceoInvitationQuery: jest.Mock;
  ceoParticipantQuery: jest.Mock;
} {
  const actualFocus = options.focus ?? focus;
  const focusRow = row({
    id: actualFocus.submissionId,
    campaignId: actualFocus.campaignId,
    respondentId: actualFocus.respondentId,
    submittedAt: new Date("2026-01-01T00:00:00.000Z"),
  });
  focusRow.respondent.normalizedEmail = options.normalizedEmail ?? "ceo@example.com";
  const rows = options.priorRows ?? [
    row({ id: "prior-native", campaignId: "prior-native-campaign", submittedAt: new Date("2025-02-01T00:00:00.000Z") }),
    row({ id: "prior-imported", campaignId: "prior-imported-campaign", submittedAt: new Date("2025-01-01T00:00:00.000Z"), importManifest: { round: 1 } }),
  ];
  const limits: number[] = [];
  const submissionQueries: Array<{ where: Record<string, unknown>; take?: number }> = [];
  const ceoAccess = {
    invitation: {
      id: "focus-invitation",
      campaignId: actualFocus.campaignId,
      respondentId: actualFocus.respondentId,
      status: "SUBMITTED" as const,
      revokedAt: null,
      submission: {
        id: actualFocus.submissionId,
        campaignId: actualFocus.campaignId,
        respondentId: actualFocus.respondentId,
        invitationId: "focus-invitation",
        submittedAt: focusRow.submittedAt,
      },
      campaign: {
        id: actualFocus.campaignId,
        organizationId: focusRow.campaign.organizationId,
        templateId: focusRow.campaign.templateId,
        deletedAt: null,
        accessMode: "INVITED" as const,
        showResultsOnScreen: true,
        sendResultsToRespondent: true,
        template: { alias: "scaling-up-full" },
        organization: {
          id: focusRow.campaign.organizationId,
          deletedAt: null,
        },
      },
      respondent: {
        id: actualFocus.respondentId,
        organizationId: focusRow.campaign.organizationId,
        deletedAt: null,
      },
    },
    participant: {
      campaignId: actualFocus.campaignId,
      respondentId: actualFocus.respondentId,
      isCEO: true,
    } as {
      campaignId: string;
      respondentId: string;
      isCEO: boolean;
    } | null,
  };
  const ceoInvitationQuery = jest.fn(async () => ceoAccess.invitation);
  const ceoParticipantQuery = jest.fn(async () => ceoAccess.participant);
  type Fixture = ReportComparisonDb & {
    limits: number[];
    submissionQueries: Array<{ where: Record<string, unknown>; take?: number }>;
    transactions: number;
    rows: ReturnType<typeof row>[];
    ceoAccess: typeof ceoAccess;
    ceoInvitationQuery: jest.Mock;
    ceoParticipantQuery: jest.Mock;
  };
  const fixture = {} as Fixture;
  Object.assign(fixture, {
    limits,
    submissionQueries,
    transactions: 0,
    rows,
    ceoAccess,
    ceoInvitationQuery,
    ceoParticipantQuery,
    orgRespondent: {
      findMany: jest.fn(async (args: { take?: number }) => {
        limits.push(args.take ?? -1);
        return options.identityRows ??
          [focusRow.respondent, ...rows.map((entry) => entry.respondent)];
      }),
    },
    assessmentSubmission: {
      findFirst: jest.fn(async (args: { where: { id?: string } }) => {
        const id = args.where.id;
        return [focusRow, ...rows].find((entry) => entry.id === id) ?? null;
      }),
      findMany: jest.fn(async (args: { where: Record<string, unknown>; take?: number }) => {
        submissionQueries.push(args);
        limits.push(args.take ?? -1);
        let selected = rows;
        const submittedAt = args.where.submittedAt as { lt?: Date } | undefined;
        if (submittedAt?.lt) {
          selected = selected.filter((entry) => entry.submittedAt < submittedAt.lt!);
        }
        const campaignId = args.where.campaignId as { not?: string } | undefined;
        if (campaignId?.not) {
          selected = selected.filter((entry) => entry.campaignId !== campaignId.not);
        }
        return selected.slice(0, args.take);
      }),
    },
    assessmentInvitation: {
      findFirst: ceoInvitationQuery,
    },
    assessmentCampaignParticipant: {
      findFirst: ceoParticipantQuery,
    },
    $transaction: jest.fn(async <T>(callback: (tx: ReportComparisonDb) => Promise<T>): Promise<T> => {
      fixture.transactions += 1;
      return callback(fixture);
    }),
  });
  mockCanManageCampaign.mockImplementation(async (_db, _actor, campaignId) =>
    options.canRead?.(campaignId) ?? true,
  );
  return fixture;
}

beforeEach(() => {
  process.env.WAVE_RC_REPORT_COMPARISON_ENABLED = "1";
  delete process.env.WAVE_RC_REPORT_COMPARISON_KILL;
  mockCanManageCampaign.mockReset();
});

afterEach(() => {
  delete process.env.WAVE_RC_REPORT_COMPARISON_ENABLED;
});

describe("listReportComparisonCandidates", () => {
  it("returns native and imported earlier reports for one same-org identity", async () => {
    const db = makeReportComparisonDbFixture();

    await expect(listReportComparisonCandidates(db, operatorViewer, focus)).resolves.toMatchObject({
      kind: "ok",
      candidates: [
        { submissionId: "prior-native" },
        { submissionId: "prior-imported", isImported: true },
      ],
      bounded: false,
    });
  });

  it("defensively excludes cross-org, public, deleted, malformed, other-template, focus, and later rows", async () => {
    const db = makeReportComparisonDbFixture({ priorRows: [
      row({ id: "valid", submittedAt: new Date("2025-12-31T00:00:00.000Z") }),
      row({ id: "cross-org", organizationId: "org-2" }),
      row({ id: "public", accessMode: "PUBLIC" }),
      row({ id: "deleted-campaign", campaignDeletedAt: new Date() }),
      row({ id: "deleted-respondent", respondentDeletedAt: new Date() }),
      row({ id: "bad-result", result: { perQuestion: [] } }),
      row({ id: "other-template", templateId: "template-2" }),
      row({ id: focus.submissionId, campaignId: focus.campaignId }),
      row({ id: "later", submittedAt: new Date("2026-01-02T00:00:00.000Z") }),
    ] });

    await expect(listReportComparisonCandidates(db, operatorViewer, focus)).resolves.toEqual({
      kind: "ok", candidates: [expect.objectContaining({ submissionId: "valid" })], bounded: false,
    });
  });

  it("falls back to the exact respondent id when the focus has no normalized email", async () => {
    const db = makeReportComparisonDbFixture({
      normalizedEmail: null,
      priorRows: [
        row({ id: "same-id", respondentId: focus.respondentId }),
        row({ id: "same-email-not-id", respondentId: "other-respondent" }),
      ],
    });

    await expect(listReportComparisonCandidates(db, operatorViewer, focus)).resolves.toMatchObject({
      candidates: [{ submissionId: "same-id" }],
    });
  });

  it("uses exact 50/200/12 limits, newest-first ordering, and deterministic one-per-campaign collapse", async () => {
    const manyRows = Array.from({ length: 14 }, (_, index) => row({
      id: `submission-${index}`,
      campaignId: `campaign-${index}`,
      submittedAt: new Date(2025, 0, index + 1),
    }));
    manyRows.push(row({ id: "same-campaign-older", campaignId: "campaign-13", submittedAt: new Date("2024-01-01") }));
    const db = makeReportComparisonDbFixture({ priorRows: manyRows });

    const outcome = await listReportComparisonCandidates(db, operatorViewer, focus);

    expect(db.limits).toEqual([50, 200]);
    expect(outcome).toMatchObject({ kind: "ok", bounded: true });
    if (outcome.kind === "ok") {
      expect(outcome.candidates).toHaveLength(12);
      expect(outcome.candidates.map((candidate) => candidate.submissionId)).toEqual(
        ["submission-13", "submission-12", "submission-11", "submission-10", "submission-9", "submission-8", "submission-7", "submission-6", "submission-5", "submission-4", "submission-3", "submission-2"],
      );
    }
  });

  it("marks the result bounded when the 200-row inspection cap is reached before campaign collapse", async () => {
    const cappedRows = Array.from({ length: 200 }, (_, index) => row({
      id: `same-campaign-${index}`,
      campaignId: "one-prior-campaign",
      submittedAt: new Date(2025, 0, 1, 0, index),
    }));
    const db = makeReportComparisonDbFixture({ priorRows: cappedRows });

    await expect(
      listReportComparisonCandidates(db, operatorViewer, focus),
    ).resolves.toMatchObject({
      kind: "ok",
      candidates: [expect.objectContaining({ campaignId: "one-prior-campaign" })],
      bounded: true,
    });
  });

  it("marks the result bounded when the 50-identity lookup cap is saturated", async () => {
    const identityRows = Array.from({ length: 50 }, (_, index) => ({
      id: index === 0 ? focus.respondentId : `same-email-${index}`,
      organizationId: "org-1",
      normalizedEmail: "ceo@example.com",
      deletedAt: null,
    }));
    const db = makeReportComparisonDbFixture({ identityRows });

    await expect(
      listReportComparisonCandidates(db, operatorViewer, focus),
    ).resolves.toMatchObject({
      kind: "ok",
      bounded: true,
    });
  });

  it.each([
    ["globally off", { enabled: "0", kill: undefined }],
    ["killed", { enabled: "1", kill: "1" }],
  ])("performs zero reads when the rollout is %s", async (_label, flags) => {
    process.env.WAVE_RC_REPORT_COMPARISON_ENABLED = flags.enabled;
    if (flags.kill) process.env.WAVE_RC_REPORT_COMPARISON_KILL = flags.kill;
    else delete process.env.WAVE_RC_REPORT_COMPARISON_KILL;
    const db = makeReportComparisonDbFixture();

    await expect(
      listReportComparisonCandidates(db, operatorViewer, focus),
    ).resolves.toEqual({ kind: "not-applicable" });

    expect(db.assessmentSubmission.findFirst).not.toHaveBeenCalled();
    expect(db.assessmentSubmission.findMany).not.toHaveBeenCalled();
    expect(db.orgRespondent.findMany).not.toHaveBeenCalled();
  });

  it("applies chronology and focus-campaign eligibility before the 200-row inspection cap", async () => {
    const laterRows = Array.from({ length: 200 }, (_, index) => row({
      id: `later-${index}`,
      campaignId: `later-campaign-${index}`,
      submittedAt: new Date("2026-02-01T00:00:00.000Z"),
    }));
    const db = makeReportComparisonDbFixture({
      priorRows: [
        ...laterRows,
        row({ id: "eligible-prior", campaignId: "eligible-prior-campaign" }),
      ],
    });

    await expect(listReportComparisonCandidates(db, operatorViewer, focus)).resolves.toMatchObject({
      kind: "ok",
      candidates: [{ submissionId: "eligible-prior" }],
    });
    expect(db.submissionQueries[0]?.where).toMatchObject({
      submittedAt: { lt: new Date("2026-01-01T00:00:00.000Z") },
      campaignId: { not: focus.campaignId },
    });
  });

  it("denies operator candidate discovery before history reads when the focus campaign is unauthorized", async () => {
    const db = makeReportComparisonDbFixture({
      canRead: (campaignId) => campaignId !== focus.campaignId,
    });

    await expect(listReportComparisonCandidates(db, operatorViewer, focus)).resolves.toEqual({
      kind: "unavailable",
    });
    expect(mockCanManageCampaign.mock.calls.map((call) => call[2])).toEqual([focus.campaignId]);
    expect(db.submissionQueries).toHaveLength(0);
  });

  it("rejects a cross-tenant focus respondent before CEO same-person discovery", async () => {
    const db = makeReportComparisonDbFixture({
      priorRows: [row({ id: "prior-native", campaignId: "prior-native-campaign" })],
    });
    const focusRow = await db.assessmentSubmission.findFirst({ where: { id: focus.submissionId } });
    if (!focusRow?.respondent) throw new Error("fixture focus respondent missing");
    focusRow.respondent.organizationId = "other-org";

    await expect(listReportComparisonCandidates(db, ceoViewer, focus)).resolves.toEqual({
      kind: "not-applicable",
    });
    expect(db.submissionQueries).toHaveLength(0);
    expect(mockCanManageCampaign).not.toHaveBeenCalled();
  });

  it("revalidates the live CEO grant before reading candidate history", async () => {
    const db = makeReportComparisonDbFixture();
    db.ceoAccess.invitation.revokedAt = new Date("2026-01-02T00:00:00.000Z");

    await expect(listReportComparisonCandidates(db, ceoViewer, focus)).resolves.toEqual({
      kind: "unavailable",
    });
    expect(db.transactions).toBe(1);
    expect(db.ceoInvitationQuery).toHaveBeenCalledTimes(1);
    expect(db.submissionQueries).toHaveLength(0);
    expect(mockCanManageCampaign).not.toHaveBeenCalled();
  });

  it("checks every operator candidate independently and never gives the CEO an operator bypass", async () => {
    const db = makeReportComparisonDbFixture({ canRead: (campaignId) => campaignId !== "prior-imported-campaign" });

    await expect(listReportComparisonCandidates(db, operatorViewer, focus)).resolves.toMatchObject({
      candidates: [{ submissionId: "prior-native" }],
    });
    expect(mockCanManageCampaign.mock.calls.map((call) => call[2])).toEqual([
      "focus-campaign", "prior-native-campaign", "prior-imported-campaign",
    ]);

    mockCanManageCampaign.mockClear();
    await expect(listReportComparisonCandidates(db, ceoViewer, focus)).resolves.toMatchObject({ kind: "ok" });
    expect(mockCanManageCampaign).not.toHaveBeenCalled();
  });
});

describe("loadReportComparison", () => {
  it.each([
    ["globally off", { enabled: "0", kill: undefined }],
    ["killed", { enabled: "1", kill: "1" }],
  ])("performs zero reads when the rollout is %s", async (_label, flags) => {
    process.env.WAVE_RC_REPORT_COMPARISON_ENABLED = flags.enabled;
    if (flags.kill) process.env.WAVE_RC_REPORT_COMPARISON_KILL = flags.kill;
    else delete process.env.WAVE_RC_REPORT_COMPARISON_KILL;
    const db = makeReportComparisonDbFixture();

    await expect(
      loadReportComparison(db, operatorViewer, focus, "prior-native"),
    ).resolves.toEqual({ kind: "invalid" });

    expect(db.$transaction).not.toHaveBeenCalled();
    expect(db.assessmentSubmission.findFirst).not.toHaveBeenCalled();
    expect(db.assessmentSubmission.findMany).not.toHaveBeenCalled();
    expect(db.orgRespondent.findMany).not.toHaveBeenCalled();
  });

  it("authorizes and reloads the selected baseline inside one transaction", async () => {
    const db = makeReportComparisonDbFixture();

    const outcome = await loadReportComparison(db, operatorViewer, focus, "prior-native");

    expect(outcome.kind).toBe("ok");
    expect(db.transactions).toBe(1);
    expect(mockCanManageCampaign.mock.calls.map((call) => call[2])).toEqual([
      "focus-campaign", "prior-native-campaign",
    ]);
  });

  it.each([
    ["missing", "unknown"],
    ["forbidden", "prior-imported"],
    ["deleted", "prior-native"],
  ])("returns one generic invalid outcome when a selected baseline is %s", async (_case, baselineId) => {
    const db = makeReportComparisonDbFixture({
      canRead: (campaignId) => campaignId !== "prior-imported-campaign",
      priorRows: baselineId === "prior-native"
        ? [row({ id: "prior-native", campaignDeletedAt: new Date() })]
        : undefined,
    });

    await expect(loadReportComparison(db, operatorViewer, focus, baselineId)).resolves.toEqual({ kind: "invalid" });
  });

  it("requires the CEO viewer's exact focus binding and person identity", async () => {
    const db = makeReportComparisonDbFixture();

    await expect(loadReportComparison(db, { ...ceoViewer, focusSubmissionId: "other" }, focus, "prior-native")).resolves.toEqual({ kind: "invalid" });
    await expect(loadReportComparison(db, ceoViewer, focus, "prior-native")).resolves.toMatchObject({ kind: "ok" });
    expect(mockCanManageCampaign).not.toHaveBeenCalled();
  });

  it("revalidates the live CEO capability inside the selected-baseline transaction", async () => {
    const db = makeReportComparisonDbFixture();

    await expect(
      loadReportComparison(db, ceoViewer, focus, "prior-native"),
    ).resolves.toMatchObject({ kind: "ok" });

    expect(db.transactions).toBe(1);
    expect(db.ceoInvitationQuery).toHaveBeenCalledTimes(1);
    expect(db.ceoParticipantQuery).toHaveBeenCalledTimes(1);
  });

  it("returns one generic invalid outcome for every revoked CEO capability fact", async () => {
    const cases: Array<{
      name: string;
      mutate: (
        db: ReturnType<typeof makeReportComparisonDbFixture>,
      ) => ReportComparisonViewer;
    }> = [
      {
        name: "invitation binding",
        mutate: () => ({ ...ceoViewer, invitationId: "other-invitation" } as ReportComparisonViewer),
      },
      {
        name: "expiry",
        mutate: () => ({ ...ceoViewer, expiresAt: 1 } as ReportComparisonViewer),
      },
      {
        name: "CEO designation",
        mutate: (db) => {
          if (db.ceoAccess.participant) db.ceoAccess.participant.isCEO = false;
          return ceoViewer;
        },
      },
      {
        name: "campaign liveness",
        mutate: (db) => {
          db.ceoAccess.invitation.campaign.deletedAt = new Date();
          return ceoViewer;
        },
      },
      {
        name: "respondent liveness",
        mutate: (db) => {
          db.ceoAccess.invitation.respondent.deletedAt = new Date();
          return ceoViewer;
        },
      },
      {
        name: "organization tenant liveness",
        mutate: (db) => {
          db.ceoAccess.invitation.campaign.organization.deletedAt = new Date();
          return ceoViewer;
        },
      },
      {
        name: "tenant binding",
        mutate: (db) => {
          db.ceoAccess.invitation.respondent.organizationId = "other-org";
          return ceoViewer;
        },
      },
      {
        name: "disclosure",
        mutate: (db) => {
          db.ceoAccess.invitation.campaign.showResultsOnScreen = false;
          db.ceoAccess.invitation.campaign.sendResultsToRespondent = false;
          return ceoViewer;
        },
      },
      {
        name: "invited mode",
        mutate: (db) => {
          db.ceoAccess.invitation.campaign.accessMode = "PUBLIC";
          return ceoViewer;
        },
      },
      {
        name: "Scaling Up Full alias",
        mutate: (db) => {
          db.ceoAccess.invitation.campaign.template.alias = "rockefeller";
          return ceoViewer;
        },
      },
    ];

    for (const scenario of cases) {
      const db = makeReportComparisonDbFixture();
      const viewer = scenario.mutate(db);
      await expect(
        loadReportComparison(db, viewer, focus, "prior-native"),
      ).resolves.toEqual({ kind: "invalid" });
    }

    const killedDb = makeReportComparisonDbFixture();
    process.env.WAVE_RC_REPORT_COMPARISON_KILL = "1";
    await expect(
      loadReportComparison(killedDb, ceoViewer, focus, "prior-native"),
    ).resolves.toEqual({ kind: "invalid" });
    delete process.env.WAVE_RC_REPORT_COMPARISON_KILL;
  });
});

describe("Summary Self Comparison adapter", () => {
  const strictQuestions = () => Array.from({ length: 61 }, (_, index) => ({
    stableKey: `Q${String(index + 1).padStart(2, "0")}`,
    label: `Question ${index + 1}`,
    type: "SLIDER_LIKERT",
    scale: { min: 0, max: 10 },
  }));
  const strictResult = (value: number) => ({
    scaleUpScore: value * 10,
    perDomain: [],
    perSection: [
      "S_PEOPLE_YE", "S_PEOPLE_CC", "S_STRATEGY", "S_EXEC_LT", "S_EXEC_OP",
      "S_EXEC_SM", "S_EXEC_SIT", "S_CASH", "S_YOU_LEAD", "S_YOU_IC",
    ].map((stableKey) => ({ stableKey, averagePoints: value })),
    perQuestion: Array.from({ length: 61 }, (_, index) => ({
      stableKey: `Q${String(index + 1).padStart(2, "0")}`,
      value,
    })),
  });

  beforeEach(() => {
    delete process.env.WAVE_RC_REPORT_COMPARISON_ENABLED;
    delete process.env.WAVE_RC_REPORT_COMPARISON_KILL;
  });

  it("lists and loads the same person's earlier report without Wave RC rollout ownership", async () => {
    const db = makeReportComparisonDbFixture();
    const questions = strictQuestions();
    const focusRow = await db.assessmentSubmission.findFirst({ where: { id: focus.submissionId } });
    if (!focusRow) throw new Error("fixture focus missing");
    focusRow.campaign.version.questions = questions;
    focusRow.result = strictResult(6);
    for (const earlier of db.rows) {
      earlier.campaign.version.questions = questions;
      earlier.result = strictResult(5);
    }

    await expect(
      listSummarySelfComparisonCandidates(db, operatorViewer, focus),
    ).resolves.toMatchObject({
      kind: "ok",
      candidates: [
        {
          submissionId: "prior-native",
          campaignLabel: "Prior assessment",
          versionNumber: 1,
          isImported: false,
        },
        { submissionId: "prior-imported", isImported: true },
      ],
    });
    await expect(
      loadSummarySelfComparison(db, operatorViewer, focus, "prior-native"),
    ).resolves.toMatchObject({ kind: "ok" });
  });

  it("filters strict compatibility before applying the 12-candidate presentation bound", async () => {
    const priorRows = Array.from({ length: 13 }, (_, index) => row({
      id: `prior-${index + 1}`,
      campaignId: `prior-campaign-${index + 1}`,
      respondentId: `prior-respondent-${index + 1}`,
      submittedAt: new Date(Date.UTC(2025, 11, 13 - index)),
      questions: strictQuestions(),
      result: index === 12 ? strictResult(5) : validResult,
    }));
    const db = makeReportComparisonDbFixture({ priorRows });
    const focusRow = await db.assessmentSubmission.findFirst({ where: { id: focus.submissionId } });
    if (!focusRow) throw new Error("fixture focus missing");
    focusRow.campaign.version.questions = strictQuestions();
    focusRow.result = strictResult(6);

    await expect(listSummarySelfComparisonCandidates(db, operatorViewer, focus)).resolves.toMatchObject({
      kind: "ok",
      candidates: [{ submissionId: "prior-13" }],
    });
  });

  it("rejects a 61-question pair whose Slider scale is not exactly 0-10", async () => {
    const questions = Array.from({ length: 61 }, (_, index) => ({
      stableKey: `Q${String(index + 1).padStart(2, "0")}`,
      label: `Question ${index + 1}`,
      type: "SLIDER_LIKERT",
      scale: { min: 1, max: 5 },
    }));
    const db = makeReportComparisonDbFixture({ priorRows: [row({ id: "prior-native", questions })] });
    const focusRow = await db.assessmentSubmission.findFirst({ where: { id: focus.submissionId } });
    if (!focusRow) throw new Error("fixture focus missing");
    focusRow.campaign.version.questions = questions;
    focusRow.result = strictResult(6);
    db.rows[0].result = strictResult(5);

    await expect(loadSummarySelfComparison(db, operatorViewer, focus, "prior-native")).resolves.toEqual({ kind: "invalid" });
  });

  it("keeps Wave RC unavailable while its rollout is off", async () => {
    const db = makeReportComparisonDbFixture();

    await expect(listReportComparisonCandidates(db, operatorViewer, focus)).resolves.toEqual({
      kind: "not-applicable",
    });
    await expect(loadReportComparison(db, operatorViewer, focus, "prior-native")).resolves.toEqual({
      kind: "invalid",
    });
  });

  it.each([
    ["a different person", row({ id: "prior-native", respondentId: "stranger" })],
    ["a later submission", row({ id: "prior-native", submittedAt: new Date("2026-02-01T00:00:00.000Z") })],
  ])("rejects %s", async (_case, earlier) => {
    const db = makeReportComparisonDbFixture({
      priorRows: [earlier],
      identityRows: [{
        id: focus.respondentId,
        organizationId: "org-1",
        normalizedEmail: "ceo@example.com",
        deletedAt: null,
      }],
    });

    await expect(
      loadSummarySelfComparison(db, operatorViewer, focus, "prior-native"),
    ).resolves.toEqual({ kind: "invalid" });
  });

  it("rejects an earlier campaign the operator cannot read", async () => {
    const db = makeReportComparisonDbFixture({
      canRead: (campaignId) => campaignId !== "prior-native-campaign",
    });

    await expect(
      loadSummarySelfComparison(db, operatorViewer, focus, "prior-native"),
    ).resolves.toEqual({ kind: "invalid" });
  });
});
