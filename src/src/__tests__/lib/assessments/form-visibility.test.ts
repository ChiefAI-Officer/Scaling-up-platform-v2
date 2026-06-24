import {
  filterVisibleSurveyQuestions,
  visibleSurveyQuestionKeys,
} from "@/lib/assessments/form-visibility";
import type { PagerQuestion } from "@/lib/assessments/section-pages";

const LVA_ALIAS = "leadership-vision-alignment";

function q(
  stableKey: string,
  overrides: Partial<PagerQuestion> = {},
): PagerQuestion {
  return {
    stableKey,
    sortOrder: 1,
    sectionStableKey: "S1",
    type: "TEXT",
    label: stableKey,
    isRequired: false,
    ...overrides,
  };
}

const baseQuestions: PagerQuestion[] = [
  q("S4_biggest_obstacles", {
    type: "MULTI_CHOICE",
    options: [
      { key: "sales", label: "Sales" },
      { key: "cash", label: "Cash" },
      { key: "execution", label: "Execution" },
    ],
  }),
  q("S5_why_sales"),
  q("S5_why_cash"),
  q("S5_why_execution"),
  q("S5_why_unknown"),
  q("S5_other_factor"),
  q("S5_change_one_thing"),
];

function keys(questions: PagerQuestion[]): string[] {
  return questions.map((question) => question.stableKey);
}

describe("form survey visibility", () => {
  it("returns all questions for unknown aliases", () => {
    expect(
      keys(
        filterVisibleSurveyQuestions({
          templateAlias: "qsp-v2",
          questions: baseQuestions,
          answers: { S4_biggest_obstacles: ["sales"] },
        }),
      ),
    ).toEqual(keys(baseQuestions));
  });

  it("fails open when the LVA gate question is missing", () => {
    const questions = baseQuestions.filter(
      (question) => question.stableKey !== "S4_biggest_obstacles",
    );

    expect(
      keys(
        filterVisibleSurveyQuestions({
          templateAlias: LVA_ALIAS,
          questions,
          answers: { S4_biggest_obstacles: ["sales"] },
        }),
      ),
    ).toEqual(keys(questions));
  });

  it("fails open when the LVA gate question is not MULTI_CHOICE", () => {
    const questions = baseQuestions.map((question) =>
      question.stableKey === "S4_biggest_obstacles"
        ? { ...question, type: "TEXT" }
        : question,
    );

    expect(
      keys(
        filterVisibleSurveyQuestions({
          templateAlias: LVA_ALIAS,
          questions,
          answers: { S4_biggest_obstacles: ["sales"] },
        }),
      ),
    ).toEqual(keys(questions));
  });

  it("shows LVA S5_why follow-ups only for checked S4 factors", () => {
    expect(
      keys(
        filterVisibleSurveyQuestions({
          templateAlias: LVA_ALIAS,
          questions: baseQuestions,
          answers: { S4_biggest_obstacles: ["sales", "cash"] },
        }),
      ),
    ).toEqual([
      "S4_biggest_obstacles",
      "S5_why_sales",
      "S5_why_cash",
      "S5_other_factor",
      "S5_change_one_thing",
    ]);
  });

  it("hides all LVA S5_why follow-ups when no S4 factors are checked", () => {
    expect(
      keys(
        filterVisibleSurveyQuestions({
          templateAlias: LVA_ALIAS,
          questions: baseQuestions,
          answers: {},
        }),
      ),
    ).toEqual([
      "S4_biggest_obstacles",
      "S5_other_factor",
      "S5_change_one_thing",
    ]);
  });

  it("hides drifted LVA S5_why keys when the gate is valid", () => {
    expect(
      keys(
        filterVisibleSurveyQuestions({
          templateAlias: LVA_ALIAS,
          questions: baseQuestions,
          answers: { S4_biggest_obstacles: ["sales"] },
        }),
      ),
    ).not.toContain("S5_why_unknown");
  });

  it("returns visible stable keys for stale-answer pruning", () => {
    expect(
      visibleSurveyQuestionKeys({
        templateAlias: LVA_ALIAS,
        questions: baseQuestions,
        answers: { S4_biggest_obstacles: ["sales"] },
      }),
    ).toEqual(
      new Set([
        "S4_biggest_obstacles",
        "S5_why_sales",
        "S5_other_factor",
        "S5_change_one_thing",
      ]),
    );
  });
});
