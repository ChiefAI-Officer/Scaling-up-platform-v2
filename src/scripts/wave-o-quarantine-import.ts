/**
 * Wave O — quarantine (soft-delete) one bad historical SU-Full import round.
 *
 * See docs/specs/v7.6/18o-ops-runbook.md §5 for the full runbook. This is the
 * BY-BATCH rollback tool — it removes exactly ONE imported campaign (one
 * company + one round) without touching any other data, including other
 * SU-Full rounds for the same org.
 *
 * Mechanism: soft-delete the campaign (`deletedAt`) — every downstream read
 * path (reports, per-respondent longitudinal, campaign lists) already
 * excludes soft-deleted campaigns via the codebase's existing SEC-M6
 * `liveCampaignWhere`/`loadLiveCampaign` convention (campaign-live.ts), so no
 * other table needs a write. The campaign's `externalId` is ALSO renamed
 * (suffixed) in the same transaction — `AssessmentCampaign.externalId` has a
 * PARTIAL unique index (`WHERE externalId IS NOT NULL`, NOT scoped by
 * `deletedAt` — see migration `add_external_id_to_campaign`), so a
 * soft-deleted row would otherwise still block a legitimate re-import from
 * reusing the same externalId. `Organization.espertoSuFullCid` is NEVER
 * touched — that pin is company provenance, not round provenance, and stays
 * correct after a bad round is purged.
 *
 * Usage:
 *   npx tsx scripts/wave-o-quarantine-import.ts --externalId <id>
 *   npx tsx scripts/wave-o-quarantine-import.ts --org <organizationId> --round-label <label>
 *
 * Default is DRY-RUN (no writes) — prints what would be affected. Add
 * --confirm to actually perform the soft-delete + externalId rename.
 */

import { PrismaClient } from "@prisma/client";
import * as dotenv from "dotenv";
import { slugifyRoundLabel } from "../src/lib/assessments/esperto-import/restricted-plan";

dotenv.config({ path: ".env" });

const CONFIRM = process.argv.includes("--confirm");

const db = new PrismaClient();

function argValue(flag: string): string | null {
  const i = process.argv.indexOf(flag);
  if (i === -1 || i + 1 >= process.argv.length) return null;
  return process.argv[i + 1];
}

/** Redact the cid segment of an `esperto:sufull:<cid>:<slug>` externalId for display. */
function redactExternalId(externalId: string): string {
  const m = /^esperto:sufull:([^:]+):(.+)$/.exec(externalId);
  if (!m) return "[unrecognized externalId shape]";
  return `esperto:sufull:[redacted]:${m[2]}`;
}

async function resolveExternalId(): Promise<string> {
  const direct = argValue("--externalId");
  if (direct) return direct;

  const orgId = argValue("--org");
  const roundLabel = argValue("--round-label");
  if (!orgId || !roundLabel) {
    console.error(
      "Usage: --externalId <id>  OR  --org <organizationId> --round-label <label>",
    );
    process.exit(1);
  }

  const org = await db.organization.findUnique({
    where: { id: orgId },
    select: { id: true, espertoSuFullCid: true },
  });
  if (!org) {
    console.error(`Organization ${orgId} not found.`);
    process.exit(1);
  }
  if (!org.espertoSuFullCid) {
    console.error(
      `Organization ${orgId} has no SU-Full import history (espertoSuFullCid is null) — nothing to quarantine.`,
    );
    process.exit(1);
  }
  const slug = slugifyRoundLabel(roundLabel);
  if (!slug) {
    console.error(`Round label "${roundLabel}" is not a valid round label.`);
    process.exit(1);
  }
  return `esperto:sufull:${org.espertoSuFullCid}:${slug}`;
}

async function main() {
  console.log(CONFIRM ? "-- LIVE RUN (will soft-delete) --" : "-- DRY RUN (no writes) --");

  const externalId = await resolveExternalId();

  const campaign = await db.assessmentCampaign.findFirst({
    where: { externalId },
    select: {
      id: true,
      organizationId: true,
      templateId: true,
      deletedAt: true,
      openAt: true,
      closeAt: true,
      externalId: true,
    },
  });

  if (!campaign) {
    console.error(`No campaign found with externalId ${redactExternalId(externalId)}.`);
    process.exit(1);
  }

  if (campaign.deletedAt) {
    console.log(
      `Campaign ${campaign.id} (${redactExternalId(externalId)}) is ALREADY quarantined (deletedAt=${campaign.deletedAt.toISOString()}). Nothing to do.`,
    );
    return;
  }

  const submissionCount = await db.assessmentSubmission.count({
    where: { campaignId: campaign.id },
  });
  const respondentCount = await db.assessmentSubmission
    .findMany({
      where: { campaignId: campaign.id },
      select: { respondentId: true },
      distinct: ["respondentId"],
    })
    .then((rows) => rows.length);

  console.log(`Campaign:        ${campaign.id}`);
  console.log(`externalId:      ${redactExternalId(externalId)}`);
  console.log(`Organization:    ${campaign.organizationId}`);
  console.log(`Template:        ${campaign.templateId}`);
  console.log(`Date range:      ${campaign.openAt.toISOString()} -> ${campaign.closeAt?.toISOString() ?? "(open)"}`);
  console.log(`Submissions:     ${submissionCount}`);
  console.log(`Respondents:     ${respondentCount}`);

  if (!CONFIRM) {
    console.log("\nDry run only -- no writes made. Re-run with --confirm to quarantine this campaign.");
    return;
  }

  const quarantinedExternalId = `${externalId}::quarantined::${new Date().toISOString()}`;

  await db.$transaction(async (tx) => {
    await tx.assessmentCampaign.update({
      where: { id: campaign.id },
      data: {
        deletedAt: new Date(),
        externalId: quarantinedExternalId,
      },
    });
  });

  console.log(`\nQuarantined campaign ${campaign.id}.`);
  console.log(`  - deletedAt set; excluded from every read path (reports, longitudinal, campaign lists).`);
  console.log(`  - externalId renamed (suffixed) -- a fresh import with the SAME round label is now treated as new.`);
  console.log(`  - Organization.espertoSuFullCid was NOT touched (company provenance is unaffected).`);
  console.log(`\nRun the post-rollback smoke from docs/specs/v7.6/18o-ops-runbook.md section 5b before declaring this complete.`);
}

main()
  .catch((err) => {
    console.error("Fatal:", err);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
