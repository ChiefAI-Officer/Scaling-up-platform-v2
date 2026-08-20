/**
 * Create the forward-only Scaling Up Full phase-feedback draft.
 *
 * This command never publishes a version, updates a published version, or
 * repins a campaign. The lifecycle function clones the exact active enUS
 * edition and writes its creation receipt atomically with the new draft.
 *
 * Usage:
 *   npx tsx scripts/create-scaling-up-full-phase-feedback-draft.ts \
 *     --actor operator@example.com --i-know-this-is-prod
 */

import { PrismaClient } from "@prisma/client";
import { createScalingUpFullPhaseFeedbackDraft } from "@/lib/assessments/su-full-phase-feedback-edition";
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

  const actor =
    argumentValue("--actor") ??
    process.env.SU_FULL_PHASE_FEEDBACK_DRAFT_ACTOR ??
    "";
  const db = new PrismaClient();
  try {
    const result = await createScalingUpFullPhaseFeedbackDraft(db, actor);
    console.log(
      JSON.stringify({
        operation: "scaling-up-full-phase-feedback-draft-create",
        actor,
        ...result,
        published: false,
        activated: false,
      }),
    );
  } finally {
    await db.$disconnect();
  }
}

if (require.main === module) {
  main().catch((error) => {
    console.error("[create-scaling-up-full-phase-feedback-draft] FAILED:", error);
    process.exit(1);
  });
}
