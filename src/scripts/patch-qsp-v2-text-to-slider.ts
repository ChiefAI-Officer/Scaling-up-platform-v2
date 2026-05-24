/**
 * One-off patch: fix QSP v2 Section 2 question types.
 *
 * The seed script marked 3 "Next Quarter Planning" questions as TEXT, but the
 * wireframe and product intent treats them as SLIDER_LIKERT (1–10, Strongly
 * disagree → Strongly agree).
 *
 * The DB-level immutability trigger blocks direct UPDATEs on published rows,
 * so we disable it, patch, and re-enable — same pattern used by
 * patch-qsp-scoring-config.ts.
 *
 * Affected questions (in the published qsp-v2 version):
 *   - "What is your #1 priority for the next quarter?"
 *   - "What is your biggest risk or obstacle this quarter?"
 *   - "What support do you need from your coach?"
 *
 * Run:
 *   npx tsx scripts/patch-qsp-v2-text-to-slider.ts
 *   npx tsx scripts/patch-qsp-v2-text-to-slider.ts --dry-run
 */

import { PrismaClient } from "@prisma/client";
import { createHash } from "crypto";
import * as dotenv from "dotenv";

dotenv.config({ path: ".env" });

const DRY_RUN = process.argv.includes("--dry-run");

const db = new PrismaClient();

const SLIDER_SCALE = {
  min: 1,
  max: 10,
  step: 1,
  anchorMin: "Strongly disagree",
  anchorMax: "Strongly agree",
};

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
    where: { alias: "qsp-v2" },
    select: {
      id: true,
      invitationSubject: true,
      invitationBodyMarkdown: true,
      versions: {
        where: { publishedAt: { not: null } },
        orderBy: { versionNumber: "desc" },
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
    console.log("⚠ No template found for alias 'qsp-v2' — aborting.");
    return;
  }

  const version = template.versions[0];
  if (!version) {
    console.log("⚠ No published version found for qsp-v2 — aborting.");
    return;
  }

  console.log(`\nVersion ${version.versionNumber} (id: ${version.id})`);

  const allQuestions = version.questions as Array<Record<string, unknown>>;
  const textQuestions = allQuestions.filter((q) => q.type === "TEXT");

  if (textQuestions.length === 0) {
    console.log("✓ No TEXT questions found — already patched or nothing to do.");
    return;
  }

  console.log(`  Found ${textQuestions.length} TEXT question(s) to convert:`);
  for (const q of textQuestions) {
    console.log(`    • ${q.stableKey}: "${q.label}"`);
  }

  const newQuestions = allQuestions.map((q) => {
    if (q.type !== "TEXT") return q;
    return {
      ...q,
      type: "SLIDER_LIKERT",
      scale: SLIDER_SCALE,
    };
  });

  const newHash = computeContentHash({
    questions: newQuestions,
    sections: version.sections,
    scoringConfig: version.scoringConfig,
    reportConfig: version.reportConfig ?? null,
    invitationSubject: template.invitationSubject,
    invitationBodyMarkdown: template.invitationBodyMarkdown,
  });

  console.log(`  old hash: ${version.contentHash}`);
  console.log(`  new hash: ${newHash}`);

  if (DRY_RUN) {
    console.log("  ✓ DRY RUN: would convert TEXT → SLIDER_LIKERT and update contentHash.");
    return;
  }

  await db.$transaction([
    db.$executeRawUnsafe(
      `ALTER TABLE "assessment_template_versions" DISABLE TRIGGER assessment_template_version_immutability_trigger`
    ),
    db.$executeRawUnsafe(
      `UPDATE "assessment_template_versions" SET "questions" = $1::jsonb, "contentHash" = $2 WHERE id = $3`,
      JSON.stringify(newQuestions),
      newHash,
      version.id
    ),
    db.$executeRawUnsafe(
      `ALTER TABLE "assessment_template_versions" ENABLE TRIGGER assessment_template_version_immutability_trigger`
    ),
  ]);

  console.log("  ✓ Patched — TEXT questions converted to SLIDER_LIKERT.");
  console.log("\nDone.");
}

main()
  .catch((err) => {
    console.error("Fatal:", err);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
