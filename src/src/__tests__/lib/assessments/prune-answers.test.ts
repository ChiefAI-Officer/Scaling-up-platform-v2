import { pruneAnswersToQuestions } from "@/lib/assessments/prune-answers";

describe("pruneAnswersToQuestions", () => {
  it("drops answers whose stableKey is not in the known set", () => {
    expect(
      pruneAnswersToQuestions({ a: 1, b: "x", stale: 9 }, new Set(["a", "b"])),
    ).toEqual({ a: 1, b: "x" });
  });

  it("returns the SAME object reference when nothing is pruned (avoids needless rerender)", () => {
    const input = { a: 1 };
    expect(pruneAnswersToQuestions(input, new Set(["a"]))).toBe(input);
  });

  it("returns the same reference for an empty answers map", () => {
    const input = {};
    expect(pruneAnswersToQuestions(input, new Set(["a"]))).toBe(input);
  });

  it("drops ALL keys when none are known (returns a fresh empty object)", () => {
    const input = { a: 1, b: 2 };
    const out = pruneAnswersToQuestions(input, new Set<string>());
    expect(out).toEqual({});
    expect(out).not.toBe(input);
  });
});
