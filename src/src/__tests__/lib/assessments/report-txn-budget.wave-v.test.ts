/**
 * Wave V (V-4) — explicit transaction budgets on the two report READ paths.
 *
 * respondent-report and group-report each run authorization + the full fetch
 * inside ONE interactive $transaction (the H14 contract — deliberate TOCTOU
 * protection, NOT removable). They previously ran on Prisma's 5s interactive-
 * transaction default, which a Neon cold start or high-latency client can
 * trip (P2028) — the read-path analog of the #117 commit-path fix.
 *
 * Contract: both call sites pass { maxWait: 10_000, timeout: 15_000 };
 * group-report keeps its RepeatableRead isolation level.
 */
import { getRespondentReport } from "@/lib/assessments/respondent-report";
import { getCampaignGroupReport } from "@/lib/assessments/group-report";

const actor = {
  userId: "u1",
  role: "ADMIN",
  email: "admin@example.com",
} as never;

function captureDb() {
  const captured: { options?: Record<string, unknown> } = {};
  const db = {
    $transaction: (_cb: unknown, options?: Record<string, unknown>) => {
      captured.options = options;
      // Don't execute the callback — this test pins only the budget the
      // call site hands Prisma, not the loader behavior (covered elsewhere).
      return Promise.resolve({ kind: "not-found" });
    },
  };
  return { db, captured };
}

describe("report read-path transaction budgets (V-4)", () => {
  it("getRespondentReport passes maxWait 10s / timeout 15s", async () => {
    const { db, captured } = captureDb();
    await getRespondentReport(db as never, actor, "c1", "r1");
    expect(captured.options).toMatchObject({ maxWait: 10_000, timeout: 15_000 });
  });

  it("getCampaignGroupReport passes maxWait 10s / timeout 15s AND keeps RepeatableRead", async () => {
    const { db, captured } = captureDb();
    await getCampaignGroupReport(db as never, actor, "c1", new Date("2026-07-06T00:00:00Z"));
    expect(captured.options).toMatchObject({
      maxWait: 10_000,
      timeout: 15_000,
      isolationLevel: "RepeatableRead",
    });
  });
});
