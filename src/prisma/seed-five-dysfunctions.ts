/**
 * Seed — The Five Dysfunctions of a Team — Team Assessment
 *
 * 38 SLIDER_LIKERT questions (1–5 scale, anchorMin "Never" / anchorMax "Always"),
 * grouped into 5 sections — one per Lencioni fundamental (Trust / Conflict /
 * Commitment / Accountability / Results). Statement→domain mapping taken
 * verbatim from the Wiley/Pfeiffer scoring grid.
 *
 * Source: Patrick Lencioni, "The Five Dysfunctions of a Team — Team Assessment"
 * © 2007 Patrick Lencioni. Published by Pfeiffer, A Wiley Imprint.
 * Scaling Up is licensed to use this content.
 *
 * Per-domain tier thresholds are the PDF's exact bands:
 *   High   ≥ 3.75  (touching boundary: minMetric 3.75)
 *   Medium 3.25–3.74 (touching: minMetric 3.25, maxMetric 3.75)
 *   Low    ≤ 3.24   (touching: minMetric 1,    maxMetric 3.25)
 *
 * Fractional-touching semantics (isInteger: false for means on a 1–5 scale):
 * each tier's minMetric === preceding tier's maxMetric. This satisfies
 * validateTierTiling and matches checkPerDomainTierTiling in scoring.ts.
 *
 * Global tier: single neutral tier covering [1, 5] — the instrument
 * reports 5 separate fundamental scores, not a single 0-100 rollup.
 * No scaleUpScore. No rollup.
 *
 * Usage (never run against prod without --i-know-this-is-prod):
 *   npx tsx prisma/seed-five-dysfunctions.ts
 *
 * This file creates a DRAFT version only. An admin must review and publish
 * the template before it serves live respondents.
 */

import { PrismaClient } from "@prisma/client";
import {
  ensureTemplateVersionContent,
  type SeedContent,
  type SeedResult,
} from "../src/lib/assessments/seed-template-version";

// ─── Template constants ───────────────────────────────────────────────────

export const ALIAS = "five-dysfunctions";
export const NAME = "The Five Dysfunctions of a Team — Team Assessment";
export const LANGUAGE = "enUS";

const TEMPLATE_DESCRIPTION =
  "38-statement team assessment based on Patrick Lencioni's Five Dysfunctions of a Team. " +
  "Measures trust, conflict, commitment, accountability, and results on a 1–5 scale. " +
  "Reports a per-fundamental average score with High/Medium/Low interpretation.";

const INVITATION_SUBJECT =
  "Your Five Dysfunctions Team Assessment is ready";

const INVITATION_BODY_MARKDOWN = `Hi {{firstName}},

Your coach has invited you to complete the **Five Dysfunctions of a Team — Team Assessment**.

This 38-statement assessment evaluates your team across five fundamentals:
Trust, Conflict, Commitment, Accountability, and Results.

[Take the Assessment]({{assessmentUrl}})

The assessment takes approximately 10–15 minutes to complete.

Best,
Scaling Up`;

// ─── Scale anchors ────────────────────────────────────────────────────────

const ANCHOR_MIN = "Never";
const ANCHOR_MAX = "Always";

// ─── Per-domain tier definitions ─────────────────────────────────────────
//
// The PDF's exact bands (average score per fundamental, 1–5):
//   High   = 3.75 and above
//   Medium = 3.25 – 3.74
//   Low    = 3.24 and below
//
// Fractional-touching convention (isInteger: false because domain averages
// are fractional). The engine's validateTierTiling requires:
//   next.minMetric === current.maxMetric (no gap, no overlap).
//
// Boundary mapping:
//   Low:    [ 1,    3.25 )  → minMetric: 1,    maxMetric: 3.25
//   Medium: [ 3.25, 3.75 )  → minMetric: 3.25, maxMetric: 3.75
//   High:   [ 3.75, 5    ]  → minMetric: 3.75, maxMetric: 5
//
// A score of exactly 3.24 → Low (≥1 and ≤3.25); 3.25 → Medium; 3.75 → High.
// This faithfully represents the published interpretation grid.

// ── Trust domain tiers ────────────────────────────────────────────────────
const TRUST_TIERS = [
  {
    minMetric: 1,
    maxMetric: 3.25,
    label: "Low",
    message:
      "Your team lacks necessary levels of openness and vulnerability about individual strengths, weaknesses, mistakes and needs for help.",
  },
  {
    minMetric: 3.25,
    maxMetric: 3.75,
    label: "Medium",
    message:
      "Your team may need to get more comfortable being vulnerable and open with one another about individual strengths, weaknesses, mistakes and needs for help.",
  },
  {
    minMetric: 3.75,
    maxMetric: 5,
    label: "High",
    message:
      "Your team has created an environment where vulnerability and openness are the norm.",
  },
] as const;

// ── Conflict domain tiers ─────────────────────────────────────────────────
const CONFLICT_TIERS = [
  {
    minMetric: 1,
    maxMetric: 3.25,
    label: "Low",
    message:
      "Your team is not comfortable engaging in unfiltered discussion around important topics.",
  },
  {
    minMetric: 3.25,
    maxMetric: 3.75,
    label: "Medium",
    message:
      "Your team may need to learn to engage in more unfiltered discussion around important topics.",
  },
  {
    minMetric: 3.75,
    maxMetric: 5,
    label: "High",
    message:
      "Your team is comfortable engaging in unfiltered discussion around important topics.",
  },
] as const;

// ── Commitment domain tiers ───────────────────────────────────────────────
const COMMITMENT_TIERS = [
  {
    minMetric: 1,
    maxMetric: 3.25,
    label: "Low",
    message:
      "Your team is not able to buy-in to clear decisions, leaving room for ambiguity and second-guessing.",
  },
  {
    minMetric: 3.25,
    maxMetric: 3.75,
    label: "Medium",
    message:
      "Your team may struggle at times to buy-in to clear decisions. This could be creating ambiguity within the organization.",
  },
  {
    minMetric: 3.75,
    maxMetric: 5,
    label: "High",
    message:
      "Your team is able to buy-in to clear decisions leaving little room for ambiguity and second-guessing.",
  },
] as const;

// ── Accountability domain tiers ───────────────────────────────────────────
const ACCOUNTABILITY_TIERS = [
  {
    minMetric: 1,
    maxMetric: 3.25,
    label: "Low",
    message:
      "Your team hesitates to confront one another about performance and behavioral concerns.",
  },
  {
    minMetric: 3.25,
    maxMetric: 3.75,
    label: "Medium",
    message:
      "Your team may be hesitating to confront one another about performance and behavioral concerns.",
  },
  {
    minMetric: 3.75,
    maxMetric: 5,
    label: "High",
    message:
      "Your team does not hesitate to confront one another about performance and behavioral concerns.",
  },
] as const;

// ── Results domain tiers ──────────────────────────────────────────────────
const RESULTS_TIERS = [
  {
    minMetric: 1,
    maxMetric: 3.25,
    label: "Low",
    message:
      "Your team needs to place greater value on the collective achievement of outcomes, rather than individual or departmental recognition and ego.",
  },
  {
    minMetric: 3.25,
    maxMetric: 3.75,
    label: "Medium",
    message:
      "Members of your team may be placing too much importance on individual or departmental recognition and ego, rather than focusing on the collective goals of the team.",
  },
  {
    minMetric: 3.75,
    maxMetric: 5,
    label: "High",
    message:
      "Your team values collective outcomes more than individual recognition and attainment of status.",
  },
] as const;

// ─── Domains ──────────────────────────────────────────────────────────────

const DOMAINS = [
  { key: "trust", label: "Trust", tiers: TRUST_TIERS },
  { key: "conflict", label: "Conflict", tiers: CONFLICT_TIERS },
  { key: "commitment", label: "Commitment", tiers: COMMITMENT_TIERS },
  { key: "accountability", label: "Accountability", tiers: ACCOUNTABILITY_TIERS },
  { key: "results", label: "Results", tiers: RESULTS_TIERS },
] as const;

// ─── Global tier — single neutral covering full 1–5 range ─────────────────
//
// The instrument does not produce a single overall rollup score; it reports
// 5 separate per-fundamental averages. A neutral single global tier ensures
// the engine has a valid tier for any overall-avg calculation while making
// clear no fabricated global interpretation is rendered.
// No scaleUpScore (no 0-100 rollup). No rollup.overall (no meanOfDomains).

const GLOBAL_TIERS = [
  {
    minMetric: 1,
    maxMetric: 5,
    label: "Submitted",
    message:
      "Thank you for completing the Five Dysfunctions of a Team Assessment. Review the per-fundamental scores below with your coach.",
  },
] as const;

// ─── Scoring config ────────────────────────────────────────────────────────

const SCORING_CONFIG = {
  tierMetric: "overallAvg" as const,
  passThreshold: 0,
  tiers: GLOBAL_TIERS,
  // No rollup — instrument reports 5 separate fundamental scores only.
  // No scaleUpScore — no 0-100 rollup for this instrument.
  domains: DOMAINS,
} as const;

// ─── Section definitions ───────────────────────────────────────────────────
//
// 5 sections, one per fundamental. Each section's `domain` key drives the
// engine's per-domain rollup (scoring.ts computePerDomainTierContexts).

interface SectionPayload {
  stableKey: string;
  sortOrder: number;
  name: string;
  description: string;
  domain: string;
}

const SECTIONS: SectionPayload[] = [
  {
    stableKey: "S_TRUST",
    sortOrder: 1,
    name: "Trust",
    description:
      "Absence of Fear — Trust is the foundation of teamwork. These statements assess whether team members are vulnerable and open with one another about their weaknesses, mistakes, and needs for help.",
    domain: "trust",
  },
  {
    stableKey: "S_CONFLICT",
    sortOrder: 2,
    name: "Conflict",
    description:
      "Fear of Conflict — Teams that trust one another are not afraid to engage in passionate, unfiltered debate about key issues. These statements assess the team's ability to engage in constructive conflict.",
    domain: "conflict",
  },
  {
    stableKey: "S_COMMITMENT",
    sortOrder: 3,
    name: "Commitment",
    description:
      "Lack of Commitment — Teams that engage in unfiltered conflict are able to achieve genuine buy-in around important decisions. These statements assess the team's ability to commit to decisions and plans.",
    domain: "commitment",
  },
  {
    stableKey: "S_ACCOUNTABILITY",
    sortOrder: 4,
    name: "Accountability",
    description:
      "Avoidance of Accountability — Teams that commit to decisions hold one another accountable to achieving those decisions. These statements assess the team's willingness to confront one another on performance and behavior.",
    domain: "accountability",
  },
  {
    stableKey: "S_RESULTS",
    sortOrder: 5,
    name: "Results",
    description:
      "Inattention to Results — Teams that hold one another accountable are focused on collective results. These statements assess whether team members prioritize the group's goals over individual needs.",
    domain: "results",
  },
];

// ─── Question definitions ──────────────────────────────────────────────────
//
// 38 verbatim statements from the Wiley/Pfeiffer Team Assessment (© 2007).
// Statement→domain mapping from the scoring grid (right-hand page of PDF):
//   Trust:          1, 6, 10, 13, 17, 22, 32, 33
//   Conflict:       2,  4,  5,  7, 12, 18, 23, 27
//   Commitment:    11, 19, 24, 28, 30, 34, 38
//   Accountability: 8, 16, 20, 21, 26, 35, 36
//   Results:        3,  9, 14, 15, 25, 29, 31, 37
//
// stableKeys are fd_qN (fd = five-dysfunctions; N = original statement number)
// to make the mapping auditable. sortOrder within each section is the
// original statement number sequence (ascending).
//
// Statement 37 note: the PDF says "(A high score on this statement indicates
// that titles and status are NOT important to team members.)" — confirming
// the 1–5 scale is already positively worded for all 38 statements; higher
// always = healthier. No reverse-scoring applied.

interface QuestionDef {
  stableKey: string;
  sortOrder: number;
  label: string;
  sectionStableKey: string;
}

// ── Trust section: statements 1, 6, 10, 13, 17, 22, 32, 33 ───────────────
const TRUST_QUESTIONS: QuestionDef[] = [
  {
    stableKey: "fd_q1",
    sortOrder: 1,
    label: "Team members admit their mistakes.",
    sectionStableKey: "S_TRUST",
  },
  {
    stableKey: "fd_q6",
    sortOrder: 2,
    label: "Team members acknowledge their weaknesses to one another.",
    sectionStableKey: "S_TRUST",
  },
  {
    stableKey: "fd_q10",
    sortOrder: 3,
    label: "Team members ask for help without hesitation.",
    sectionStableKey: "S_TRUST",
  },
  {
    stableKey: "fd_q13",
    sortOrder: 4,
    label: "Team members ask one another for input regarding their areas of responsibility.",
    sectionStableKey: "S_TRUST",
  },
  {
    stableKey: "fd_q17",
    sortOrder: 5,
    label: "Team members acknowledge and tap into one another's skills and expertise.",
    sectionStableKey: "S_TRUST",
  },
  {
    stableKey: "fd_q22",
    sortOrder: 6,
    label: "Team members willingly apologize to one another.",
    sectionStableKey: "S_TRUST",
  },
  {
    stableKey: "fd_q32",
    sortOrder: 7,
    label: "Team members are unguarded and genuine with one another.",
    sectionStableKey: "S_TRUST",
  },
  {
    stableKey: "fd_q33",
    sortOrder: 8,
    label: "Team members can comfortably discuss their personal lives with one another.",
    sectionStableKey: "S_TRUST",
  },
];

// ── Conflict section: statements 2, 4, 5, 7, 12, 18, 23, 27 ─────────────
const CONFLICT_QUESTIONS: QuestionDef[] = [
  {
    stableKey: "fd_q2",
    sortOrder: 1,
    label: "Team members are passionate and unguarded in their discussion of issues.",
    sectionStableKey: "S_CONFLICT",
  },
  {
    stableKey: "fd_q4",
    sortOrder: 2,
    label: "Team meetings are interesting and compelling (not boring).",
    sectionStableKey: "S_CONFLICT",
  },
  {
    stableKey: "fd_q5",
    sortOrder: 3,
    label: "During team meetings, the most important—and difficult—issues are discussed.",
    sectionStableKey: "S_CONFLICT",
  },
  {
    stableKey: "fd_q7",
    sortOrder: 4,
    label: "Team members voice their opinions even at the risk of causing disagreement.",
    sectionStableKey: "S_CONFLICT",
  },
  {
    stableKey: "fd_q12",
    sortOrder: 5,
    label: "During discussions, team members challenge one another about how they arrived at their conclusions and opinions.",
    sectionStableKey: "S_CONFLICT",
  },
  {
    stableKey: "fd_q18",
    sortOrder: 6,
    label: "Team members solicit one another's opinions during meetings.",
    sectionStableKey: "S_CONFLICT",
  },
  {
    stableKey: "fd_q23",
    sortOrder: 7,
    label: "Team members communicate unpopular opinions to the group.",
    sectionStableKey: "S_CONFLICT",
  },
  {
    stableKey: "fd_q27",
    sortOrder: 8,
    label: "When conflict occurs, the team confronts and deals with the issue before moving to another subject.",
    sectionStableKey: "S_CONFLICT",
  },
];

// ── Commitment section: statements 11, 19, 24, 28, 30, 34, 38 ────────────
const COMMITMENT_QUESTIONS: QuestionDef[] = [
  {
    stableKey: "fd_q11",
    sortOrder: 1,
    label: "Team members leave meetings confident that everyone is committed to the decisions that were agreed upon.",
    sectionStableKey: "S_COMMITMENT",
  },
  {
    stableKey: "fd_q19",
    sortOrder: 2,
    label: "Team members end discussions with clear and specific resolutions and calls to action.",
    sectionStableKey: "S_COMMITMENT",
  },
  {
    stableKey: "fd_q24",
    sortOrder: 3,
    label: "The team is clear about its direction and priorities.",
    sectionStableKey: "S_COMMITMENT",
  },
  {
    stableKey: "fd_q28",
    sortOrder: 4,
    label: "The team is aligned around common objectives.",
    sectionStableKey: "S_COMMITMENT",
  },
  {
    stableKey: "fd_q30",
    sortOrder: 5,
    label: "The team is decisive, even when perfect information is not available.",
    sectionStableKey: "S_COMMITMENT",
  },
  {
    stableKey: "fd_q34",
    sortOrder: 6,
    label: "The team sticks to decisions.",
    sectionStableKey: "S_COMMITMENT",
  },
  {
    stableKey: "fd_q38",
    sortOrder: 7,
    label: "Team members support group decisions even if they initially disagreed.",
    sectionStableKey: "S_COMMITMENT",
  },
];

// ── Accountability section: statements 8, 16, 20, 21, 26, 35, 36 ─────────
const ACCOUNTABILITY_QUESTIONS: QuestionDef[] = [
  {
    stableKey: "fd_q8",
    sortOrder: 1,
    label: "Team members point out one another's unproductive behaviors.",
    sectionStableKey: "S_ACCOUNTABILITY",
  },
  {
    stableKey: "fd_q16",
    sortOrder: 2,
    label: "Team members are quick to confront peers about problems in their respective areas of responsibility.",
    sectionStableKey: "S_ACCOUNTABILITY",
  },
  {
    stableKey: "fd_q20",
    sortOrder: 3,
    label: "Team members question one another about their current approaches and methods.",
    sectionStableKey: "S_ACCOUNTABILITY",
  },
  {
    stableKey: "fd_q21",
    sortOrder: 4,
    label: "The team ensures that poor performers feel pressure and the expectation to improve.",
    sectionStableKey: "S_ACCOUNTABILITY",
  },
  {
    stableKey: "fd_q26",
    sortOrder: 5,
    label: "All members of the team are held to the same high standards.",
    sectionStableKey: "S_ACCOUNTABILITY",
  },
  {
    stableKey: "fd_q35",
    sortOrder: 6,
    label: "Team members consistently follow through on promises and commitments.",
    sectionStableKey: "S_ACCOUNTABILITY",
  },
  {
    stableKey: "fd_q36",
    sortOrder: 7,
    label: "Team members offer unprovoked, constructive feedback to one another.",
    sectionStableKey: "S_ACCOUNTABILITY",
  },
];

// ── Results section: statements 3, 9, 14, 15, 25, 29, 31, 37 ─────────────
const RESULTS_QUESTIONS: QuestionDef[] = [
  {
    stableKey: "fd_q3",
    sortOrder: 1,
    label: "Team members are quick to point out the contributions and achievements of others.",
    sectionStableKey: "S_RESULTS",
  },
  {
    stableKey: "fd_q9",
    sortOrder: 2,
    label: "The team has a reputation for high performance.",
    sectionStableKey: "S_RESULTS",
  },
  {
    stableKey: "fd_q14",
    sortOrder: 3,
    label: "When the team fails to achieve collective goals, each member takes personal responsibility to improve the team's performance.",
    sectionStableKey: "S_RESULTS",
  },
  {
    stableKey: "fd_q15",
    sortOrder: 4,
    label: "Team members willingly make sacrifices in their areas for the good of the team.",
    sectionStableKey: "S_RESULTS",
  },
  {
    stableKey: "fd_q25",
    sortOrder: 5,
    label: "Team members are slow to seek credit for their own contributions.",
    sectionStableKey: "S_RESULTS",
  },
  {
    stableKey: "fd_q29",
    sortOrder: 6,
    label: "The team consistently achieves its objectives.",
    sectionStableKey: "S_RESULTS",
  },
  {
    stableKey: "fd_q31",
    sortOrder: 7,
    label: "Team members value collective success more than individual achievement.",
    sectionStableKey: "S_RESULTS",
  },
  {
    stableKey: "fd_q37",
    sortOrder: 8,
    label: "Team members place little importance on titles and status. (A high score on this statement indicates that titles and status are NOT important to team members.)",
    sectionStableKey: "S_RESULTS",
  },
];

// ─── Combined question list ────────────────────────────────────────────────

const ALL_QUESTION_DEFS: QuestionDef[] = [
  ...TRUST_QUESTIONS,
  ...CONFLICT_QUESTIONS,
  ...COMMITMENT_QUESTIONS,
  ...ACCOUNTABILITY_QUESTIONS,
  ...RESULTS_QUESTIONS,
];

// ─── Question payload builder ──────────────────────────────────────────────

interface QuestionPayload {
  stableKey: string;
  sortOrder: number;
  type: "SLIDER_LIKERT";
  label: string;
  sectionStableKey: string;
  isRequired: true;
  scale: {
    min: 1;
    max: 5;
    step: 1;
    anchorMin: string;
    anchorMax: string;
  };
}

function buildQuestions(): QuestionPayload[] {
  return ALL_QUESTION_DEFS.map((q) => ({
    stableKey: q.stableKey,
    sortOrder: q.sortOrder,
    type: "SLIDER_LIKERT" as const,
    label: q.label,
    sectionStableKey: q.sectionStableKey,
    isRequired: true as const,
    scale: {
      min: 1 as const,
      max: 5 as const,
      step: 1 as const,
      anchorMin: ANCHOR_MIN,
      anchorMax: ANCHOR_MAX,
    },
  }));
}

// ─── Public content builder (exported for tests + helper pattern) ──────────

/**
 * Build the full SeedContent for the Five Dysfunctions Team Assessment.
 * No DB calls — pure data construction. Safe to call in tests.
 */
export function buildFiveDysfunctionsContent(): SeedContent {
  return {
    alias: ALIAS,
    name: NAME,
    description: TEMPLATE_DESCRIPTION,
    invitationSubject: INVITATION_SUBJECT,
    invitationBodyMarkdown: INVITATION_BODY_MARKDOWN,
    language: LANGUAGE,
    sections: SECTIONS,
    questions: buildQuestions(),
    scoringConfig: SCORING_CONFIG,
    reportConfig: null,
    aggregationMode: "FULL_VISIBILITY",
  };
}

// ─── DB seed (never run against prod without --i-know-this-is-prod) ────────

const db = new PrismaClient();

const SYSTEM_SEED_EMAIL = "system-seed@scalingup.platform";

/**
 * Resolve (or create) the system seed user that owns seeded template versions.
 * Mirrors seed-scaling-up-quick-assessment.ts so seeded provenance is consistent.
 */
async function resolveSystemUser(
  tx: Parameters<Parameters<PrismaClient["$transaction"]>[0]>[0],
): Promise<{ id: string }> {
  return tx.user.upsert({
    where: { email: SYSTEM_SEED_EMAIL },
    create: { email: SYSTEM_SEED_EMAIL, role: "STAFF", name: "System Seed" },
    update: {},
    select: { id: true },
  });
}

export async function runSeed(client: PrismaClient): Promise<SeedResult> {
  const content = buildFiveDysfunctionsContent();
  return client.$transaction(async (tx) => {
    const sys = await resolveSystemUser(tx);
    return ensureTemplateVersionContent(
      tx as unknown as Parameters<typeof ensureTemplateVersionContent>[0],
      sys.id,
      content,
    );
  });
}

async function main(): Promise<void> {
  const isProd =
    process.env.DATABASE_URL?.includes("neon.tech") ||
    process.env.DATABASE_URL?.includes("neon.database");
  if (isProd && !process.argv.includes("--i-know-this-is-prod")) {
    console.error(
      "ERROR: Refusing to seed against a Neon (prod) host without --i-know-this-is-prod."
    );
    process.exit(1);
  }

  try {
    const result = await runSeed(db);
    console.log(
      `[seed-five-dysfunctions] ${result.action} — templateId=${result.templateId} versionId=${result.versionId} v${result.versionNumber} hash=${result.contentHash}`
    );
  } finally {
    await db.$disconnect();
  }
}

// Only run when invoked directly (not when imported by tests or other modules)
if (require.main === module) {
  main().catch((err) => {
    console.error("[seed-five-dysfunctions] fatal:", err);
    process.exit(1);
  });
}
