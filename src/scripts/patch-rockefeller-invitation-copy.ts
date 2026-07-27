/**
 * One-off patch: update the Rockefeller invitation-email body to Jeff #69 copy.
 *
 * The invitation body is a TEMPLATE-ROW field (assessment_templates), read live
 * by every send path (invite / reminder / resend / fan-out all resolve
 * campaign.invitationBodyMarkdown ?? campaign.template.invitationBodyMarkdown).
 * A code deploy ships new code; it never rewrites the existing prod row. This
 * script performs that one row update. Seed edits do NOT reach prod
 * (ensureTemplateVersionContent hashes STORED values for an already-seeded
 * template) — see ADR-0025.
 *
 * Change (Jeff #69): lead with the coach ({{coachName}}) instead of the company
 * ({{organizationName}}), hardcode "Rockefeller Habits" (was {{templateName}} →
 * "Rockefeller Habits Checklist"), and drop the duplicate above-button raw
 * {{invitationUrl}} line (the Start button + the shell's bottom fallback URL
 * already cover it). The purple-header company name and the subject line are
 * deliberately left unchanged (Jeff #69 (3) + body-only scope).
 *
 * ATOMIC compare-and-swap (ADR-0025): a single conditional updateMany guarded on
 * the expected pre-patch body — no read-then-write TOCTOU window. `alias` is
 * @unique so at most one row can match.
 *   count === 1 → patched.
 *   count === 0 → reread + classify: already NEW_BODY = idempotent success;
 *                 soft-deleted or any other body = drift/conflict = HARD FAIL
 *                 (never silently no-op on drift).
 *
 * Run:
 *   npx tsx --env-file=.env scripts/patch-rockefeller-invitation-copy.ts --dry-run
 *   npx tsx --env-file=.env scripts/patch-rockefeller-invitation-copy.ts
 */
import { createHash } from "node:crypto";
import { PrismaClient } from "@prisma/client";

const DRY_RUN = process.argv.includes("--dry-run");
const db = new PrismaClient();

const ALIAS = "RockHabits";

const EXPECTED_CURRENT_BODY = `Hi {{respondentFirstName}},

{{organizationName}} invited you to complete the {{templateName}}. This 40-question checklist takes about 5 minutes. Your responses help your team identify which Rockefeller Habits are in place and where there's room to grow.

Click the link below to begin:

{{invitationUrl}}

Your coach will review the results with you afterward.`;

const NEW_BODY = `Hi {{respondentFirstName}},

{{coachName}} has invited you to complete the Rockefeller Habits. This 40-question checklist takes about 5 minutes. Your responses help your team identify which Rockefeller Habits are in place and where there's room to grow.

Click the button below to begin.

Your coach will review the results with you afterward.`;

const sha = (s: string) => createHash("sha256").update(s).digest("hex").slice(0, 12);

async function main() {
  console.log(DRY_RUN ? "── DRY RUN (no writes) ──" : "── LIVE RUN ──");
  console.log(`alias=${ALIAS}  expectedOld=${sha(EXPECTED_CURRENT_BODY)}  new=${sha(NEW_BODY)}`);

  if (DRY_RUN) {
    const tpl = await db.assessmentTemplate.findUnique({
      where: { alias: ALIAS },
      select: { invitationBodyMarkdown: true, deletedAt: true },
    });
    if (!tpl) {
      console.log(`⚠ No template found for alias '${ALIAS}'.`);
      return;
    }
    const cur = sha(tpl.invitationBodyMarkdown);
    if (tpl.deletedAt) console.log(`⚠ template is soft-deleted (deletedAt=${tpl.deletedAt.toISOString()}).`);
    if (tpl.invitationBodyMarkdown === NEW_BODY) console.log(`✓ already patched (body=${cur}).`);
    else if (tpl.invitationBodyMarkdown === EXPECTED_CURRENT_BODY)
      console.log(`✓ would patch (body ${cur} → ${sha(NEW_BODY)}).`);
    else console.log(`⚠ live body (${cur}) matches neither expected-old nor new — live run would HARD FAIL as drift.`);
    return;
  }

  // Atomic compare-and-swap: only the row whose body still equals EXPECTED matches.
  const res = await db.assessmentTemplate.updateMany({
    where: { alias: ALIAS, deletedAt: null, invitationBodyMarkdown: EXPECTED_CURRENT_BODY },
    data: { invitationBodyMarkdown: NEW_BODY },
  });

  if (res.count === 1) {
    console.log(`✓ Patched — Rockefeller invitation body updated (Jeff #69). old=${sha(EXPECTED_CURRENT_BODY)} → new=${sha(NEW_BODY)}`);
    return;
  }

  // count === 0 (alias is unique, so never > 1) — reread + classify.
  const tpl = await db.assessmentTemplate.findUnique({
    where: { alias: ALIAS },
    select: { invitationBodyMarkdown: true, deletedAt: true },
  });
  if (!tpl) throw new Error(`No template found for alias '${ALIAS}' — nothing patched.`);
  if (tpl.invitationBodyMarkdown === NEW_BODY) {
    console.log(`✓ Idempotent: body already equals the new copy (${sha(NEW_BODY)}) — nothing to do.`);
    return;
  }
  if (tpl.deletedAt)
    throw new Error(`Template '${ALIAS}' is soft-deleted (deletedAt=${tpl.deletedAt.toISOString()}) — refusing to patch.`);
  throw new Error(
    `DRIFT: live body (${sha(tpl.invitationBodyMarkdown)}) matches neither expected-old (${sha(EXPECTED_CURRENT_BODY)}) nor new (${sha(NEW_BODY)}). ` +
      `Refusing to clobber an unrelated edit.\n---- live body ----\n${tpl.invitationBodyMarkdown}`,
  );
}

main()
  .catch((err) => {
    console.error("Fatal:", err instanceof Error ? err.message : err);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
