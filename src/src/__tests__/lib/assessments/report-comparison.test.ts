import { canManageCampaign } from "@/lib/assessments/access-control";
import {
  listReportComparisonCandidates,
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
const ceoViewer: ReportComparisonViewer = {
  kind: "ceo-self",
  focusCampaignId: "focus-campaign",
  focusSubmissionId: "focus-submission",
  respondentId: "focus-respondent",
};
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
  priorRows?: ReturnType<typeof row>[];
  canRead?: (campaignId: string) => boolean;
} = {}): ReportComparisonDb & {
  limits: number[];
  submissionQueries: Array<{ where: Record<string, unknown>; take?: number }>;
  transactions: number;
  rows: ReturnType<typeof row>[];
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
  type Fixture = ReportComparisonDb & {
    limits: number[];
    submissionQueries: Array<{ where: Record<string, unknown>; take?: number }>;
    transactions: number;
    rows: ReturnType<typeof row>[];
  };
  const fixture = {} as Fixture;
  Object.assign(fixture, {
    limits,
    submissionQueries,
    transactions: 0,
    rows,
    orgRespondent: {
      findMany: jest.fn(async (args: { take?: number }) => {
        limits.push(args.take ?? -1);
        return [focusRow.respondent, ...rows.map((entry) => entry.respondent)];
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
});
