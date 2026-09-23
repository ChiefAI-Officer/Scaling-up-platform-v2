import { PrismaClient } from "@prisma/client";
import { verifyMemberLedTeamsBackfill } from "../src/lib/members/led-teams-backfill";

async function main(): Promise<void> {
  const db = new PrismaClient();
  try {
    const result = await verifyMemberLedTeamsBackfill(db);
    console.log(
      JSON.stringify({
        integrityViolationCount: result.integrityViolations.length,
        scopeMismatchCount: result.scopeMismatches.length,
      }),
    );
    if (
      result.integrityViolations.length > 0 ||
      result.scopeMismatches.length > 0
    ) {
      process.exitCode = 1;
    }
  } finally {
    await db.$disconnect();
  }
}

main().catch((error) => {
  console.error(
    error instanceof Error
      ? error.message
      : "Member Led-team verification failed",
  );
  process.exitCode = 1;
});
