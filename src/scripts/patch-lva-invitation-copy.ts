/**
 * One-off patch: update the LVA invitation-email body to Jeff #61 copy.
 *
 * The invitation body is a TEMPLATE-ROW field (assessment_templates), read live
 * by every send path. A code deploy only ships new code; it never rewrites the
 * existing prod row. This script performs that one row update.
 *
 * Change (Jeff #61): lead with the coach ({{coachName}}) instead of the company
 * ({{organizationName}}), and drop the mid-email raw {{invitationUrl}} line
 * (the Start button + the shell's bottom fallback URL already cover it).
 *
 * Guarded: only updates when the live body still equals the known pre-patch
 * text, so it can never clobber an unrelated edit made in between. Idempotent:
 * a no-op once the body already matches the new copy.
 *
 * Run:
 *   npx tsx --env-file=.env scripts/patch-lva-invitation-copy.ts --dry-run
 *   npx tsx --env-file=.env scripts/patch-lva-invitation-copy.ts
 */

import { PrismaClient } from "@prisma/client";

const DRY_RUN = process.argv.includes("--dry-run");
const db = new PrismaClient();

const ALIAS = "leadership-vision-alignment";

const EXPECTED_CURRENT_BODY = `Hi {{respondentFirstName}},

{{organizationName}} has invited you to complete the Leadership Vision Alignment assessment. Your responses will help your coach understand the current state of your organization across financials, strategy, culture, and execution.

Click the link below to begin:

{{invitationUrl}}

Your responses are confidential and shared only with your coach.`;

const NEW_BODY = `Hi {{respondentFirstName}},

{{coachName}} has invited you to complete the Leadership Vision Alignment assessment. Your responses will help your coach understand the current state of your organization across financials, strategy, culture, and execution.

Click the button below to begin.

Your responses are confidential and shared only with your coach.`;

async function main() {
  console.log(DRY_RUN ? "── DRY RUN (no writes) ──" : "── LIVE RUN ──");

  const tpl = await db.assessmentTemplate.findUnique({
    where: { alias: ALIAS },
    select: { id: true, invitationBodyMarkdown: true },
  });

  if (!tpl) {
    console.log(`⚠ No template found for alias '${ALIAS}' — aborting.`);
    return;
  }

  if (tpl.invitationBodyMarkdown === NEW_BODY) {
    console.log("✓ LVA invitation body already updated — nothing to do.");
    return;
  }

  if (tpl.invitationBodyMarkdown !== EXPECTED_CURRENT_BODY) {
    console.log(
      "⚠ Live body does NOT match the expected pre-patch text — aborting to avoid clobbering an unrelated edit.",
    );
    console.log("---- live body ----\n" + tpl.invitationBodyMarkdown);
    return;
  }

  console.log("---- old ----\n" + tpl.invitationBodyMarkdown);
  console.log("\n---- new ----\n" + NEW_BODY);

  if (DRY_RUN) {
    console.log("\n✓ DRY RUN: would update invitationBodyMarkdown for LVA.");
    return;
  }

  await db.assessmentTemplate.update({
    where: { id: tpl.id },
    data: { invitationBodyMarkdown: NEW_BODY },
  });

  console.log("\n✓ Patched — LVA invitation body updated (Jeff #61).");
}

main()
  .catch((err) => {
    console.error("Fatal:", err);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
