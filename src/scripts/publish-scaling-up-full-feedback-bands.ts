/**
 * Publish the exact audited Scaling Up Full feedback-band draft.
 *
 * This is the guarded fallback for environments where the admin UI's native
 * confirmation dialog cannot be controlled. It enforces the same publish
 * validation, requires the patch audit's exact content hash, resolves an
 * active privileged operator, and writes the standard publication audit in
 * the same transaction as publishedAt/publishedBy.
 *
 * Required env:
 *   FEEDBACK_BAND_PUBLISH_ACTOR=admin@example.com
 *   FEEDBACK_BAND_DRAFT_VERSION_ID=<audited draft id>
 */

import { PrismaClient } from "@prisma/client";
import { publishScalingUpFullFeedbackBandDraft } from "@/lib/assessments/su-full-feedback-bands";
import {
  checkGuard,
  OVERRIDE_FLAG,
} from "@/lib/scripts/safe-seed-guard";

async function main(): Promise<void> {
  const guard = checkGuard({
    url: process.env.DATABASE_URL ?? "",
    expectedHost: process.env.ASSESSMENT_PROD_EXPECTED_HOST,
    hasOverride: process.argv.includes(OVERRIDE_FLAG),
  });
  if (!guard.allowed) {
    throw new Error(guard.reason ?? "Production safety guard refused.");
  }

  const operator = process.env.FEEDBACK_BAND_PUBLISH_ACTOR ?? "";
  const versionId = process.env.FEEDBACK_BAND_DRAFT_VERSION_ID ?? "";
  const db = new PrismaClient();
  try {
    const result = await publishScalingUpFullFeedbackBandDraft(
      db,
      operator,
      versionId,
    );
    console.log(
      JSON.stringify({
        operation: "scaling-up-full-feedback-band-publish",
        operator,
        ...result,
      }),
    );
  } finally {
    await db.$disconnect();
  }
}

if (require.main === module) {
  main().catch((error) => {
    console.error("[publish-scaling-up-full-feedback-bands] FAILED:", error);
    process.exit(1);
  });
}
