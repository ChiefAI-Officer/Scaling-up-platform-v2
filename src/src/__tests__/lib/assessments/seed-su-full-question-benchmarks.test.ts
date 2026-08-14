import { buildScalingUpFullContent } from "../../../../prisma/seed-scaling-up-full-assessment";
import {
  reconcileScalingUpFullQuestionBenchmarkSnapshot,
  refreshScalingUpFullQuestionBenchmarkSnapshot,
} from "@/lib/assessments/seed-su-full-question-benchmarks";
import type {
  PeerBenchmarksDb,
  PeerBenchmarksTx,
} from "@/lib/assessments/peer-benchmarks";

const SCALING_UP_FULL_QUESTIONS = buildScalingUpFullContent().questions;

function makeDb() {
  const tx = {
    assessmentBenchmark: {
      findMany: jest.fn().mockResolvedValue([
        { id: "existing-q01", metricKey: "Q01", value: 6.3 },
        { id: "stale", metricKey: "OLD_KEY", value: 5 },
      ]),
      create: jest.fn().mockResolvedValue({}),
      createMany: jest.fn().mockResolvedValue({ count: 60 }),
      update: jest.fn().mockResolvedValue({}),
      deleteMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
  };
  const db = {
    $transaction: jest.fn(
      async <T>(fn: (inner: PeerBenchmarksTx) => Promise<T>): Promise<T> =>
        fn(tx as unknown as PeerBenchmarksTx),
    ),
  };
  return { db: db as unknown as PeerBenchmarksDb, dbSpy: db, tx };
}

describe("reconcileScalingUpFullQuestionBenchmarkSnapshot", () => {
  it("reconciles the complete verified snapshot idempotently", async () => {
    const { db, tx } = makeDb();

    const result = await reconcileScalingUpFullQuestionBenchmarkSnapshot(
      db,
      "tpl-su",
      SCALING_UP_FULL_QUESTIONS,
    );

    expect(Object.keys(result.after)).toHaveLength(61);
    expect(result.after.Q01).toBe(6.3);
    expect(result.after.Q61).toBe(5.6);
    expect(tx.assessmentBenchmark.createMany).toHaveBeenCalledTimes(1);
    expect(tx.assessmentBenchmark.createMany.mock.calls[0][0].data).toHaveLength(
      60,
    );
    expect(tx.assessmentBenchmark.create).not.toHaveBeenCalled();
    expect(tx.assessmentBenchmark.update).not.toHaveBeenCalled();
    expect(tx.assessmentBenchmark.deleteMany).toHaveBeenCalledWith({
      where: { id: { in: ["stale"] } },
    });
  });

  it("fails before opening a transaction when template question keys drift", async () => {
    const { db, dbSpy } = makeDb();
    const questionsWithoutQ61 = (SCALING_UP_FULL_QUESTIONS as Array<{
      stableKey: string;
      type: string;
    }>).filter((question) => question.stableKey !== "Q61");

    await expect(
      reconcileScalingUpFullQuestionBenchmarkSnapshot(
        db,
        "tpl-su",
        questionsWithoutQ61,
      ),
    ).rejects.toThrow(/question-key mismatch.*Q61/i);
    expect(dbSpy.$transaction).not.toHaveBeenCalled();
  });
});

describe("refreshScalingUpFullQuestionBenchmarkSnapshot", () => {
  function makeRefreshDb() {
    const tx = {
      assessmentTemplate: {
        findFirst: jest.fn().mockResolvedValue({ id: "tpl-su" }),
      },
      assessmentTemplateVersion: {
        findFirst: jest.fn().mockResolvedValue({
          id: "ver-su",
          versionNumber: 4,
          questions: SCALING_UP_FULL_QUESTIONS,
        }),
      },
      assessmentBenchmark: {
        findMany: jest.fn().mockResolvedValue([]),
        create: jest.fn().mockResolvedValue({}),
        createMany: jest.fn().mockResolvedValue({ count: 61 }),
        update: jest.fn().mockResolvedValue({}),
        deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
      },
      auditLog: { create: jest.fn().mockResolvedValue({}) },
    };
    const db = {
      $transaction: jest.fn(async (fn: (inner: typeof tx) => unknown) =>
        fn(tx),
      ),
    };
    return { db, tx };
  }

  it("atomically writes the snapshot and durable source provenance", async () => {
    const { db, tx } = makeRefreshDb();

    const result = await refreshScalingUpFullQuestionBenchmarkSnapshot(
      db,
      "operator@example.com",
    );

    expect(result.storedCount).toBe(61);
    expect(tx.assessmentTemplateVersion.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          templateId: "tpl-su",
          language: "enUS",
          publishedAt: { not: null },
          archivedAt: null,
        },
      }),
    );
    expect(tx.auditLog.create).toHaveBeenCalledTimes(1);
    const audit = tx.auditLog.create.mock.calls[0][0].data;
    expect(audit).toMatchObject({
      entityType: "ASSESSMENT_TEMPLATE",
      entityId: "tpl-su",
      action: "BENCHMARKS_RECONCILED",
      performedBy: "operator@example.com",
    });
    expect(JSON.parse(audit.changes)).toMatchObject({
      mechanism: "seed:scaling-up-full-peers",
      benchmarkVersion: "2026-08-14.esperto-controlled-v1",
      effectiveDate: "2026-08-14",
      templateVersionId: "ver-su",
      templateVersionNumber: 4,
      before: {},
    });
    expect(Object.keys(JSON.parse(audit.changes).after)).toHaveLength(61);
  });

  it("inserts the complete 61-row snapshot with one bounded batch write", async () => {
    const { db, tx } = makeRefreshDb();

    await refreshScalingUpFullQuestionBenchmarkSnapshot(
      db,
      "operator@example.com",
    );

    expect(tx.assessmentBenchmark.createMany).toHaveBeenCalledTimes(1);
    const inserted = tx.assessmentBenchmark.createMany.mock.calls[0][0].data;
    expect(inserted).toHaveLength(61);
    expect(inserted[0]).toEqual({
      templateId: "tpl-su",
      metricKind: "QUESTION",
      metricKey: "Q01",
      value: 6.3,
    });
    expect(inserted[60]).toEqual({
      templateId: "tpl-su",
      metricKind: "QUESTION",
      metricKey: "Q61",
      value: 5.6,
    });
    expect(tx.assessmentBenchmark.create).not.toHaveBeenCalled();
  });

  it("uses the established cross-continent production transaction window", async () => {
    const { db } = makeRefreshDb();

    await refreshScalingUpFullQuestionBenchmarkSnapshot(
      db,
      "operator@example.com",
    );

    expect(db.$transaction).toHaveBeenCalledWith(expect.any(Function), {
      maxWait: 10_000,
      timeout: 55_000,
    });
  });

  it("requires an explicit operator before opening the transaction", async () => {
    const { db } = makeRefreshDb();

    await expect(
      refreshScalingUpFullQuestionBenchmarkSnapshot(db, "  "),
    ).rejects.toThrow(/operator/i);
    expect(db.$transaction).not.toHaveBeenCalled();
  });

  it("fails the refresh when the audit write fails", async () => {
    const { db, tx } = makeRefreshDb();
    tx.auditLog.create.mockRejectedValueOnce(new Error("audit unavailable"));

    await expect(
      refreshScalingUpFullQuestionBenchmarkSnapshot(
        db,
        "operator@example.com",
      ),
    ).rejects.toThrow("audit unavailable");
  });
});
