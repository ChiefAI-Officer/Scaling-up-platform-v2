import {
  listRatingQuestionKeys,
  reconcileQuestionBenchmarks,
  reconcileQuestionBenchmarksInTx,
  type PeerBenchmarksDb,
  type PeerBenchmarksTx,
  type ReconcileQuestionBenchmarksInput,
  type ReconcileQuestionBenchmarksResult,
} from "@/lib/assessments/peer-benchmarks";
import {
  activePublishedWhere,
  DEFAULT_TEMPLATE_LANGUAGE,
} from "@/lib/assessments/active-version";
import {
  SCALING_UP_FULL_TEMPLATE_ALIAS,
  SU_FULL_QUESTION_BENCHMARKS,
  SU_FULL_QUESTION_BENCHMARKS_EFFECTIVE_DATE,
  SU_FULL_QUESTION_BENCHMARKS_SOURCE,
  SU_FULL_QUESTION_BENCHMARKS_VERSION,
} from "@/lib/assessments/su-full-question-benchmarks";

function buildSnapshotReconcileInput(
  templateId: string,
  versionQuestions: unknown,
): ReconcileQuestionBenchmarksInput {
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

  return {
    templateId,
    entries: SU_FULL_QUESTION_BENCHMARKS.map(({ stableKey, value }) => ({
      stableKey,
      value,
    })),
    validKeys: actualSet,
  };
}

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
  return reconcileQuestionBenchmarks(
    db,
    buildSnapshotReconcileInput(templateId, versionQuestions),
  );
}

interface ScalingUpFullBenchmarkRefreshTx extends PeerBenchmarksTx {
  assessmentTemplate: {
    findFirst(args: {
      where: { alias: string; deletedAt: null };
      select: { id: true };
    }): Promise<{ id: string } | null>;
  };
  assessmentTemplateVersion: {
    findFirst(args: {
      where: {
        templateId: string;
        language: string;
        publishedAt: { not: null };
        archivedAt: null;
      };
      orderBy: { versionNumber: "desc" };
      select: { id: true; versionNumber: true; questions: true };
    }): Promise<{
      id: string;
      versionNumber: number;
      questions: unknown;
    } | null>;
  };
  auditLog: {
    create(args: {
      data: {
        entityType: "ASSESSMENT_TEMPLATE";
        entityId: string;
        action: "BENCHMARKS_RECONCILED";
        performedBy: string;
        changes: string;
      };
    }): Promise<unknown>;
  };
}

export interface ScalingUpFullBenchmarkRefreshDb {
  $transaction<T>(
    fn: (tx: ScalingUpFullBenchmarkRefreshTx) => Promise<T>,
    options: { maxWait: number; timeout: number },
  ): Promise<T>;
}

export interface ScalingUpFullBenchmarkRefreshResult {
  templateId: string;
  templateVersionId: string;
  templateVersionNumber: number;
  previousCount: number;
  storedCount: number;
}

/**
 * Perform the explicit Scaling Up Full snapshot refresh and its audit write in
 * one transaction. `operator` is required so a production refresh is tied to
 * the person or automation identity that invoked it.
 */
export async function refreshScalingUpFullQuestionBenchmarkSnapshot(
  db: ScalingUpFullBenchmarkRefreshDb,
  operator: string,
): Promise<ScalingUpFullBenchmarkRefreshResult> {
  const performedBy = operator.trim();
  if (performedBy === "") {
    throw new Error(
      "Scaling Up Full benchmark refresh requires an explicit operator.",
    );
  }

  return db.$transaction(
    async (tx) => {
      const template = await tx.assessmentTemplate.findFirst({
        where: { alias: SCALING_UP_FULL_TEMPLATE_ALIAS, deletedAt: null },
        select: { id: true },
      });
      if (!template) {
        throw new Error(
          `Active template "${SCALING_UP_FULL_TEMPLATE_ALIAS}" was not found.`,
        );
      }

      const activeVersion = await tx.assessmentTemplateVersion.findFirst({
        where: {
          templateId: template.id,
          language: DEFAULT_TEMPLATE_LANGUAGE,
          ...activePublishedWhere,
        },
        orderBy: { versionNumber: "desc" },
        select: { id: true, versionNumber: true, questions: true },
      });
      if (!activeVersion) {
        throw new Error(
          `Template "${SCALING_UP_FULL_TEMPLATE_ALIAS}" has no active published ${DEFAULT_TEMPLATE_LANGUAGE} version.`,
        );
      }

      const { before, after } = await reconcileQuestionBenchmarksInTx(
        tx,
        buildSnapshotReconcileInput(template.id, activeVersion.questions),
      );

      await tx.auditLog.create({
        data: {
          entityType: "ASSESSMENT_TEMPLATE",
          entityId: template.id,
          action: "BENCHMARKS_RECONCILED",
          performedBy,
          changes: JSON.stringify({
            mechanism: "seed:scaling-up-full-peers",
            benchmarkVersion: SU_FULL_QUESTION_BENCHMARKS_VERSION,
            effectiveDate: SU_FULL_QUESTION_BENCHMARKS_EFFECTIVE_DATE,
            source: SU_FULL_QUESTION_BENCHMARKS_SOURCE,
            templateVersionId: activeVersion.id,
            templateVersionNumber: activeVersion.versionNumber,
            before,
            after,
          }),
        },
      });

      return {
        templateId: template.id,
        templateVersionId: activeVersion.id,
        templateVersionNumber: activeVersion.versionNumber,
        previousCount: Object.keys(before).length,
        storedCount: Object.keys(after).length,
      };
    },
    { maxWait: 10_000, timeout: 55_000 },
  );
}
