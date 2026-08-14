import { buildScalingUpFullContent } from "../../../../prisma/seed-scaling-up-full-assessment";
import {
  SCALING_UP_FULL_TEMPLATE_ALIAS,
  SU_FULL_QUESTION_BENCHMARKS,
  SU_FULL_QUESTION_BENCHMARKS_EFFECTIVE_DATE,
  SU_FULL_QUESTION_BENCHMARKS_SOURCE,
  SU_FULL_QUESTION_BENCHMARKS_VERSION,
} from "@/lib/assessments/su-full-question-benchmarks";

const EXPECTED_VALUES = [
  6.3, 7.2, 5.6, 5.9, 6.2, 4.6, 4.4, 5.5, 7.2, 6.4,
  5.7, 5.2, 7.3, 6.7, 6.0, 5.4, 5.3, 4.9, 4.2, 2.4,
  6.2, 6.0, 5.9, 4.7, 5.8, 5.9, 5.0, 5.6, 5.7, 5.6,
  6.1, 6.4, 5.9, 5.0, 6.2, 6.2, 6.3, 6.9, 6.7, 6.2,
  8.0, 7.0, 5.8, 6.9, 7.8, 5.8, 5.0, 5.8, 4.0, 3.0,
  6.5, 6.0, 5.1, 6.2, 5.9, 4.8, 5.6, 5.0, 5.9, 6.4,
  5.6,
];

const EXPECTED_KEYS = Array.from(
  { length: 61 },
  (_, index) => `Q${String(index + 1).padStart(2, "0")}`,
);

describe("Scaling Up Full per-question peer benchmark snapshot", () => {
  it("records explicit provenance for the controlled Esperto capture", () => {
    expect(SCALING_UP_FULL_TEMPLATE_ALIAS).toBe("scaling-up-full");
    expect(SU_FULL_QUESTION_BENCHMARKS_VERSION).toBe(
      "2026-08-14.esperto-controlled-v1",
    );
    expect(SU_FULL_QUESTION_BENCHMARKS_EFFECTIVE_DATE).toBe("2026-08-14");
    expect(SU_FULL_QUESTION_BENCHMARKS_SOURCE).toMatch(
      /Esperto controlled reports/i,
    );
  });

  it("locks the verified 61 values to Q01-Q61 in assessment order", () => {
    expect(SU_FULL_QUESTION_BENCHMARKS.map((entry) => entry.stableKey)).toEqual(
      EXPECTED_KEYS,
    );
    expect(SU_FULL_QUESTION_BENCHMARKS.map((entry) => entry.value)).toEqual(
      EXPECTED_VALUES,
    );
  });

  it("contains no duplicate keys and every value is on the 0-10 scale", () => {
    const keys = SU_FULL_QUESTION_BENCHMARKS.map((entry) => entry.stableKey);
    expect(new Set(keys).size).toBe(61);
    for (const entry of SU_FULL_QUESTION_BENCHMARKS) {
      expect(Number.isFinite(entry.value)).toBe(true);
      expect(entry.value).toBeGreaterThanOrEqual(0);
      expect(entry.value).toBeLessThanOrEqual(10);
    }
  });

  it("covers every Scaling Up Full rating question exactly once", () => {
    const content = buildScalingUpFullContent();
    const ratingKeys = (content.questions as Array<{
      stableKey: string;
      type: string;
    }>)
      .filter((question) => question.type === "SLIDER_LIKERT")
      .map((question) => question.stableKey);

    expect(ratingKeys).toEqual(EXPECTED_KEYS);
    expect(SU_FULL_QUESTION_BENCHMARKS.map((entry) => entry.stableKey)).toEqual(
      ratingKeys,
    );
  });
});
