/**
 * Seed — Scaling Up 4 Decisions Assessment ("scaling-up-quick")
 *
 * 32 SLIDER_LIKERT questions, 8 per Decision (People / Strategy / Execution / Cash),
 * 0-10 agreement scale. Content sourced from the Scaling Up 4 Decisions framework.
 *
 * Usage (never run against prod without --i-know-this-is-prod):
 *   npx tsx prisma/seed-scaling-up-quick-assessment.ts
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

export const ALIAS = "scaling-up-quick";
export const NAME = "Scaling Up 4 Decisions Assessment";
export const LANGUAGE = "enUS";
const TEMPLATE_DESCRIPTION =
  "A 32-question self-assessment covering the four key decisions every growing company must get right: People, Strategy, Execution, and Cash. Scored on a 0–10 agreement scale.";

const INVITATION_SUBJECT =
  "Your Scaling Up 4 Decisions Assessment is ready";
const INVITATION_BODY_MARKDOWN = `Hi {{firstName}},

Your coach has invited you to complete the **Scaling Up 4 Decisions Assessment**.

This quick assessment covers the four critical decisions for scaling your company:
People, Strategy, Execution, and Cash.

[Take the Assessment]({{assessmentUrl}})

The assessment takes approximately 10–15 minutes to complete.

Best,
Scaling Up`;

// ─── Anchor labels ────────────────────────────────────────────────────────

const ANCHOR_MIN = "Strongly disagree";
const ANCHOR_MAX = "Strongly agree";

// ─── Global tiers — fractional touching semantics ─────────────────────────
//
// Fractional touching: b.minMetric === a.maxMetric (non-integer domain).
// Three bands tiling [0, 10] — aligned with the Scaling Up Full conventions
// but with thresholds tuned to the 4-Decisions 32-question scope.
//
// Cutoffs are provisional — admins may refine via the editor UI once
// benchmark data is available.
const TIERS = [
  {
    minMetric: 0,
    maxMetric: 3.3,
    label: "Foundational",
    message:
      "Your organization has significant opportunities for improvement across the Four Decisions. Focused attention on the fundamentals will drive meaningful growth.",
  },
  {
    minMetric: 3.3,
    maxMetric: 6.6,
    label: "Developing",
    message:
      "You have built a solid foundation and are actively working the Four Decisions. Continued focus and disciplined execution will accelerate your growth.",
  },
  {
    minMetric: 6.6,
    maxMetric: 10,
    label: "Mastering",
    message:
      "Your organization demonstrates strong alignment across the Four Decisions. You are well-positioned to sustain and accelerate your growth trajectory.",
  },
] as const;

// ─── Per-domain tier — single neutral tier covering 0-10 ─────────────────
//
// Per-decision cutoffs are not yet confirmed against benchmark data.
// A single neutral tier ensures no fabricated thresholds appear in the
// admin editor. Admins may refine after benchmark data is available.
const NEUTRAL_DOMAIN_TIER = [
  { minMetric: 0, maxMetric: 10, label: "—", message: "" },
] as const;

// ─── Domains ─────────────────────────────────────────────────────────────

const DOMAINS = [
  { key: "people", label: "People", tiers: NEUTRAL_DOMAIN_TIER },
  { key: "strategy", label: "Strategy", tiers: NEUTRAL_DOMAIN_TIER },
  { key: "execution", label: "Execution", tiers: NEUTRAL_DOMAIN_TIER },
  { key: "cash", label: "Cash", tiers: NEUTRAL_DOMAIN_TIER },
] as const;

// ─── Scoring config ───────────────────────────────────────────────────────

const SCORING_CONFIG = {
  tierMetric: "overallAvg" as const,
  passThreshold: 0,
  tiers: TIERS,
  rollup: { overall: "meanOfDomains" as const },
  scaleUpScore: true,
  domains: DOMAINS,
} as const;

// ─── Sections ─────────────────────────────────────────────────────────────

interface SectionPayload {
  stableKey: string;
  sortOrder: number;
  name: string;
  description: string;
  domain: string;
}

const SECTIONS: SectionPayload[] = [
  {
    stableKey: "S_PEOPLE",
    sortOrder: 1,
    name: "People",
    description:
      "Assessment of talent quality, culture, recruitment, and people development practices across your organization.",
    domain: "people",
  },
  {
    stableKey: "S_STRATEGY",
    sortOrder: 2,
    name: "Strategy",
    description:
      "Evaluation of your business model, strategic differentiation, BHAG, brand promises, and competitive positioning.",
    domain: "strategy",
  },
  {
    stableKey: "S_EXECUTION",
    sortOrder: 3,
    name: "Execution",
    description:
      "Assessment of how effectively your organization translates strategy into results through priorities, metrics, and rhythm.",
    domain: "execution",
  },
  {
    stableKey: "S_CASH",
    sortOrder: 4,
    name: "Cash",
    description:
      "Evaluation of cash flow management, financial visibility, and your organization's ability to fund growth.",
    domain: "cash",
  },
];

// ─── Question definitions ─────────────────────────────────────────────────

interface QuestionDef {
  stableKey: string;
  sortOrder: number;
  label: string;
  sectionStableKey: string;
}

// PEOPLE (Q1–Q8)
const PEOPLE_QUESTIONS: QuestionDef[] = [
  {
    stableKey: "qa_people_1",
    sortOrder: 1,
    label: "Everyone on the leadership team is an A player.",
    sectionStableKey: "S_PEOPLE",
  },
  {
    stableKey: "qa_people_2",
    sortOrder: 2,
    label:
      "All team members feel comfortable debating and discussing the brutal facts.",
    sectionStableKey: "S_PEOPLE",
  },
  {
    stableKey: "qa_people_3",
    sortOrder: 3,
    label:
      "We would enthusiastically re-hire every employee a second time.",
    sectionStableKey: "S_PEOPLE",
  },
  {
    stableKey: "qa_people_4",
    sortOrder: 4,
    label:
      "We are able to attract enough of the right talent to support our growth objectives.",
    sectionStableKey: "S_PEOPLE",
  },
  {
    stableKey: "qa_people_5",
    sortOrder: 5,
    label:
      "We employ a formal/structured interview process to select the right talent.",
    sectionStableKey: "S_PEOPLE",
  },
  {
    stableKey: "qa_people_6",
    sortOrder: 6,
    label: "We have an active process to educate and coach our people.",
    sectionStableKey: "S_PEOPLE",
  },
  {
    stableKey: "qa_people_7",
    sortOrder: 7,
    label:
      "We measure Productivity Per Employee (PPE) and have a plan to double it over the next 3-5 years.",
    sectionStableKey: "S_PEOPLE",
  },
  {
    stableKey: "qa_people_8",
    sortOrder: 8,
    label:
      "The Purpose (\"Why we exist?\") and Core Values are known, alive, and driving decisions by everyone in the organization.",
    sectionStableKey: "S_PEOPLE",
  },
];

// STRATEGY (Q9–Q16)
const STRATEGY_QUESTIONS: QuestionDef[] = [
  {
    stableKey: "qa_strategy_1",
    sortOrder: 9,
    label:
      "Our top-line revenue and gross margin are growing as rapidly as we would like.",
    sectionStableKey: "S_STRATEGY",
  },
  {
    stableKey: "qa_strategy_2",
    sortOrder: 10,
    label: "We have figured out the secret to making a lot of money.",
    sectionStableKey: "S_STRATEGY",
  },
  {
    stableKey: "qa_strategy_3",
    sortOrder: 11,
    label:
      "We have set the right 10-25 year \"Big Hairy Audacious Goal\" (BHAG) that aligns with our business model.",
    sectionStableKey: "S_STRATEGY",
  },
  {
    stableKey: "qa_strategy_4",
    sortOrder: 12,
    label:
      "We have 3 clear and measurable Brand Promises - reasons why people should buy from us.",
    sectionStableKey: "S_STRATEGY",
  },
  {
    stableKey: "qa_strategy_5",
    sortOrder: 13,
    label:
      "Everyone knows our elevator pitch - a compelling response to the question \"What does the company do?\"",
    sectionStableKey: "S_STRATEGY",
  },
  {
    stableKey: "qa_strategy_6",
    sortOrder: 14,
    label:
      "\"How\" we operate in our industry is radically different than our competition.",
    sectionStableKey: "S_STRATEGY",
  },
  {
    stableKey: "qa_strategy_7",
    sortOrder: 15,
    label:
      "We focus more of our time on the price side vs. cost side of the organization.",
    sectionStableKey: "S_STRATEGY",
  },
  {
    stableKey: "qa_strategy_8",
    sortOrder: 16,
    label:
      "The CEO and a few select others spend time every week on strategy and actively monitor trends that could impact our industry.",
    sectionStableKey: "S_STRATEGY",
  },
];

// EXECUTION (Q17–Q24)
// Verified verbatim against the source (From Jeff/.../Website-scalingup-assessment.xlsx) on 2026-06-11.
const EXECUTION_QUESTIONS: QuestionDef[] = [
  {
    stableKey: "qa_execution_1",
    sortOrder: 17,
    label:
      "Our net profit is three to five times industry average, indicating effective execution of our strategy.",
    sectionStableKey: "S_EXECUTION",
  },
  {
    stableKey: "qa_execution_2",
    sortOrder: 18,
    label:
      "We are making progress toward the company's goals, and rarely spend time responding to crises.",
    sectionStableKey: "S_EXECUTION",
  },
  {
    stableKey: "qa_execution_3",
    sortOrder: 19,
    label:
      "We have clearly-defined metrics assigned to each priority in our plan, which are regularly updated and visually displayed.",
    sectionStableKey: "S_EXECUTION",
  },
  {
    stableKey: "qa_execution_4",
    sortOrder: 20,
    label:
      "I'm confident that each employee can clearly articulate our top quarterly priorities and their role in attaining them.",
    sectionStableKey: "S_EXECUTION",
  },
  {
    stableKey: "qa_execution_5",
    sortOrder: 21,
    label:
      "We consistently receive feedback from our customers on how we are doing and what they have heard about our competitors.",
    sectionStableKey: "S_EXECUTION",
  },
  {
    stableKey: "qa_execution_6",
    sortOrder: 22,
    label:
      "We have strong alignment between our strategic plan and our systems/priorities.",
    sectionStableKey: "S_EXECUTION",
  },
  {
    stableKey: "qa_execution_7",
    sortOrder: 23,
    label:
      "We have regular, established meetings to align activities with company priorities and to identify and resolve issues.",
    sectionStableKey: "S_EXECUTION",
  },
  {
    stableKey: "qa_execution_8",
    sortOrder: 24,
    label:
      "We have an effective process for employees to offer suggestions and feedback, in order to enhance our culture and strengthen our team.",
    sectionStableKey: "S_EXECUTION",
  },
];

// CASH (Q25–Q32)
const CASH_QUESTIONS: QuestionDef[] = [
  {
    stableKey: "qa_cash_1",
    sortOrder: 25,
    label: "We use cash from customers to fuel our growth.",
    sectionStableKey: "S_CASH",
  },
  {
    stableKey: "qa_cash_2",
    sortOrder: 26,
    label:
      "We have large cash reserves or access to amounts of cash to pursue opportunities and survive downturns/mistakes.",
    sectionStableKey: "S_CASH",
  },
  {
    stableKey: "qa_cash_3",
    sortOrder: 27,
    label: "Our financial statements are accurate and timely.",
    sectionStableKey: "S_CASH",
  },
  {
    stableKey: "qa_cash_4",
    sortOrder: 28,
    label:
      "We consistently review 12 month cash flow projections with our team.",
    sectionStableKey: "S_CASH",
  },
  {
    stableKey: "qa_cash_5",
    sortOrder: 29,
    label:
      "We have an accurate understanding of how much it costs to acquire a new customer.",
    sectionStableKey: "S_CASH",
  },
  {
    stableKey: "qa_cash_6",
    sortOrder: 30,
    label:
      "We have an accurate understanding of the average lifetime value of each customer.",
    sectionStableKey: "S_CASH",
  },
  {
    stableKey: "qa_cash_7",
    sortOrder: 31,
    label:
      "We regularly pursue ideas for reducing our cash conversion cycle (time from placing $1/€1/£1 of working capital into operations until it returns as cash).",
    sectionStableKey: "S_CASH",
  },
  {
    stableKey: "qa_cash_8",
    sortOrder: 32,
    label:
      "We have effective accounts payable and accounts receivable policies.",
    sectionStableKey: "S_CASH",
  },
];

const ALL_QUESTION_DEFS: QuestionDef[] = [
  ...PEOPLE_QUESTIONS,
  ...STRATEGY_QUESTIONS,
  ...EXECUTION_QUESTIONS,
  ...CASH_QUESTIONS,
];

// ─── Question payload builder ─────────────────────────────────────────────

interface QuestionPayload {
  stableKey: string;
  sortOrder: number;
  type: "SLIDER_LIKERT";
  label: string;
  sectionStableKey: string;
  isRequired: true;
  scale: {
    min: 0;
    max: 10;
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
      min: 0 as const,
      max: 10 as const,
      step: 1 as const,
      anchorMin: ANCHOR_MIN,
      anchorMax: ANCHOR_MAX,
    },
  }));
}

// ─── Public content builder (exported for tests + helper pattern) ─────────

/**
 * Build the full SeedContent for the Scaling Up 4 Decisions Assessment.
 * No DB calls — pure data construction. Safe to call in tests.
 */
export function buildQuickAssessmentContent(): SeedContent {
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

// ─── DB seed (never run against prod without --i-know-this-is-prod) ───────

const db = new PrismaClient();

const SYSTEM_SEED_EMAIL = "system-seed@scalingup.platform";

/**
 * Resolve (or create) the system seed user that owns seeded template versions.
 * Mirrors seed-scaling-up-full-assessment.ts so seeded provenance is consistent.
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
  const content = buildQuickAssessmentContent();
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
      `[seed-scaling-up-quick] ${result.action} — templateId=${result.templateId} versionId=${result.versionId} v${result.versionNumber} hash=${result.contentHash}`
    );
  } finally {
    await db.$disconnect();
  }
}

// Only run when invoked directly (not when imported by tests or other modules)
if (require.main === module) {
  main().catch((err) => {
    console.error("[seed-scaling-up-quick] fatal:", err);
    process.exit(1);
  });
}
