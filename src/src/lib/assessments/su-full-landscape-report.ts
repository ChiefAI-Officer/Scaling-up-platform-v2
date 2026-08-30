import type { RespondentReport } from "@/lib/assessments/respondent-report";
import {
  isSuFullPeerPresentationForReport,
  type SuFullPeerPresentation,
  type SuFullPeerProvenance,
  type SuFullPeerQuestionComparison,
  type SuFullPeerSectionComparison,
} from "@/lib/assessments/su-full-peer-presentation";
import { SCALING_UP_FULL_TEMPLATE_ALIAS } from "@/lib/assessments/su-full-question-benchmarks";
import {
  computeGrowthPhase,
  GROWTH_PHASE_NARRATIVES,
  type GrowthPhase,
} from "@/lib/assessments/su-full-phase";
import type { ReportStyleKey } from "@/lib/assessments/report-style-registry";

export type SuFullLandscapeChapterKey =
  | "people" | "strategy" | "execution" | "cash" | "you";

export type SuFullLandscapeQuestion = SuFullPeerQuestionComparison & Readonly<{
  sectionStableKey: string;
  sectionLabel: string;
  gap: number;
}>;

export type SuFullLandscapeProfileRow = Readonly<{
  stableKey: string;
  label: string;
  chapterKey: SuFullLandscapeChapterKey;
  youAverage: number;
  peersAverage: number;
  deviation: number;
}>;

export type SuFullLandscapeChapter = Readonly<{
  key: SuFullLandscapeChapterKey;
  label: string;
  sections: readonly SuFullPeerSectionComparison[];
  questions: readonly SuFullLandscapeQuestion[];
  youAverage: number;
  peersAverage: number;
}>;

type SuFullLandscapePageContent =
  | Readonly<{ kind: "cover" | "preface" | "contents" | "introduction" | "profile" | "conclusion" }>
  | Readonly<{ kind: "chapter"; chapterKey: SuFullLandscapeChapterKey }>
  | Readonly<{ kind: "detail"; chapterKey: SuFullLandscapeChapterKey; questionKeys: readonly string[] }>
  | Readonly<{ kind: "appendix" }>;

export type SuFullLandscapePage = SuFullLandscapePageContent & Readonly<{ number: number }>;

export type SuFullLandscapeReportModel = Readonly<{
  scaleUpScore: number;
  peerProvenance: SuFullPeerProvenance;
  growthPhase: GrowthPhase | null;
  chapters: readonly SuFullLandscapeChapter[];
  profileRows: readonly SuFullLandscapeProfileRow[];
  pages: readonly SuFullLandscapePage[];
  strongestChapter: SuFullLandscapeChapter;
  weakestChapter: SuFullLandscapeChapter;
  closestQuestions: readonly SuFullLandscapeQuestion[];
  largestGapQuestions: readonly SuFullLandscapeQuestion[];
}>;

type CanonicalSection = Readonly<{
  stableKey: string;
  label: string;
  domain: SuFullLandscapeChapterKey;
  questionKeys: readonly string[];
}>;

export type SuFullLandscapeChapterDefinition = Readonly<{
  key: SuFullLandscapeChapterKey;
  label: string;
  sectionStableKeys: readonly string[];
}>;

export type SuFullLandscapePageGroup = Readonly<{
  chapterKey: SuFullLandscapeChapterKey;
  questionKeys: readonly string[];
}>;

function questionKeys(first: number, last: number): readonly string[] {
  return Array.from(
    { length: last - first + 1 },
    (_, index) => `Q${String(first + index).padStart(2, "0")}`,
  );
}

const CANONICAL_SECTIONS: readonly CanonicalSection[] = [
  { stableKey: "S_PEOPLE_YE", label: "Your Employees", domain: "people", questionKeys: questionKeys(1, 8) },
  { stableKey: "S_PEOPLE_CC", label: "Company Culture", domain: "people", questionKeys: questionKeys(9, 13) },
  { stableKey: "S_STRATEGY", label: "Strategy", domain: "strategy", questionKeys: questionKeys(14, 20) },
  { stableKey: "S_EXEC_LT", label: "Leadership Team", domain: "execution", questionKeys: questionKeys(21, 24) },
  { stableKey: "S_EXEC_OP", label: "Operational Processes", domain: "execution", questionKeys: questionKeys(25, 29) },
  { stableKey: "S_EXEC_SM", label: "Sales and Marketing", domain: "execution", questionKeys: questionKeys(30, 34) },
  { stableKey: "S_EXEC_SIT", label: "Scalability, Innovation and Technology", domain: "execution", questionKeys: questionKeys(35, 40) },
  { stableKey: "S_CASH", label: "Cash", domain: "cash", questionKeys: questionKeys(41, 45) },
  { stableKey: "S_YOU_LEAD", label: "Your Leadership", domain: "you", questionKeys: questionKeys(46, 55) },
  { stableKey: "S_YOU_IC", label: "Internal Communication", domain: "you", questionKeys: questionKeys(56, 61) },
] as const;

/**
 * Canonical Scaling Up Full section membership shared by bounded report
 * projections. Consumers validate against it; they do not derive or repair it.
 */
export const SU_FULL_LANDSCAPE_SECTIONS = CANONICAL_SECTIONS;

export const SU_FULL_LANDSCAPE_CHAPTERS: readonly SuFullLandscapeChapterDefinition[] = [
  { key: "people", label: "People", sectionStableKeys: ["S_PEOPLE_YE", "S_PEOPLE_CC"] },
  { key: "strategy", label: "Strategy", sectionStableKeys: ["S_STRATEGY"] },
  { key: "execution", label: "Execution", sectionStableKeys: ["S_EXEC_LT", "S_EXEC_OP", "S_EXEC_SM", "S_EXEC_SIT"] },
  { key: "cash", label: "Cash", sectionStableKeys: ["S_CASH"] },
  { key: "you", label: "You", sectionStableKeys: ["S_YOU_LEAD", "S_YOU_IC"] },
] as const;

export const SU_FULL_LANDSCAPE_PAGE_GROUPS: readonly SuFullLandscapePageGroup[] = [
  { chapterKey: "people", questionKeys: questionKeys(1, 6) },
  { chapterKey: "people", questionKeys: questionKeys(7, 8) },
  { chapterKey: "people", questionKeys: questionKeys(9, 13) },
  { chapterKey: "strategy", questionKeys: questionKeys(14, 19) },
  { chapterKey: "strategy", questionKeys: questionKeys(20, 20) },
  { chapterKey: "execution", questionKeys: questionKeys(21, 24) },
  { chapterKey: "execution", questionKeys: questionKeys(25, 29) },
  { chapterKey: "execution", questionKeys: questionKeys(30, 34) },
  { chapterKey: "execution", questionKeys: questionKeys(35, 40) },
  { chapterKey: "cash", questionKeys: questionKeys(41, 45) },
  { chapterKey: "you", questionKeys: questionKeys(46, 51) },
  { chapterKey: "you", questionKeys: questionKeys(52, 55) },
  { chapterKey: "you", questionKeys: questionKeys(56, 61) },
] as const;

const CANONICAL_QUESTION_KEYS = CANONICAL_SECTIONS.flatMap((section) => section.questionKeys);
const CANONICAL_SECTION_BY_KEY = new Map(CANONICAL_SECTIONS.map((section) => [section.stableKey, section]));
const CHAPTER_BY_SECTION_KEY = new Map(
  SU_FULL_LANDSCAPE_CHAPTERS.flatMap((chapter) =>
    chapter.sectionStableKeys.map((stableKey) => [stableKey, chapter.key] as const),
  ),
);
const CHAPTER_BY_QUESTION_KEY = new Map(
  CANONICAL_SECTIONS.flatMap((section) =>
    section.questionKeys.map((stableKey) => [stableKey, section.domain] as const),
  ),
);
const SUMMARY_QUESTION_COUNT = 5;

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function sameKeys(actual: readonly string[], expected: readonly string[]): boolean {
  return actual.length === expected.length
    && new Set(actual).size === expected.length
    && actual.every((key) => expected.includes(key));
}

function finiteAverage(values: readonly number[]): number | null {
  if (values.length === 0 || values.some((value) => !Number.isFinite(value))) return null;
  const average = values.reduce((total, value) => total + value, 0) / values.length;
  return Number.isFinite(average) ? average : null;
}

function deepFreeze<T>(value: T, seen = new WeakSet<object>()): T {
  if (value === null || typeof value !== "object") return value;
  const object = value as object;
  if (seen.has(object)) return value;
  seen.add(object);
  for (const child of Object.values(object)) deepFreeze(child, seen);
  return Object.freeze(value);
}

function validCanonicalDefinitions(): boolean {
  const chapterSectionKeys = SU_FULL_LANDSCAPE_CHAPTERS.flatMap((chapter) => chapter.sectionStableKeys);
  const pageQuestionKeys = SU_FULL_LANDSCAPE_PAGE_GROUPS.flatMap((group) => group.questionKeys);
  return sameKeys(chapterSectionKeys, CANONICAL_SECTIONS.map((section) => section.stableKey))
    && sameKeys(pageQuestionKeys, CANONICAL_QUESTION_KEYS)
    && pageQuestionKeys.every((key, index) => key === CANONICAL_QUESTION_KEYS[index])
    && SU_FULL_LANDSCAPE_PAGE_GROUPS.every((group) =>
      group.questionKeys.every((key) => CHAPTER_BY_QUESTION_KEY.get(key) === group.chapterKey),
    );
}

function validReportSectionMap(report: RespondentReport): boolean {
  if (!Array.isArray(report.sections)) return false;
  const seenCanonicalSectionKeys: string[] = [];
  let backgroundCount = 0;

  for (const section of report.sections) {
    if (
      !isRecord(section)
      || typeof section.stableKey !== "string"
      || typeof section.name !== "string"
      || section.name.trim() === ""
      || typeof section.domain !== "string"
    ) {
      return false;
    }
    if (section.stableKey === "S_BACKGROUND") {
      backgroundCount += 1;
      if (backgroundCount > 1 || section.domain !== "people") return false;
      continue;
    }
    const canonical = CANONICAL_SECTION_BY_KEY.get(section.stableKey);
    if (
      canonical === undefined
      || section.name !== canonical.label
      || section.domain !== canonical.domain
    ) {
      return false;
    }
    seenCanonicalSectionKeys.push(section.stableKey);
  }

  return sameKeys(
    seenCanonicalSectionKeys,
    CANONICAL_SECTIONS.map((section) => section.stableKey),
  );
}

function validPresentationSections(presentation: SuFullPeerPresentation): boolean {
  if (!sameKeys(presentation.sections.map((section) => section.stableKey), CANONICAL_SECTIONS.map((section) => section.stableKey))) {
    return false;
  }
  return presentation.sections.every((section) => {
    const canonical = CANONICAL_SECTION_BY_KEY.get(section.stableKey);
    return canonical !== undefined
      && section.label === canonical.label
      && section.domain === canonical.domain
      && section.questions.length === canonical.questionKeys.length
      && section.questions.every((question, index) => question.stableKey === canonical.questionKeys[index]);
  });
}

function frozenOutput(
  report: RespondentReport,
  presentation: SuFullPeerPresentation,
): Readonly<{ scaleUpScore: number }> | null {
  const score = report.result?.scaleUpScore;
  const frozenQuestions = report.result?.perQuestion;
  if (
    typeof score !== "number"
    || !Number.isFinite(score)
    || score < 0
    || score > 100
    || !Array.isArray(frozenQuestions)
    || !sameKeys(
      frozenQuestions.map((question) => question.stableKey),
      CANONICAL_QUESTION_KEYS,
    )
  ) {
    return null;
  }

  const frozenByKey = new Map(frozenQuestions.map((question) => [question.stableKey, question]));
  const presentationQuestions = presentation.sections.flatMap((section) => section.questions);
  for (const question of presentationQuestions) {
    const frozen = frozenByKey.get(question.stableKey);
    if (
      !frozen
      || typeof frozen.value !== "number"
      || !Number.isFinite(frozen.value)
      || typeof frozen.recommendation !== "string"
      || frozen.recommendation.trim() === ""
      || question.you !== frozen.value
      || question.recommendation !== frozen.recommendation
    ) {
      return null;
    }
  }

  return { scaleUpScore: score };
}

function growthPhaseFromRawAnswers(rawAnswers: unknown): GrowthPhase | null {
  if (!Array.isArray(rawAnswers)) return null;
  const fteAnswer = rawAnswers.find(
    (answer) => isRecord(answer) && answer.stableKey === "Q_FTE_CONTRACT",
  );
  return isRecord(fteAnswer) && typeof fteAnswer.value === "number"
    ? computeGrowthPhase(fteAnswer.value)
    : null;
}

function growthPhaseFromFrozenResult(
  result: RespondentReport["result"],
  rawAnswers: unknown,
): GrowthPhase | null {
  if (result.recommendationPhase === undefined) {
    return growthPhaseFromRawAnswers(rawAnswers);
  }
  return GROWTH_PHASE_NARRATIVES[result.recommendationPhase] ?? null;
}

function pages(hasAuthoredPreface: boolean): readonly SuFullLandscapePage[] {
  const logicalPages: readonly SuFullLandscapePageContent[] = [
    { kind: "cover" },
    ...(hasAuthoredPreface ? [{ kind: "preface" } as const] : []),
    { kind: "contents" },
    { kind: "introduction" },
    { kind: "profile" },
    ...SU_FULL_LANDSCAPE_CHAPTERS.flatMap((chapter) => [
      { kind: "chapter" as const, chapterKey: chapter.key },
      ...SU_FULL_LANDSCAPE_PAGE_GROUPS
        .filter((group) => group.chapterKey === chapter.key)
        .map((group) => ({
          kind: "detail" as const,
          chapterKey: group.chapterKey,
          questionKeys: [...group.questionKeys],
        })),
    ]),
    { kind: "conclusion" },
    { kind: "appendix" },
  ];

  return logicalPages.map((page, index) => ({ ...page, number: index + 1 }));
}

/**
 * Compose the fixed Scaling Up Full landscape report without querying, scoring,
 * resolving feedback, or inferring peer data. An unknown canonical shape is a
 * fail-closed null so the caller can preserve its existing Classic fallback.
 */
export function buildSuFullLandscapeReportModel(input: {
  report: RespondentReport;
  presentation: SuFullPeerPresentation;
  resolvedStyle: ReportStyleKey;
}): SuFullLandscapeReportModel | null {
  const report = input?.report;
  const presentation = input?.presentation;
  if (
    !report
    || report.templateAlias !== SCALING_UP_FULL_TEMPLATE_ALIAS
    || input.resolvedStyle !== "CLASSIC"
    || report.degraded
    || !presentation
    || !isSuFullPeerPresentationForReport(presentation, report)
    || !validCanonicalDefinitions()
    || !validReportSectionMap(report)
    || !validPresentationSections(presentation)
  ) {
    return null;
  }
  const frozen = frozenOutput(report, presentation);
  if (!frozen) return null;

  const sectionsByKey = new Map(presentation.sections.map((section) => [section.stableKey, section]));
  const profileRows: SuFullLandscapeProfileRow[] = [];
  const chapters: SuFullLandscapeChapter[] = [];

  for (const chapterDefinition of SU_FULL_LANDSCAPE_CHAPTERS) {
    const chapterSections = chapterDefinition.sectionStableKeys.map((stableKey) => sectionsByKey.get(stableKey));
    if (chapterSections.some((section): section is undefined => section === undefined)) return null;
    const sections = (chapterSections as SuFullPeerSectionComparison[]).map((section) => ({
      ...section,
      questions: section.questions.map((question) => ({ ...question })),
    }));
    const questions: SuFullLandscapeQuestion[] = [];

    for (const section of sections) {
      const chapterKey = CHAPTER_BY_SECTION_KEY.get(section.stableKey);
      const youAverage = finiteAverage([section.youTotal / section.questions.length]);
      const peersAverage = finiteAverage([section.peersTotal / section.questions.length]);
      if (chapterKey !== chapterDefinition.key || youAverage === null || peersAverage === null) return null;
      const deviation = youAverage - peersAverage;
      if (!Number.isFinite(deviation)) return null;
      profileRows.push({
        stableKey: section.stableKey,
        label: section.label,
        chapterKey,
        youAverage,
        peersAverage,
        deviation,
      });
      questions.push(...section.questions.map((question) => {
        const gap = question.you - question.peers;
        if (!Number.isFinite(gap)) return null;
        return {
          ...question,
          sectionStableKey: section.stableKey,
          sectionLabel: section.label,
          gap,
        };
      }).filter((question): question is SuFullLandscapeQuestion => question !== null));
    }

    const youAverage = finiteAverage([
      sections.reduce((total, section) => total + section.youTotal, 0) / questions.length,
    ]);
    const peersAverage = finiteAverage([
      sections.reduce((total, section) => total + section.peersTotal, 0) / questions.length,
    ]);
    if (questions.length === 0 || youAverage === null || peersAverage === null) return null;
    chapters.push({
      key: chapterDefinition.key,
      label: chapterDefinition.label,
      sections,
      questions,
      youAverage,
      peersAverage,
    });
  }

  const allQuestions = chapters.flatMap((chapter) => chapter.questions);
  if (!sameKeys(allQuestions.map((question) => question.stableKey), CANONICAL_QUESTION_KEYS)) return null;

  const orderedPages = pages(Boolean(report.reportHtml?.introductionHtml));
  const expectedPageCount = report.reportHtml?.introductionHtml ? 25 : 24;
  if (orderedPages.length !== expectedPageCount || !orderedPages.every((page, index) => page.number === index + 1)) return null;
  const strongestChapter = [...chapters].sort((left, right) => right.youAverage - left.youAverage)[0];
  const weakestChapter = [...chapters].sort((left, right) => left.youAverage - right.youAverage)[0];
  if (!strongestChapter || !weakestChapter) return null;
  const byAbsoluteGap = (direction: 1 | -1) => [...allQuestions]
    .sort((left, right) => direction * (Math.abs(left.gap) - Math.abs(right.gap)))
    .slice(0, SUMMARY_QUESTION_COUNT);

  return deepFreeze({
    scaleUpScore: frozen.scaleUpScore,
    peerProvenance: { ...presentation.provenance },
    growthPhase: growthPhaseFromFrozenResult(report.result, report.rawAnswers),
    chapters,
    profileRows,
    pages: orderedPages,
    strongestChapter,
    weakestChapter,
    closestQuestions: byAbsoluteGap(1),
    largestGapQuestions: byAbsoluteGap(-1),
  });
}
