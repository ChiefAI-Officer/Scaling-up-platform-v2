import { buildScalingUpFullContent } from "../../../../prisma/seed-scaling-up-full-assessment";
import {
  reconcileScalingUpFullQuestionBenchmarkSnapshot,
} from "@/lib/assessments/seed-su-full-question-benchmarks";
import type {
  PeerBenchmarksDb,
  PeerBenchmarksTx,
} from "@/lib/assessments/peer-benchmarks";

function makeDb() {
  const tx = {
    assessmentBenchmark: {
      findMany: jest.fn().mockResolvedValue([
        { id: "existing-q01", metricKey: "Q01", value: 6.3 },
        { id: "stale", metricKey: "OLD_KEY", value: 5 },
      ]),
      create: jest.fn().mockResolvedValue({}),
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
  const questions = buildScalingUpFullContent().questions;

  it("reconciles the complete verified snapshot idempotently", async () => {
    const { db, tx } = makeDb();

    const result = await reconcileScalingUpFullQuestionBenchmarkSnapshot(
      db,
      "tpl-su",
      questions,
    );

    expect(Object.keys(result.after)).toHaveLength(61);
    expect(result.after.Q01).toBe(6.3);
    expect(result.after.Q61).toBe(5.6);
    expect(tx.assessmentBenchmark.create).toHaveBeenCalledTimes(60);
    expect(tx.assessmentBenchmark.update).not.toHaveBeenCalled();
    expect(tx.assessmentBenchmark.deleteMany).toHaveBeenCalledWith({
      where: { id: { in: ["stale"] } },
    });
  });

  it("fails before opening a transaction when template question keys drift", async () => {
    const { db, dbSpy } = makeDb();
    const questionsWithoutQ61 = (questions as Array<{
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
