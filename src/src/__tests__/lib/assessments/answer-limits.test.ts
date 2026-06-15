import { MAX_TEXT_ANSWER_LENGTH } from "@/lib/assessments/answer-limits";
import { MAX_TEXT_ANSWER_LENGTH as fromScoring } from "@/lib/assessments/scoring";

describe("answer-limits", () => {
  it("exposes the 10k text limit", () => {
    expect(MAX_TEXT_ANSWER_LENGTH).toBe(10_000);
  });
  it("scoring.ts re-exports the same constant (single source of truth)", () => {
    expect(fromScoring).toBe(MAX_TEXT_ANSWER_LENGTH);
  });
});
