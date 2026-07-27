/**
 * One-off patch: update the Five Dysfunctions invitation-email body to Jeff #80 copy.
 *
 * The invitation body is a TEMPLATE-ROW field (assessment_templates), read live
 * by every send path (invite / reminder / resend / fan-out all resolve
 * campaign.invitationBodyMarkdown ?? campaign.template.invitationBodyMarkdown).
 * A code deploy ships new code; it never rewrites the existing prod row. This
 * script performs that one row update. Seed edits do NOT reach prod
 * (ensureTemplateVersionContent hashes STORED values for an already-seeded
 * template) — see ADR-0025.
 *
 * Change (Jeff #80): name the coach ({{coachName}}) instead of the generic
 * "Your coach"; use Jeff's wording "the Five Dysfunctions assessment" rather
 * than {{templateName}} (which renders the clunky "The Five Dysfunctions of a
 * Team — Team Assessment"); and drop the inline [Take the Assessment] markdown
 * link, which rendered ABOVE the shell's own "Start the assessment" button and,
 * with the bottom fallback URL, gave the email three links (ask 3, confirmed
 * against the live row). The purple-header company line and the subject line
 * are deliberately unchanged (body-only scope; only LVA suppresses the org
 * line, per #61).
 *
 * ATOMIC compare-and-swap (ADR-0025): a single conditional updateMany guarded on
 * the expected pre-patch body — no read-then-write TOCTOU window. `alias` is
 * @unique so at most one row can match.
 *   count === 1 → patched.
 *   count === 0 → reread + classify: soft-deleted = HARD FAIL; already NEW_BODY =
 *                 idempotent success; any other body = drift/conflict = HARD FAIL
 *                 (never silently no-op on drift).
 *
 * NEW_BODY is exported and import-safe (the run is guarded by require.main), so a
 * test can assert it stays byte-identical to the seed's factory default.
 *
 * Run:
 *   npx tsx --env-file=.env scripts/patch-five-dysfunctions-invitation-copy.ts --dry-run
 *   npx tsx --env-file=.env scripts/patch-five-dysfunctions-invitation-copy.ts
 */
import { createHash } from "node:crypto";
import { PrismaClient } from "@prisma/client";

const ALIAS = "five-dysfunctions";

const EXPECTED_CURRENT_BODY = `Hi {{firstName}},

Your coach has invited you to complete the **Five Dysfunctions of a Team — Team Assessment**.

This 38-statement assessment evaluates your team across five fundamentals:
Trust, Conflict, Commitment, Accountability, and Results.

[Take the Assessment]({{assessmentUrl}})

The assessment takes approximately 10–15 minutes to complete.

Best,
Scaling Up`;

export const NEW_BODY = `Hi {{firstName}},

{{coachName}} has invited you to complete the Five Dysfunctions assessment.

This 38-statement assessment evaluates your team across five fundamentals:
Trust, Conflict, Commitment, Accountability, and Results.

Click the button below to begin.

The assessment takes approximately 10–15 minutes to complete.

Best,
Scaling Up`;

const sha = (s: string) => createHash("sha256").update(s).digest("hex").slice(0, 12);

async function main() {
  const dryRun = process.argv.includes("--dry-run");
  const db = new PrismaClient();
  try {
    console.log(dryRun ? "── DRY RUN (no writes) ──" : "── LIVE RUN ──");
    console.log(`alias=${ALIAS}  expectedOld=${sha(EXPECTED_CURRENT_BODY)}  new=${sha(NEW_BODY)}`);

    if (dryRun) {
      const tpl = await db.assessmentTemplate.findUnique({
        where: { alias: ALIAS },
        select: { invitationBodyMarkdown: true, deletedAt: true },
      });
      if (!tpl) {
        console.log(`⚠ No template found for alias '${ALIAS}'.`);
        return;
      }
      // Mirror the live path's precedence: soft-delete excludes the row from the CAS.
      if (tpl.deletedAt) {
        console.log(`⚠ template is soft-deleted (deletedAt=${tpl.deletedAt.toISOString()}) — live run would HARD FAIL.`);
        return;
      }
      const cur = sha(tpl.invitationBodyMarkdown);
      if (tpl.invitationBodyMarkdown === NEW_BODY) console.log(`✓ already patched (body=${cur}).`);
      else if (tpl.invitationBodyMarkdown === EXPECTED_CURRENT_BODY)
        console.log(`✓ would patch (body ${cur} → ${sha(NEW_BODY)}).`);
      else console.log(`⚠ live body (${cur}) matches neither expected-old nor new — live run would HARD FAIL as drift.`);
      return;
    }

    // Atomic compare-and-swap: only the live, non-deleted row whose body still
    // equals EXPECTED matches. alias is @unique so count is 0 or 1, never > 1.
    const res = await db.assessmentTemplate.updateMany({
      where: { alias: ALIAS, deletedAt: null, invitationBodyMarkdown: EXPECTED_CURRENT_BODY },
      data: { invitationBodyMarkdown: NEW_BODY },
    });

    if (res.count === 1) {
      console.log(`✓ patched (${sha(EXPECTED_CURRENT_BODY)} → ${sha(NEW_BODY)}).`);
      return;
    }

    // count === 0 — classify why, never silently no-op.
    const tpl = await db.assessmentTemplate.findUnique({
      where: { alias: ALIAS },
      select: { invitationBodyMarkdown: true, deletedAt: true },
    });
    if (!tpl) throw new Error(`No template found for alias '${ALIAS}'.`);
    if (tpl.deletedAt)
      throw new Error(`Template '${ALIAS}' is soft-deleted (deletedAt=${tpl.deletedAt.toISOString()}) — refusing to patch.`);
    if (tpl.invitationBodyMarkdown === NEW_BODY) {
      console.log(`✓ already patched (body=${sha(NEW_BODY)}) — idempotent no-op.`);
      return;
    }
    throw new Error(
      `DRIFT: '${ALIAS}' body is ${sha(tpl.invitationBodyMarkdown)}, expected ${sha(EXPECTED_CURRENT_BODY)} or ${sha(NEW_BODY)}. Refusing to overwrite an unrecognized body.`,
    );
  } finally {
    await db.$disconnect();
  }
}

if (require.main === module) {
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
