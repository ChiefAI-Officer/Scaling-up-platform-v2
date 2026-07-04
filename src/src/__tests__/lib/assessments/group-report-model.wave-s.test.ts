/**
 * Wave S (Jeff #12/#13) — group-report-model peer-benchmark join tests.
 *
 * Exercises the OPTIONAL `peerBenchmarks` input on buildGroupReportModel
 * (spec 19s S-4): LVA S3 factors with a benchmark AND a non-null scaledValue
 * gain `peers` + `devPeers = round1(scaledValue − peers)`; everything else is
 * omit-empty per factor (D8). Pure — NO DB, NO flag reads (the flag gate lives
 * in the loader; the model joins whatever map it is handed).
 *
 * Fixture mirrors group-report-model.wave-l.test.ts (controlled compositions):
 *   recruitment 3,3,2 → 8.4 · culture 2,2,1 → 3.4 · cash 2,1,1 → 1.7 ·
 *   retaining_staff 3,2,1 → 5.0
 */

import {
  buildGroupReportModel,
  type GroupReportInput,
  type GroupRatingSection,
} from "@/lib/assessments/group-report-model";

const SLIDER_SCALE = { min: 1, max: 3, step: 1, anchorMin: "Weak", anchorMax: "Strong" };

const FACTORS = [
  { slug: "recruitment", surveyLabel: "Recruitment of new employees", values: [3, 3, 2] },
  { slug: "culture", surveyLabel: "Culture", values: [2, 2, 1] },
  { slug: "cash", surveyLabel: "Cash", values: [2, 1, 1] },
  { slug: "retaining_staff", surveyLabel: "Retaining staff", values: [3, 2, 1] },
] as const;

function lvaQuestions(): unknown[] {
  return FACTORS.map((f) => ({
    stableKey: `S3_${f.slug}`,
    type: "SLIDER_LIKERT",
    label: f.surveyLabel,
    sectionStableKey: "S3_strengths",
    scale: SLIDER_SCALE,
  }));
}

const SECTIONS = [
  { stableKey: "S3_strengths", name: "Organizational Strengths and Weaknesses" },
];

function lvaInput(
  peerBenchmarks?: Map<string, number>,
  alias = "leadership-vision-alignment",
): GroupReportInput {
  const respondentIds = ["resp-ceo", "resp-2", "resp-3"];
  return {
    alias,
    version: { questions: lvaQuestions(), sections: SECTIONS, scoringConfig: {} },
    participants: respondentIds.map((respondentId, idx) => ({
      respondentId,
      isCEO: idx === 0,
      respondent: { firstName: `R${idx}`, lastName: "X", jobTitle: "T" },
    })),
    submissions: respondentIds.map((respondentId, idx) => ({
      respondentId,
      answers: FACTORS.map((f) => ({ stableKey: `S3_${f.slug}`, value: f.values[idx] })),
      result: {},
      respondent: { firstName: `R${idx}`, lastName: "X", jobTitle: "T" },
    })),
    ...(peerBenchmarks ? { peerBenchmarks } : {}),
  };
}

function ratingOf(input: GroupReportInput): GroupRatingSection {
  const model = buildGroupReportModel(input);
  return model.qualitative!.sections.find(
    (s) => s.stableKey === "S3_strengths",
  ) as GroupRatingSection;
}

function factor(section: GroupRatingSection, slug: string) {
  return section.factors.find((f) => f.stableKey === `S3_${slug}`)!;
}

describe("Wave S — peer-benchmark join on LVA S3 factors", () => {
  it("joins peers by stableKey and computes signed 1dp devPeers", () => {
    const s3 = ratingOf(
      lvaInput(
        new Map([
          ["S3_recruitment", 6.3], // 8.4 − 6.3 = +2.1
          ["S3_culture", 5.0], // 3.4 − 5.0 = −1.6
          ["S3_retaining_staff", 5.0], // 5.0 − 5.0 = 0
        ]),
      ),
    );
    expect(factor(s3, "recruitment").peers).toBe(6.3);
    expect(factor(s3, "recruitment").devPeers).toBe(2.1);
    expect(factor(s3, "culture").peers).toBe(5.0);
    expect(factor(s3, "culture").devPeers).toBe(-1.6);
    expect(factor(s3, "retaining_staff").devPeers).toBe(0);
  });

  it("is omit-empty per factor: keys without a benchmark carry NO peers fields", () => {
    const s3 = ratingOf(lvaInput(new Map([["S3_recruitment", 6.3]])));
    expect(factor(s3, "recruitment").peers).toBe(6.3);
    for (const slug of ["culture", "cash", "retaining_staff"]) {
      expect("peers" in factor(s3, slug)).toBe(false);
      expect("devPeers" in factor(s3, slug)).toBe(false);
    }
  });

  it("no peerBenchmarks input ⇒ byte-identical factor objects (no new fields)", () => {
    const s3 = ratingOf(lvaInput());
    for (const f of s3.factors) {
      expect("peers" in f).toBe(false);
      expect("devPeers" in f).toBe(false);
    }
  });

  it("a benchmark keyed to an unanswered factor joins nothing", () => {
    const s3 = ratingOf(lvaInput(new Map([["S3_never_asked", 6.0]])));
    for (const f of s3.factors) expect("peers" in f).toBe(false);
  });

  it("a scale-degraded factor (out-of-domain value) gets NO peer comparison", () => {
    const input = lvaInput(new Map([["S3_recruitment", 6.3]]));
    // Corrupt one recruitment answer out of the {1,2,3} domain → scaledValue
    // null for that factor (Wave L) → no peers despite a matching benchmark.
    const answers = input.submissions[0].answers as Array<{ stableKey: string; value: unknown }>;
    answers.find((a) => a.stableKey === "S3_recruitment")!.value = 7;
    const s3 = ratingOf(input);
    const f = factor(s3, "recruitment");
    expect(f.scaledValue).toBeNull();
    expect("peers" in f).toBe(false);
  });

  it("non-LVA qualitative aliases never join (no scaledValue path)", () => {
    // qsp-v2 is qualitative (so the rating section still builds) but NOT LVA —
    // the 0–10 scale + peers join are both alias-gated off.
    const s3 = ratingOf(lvaInput(new Map([["S3_recruitment", 6.3]]), "qsp-v2"));
    const f = factor(s3, "recruitment");
    expect(f.scaledValue).toBeNull();
    expect("peers" in f).toBe(false);
  });

  it("non-finite benchmark values are ignored", () => {
    const s3 = ratingOf(lvaInput(new Map([["S3_recruitment", Number.NaN]])));
    expect("peers" in factor(s3, "recruitment")).toBe(false);
  });
});
