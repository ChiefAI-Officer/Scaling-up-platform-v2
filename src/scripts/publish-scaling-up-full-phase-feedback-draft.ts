/**
 * Publish one exact, audited Scaling Up Full phase-feedback draft.
 *
 * This command is intentionally separate from draft creation. It validates
 * the draft and its predecessor again inside the publish transaction, updates
 * only the unpublished draft row, and never repins campaigns.
 *
 * Usage (only after separate activation approval):
 *   SU_FULL_PHASE_FEEDBACK_APPROVED_DRAFT_ID=<reviewed-id> \
 *   SU_FULL_PHASE_FEEDBACK_APPROVED_CONTENT_HASH=<reviewed-sha256> \
 *   SU_FULL_PHASE_FEEDBACK_APPROVED_ACTOR=<operator-email> \
 *   npx tsx scripts/publish-scaling-up-full-phase-feedback-draft.ts \
 *     --i-know-this-is-prod
 */

import { PrismaClient } from "@prisma/client";
import { publishScalingUpFullPhaseFeedbackDraft } from "@/lib/assessments/su-full-phase-feedback-edition";
import { checkGuard, OVERRIDE_FLAG } from "@/lib/scripts/safe-seed-guard";

const APPROVAL_INPUT_KEYS = {
  draftVersionId: "SU_FULL_PHASE_FEEDBACK_APPROVED_DRAFT_ID",
  approvedContentHash: "SU_FULL_PHASE_FEEDBACK_APPROVED_CONTENT_HASH",
  actor: "SU_FULL_PHASE_FEEDBACK_APPROVED_ACTOR",
} as const;
const FORBIDDEN_APPROVAL_OVERRIDE_FLAGS = [
  "--draft-version-id",
  "--content-hash",
  "--approved-content-hash",
  "--actor",
] as const;

export function resolveApprovedPublishInputs(
  argv: readonly string[],
  env: Readonly<Record<string, string | undefined>>,
): {
  draftVersionId: string;
  approvedContentHash: string;
  actor: string;
} {
  for (const argument of argv) {
    if (
      FORBIDDEN_APPROVAL_OVERRIDE_FLAGS.some(
        (flag) => argument === flag || argument.startsWith(`${flag}=`),
      )
    ) {
      throw new Error(
        "Phase-feedback approval inputs must come from the approval-scoped environment; ad-hoc CLI overrides are forbidden.",
      );
    }
  }

  const draftVersionId = env[APPROVAL_INPUT_KEYS.draftVersionId]?.trim() ?? "";
  const approvedContentHash =
    env[APPROVAL_INPUT_KEYS.approvedContentHash]?.trim() ?? "";
  const actor = env[APPROVAL_INPUT_KEYS.actor]?.trim() ?? "";
  if (draftVersionId === "" || approvedContentHash === "" || actor === "") {
    throw new Error(
      "All phase-feedback approval inputs (draft ID, content hash, and actor) are required from the approval-scoped environment.",
    );
  }
  return { draftVersionId, approvedContentHash, actor };
}

async function main(): Promise<void> {
  const { draftVersionId, approvedContentHash, actor } =
    resolveApprovedPublishInputs(process.argv.slice(2), process.env);
  const guard = checkGuard({
    url: process.env.DATABASE_URL ?? "",
    expectedHost: process.env.ASSESSMENT_PROD_EXPECTED_HOST,
    hasOverride: process.argv.includes(OVERRIDE_FLAG),
  });
  if (!guard.allowed) {
    throw new Error(guard.reason ?? "Production safety guard refused.");
  }

  const db = new PrismaClient();
  try {
    const result = await publishScalingUpFullPhaseFeedbackDraft(
      db,
      draftVersionId,
      approvedContentHash,
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
