import type { PagerPage } from "@/lib/assessments/custom-slides";
import {
  isAnswered,
  type PagerQuestion,
} from "@/lib/assessments/section-pages";

export const QSP_V2_ALIAS = "qsp-v2";
export const QSP_STORY_KEYS = [
  "P1_core_values_story_1",
  "P1_core_values_story_2",
  "P1_core_values_story_3",
] as const;

export type AssessmentAnswers = Record<
  string,
  number | string | string[] | undefined
>;

export type QspStoryQuestions = readonly [
  PagerQuestion,
  PagerQuestion,
  PagerQuestion,
];

export type QuestionRenderUnit =
  | { kind: "question"; question: PagerQuestion }
  | {
      kind: "qsp-story-group";
      questions: QspStoryQuestions;
      prompt: string;
    };

interface GroupOptions {
  enabled: boolean;
  templateAlias?: string | null;
}

const STORY_ONE_SUFFIX = /\s+\(Story 1 of 3\)\s*$/;

function exactTriplet(candidate: PagerQuestion[]): QspStoryQuestions | null {
  if (candidate.length !== 3) return null;
  const [one, two, three] = candidate;
  const questions: QspStoryQuestions = [one, two, three];
  if (!questions.every((question, index) => question.stableKey === QSP_STORY_KEYS[index])) return null;
  if (!questions.every((question) => question.type === "TEXT" && !question.isRequired)) return null;
  const sectionKey = one.sectionStableKey?.trim();
  if (!sectionKey || !questions.every((question) => question.sectionStableKey === sectionKey)) return null;
  return questions;
}

export function buildQuestionRenderUnits(
  questions: PagerQuestion[],
  options: GroupOptions,
): QuestionRenderUnit[] {
  if (!options.enabled || options.templateAlias !== QSP_V2_ALIAS) {
    return questions.map((question) => ({ kind: "question", question }));
  }

  const units: QuestionRenderUnit[] = [];
  for (let index = 0; index < questions.length;) {
    const group = exactTriplet(questions.slice(index, index + 3));
    if (group) {
      units.push({
        kind: "qsp-story-group",
        questions: group,
        prompt: group[0].label.replace(STORY_ONE_SUFFIX, ""),
      });
      index += 3;
    } else {
      units.push({ kind: "question", question: questions[index] });
      index += 1;
    }
  }
  return units;
}

export function initialVisibleStoryCount(
  questions: QspStoryQuestions,
  answers: AssessmentAnswers,
): 1 | 2 | 3 {
  if (isAnswered(answers[questions[2].stableKey])) return 3;
  if (isAnswered(answers[questions[1].stableKey])) return 2;
  return 1;
}

export function questionProgress(
  pages: PagerPage[],
  answers: AssessmentAnswers,
  options: GroupOptions,
): { answered: number; total: number } {
  let answered = 0;
  let total = 0;
  for (const page of pages) {
    if (page.kind !== "section") continue;
    for (const unit of buildQuestionRenderUnits(page.questions, options)) {
      total += 1;
      const unitAnswered =
        unit.kind === "qsp-story-group"
          ? unit.questions.some((question) => isAnswered(answers[question.stableKey]))
          : isAnswered(answers[unit.question.stableKey]);
      if (unitAnswered) answered += 1;
    }
  }
  return { answered, total };
}
