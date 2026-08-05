/**
 * Real PostgreSQL proofs for the first-completion report-style lock.
 *
 * This suite uses an explicit isolated-schema opt-in, matching the repository's
 * existing PostgreSQL integration tests. It creates only the campaign columns
 * that the lock and competing coach update need, so it cannot affect a normal
 * development database.
 */

import { randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import { lockReportStyleForFirstCompletion } from "../src/lib/assessments/report-style-lock";

const destructiveOptIn =
  process.env.ASSESSMENT_EMAIL_LEASE_TEST_ALLOW === "isolated-schema";
const testDatabaseUrl = process.env.TEST_DATABASE_URL;
const schemaName = `report_style_lock_${randomUUID().replaceAll("-", "")}`;

function scopedDatabaseUrl(baseUrl: string): string {
  const url = new URL(baseUrl);
  url.searchParams.set("schema", schemaName);
  return url.toString();
}

function deferred<T>() {
  let resolvePromise!: (value: T) => void;
  const promise = new Promise<T>((resolve) => {
    resolvePromise = resolve;
  });
  return { promise, resolve: resolvePromise };
}

async function bounded<T>(operation: Promise<T>, label: string, timeoutMs = 10_000): Promise<T> {
  let timeout: ReturnType<typeof setTimeout> | undefined;
  const guard = new Promise<never>((_, reject) => {
    timeout = setTimeout(() => reject(new Error(`Timed out waiting for ${label}`)), timeoutMs);
  });
  try {
    return await Promise.race([operation, guard]);
  } finally {
    if (timeout) clearTimeout(timeout);
  }
}

async function waitForCoachUpdateLockWait(
  observer: PrismaClient,
  coachBackendPid: number,
  timeoutMs = 10_000,
): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const blockedUpdate = await observer.$queryRaw<Array<{ pid: number }>>`
      SELECT "pid"
      FROM pg_stat_activity
      WHERE "pid" = ${coachBackendPid}
        AND "state" = ${"active"}
        AND "wait_event_type" = ${"Lock"}
        AND "wait_event" = ${"transactionid"}
        AND "query" LIKE ${'%UPDATE "assessment_campaigns"%'}
    `;
    if (blockedUpdate.length === 1) return;
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  throw new Error(
    `Coach backend ${coachBackendPid} was not observed blocked on the campaign update`,
  );
}

describe("report style first-completion lock on PostgreSQL", () => {
  let admin: PrismaClient;
  let completionDb: PrismaClient;
  let coachDb: PrismaClient;

  beforeAll(async () => {
    if (!testDatabaseUrl || !destructiveOptIn) {
      throw new Error(
        "Set TEST_DATABASE_URL and ASSESSMENT_EMAIL_LEASE_TEST_ALLOW=isolated-schema",
      );
    }
    if (testDatabaseUrl === process.env.DATABASE_URL) {
      throw new Error("TEST_DATABASE_URL must not equal DATABASE_URL");
    }

    admin = new PrismaClient({ datasources: { db: { url: testDatabaseUrl } } });
    completionDb = new PrismaClient({
      datasources: { db: { url: scopedDatabaseUrl(testDatabaseUrl) } },
    });
    coachDb = new PrismaClient({
      datasources: { db: { url: scopedDatabaseUrl(testDatabaseUrl) } },
    });

    await admin.$executeRawUnsafe(`CREATE SCHEMA "${schemaName}"`);
    await completionDb.$executeRawUnsafe(`
      CREATE TABLE "assessment_campaigns" (
        "id" TEXT PRIMARY KEY,
        "reportStyle" TEXT NOT NULL,
        "reportStyleLockedAt" TIMESTAMP(3)
      )
    `);
  });

  afterAll(async () => {
    await Promise.allSettled([completionDb?.$disconnect(), coachDb?.$disconnect()]);
    if (admin) {
      await admin.$executeRawUnsafe(`DROP SCHEMA IF EXISTS "${schemaName}" CASCADE`);
      await admin.$disconnect();
    }
  });

  beforeEach(async () => {
    await completionDb.$executeRawUnsafe('TRUNCATE "assessment_campaigns"');
  });

  it("freezes the style selected by a coach transaction that commits first", async () => {
    await completionDb.$executeRaw`
      INSERT INTO "assessment_campaigns" ("id", "reportStyle")
      VALUES (${"campaign-update-first"}, ${"CLASSIC"})
    `;

    const updated = await coachDb.$transaction((tx) => tx.$executeRaw`
      UPDATE "assessment_campaigns"
      SET "reportStyle" = ${"MODERN_DASHBOARD"}
      WHERE "id" = ${"campaign-update-first"}
        AND "reportStyleLockedAt" IS NULL
    `);
    expect(updated).toBe(1);

    const submittedAt = new Date("2026-08-05T06:31:00.000Z");
    await completionDb.$transaction(async (tx) => {
      await lockReportStyleForFirstCompletion(tx, "campaign-update-first", submittedAt);
    });

    const rows = await coachDb.$queryRaw<
      Array<{ reportStyle: string; reportStyleLockedAt: Date | null }>
    >`
      SELECT "reportStyle", "reportStyleLockedAt"
      FROM "assessment_campaigns"
      WHERE "id" = ${"campaign-update-first"}
    `;
    expect(rows).toEqual([
      { reportStyle: "MODERN_DASHBOARD", reportStyleLockedAt: submittedAt },
    ]);
  });

  it("makes a competing conditional coach update affect zero rows after the completion lock commits", async () => {
    await completionDb.$executeRaw`
      INSERT INTO "assessment_campaigns" ("id", "reportStyle")
      VALUES (${"campaign-freeze-first"}, ${"CLASSIC"})
    `;

    const lockAcquired = deferred<void>();
    const releaseFreeze = deferred<void>();
    const coachBackendPid = deferred<number>();
    const freeze = completionDb.$transaction(async (tx) => {
      await lockReportStyleForFirstCompletion(
        tx,
        "campaign-freeze-first",
        new Date("2026-08-05T06:32:00.000Z"),
      );
      lockAcquired.resolve();
      await releaseFreeze.promise;
    });

    try {
      await bounded(lockAcquired.promise, "completion lock acquisition");
      const coachUpdate = coachDb.$transaction(async (tx) => {
        const backendPids = await tx.$queryRaw<Array<{ pid: number }>>`
          SELECT pg_backend_pid()::int AS "pid"
        `;
        coachBackendPid.resolve(backendPids[0].pid);
        return tx.$executeRaw`
          UPDATE "assessment_campaigns"
          SET "reportStyle" = ${"EXECUTIVE_BOARDROOM"}
          WHERE "id" = ${"campaign-freeze-first"}
            AND "reportStyleLockedAt" IS NULL
        `;
      });

      const coachPid = await bounded(
        coachBackendPid.promise,
        "coach transaction startup",
      );
      await waitForCoachUpdateLockWait(admin, coachPid);
      releaseFreeze.resolve();
      const [, affected] = await bounded(
        Promise.all([freeze, coachUpdate]),
        "freeze-first transaction ordering",
      );
      expect(affected).toBe(0);
    } finally {
      releaseFreeze.resolve();
      await Promise.allSettled([freeze]);
    }
  });

  it("rolls back the lock when the successful-submission transaction rolls back", async () => {
    await completionDb.$executeRaw`
      INSERT INTO "assessment_campaigns" ("id", "reportStyle")
      VALUES (${"campaign-rollback"}, ${"CLASSIC"})
    `;

    await expect(
      completionDb.$transaction(async (tx) => {
        await lockReportStyleForFirstCompletion(
          tx,
          "campaign-rollback",
          new Date("2026-08-05T06:33:00.000Z"),
        );
        throw new Error("simulated submission persistence failure");
      }),
    ).rejects.toThrow("simulated submission persistence failure");

    const rows = await coachDb.$transaction((tx) => tx.$queryRaw<
      Array<{ reportStyleLockedAt: Date | null }>
    >`
      SELECT "reportStyleLockedAt"
      FROM "assessment_campaigns"
      WHERE "id" = ${"campaign-rollback"}
    `);
    expect(rows).toEqual([{ reportStyleLockedAt: null }]);
  });
});
