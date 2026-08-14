import {
  listRatingQuestionKeys,
  reconcileQuestionBenchmarks,
  type PeerBenchmarksDb,
  type ReconcileQuestionBenchmarksResult,
} from "@/lib/assessments/peer-benchmarks";
import { SU_FULL_QUESTION_BENCHMARKS } from "@/lib/assessments/su-full-question-benchmarks";

/**
 * Reconcile the verified Scaling Up Full question snapshot into the shared
 * AssessmentBenchmark table.
 *
 * This fail-closes if the selected template version no longer has exactly the
 * expected 61 rating-question keys. It prevents a seed run from silently
 * attaching benchmark values to a drifted assessment definition.
 */
export async function reconcileScalingUpFullQuestionBenchmarkSnapshot(
  db: PeerBenchmarksDb,
  templateId: string,
  versionQuestions: unknown,
): Promise<ReconcileQuestionBenchmarksResult> {
  const actualKeys = listRatingQuestionKeys(versionQuestions).map(
    (question) => question.stableKey,
  );
  const expectedKeys = SU_FULL_QUESTION_BENCHMARKS.map(
    (entry) => entry.stableKey,
  );
  const actualSet = new Set(actualKeys);
  const expectedSet: ReadonlySet<string> = new Set<string>(expectedKeys);
  const missing = expectedKeys.filter((key) => !actualSet.has(key));
  const extra = actualKeys.filter((key) => !expectedSet.has(key));
  const duplicates = actualKeys.filter(
    (key, index) => actualKeys.indexOf(key) !== index,
  );

  if (
    actualKeys.length !== expectedKeys.length ||
    missing.length > 0 ||
    extra.length > 0 ||
    duplicates.length > 0
  ) {
    throw new Error(
      `Scaling Up Full benchmark question-key mismatch: missing=[${missing.join(
        ", ",
      )}], extra=[${extra.join(", ")}], duplicates=[${duplicates.join(", ")}].`,
    );
  }

  return reconcileQuestionBenchmarks(db, {
    templateId,
    entries: SU_FULL_QUESTION_BENCHMARKS.map(({ stableKey, value }) => ({
      stableKey,
      value,
    })),
    validKeys: actualSet,
  });
}
