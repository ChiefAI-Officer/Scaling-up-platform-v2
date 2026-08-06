import type { QuestionMeta, RespondentReport } from "@/lib/assessments/respondent-report";
import type { PerQuestionResult, PerSectionResult, ScoreResult } from "@/lib/assessments/scoring";
import { parseResolvedFindings } from "@/lib/assessments/findings-section-model";
import { reportConfigFor } from "@/lib/assessments/report-config";
import {
  domainColor,
  formatReportDate,
  formatReportMetric,
  headlineForTierMetric,
  isNeutralTier,
  showAchievementMarkers,
} from "@/lib/assessments/report-presentation";
import {
  greetingName,
  respondentNameMatchesEmail,
} from "@/lib/assessments/respondent-display-name";

interface ParsedSection {
  stableKey: string;
  name: string;
  domain: string | null;
  questionKeys: string[];
}

export interface ScoredReportQuestionView {
  stableKey: string;
  label: string;
  unmapped: boolean;
  value: number;
  maximum: number | null;
  scoreLabel: string;
  achieved: boolean;
  achievementMarker: { symbol: "✓" | "✕"; label: "achieved" | "not achieved" } | null;
}

export interface ScoredReportSectionView {
  stableKey: string;
  label: string;
  domain: string | null;
  color: string | null;
  totalPoints: number;
  totalPointsLabel: string;
  averagePoints: number;
  averagePointsLabel: string;
  achievedCount: number;
  totalCount: number;
  questions: ScoredReportQuestionView[];
}

export interface ScoredReportRecommendationGroup {
  sectionStableKey: string | null;
  label: string;
  items: Array<{ stableKey: string; text: string }>;
}

export interface ScoredReportDecisionView {
  stableKey: string;
  label: string;
  /** Mean of answered section means, not the report's weighted item average. */
  averageAcrossSections: number | null;
  averageAcrossSectionsLabel: string;
  totalPoints: number;
  totalPointsLabel: string;
  color: string;
}

export interface ScoredReportViewModel {
  identity: {
    assessmentName: string;
    campaignLabel: string | null;
    /** Existing Classic rule: suppress a campaign label duplicating the report title. */
    campaignSubtitle: string | null;
    respondentName: string;
    respondentEmail: string | null;
    respondentNameIsEmail: boolean;
    jobTitle: string | null;
    companyName: string;
    submittedAtLabel: string;
  };
  summary: {
    headline: string;
    headlineLabel: string;
    tierMessage: string | null;
    showTier: boolean;
    neutral: boolean;
    overallAverage: number;
    overallAverageLabel: string;
    overallTotal: number;
    overallTotalLabel: string;
    answeredItems: number;
    sectionCount: number;
    achievementMarkersVisible: boolean;
  };
  decisions: ScoredReportDecisionView[];
  insights: {
    strengths: ScoredReportDecisionView[];
    priorities: ScoredReportDecisionView[];
  };
  sections: ScoredReportSectionView[];
  orphanQuestions: ScoredReportQuestionView[];
  scorecard: {
    visible: boolean;
    rows: Array<{
      stableKey: string;
      label: string;
      color: string | null;
      totalPoints: number;
      totalPointsLabel: string;
      averagePoints: number;
      averagePointsLabel: string;
    }>;
    total: { totalPoints: number; overallAverage: number };
  };
  recommendations: ScoredReportRecommendationGroup[];
  /** Frozen non-slider findings, selected only by applyScoredReportFindingsPolicy. */
  findingRecommendations: ScoredReportRecommendationGroup[];
  additionalResponses: Array<{ label: string; answer: string }>;
  cta: {
    eligible: boolean;
    contactEmail: string | null;
    label: "Talk to a Coach →";
    href: string;
    learnMoreHref: "https://scalingup.com";
  };
  coach: { name: string | null; logoUrl: string | null };
  provenance: {
    submissionId: string | null;
    versionId: string | null;
    contentHash: string | null;
    templateName: string;
    imported: boolean;
  };
  closingGreeting: string;
  degraded: boolean;
}

function parseSections(raw: unknown): ParsedSection[] {
  if (!Array.isArray(raw)) return [];
  const sections: ParsedSection[] = [];
  for (const rawSection of raw) {
    if (!rawSection || typeof rawSection !== "object") continue;
    const section = rawSection as Record<string, unknown>;
    if (typeof section.stableKey !== "string" || section.stableKey === "") continue;
    const questionKeys: string[] = [];
    if (Array.isArray(section.questions)) {
      for (const question of section.questions) {
        if (typeof question === "string") questionKeys.push(question);
        else if (question && typeof question === "object") {
          const key = (question as Record<string, unknown>).stableKey;
          if (typeof key === "string") questionKeys.push(key);
        }
      }
    }
    sections.push({
      stableKey: section.stableKey,
      name: typeof section.name === "string" && section.name !== "" ? section.name : section.stableKey,
      domain: typeof section.domain === "string" && section.domain !== "" ? section.domain : null,
      questionKeys,
    });
  }
  return sections;
}

function perQuestion(result: unknown): PerQuestionResult[] {
  const value = (result as Partial<ScoreResult> | null | undefined)?.perQuestion;
  if (!Array.isArray(value)) return [];
  return value.filter((row): row is PerQuestionResult =>
    !!row && typeof row === "object" && typeof row.stableKey === "string" &&
    typeof row.value === "number" && typeof row.achieved === "boolean",
  );
}

function perSection(result: unknown): PerSectionResult[] {
  const value = (result as Partial<ScoreResult> | null | undefined)?.perSection;
  if (!Array.isArray(value)) return [];
  return value.filter((row): row is PerSectionResult =>
    !!row && typeof row === "object" && typeof row.stableKey === "string",
  );
}

function displayAnswer(value: unknown, meta: QuestionMeta): string {
  if (Array.isArray(value) && meta.options && meta.options.length > 0) {
    const labelByKey = new Map(meta.options.map((option) => [option.key, option.label]));
    return value.map((entry) => labelByKey.get(String(entry)) ?? String(entry)).join(", ");
  }
  if (Array.isArray(value)) return value.map((entry) => String(entry)).join(", ");
  if (value === null || value === undefined) return "";
  if (typeof value === "object") {
    try {
      return JSON.stringify(value);
    } catch {
      return "";
    }
  }
  return String(value);
}

function labelFor(report: RespondentReport, stableKey: string): { label: string; unmapped: boolean } {
  const label = report.questionByKey?.[stableKey];
  return label && label.trim() !== ""
    ? { label, unmapped: false }
    : { label: stableKey, unmapped: true };
}

function asQuestionView(
  report: RespondentReport,
  row: PerQuestionResult,
  achievementMarkersVisible: boolean,
): ScoredReportQuestionView {
  const label = labelFor(report, row.stableKey);
  const maximum = report.questionsByKey?.[row.stableKey]?.max;
  return {
    stableKey: row.stableKey,
    ...label,
    value: row.value,
    maximum: typeof maximum === "number" ? maximum : null,
    scoreLabel: typeof maximum === "number"
      ? `${formatReportMetric(row.value)} / ${formatReportMetric(maximum)}`
      : formatReportMetric(row.value),
    achieved: row.achieved,
    achievementMarker: achievementMarkersVisible
      ? { symbol: row.achieved ? "✓" : "✕", label: row.achieved ? "achieved" : "not achieved" }
      : null,
  };
}

function normalizeContactEmail(value: string | null | undefined): string | null {
  const normalized = value?.trim() ?? "";
  return normalized === "" ? null : normalized;
}

function ctaFor(contactEmail: string | null, eligible: boolean): ScoredReportViewModel["cta"] {
  return {
    eligible,
    contactEmail,
    label: "Talk to a Coach →",
    href: contactEmail === null
      ? "https://scalingup.com/coaches"
      : `mailto:${encodeURIComponent(contactEmail)}`,
    learnMoreHref: "https://scalingup.com",
  };
}

/**
 * Pure canonical content transformation for scored individual reports.
 * It accepts a frozen loader result, never re-scores it, reads no flags, and
 * does not mutate the report or any nested value.
 */
export function buildScoredReportViewModel(report: RespondentReport): ScoredReportViewModel {
  const result = (report.result ?? {}) as Partial<ScoreResult>;
  const scoredQuestions = perQuestion(result);
  const scoredSections = perSection(result);
  const parsedByKey = new Map(parseSections(report.sections).map((section) => [section.stableKey, section]));
  const byQuestionKey = new Map(scoredQuestions.map((question) => [question.stableKey, question]));
  const questionKeysBySection = new Map<string, string[]>();
  for (const question of scoredQuestions) {
    const sectionKey = report.questionsByKey?.[question.stableKey]?.sectionStableKey;
    if (!sectionKey) continue;
    const keys = questionKeysBySection.get(sectionKey) ?? [];
    keys.push(question.stableKey);
    questionKeysBySection.set(sectionKey, keys);
  }
  const hasSectionMetadata = questionKeysBySection.size > 0;
  const assigned = new Set<string>();
  const useDomainColors = Array.isArray(result.perDomain);
  const achievementMarkersVisible = showAchievementMarkers(report.scoringConfig);

  const sections = scoredSections.map((score): ScoredReportSectionView => {
    const parsed = parsedByKey.get(score.stableKey);
    const questionKeys = hasSectionMetadata
      ? questionKeysBySection.get(score.stableKey) ?? []
      : parsed?.questionKeys ?? [];
    const questions = questionKeys
      .map((key) => {
        assigned.add(key);
        return byQuestionKey.get(key);
      })
      .filter((question): question is PerQuestionResult => question !== undefined)
      .map((question) => asQuestionView(report, question, achievementMarkersVisible));
    const domain = parsed?.domain ?? null;
    return {
      stableKey: score.stableKey,
      label: parsed?.name ?? score.name ?? score.stableKey,
      domain,
      color: useDomainColors && domain ? domainColor(domain) : null,
      totalPoints: Number.isFinite(score.totalPoints) ? score.totalPoints : 0,
      totalPointsLabel: formatReportMetric(score.totalPoints),
      averagePoints: Number.isFinite(score.averagePoints) ? score.averagePoints : 0,
      averagePointsLabel: formatReportMetric(score.averagePoints),
      achievedCount: Number.isFinite(score.achievedCount) ? score.achievedCount : 0,
      totalCount: Number.isFinite(score.totalCount) ? score.totalCount : 0,
      questions,
    };
  });
  const orphanQuestions = scoredQuestions
    .filter((question) => !assigned.has(question.stableKey))
    .map((question) => asQuestionView(report, question, achievementMarkersVisible));

  const decisions = (Array.isArray(result.perDomain) ? result.perDomain : [])
    .filter((domain) => domain && typeof domain.key === "string")
    .map((domain) => {
      const stableKey = domain.key;
      const totalPoints = sections
        .filter((section) => section.domain?.toLowerCase().trim() === stableKey.toLowerCase().trim())
        .reduce((sum, section) => sum + section.totalPoints, 0);
      return {
        stableKey,
        label: domain.label || stableKey,
        averageAcrossSections: typeof domain.averagePoints === "number" && Number.isFinite(domain.averagePoints)
          ? domain.averagePoints
          : null,
        averageAcrossSectionsLabel: typeof domain.averagePoints === "number" && Number.isFinite(domain.averagePoints)
          ? formatReportMetric(domain.averagePoints)
          : "—",
        totalPoints,
        totalPointsLabel: formatReportMetric(totalPoints),
        color: domainColor(stableKey),
      };
    });
  const ranked = decisions.filter((decision) => decision.averageAcrossSections !== null);
  const highest = ranked.length > 0 ? Math.max(...ranked.map((decision) => decision.averageAcrossSections as number)) : null;
  const lowest = ranked.length > 0 ? Math.min(...ranked.map((decision) => decision.averageAcrossSections as number)) : null;
  const strengths = highest === null ? [] : ranked.filter((decision) => decision.averageAcrossSections === highest);
  const priorities = lowest === null ? [] : ranked.filter((decision) => decision.averageAcrossSections === lowest);

  const findingsBySection = new Map<string, Array<{ stableKey: string; text: string }>>();
  const orphanFindings: Array<{ stableKey: string; text: string }> = [];
  const knownSectionKeys = new Set(scoredSections.map((section) => section.stableKey));
  parseResolvedFindings(result.findings)
    .filter((finding) => finding.questionType !== "SLIDER_LIKERT")
    .forEach((finding, index) => {
      const item = { stableKey: `${finding.stableKey}#finding-${index}`, text: finding.text };
      if (finding.sectionStableKey && knownSectionKeys.has(finding.sectionStableKey)) {
        const items = findingsBySection.get(finding.sectionStableKey) ?? [];
        items.push(item);
        findingsBySection.set(finding.sectionStableKey, items);
      } else orphanFindings.push(item);
    });
  const recommendations: ScoredReportRecommendationGroup[] = sections
    .map((section) => ({
      sectionStableKey: section.stableKey,
      label: section.label,
      items: [
        ...section.questions
          .map((question) => byQuestionKey.get(question.stableKey))
          .filter((question): question is PerQuestionResult => !!question?.recommendation?.trim())
          .map((question) => ({ stableKey: question.stableKey, text: question.recommendation as string })),
      ],
    }))
    .filter((group) => group.items.length > 0);
  const orphanRecommendations = [
    ...scoredQuestions
      .filter((question) => !assigned.has(question.stableKey) && !!question.recommendation?.trim())
      .map((question) => ({ stableKey: question.stableKey, text: question.recommendation as string })),
  ];
  if (orphanRecommendations.length > 0) {
    recommendations.push({ sectionStableKey: null, label: "Recommendations", items: orphanRecommendations });
  }
  const findingRecommendations: ScoredReportRecommendationGroup[] = sections
    .map((section) => ({
      sectionStableKey: section.stableKey,
      label: section.label,
      items: findingsBySection.get(section.stableKey) ?? [],
    }))
    .filter((group) => group.items.length > 0);
  if (orphanFindings.length > 0) {
    findingRecommendations.push({ sectionStableKey: null, label: "Recommendations", items: orphanFindings });
  }

  const additionalResponses = Array.isArray(report.rawAnswers)
    ? report.rawAnswers.flatMap((raw) => {
      if (!raw || typeof raw !== "object") return [];
      const answer = raw as Record<string, unknown>;
      if (typeof answer.stableKey !== "string") return [];
      const meta = report.questionsByKey?.[answer.stableKey];
      if (!meta || meta.type === "SLIDER_LIKERT") return [];
      return [{ label: meta.label || answer.stableKey, answer: displayAnswer(answer.value, meta) }];
    })
    : [];
  const config = reportConfigFor(report.templateAlias);
  const headline = headlineForTierMetric(report.result, report.scoringConfig);
  const overallTotal = typeof result.overallTotal === "number" && Number.isFinite(result.overallTotal) ? result.overallTotal : 0;
  const overallAverage = typeof result.overallAverage === "number" && Number.isFinite(result.overallAverage) ? result.overallAverage : 0;
  const neutral = isNeutralTier(report.scoringConfig) && typeof result.scaleUpScore !== "number";

  return {
    identity: {
      assessmentName: report.assessmentName,
      campaignLabel: report.campaignLabel ?? null,
      campaignSubtitle: report.campaignLabel && report.campaignLabel !== report.assessmentName
        ? report.campaignLabel
        : null,
      respondentName: report.respondentName,
      respondentEmail: report.respondentEmail ?? null,
      respondentNameIsEmail: respondentNameMatchesEmail(report.respondentName, report.respondentEmail),
      jobTitle: report.jobTitle ?? null,
      companyName: report.companyName,
      submittedAtLabel: formatReportDate(report.submittedAt),
    },
    summary: {
      headline: headline.primary,
      headlineLabel: headline.label,
      tierMessage: result.tier?.message || null,
      showTier: config.showTier,
      neutral,
      overallAverage,
      overallAverageLabel: formatReportMetric(overallAverage),
      overallTotal,
      overallTotalLabel: formatReportMetric(overallTotal),
      answeredItems: scoredQuestions.length,
      sectionCount: scoredSections.length,
      achievementMarkersVisible,
    },
    decisions,
    insights: { strengths, priorities },
    sections,
    orphanQuestions,
    scorecard: {
      visible: config.showScoreTable,
      rows: sections.map((section) => ({
        stableKey: section.stableKey,
        label: section.label,
        color: section.color,
        totalPoints: section.totalPoints,
        totalPointsLabel: section.totalPointsLabel,
        averagePoints: section.averagePoints,
        averagePointsLabel: section.averagePointsLabel,
      })),
      total: { totalPoints: overallTotal, overallAverage },
    },
    recommendations,
    findingRecommendations,
    additionalResponses,
    cta: ctaFor(normalizeContactEmail(report.referringCoachEmail), config.showCoachCta !== false),
    coach: { name: report.coachName ?? null, logoUrl: report.coachLogoUrl ?? null },
    provenance: {
      submissionId: report.provenance?.submissionId ?? null,
      versionId: report.provenance?.versionId ?? null,
      contentHash: report.provenance?.contentHash ?? null,
      templateName: report.provenance?.templateName ?? report.assessmentName,
      imported: report.isImported === true,
    },
    closingGreeting: greetingName(report.respondentName),
    degraded: report.degraded === true,
  };
}

/**
 * Applies Wave U's already-resolved findings policy without reading flags.
 * Task 13's outer dispatch must pass `isFindingsLogicEnabled()` here; a kill
 * switch is represented by `false`. The base model is never mutated.
 */
export function applyScoredReportFindingsPolicy(
  model: ScoredReportViewModel,
  findingsEnabled: boolean,
): ScoredReportViewModel {
  const baseByKey = new Map(model.recommendations.map((group) => [group.sectionStableKey, group]));
  const findingsByKey = new Map(model.findingRecommendations.map((group) => [group.sectionStableKey, group]));
  const orderedKeys = [
    ...model.sections.map((section) => section.stableKey),
    null,
    ...model.recommendations.map((group) => group.sectionStableKey),
    ...model.findingRecommendations.map((group) => group.sectionStableKey),
  ];
  const seen = new Set<string | null>();
  const recommendations: ScoredReportRecommendationGroup[] = [];
  for (const key of orderedKeys) {
    if (seen.has(key)) continue;
    seen.add(key);
    const base = baseByKey.get(key);
    const findings = findingsEnabled ? findingsByKey.get(key) : undefined;
    if (!base && !findings) continue;
    recommendations.push({
      sectionStableKey: key,
      label: base?.label ?? findings?.label ?? "Recommendations",
      items: [...(base?.items ?? []), ...(findings?.items ?? [])],
    });
  }
  return { ...model, recommendations };
}

/**
 * Applies the public report route's optional contact-email override without
 * changing eligibility, copy, or the source model. Blank/null means use the
 * report's referring-coach destination, matching ReportNextSteps semantics.
 */
export function applyScoredReportContactEmailOverride(
  model: ScoredReportViewModel,
  contactEmail: string | null | undefined,
): ScoredReportViewModel {
  const resolvedContact = normalizeContactEmail(contactEmail) ?? model.cta.contactEmail;
  return { ...model, cta: ctaFor(resolvedContact, model.cta.eligible) };
}
