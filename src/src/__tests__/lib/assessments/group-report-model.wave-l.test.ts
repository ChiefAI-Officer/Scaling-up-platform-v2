/**
 * Wave L (L3 + L4) — group-report-model LVA fidelity tests.
 *
 * Exercises buildGroupReportModel for the LVA-only display behavior:
 *   - S3 rating factors carry the 0–10 `scaledValue` (Esperto Weak=0/Avg=5/
 *     Strong=10, ceil to 1dp), gated on the LVA alias + S3 section key;
 *   - the LVA gate: a non-LVA rating section → scaledValue null;
 *   - domain validation: an out-of-domain S3 value → scaledValue null +
 *     provenance.scaleDegraded true;
 *   - the L4a label override on BOTH the S3 rating factors AND the S4 options;
 *   - provenance.groupRenderVersion carries the render-ruleset constant.
 *
 * Pure — NO DB. The fixtures are hand-built with CONTROLLED S3 compositions
 * (the shared deterministic fixture makes every factor 1S+1A+1W → 5.0, which
 * can't distinguish scaled values).
 */

import {
  buildGroupReportModel,
  type GroupReportInput,
  type GroupRatingSection,
  type GroupChoicesSection,
  type GroupQualitativeSection,
} from "@/lib/assessments/group-report-model";

const SLIDER_SCALE = { min: 1, max: 3, step: 1, anchorMin: "Weak", anchorMax: "Strong" };

// Three factors with DISTINCT compositions (over the 3 respondents):
//   F_recruit  : 3,3,2  → 2 Strong + 1 Average → 8.4
//   F_culture  : 2,2,1  → 2 Average + 1 Weak   → 3.4
//   F_cash     : 2,1,1  → 1 Average + 2 Weak   → 1.7
const FACTORS = [
  { slug: "recruitment", surveyLabel: "Recruitment of new employees", values: [3, 3, 2] },
  { slug: "culture", surveyLabel: "Culture", values: [2, 2, 1] },
  { slug: "cash", surveyLabel: "Cash", values: [2, 1, 1] },
  { slug: "retaining_staff", surveyLabel: "Retaining staff", values: [3, 2, 1] },
] as const;

function lvaQuestions(): unknown[] {
  const q: unknown[] = [];
  for (const f of FACTORS) {
    q.push({
      stableKey: `S3_${f.slug}`,
      type: "SLIDER_LIKERT",
      label: f.surveyLabel,
      sectionStableKey: "S3_strengths",
      scale: SLIDER_SCALE,
    });
  }
  q.push({
    stableKey: "S4_biggest_obstacles",
    type: "MULTI_CHOICE",
    label: "What are the biggest obstacles?",
    sectionStableKey: "S4_obstacles",
    maxChoices: 3,
    options: FACTORS.map((f) => ({ key: f.slug, label: f.surveyLabel })),
  });
  return q;
}

const SECTIONS = [
  { stableKey: "S3_strengths", name: "Organizational Strengths and Weaknesses" },
  { stableKey: "S4_obstacles", name: "Biggest Obstacles" },
];

/** A 3-respondent LVA campaign with the controlled S3 compositions above. */
function lvaInput(alias = "leadership-vision-alignment"): GroupReportInput {
  const respondentIds = ["resp-ceo", "resp-2", "resp-3"];
  const submissions = respondentIds.map((respondentId, idx) => ({
    respondentId,
    answers: [
      ...FACTORS.map((f) => ({ stableKey: `S3_${f.slug}`, value: f.values[idx] })),
      // every respondent picks "recruitment"; the CEO also picks "cash".
      {
        stableKey: "S4_biggest_obstacles",
        value: idx === 0 ? ["recruitment", "cash"] : ["recruitment"],
      },
    ],
    result: {},
    respondent: { firstName: `R${idx}`, lastName: "X", jobTitle: "T" },
  }));
  return {
    alias,
    version: { questions: lvaQuestions(), sections: SECTIONS, scoringConfig: {} },
    participants: respondentIds.map((respondentId, idx) => ({
      respondentId,
      isCEO: idx === 0,
      respondent: { firstName: `R${idx}`, lastName: "X", jobTitle: "T" },
    })),
    submissions,
  };
}

function ratingOf(input: GroupReportInput): GroupRatingSection {
  const model = buildGroupReportModel(input);
  const sections = model.qualitative!.sections;
  return sections.find((s) => s.stableKey === "S3_strengths") as GroupRatingSection;
}

function factor(section: GroupRatingSection, slug: string) {
  return section.factors.find((f) => f.stableKey === `S3_${slug}`)!;
}

describe("Wave L L3 — S3 0–10 scaledValue (LVA gate)", () => {
  it("computes the bucket-derived 0–10 scaledValue for the 5 observed compositions", () => {
    const s3 = ratingOf(lvaInput());
    expect(factor(s3, "recruitment").scaledValue).toBe(8.4); // 2S+1A
    expect(factor(s3, "culture").scaledValue).toBe(3.4); // 2A+1W
    expect(factor(s3, "cash").scaledValue).toBe(1.7); // 1A+2W
    expect(factor(s3, "retaining_staff").scaledValue).toBe(5.0); // 1S+1A+1W
  });

  it("keeps the raw mean untouched as the sort key", () => {
    const s3 = ratingOf(lvaInput());
    // mean is on the stored 1–3 scale, NOT the 0–10 value.
    expect(factor(s3, "recruitment").mean).toBeCloseTo((3 + 3 + 2) / 3, 6);
    // factors are sorted by raw mean DESC.
    const means = s3.factors.map((f) => f.mean);
    expect(means).toEqual([...means].sort((a, b) => b - a));
  });

  it("does NOT compute scaledValue for a non-LVA alias (generic rating contract)", () => {
    // Same shapes, different alias that still resolves to a qualitative rating
    // section via the type-driven fallback (majority SLIDER_LIKERT → rating).
    const model = buildGroupReportModel(lvaInput("qsp-v1"));
    const s3 = model.qualitative!.sections.find(
      (s): s is GroupRatingSection =>
        s.stableKey === "S3_strengths" && s.presentation === "rating",
    );
    expect(s3).toBeDefined();
    for (const f of s3!.factors) {
      expect(f.scaledValue).toBeNull();
    }
    expect(model.provenance.scaleDegraded).toBe(false);
  });
});

describe("Wave L L3 — S3 domain validation ({1,2,3} only)", () => {
  it("suppresses scaledValue + flips scaleDegraded for an out-of-domain (imported/legacy) value", () => {
    const input = lvaInput();
    // Corrupt one respondent's recruitment answer to an out-of-domain 5.
    (input.submissions[0].answers as Array<{ stableKey: string; value: unknown }>).find(
      (a) => a.stableKey === "S3_recruitment",
    )!.value = 5;
    const model = buildGroupReportModel(input);
    const s3 = model.qualitative!.sections.find(
      (s) => s.stableKey === "S3_strengths",
    ) as GroupRatingSection;
    // The corrupted factor → scaledValue null (renderer falls back to raw mean).
    expect(factor(s3, "recruitment").scaledValue).toBeNull();
    // A clean factor still scales.
    expect(factor(s3, "culture").scaledValue).toBe(3.4);
    // The degraded signal is recorded in provenance.
    expect(model.provenance.scaleDegraded).toBe(true);
  });

  it("clean {1,2,3} data leaves scaleDegraded false", () => {
    const model = buildGroupReportModel(lvaInput());
    expect(model.provenance.scaleDegraded).toBe(false);
  });
});

describe("Wave L L4a — report factor-label overrides", () => {
  it("overrides the S3 rating factor labels with the Esperto report labels", () => {
    const s3 = ratingOf(lvaInput());
    expect(factor(s3, "recruitment").label).toBe("Recruitment of new staff");
    expect(factor(s3, "retaining_staff").label).toBe("Keeping employees");
    // an un-mapped factor keeps its survey label
    expect(factor(s3, "culture").label).toBe("Culture");
    expect(factor(s3, "cash").label).toBe("Cash");
  });

  it("overrides the S4 obstacle OPTION labels with the Esperto report labels", () => {
    const model = buildGroupReportModel(lvaInput());
    const s4 = model.qualitative!.sections.find(
      (s) => s.stableKey === "S4_obstacles",
    ) as GroupChoicesSection;
    const recruit = s4.options.find((o) => o.key === "recruitment")!;
    expect(recruit.label).toBe("Recruitment of new staff");
    const retaining = s4.options.find((o) => o.key === "retaining_staff")!;
    expect(retaining.label).toBe("Keeping employees");
    // un-mapped keeps survey label
    expect(s4.options.find((o) => o.key === "culture")!.label).toBe("Culture");
  });

  it("does NOT override labels for a non-LVA alias", () => {
    const model = buildGroupReportModel(lvaInput("qsp-v1"));
    const s3 = model.qualitative!.sections.find(
      (s): s is GroupRatingSection =>
        s.stableKey === "S3_strengths" && s.presentation === "rating",
    )!;
    expect(factor(s3, "recruitment").label).toBe("Recruitment of new employees");
  });
});

describe("Wave L — provenance", () => {
  it("carries the render-ruleset version constant", () => {
    const model = buildGroupReportModel(lvaInput());
    expect(model.provenance.groupRenderVersion).toBe("lva-fidelity-v1");
  });

  function isRating(s: GroupQualitativeSection): s is GroupRatingSection {
    return s.presentation === "rating";
  }

  it("the rating section is present and is a rating presentation", () => {
    const model = buildGroupReportModel(lvaInput());
    const s3 = model.qualitative!.sections.find((s) => s.stableKey === "S3_strengths")!;
    expect(isRating(s3)).toBe(true);
  });
});
