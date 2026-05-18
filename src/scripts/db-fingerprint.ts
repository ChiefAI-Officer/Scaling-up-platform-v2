/**
 * db-fingerprint.ts — preflight check that confirms the active DATABASE_URL
 * points at the expected production Neon host BEFORE any destructive migration
 * step (prisma migrate deploy / migrate resolve / seed) runs.
 *
 * Spec: docs/specs/v7.6/04-deploy-runbook.md (Step C — Fingerprint preflight).
 *
 * Exit codes:
 *   0  match — host parsed from DATABASE_URL equals ASSESSMENT_PROD_EXPECTED_HOST
 *   1  config / connection error (env var missing, DB unreachable, query failed)
 *   2  mismatch — connected host does NOT match the expected host (rollback-blocking)
 *
 * Note: Neon's pooled endpoints return NULL on `inet_server_addr()` — that's
 * expected and not a failure. The hostname comparison against
 * ASSESSMENT_PROD_EXPECTED_HOST is the source of truth.
 */

import { PrismaClient } from "@prisma/client";

const ASSESSMENT_PROD_EXPECTED_HOST = process.env.ASSESSMENT_PROD_EXPECTED_HOST;
const DATABASE_URL = process.env.DATABASE_URL;

function parseHost(url: string): string {
  // strip protocol + creds; return just the host (no port, no path, no query)
  // accepts Postgres URLs like postgresql://user:pass@host:5432/db?params
  const noProto = url.replace(/^[a-z]+:\/\//i, "");
  const afterAt = noProto.includes("@") ? noProto.split("@")[1] : noProto;
  const hostPort = afterAt.split("/")[0];
  const host = hostPort.split(":")[0];
  return host;
}

async function main() {
  if (!ASSESSMENT_PROD_EXPECTED_HOST) {
    console.error(
      "ASSESSMENT_PROD_EXPECTED_HOST not set in active env. " +
        "Add ASSESSMENT_PROD_EXPECTED_HOST=<the-prod-Neon-host> to .env.production.local. " +
        "See docs/specs/v7.6/04-deploy-runbook.md for the one-time setup steps."
    );
    process.exit(1);
  }
  if (!DATABASE_URL) {
    console.error("DATABASE_URL not set in active env.");
    process.exit(1);
  }

  const actualHost = parseHost(DATABASE_URL);
  const match = actualHost === ASSESSMENT_PROD_EXPECTED_HOST;

  if (!match) {
    console.error(
      "FINGERPRINT MISMATCH — connected host does not match ASSESSMENT_PROD_EXPECTED_HOST. STOP."
    );
    console.error(`  expected: ${ASSESSMENT_PROD_EXPECTED_HOST}`);
    console.error(`  actual:   ${actualHost}`);
    process.exit(2);
  }

  // Connection round-trip to confirm we can actually read.
  // Neon pooled endpoints return null on inet_server_addr() — that's fine;
  // hostname comparison above is the source of truth.
  const prisma = new PrismaClient();
  try {
    const result = await prisma.$queryRawUnsafe<
      Array<{ server_addr: string | null }>
    >("SELECT inet_server_addr()::text AS server_addr");
    const serverAddr = result[0]?.server_addr ?? null;
    console.log(
      JSON.stringify({ match: true, host: actualHost, server_addr: serverAddr })
    );
    process.exit(0);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("Fingerprint connection failed:", message);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
