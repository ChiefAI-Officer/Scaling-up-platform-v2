/**
 * Wave F #22 — group-report-model QUALITATIVE aggregation tests (T4).
 *
 * Extends the T3 core: the qualitative dispatch now fills `qualitative.sections`
 * with per-question aggregated forms. Every aggregate uses the ANSWERER
 * denominator and carries its own `n` (a blank never dilutes / never counts as
 * 0). Pure — NO DB. Fixtures are the same faithful LVA shapes the core uses.
 */

import {
  buildGroupReportModel,
  normalizeAnswer,
  type GroupQualitativeSection,
  type GroupMetricTableSection,
  type GroupRatingSection,
  type GroupChoicesSection,
  type GroupQaSection,
} from "@/lib/assessments/group-report-model";
import type { QuestionMeta } from "@/lib/assessments/question-meta";
import {
  fixtureLva,
  fixtureLvaWithOrphan,
  fixtureLvaMalformed,
} from "./fixtures/group-report-fixtures";

// ── helpers ─────────────────────────────────────────────────────────────────

function sectionsOf(input = fixtureLva()): GroupQualitativeSection[] {
  const model = buildGroupReportModel(input);
  expect(model.reportType).toBe("qualitative");
  expect(model.qualitative).toBeDefined();
  return model.qualitative!.sections;
}

function findSection(
  sections: GroupQualitativeSection[],
  stableKey: string,
): GroupQualitativeSection | undefined {
  return sections.find((s) => s.stableKey === stableKey);
}

// ── normalizeAnswer folded-in assertions (T3 review) ─────────────────────────

describe("normalizeAnswer — folded-in edge cases", () => {
  it("MULTI_CHOICE with NO options keeps non-empty strings", () => {
    const meta: QuestionMeta = { type: "MULTI_CHOICE", label: "Pick" };
    expect(normalizeAnswer(meta, ["alpha", "", "beta"])).toEqual(["alpha", "beta"]);
  });

  it("whitespace-only TEXT is dropped", () => {
    const meta: QuestionMeta = { type: "TEXT", label: "Notes" };
    expect(normalizeAnswer(meta, "   ")).toBeUndefined();
  });
});

// ── metric-table (S1_financials) ─────────────────────────────────────────────

describe("qualitative S1 — metric-table", () => {
  it("is a metric-table section with per-respondent columns in CEO-first order", () => {
    const sections = sectionsOf();
    const s1 = findSection(sections, "S1_financials") as GroupMetricTableSection;
    expect(s1).toBeDefined();
    expect(s1.presentation).toBe("metric-table");

    // Only the CEO answered financials in the fixture; one metric row, perRespondent
    // follows the model's respondent order (CEO first).
    const revenue = s1.rows.find((r) => r.stableKey === "S1_revenue");
    expect(revenue).toBeDefined();
    const model = buildGroupReportModel(fixtureLva());
    expect(revenue!.perRespondent.map((p) => p.respondentId)).toEqual(
      model.respondents.map((r) => r.respondentId),
    );
    // CEO column first.
    expect(revenue!.perRespondent[0].respondentId).toBe("resp-ceo");
    expect(revenue!.perRespondent[0].value).toBe(50);
  });

  it("Mean is over ANSWERERS only; a blank metric is null and not averaged as 0", () => {
    // A bespoke 2-respondent fixture: the CEO answers gross_margin=0, the CFO
    // answers revenue but leaves gross_margin BLANK.
    const base = fixtureLva();
    const two = {
      ...base,
      participants: [
        {
          respondentId: "resp-ceo",
          isCEO: true,
          respondent: { firstName: "John", lastName: "CEOExec", jobTitle: "CEO" },
        },
        {
          respondentId: "resp-cfo",
          isCEO: false,
          respondent: { firstName: "Cara", lastName: "CFO", jobTitle: "CFO" },
        },
      ],
      submissions: [
        {
          respondentId: "resp-ceo",
          answers: [
            { stableKey: "S1_revenue", value: 50 },
            { stableKey: "S1_gross_margin", value: 0 }, // a real, present 0
          ],
          result: {},
          respondent: { firstName: "John", lastName: "CEOExec", jobTitle: "CEO" },
        },
        {
          respondentId: "resp-cfo",
          answers: [
            { stableKey: "S1_revenue", value: 10 },
            // gross_margin left BLANK
          ],
          result: {},
          respondent: { firstName: "Cara", lastName: "CFO", jobTitle: "CFO" },
        },
      ],
    };

    const s1 = findSection(
      sectionsOf(two),
      "S1_financials",
    ) as GroupMetricTableSection;
    expect(s1.presentation).toBe("metric-table");

    const revenue = s1.rows.find((r) => r.stableKey === "S1_revenue")!;
    expect(revenue.n).toBe(2); // both answered
    expect(revenue.mean).toBe(30); // (50 + 10) / 2

    const gm = s1.rows.find((r) => r.stableKey === "S1_gross_margin")!;
    expect(gm.n).toBe(1); // only the CEO answered → blank NOT counted
    expect(gm.mean).toBe(0); // the present 0 is the mean (not diluted by the blank)
    // The non-answerer contributes null to perRespondent (in respondent order).
    const cfoCell = gm.perRespondent.find((p) => p.respondentId === "resp-cfo")!;
    expect(cfoCell.value).toBeNull();
    const ceoCell = gm.perRespondent.find((p) => p.respondentId === "resp-ceo")!;
    expect(ceoCell.value).toBe(0);
  });

  it("omits a metric row nobody answered", () => {
    const s1 = findSection(sectionsOf(), "S1_financials") as GroupMetricTableSection;
    // Nobody in fixtureLva answered S1_countries except the CEO (all 9 answered by ceo),
    // so build a fixture where no one answers a particular metric.
    const base = fixtureLva();
    const stripped = {
      ...base,
      submissions: base.submissions.map((s) =>
        s.respondentId === "resp-ceo"
          ? {
              ...s,
              answers: (s.answers as Array<{ stableKey: string }>).filter(
                (a) => a.stableKey !== "S1_countries",
              ),
            }
          : s,
      ),
    };
    const s1b = findSection(
      sectionsOf(stripped),
      "S1_financials",
    ) as GroupMetricTableSection;
    expect(s1b.rows.some((r) => r.stableKey === "S1_countries")).toBe(false);
    // sanity — a metric the CEO did answer survives
    expect(s1.rows.some((r) => r.stableKey === "S1_revenue")).toBe(true);
  });
});

// ── rating (S3_strengths) ────────────────────────────────────────────────────

describe("qualitative S3 — rating", () => {
  it("produces {strong, avg, weak, mean, n} per factor with answerer n", () => {
    const s3 = findSection(sectionsOf(), "S3_strengths") as GroupRatingSection;
    expect(s3.presentation).toBe("rating");
    expect(s3.factors.length).toBeGreaterThan(0);
    for (const f of s3.factors) {
      // All 3 respondents answered every slider.
      expect(f.n).toBe(3);
      expect(f.strong + f.avg + f.weak).toBe(f.n);
      expect(typeof f.mean).toBe("number");
      expect(typeof f.label).toBe("string");
      // label is the human factor label, not the raw key
      expect(f.label).not.toMatch(/^S3_/);
    }
  });

  it("sorts factors by mean DESCENDING", () => {
    const s3 = findSection(sectionsOf(), "S3_strengths") as GroupRatingSection;
    const means = s3.factors.map((f) => f.mean);
    const sorted = [...means].sort((a, b) => b - a);
    expect(means).toEqual(sorted);
  });
});

// ── choices (S4_obstacles) ───────────────────────────────────────────────────

describe("qualitative S4 — choices", () => {
  it("is a choices section: % of answerers, ALL options shown (incl 0%), labels not keys, sorted desc", () => {
    const s4 = findSection(sectionsOf(), "S4_obstacles") as GroupChoicesSection;
    expect(s4.presentation).toBe("choices");
    // 16 options total, all shown even at 0%
    expect(s4.options).toHaveLength(16);
    // denominator = respondents who answered the multi-choice (all 3 did)
    expect(s4.n).toBe(3);

    // CEO picked [cash, strategy, leadership_team], Kathy [recruitment, retaining_staff],
    // Jeff [execution]. So cash count = 1 → pct = round(1/3*100) = 33.
    const cash = s4.options.find((o) => o.label === "Cash")!;
    expect(cash.count).toBe(1);
    expect(cash.pct).toBe(33);

    // labels not keys
    expect(s4.options.every((o) => !/^[a-z_]+$/.test(o.label) || o.label.includes(" ") || /[A-Z]/.test(o.label))).toBe(true);
    // Wave L (L4a): LVA S4 option labels use the Esperto REPORT labels, so the
    // "recruitment" slug renders as "Recruitment of new staff" (the override),
    // NOT the survey label "Recruitment of new employees".
    expect(s4.options.some((o) => o.label === "Recruitment of new staff")).toBe(true);
    expect(s4.options.some((o) => o.label === "Recruitment of new employees")).toBe(false);

    // an unpicked option is present at 0%
    const innovation = s4.options.find((o) => o.label === "Innovation")!;
    expect(innovation.count).toBe(0);
    expect(innovation.pct).toBe(0);

    // sorted by pct (then count) descending
    const pcts = s4.options.map((o) => o.pct);
    const sorted = [...pcts].sort((a, b) => b - a);
    expect(pcts).toEqual(sorted);
  });

  it("a blank multi-choice does NOT dilute the denominator", () => {
    const base = fixtureLva();
    // add a 4th respondent who answers sliders but leaves the obstacle question blank
    const input = {
      ...base,
      participants: [
        ...base.participants,
        {
          respondentId: "resp-quiet",
          isCEO: false,
          respondent: { firstName: "Quinn", lastName: "Quiet", jobTitle: "Ops" },
        },
      ],
      submissions: [
        ...base.submissions,
        {
          respondentId: "resp-quiet",
          answers: [{ stableKey: "S2_main_products", value: "Ops only." }],
          result: {},
          respondent: { firstName: "Quinn", lastName: "Quiet", jobTitle: "Ops" },
        },
      ],
    };
    const s4 = findSection(sectionsOf(input), "S4_obstacles") as GroupChoicesSection;
    // still only 3 answered the obstacle question
    expect(s4.n).toBe(3);
  });
});

// ── qa (S2_vision free-text + S6_focus standalone NUMBER) ────────────────────

describe("qualitative qa sections", () => {
  it("a free-text question omits blank answers and lists CEO first", () => {
    const s2 = findSection(sectionsOf(), "S2_vision") as GroupQaSection;
    expect(s2.presentation).toBe("qa");
    const mainProducts = s2.questions.find(
      (q) => q.stableKey === "S2_main_products",
    );
    expect(mainProducts).toBeDefined();
    expect(mainProducts!.kind).toBe("text");
    if (mainProducts!.kind === "text") {
      // CEO + Kathy answered S2_main_products; Jeff did not → omitted
      expect(mainProducts!.answers.map((a) => a.respondentId)).toEqual([
        "resp-ceo",
        "resp-kathy",
      ]);
      expect(mainProducts!.answers[0].isCEO).toBe(true);
      expect(mainProducts!.answers[0].text).toBe("SaaS platform.");
    }
  });

  it("S5_explained (choices-mapped but TEXT-only) falls back to a qa section", () => {
    // SECTION_PRESENTATION maps LVA S5_explained → "choices", but the section
    // carries only TEXT questions (no MULTI_CHOICE). The aggregation falls back
    // to a qa block — so the rendered section's presentation is "qa".
    const s5 = findSection(sectionsOf(), "S5_explained") as GroupQaSection;
    expect(s5).toBeDefined();
    expect(s5.presentation).toBe("qa");
  });

  it("the standalone rehire NUMBER renders perRespondent + mean (answerers only)", () => {
    const s6 = findSection(sectionsOf(), "S6_focus") as GroupQaSection;
    expect(s6.presentation).toBe("qa");
    const rehire = s6.questions.find((q) => q.stableKey === "S6_rehire_pct");
    expect(rehire).toBeDefined();
    expect(rehire!.kind).toBe("number");
    if (rehire!.kind === "number") {
      // only the CEO answered (value 90)
      expect(rehire!.n).toBe(1);
      expect(rehire!.mean).toBe(90);
      expect(rehire!.perRespondent).toHaveLength(1);
      expect(rehire!.perRespondent[0].respondentId).toBe("resp-ceo");
      expect(rehire!.perRespondent[0].value).toBe(90);
      expect(rehire!.perRespondent[0].isCEO).toBe(true);
    }
  });

  it("omits a question that nobody answered", () => {
    // S6_top_priority is only answered by Jeff in fixtureLva; build a fixture where
    // nobody answers it.
    const base = fixtureLva();
    const input = {
      ...base,
      submissions: base.submissions.map((s) =>
        s.respondentId === "resp-jeff"
          ? {
              ...s,
              answers: (s.answers as Array<{ stableKey: string }>).filter(
                (a) => a.stableKey !== "S6_top_priority",
              ),
            }
          : s,
      ),
    };
    const s6 = findSection(sectionsOf(input), "S6_focus") as GroupQaSection;
    if (s6) {
      expect(s6.questions.some((q) => q.stableKey === "S6_top_priority")).toBe(false);
    }
  });

  it("omits a section nobody answered entirely", () => {
    // strip every S2_vision answer → S2_vision section must be omitted
    const base = fixtureLva();
    const input = {
      ...base,
      submissions: base.submissions.map((s) => ({
        ...s,
        answers: (s.answers as Array<{ stableKey: string }>).filter(
          (a) => !a.stableKey.startsWith("S2_"),
        ),
      })),
    };
    const sections = sectionsOf(input);
    expect(findSection(sections, "S2_vision")).toBeUndefined();
  });
});

// ── orphan + malformed robustness ────────────────────────────────────────────

describe("qualitative aggregation — robustness", () => {
  it("an orphan respondent is included in aggregation and ordering", () => {
    const sections = sectionsOf(fixtureLvaWithOrphan());
    const s3 = findSection(sections, "S3_strengths") as GroupRatingSection;
    // 4 respondents now answer the sliders (ceo, kathy, jeff, orphan)
    expect(s3.factors[0].n).toBe(4);
  });

  it("malformed answers still aggregate and degraded propagates", () => {
    const model = buildGroupReportModel(fixtureLvaMalformed());
    expect(model.degraded).toBe(true);
    expect(model.qualitative).toBeDefined();
    const sections = model.qualitative!.sections;
    // The cleaned multi-choice (["cash"]) still produces a choices section.
    const s4 = findSection(sections, "S4_obstacles") as GroupChoicesSection;
    expect(s4.presentation).toBe("choices");
    const cash = s4.options.find((o) => o.label === "Cash")!;
    expect(cash.count).toBe(1);
    expect(s4.n).toBe(1);
  });

  it("never throws on a completely malformed input", () => {
    const bad = {
      alias: "leadership-vision-alignment",
      version: { questions: "nope" as unknown, sections: 123 as unknown },
      participants: "nope" as unknown,
      submissions: [
        { respondentId: "x", answers: "nope" as unknown, result: null as unknown },
      ] as unknown,
    } as unknown as Parameters<typeof buildGroupReportModel>[0];
    expect(() => buildGroupReportModel(bad)).not.toThrow();
    const model = buildGroupReportModel(bad);
    expect(model.qualitative?.sections).toEqual([]);
  });
});
