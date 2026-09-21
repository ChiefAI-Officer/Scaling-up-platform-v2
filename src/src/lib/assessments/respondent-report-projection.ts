/**
 * Pure report projection plus presentation lookup.
 *
 * This module performs no actor authorization and opens no transaction. Its
 * caller must authorize and load the frozen submission in one transaction.
 */
import type { ScoreResult } from "@/lib/assessments/scoring";
import { respondentDisplayName } from "@/lib/assessments/respondent-display-name";
import { buildQuestionMetaByKey, type QuestionMeta } from "@/lib/assessments/question-meta";
import { isReportStylesEnabled } from "@/lib/assessments/wave-report-styles-flags";
import {
  resolveActiveReportHtml,
  resolvePublishedReportHtmlForTemplate,
} from "@/lib/assessments/report-html";
import type { ActiveVersionDb } from "@/lib/assessments/active-version";
import type {
  RawSubmission,
  RespondentReport,
  RespondentReportOutcome,
  StoredRespondentReportInput,
} from "@/lib/assessments/respondent-report";

export function isScoreResult(value: unknown): value is ScoreResult {
  if (!value || typeof value !== "object") return false;
  const result = value as Record<string, unknown>;
  return Array.isArray(result.perSection) && Array.isArray(result.perQuestion);
}

/** Build the canonical report model from frozen stored submission data. */
export function buildStoredRespondentReport(
  input: StoredRespondentReportInput,
): RespondentReport {
  const questionsByKey: Record<string, QuestionMeta> = buildQuestionMetaByKey(
    input.campaign.version.questions,
  );
  const questionByKey: Record<string, string> = {};
  for (const [key, meta] of Object.entries(questionsByKey)) questionByKey[key] = meta.label;

  const creatorCoach = input.campaign.creatorCoach;
  const reportHtml = input.reportHtml ?? resolveActiveReportHtml(input.campaign.version.reportConfig);

  return {
    respondentName: respondentDisplayName(
      input.respondent.firstName,
      input.respondent.lastName,
      input.respondent.email,
    ),
    respondentEmail: input.respondent.email?.trim() || null,
    jobTitle: input.respondent.jobTitle ?? null,
    companyName: input.campaign.organizationName,
    assessmentName: input.campaign.template.name,
    // Required: renderers dispatch on the stable alias; omission silently
    // selects the default report configuration.
    templateAlias: input.campaign.template.alias,
    reportStyle: input.campaign.reportStyle,
    campaignLabel:
      input.campaign.name && input.campaign.name.trim() !== "" ? input.campaign.name : null,
    submittedAt: input.submission.submittedAt,
    result: input.submission.result as ScoreResult,
    sections: input.campaign.version.sections,
    questionByKey,
    questionsByKey,
    rawAnswers: input.submission.answers,
    scoringConfig: input.campaign.version.scoringConfig,
    ...(reportHtml ? { reportHtml } : {}),
    provenance: {
      submissionId: input.submission.id,
      versionId: input.campaign.version.id,
      contentHash: input.campaign.version.contentHash,
      templateName: input.campaign.template.name,
      ...(input.presentationVersionId
        ? { presentationVersionId: input.presentationVersionId }
        : {}),
    },
    degraded: !isScoreResult(input.submission.result),
    coachLogoUrl: creatorCoach?.profileImage ?? null,
    coachName: creatorCoach ? `${creatorCoach.firstName} ${creatorCoach.lastName}` : null,
    isImported: input.campaign.importManifest != null,
  };
}

export async function projectRespondentReport(
  db: ActiveVersionDb,
  submission: RawSubmission,
  campaignId: string,
): Promise<RespondentReportOutcome> {
  const presentation = await resolvePublishedReportHtmlForTemplate(
    db,
    submission.campaign.template.id,
    submission.campaign.language,
  );
  return {
    status: "ok",
    report: buildStoredRespondentReport({
      submission: {
        id: submission.id,
        submittedAt: submission.submittedAt,
        answers: submission.answers,
        result: submission.result,
      },
      respondent: submission.respondent,
      ...(presentation
        ? { reportHtml: presentation.reportHtml, presentationVersionId: presentation.versionId }
        : {}),
      campaign: {
        name: submission.campaign.name,
        reportStyle: submission.campaign.reportStyle,
        organizationName: submission.campaign.organization.name,
        template: submission.campaign.template,
        creatorCoach: submission.campaign.creatorCoach,
        version: submission.campaign.version,
        importManifest: submission.campaign.importManifest,
      },
    }),
    reportStylesAvailable: isReportStylesEnabled({
      templateId: submission.campaign.template.id,
      campaignId,
    }),
  };
}
