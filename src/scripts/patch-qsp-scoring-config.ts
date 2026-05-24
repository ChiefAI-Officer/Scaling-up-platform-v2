/**
 * One-off patch: fix published QSP v1 and v2 template versions.
 *
 * Two D1 seed artifacts, both prevented from self-correcting via the seed's
 * State C immutability guard:
 *   1. scoringConfig used old field names (minScore/maxScore, tierMetric:"average")
 *      → scoring engine throws INVALID_SCORING_CONFIG at submit time
 *   2. questions[].scale is missing anchorMin/anchorMax
 *      → scoring engine's Zod schema throws INVALID_SCORING_CONFIG at submit time
 *
 * This script bypasses the DB-level immutability trigger and patches both columns
 * + recomputes contentHash.
 *
 * Safe to run multiple times — already-fully-patched records are skipped.
 *
 * Run:
 *   npx tsx scripts/patch-qsp-scoring-config.ts
 *   npx tsx scripts/patch-qsp-scoring-config.ts --dry-run   # preview only
 */

import { PrismaClient } from "@prisma/client";
import { createHash } from "crypto";
import * as dotenv from "dotenv";

dotenv.config({ path: ".env" });

const DRY_RUN = process.argv.includes("--dry-run");

const db = new PrismaClient();

// ─── Correct SCORING_CONFIG (matches D2.0 seed constants) ─────────────────

const CORRECT_SCORING_CONFIG = {
  tierMetric: "overallAvg",
  passThreshold: 7,
  scale: { min: 1, max: 10 },
  tiers: [
    {
      label: "At Risk",
      minMetric: 1,
      maxMetric: 5,
      message:
        "Your quarterly performance signals real strain. Use this session to align on the most pressing fixes.",
    },
    {
      label: "Needs Work",
      minMetric: 5,
      maxMetric: 7,
      message:
        "Pockets of weakness are pulling your quarter down. Identify two or three high-leverage corrections.",
    },
    {
      label: "On Track",
      minMetric: 7,
      maxMetric: 9,
      message:
        "Solid quarter overall. Use the session to lock in what worked and tune the gaps.",
    },
    {
      label: "Strong",
      minMetric: 9,
      message:
        "Excellent quarter. Use the session to compound the wins and set bolder priorities.",
    },
  ],
};

// ─── Hash function (same canonical key order as seed + template-content-hash.ts) ─

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

// ─── Anchor text (same for all QSP v1/v2 SLIDER_LIKERT questions) ────────────

const ANCHOR_MIN = "Strongly disagree";
const ANCHOR_MAX = "Strongly agree";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function isScoringConfigPatched(scoringConfig: unknown): boolean {
  if (!scoringConfig || typeof scoringConfig !== "object") return false;
  const cfg = scoringConfig as Record<string, unknown>;
  if (cfg.tierMetric !== "overallAvg") return false;
  const tiers = cfg.tiers;
  if (!Array.isArray(tiers) || tiers.length === 0) return false;
  const firstTier = tiers[0] as Record<string, unknown>;
  return "minMetric" in firstTier && !("minScore" in firstTier);
}

function areQuestionsPatched(questions: unknown): boolean {
  if (!Array.isArray(questions) || questions.length === 0) return false;
  return questions.every((q: unknown) => {
    const question = q as Record<string, unknown>;
    const scale = question.scale as Record<string, unknown> | undefined;
    return (
      scale &&
      typeof scale.anchorMin === "string" &&
      typeof scale.anchorMax === "string"
    );
  });
}

function patchQuestions(questions: unknown): unknown[] {
  if (!Array.isArray(questions)) return [];
  return questions.map((q: unknown) => {
    const question = q as Record<string, unknown>;
    const scale = (question.scale ?? {}) as Record<string, unknown>;
    return {
      ...question,
      scale: {
        ...scale,
        anchorMin: ANCHOR_MIN,
        anchorMax: ANCHOR_MAX,
      },
    };
  });
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log(
    DRY_RUN ? "── DRY RUN (no writes) ──" : "── LIVE RUN ──"
  );

  const aliases = ["qsp-v1", "qsp-v2"];

  for (const alias of aliases) {
    console.log(`\n[${alias}] Finding template...`);

    const template = await db.assessmentTemplate.findUnique({
      where: { alias },
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
            scoringConfig: true,
            questions: true,
            sections: true,
            reportConfig: true,
          },
        },
      },
    });

    if (!template) {
      console.log(`  ⚠ No template found for alias "${alias}" — skipping.`);
      continue;
    }

    const version = template.versions[0];
    if (!version) {
      console.log(`  ⚠ No published version found for "${alias}" — skipping.`);
      continue;
    }

    console.log(`  version ${version.versionNumber} (id: ${version.id})`);
    console.log(`  scoringConfig.tierMetric: ${(version.scoringConfig as Record<string, unknown>)?.tierMetric ?? "?"}`);

    const scoringOk = isScoringConfigPatched(version.scoringConfig);
    const questionsOk = areQuestionsPatched(version.questions);

    console.log(`  scoringConfig: ${scoringOk ? "✓ ok" : "✗ needs fix"}`);
    console.log(`  questions (anchors): ${questionsOk ? "✓ ok" : "✗ needs fix"}`);

    if (scoringOk && questionsOk) {
      console.log("  ✓ Already fully patched — skipping.");
      continue;
    }

    const newQuestions = questionsOk
      ? version.questions
      : patchQuestions(version.questions);

    const newHash = computeContentHash({
      questions: newQuestions,
      sections: version.sections,
      scoringConfig: CORRECT_SCORING_CONFIG,
      reportConfig: version.reportConfig ?? null,
      invitationSubject: template.invitationSubject,
      invitationBodyMarkdown: template.invitationBodyMarkdown,
    });

    console.log(`  old hash: ${version.contentHash}`);
    console.log(`  new hash: ${newHash}`);

    if (DRY_RUN) {
      console.log("  ✓ DRY RUN: would update questions + scoringConfig + contentHash.");
      continue;
    }

    // The DB has an immutability trigger that blocks UPDATEs on published rows.
    // We bypass it with DISABLE/ENABLE TRIGGER inside a transaction so the guard
    // is restored even if the UPDATE fails.
    await db.$transaction([
      db.$executeRawUnsafe(
        `ALTER TABLE "assessment_template_versions" DISABLE TRIGGER assessment_template_version_immutability_trigger`
      ),
      db.$executeRawUnsafe(
        `UPDATE "assessment_template_versions" SET "questions" = $1::jsonb, "scoringConfig" = $2::jsonb, "contentHash" = $3 WHERE id = $4`,
        JSON.stringify(newQuestions),
        JSON.stringify(CORRECT_SCORING_CONFIG),
        newHash,
        version.id
      ),
      db.$executeRawUnsafe(
        `ALTER TABLE "assessment_template_versions" ENABLE TRIGGER assessment_template_version_immutability_trigger`
      ),
    ]);

    console.log("  ✓ Patched.");
  }

  console.log("\nDone.");
}

main()
  .catch((err) => {
    console.error("Fatal:", err);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
