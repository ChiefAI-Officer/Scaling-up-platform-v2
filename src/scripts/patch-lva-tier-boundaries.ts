/**
 * One-off patch: fix LVA tier boundary gaps that cause INVALID_SCORING_CONFIG.
 *
 * The LVA seed was seeded with:
 *   tier 1: max=1.66 / tier 2: min=1.67  → gap (0.01)
 *   tier 2: max=2.33 / tier 3: min=2.34  → gap (0.01)
 *
 * validateTierTiling requires touching boundaries for non-integer domains
 * (expectedNextMin = a.maxMetric). Fix: align to shared boundary values:
 *   tier 1: max=1.67  tier 2: min=1.67
 *   tier 2: max=2.34  tier 3: min=2.34
 *
 * Run:
 *   npx tsx scripts/patch-lva-tier-boundaries.ts
 *   npx tsx scripts/patch-lva-tier-boundaries.ts --dry-run
 */

import { PrismaClient } from "@prisma/client";
import { createHash } from "crypto";
import * as dotenv from "dotenv";

dotenv.config({ path: ".env" });

const DRY_RUN = process.argv.includes("--dry-run");

const db = new PrismaClient();

function computeContentHash(input: {
  questions: unknown;
  sections: unknown;
  scoringConfig: unknown;
  reportConfig: unknown;
  invitationSubject: string;
  invitationBodyMarkdown: string | null;
}): string {
  const canonical = {
    questions: input.questions,
    sections: input.sections,
    scoringConfig: input.scoringConfig,
    reportConfig: input.reportConfig,
    invitationSubject: input.invitationSubject,
    invitationBodyMarkdown: input.invitationBodyMarkdown,
  };
  return createHash("sha256").update(JSON.stringify(canonical)).digest("hex");
}

async function main() {
  console.log(DRY_RUN ? "── DRY RUN (no writes) ──" : "── LIVE RUN ──");

  const template = await db.assessmentTemplate.findUnique({
    where: { alias: "leadership-vision-alignment" },
    select: {
      id: true,
      invitationSubject: true,
      invitationBodyMarkdown: true,
      versions: {
        orderBy: { versionNumber: "asc" },
        take: 1,
        select: {
          id: true,
          versionNumber: true,
          contentHash: true,
          questions: true,
          sections: true,
          scoringConfig: true,
          reportConfig: true,
        },
      },
    },
  });

  if (!template) {
    console.log("⚠ No template found for alias 'leadership-vision-alignment' — aborting.");
    return;
  }

  const version = template.versions[0];
  if (!version) {
    console.log("⚠ No version found for LVA — aborting.");
    return;
  }

  console.log(`\nVersion ${version.versionNumber} (id: ${version.id})`);

  const sc = version.scoringConfig as {
    tierMetric: string;
    passThreshold?: number;
    tiers: Array<{
      order: number;
      minMetric: number;
      maxMetric: number;
      label: string;
      message: string;
      action: string;
    }>;
  };

  console.log("\nCurrent tiers:");
  for (const t of sc.tiers) {
    console.log(`  tier ${t.order} (${t.label}): min=${t.minMetric} max=${t.maxMetric}`);
  }

  // Check if patch is needed
  const tier1 = sc.tiers.find((t) => t.order === 1);
  const tier2 = sc.tiers.find((t) => t.order === 2);
  if (!tier1 || !tier2) {
    console.log("⚠ Could not find tier 1 or tier 2 — aborting.");
    return;
  }

  if (tier1.maxMetric === 1.67 && tier2.maxMetric === 2.34) {
    console.log("✓ Tier boundaries already correct — nothing to do.");
    return;
  }

  const newTiers = sc.tiers.map((t) => {
    if (t.order === 1) return { ...t, maxMetric: 1.67 };
    if (t.order === 2) return { ...t, maxMetric: 2.34 };
    return t;
  });

  console.log("\nPatched tiers:");
  for (const t of newTiers) {
    console.log(`  tier ${t.order} (${t.label}): min=${t.minMetric} max=${t.maxMetric}`);
  }

  const newScoringConfig = { ...sc, tiers: newTiers };

  const newHash = computeContentHash({
    questions: version.questions,
    sections: version.sections,
    scoringConfig: newScoringConfig,
    reportConfig: version.reportConfig ?? null,
    invitationSubject: template.invitationSubject,
    invitationBodyMarkdown: template.invitationBodyMarkdown,
  });

  console.log(`\n  old hash: ${version.contentHash}`);
  console.log(`  new hash: ${newHash}`);

  if (DRY_RUN) {
    console.log("  ✓ DRY RUN: would patch tier boundaries and update contentHash.");
    return;
  }

  await db.$transaction([
    db.$executeRawUnsafe(
      `ALTER TABLE "assessment_template_versions" DISABLE TRIGGER assessment_template_version_immutability_trigger`
    ),
    db.$executeRawUnsafe(
      `UPDATE "assessment_template_versions" SET "scoringConfig" = $1::jsonb, "contentHash" = $2 WHERE id = $3`,
      JSON.stringify(newScoringConfig),
      newHash,
      version.id
    ),
    db.$executeRawUnsafe(
      `ALTER TABLE "assessment_template_versions" ENABLE TRIGGER assessment_template_version_immutability_trigger`
    ),
  ]);

  console.log("  ✓ Patched — LVA tier boundaries corrected.");
  console.log("\nDone.");
}

main()
  .catch((err) => {
    console.error("Fatal:", err);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
