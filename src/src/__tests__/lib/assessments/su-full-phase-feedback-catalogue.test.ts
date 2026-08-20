import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  buildPhaseRecommendations,
  SU_FULL_PHASE_FEEDBACK,
  SU_FULL_PHASE_FEEDBACK_SOURCE_ID,
} from "@/lib/assessments/su-full-phase-feedback-catalogue";
import { parseAndValidateCatalogue } from "../../../../scripts/generate-su-full-phase-feedback-catalogue";

const EXPECTED_RANGES = [
  { minScore: 0, maxScore: 4 },
  { minScore: 5, maxScore: 6 },
  { minScore: 7, maxScore: 8 },
  { minScore: 9, maxScore: 10 },
];

const CANONICAL_KEYS = Array.from(
  { length: 61 },
  (_, index) => `Q${String(index + 1).padStart(2, "0")}`,
);

const SOURCE_CSV_PATH = resolve(
  process.cwd(),
  "../docs/research/esperto-feedback-five-phase-band-catalogue-2026-08-20.csv",
);

describe("SU Full phase feedback catalogue", () => {
  it("preserves every audited phase, canonical question, score band, and nonblank record", () => {
    expect(SU_FULL_PHASE_FEEDBACK_SOURCE_ID).toBe(
      "2026-08-20.esperto-five-phase-v1",
    );
    expect(Object.keys(SU_FULL_PHASE_FEEDBACK)).toEqual(["1", "2", "3", "4", "5"]);

    const records: Array<{ phase: number; stableKey: string; band: { minScore: number; maxScore: number; text: string } }> = [];
    for (const phase of [1, 2, 3, 4, 5] as const) {
      const questions = SU_FULL_PHASE_FEEDBACK[phase];
      expect(Object.keys(questions)).toEqual(CANONICAL_KEYS);

      for (const stableKey of CANONICAL_KEYS) {
        const bands = questions[stableKey];
        expect(bands).toHaveLength(4);
        expect(bands.map(({ minScore, maxScore }) => ({ minScore, maxScore }))).toEqual(
          EXPECTED_RANGES,
        );
        for (const band of bands) {
          expect(band.text.trim()).not.toBe("");
          records.push({ phase, stableKey, band });
        }
      }
    }

    expect(records).toHaveLength(1220);
    expect(
      new Set(
        records.map(({ phase, stableKey, band }) =>
          `${phase}:${stableKey}:${band.minScore}-${band.maxScore}`,
        ),
      ).size,
    ).toBe(1220);
  });

  it("preserves the audited current-source sentinel text exactly", () => {
    expect(SU_FULL_PHASE_FEEDBACK[1].Q01[0]).toEqual({
      minScore: 0,
      maxScore: 4,
      text: "In order to grow, you continuously need new - and good - people. This is often one of the most important challenges for a growth entrepreneur. You indicate that when it comes to finding new employees you find this very difficult. Ultimately, this is a matter of process, attention and time, often especially on the part of the entrepreneur. How much time do you spend on this? More than one day per week?",
    });
    expect(SU_FULL_PHASE_FEEDBACK[4].Q36[1]).toEqual({
      minScore: 5,
      maxScore: 6,
      text: "If you grow, a lot changes at the same time: systems, structures, people, processes, etc. It helps a lot when your systems can handle this growth. Otherwise it's sort of like changing the tires while driving! We advise you to quickly start \"thinking ahead\" in terms of structures and systems.",
    });
    expect(SU_FULL_PHASE_FEEDBACK[5].Q24[3]).toEqual({
      minScore: 9,
      maxScore: 10,
      text: "You have the training and education of your leadership team in order. Good job. Keep it up. Growing organizations continuously require other skills, including of management members.",
    });
  });

  it("builds a detached five-phase recommendation payload for one canonical question", () => {
    const result = buildPhaseRecommendations("Q01");

    expect(result).toHaveLength(5);
    expect(result.map(({ phase }) => phase)).toEqual([1, 2, 3, 4, 5]);
    expect(result[0].bands).toEqual(SU_FULL_PHASE_FEEDBACK[1].Q01);
    expect(result[0].bands).not.toBe(SU_FULL_PHASE_FEEDBACK[1].Q01);
    expect(() => buildPhaseRecommendations("Q62")).toThrow(/unknown canonical/i);
  });

  it("fails closed when the committed CSV has an unexpected column, count, range, duplicate, or blank field", () => {
    const source = readFileSync(SOURCE_CSV_PATH, "utf8");
    const header = source.slice(0, source.indexOf("\n"));
    const firstRow = source.slice(source.indexOf("\n") + 1, source.indexOf("\n", source.indexOf("\n") + 1));

    expect(() => parseAndValidateCatalogue(source.replace(header, `${header},extra`))).toThrow(
      /columns/i,
    );
    expect(() => parseAndValidateCatalogue(`${source.trimEnd().split("\n").slice(0, -1).join("\n")}\n`)).toThrow(
      /1,220/i,
    );
    expect(() => parseAndValidateCatalogue(source.replace(",B1,0,4,Q01,", ",B1,0,3,Q01,"))).toThrow(
      /range/i,
    );
    expect(() => parseAndValidateCatalogue(`${source.trimEnd()}\n${firstRow}`)).toThrow(/duplicate/i);
    expect(() => parseAndValidateCatalogue(source.replace(",Q01,Effective recruitment process,", ",Q01,,"))).toThrow(
      /blank/i,
    );
  });
});
