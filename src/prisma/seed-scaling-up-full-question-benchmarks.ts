/**
 * Seed/reconcile the verified 2026-08-14 Esperto per-question peer snapshot
 * for the active Scaling Up Full template.
 *
 * This is intentionally separate from the assessment-content seed. Running it
 * is an explicit benchmark refresh and therefore may replace manual values;
 * ordinary assessment seed runs cannot silently overwrite admin edits.
 *
 * Run: npm run seed:scaling-up-full-peers
 */

import { PrismaClient } from "@prisma/client";
import { activePublishedWhere } from "../src/lib/assessments/active-version";
import { reconcileScalingUpFullQuestionBenchmarkSnapshot } from "../src/lib/assessments/seed-su-full-question-benchmarks";
import {
  SCALING_UP_FULL_TEMPLATE_ALIAS,
  SU_FULL_QUESTION_BENCHMARKS_EFFECTIVE_DATE,
  SU_FULL_QUESTION_BENCHMARKS_SOURCE,
  SU_FULL_QUESTION_BENCHMARKS_VERSION,
} from "../src/lib/assessments/su-full-question-benchmarks";

const db = new PrismaClient();

async function main(): Promise<void> {
  const template = await db.assessmentTemplate.findFirst({
    where: { alias: SCALING_UP_FULL_TEMPLATE_ALIAS, deletedAt: null },
    select: { id: true },
  });
  if (!template) {
    throw new Error(
      `Active template "${SCALING_UP_FULL_TEMPLATE_ALIAS}" was not found.`,
    );
  }

  const activeVersion = await db.assessmentTemplateVersion.findFirst({
    where: { templateId: template.id, ...activePublishedWhere },
    orderBy: { versionNumber: "desc" },
    select: { id: true, versionNumber: true, questions: true },
  });
  if (!activeVersion) {
    throw new Error(
      `Template "${SCALING_UP_FULL_TEMPLATE_ALIAS}" has no active published version.`,
    );
  }

  const { before, after } =
    await reconcileScalingUpFullQuestionBenchmarkSnapshot(
      db,
      template.id,
      activeVersion.questions,
    );

  console.log(
    JSON.stringify({
      seed: "scaling-up-full-question-benchmarks",
      templateId: template.id,
      templateVersionId: activeVersion.id,
      templateVersionNumber: activeVersion.versionNumber,
      benchmarkVersion: SU_FULL_QUESTION_BENCHMARKS_VERSION,
      effectiveDate: SU_FULL_QUESTION_BENCHMARKS_EFFECTIVE_DATE,
      source: SU_FULL_QUESTION_BENCHMARKS_SOURCE,
      previousCount: Object.keys(before).length,
      storedCount: Object.keys(after).length,
    }),
  );
}

if (require.main === module) {
  main()
    .catch((error) => {
      console.error(
        "[seed-scaling-up-full-question-benchmarks] FAILED:",
        error,
      );
      process.exit(1);
    })
    .finally(async () => {
      await db.$disconnect();
    });
}
