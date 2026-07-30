import { randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import {
  claimNextOutboxRow,
  type OutboxDb,
} from "../src/inngest/functions/quick-assessment-lead-email";

const destructiveOptIn =
  process.env.ASSESSMENT_EMAIL_LEASE_TEST_ALLOW === "isolated-schema";
const testDatabaseUrl = process.env.TEST_DATABASE_URL;
const schemaName = `assessment_email_lease_${randomUUID().replaceAll("-", "")}`;

function scopedDatabaseUrl(baseUrl: string): string {
  const url = new URL(baseUrl);
  url.searchParams.set("schema", schemaName);
  return url.toString();
}

describe("assessment email atomic lease on PostgreSQL", () => {
  let admin: PrismaClient;
  let eventDb: PrismaClient;
  let cronDb: PrismaClient;

  beforeAll(async () => {
    if (!testDatabaseUrl || !destructiveOptIn) {
      throw new Error(
        "Set TEST_DATABASE_URL and ASSESSMENT_EMAIL_LEASE_TEST_ALLOW=isolated-schema",
      );
    }
    if (testDatabaseUrl === process.env.DATABASE_URL) {
      throw new Error("TEST_DATABASE_URL must not equal DATABASE_URL");
    }

    admin = new PrismaClient({
      datasources: { db: { url: testDatabaseUrl } },
    });
    eventDb = new PrismaClient({
      datasources: { db: { url: scopedDatabaseUrl(testDatabaseUrl) } },
    });
    cronDb = new PrismaClient({
      datasources: { db: { url: scopedDatabaseUrl(testDatabaseUrl) } },
    });

    await admin.$executeRawUnsafe(`CREATE SCHEMA "${schemaName}"`);
    await eventDb.$executeRawUnsafe(`
      CREATE TABLE "assessment_email_outbox" (
        "id" TEXT PRIMARY KEY,
        "submissionId" TEXT NOT NULL,
        "recipientEmail" TEXT NOT NULL,
        "recipientRole" TEXT NOT NULL,
        "emailType" TEXT NOT NULL,
        "subject" TEXT NOT NULL,
        "bodyHtml" TEXT NOT NULL,
        "status" TEXT NOT NULL DEFAULT 'PENDING',
        "attempts" INTEGER NOT NULL DEFAULT 0,
        "leaseToken" TEXT,
        "leaseExpiresAt" TIMESTAMP(3),
        "cancelledAt" TIMESTAMP(3),
        "nextAttemptAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `);
  });

  afterAll(async () => {
    await Promise.allSettled([eventDb?.$disconnect(), cronDb?.$disconnect()]);
    if (admin) {
      await admin.$executeRawUnsafe(
        `DROP SCHEMA IF EXISTS "${schemaName}" CASCADE`,
      );
      await admin.$disconnect();
    }
  });

  it("allows exactly one of event and cron claimers to lease a due row", async () => {
    await eventDb.$executeRawUnsafe(`
      INSERT INTO "assessment_email_outbox" (
        "id", "submissionId", "recipientEmail", "recipientRole",
        "emailType", "subject", "bodyHtml", "status", "nextAttemptAt"
      ) VALUES (
        'row-1', 'submission-1', 'coach@example.com', 'REFERRING_COACH',
        'QUICK_ASSESSMENT_LEAD', 'Complete', '<p>Results</p>', 'PENDING',
        (statement_timestamp() AT TIME ZONE 'UTC') - INTERVAL '1 second'
      )
    `);

    const [eventClaim, cronClaim] = await Promise.all([
      claimNextOutboxRow(eventDb as unknown as OutboxDb, {
        submissionId: "submission-1",
        leaseToken: "event-token",
        leaseMs: 120_000,
      }),
      claimNextOutboxRow(cronDb as unknown as OutboxDb, {
        submissionId: null,
        leaseToken: "cron-token",
        leaseMs: 120_000,
      }),
    ]);

    const claims = [eventClaim, cronClaim].filter(
      (claim): claim is NonNullable<typeof claim> => claim !== null,
    );
    expect(claims).toHaveLength(1);
    expect(claims[0]).toEqual(
      expect.objectContaining({
        id: "row-1",
        status: "SENDING",
        attempts: 1,
      }),
    );

    const persisted = await eventDb.$queryRaw<
      Array<{
        status: string;
        attempts: number;
        leaseToken: string | null;
        leaseRemainingMs: number;
      }>
    >`
      SELECT
        "status",
        "attempts",
        "leaseToken",
        EXTRACT(
          EPOCH FROM (
            "leaseExpiresAt" - (statement_timestamp() AT TIME ZONE 'UTC')
          )
        ) * 1000 AS "leaseRemainingMs"
      FROM "assessment_email_outbox"
      WHERE "id" = 'row-1'
    `;

    expect(persisted[0].status).toBe("SENDING");
    expect(persisted[0].attempts).toBe(1);
    expect(["event-token", "cron-token"]).toContain(
      persisted[0].leaseToken,
    );
    expect(Number(persisted[0].leaseRemainingMs)).toBeGreaterThan(115_000);
  });
});
