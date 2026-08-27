import snapshotFixture from "@/__tests__/fixtures/summary-reports/scaling-ceo-full-snapshot.json";
import type { Prisma, PrismaClient } from "@prisma/client";
import type { ApiActor } from "@/lib/auth/access-control";
import type { StoredSummaryArtifact } from "@/lib/assessments/summary-reports/artifact-store";
import type {
  ScalingCeoFullSnapshot,
  SelectedSummarySource,
} from "@/lib/assessments/summary-reports/canonical";
import type { SummaryReportSnapshotDb } from "@/lib/assessments/summary-reports/scaling-ceo-full-snapshot";

jest.mock("@vercel/blob", () => ({
  put: jest.fn(),
  get: jest.fn(),
  del: jest.fn(),
}));
jest.mock("@/lib/assessments/summary-reports/renderers", () => ({
  renderSummaryReportPdf: jest.fn(),
}));

import {
  createPrismaSummaryReportCreateDb,
  createPrismaSummaryReportCreateTransaction,
  createSummaryReport,
  type CreateSummaryReportCommand,
  type SummaryReportCreateDb,
  type SummaryReportCreateTransaction,
  type SummaryReportListItem,
  type SummaryReportOperationalError,
} from "@/lib/assessments/summary-reports/create";

const productionAdapterContract: (
  client: PrismaClient,
) => SummaryReportCreateDb = createPrismaSummaryReportCreateDb;
const transactionAdapterContract: (
  client: Prisma.TransactionClient,
) => SummaryReportCreateTransaction =
  createPrismaSummaryReportCreateTransaction;

const actor: ApiActor = {
  userId: "user-admin-1",
  email: "admin@example.com",
  role: "ADMIN",
  coachId: null,
};

const snapshot = snapshotFixture as unknown as ScalingCeoFullSnapshot;
const requestId = "11111111-1111-4111-8111-111111111111";
const createdAt = new Date("2026-08-27T04:30:00.000Z");
const bytes = Buffer.from("%PDF-1.7 deterministic summary");
const artifact: StoredSummaryArtifact = {
  path: `summary-reports/campaign-destination/${requestId}-${"a".repeat(30)}.pdf`,
  sha256: "artifact-sha-256",
  sizeBytes: bytes.byteLength,
  createdAt,
};
const sources: SelectedSummarySource[] = [
  {
    submissionId: "fixture-submission-ceo",
    sourceCampaignId: "campaign-destination",
    role: "CEO",
    position: 0,
  },
  {
    submissionId: "fixture-submission-team",
    sourceCampaignId: "campaign-historical",
    role: "TEAM",
    position: 0,
  },
];
const command: CreateSummaryReportCommand = {
  destinationCampaignId: "campaign-destination",
  reportType: "SCALING_CEO_FULL",
  creationRequestId: requestId,
  sources,
};

function report(
  overrides: Partial<SummaryReportListItem> = {},
): SummaryReportListItem {
  return {
    id: "summary-report-1",
    campaignId: command.destinationCampaignId,
    reportType: "SCALING_CEO_FULL",
    name: "Scaling Q3",
    createdByUserId: actor.userId,
    createdByEmailSnapshot: actor.email,
    createdAt,
    ...overrides,
  };
}

interface HarnessOptions {
  existingRows?: Array<SummaryReportListItem | null>;
  findErrors?: Array<unknown | null>;
  snapshotResults?: Array<
    | { kind: "ok"; snapshot: ScalingCeoFullSnapshot; inputHash: string }
    | {
        kind: "invalid";
        errors: Array<{ code: string; message: string; submissionId?: string }>;
      }
    | { kind: "not-found" }
  >;
  renderError?: Error;
  uploadError?: Error;
  persistError?: unknown;
  deleteError?: Error;
  authorized?: boolean | boolean[];
  beforeFindReturn?: () => Promise<void>;
  loggerThrows?: boolean;
}

function harness(options: HarnessOptions = {}) {
  const calls = {
    find: 0,
    transactions: [] as Array<{ isolationLevel: "RepeatableRead" }>,
    transactionClients: [] as SummaryReportCreateTransaction[],
    build: [] as unknown[],
    buildInputs: [] as Array<{
      actor: ApiActor;
      input: {
        destinationCampaignId: string;
        sources: readonly SelectedSummarySource[];
        createdAt: Date;
      };
    }>,
    render: [] as ScalingCeoFullSnapshot[],
    put: [] as unknown[],
    deleted: [] as string[],
    reportCreate: [] as Array<Record<string, unknown>>,
    sourceCreateMany: [] as Array<Record<string, unknown>>,
    auditCreate: [] as Array<Record<string, unknown>>,
    authorized: [] as string[],
    operationalErrors: [] as SummaryReportOperationalError[],
  };
  const existingRows = options.existingRows ?? [null];
  const snapshotResults = options.snapshotResults ?? [
    { kind: "ok" as const, snapshot, inputHash: "input-sha-256" },
    { kind: "ok" as const, snapshot, inputHash: "input-sha-256" },
  ];
  const authResults = Array.isArray(options.authorized)
    ? [...options.authorized]
    : [options.authorized ?? true];

  const snapshotDb = {
    accessGroupCoach: { findMany: jest.fn(async () => []) },
    accessGroupTemplate: { findMany: jest.fn(async () => []) },
    organization: { findUnique: jest.fn(async () => null) },
    coach: { findUnique: jest.fn(async () => null) },
    assessmentCampaign: {
      findFirst: jest.fn(async () => null),
    },
    assessmentSubmission: { findMany: jest.fn(async () => []) },
  } satisfies SummaryReportSnapshotDb;
  const tx = {
    snapshotDb,
    createReport: jest.fn(
      async (data: Prisma.SummaryReportUncheckedCreateInput) => {
        calls.reportCreate.push(data);
        if (options.persistError) throw options.persistError;
        return report();
      },
    ),
    createSources: jest.fn(
      async (data: Prisma.SummaryReportSourceCreateManyInput[]) => {
        calls.sourceCreateMany.push(...data);
      },
    ),
    createAudit: jest.fn(async (data: Prisma.AuditLogUncheckedCreateInput) => {
      calls.auditCreate.push(data);
    }),
  } satisfies SummaryReportCreateTransaction;
  const db = {
    accessDb: snapshotDb,
    findByCreationRequestId: jest.fn(async () => {
      const index = calls.find++;
      await options.beforeFindReturn?.();
      const findError = options.findErrors?.[index];
      if (findError) throw findError;
      return existingRows[Math.min(index, existingRows.length - 1)] ?? null;
    }),
    repeatableRead: jest.fn(
      async <T>(callback: (client: typeof tx) => Promise<T>) => {
        calls.transactions.push({ isolationLevel: "RepeatableRead" });
        const transactionClient = {
          ...tx,
          ordinal: calls.transactions.length,
        };
        calls.transactionClients.push(transactionClient);
        return callback(transactionClient);
      },
    ),
  } satisfies SummaryReportCreateDb;
  const store = {
    putPdf: jest.fn(async (input: unknown) => {
      calls.put.push(input);
      if (options.uploadError) throw options.uploadError;
      return artifact;
    }),
    getPdf: jest.fn(),
    delete: jest.fn(async (path: string) => {
      calls.deleted.push(path);
      if (options.deleteError) throw options.deleteError;
    }),
  };
  const buildSnapshot = jest.fn(
    async (
      client: unknown,
      inputActor: ApiActor,
      input: {
        destinationCampaignId: string;
        sources: readonly SelectedSummarySource[];
        createdAt: Date;
      },
    ) => {
      calls.build.push(client);
      calls.buildInputs.push({ actor: inputActor, input });
      const index = calls.build.length - 1;
      return snapshotResults[Math.min(index, snapshotResults.length - 1)];
    },
  );
  const renderPdf = jest.fn(async (_reportType, inputSnapshot) => {
    calls.render.push(inputSnapshot);
    if (options.renderError) throw options.renderError;
    return { bytes, rendererVersion: "scaling-ceo-full-pdf-v1" };
  });
  const canViewCampaign = jest.fn(async (_db, _actor, campaignId: string) => {
    calls.authorized.push(campaignId);
    return authResults.shift() ?? authResults.at(-1) ?? true;
  });
  const logOperationalError = jest.fn(
    (event: SummaryReportOperationalError) => {
      calls.operationalErrors.push(event);
      if (options.loggerThrows) throw new Error("logging sink unavailable");
    },
  );

  return {
    db,
    store,
    calls,
    dependencies: {
      artifactStore: store,
      buildSnapshot,
      renderPdf,
      canViewCampaign,
      now: () => createdAt,
      logOperationalError,
    },
  };
}

function p2002(target: string | string[]): {
  code: "P2002";
  meta: { target: string | string[] };
} {
  return { code: "P2002", meta: { target } };
}

describe("createSummaryReport", () => {
  it("accepts the generated Prisma client through an explicit typed adapter", () => {
    expect(productionAdapterContract).toBe(createPrismaSummaryReportCreateDb);
    expect(transactionAdapterContract).toBe(
      createPrismaSummaryReportCreateTransaction,
    );
  });

  it("rejects a malformed UUID before any database or rendering work", async () => {
    const test = harness();

    await expect(
      createSummaryReport(
        test.db,
        actor,
        { ...command, creationRequestId: "nope" },
        test.dependencies,
      ),
    ).resolves.toEqual({
      kind: "invalid",
      errors: [
        {
          code: "invalid_creation_request_id",
          message: "Creation request ID must be a UUID.",
        },
      ],
    });

    expect(test.calls.find).toBe(0);
    expect(test.calls.transactions).toHaveLength(0);
    expect(test.calls.build).toHaveLength(0);
    expect(test.calls.render).toHaveLength(0);
  });

  it("rejects more than 200 selected sources before database work", async () => {
    const test = harness();
    const oversized = Array.from({ length: 201 }, (_, position) => ({
      submissionId: `submission-${position}`,
      sourceCampaignId: "campaign-destination",
      role: position === 0 ? ("CEO" as const) : ("TEAM" as const),
      position: position === 0 ? 0 : position - 1,
    }));

    const result = await createSummaryReport(
      test.db,
      actor,
      { ...command, sources: oversized },
      test.dependencies,
    );

    expect(result).toEqual({
      kind: "invalid",
      errors: [
        {
          code: "too_many_sources",
          message: "Select no more than 200 sources.",
        },
      ],
    });
    expect(test.calls.find).toBe(0);
    expect(test.calls.transactions).toHaveLength(0);
  });

  it("captures actor, command, and every source before a deferred fast-path await", async () => {
    let releaseFind!: () => void;
    const findGate = new Promise<void>((resolve) => {
      releaseFind = resolve;
    });
    const test = harness({ beforeFindReturn: () => findGate });
    const mutableActor = { ...actor };
    const originalSources = sources.map((source) => ({ ...source }));
    const mutableCommand: CreateSummaryReportCommand = {
      ...command,
      sources: originalSources.map((source) => ({ ...source })),
    };

    const pending = createSummaryReport(
      test.db,
      mutableActor,
      mutableCommand,
      test.dependencies,
    );
    mutableActor.userId = "mutated-user";
    mutableActor.email = "mutated@example.com";
    mutableCommand.destinationCampaignId = "mutated-campaign";
    mutableCommand.creationRequestId = "not-a-uuid-anymore";
    mutableCommand.sources[0]!.submissionId = "mutated-submission";
    mutableCommand.sources.push({
      submissionId: "late-source",
      sourceCampaignId: "mutated-campaign",
      role: "TEAM",
      position: 99,
    });
    releaseFind();

    await expect(pending).resolves.toEqual({
      kind: "created",
      report: report(),
    });

    const capturedInput = {
      destinationCampaignId: command.destinationCampaignId,
      sources: originalSources,
      createdAt,
    };
    expect(test.calls.buildInputs).toEqual([
      { actor, input: capturedInput },
      { actor, input: capturedInput },
    ]);
    expect(test.calls.put).toEqual([
      {
        campaignId: command.destinationCampaignId,
        creationRequestId: requestId,
        bytes,
        createdAt,
      },
    ]);
    expect(test.calls.reportCreate[0]).toMatchObject({
      campaignId: command.destinationCampaignId,
      createdByUserId: actor.userId,
      createdByEmailSnapshot: actor.email,
      creationRequestId: requestId,
    });
    expect(test.calls.auditCreate[0]).toMatchObject({
      entityId: "summary-report-1",
      performedBy: actor.userId,
    });
    expect(
      JSON.parse(String(test.calls.auditCreate[0]?.changes)),
    ).toMatchObject({ campaignId: command.destinationCampaignId });
  });

  it("creates one immutable report, ordered sources, and safe audit in two repeatable-read transactions", async () => {
    const test = harness();

    const result = await createSummaryReport(
      test.db,
      actor,
      command,
      test.dependencies,
    );

    expect(result).toEqual({ kind: "created", report: report() });
    expect(test.calls.transactions).toEqual([
      { isolationLevel: "RepeatableRead" },
      { isolationLevel: "RepeatableRead" },
    ]);
    expect(test.calls.build).toEqual(
      test.calls.transactionClients.map((client) => client.snapshotDb),
    );
    expect(test.calls.buildInputs).toEqual([
      {
        actor,
        input: {
          destinationCampaignId: command.destinationCampaignId,
          sources: command.sources,
          createdAt,
        },
      },
      {
        actor,
        input: {
          destinationCampaignId: command.destinationCampaignId,
          sources: command.sources,
          createdAt,
        },
      },
    ]);
    expect(test.calls.render).toEqual([snapshot]);
    expect(test.calls.put).toEqual([
      {
        campaignId: command.destinationCampaignId,
        creationRequestId: requestId,
        bytes,
        createdAt,
      },
    ]);
    expect(test.calls.reportCreate).toEqual([
      {
        campaignId: "campaign-destination",
        reportType: "SCALING_CEO_FULL",
        name: snapshot.destination.campaignName,
        templateId: snapshot.destination.templateId,
        versionId: snapshot.destination.versionId,
        language: snapshot.destination.language,
        createdByUserId: actor.userId,
        createdByEmailSnapshot: actor.email,
        createdAt,
        rendererVersion: "scaling-ceo-full-pdf-v1",
        inputSnapshot: snapshot,
        inputHash: "input-sha-256",
        creationRequestId: requestId,
        artifactPath: artifact.path,
        artifactSha256: artifact.sha256,
        artifactSizeBytes: artifact.sizeBytes,
        artifactCreatedAt: artifact.createdAt,
      },
    ]);
    expect(test.calls.sourceCreateMany).toEqual(
      snapshot.sources.map((source) => ({
        summaryReportId: "summary-report-1",
        submissionId: source.submissionId,
        role: source.role,
        position: source.position,
        respondentSnapshot: {
          respondentId: source.respondent.id,
          displayName: source.respondent.displayName,
          jobTitle: source.respondent.jobTitle,
          sourceCampaignId: source.sourceCampaignId,
          submittedAt: source.submittedAt,
        },
      })),
    );
    expect(test.calls.auditCreate).toHaveLength(1);
    const audit = test.calls.auditCreate[0];
    expect(audit).toMatchObject({
      entityType: "SummaryReport",
      entityId: "summary-report-1",
      action: "SUMMARY_REPORT_CREATE",
      performedBy: actor.userId,
    });
    expect(JSON.parse(String(audit.changes))).toEqual({
      reportId: "summary-report-1",
      campaignId: command.destinationCampaignId,
      reportType: command.reportType,
      inputHash: "input-sha-256",
      artifactSha256: artifact.sha256,
    });
    const auditText = JSON.stringify(audit);
    for (const forbidden of [
      "templateId",
      "versionId",
      "creationRequestId",
      "sourceSubmissionIds",
      "sourceCount",
      "rendererVersion",
      requestId,
      snapshot.sources[0]?.submissionId,
      snapshot.destination.templateId,
      snapshot.destination.versionId,
      snapshot.destination.campaignName,
      snapshot.sources[0]?.respondent.displayName,
      artifact.path,
      "name",
      "answer",
      "answers",
      "snapshot",
      "artifactPath",
      "path",
      "token",
    ]) {
      if (forbidden) expect(auditText).not.toContain(forbidden);
    }
    expect(auditText).not.toContain(actor.email);
    expect(test.calls.deleted).toEqual([]);
  });

  it("returns an authorized same-request report from the actor-safe fast path", async () => {
    const winner = report();
    const test = harness({ existingRows: [winner] });

    await expect(
      createSummaryReport(test.db, actor, command, test.dependencies),
    ).resolves.toEqual({ kind: "existing", report: winner });

    expect(test.calls.authorized).toEqual([command.destinationCampaignId]);
    expect(test.calls.transactions).toHaveLength(0);
    expect(test.calls.render).toHaveLength(0);
    expect(test.calls.put).toHaveLength(0);
  });

  it.each([
    ["different campaign", report({ campaignId: "campaign-secret" }), true],
    ["different actor", report({ createdByUserId: "user-other" }), true],
    ["actor whose authorization was revoked", report(), false],
  ])(
    "returns not-found for a request collision owned by a %s without leaking it",
    async (_label, winner, authorized) => {
      const test = harness({ existingRows: [winner], authorized });

      await expect(
        createSummaryReport(test.db, actor, command, test.dependencies),
      ).resolves.toEqual({ kind: "not-found" });

      expect(test.calls.transactions).toHaveLength(0);
      expect(test.calls.render).toHaveLength(0);
      if (
        winner.campaignId !== command.destinationCampaignId ||
        winner.createdByUserId !== actor.userId
      ) {
        expect(test.calls.authorized).toEqual([]);
      }
    },
  );

  it("returns composition errors before rendering or uploading", async () => {
    const errors = [
      { code: "missing_role", message: "Choose exactly one CEO." },
    ];
    const test = harness({ snapshotResults: [{ kind: "invalid", errors }] });

    await expect(
      createSummaryReport(test.db, actor, command, test.dependencies),
    ).resolves.toEqual({ kind: "invalid", errors });

    expect(test.calls.transactions).toHaveLength(1);
    expect(test.calls.render).toHaveLength(0);
    expect(test.calls.put).toHaveLength(0);
    expect(test.calls.reportCreate).toHaveLength(0);
  });

  it("returns render-failed and creates no artifact or row when rendering fails", async () => {
    const test = harness({ renderError: new TypeError("answer secret") });

    await expect(
      createSummaryReport(test.db, actor, command, test.dependencies),
    ).resolves.toEqual({ kind: "render-failed" });

    expect(test.calls.put).toHaveLength(0);
    expect(test.calls.reportCreate).toHaveLength(0);
    expect(test.calls.operationalErrors).toEqual([
      {
        event: "summary-report-create-failed",
        stage: "render",
        reportType: command.reportType,
        campaignId: command.destinationCampaignId,
        creationRequestId: requestId,
        errorClass: "TypeError",
      },
    ]);
    expect(JSON.stringify(test.calls.operationalErrors)).not.toContain(
      "answer secret",
    );
  });

  it("preserves render-failed when the sanitized render logger throws", async () => {
    const test = harness({
      renderError: new TypeError("render primary"),
      loggerThrows: true,
    });

    await expect(
      createSummaryReport(test.db, actor, command, test.dependencies),
    ).resolves.toEqual({ kind: "render-failed" });
    expect(test.calls.put).toHaveLength(0);
    expect(test.calls.reportCreate).toHaveLength(0);
    expect(test.calls.operationalErrors).toHaveLength(1);
  });

  it("returns render-failed and creates no row when private upload fails", async () => {
    const test = harness({
      uploadError: new RangeError("token and answer secret"),
    });

    await expect(
      createSummaryReport(test.db, actor, command, test.dependencies),
    ).resolves.toEqual({ kind: "render-failed" });

    expect(test.calls.reportCreate).toHaveLength(0);
    expect(test.calls.operationalErrors).toEqual([
      {
        event: "summary-report-create-failed",
        stage: "upload",
        reportType: command.reportType,
        campaignId: command.destinationCampaignId,
        creationRequestId: requestId,
        errorClass: "RangeError",
      },
    ]);
    expect(JSON.stringify(test.calls.operationalErrors)).not.toContain(
      "token and answer secret",
    );
  });

  it("preserves render-failed when the sanitized upload logger throws", async () => {
    const test = harness({
      uploadError: new RangeError("upload primary"),
      loggerThrows: true,
    });

    await expect(
      createSummaryReport(test.db, actor, command, test.dependencies),
    ).resolves.toEqual({ kind: "render-failed" });
    expect(test.calls.reportCreate).toHaveLength(0);
    expect(test.calls.operationalErrors).toHaveLength(1);
  });

  it.each([
    ["destination authorization", { kind: "not-found" as const }],
    [
      "source authorization",
      {
        kind: "invalid" as const,
        errors: [
          {
            code: "source_unavailable",
            message: "One or more sources are unavailable.",
          },
        ],
      },
    ],
    [
      "source existence",
      {
        kind: "invalid" as const,
        errors: [
          {
            code: "source_not_found",
            message: "The selected source is no longer available.",
            submissionId: "fixture-submission-team",
          },
        ],
      },
    ],
  ])(
    "deletes the uploaded artifact when post-upload %s is lost",
    async (_label, secondResult) => {
      const test = harness({
        snapshotResults: [
          { kind: "ok", snapshot, inputHash: "input-sha-256" },
          secondResult,
        ],
      });

      await expect(
        createSummaryReport(test.db, actor, command, test.dependencies),
      ).resolves.toEqual(secondResult);

      expect(test.calls.deleted).toEqual([artifact.path]);
      expect(test.calls.reportCreate).toHaveLength(0);
    },
  );

  it("deletes the artifact and rejects if the rechecked source data no longer matches the rendered hash", async () => {
    const test = harness({
      snapshotResults: [
        { kind: "ok", snapshot, inputHash: "input-sha-256" },
        { kind: "ok", snapshot, inputHash: "changed-input-sha-256" },
      ],
    });

    await expect(
      createSummaryReport(test.db, actor, command, test.dependencies),
    ).resolves.toEqual({
      kind: "invalid",
      errors: [
        {
          code: "source_changed",
          message:
            "One or more selected sources changed before creation completed.",
        },
      ],
    });
    expect(test.calls.deleted).toEqual([artifact.path]);
    expect(test.calls.reportCreate).toHaveLength(0);
  });

  it("best-effort deletes and rethrows a database failure with one sanitized operational error", async () => {
    const failure = new SyntaxError("PII Alex answer and private/path.pdf");
    const test = harness({
      persistError: failure,
      deleteError: new Error("cleanup unavailable"),
    });

    await expect(
      createSummaryReport(test.db, actor, command, test.dependencies),
    ).rejects.toBe(failure);

    expect(test.calls.deleted).toEqual([artifact.path]);
    expect(test.calls.operationalErrors).toEqual([
      {
        event: "summary-report-create-failed",
        stage: "persist",
        reportType: command.reportType,
        campaignId: command.destinationCampaignId,
        creationRequestId: requestId,
        errorClass: "SyntaxError",
      },
    ]);
    expect(JSON.stringify(test.calls.operationalErrors)).not.toContain("Alex");
    expect(JSON.stringify(test.calls.operationalErrors)).not.toContain(
      artifact.path,
    );
  });

  it("preserves the primary persistence error and cleanup when its logger throws", async () => {
    const failure = new SyntaxError("persist primary");
    const test = harness({ persistError: failure, loggerThrows: true });

    await expect(
      createSummaryReport(test.db, actor, command, test.dependencies),
    ).rejects.toBe(failure);
    expect(test.calls.deleted).toEqual([artifact.path]);
    expect(test.calls.operationalErrors).toHaveLength(1);
  });

  it("returns the authorized winner and deletes the loser artifact on a concurrent creationRequestId P2002", async () => {
    const winner = report({ id: "summary-report-winner" });
    const test = harness({
      existingRows: [null, winner],
      persistError: p2002("creationRequestId"),
      authorized: [true],
    });

    await expect(
      createSummaryReport(test.db, actor, command, test.dependencies),
    ).resolves.toEqual({ kind: "existing", report: winner });

    expect(test.calls.deleted).toEqual([artifact.path]);
    expect(test.calls.authorized).toEqual([command.destinationCampaignId]);
    expect(test.calls.operationalErrors).toEqual([]);
  });

  it("does not reveal a concurrent winner from a different campaign", async () => {
    const test = harness({
      existingRows: [null, report({ campaignId: "campaign-secret" })],
      persistError: p2002(["creationRequestId"]),
    });

    await expect(
      createSummaryReport(test.db, actor, command, test.dependencies),
    ).resolves.toEqual({ kind: "not-found" });

    expect(test.calls.deleted).toEqual([artifact.path]);
    expect(test.calls.authorized).toEqual([]);
  });

  it("sanitizes and rethrows a winner lookup failure after a creation-request race", async () => {
    const lookupFailure = new Error("winner lookup leaked a private answer");
    const test = harness({
      existingRows: [null, null],
      findErrors: [null, lookupFailure],
      persistError: p2002("creationRequestId"),
    });

    await expect(
      createSummaryReport(test.db, actor, command, test.dependencies),
    ).rejects.toBe(lookupFailure);

    expect(test.calls.deleted).toEqual([artifact.path]);
    expect(test.calls.operationalErrors).toEqual([
      {
        event: "summary-report-create-failed",
        stage: "persist",
        reportType: command.reportType,
        campaignId: command.destinationCampaignId,
        creationRequestId: requestId,
        errorClass: "Error",
      },
    ]);
    expect(JSON.stringify(test.calls.operationalErrors)).not.toContain(
      "private answer",
    );
  });

  it("rethrows other P2002 targets after cleanup and sanitized logging", async () => {
    const failure = p2002(["artifactPath"]);
    const test = harness({ persistError: failure });

    await expect(
      createSummaryReport(test.db, actor, command, test.dependencies),
    ).rejects.toBe(failure);

    expect(test.calls.deleted).toEqual([artifact.path]);
    expect(test.calls.find).toBe(1);
    expect(test.calls.operationalErrors).toEqual([
      {
        event: "summary-report-create-failed",
        stage: "persist",
        reportType: command.reportType,
        campaignId: command.destinationCampaignId,
        creationRequestId: requestId,
        errorClass: "Object",
      },
    ]);
  });
});
