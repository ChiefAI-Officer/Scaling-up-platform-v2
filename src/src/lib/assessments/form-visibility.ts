import type { PagerQuestion } from "@/lib/assessments/section-pages";

type AnswersMap = Record<string, number | string | string[]>;

const LVA_ALIAS = "leadership-vision-alignment";
const LVA_GATE_KEY = "S4_biggest_obstacles";
const LVA_FOLLOWUP_PREFIX = "S5_why_";

interface VisibilityArgs {
  templateAlias?: string | null;
  questions: PagerQuestion[];
  answers: AnswersMap;
}

export function filterVisibleSurveyQuestions({
  templateAlias,
  questions,
  answers,
}: VisibilityArgs): PagerQuestion[] {
  if (templateAlias !== LVA_ALIAS) return questions;

  const gate = questions.find((question) => question.stableKey === LVA_GATE_KEY);
  if (!gate || gate.type !== "MULTI_CHOICE") return questions;

  const selected = answers[LVA_GATE_KEY];
  const selectedKeys = new Set(Array.isArray(selected) ? selected : []);

  return questions.filter((question) => {
    if (!question.stableKey.startsWith(LVA_FOLLOWUP_PREFIX)) return true;
    const factorKey = question.stableKey.slice(LVA_FOLLOWUP_PREFIX.length);
    return selectedKeys.has(factorKey);
  });
}

export function visibleSurveyQuestionKeys(args: VisibilityArgs): Set<string> {
  return new Set(
    filterVisibleSurveyQuestions(args).map((question) => question.stableKey),
  );
}
