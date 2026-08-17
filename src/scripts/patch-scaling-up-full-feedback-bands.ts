/**
 * Create a new Scaling Up Full draft with the evidence-backed Esperto
 * feedback ranges [0-2], [3-4], [5-6], [7-8], [9-10].
 *
 * The active published version is immutable. This script clones that version,
 * changes only the two upper recommendation boundaries, verifies all 305 text
 * records are preserved, and appends an audited DRAFT. It never publishes.
 *
 * Run against production:
 *   npx tsx --env-file=.env.production.local \
 *     scripts/patch-scaling-up-full-feedback-bands.ts \
 *     --dry-run --i-know-this-is-prod
 *
 *   npx tsx --env-file=.env.production.local \
 *     scripts/patch-scaling-up-full-feedback-bands.ts \
 *     --i-know-this-is-prod
 *
 * Required env:
 *   FEEDBACK_BAND_PATCH_ACTOR=operator@example.com
 */

import { PrismaClient } from "@prisma/client";
import { createScalingUpFullFeedbackBandDraft } from "@/lib/assessments/su-full-feedback-bands";
import {
  checkGuard,
  OVERRIDE_FLAG,
} from "@/lib/scripts/safe-seed-guard";

async function main(): Promise<void> {
  const dryRun = process.argv.includes("--dry-run");
  const hasOverride = process.argv.includes(OVERRIDE_FLAG);
  const guard = checkGuard({
    url: process.env.DATABASE_URL ?? "",
    expectedHost: process.env.ASSESSMENT_PROD_EXPECTED_HOST,
    hasOverride,
  });
  if (!guard.allowed) {
    throw new Error(guard.reason ?? "Production safety guard refused.");
  }

  const operator = process.env.FEEDBACK_BAND_PATCH_ACTOR ?? "";
  const db = new PrismaClient();
  try {
    const result = await createScalingUpFullFeedbackBandDraft(
      db,
      operator,
      { dryRun },
    );
    console.log(
      JSON.stringify({
        operation: "scaling-up-full-feedback-band-patch",
        mode: dryRun ? "dry-run" : "live",
        operator,
        ...result,
        published: false,
      }),
    );
  } finally {
    await db.$disconnect();
  }
}

if (require.main === module) {
  main().catch((error) => {
    console.error("[patch-scaling-up-full-feedback-bands] FAILED:", error);
    process.exit(1);
  });
}
