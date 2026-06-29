/**
 * Wave L (L3 + L4) — LVA group-report DISPLAY constants tests.
 *
 * Pure-unit tests for the LVA-only display helpers: `ceil1`, `scaledRatingValue`,
 * the {1,2,3} domain guard, the report factor-label override map (both key
 * shapes), and the verbatim section-intro map. NO DB, NO React.
 */

import {
  ceil1,
  scaledRatingValue,
  s3ValuesInDomain,
  factorSlugOf,
  lvaReportFactorLabel,
  lvaReportQuestionLabel,
  lvaSectionIntro,
  LVA_REPORT_FACTOR_LABELS,
  LVA_SECTION_INTROS,
  GROUP_RENDER_VERSION,
} from "@/lib/assessments/lva-report-display";

describe("ceil1 — round UP to one decimal, float-safe", () => {
  it("keeps exact one-decimal values intact (5.0, 10.0, 6.7)", () => {
    expect(ceil1(5.0)).toBe(5.0);
    expect(ceil1(10.0)).toBe(10.0);
    expect(ceil1(6.7)).toBe(6.7);
  });

  it("rounds UP a repeating decimal (8.3333→8.4, 1.6667→1.7, 3.3333→3.4)", () => {
    expect(ceil1((10 * 2 + 5 * 1) / 3)).toBe(8.4); // 8.333…
    expect(ceil1((5 * 1) / 3)).toBe(1.7); // 1.666…
    expect(ceil1((5 * 2) / 3)).toBe(3.4); // 3.333…
  });

  it("the epsilon prevents an exact value from being pushed up by float noise (N=7 exact 5.0)", () => {
    // 35/7 = 5.0 exactly — must stay 5.0, not climb to 5.1.
    expect(ceil1(35 / 7)).toBe(5.0);
  });

  it("an exact 10.0 from N=4 (all strong) stays 10.0", () => {
    expect(ceil1((10 * 4) / 4)).toBe(10.0);
  });
});

describe("scaledRatingValue — Esperto 0–10 (Weak=0/Avg=5/Strong=10), ceil to 1dp", () => {
  // The 5 observed compositions from the group report p7 (N=3).
  it("2 Strong + 1 Average → 8.4", () => {
    expect(scaledRatingValue(2, 1, 0)).toBe(8.4);
  });
  it("1 Strong + 2 Average → 6.7", () => {
    expect(scaledRatingValue(1, 2, 0)).toBe(6.7);
  });
  it("all Average → 5.0", () => {
    expect(scaledRatingValue(0, 3, 0)).toBe(5.0);
  });
  it("1S + 1A + 1W → 5.0", () => {
    expect(scaledRatingValue(1, 1, 1)).toBe(5.0);
  });
  it("2 Average + 1 Weak → 3.4", () => {
    expect(scaledRatingValue(0, 2, 1)).toBe(3.4);
  });
  it("1 Average + 2 Weak → 1.7", () => {
    expect(scaledRatingValue(0, 1, 2)).toBe(1.7);
  });

  it("N=2 and N=4 edge compositions", () => {
    expect(scaledRatingValue(1, 1, 0)).toBe(7.5); // (10+5)/2
    expect(scaledRatingValue(2, 0, 2)).toBe(5.0); // (20+0)/4
    expect(scaledRatingValue(4, 0, 0)).toBe(10.0);
    expect(scaledRatingValue(0, 0, 4)).toBe(0.0);
  });
});

describe("s3ValuesInDomain — only {1,2,3} is valid for the 0–10 scaling", () => {
  it("true for in-domain values", () => {
    expect(s3ValuesInDomain([1, 2, 3])).toBe(true);
    expect(s3ValuesInDomain([2, 2, 2])).toBe(true);
  });
  it("false for an out-of-domain (imported/legacy) value", () => {
    expect(s3ValuesInDomain([1, 2, 5])).toBe(false); // a 5 cannot be Weak/Avg/Strong
    expect(s3ValuesInDomain([0, 1, 2])).toBe(false);
    expect(s3ValuesInDomain([2.5])).toBe(false);
  });
});

describe("factorSlugOf — normalize both key shapes to the bare slug", () => {
  it("strips the S3_ prefix from a rating key", () => {
    expect(factorSlugOf("S3_recruitment")).toBe("recruitment");
    expect(factorSlugOf("S3_growth_financing")).toBe("growth_financing");
  });
  it("leaves a bare S4 option key unchanged", () => {
    expect(factorSlugOf("recruitment")).toBe("recruitment");
    expect(factorSlugOf("the_leadership")).toBe("the_leadership");
  });
});

describe("lvaReportFactorLabel — Esperto report label overrides", () => {
  it("overrides the ~6 divergent factors for the S3 rating key shape", () => {
    expect(lvaReportFactorLabel("S3_recruitment", "Recruitment of new employees")).toBe(
      "Recruitment of new staff",
    );
    expect(lvaReportFactorLabel("S3_retaining_staff", "Retaining staff")).toBe(
      "Keeping employees",
    );
    expect(lvaReportFactorLabel("S3_leadership_team", "Leadership Team")).toBe(
      "Leadership team",
    );
    expect(lvaReportFactorLabel("S3_internal_comms", "Internal communications")).toBe(
      "Internal Communication",
    );
    expect(lvaReportFactorLabel("S3_growth_financing", "Growth Financing")).toBe(
      "Financing growth",
    );
  });

  it("overrides for the bare S4 option key shape too", () => {
    expect(lvaReportFactorLabel("recruitment", "Recruitment of new employees")).toBe(
      "Recruitment of new staff",
    );
    expect(lvaReportFactorLabel("growth_financing", "Growth Financing")).toBe(
      "Financing growth",
    );
  });

  it("keeps the original label for an un-mapped slug (no crash)", () => {
    expect(lvaReportFactorLabel("S3_culture", "Culture")).toBe("Culture");
    expect(lvaReportFactorLabel("cash", "Cash")).toBe("Cash");
    expect(lvaReportFactorLabel("S3_unknown_factor", "Whatever")).toBe("Whatever");
  });

  it("the override map has exactly the 6 documented entries", () => {
    expect(Object.keys(LVA_REPORT_FACTOR_LABELS).sort()).toEqual(
      [
        "growth_financing",
        "internal_comms",
        "leadership_team",
        "recruitment",
        "retaining_staff",
        "the_leadership",
      ].sort(),
    );
  });
});

describe("lvaSectionIntro — verbatim Esperto section intros", () => {
  it("S3_strengths intro is the exact source string", () => {
    expect(lvaSectionIntro("S3_strengths")).toBe(
      "The team rated the company with 16 factors that affect the success of an organization. Each factor was rated with 'strong', 'average' or 'weak'.",
    );
  });
  it("S4_obstacles intro is the exact source string", () => {
    expect(lvaSectionIntro("S4_obstacles")).toBe(
      "We asked about the biggest constraints to reach the goals of the company. This is what the team rated:",
    );
  });
  // Full-string assertions (not a prefix): these were transcribed char-for-char
  // from the group-report PDF p3 (S1) / p4 (S2), so drift must fail the test.
  it("S1_financials intro is the exact source string (PDF p3)", () => {
    expect(lvaSectionIntro("S1_financials")).toBe(
      "We've asked the leadership team what their view is on the future development of the organization. The table below shows what the team aspires the company to be in three years:",
    );
  });
  it("S2_vision intro is the exact source string (PDF p4)", () => {
    expect(lvaSectionIntro("S2_vision")).toBe(
      "We've asked the team to describe what in three years the main products, partners, competitors will be. We also asked what major initiatives were to achieve that success. And of course, we asked for possible reasons why the aspiring goals would not be reached. Here you find the results:",
    );
  });
  it("S5_explained and S6_focus have NO intro", () => {
    expect(lvaSectionIntro("S5_explained")).toBeNull();
    expect(lvaSectionIntro("S6_focus")).toBeNull();
    expect(LVA_SECTION_INTROS.S5_explained).toBeUndefined();
    expect(LVA_SECTION_INTROS.S6_focus).toBeUndefined();
  });
});

describe("GROUP_RENDER_VERSION", () => {
  it("is the stable lva-fidelity-v1 provenance constant", () => {
    expect(GROUP_RENDER_VERSION).toBe("lva-fidelity-v1");
  });
});

describe("lvaReportQuestionLabel — S5 'why' heading consistency", () => {
  it("rewrites the factor name in an S5 heading to the report label (the 6 that differ)", () => {
    expect(
      lvaReportQuestionLabel(
        "S5_why_recruitment",
        "Why is Recruitment of new employees a hindrance?",
      ),
    ).toBe("Why is Recruitment of new staff a hindrance?");
    expect(
      lvaReportQuestionLabel("S5_why_retaining_staff", "Why is Retaining staff a hindrance?"),
    ).toBe("Why is Keeping employees a hindrance?");
    expect(
      lvaReportQuestionLabel("S5_why_growth_financing", "Why is Growth Financing a hindrance?"),
    ).toBe("Why is Financing growth a hindrance?");
    expect(
      lvaReportQuestionLabel("S5_why_the_leadership", "Why is The leadership a hindrance?"),
    ).toBe("Why is The Leadership a hindrance?");
  });

  it("leaves a non-differing factor unchanged (survey label == report label)", () => {
    expect(
      lvaReportQuestionLabel("S5_why_culture", "Why is Culture a hindrance?"),
    ).toBe("Why is Culture a hindrance?");
  });

  it("does not touch the always-on S5 questions or non-S5 keys", () => {
    expect(
      lvaReportQuestionLabel("S5_other_factor", "Is another factor hindering your growth? If so, which?"),
    ).toBe("Is another factor hindering your growth? If so, which?");
    expect(lvaReportQuestionLabel("S2_main_products", "What are the main products?")).toBe(
      "What are the main products?",
    );
  });

  it("is template-agnostic: swaps the name inside any wording, not a hardcoded heading", () => {
    expect(
      lvaReportQuestionLabel("S5_why_recruitment", "Recruitment of new employees — explain"),
    ).toBe("Recruitment of new staff — explain");
  });
});
