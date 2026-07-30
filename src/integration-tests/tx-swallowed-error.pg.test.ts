/**
 * Does catching an error INSIDE a Prisma interactive transaction actually isolate
 * that failure? (GH #257)
 *
 * WHY THIS EXISTS — the org-survey submit route enqueues its outbox rows inside
 * `db.$transaction`, wrapping each `create` in try/catch, and documents the
 * contract as: "a write failure for one email NEVER rolls back the submission — it
 * is simply skipped". That claim is the reason a reviewer reads the swallow as
 * deliberate and safe.
 *
 * PostgreSQL says otherwise: once a statement raises inside a transaction, the
 * transaction enters an aborted state (`25P02 current transaction is aborted`) and
 * every subsequent command fails until rollback. Catching the error in JavaScript
 * does not un-abort the transaction — the client-side catch and the server-side
 * transaction state are different things. Prisma does not wrap individual
 * operations in savepoints, so there is nothing to roll back *to*.
 *
 * If that is right, the submit route's real behaviour is the OPPOSITE of its
 * comment: a database-level outbox failure takes the whole submission down with it
 * (which is at least loud and retryable, since the invitation is never marked
 * SUBMITTED) and only errors raised BEFORE a statement reaches the database are
 * genuinely swallowed.
 *
 * This test reproduces the route's exact shape — write, then a caught failing
 * write, then another write — against a real PostgreSQL instance, because this is
 * database behaviour and a mocked Prisma cannot show it. jest's `next/jest`
 * mock-based suites will happily "prove" the comment correct, which is precisely
 * how the false claim survived review.
 *
 * Safety: isolated schema, explicit opt-in, and it refuses to run if
 * TEST_DATABASE_URL is the same database as DATABASE_URL. Mirrors
 * assessment-email-lease.pg.test.ts.
 */

import { randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";

const destructiveOptIn =
  process.env.ASSESSMENT_EMAIL_LEASE_TEST_ALLOW === "isolated-schema";
const testDatabaseUrl = process.env.TEST_DATABASE_URL;
const schemaName = `tx_swallow_${randomUUID().replaceAll("-", "")}`;

function scopedDatabaseUrl(baseUrl: string): string {
  const url = new URL(baseUrl);
  url.searchParams.set("schema", schemaName);
  return url.toString();
}

describe("a caught error inside a Prisma interactive transaction (GH #257)", () => {
  let admin: PrismaClient;
  let db: PrismaClient;

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
    db = new PrismaClient({
      datasources: { db: { url: scopedDatabaseUrl(testDatabaseUrl) } },
    });

    await admin.$executeRawUnsafe(`CREATE SCHEMA "${schemaName}"`);
    // Two tables standing in for the route's shape: "submission" is the row that
    // must survive, "outbox" carries a UNIQUE constraint we can violate on demand
    // (the route's own outbox has a unique [submissionId, recipientRole]).
    await db.$executeRawUnsafe(`
      CREATE TABLE "submission" ("id" TEXT PRIMARY KEY, "state" TEXT NOT NULL)
    `);
    await db.$executeRawUnsafe(`
      CREATE TABLE "outbox" (
        "id" TEXT PRIMARY KEY,
        "submissionId" TEXT NOT NULL,
        "recipientRole" TEXT NOT NULL,
        CONSTRAINT "outbox_unique" UNIQUE ("submissionId", "recipientRole")
      )
    `);
  });

  afterAll(async () => {
    await db?.$disconnect();
    if (admin) {
      await admin.$executeRawUnsafe(
        `DROP SCHEMA IF EXISTS "${schemaName}" CASCADE`,
      );
      await admin.$disconnect();
    }
  });

  beforeEach(async () => {
    await db.$executeRawUnsafe(`TRUNCATE "submission", "outbox"`);
  });

  it("does NOT isolate the failure — the whole transaction is lost", async () => {
    // Seed the row whose duplicate will raise inside the transaction.
    await db.$executeRawUnsafe(
      `INSERT INTO "outbox" ("id","submissionId","recipientRole") VALUES ('seed','sub-1','RESPONDENT')`,
    );

    let swallowed: unknown = null;

    const run = db.$transaction(async (tx) => {
      // 1. the write that is supposed to survive regardless
      await tx.$executeRawUnsafe(
        `INSERT INTO "submission" ("id","state") VALUES ('sub-1','SUBMITTED')`,
      );

      // 2. the failing write, caught exactly as the submit route catches it
      try {
        await tx.$executeRawUnsafe(
          `INSERT INTO "outbox" ("id","submissionId","recipientRole") VALUES ('dup','sub-1','RESPONDENT')`,
        );
      } catch (err) {
        swallowed = err;
      }

      // 3. the route does more work after the catch (it marks the invitation
      //    SUBMITTED). This is where an aborted transaction bites.
      await tx.$executeRawUnsafe(
        `UPDATE "submission" SET "state" = 'DONE' WHERE "id" = 'sub-1'`,
      );
    });

    await expect(run).rejects.toBeDefined();

    // The catch DID see the unique violation — so the swallow "worked" in the only
    // sense JavaScript can offer.
    expect(swallowed).not.toBeNull();

    // ...and yet nothing committed. The submission the comment promises to protect
    // is gone.
    const rows = await db.$queryRawUnsafe<{ id: string }[]>(
      `SELECT "id" FROM "submission"`,
    );
    expect(rows).toHaveLength(0);
  });

  it("DOES isolate a failure raised before the statement reaches the database", async () => {
    // Positive control, and the boundary that makes the first test meaningful: a
    // JS-side throw inside the same try/catch is genuinely swallowed, and the
    // transaction commits. So the route's contract holds for validation-shaped
    // errors and fails for database-shaped ones.
    const run = db.$transaction(async (tx) => {
      await tx.$executeRawUnsafe(
        `INSERT INTO "submission" ("id","state") VALUES ('sub-2','SUBMITTED')`,
      );
      try {
        throw new Error("rendered payload rejected before hitting the DB");
      } catch {
        // swallowed, exactly like the route
      }
      await tx.$executeRawUnsafe(
        `UPDATE "submission" SET "state" = 'DONE' WHERE "id" = 'sub-2'`,
      );
    });

    await expect(run).resolves.toBeUndefined();

    const rows = await db.$queryRawUnsafe<{ id: string; state: string }[]>(
      `SELECT "id","state" FROM "submission"`,
    );
    expect(rows).toEqual([{ id: "sub-2", state: "DONE" }]);
  });
});
