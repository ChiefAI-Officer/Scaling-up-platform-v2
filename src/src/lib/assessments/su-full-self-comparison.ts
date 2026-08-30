import type { ReportComparisonModel } from "@/lib/assessments/report-comparison-model";
import type {
  SuFullLandscapeChapterKey,
  SuFullLandscapeReportModel,
} from "@/lib/assessments/su-full-landscape-report";

const QUESTION_KEYS = Array.from({ length: 61 }, (_, index) =>
  `Q${String(index + 1).padStart(2, "0")}`,
);
const SECTION_KEYS = [
  "S_PEOPLE_YE", "S_PEOPLE_CC", "S_STRATEGY", "S_EXEC_LT", "S_EXEC_OP",
  "S_EXEC_SM", "S_EXEC_SIT", "S_CASH", "S_YOU_LEAD", "S_YOU_IC",
] as const;
const DECISIONS = ["people", "strategy", "execution", "cash"] as const;
const APPENDIX_C_KEYS = [...QUESTION_KEYS.slice(0, 45), ...QUESTION_KEYS.slice(55)];

export type SuFullSelfComparisonQuestion = Readonly<{
  stableKey: string;
  label: string;
  sectionStableKey: string;
  sectionLabel: string;
  chapterKey: SuFullLandscapeChapterKey;
  focus: number;
  earlier: number;
  peers: number;
  delta: number;
  recommendation: string | null;
}>;

export type SuFullSelfComparisonAggregate = Readonly<{
  stableKey: string;
  label: string;
  chapterKey: SuFullLandscapeChapterKey;
  focus: number;
  earlier: number;
  peers: number;
  deltaFromEarlier: number;
  deltaFromPeers: number;
}>;

export type SuFullSelfComparisonAppendixCRow = Readonly<{
  stableKey: string;
  label: string;
  focus: number;
  earlier: number;
  average: number;
}>;

export type SuFullSelfComparisonModel = Readonly<{
  respondentName: string;
  focus: Readonly<{ campaignLabel: string | null; submittedAt: Date }>;
  earlier: ReportComparisonModel["baseline"];
  questions: readonly SuFullSelfComparisonQuestion[];
  profileRows: readonly SuFullSelfComparisonAggregate[];
  chapters: readonly SuFullSelfComparisonAggregate[];
  appendixB: Readonly<{
    rows: readonly Readonly<{
      label: string;
      decisions: readonly Readonly<{ key: typeof DECISIONS[number]; value: number }>[];
    }>[];
  }>;
  appendixC: readonly SuFullSelfComparisonAppendixCRow[];
}>;

function exactKeys(actual: readonly string[], expected: readonly string[]): boolean {
  return actual.length === expected.length
    && new Set(actual).size === expected.length
    && actual.every((key) => expected.includes(key));
}

function mean(values: readonly number[]): number | null {
  if (!values.length || values.some((value) => !Number.isFinite(value))) return null;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function deepFreeze<T>(value: T, seen = new WeakSet<object>()): T {
  if (value === null || typeof value !== "object") return value;
  const object = value as object;
  if (seen.has(object)) return value;
  seen.add(object);
  for (const child of Object.values(object)) deepFreeze(child, seen);
  return Object.freeze(value);
}

/** Compatibility that can be checked before the Focus landscape is loaded. */
export function isSuFullSelfComparisonShapeCompatible(comparison: ReportComparisonModel): boolean {
  return exactKeys(Object.keys(comparison.questions), QUESTION_KEYS)
    && exactKeys(Object.keys(comparison.sections), SECTION_KEYS)
    && QUESTION_KEYS.every((key) => {
      const row = comparison.questions[key];
      return row?.status === "comparable"
        && Number.isFinite(row.current)
        && Number.isFinite(row.previous);
    });
}

export function buildSuFullSelfComparisonModel(input: {
  focus: SuFullLandscapeReportModel;
  comparison: ReportComparisonModel;
  respondentName: string;
  focusCampaignLabel: string | null;
  focusSubmittedAt: Date;
}): SuFullSelfComparisonModel | null {
  const { focus, comparison } = input;
  if (
    !focus
    || !comparison
    || !input.respondentName.trim()
    || !(input.focusSubmittedAt instanceof Date)
    || !Number.isFinite(input.focusSubmittedAt.getTime())
    || !isSuFullSelfComparisonShapeCompatible(comparison)
  ) return null;

  const focusQuestions = focus.chapters.flatMap((chapter) =>
    chapter.questions.map((question) => ({ ...question, chapterKey: chapter.key })),
  );
  if (!exactKeys(focusQuestions.map((question) => question.stableKey), QUESTION_KEYS)) return null;
  const focusByKey = new Map(focusQuestions.map((question) => [question.stableKey, question]));
  const questions: SuFullSelfComparisonQuestion[] = [];

  for (const stableKey of QUESTION_KEYS) {
    const source = focusByKey.get(stableKey);
    const compared = comparison.questions[stableKey];
    if (
      !source
      || compared?.status !== "comparable"
      || !Number.isFinite(compared.current)
      || !Number.isFinite(compared.previous)
      || compared.current !== source.you
    ) return null;
    const earlier = compared.previous as number;
    questions.push({
      stableKey,
      label: source.label,
      sectionStableKey: source.sectionStableKey,
      sectionLabel: source.sectionLabel,
      chapterKey: source.chapterKey,
      focus: source.you,
      earlier,
      peers: source.peers,
      delta: source.you - earlier,
      recommendation: source.recommendation,
    });
  }

  const rowsForAggregate = (
    stableKey: string,
    label: string,
    chapterKey: SuFullLandscapeChapterKey,
    rows: readonly SuFullSelfComparisonQuestion[],
  ): SuFullSelfComparisonAggregate | null => {
    const focusAverage = mean(rows.map((row) => row.focus));
    const earlierAverage = mean(rows.map((row) => row.earlier));
    const peerAverage = mean(rows.map((row) => row.peers));
    if (focusAverage === null || earlierAverage === null || peerAverage === null) return null;
    return {
      stableKey,
      label,
      chapterKey,
      focus: focusAverage,
      earlier: earlierAverage,
      peers: peerAverage,
      deltaFromEarlier: focusAverage - earlierAverage,
      deltaFromPeers: focusAverage - peerAverage,
    };
  };

  const profileRows = focus.profileRows.map((row) => rowsForAggregate(
    row.stableKey,
    row.label,
    row.chapterKey,
    questions.filter((question) => question.sectionStableKey === row.stableKey),
  ));
  const chapters = focus.chapters.map((chapter) => rowsForAggregate(
    chapter.key,
    chapter.label,
    chapter.key,
    questions.filter((question) => question.chapterKey === chapter.key),
  ));
  if (profileRows.some((row) => row === null) || chapters.some((row) => row === null)) return null;
  const aggregates = chapters as SuFullSelfComparisonAggregate[];

  const decisionValues = (source: "focus" | "earlier") => DECISIONS.map((key) => {
    const aggregate = aggregates.find((row) => row.chapterKey === key);
    if (!aggregate) throw new Error(`Missing ${key} decision aggregate`);
    return { key, value: aggregate[source] };
  });

  return deepFreeze({
    respondentName: input.respondentName.trim(),
    focus: { campaignLabel: input.focusCampaignLabel?.trim() || null, submittedAt: new Date(input.focusSubmittedAt) },
    earlier: { ...comparison.baseline, submittedAt: new Date(comparison.baseline.submittedAt) },
    questions,
    profileRows: profileRows as SuFullSelfComparisonAggregate[],
    chapters: aggregates,
    appendixB: {
      rows: [
        { label: "Focus", decisions: decisionValues("focus") },
        { label: input.respondentName.trim(), decisions: decisionValues("earlier") },
      ],
    },
    appendixC: APPENDIX_C_KEYS.map((stableKey) => {
      const row = questions.find((question) => question.stableKey === stableKey)!;
      return { stableKey, label: row.label, focus: row.focus, earlier: row.earlier, average: (row.focus + row.earlier) / 2 };
    }),
  });
}
