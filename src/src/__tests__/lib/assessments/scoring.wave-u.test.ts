/**
 * Wave U (spec 19u U-2 + D18) — scoring.ts findings-rule schemas,
 * validation tiers, and the unconditional `result.findings` snapshot.
 *
 * Pins:
 *  - per-type `recommendations` shapes accepted / cross-shapes rejected
 *  - runtime tier: NUMBER max>=min + non-overlap (gaps legal, no bounds)
 *  - publish tier: NUMBER gaps accepted + overlap rejected; MC
 *    optionKey-exists + duplicate rejected; TEXT rules rejected (they PASS
 *    the scoring/runtime schema — D10 layering); sentinels on new kinds;
 *    2,000-char text cap on all kinds; slider tiling UNCHANGED
 *  - scoreSubmission ALWAYS writes result.findings (empty when nothing
 *    fires); slider row.recommendation path untouched
 *  - SU-Full regression pin: the live seed content still validates and its
 *    Esperto-verbatim band resolution is unchanged, now mirrored in the
 *    snapshot
 */
import {
  TemplateVersionForPublishSchema,
  TemplateVersionForScoringSchema,
  scoreSubmission,
  type TemplateVersionForScoring,
  type Answer,
} from "@/lib/assessments/scoring";
import { buildScalingUpFullContent } from "../../../../prisma/seed-scaling-up-full-assessment";

// ─── Fixtures ───────────────────────────────────────────────────────────────

const section = { stableKey: "S1", sortOrder: 1, name: "General" };
const scoringConfig = {
  tierMetric: "overallAvg" as const,
  passThreshold: 4,
  tiers: [{ minMetric: 0, label: "T", message: "M" }],
};

const slider = {
  stableKey: "Q_SLIDER",
  sortOrder: 1,
  type: "SLIDER_LIKERT" as const,
  label: "Slider",
  isRequired: true,
  sectionStableKey: "S1",
  scale: { min: 0, max: 10, step: 1, anchorMin: "Lo", anchorMax: "Hi" },
};

const numberQ = {
  stableKey: "Q_NUMBER",
  sortOrder: 2,
  type: "NUMBER" as const,
  label: "Headcount",
  isRequired: false,
  sectionStableKey: "S1",
};

const multiQ = {
  stableKey: "Q_MULTI",
  sortOrder: 3,
  type: "MULTI_CHOICE" as const,
  label: "Obstacles",
  isRequired: false,
  sectionStableKey: "S1",
  options: [
    { key: "cash", label: "Cash" },
    { key: "people", label: "People" },
  ],
  maxChoices: 2,
};

const textQ = {
  stableKey: "Q_TEXT",
  sortOrder: 4,
  type: "TEXT" as const,
  label: "Notes",
  isRequired: false,
  sectionStableKey: "S1",
};

function version(questions: unknown[]): unknown {
  return { questions, sections: [section], scoringConfig };
}

const NUMBER_BANDS = [
  { minScore: 0, maxScore: 9, text: "Tiny team" },
  { minScore: 50, maxScore: 249, text: "Scale-up sized" }, // gap 10-49
];

const MC_RULES = [{ optionKey: "cash", text: "Cash finding" }];

// ─── Schema shapes ──────────────────────────────────────────────────────────

describe("per-type recommendations shapes (runtime schema)", () => {
  it("accepts NUMBER bands + MULTI_CHOICE option rules", () => {
    const r = TemplateVersionForScoringSchema.safeParse(
      version([
        slider,
        { ...numberQ, recommendations: NUMBER_BANDS },
        { ...multiQ, recommendations: MC_RULES },
      ])
    );
    expect(r.success).toBe(true);
  });

  it("rejects option-rule shape on NUMBER and band shape on MULTI_CHOICE", () => {
    expect(
      TemplateVersionForScoringSchema.safeParse(
        version([{ ...numberQ, recommendations: MC_RULES }])
      ).success
    ).toBe(false);
    expect(
      TemplateVersionForScoringSchema.safeParse(
        version([{ ...multiQ, recommendations: NUMBER_BANDS }])
      ).success
    ).toBe(false);
  });

  it("TEXT rules PASS the runtime/scoring schema (rejection is publish-tier — D10)", () => {
    const r = TemplateVersionForScoringSchema.safeParse(
      version([{ ...textQ, recommendations: NUMBER_BANDS }])
    );
    expect(r.success).toBe(true);
  });

  it("runtime rejects NUMBER band overlap and max<min", () => {
    expect(
      TemplateVersionForScoringSchema.safeParse(
        version([
          {
            ...numberQ,
            recommendations: [
              { minScore: 0, maxScore: 50, text: "a" },
              { minScore: 25, maxScore: 99, text: "b" },
            ],
          },
        ])
      ).success
    ).toBe(false);
    expect(
      TemplateVersionForScoringSchema.safeParse(
        version([
          { ...numberQ, recommendations: [{ minScore: 9, maxScore: 0, text: "a" }] },
        ])
      ).success
    ).toBe(false);
  });
});

// ─── Publish tier ───────────────────────────────────────────────────────────

describe("publish tier (Wave U)", () => {
  it("NUMBER gaps are accepted at publish (no coverage requirement — D4)", () => {
    // Wave V: the slider keeps the fixture globally scoreable (overallAvg
    // needs ≥1 slider) so the new global tier-tiling gate stays out of the way.
    expect(
      TemplateVersionForPublishSchema.safeParse(
        version([slider, { ...numberQ, recommendations: NUMBER_BANDS }])
      ).success
    ).toBe(true);
  });

  it("TEXT rules are rejected at publish, naming the question", () => {
    const r = TemplateVersionForPublishSchema.safeParse(
      version([{ ...textQ, recommendations: NUMBER_BANDS }])
    );
    expect(r.success).toBe(false);
    if (!r.success) {
      expect(JSON.stringify(r.error.issues)).toContain("Q_TEXT");
      expect(JSON.stringify(r.error.issues)).toContain("cannot carry findings rules");
    }
  });

  it("MC rule optionKey must exist among the question's options", () => {
    const r = TemplateVersionForPublishSchema.safeParse(
      version([{ ...multiQ, recommendations: [{ optionKey: "ghost", text: "x" }] }])
    );
    expect(r.success).toBe(false);
    if (!r.success) expect(JSON.stringify(r.error.issues)).toContain("ghost");
  });

  it("duplicate MC rule optionKeys are rejected", () => {
    const r = TemplateVersionForPublishSchema.safeParse(
      version([
        {
          ...multiQ,
          recommendations: [
            { optionKey: "cash", text: "a" },
            { optionKey: "cash", text: "b" },
          ],
        },
      ])
    );
    expect(r.success).toBe(false);
    if (!r.success) expect(JSON.stringify(r.error.issues)).toContain("Duplicate finding rule");
  });

  it("sentinel text is rejected on NUMBER and MC rules", () => {
    for (const qs of [
      [{ ...numberQ, recommendations: [{ minScore: 0, maxScore: 9, text: "TODO write this" }] }],
      [{ ...multiQ, recommendations: [{ optionKey: "cash", text: "PLACEHOLDER" }] }],
    ]) {
      expect(TemplateVersionForPublishSchema.safeParse(version(qs)).success).toBe(false);
    }
  });

  it("2,000-char cap applies to slider, NUMBER, and MC rule text (D21)", () => {
    const long = "x".repeat(2001);
    const atCap = "x".repeat(2000);
    for (const qs of [
      [
        {
          ...slider,
          recommendations: [
            { minScore: 0, maxScore: 5, text: long },
            { minScore: 6, maxScore: 10, text: "ok" },
          ],
        },
      ],
      [{ ...numberQ, recommendations: [{ minScore: 0, maxScore: 9, text: long }] }],
      [{ ...multiQ, recommendations: [{ optionKey: "cash", text: long }] }],
    ]) {
      const r = TemplateVersionForPublishSchema.safeParse(version(qs));
      expect(r.success).toBe(false);
      if (!r.success) expect(JSON.stringify(r.error.issues)).toContain("max 2000");
    }
    // Exactly at the cap is fine. (Wave V: slider keeps the fixture
    // globally scoreable — see the NUMBER-gaps test above.)
    expect(
      TemplateVersionForPublishSchema.safeParse(
        version([
          slider,
          { ...numberQ, recommendations: [{ minScore: 0, maxScore: 9, text: atCap }] },
        ])
      ).success
    ).toBe(true);
  });

  it("slider tiling rule is UNCHANGED (partial coverage still rejected)", () => {
    const r = TemplateVersionForPublishSchema.safeParse(
      version([
        {
          ...slider,
          recommendations: [{ minScore: 0, maxScore: 5, text: "only half" }],
        },
      ])
    );
    expect(r.success).toBe(false);
  });
});

// ─── Snapshot (D18) ────────────────────────────────────────────────────────

describe("scoreSubmission — result.findings snapshot (D18)", () => {
  const fullVersion = version([
    { ...slider, recommendations: [
      { minScore: 0, maxScore: 4, text: "Slider low" },
      { minScore: 5, maxScore: 10, text: "Slider high" },
    ] },
    { ...numberQ, recommendations: NUMBER_BANDS },
    { ...multiQ, recommendations: MC_RULES },
    textQ,
  ]) as TemplateVersionForScoring;

  it("freezes fired findings for all rule kinds, ordered by sortOrder", () => {
    const answers: Answer[] = [
      { stableKey: "Q_SLIDER", value: 7 },
      { stableKey: "Q_NUMBER", value: 100 },
      { stableKey: "Q_MULTI", value: ["cash"] },
      { stableKey: "Q_TEXT", value: "notes" },
    ];
    const result = scoreSubmission(fullVersion, answers);
    expect(result.findings).toEqual([
      expect.objectContaining({
        stableKey: "Q_SLIDER",
        questionType: "SLIDER_LIKERT",
        text: "Slider high",
      }),
      expect.objectContaining({
        stableKey: "Q_NUMBER",
        questionType: "NUMBER",
        text: "Scale-up sized",
      }),
      expect.objectContaining({
        stableKey: "Q_MULTI",
        questionType: "MULTI_CHOICE",
        text: "Cash finding",
      }),
    ]);
    // The legacy per-row slider recommendation is untouched.
    const sliderRow = result.perQuestion.find((r) => r.stableKey === "Q_SLIDER");
    expect(sliderRow?.recommendation).toBe("Slider high");
  });

  it("writes findings: [] when nothing fires (unconditional write)", () => {
    const result = scoreSubmission(fullVersion, [
      { stableKey: "Q_SLIDER", value: 3 },
      { stableKey: "Q_NUMBER", value: 25 }, // gap
      { stableKey: "Q_MULTI", value: ["people"] }, // no rule
    ]);
    expect(result.findings).toEqual([
      expect.objectContaining({ stableKey: "Q_SLIDER", text: "Slider low" }),
    ]);
    const bare = scoreSubmission(
      version([slider, textQ]) as TemplateVersionForScoring,
      [{ stableKey: "Q_SLIDER", value: 3 }]
    );
    expect(bare.findings).toEqual([]);
  });
});

// ─── SU-Full regression pin ────────────────────────────────────────────────

describe("SU-Full live-content regression pin", () => {
  const content = buildScalingUpFullContent();
  const suVersion = {
    questions: content.questions,
    sections: content.sections,
    scoringConfig: content.scoringConfig,
  } as unknown as TemplateVersionForScoring;

  it("the live seed content still passes the publish schema", () => {
    const r = TemplateVersionForPublishSchema.safeParse(suVersion);
    if (!r.success) {
      console.error(JSON.stringify(r.error.issues.slice(0, 5), null, 2));
    }
    expect(r.success).toBe(true);
  });

  it("Esperto-verbatim band resolution is unchanged AND mirrored in the snapshot", () => {
    // Answer every slider with the band-stop values 0/3/5/7/10 cycling; the
    // per-row recommendation must equal the band text the seed defines, and
    // result.findings must mirror it 1:1 for the answered sliders.
    const sliders = (suVersion.questions as Array<Record<string, unknown>>).filter(
      (q) => q.type === "SLIDER_LIKERT"
    );
    const stops = [0, 3, 5, 7, 10];
    const answers: Answer[] = sliders.map((q, i) => ({
      stableKey: q.stableKey as string,
      value: stops[i % stops.length],
    }));
    const result = scoreSubmission(suVersion, answers, {
      allowMissingRequired: true,
    });

    expect(result.findings).toBeDefined();
    const findingByKey = new Map(result.findings!.map((f) => [f.stableKey, f]));
    let checked = 0;
    for (const row of result.perQuestion) {
      if (!row.recommendation) continue;
      const f = findingByKey.get(row.stableKey);
      expect(f?.text).toBe(row.recommendation);
      expect(f?.questionType).toBe("SLIDER_LIKERT");
      checked++;
    }
    expect(checked).toBe(sliders.length); // all 61 sliders resolved a band
  });
});
