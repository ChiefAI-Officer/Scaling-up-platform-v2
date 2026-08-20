/**
 * Publish one exact, audited Scaling Up Full phase-feedback draft.
 *
 * This command is intentionally separate from draft creation. It validates
 * the draft and its predecessor again inside the publish transaction, updates
 * only the unpublished draft row, and never repins campaigns.
 *
 * Usage (only after separate activation approval):
 *   npx tsx scripts/publish-scaling-up-full-phase-feedback-draft.ts \
 *     --draft-version-id <id> --actor operator@example.com \
 *     --i-know-this-is-prod
 */

import { PrismaClient } from "@prisma/client";
import { publishScalingUpFullPhaseFeedbackDraft } from "@/lib/assessments/su-full-phase-feedback-edition";
import { checkGuard, OVERRIDE_FLAG } from "@/lib/scripts/safe-seed-guard";

function argumentValue(name: string): string | undefined {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

async function main(): Promise<void> {
  const guard = checkGuard({
    url: process.env.DATABASE_URL ?? "",
    expectedHost: process.env.ASSESSMENT_PROD_EXPECTED_HOST,
    hasOverride: process.argv.includes(OVERRIDE_FLAG),
  });
  if (!guard.allowed) {
    throw new Error(guard.reason ?? "Production safety guard refused.");
  }

  const draftVersionId =
    argumentValue("--draft-version-id") ??
    process.env.SU_FULL_PHASE_FEEDBACK_APPROVED_DRAFT_ID ??
    "";
  const actor =
    argumentValue("--actor") ??
    process.env.SU_FULL_PHASE_FEEDBACK_APPROVED_ACTOR ??
    "";
  const db = new PrismaClient();
  try {
    const result = await publishScalingUpFullPhaseFeedbackDraft(
      db,
      draftVersionId,
      actor,
    );
    console.log(
      JSON.stringify({
        operation: "scaling-up-full-phase-feedback-draft-publish",
        actor,
        ...result,
      }),
    );
  } finally {
    await db.$disconnect();
  }
}

if (require.main === module) {
  main().catch((error) => {
    console.error("[publish-scaling-up-full-phase-feedback-draft] FAILED:", error);
    process.exit(1);
  });
}
