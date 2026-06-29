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

import type {
  GroupReportInput,
  GroupReportRespondentProfile,
} from "@/lib/assessments/group-report-model";

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

// ════════════════════════════════════════════════════════════════════════════
//  SCORED fixtures (T5) — Rockefeller (section-only) + Scaling Up Full (domains)
// ════════════════════════════════════════════════════════════════════════════
//
// These mirror the REAL scored seed shapes:
//   - Rockefeller (alias "RockHabits"): sections S1..S10, questions Q<sec>_<q>,
//     SLIDER_LIKERT scale 0-3, a per-section averagePoints. NO domains, NO
//     scaleUpScore. tier present (banded). T5 aggregates per-section + per-Q.
//   - Scaling Up Full (alias "scaling-up-full" → unknown → DEFAULT scored):
//     perDomain (people/strategy/execution/cash/you) + scaleUpScore (0-100) +
//     a banded GLOBAL tier. T5 emits domains + scaleUpScore + tier blocks.
//
// The submission `result` is a FROZEN ScoreResult the T5 path reads VERBATIM —
// it NEVER recomputes a score. The fixtures hand-build a faithful ScoreResult.

// ─── Rockefeller (section-only scored) ──────────────────────────────────────

/** 3 sections is enough for the contract; the real seed has 10. */
const ROCK_SECTIONS = [
  { stableKey: "S1", name: "The executive team is healthy and aligned." },
  { stableKey: "S2", name: "Everyone is aligned with the #1 thing this quarter." },
  { stableKey: "S3", name: "Communication rhythm is established." },
];

/** 2 questions per section (Q<sec>_<q>); scale 0-3 SLIDER_LIKERT. */
const ROCK_SLIDER_SCALE = { min: 0, max: 3, step: 1, anchorMin: "", anchorMax: "" };

function rockQuestions(): unknown[] {
  const q: unknown[] = [];
  for (const s of ROCK_SECTIONS) {
    for (let i = 1; i <= 2; i++) {
      q.push({
        stableKey: `Q${s.stableKey.slice(1)}_${i}`,
        type: "SLIDER_LIKERT",
        label: `${s.name} — statement ${i}`,
        sectionStableKey: s.stableKey,
        scale: ROCK_SLIDER_SCALE,
      });
    }
  }
  return q;
}

/**
 * A faithful Rockefeller ScoreResult.
 * @param sectionAverages  stableKey → averagePoints for that section (or null
 *   to OMIT the section from perSection — i.e. that respondent left it blank).
 * @param questionValues   stableKey → per-question value (omit = not answered).
 * @param tierLabel        the banded tier label for this submission.
 */
function rockResult(
  sectionAverages: Record<string, number | null>,
  questionValues: Record<string, number>,
  tierLabel: string,
): unknown {
  const perSection = ROCK_SECTIONS.filter(
    (s) => sectionAverages[s.stableKey] != null,
  ).map((s) => {
    const avg = sectionAverages[s.stableKey] as number;
    return {
      stableKey: s.stableKey,
      name: s.name,
      totalPoints: avg * 2,
      averagePoints: avg,
      achievedCount: avg >= 2 ? 2 : 0,
      totalCount: 2,
    };
  });
  const perQuestion = Object.entries(questionValues).map(([stableKey, value]) => ({
    stableKey,
    value,
    achieved: value >= 2,
  }));
  const all = Object.values(sectionAverages).filter(
    (v): v is number => typeof v === "number",
  );
  const overallAverage = all.length > 0 ? all.reduce((a, b) => a + b, 0) / all.length : 0;
  return {
    perQuestion,
    perSection,
    overallTotal: perQuestion.reduce((a, q) => a + q.value, 0),
    overallAverage,
    countAchieved: perQuestion.filter((q) => q.achieved).length,
    tier: { label: tierLabel, message: `Tier: ${tierLabel}` },
    tierMetricValue: overallAverage,
    unansweredKeys: [],
  };
}

function rockSubmission(
  respondentId: string,
  profile: GroupReportRespondentProfile,
  sectionAverages: Record<string, number | null>,
  questionValues: Record<string, number>,
  tierLabel: string,
) {
  // Build answers from the per-question values (the cohort answer-normalization
  // reads these; the scored aggregation reads `result` only).
  const answers = Object.entries(questionValues).map(([stableKey, value]) => ({
    stableKey,
    value,
  }));
  return {
    respondentId,
    answers,
    result: rockResult(sectionAverages, questionValues, tierLabel),
    respondent: profile,
  };
}

const ROCK_PROFILES = {
  ceo: { firstName: "John", lastName: "CEOExec", jobTitle: "CEO" },
  amy: { firstName: "Amy", lastName: "Alpha", jobTitle: "COO" },
  bob: { firstName: "Bob", lastName: "Beta", jobTitle: "CFO" },
  cara: { firstName: "Cara", lastName: "Gamma", jobTitle: "CMO" },
} as const;

/**
 * Healthy Rockefeller campaign: CEO + 3 team, all completed.
 *
 * Section averages (averagePoints), chosen for clean hand-computable means:
 *   S1: ceo 3, amy 1, bob 2, cara 0  → teamAvg (amy,bob,cara) = (1+2+0)/3 = 1
 *   S2: ceo 2, amy 2, bob 2, cara 2  → teamAvg = 2 ; dev = 0
 *   S3: ceo 1, amy 3, bob 3, cara 0  → teamAvg = 2 ; dev = -1
 *
 * Per-question Q1_1: ceo 3, amy 1, bob 2, cara 0 → teamMean = 1, n = 3.
 */
export function fixtureRockefeller(): GroupReportInput {
  return {
    alias: "RockHabits",
    version: { questions: rockQuestions(), sections: ROCK_SECTIONS, scoringConfig: {} },
    participants: [
      { respondentId: "r-ceo", isCEO: true, respondent: ROCK_PROFILES.ceo },
      { respondentId: "r-amy", isCEO: false, respondent: ROCK_PROFILES.amy },
      { respondentId: "r-bob", isCEO: false, respondent: ROCK_PROFILES.bob },
      { respondentId: "r-cara", isCEO: false, respondent: ROCK_PROFILES.cara },
    ],
    submissions: [
      rockSubmission(
        "r-ceo",
        ROCK_PROFILES.ceo,
        { S1: 3, S2: 2, S3: 1 },
        { Q1_1: 3, Q1_2: 3, Q2_1: 2, Q2_2: 2, Q3_1: 1, Q3_2: 1 },
        "Green",
      ),
      rockSubmission(
        "r-amy",
        ROCK_PROFILES.amy,
        { S1: 1, S2: 2, S3: 3 },
        { Q1_1: 1, Q1_2: 1, Q2_1: 2, Q2_2: 2, Q3_1: 3, Q3_2: 3 },
        "Yellow",
      ),
      rockSubmission(
        "r-bob",
        ROCK_PROFILES.bob,
        { S1: 2, S2: 2, S3: 3 },
        { Q1_1: 2, Q1_2: 2, Q2_1: 2, Q2_2: 2, Q3_1: 3, Q3_2: 3 },
        "Green",
      ),
      rockSubmission(
        "r-cara",
        ROCK_PROFILES.cara,
        { S1: 0, S2: 2, S3: 0 },
        { Q1_1: 0, Q1_2: 0, Q2_1: 2, Q2_2: 2, Q3_1: 0, Q3_2: 0 },
        "Red",
      ),
    ],
  };
}

/**
 * Rockefeller where section S3 has ZERO non-CEO contributors (every team member
 * left S3 blank → omitted from their perSection). Only the CEO has an S3 value.
 * → S3.teamAvg === null, S3.dev === null (N<2 fallback).
 *   S3 per-question Q3_1: only CEO answered → teamMean null, n 0.
 *   S1 still has 3 non-CEO contributors (healthy) for contrast.
 */
export function fixtureRockefellerSparseCash(): GroupReportInput {
  return {
    alias: "RockHabits",
    version: { questions: rockQuestions(), sections: ROCK_SECTIONS, scoringConfig: {} },
    participants: [
      { respondentId: "r-ceo", isCEO: true, respondent: ROCK_PROFILES.ceo },
      { respondentId: "r-amy", isCEO: false, respondent: ROCK_PROFILES.amy },
      { respondentId: "r-bob", isCEO: false, respondent: ROCK_PROFILES.bob },
    ],
    submissions: [
      rockSubmission(
        "r-ceo",
        ROCK_PROFILES.ceo,
        { S1: 3, S2: 2, S3: 2 },
        { Q1_1: 3, Q2_1: 2, Q3_1: 2 },
        "Green",
      ),
      // amy + bob answered S1 + S2 but NOT S3.
      rockSubmission(
        "r-amy",
        ROCK_PROFILES.amy,
        { S1: 1, S2: 2, S3: null },
        { Q1_1: 1, Q2_1: 2 },
        "Yellow",
      ),
      rockSubmission(
        "r-bob",
        ROCK_PROFILES.bob,
        { S1: 2, S2: 2, S3: null },
        { Q1_1: 2, Q2_1: 2 },
        "Green",
      ),
    ],
  };
}

/**
 * Rockefeller with NO CEO submission (the CEO participant never completed).
 * The team aggregates still render; every `ceo` field is null.
 */
export function fixtureRockefellerNoCeo(): GroupReportInput {
  const base = fixtureRockefeller();
  return {
    ...base,
    submissions: base.submissions.filter((s) => s.respondentId !== "r-ceo"),
  };
}

// ─── Scaling Up Full (domains + scaleUpScore + global tier) ─────────────────

const SUF_DOMAINS = [
  { key: "people", label: "People" },
  { key: "strategy", label: "Strategy" },
  { key: "execution", label: "Execution" },
  { key: "cash", label: "Cash" },
  { key: "you", label: "You" },
] as const;

const SUF_SECTIONS = [
  { stableKey: "S_PEOPLE_YE", name: "People — your employees", domain: "people" },
  { stableKey: "S_STRATEGY", name: "Strategy", domain: "strategy" },
  { stableKey: "S_EXEC_LT", name: "Execution — leadership team", domain: "execution" },
  { stableKey: "S_CASH", name: "Cash", domain: "cash" },
  { stableKey: "S_YOU_LEAD", name: "You — leadership", domain: "you" },
];

const SUF_SLIDER_SCALE = { min: 0, max: 10, step: 1, anchorMin: "Low", anchorMax: "High" };

function sufQuestions(): unknown[] {
  return SUF_SECTIONS.map((s) => ({
    stableKey: `Q_${s.stableKey}`,
    type: "SLIDER_LIKERT",
    label: `${s.name} — rate 0-10`,
    sectionStableKey: s.stableKey,
    scale: SUF_SLIDER_SCALE,
  }));
}

/**
 * A faithful Scaling Up Full ScoreResult: per-domain averagePoints, a 0-100
 * scaleUpScore, and a banded GLOBAL tier.
 * @param domainAverages  domain key → averagePoints (or null = no data).
 */
function sufResult(
  domainAverages: Record<string, number | null>,
  scaleUpScore: number,
  tierLabel: string,
): unknown {
  const perDomain = SUF_DOMAINS.map((d) => ({
    key: d.key,
    label: d.label,
    averagePoints: domainAverages[d.key] ?? null,
    answeredSectionCount: domainAverages[d.key] == null ? 0 : 1,
    totalSectionCount: 1,
    tier: { label: tierLabel, message: "" },
  }));
  const perSection = SUF_SECTIONS.filter(
    (s) => domainAverages[s.domain] != null,
  ).map((s) => ({
    stableKey: s.stableKey,
    name: s.name,
    totalPoints: (domainAverages[s.domain] as number) * 1,
    averagePoints: domainAverages[s.domain] as number,
    achievedCount: 0,
    totalCount: 1,
  }));
  const vals = Object.values(domainAverages).filter(
    (v): v is number => typeof v === "number",
  );
  const overallAverage = vals.length > 0 ? vals.reduce((a, b) => a + b, 0) / vals.length : 0;
  return {
    perQuestion: SUF_SECTIONS.filter((s) => domainAverages[s.domain] != null).map(
      (s) => ({
        stableKey: `Q_${s.stableKey}`,
        value: domainAverages[s.domain] as number,
        achieved: (domainAverages[s.domain] as number) >= 5,
      }),
    ),
    perSection,
    perDomain,
    overallTotal: 0,
    overallAverage,
    countAchieved: 0,
    tier: { label: tierLabel, message: `Overall: ${tierLabel}` },
    tierMetricValue: overallAverage,
    scaleUpScore,
    unansweredKeys: [],
  };
}

const SUF_PROFILES = {
  ceo: { firstName: "Sue", lastName: "Summit", jobTitle: "CEO" },
  dee: { firstName: "Dee", lastName: "Delta", jobTitle: "VP People" },
  ed: { firstName: "Ed", lastName: "Epsilon", jobTitle: "VP Ops" },
} as const;

function sufSubmission(
  respondentId: string,
  profile: GroupReportRespondentProfile,
  domainAverages: Record<string, number | null>,
  scaleUpScore: number,
  tierLabel: string,
) {
  const answers = SUF_SECTIONS.filter((s) => domainAverages[s.domain] != null).map(
    (s) => ({ stableKey: `Q_${s.stableKey}`, value: domainAverages[s.domain] as number }),
  );
  return {
    respondentId,
    answers,
    result: sufResult(domainAverages, scaleUpScore, tierLabel),
    respondent: profile,
  };
}

/**
 * Scaling Up Full campaign: CEO + 2 team.
 *
 * Domain averages (people/strategy/execution/cash/you):
 *   ceo: {8, 6, 7, 9, 5}   scaleUpScore 70   tier "Exemplary"
 *   dee: {4, 6, 5, 3, 7}   scaleUpScore 50   tier "On the way"
 *   ed:  {2, 6, 3, 3, 9}   scaleUpScore 46   tier "Not ready"
 *
 *   people teamAvg (dee,ed) = (4+2)/2 = 3 ; ceo 8 ; dev = 5
 *   scaleUpScore teamAvg = (50+46)/2 = 48 ; ceo 70
 *   tier: ceo "Exemplary"; teamDistribution = [On the way:1, Not ready:1]
 */
export function fixtureScalingUpFull(): GroupReportInput {
  return {
    alias: "scaling-up-full",
    version: { questions: sufQuestions(), sections: SUF_SECTIONS, scoringConfig: {} },
    participants: [
      { respondentId: "s-ceo", isCEO: true, respondent: SUF_PROFILES.ceo },
      { respondentId: "s-dee", isCEO: false, respondent: SUF_PROFILES.dee },
      { respondentId: "s-ed", isCEO: false, respondent: SUF_PROFILES.ed },
    ],
    submissions: [
      sufSubmission(
        "s-ceo",
        SUF_PROFILES.ceo,
        { people: 8, strategy: 6, execution: 7, cash: 9, you: 5 },
        70,
        "Exemplary",
      ),
      sufSubmission(
        "s-dee",
        SUF_PROFILES.dee,
        { people: 4, strategy: 6, execution: 5, cash: 3, you: 7 },
        50,
        "On the way",
      ),
      sufSubmission(
        "s-ed",
        SUF_PROFILES.ed,
        { people: 2, strategy: 6, execution: 3, cash: 3, you: 9 },
        46,
        "Not ready",
      ),
    ],
  };
}

/** Scaling Up Full with a malformed `result` on one team submission (skip it). */
export function fixtureScalingUpFullDegraded(): GroupReportInput {
  const base = fixtureScalingUpFull();
  return {
    ...base,
    submissions: base.submissions.map((s) =>
      s.respondentId === "s-ed" ? { ...s, result: "not-an-object" as unknown } : s,
    ),
  };
}

/**
 * Scaling Up Full with NO CEO submission (the CEO participant never completed).
 * The team (dee, ed) still aggregates and the Peers benchmark still attaches —
 * so `devPeersTeam` (= teamAvg − peers) remains the standing signal even with
 * no CEO column. Used by Task 5 (J-2) to assert the no-CEO Peers fallback.
 *
 *   people teamAvg (dee 4, ed 2) = 3 ; ceo null ; peers 6.1 ; devPeersTeam = 3 - 6.1
 */
export function fixtureScalingUpFullNoCeo(): GroupReportInput {
  const base = fixtureScalingUpFull();
  return {
    ...base,
    submissions: base.submissions.filter((s) => s.respondentId !== "s-ceo"),
  };
}
