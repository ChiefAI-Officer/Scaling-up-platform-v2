/**
 * Seed/reconcile the verified 2026-08-14 Esperto per-question peer snapshot
 * for the active Scaling Up Full template.
 *
 * This is intentionally separate from the assessment-content seed. Running it
 * is an explicit benchmark refresh and therefore may replace manual values;
 * ordinary assessment seed runs cannot silently overwrite admin edits. The
 * required operator plus source/version/effective date and full before/after
 * delta are committed to AuditLog in the same transaction as the refresh.
 *
 * Run: BENCHMARK_REFRESH_ACTOR=you@example.com npm run seed:scaling-up-full-peers
 */

import { PrismaClient } from "@prisma/client";
import { refreshScalingUpFullQuestionBenchmarkSnapshot } from "../src/lib/assessments/seed-su-full-question-benchmarks";
import {
  SU_FULL_QUESTION_BENCHMARKS_EFFECTIVE_DATE,
  SU_FULL_QUESTION_BENCHMARKS_SOURCE,
  SU_FULL_QUESTION_BENCHMARKS_VERSION,
} from "../src/lib/assessments/su-full-question-benchmarks";

const db = new PrismaClient();

async function main(): Promise<void> {
  const operator = process.env.BENCHMARK_REFRESH_ACTOR ?? "";
  const result = await refreshScalingUpFullQuestionBenchmarkSnapshot(
    db,
    operator,
  );

  console.log(
    JSON.stringify({
      seed: "scaling-up-full-question-benchmarks",
      operator,
      templateId: result.templateId,
      templateVersionId: result.templateVersionId,
      templateVersionNumber: result.templateVersionNumber,
      benchmarkVersion: SU_FULL_QUESTION_BENCHMARKS_VERSION,
      effectiveDate: SU_FULL_QUESTION_BENCHMARKS_EFFECTIVE_DATE,
      source: SU_FULL_QUESTION_BENCHMARKS_SOURCE,
      previousCount: result.previousCount,
      storedCount: result.storedCount,
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
