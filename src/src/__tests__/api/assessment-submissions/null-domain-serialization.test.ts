/**
 * D2.1 consumer test (Codex round 2 #4 + round 3 #2) — null-domain JSON
 * serialization round-trip.
 *
 * The submission API persists `ScoreResult` as JSON. A null `perDomain[i]
 * .averagePoints` MUST survive `JSON.stringify` / `JSON.parse` as `null`,
 * not silently coerce to `0`, `NaN`, or the literal string "null". This
 * regression-guards against future formatters or middleware that might
 * mishandle the value at the boundary.
 */

import {
  scoreSubmission,
  type Answer,
  type TemplateVersionForScoring,
} from "@/lib/assessments/scoring";

function buildNullDomainVersion(): TemplateVersionForScoring {
  const sections: TemplateVersionForScoring["sections"] = [
    {
      stableKey: "S1",
      sortOrder: 1,
      name: "S1",
      domain: "D1",
    } as TemplateVersionForScoring["sections"][number],
    {
      stableKey: "S2",
      sortOrder: 2,
      name: "S2",
      domain: "D2",
    } as TemplateVersionForScoring["sections"][number],
  ];
  const questions: TemplateVersionForScoring["questions"] = [
    ...["S1", "S2"].flatMap((sk, i) =>
      [1, 2].map((q) => ({
        stableKey: `${sk}_Q${q}`,
        sortOrder: i * 2 + q,
        type: "SLIDER_LIKERT" as const,
        label: `${sk}Q${q}`,
        sectionStableKey: sk,
        isRequired: false, // optional → S2 can stay unanswered
        scale: { min: 0, max: 10, step: 1, anchorMin: "L", anchorMax: "H" },
      })),
    ),
  ];
  return {
    sections,
    questions,
    scoringConfig: {
      tierMetric: "overallTotal",
      passThreshold: 7,
      tiers: [
        { minMetric: 0, maxMetric: 20, label: "Lo", message: "lo" },
        { minMetric: 21, maxMetric: 40, label: "Hi", message: "hi" },
      ],
      domains: [
        {
          key: "D1",
          label: "D1",
          tiers: [
            { minMetric: 0, maxMetric: 5, label: "Lo", message: "lo" },
            { minMetric: 5, maxMetric: 10, label: "Hi", message: "hi" },
          ],
        },
        {
          key: "D2",
          label: "D2",
          tiers: [
            { minMetric: 0, maxMetric: 5, label: "Lo", message: "lo" },
            { minMetric: 5, maxMetric: 10, label: "Hi", message: "hi" },
          ],
        },
      ],
    } as unknown as TemplateVersionForScoring["scoringConfig"],
  };
}

describe("null-domain JSON serialization round-trip", () => {
  it("preserves perDomain[i].averagePoints === null through JSON.stringify / JSON.parse", () => {
    const version = buildNullDomainVersion();
    // Only S1 answered → D2 is the null domain.
    const answers: Answer[] = [
      { stableKey: "S1_Q1", value: 4 },
      { stableKey: "S1_Q2", value: 4 },
    ];
    const result = scoreSubmission(version, answers);

    expect(result.perDomain).toBeDefined();
    const d2 = result.perDomain!.find((d) => d.key === "D2");
    expect(d2).toBeDefined();
    expect(d2!.averagePoints).toBeNull();

    // Round-trip through JSON.stringify / JSON.parse (mirrors what the
    // submission API does when persisting + later reading).
    const wire = JSON.parse(JSON.stringify(result));
    const roundTripped = wire.perDomain.find(
      (d: { key: string }) => d.key === "D2",
    );
    expect(roundTripped).toBeDefined();
    expect(roundTripped.averagePoints).toBeNull();
    expect(typeof roundTripped.averagePoints).toBe("object"); // null is "object"
    // Explicitly NOT 0, NOT NaN, NOT the string "null".
    expect(roundTripped.averagePoints).not.toBe(0);
    expect(roundTripped.averagePoints).not.toBe("null");
    expect(Number.isNaN(roundTripped.averagePoints)).toBe(false);
    expect(roundTripped.tier).toBeNull();
    expect(roundTripped.answeredSectionCount).toBe(0);
    expect(roundTripped.totalSectionCount).toBe(1);
  });

  it("non-null domain averagePoints round-trips as a number", () => {
    const version = buildNullDomainVersion();
    const answers: Answer[] = [
      { stableKey: "S1_Q1", value: 4 },
      { stableKey: "S1_Q2", value: 6 },
      { stableKey: "S2_Q1", value: 8 },
      { stableKey: "S2_Q2", value: 6 },
    ];
    const result = scoreSubmission(version, answers);
    const wire = JSON.parse(JSON.stringify(result));
    for (const d of wire.perDomain) {
      expect(typeof d.averagePoints).toBe("number");
      expect(Number.isFinite(d.averagePoints)).toBe(true);
    }
  });
});
