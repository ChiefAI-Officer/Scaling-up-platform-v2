/**
 * Wave F #22 — group-report fixtures.
 *
 * Faithful, DB-free fixtures for the campaign group-report model. Built from
 * the REAL LVA seed shapes (src/prisma/seed-lva-assessment.ts):
 *   - S1_financials : 9 NUMBER  (S1_revenue, S1_gross_margin, ...)
 *   - S2_vision     : 8 TEXT     (S2_main_products, ...)
 *   - S3_strengths  : 16 SLIDER_LIKERT, scale 1-3 (Weak/Strong); keys S3_<factor>
 *   - S4_obstacles  : 1 MULTI_CHOICE (S4_biggest_obstacles, maxChoices 3),
 *                     option keys = the 16 factor slugs
 *   - S5_explained  : 16 optional TEXT (S5_why_<factor>) + 2 required TEXT
 *   - S6_focus      : 1 NUMBER (S6_rehire_pct) + 14 TEXT
 *
 * The shapes intentionally mirror what the live submit route persists:
 *   version.questions = [{ stableKey, type, label, sectionStableKey, scale?, options? }]
 *   version.sections  = [{ stableKey, name, description? }]
 *   submission.answers = [{ stableKey, value }]   (value: number | string | string[])
 *   submission.result  = a frozen ScoreResult (shape only matters to T5)
 *
 * Exported for reuse by the T4 (qualitative aggregation) and T5 (scored
 * aggregation) tasks so all three tasks aggregate over identical inputs.
 */

import type { GroupReportInput } from "@/lib/assessments/group-report-model";

// ─── Factor slugs (verbatim from the LVA seed) ──────────────────────────────

export const LVA_FACTOR_KEYS = [
  "recruitment",
  "retaining_staff",
  "leadership_team",
  "the_leadership",
  "culture",
  "internal_comms",
  "strategy",
  "execution",
  "marketing",
  "sales",
  "technology",
  "scalability",
  "innovation",
  "financial_processes",
  "cash",
  "growth_financing",
] as const;

const FACTOR_LABELS: Record<string, string> = {
  recruitment: "Recruitment of new employees",
  retaining_staff: "Retaining staff",
  leadership_team: "Leadership Team",
  the_leadership: "The Leadership",
  culture: "Culture",
  internal_comms: "Internal communications",
  strategy: "Strategy",
  execution: "Execution and operational processes",
  marketing: "Marketing",
  sales: "Sales",
  technology: "Technology",
  scalability: "Scalability",
  innovation: "Innovation",
  financial_processes: "Financial processes",
  cash: "Cash",
  growth_financing: "Growth Financing",
};

// ─── Version (questions + sections) — shared by every LVA fixture ───────────

export const LVA_SECTIONS = [
  { stableKey: "S1_financials", name: "The Company in Three Years" },
  { stableKey: "S2_vision", name: "Vision on the Future" },
  { stableKey: "S3_strengths", name: "Organizational Strengths and Weaknesses" },
  { stableKey: "S4_obstacles", name: "Biggest Obstacles" },
  { stableKey: "S5_explained", name: "Obstacles Explained" },
  { stableKey: "S6_focus", name: "Important Focus Areas" },
];

const SLIDER_SCALE = { min: 1, max: 3, step: 1, anchorMin: "Weak", anchorMax: "Strong" };

function lvaQuestions(): unknown[] {
  const q: unknown[] = [];

  // S1 — 9 NUMBER
  const s1 = [
    ["S1_revenue", "Revenue (in million)"],
    ["S1_gross_margin", "Gross margin (in million)"],
    ["S1_net_profit_pct", "Net profit (%)"],
    ["S1_customers", "Number of customers"],
    ["S1_total_employees", "Total number of employees"],
    ["S1_permanent_fte", "Permanent FTE"],
    ["S1_parttime_fte", "Part-time FTE"],
    ["S1_branches", "Number of branch-offices"],
    ["S1_countries", "Number of countries"],
  ];
  for (const [stableKey, label] of s1) {
    q.push({ stableKey, type: "NUMBER", label, sectionStableKey: "S1_financials" });
  }

  // S2 — 8 TEXT required
  const s2 = [
    ["S2_main_products", "What are your main products/services?"],
    ["S2_main_partners", "Who are your main partners?"],
    ["S2_main_competitors", "Who are your main competitors?"],
    ["S2_media", "What will the media say about you?"],
    ["S2_reason_success", "What is the main reason for your success?"],
    ["S2_employees_say", "What will employees say about working here?"],
    ["S2_major_initiatives", "What are your major initiatives?"],
    ["S2_reason_not_reach", "What could stop you reaching this vision?"],
  ];
  for (const [stableKey, label] of s2) {
    q.push({ stableKey, type: "TEXT", label, sectionStableKey: "S2_vision" });
  }

  // S3 — 16 SLIDER_LIKERT, scale 1-3
  for (const factor of LVA_FACTOR_KEYS) {
    q.push({
      stableKey: `S3_${factor}`,
      type: "SLIDER_LIKERT",
      label: FACTOR_LABELS[factor],
      sectionStableKey: "S3_strengths",
      scale: SLIDER_SCALE,
    });
  }

  // S4 — 1 MULTI_CHOICE (maxChoices 3), options = the 16 factor slugs
  q.push({
    stableKey: "S4_biggest_obstacles",
    type: "MULTI_CHOICE",
    label: "What are the biggest obstacles to reaching your vision?",
    sectionStableKey: "S4_obstacles",
    maxChoices: 3,
    options: LVA_FACTOR_KEYS.map((key) => ({ key, label: FACTOR_LABELS[key] })),
  });

  // S5 — 16 optional TEXT (one per factor) + 2 required TEXT
  for (const factor of LVA_FACTOR_KEYS) {
    q.push({
      stableKey: `S5_why_${factor}`,
      type: "TEXT",
      label: `Why is "${FACTOR_LABELS[factor]}" an obstacle?`,
      sectionStableKey: "S5_explained",
    });
  }
  q.push({
    stableKey: "S5_other_factor",
    type: "TEXT",
    label: "Any other factor?",
    sectionStableKey: "S5_explained",
  });
  q.push({
    stableKey: "S5_change_one_thing",
    type: "TEXT",
    label: "If you could change one thing, what would it be?",
    sectionStableKey: "S5_explained",
  });

  // S6 — 1 NUMBER (rehire %) + a couple of TEXT (subset is fine for fixtures)
  q.push({
    stableKey: "S6_rehire_pct",
    type: "NUMBER",
    label: "What % of your current team would you rehire?",
    sectionStableKey: "S6_focus",
  });
  q.push({
    stableKey: "S6_top_priority",
    type: "TEXT",
    label: "What is your top priority for the next year?",
    sectionStableKey: "S6_focus",
  });

  return q;
}

/** Minimal ScoreResult-ish object (T5 fleshes out aggregation; shape is enough). */
function lvaResult(sliderValues: Record<string, number>): unknown {
  const perQuestion = Object.entries(sliderValues).map(([stableKey, value]) => ({
    stableKey,
    value,
    achieved: value >= 2,
  }));
  return {
    perQuestion,
    perSection: [
      {
        stableKey: "S3_strengths",
        name: "Organizational Strengths and Weaknesses",
        totalPoints: perQuestion.reduce((a, q) => a + q.value, 0),
        averagePoints:
          perQuestion.length > 0
            ? perQuestion.reduce((a, q) => a + q.value, 0) / perQuestion.length
            : null,
        answeredSectionCount: 1,
        totalSectionCount: 1,
        tier: null,
      },
    ],
    overallTotal: perQuestion.reduce((a, q) => a + q.value, 0),
    overallAverage:
      perQuestion.length > 0
        ? perQuestion.reduce((a, q) => a + q.value, 0) / perQuestion.length
        : 0,
    countAchieved: perQuestion.filter((q) => q.achieved).length,
    tier: { label: "Submitted", message: "Submitted", index: 0 },
    tierMetricValue: 0,
    unansweredKeys: [],
  };
}

// ─── Per-respondent answer builders ─────────────────────────────────────────

function sliderAnswers(base: number): Array<{ stableKey: string; value: number }> {
  // A deterministic spread of 1-3 ratings across the 16 factors.
  return LVA_FACTOR_KEYS.map((factor, i) => ({
    stableKey: `S3_${factor}`,
    value: ((base + i) % 3) + 1,
  }));
}

function sliderMap(base: number): Record<string, number> {
  const m: Record<string, number> = {};
  for (const a of sliderAnswers(base)) m[a.stableKey] = a.value;
  return m;
}

/**
 * CEO "John CEOExec" — full financials (incl. a real 0 for branches),
 * 16 sliders, a 2-pick MULTI_CHOICE, and some TEXT.
 */
function ceoSubmission() {
  const answers: Array<{ stableKey: string; value: number | string | string[] }> = [
    { stableKey: "S1_revenue", value: 50 },
    { stableKey: "S1_gross_margin", value: 0 }, // a real, present 0
    { stableKey: "S1_net_profit_pct", value: 12 },
    { stableKey: "S1_customers", value: 1200 },
    { stableKey: "S1_total_employees", value: 80 },
    { stableKey: "S1_permanent_fte", value: 70 },
    { stableKey: "S1_parttime_fte", value: 10 },
    { stableKey: "S1_branches", value: 0 }, // a real, present 0
    { stableKey: "S1_countries", value: 3 },
    ...sliderAnswers(0),
    { stableKey: "S4_biggest_obstacles", value: ["cash", "strategy", "leadership_team"] },
    { stableKey: "S5_why_cash", value: "Working capital is tight." },
    { stableKey: "S2_main_products", value: "SaaS platform." },
    { stableKey: "S6_rehire_pct", value: 90 },
  ];
  return {
    respondentId: "resp-ceo",
    answers,
    result: lvaResult(sliderMap(0)),
    respondent: { firstName: "John", lastName: "CEOExec", jobTitle: "CEO" },
  };
}

/** "Kathy HR" — sliders + a single obstacle + some text. */
function kathySubmission() {
  const answers: Array<{ stableKey: string; value: number | string | string[] }> = [
    ...sliderAnswers(1),
    { stableKey: "S4_biggest_obstacles", value: ["recruitment", "retaining_staff"] },
    { stableKey: "S5_why_recruitment", value: "Hiring pipeline is thin." },
    { stableKey: "S2_main_products", value: "People and culture." },
  ];
  return {
    respondentId: "resp-kathy",
    answers,
    result: lvaResult(sliderMap(1)),
    respondent: { firstName: "Kathy", lastName: "HR", jobTitle: "Head of People" },
  };
}

/** "Jeff Services" — sliders + a single obstacle. */
function jeffSubmission() {
  const answers: Array<{ stableKey: string; value: number | string | string[] }> = [
    ...sliderAnswers(2),
    { stableKey: "S4_biggest_obstacles", value: ["execution"] },
    { stableKey: "S6_top_priority", value: "Tighten delivery." },
  ];
  return {
    respondentId: "resp-jeff",
    answers,
    result: lvaResult(sliderMap(2)),
    respondent: { firstName: "Jeff", lastName: "Services", jobTitle: "Head of Services" },
  };
}

// ─── Exported fixture factories ─────────────────────────────────────────────

/**
 * Healthy LVA campaign: a CEO + two other respondents, all completed.
 * Participants row carries isCEO + the respondent profile (the canonical name
 * source for the cohort).
 */
export function fixtureLva(): GroupReportInput {
  return {
    alias: "leadership-vision-alignment",
    version: { questions: lvaQuestions(), sections: LVA_SECTIONS, scoringConfig: {} },
    participants: [
      {
        respondentId: "resp-ceo",
        isCEO: true,
        respondent: { firstName: "John", lastName: "CEOExec", jobTitle: "CEO" },
      },
      {
        respondentId: "resp-kathy",
        isCEO: false,
        respondent: { firstName: "Kathy", lastName: "HR", jobTitle: "Head of People" },
      },
      {
        respondentId: "resp-jeff",
        isCEO: false,
        respondent: { firstName: "Jeff", lastName: "Services", jobTitle: "Head of Services" },
      },
    ],
    submissions: [ceoSubmission(), kathySubmission(), jeffSubmission()],
  };
}

/**
 * Same campaign, but one completed submission ("Olivia Orphan") belongs to a
 * respondent who is NOT in the participants list — must still be in the cohort,
 * named from its OWN respondent relation, and flagged isOrphan.
 */
export function fixtureLvaWithOrphan(): GroupReportInput {
  const base = fixtureLva();
  return {
    ...base,
    submissions: [
      ...base.submissions,
      {
        respondentId: "resp-orphan",
        answers: [
          ...sliderAnswers(0),
          { stableKey: "S2_main_products", value: "Legacy services." },
        ],
        result: lvaResult(sliderMap(0)),
        respondent: { firstName: "Olivia", lastName: "Orphan", jobTitle: "Advisor" },
      },
    ],
  };
}

/**
 * A campaign with malformed answers in one submission:
 *   - a NUMBER answered with a string (type mismatch → dropped, degraded)
 *   - a SLIDER answered with NaN (not finite → dropped, degraded)
 *   - a MULTI_CHOICE with an unknown option key + a duplicate (cleaned)
 *   - a TEXT answered with a number (type mismatch → dropped)
 *   - an answer row for an unknown stableKey (ignored, degraded)
 * The submission itself MUST stay in the cohort (never dropped).
 */
export function fixtureLvaMalformed(): GroupReportInput {
  const base = fixtureLva();
  return {
    ...base,
    submissions: [
      {
        respondentId: "resp-ceo",
        answers: [
          { stableKey: "S1_revenue", value: "not-a-number" }, // type mismatch → drop
          { stableKey: "S1_gross_margin", value: 0 }, // a real 0 → present
          { stableKey: "S3_recruitment", value: Number.NaN }, // not finite → drop
          {
            stableKey: "S4_biggest_obstacles",
            value: ["cash", "not_a_factor", "cash"], // unknown key + dup → cleaned to ["cash"]
          },
          { stableKey: "S2_main_products", value: 42 }, // TEXT given a number → drop
          { stableKey: "S99_unknown_key", value: "x" }, // unknown stableKey → ignore
        ],
        result: lvaResult({ S3_recruitment: 2 }),
        respondent: { firstName: "John", lastName: "CEOExec", jobTitle: "CEO" },
      },
    ],
    participants: [
      {
        respondentId: "resp-ceo",
        isCEO: true,
        respondent: { firstName: "John", lastName: "CEOExec", jobTitle: "CEO" },
      },
    ],
  };
}
