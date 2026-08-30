import {
  CONDENSED_GOLDEN_CURRENT_SCORES,
  CONDENSED_GOLDEN_PEERS,
  condensedGoldenReport,
} from "@/__tests__/fixtures/summary-reports/scaling-condensed-ceo-golden";
import { completeSuFullLandscapeReport } from "@/__tests__/fixtures/su-full-landscape";
import {
  buildScalingCondensedCeoModel,
} from "@/lib/assessments/summary-reports/scaling-condensed-ceo-model";
import type { RespondentReport } from "@/lib/assessments/respondent-report";

function expectInvalid(report: RespondentReport): void {
  expect(buildScalingCondensedCeoModel(report)).toEqual({
    kind: "invalid",
    code: "condensed_source_incomplete",
  });
}

test("projects Jeff's canonical 61 current scores and peers into five decision groups", () => {
  // Break caught: a source row is omitted, reordered, regrouped, or changed.
  const result = buildScalingCondensedCeoModel(condensedGoldenReport());

  expect(result.kind).toBe("ok");
  if (result.kind !== "ok") throw new Error("Expected complete golden fixture");
  expect(result.model.groups.map((group) => group.questions.length)).toEqual([
    13, 7, 20, 5, 16,
  ]);
  const questions = result.model.groups.flatMap((group) => group.questions);
  expect(questions.map((question) => question.stableKey)).toEqual(
    Array.from({ length: 61 }, (_, index) =>
      `Q${String(index + 1).padStart(2, "0")}`,
    ),
  );
  expect(questions.map((question) => question.you)).toEqual(
    CONDENSED_GOLDEN_CURRENT_SCORES,
  );
  expect(questions.map((question) => question.peers)).toEqual(
    CONDENSED_GOLDEN_PEERS,
  );
  expect(questions.every((question) =>
    Object.keys(question).sort().join(",") === "label,peers,stableKey,you",
  )).toBe(true);
});

test("preserves a visible zero score", () => {
  // Break caught: falsy score handling drops a legitimate zero.
  const report = condensedGoldenReport();
  report.result.perQuestion[0].value = 0;

  const result = buildScalingCondensedCeoModel(report);

  expect(result.kind).toBe("ok");
  if (result.kind === "ok") expect(result.model.groups[0].questions[0].you).toBe(0);
});

test("rejects a missing frozen score row", () => {
  // Break caught: a partial result reaches a report that promises all 61 rows.
  const report = condensedGoldenReport();
  report.result.perQuestion.pop();
  expectInvalid(report);
});

test.each([
  ["missing", (report: RespondentReport) => {
    delete (report.result.perQuestion[0] as { value?: unknown }).value;
  }],
  ["nonfinite", (report: RespondentReport) => {
    report.result.perQuestion[0].value = Number.NaN;
  }],
  ["below range", (report: RespondentReport) => {
    report.result.perQuestion[0].value = -1;
  }],
  ["above range", (report: RespondentReport) => {
    report.result.perQuestion[0].value = 11;
  }],
])("rejects a %s frozen score", (_case, mutate) => {
  // Break caught: invalid stored scores become visible output.
  const report = condensedGoldenReport();
  mutate(report);
  expectInvalid(report);
});

test("rejects a score under the wrong canonical section", () => {
  // Break caught: flat Q order conceals changed canonical membership.
  const report = condensedGoldenReport();
  report.questionsByKey.Q08 = {
    ...report.questionsByKey.Q08,
    sectionStableKey: "S_PEOPLE_CC",
  };
  expectInvalid(report);
});

test("rejects corrupt declared peers instead of repairing them with a fallback", () => {
  // Break caught: tampered frozen peers are silently replaced by another cohort.
  const report = completeSuFullLandscapeReport();
  report.result.perQuestion[0].peerValue = 6.5;
  expectInvalid(report);
});

test("does not project remarks or recommendations", () => {
  // Break caught: narrative source fields leak into the CEO score-only model.
  const plain = condensedGoldenReport();
  const withNarrative = condensedGoldenReport();
  withNarrative.rawAnswers = [
    ...(withNarrative.rawAnswers as unknown[]),
    { stableKey: "Q_OPEN_REMARKS", value: "Board-only context" },
  ];
  withNarrative.result.perQuestion[0].recommendation = "Narrative guidance";

  expect(buildScalingCondensedCeoModel(withNarrative)).toEqual(
    buildScalingCondensedCeoModel(plain),
  );
});
