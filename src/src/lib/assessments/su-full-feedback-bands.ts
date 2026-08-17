import { computeTemplateContentHash } from "@/lib/assessments/template-content-hash";
import { getPublishValidationIssues } from "@/lib/assessments/scoring";
import {
  activePublishedWhere,
  DEFAULT_TEMPLATE_LANGUAGE,
} from "@/lib/assessments/active-version";
import {
  isPrivilegedRole,
  normalizeRole,
} from "@/lib/auth/access-control";

export const LEGACY_SU_FULL_FEEDBACK_RANGES = [
  [0, 2],
  [3, 4],
  [5, 6],
  [7, 9],
  [10, 10],
] as const;

export const ESPERTO_SU_FULL_FEEDBACK_RANGES = [
  [0, 2],
  [3, 4],
  [5, 6],
  [7, 8],
  [9, 10],
] as const;

const TEMPLATE_ALIAS = "scaling-up-full";
const EXPECTED_QUESTION_COUNT = 61;
const EXPECTED_FEEDBACK_RECORD_COUNT = 305;

type FeedbackRecord = Record<string, unknown> & {
  minScore: number;
  maxScore: number;
  text: string;
};

type QuestionRecord = Record<string, unknown> & {
  stableKey?: unknown;
  type?: unknown;
  recommendations?: unknown;
};

export interface FeedbackBandPatchResult {
  changed: boolean;
  questions: unknown[];
  questionCount: number;
  feedbackRecordCount: number;
}

export function patchScalingUpFullFeedbackBandQuestions(
  questions: unknown,
): FeedbackBandPatchResult {
  if (!Array.isArray(questions)) {
    throw new Error("Scaling Up Full questions must be an array.");
  }

  const sliderRows: Array<{
    index: number;
    question: QuestionRecord;
    recommendations: FeedbackRecord[];
    shape: "legacy" | "corrected";
  }> = [];

  for (const [index, rawQuestion] of questions.entries()) {
    if (!rawQuestion || typeof rawQuestion !== "object") continue;
    const question = rawQuestion as QuestionRecord;
    if (question.type !== "SLIDER_LIKERT") continue;
    const stableKey =
      typeof question.stableKey === "string"
        ? question.stableKey
        : `question-${index + 1}`;
    if (!Array.isArray(question.recommendations)) {
      throw new Error(
        `Scaling Up Full question ${stableKey} has no feedback records.`,
      );
    }
    const recommendations = question.recommendations as FeedbackRecord[];
    if (
      recommendations.length !== 5 ||
      recommendations.some(
        (band) =>
          !band ||
          typeof band !== "object" ||
          typeof band.minScore !== "number" ||
          typeof band.maxScore !== "number" ||
          typeof band.text !== "string",
      )
    ) {
      throw new Error(
        `Scaling Up Full question ${stableKey} must have five complete feedback records.`,
      );
    }

    const shape = recommendations.map((band) => [
      band.minScore,
      band.maxScore,
    ]);
    const serializedShape = JSON.stringify(shape);
    const legacy = JSON.stringify(LEGACY_SU_FULL_FEEDBACK_RANGES);
    const corrected = JSON.stringify(ESPERTO_SU_FULL_FEEDBACK_RANGES);
    if (serializedShape !== legacy && serializedShape !== corrected) {
      throw new Error(
        `Mixed or unrecognized feedback ranges for Scaling Up Full question ${stableKey}.`,
      );
    }
    sliderRows.push({
      index,
      question,
      recommendations,
      shape: serializedShape === legacy ? "legacy" : "corrected",
    });
  }

  if (sliderRows.length !== EXPECTED_QUESTION_COUNT) {
    throw new Error(
      `Scaling Up Full expected ${EXPECTED_QUESTION_COUNT} scored questions, found ${sliderRows.length}.`,
    );
  }
  const shapes = new Set(sliderRows.map((row) => row.shape));
  if (shapes.size !== 1) {
    const keys = sliderRows
      .map((row) => String(row.question.stableKey ?? row.index + 1))
      .join(", ");
    throw new Error(
      `Mixed or unrecognized feedback ranges across Scaling Up Full questions: ${keys}.`,
    );
  }

  const feedbackRecordCount = sliderRows.reduce(
    (count, row) => count + row.recommendations.length,
    0,
  );
  if (feedbackRecordCount !== EXPECTED_FEEDBACK_RECORD_COUNT) {
    throw new Error(
      `Scaling Up Full expected ${EXPECTED_FEEDBACK_RECORD_COUNT} feedback records, found ${feedbackRecordCount}.`,
    );
  }

  const changed = sliderRows[0].shape === "legacy";
  if (!changed) {
    return {
      changed: false,
      questions,
      questionCount: sliderRows.length,
      feedbackRecordCount,
    };
  }

  const patchedQuestions = questions.map((rawQuestion, index) => {
    const slider = sliderRows.find((row) => row.index === index);
    if (!slider) return rawQuestion;
    return {
      ...slider.question,
      recommendations: slider.recommendations.map((band, bandIndex) => ({
        ...band,
        minScore: ESPERTO_SU_FULL_FEEDBACK_RANGES[bandIndex][0],
        maxScore: ESPERTO_SU_FULL_FEEDBACK_RANGES[bandIndex][1],
      })),
    };
  });

  const beforeTexts = sliderRows.map((row) =>
    row.recommendations.map((band) => band.text),
  );
  const afterTexts = (patchedQuestions as QuestionRecord[])
    .filter((question) => question.type === "SLIDER_LIKERT")
    .map((question) =>
      (question.recommendations as FeedbackRecord[]).map((band) => band.text),
    );
  if (JSON.stringify(beforeTexts) !== JSON.stringify(afterTexts)) {
    throw new Error("Feedback text changed while patching score boundaries.");
  }

  return {
    changed: true,
    questions: patchedQuestions,
    questionCount: sliderRows.length,
    feedbackRecordCount,
  };
}

interface VersionRow {
  id: string;
  versionNumber: number;
  language: string;
  questions: unknown;
  sections: unknown;
  scoringConfig: unknown;
  reportConfig: unknown;
  contentHash: string;
  publishedAt: Date | null;
  archivedAt: Date | null;
}

interface FeedbackBandDraftTx {
  assessmentTemplate: {
    findFirst(args: unknown): Promise<{
      id: string;
      invitationSubject: string;
      invitationBodyMarkdown: string;
    } | null>;
  };
  assessmentTemplateVersion: {
    findFirst(args: unknown): Promise<VersionRow | null>;
    create(args: { data: Record<string, unknown> }): Promise<{
      id: string;
      versionNumber: number;
    }>;
  };
  auditLog: {
    create(args: { data: Record<string, unknown> }): Promise<unknown>;
  };
}

export interface FeedbackBandDraftDb {
  $transaction<T>(
    fn: (tx: FeedbackBandDraftTx) => Promise<T>,
    options: { maxWait: number; timeout: number },
  ): Promise<T>;
}

export interface FeedbackBandDraftResult {
  action: "created" | "noop" | "planned";
  templateId: string;
  sourceVersionId: string;
  sourceVersionNumber: number;
  draftVersionId: string;
  draftVersionNumber: number;
  questionCount: number;
  feedbackRecordCount: number;
}

export async function createScalingUpFullFeedbackBandDraft(
  db: FeedbackBandDraftDb,
  operator: string,
  options: { dryRun?: boolean } = {},
): Promise<FeedbackBandDraftResult> {
  const performedBy = operator.trim();
  if (performedBy === "") {
    throw new Error(
      "Scaling Up Full feedback-band patch requires an explicit operator.",
    );
  }

  return db.$transaction(
    async (tx) => {
      const template = await tx.assessmentTemplate.findFirst({
        where: { alias: TEMPLATE_ALIAS, deletedAt: null },
        select: {
          id: true,
          invitationSubject: true,
          invitationBodyMarkdown: true,
        },
      });
      if (!template) {
        throw new Error(`Active template "${TEMPLATE_ALIAS}" was not found.`);
      }

      const [latestVersion, activeVersion] = await Promise.all([
        tx.assessmentTemplateVersion.findFirst({
          where: {
            templateId: template.id,
            language: DEFAULT_TEMPLATE_LANGUAGE,
          },
          orderBy: { versionNumber: "desc" },
          select: {
            id: true,
            versionNumber: true,
            language: true,
            questions: true,
            sections: true,
            scoringConfig: true,
            reportConfig: true,
            contentHash: true,
            publishedAt: true,
            archivedAt: true,
          },
        }),
        tx.assessmentTemplateVersion.findFirst({
          where: {
            templateId: template.id,
            language: DEFAULT_TEMPLATE_LANGUAGE,
            ...activePublishedWhere,
          },
          orderBy: { versionNumber: "desc" },
          select: {
            id: true,
            versionNumber: true,
            language: true,
            questions: true,
            sections: true,
            scoringConfig: true,
            reportConfig: true,
            contentHash: true,
            publishedAt: true,
            archivedAt: true,
          },
        }),
      ]);
      if (!latestVersion || !activeVersion) {
        throw new Error(
          `Template "${TEMPLATE_ALIAS}" has no active published ${DEFAULT_TEMPLATE_LANGUAGE} version.`,
        );
      }

      const patch = patchScalingUpFullFeedbackBandQuestions(
        activeVersion.questions,
      );
      const contentHash = computeTemplateContentHash({
        questions: patch.questions,
        sections: activeVersion.sections,
        scoringConfig: activeVersion.scoringConfig,
        reportConfig: activeVersion.reportConfig ?? null,
        invitationSubject: template.invitationSubject,
        invitationBodyMarkdown: template.invitationBodyMarkdown,
      });

      if (latestVersion.publishedAt === null) {
        if (latestVersion.contentHash === contentHash) {
          return {
            action: "noop" as const,
            templateId: template.id,
            sourceVersionId: activeVersion.id,
            sourceVersionNumber: activeVersion.versionNumber,
            draftVersionId: latestVersion.id,
            draftVersionNumber: latestVersion.versionNumber,
            questionCount: patch.questionCount,
            feedbackRecordCount: patch.feedbackRecordCount,
          };
        }
        throw new Error(
          `Template "${TEMPLATE_ALIAS}" already has unpublished draft version ${latestVersion.versionNumber}; refusing to supersede it.`,
        );
      }

      if (!patch.changed && activeVersion.contentHash === contentHash) {
        return {
          action: "noop" as const,
          templateId: template.id,
          sourceVersionId: activeVersion.id,
          sourceVersionNumber: activeVersion.versionNumber,
          draftVersionId: activeVersion.id,
          draftVersionNumber: activeVersion.versionNumber,
          questionCount: patch.questionCount,
          feedbackRecordCount: patch.feedbackRecordCount,
        };
      }

      const draftVersionNumber = latestVersion.versionNumber + 1;
      if (options.dryRun) {
        return {
          action: "planned" as const,
          templateId: template.id,
          sourceVersionId: activeVersion.id,
          sourceVersionNumber: activeVersion.versionNumber,
          draftVersionId: "dry-run",
          draftVersionNumber,
          questionCount: patch.questionCount,
          feedbackRecordCount: patch.feedbackRecordCount,
        };
      }
      const created = await tx.assessmentTemplateVersion.create({
        data: {
          templateId: template.id,
          versionNumber: draftVersionNumber,
          language: activeVersion.language,
          questions: patch.questions,
          sections: activeVersion.sections,
          scoringConfig: activeVersion.scoringConfig,
          reportConfig: activeVersion.reportConfig ?? null,
          contentHash,
          publishedAt: null,
          publishedBy: null,
        },
      });

      await tx.auditLog.create({
        data: {
          entityType: "AssessmentTemplateVersion",
          entityId: created.id,
          action: "SU_FULL_FEEDBACK_BANDS_PATCHED",
          performedBy,
          changes: JSON.stringify({
            mechanism: "esperto-controlled-feedback-sweep",
            evidenceDate: "2026-08-14",
            sourceVersionId: activeVersion.id,
            sourceVersionNumber: activeVersion.versionNumber,
            draftVersionNumber,
            beforeRanges: LEGACY_SU_FULL_FEEDBACK_RANGES,
            afterRanges: ESPERTO_SU_FULL_FEEDBACK_RANGES,
            questionCount: patch.questionCount,
            feedbackRecordCount: patch.feedbackRecordCount,
            feedbackTextPreserved: true,
            contentHash,
          }),
        },
      });

      return {
        action: "created" as const,
        templateId: template.id,
        sourceVersionId: activeVersion.id,
        sourceVersionNumber: activeVersion.versionNumber,
        draftVersionId: created.id,
        draftVersionNumber: created.versionNumber,
        questionCount: patch.questionCount,
        feedbackRecordCount: patch.feedbackRecordCount,
      };
    },
    { maxWait: 10_000, timeout: 55_000 },
  );
}

export async function publishScalingUpFullFeedbackBandDraft(
  db: FeedbackBandPublishDb,
  operatorEmail: string,
  versionId: string,
): Promise<FeedbackBandPublishResult> {
  const email = operatorEmail.trim().toLowerCase();
  if (email === "") {
    throw new Error(
      "Scaling Up Full feedback-band publish requires an explicit operator email.",
    );
  }
  if (versionId.trim() === "") {
    throw new Error("Scaling Up Full feedback-band publish requires a version ID.");
  }

  return db.$transaction(
    async (tx) => {
      const [actor, template] = await Promise.all([
        tx.user.findUnique({
          where: { email },
          select: { id: true, email: true, role: true, deletedAt: true },
        }),
        tx.assessmentTemplate.findFirst({
          where: { alias: TEMPLATE_ALIAS, deletedAt: null },
          select: { id: true },
        }),
      ]);
      if (
        !actor ||
        actor.deletedAt !== null ||
        !isPrivilegedRole(normalizeRole(actor.role))
      ) {
        throw new Error(
          `Active privileged operator "${email}" was not found.`,
        );
      }
      if (!template) {
        throw new Error(`Active template "${TEMPLATE_ALIAS}" was not found.`);
      }

      const version = await tx.assessmentTemplateVersion.findFirst({
        where: {
          id: versionId,
          templateId: template.id,
          language: DEFAULT_TEMPLATE_LANGUAGE,
        },
        select: {
          id: true,
          templateId: true,
          versionNumber: true,
          contentHash: true,
          publishedAt: true,
          questions: true,
          sections: true,
          scoringConfig: true,
        },
      });
      if (!version) {
        throw new Error(
          `Scaling Up Full version "${versionId}" was not found.`,
        );
      }

      const boundaryCheck = patchScalingUpFullFeedbackBandQuestions(
        version.questions,
      );
      if (boundaryCheck.changed) {
        throw new Error(
          `Scaling Up Full version ${version.versionNumber} still has legacy feedback boundaries.`,
        );
      }

      const patchAudit = await tx.auditLog.findFirst({
        where: {
          entityType: "AssessmentTemplateVersion",
          entityId: version.id,
          action: "SU_FULL_FEEDBACK_BANDS_PATCHED",
        },
        orderBy: { timestamp: "desc" },
        select: { changes: true },
      });
      if (!patchAudit) {
        throw new Error(
          `Scaling Up Full version ${version.versionNumber} has no feedback-band patch audit receipt.`,
        );
      }
      let receipt: Record<string, unknown>;
      try {
        receipt = JSON.parse(patchAudit.changes) as Record<string, unknown>;
      } catch {
        throw new Error(
          `Scaling Up Full version ${version.versionNumber} has an invalid patch audit receipt.`,
        );
      }
      if (
        receipt.contentHash !== version.contentHash ||
        receipt.feedbackTextPreserved !== true
      ) {
        throw new Error(
          `Scaling Up Full version ${version.versionNumber} does not match its patch audit receipt.`,
        );
      }

      if (version.publishedAt !== null) {
        return {
          action: "noop" as const,
          templateId: template.id,
          versionId: version.id,
          versionNumber: version.versionNumber,
          publishedAt: version.publishedAt,
          publishedBy: actor.email,
        };
      }

      const publishIssues = getPublishValidationIssues({
        questions: version.questions,
        sections: version.sections,
        scoringConfig: version.scoringConfig,
      });
      if (publishIssues.length > 0) {
        throw new Error(
          `Scaling Up Full version ${version.versionNumber} failed publish validation: ${JSON.stringify(
            publishIssues,
          )}`,
        );
      }

      const publishedAt = new Date();
      const updated = await tx.assessmentTemplateVersion.updateMany({
        where: {
          id: version.id,
          templateId: template.id,
          contentHash: version.contentHash,
          publishedAt: null,
        },
        data: { publishedAt, publishedBy: actor.id },
      });
      if (updated.count !== 1) {
        throw new Error(
          `Scaling Up Full version ${version.versionNumber} changed before publish; refusing to continue.`,
        );
      }

      await tx.auditLog.create({
        data: {
          entityType: "AssessmentTemplateVersion",
          entityId: version.id,
          action: "UPDATE",
          performedBy: actor.email,
          changes: JSON.stringify({
            publishedAt: publishedAt.toISOString(),
            versionNumber: version.versionNumber,
            mechanism: "guarded-feedback-band-publish",
          }),
        },
      });

      return {
        action: "published" as const,
        templateId: template.id,
        versionId: version.id,
        versionNumber: version.versionNumber,
        publishedAt,
        publishedBy: actor.email,
      };
    },
    { maxWait: 10_000, timeout: 55_000 },
  );
}

interface FeedbackBandPublishTx {
  user: {
    findUnique(args: unknown): Promise<{
      id: string;
      email: string;
      role: string;
      deletedAt: Date | null;
    } | null>;
  };
  assessmentTemplate: {
    findFirst(args: unknown): Promise<{ id: string } | null>;
  };
  assessmentTemplateVersion: {
    findFirst(args: unknown): Promise<{
      id: string;
      templateId: string;
      versionNumber: number;
      contentHash: string;
      publishedAt: Date | null;
      questions: unknown;
      sections: unknown;
      scoringConfig: unknown;
    } | null>;
    updateMany(args: {
      where: Record<string, unknown>;
      data: Record<string, unknown>;
    }): Promise<{ count: number }>;
  };
  auditLog: {
    findFirst(args: unknown): Promise<{ changes: string } | null>;
    create(args: { data: Record<string, unknown> }): Promise<unknown>;
  };
}

export interface FeedbackBandPublishDb {
  $transaction<T>(
    fn: (tx: FeedbackBandPublishTx) => Promise<T>,
    options: { maxWait: number; timeout: number },
  ): Promise<T>;
}

export interface FeedbackBandPublishResult {
  action: "published" | "noop";
  templateId: string;
  versionId: string;
  versionNumber: number;
  publishedAt: Date;
  publishedBy: string;
}
