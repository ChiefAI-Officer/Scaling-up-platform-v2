/**
 * Seed — Scaling Up 4 Decisions Quick Quiz (SunHub)
 *
 * Source: From Jeff/APP_scaling up assessemnt/SunHub_ScalingUpQuiz/SU-Quiz.xlsx
 * Eight public lead-magnet questions on a 0–10 scale with a 0–100 result.
 *
 * This file creates a DRAFT version only. Never run it against Production
 * without separate authorization and the explicit production acknowledgement.
 */

import { PrismaClient } from "@prisma/client";
import {
  ensureTemplateVersionContent,
  type SeedContent,
  type SeedResult,
} from "../src/lib/assessments/seed-template-version";

export const SUNHUB_QUICK_QUIZ_ALIAS = "sunhub-quick-quiz";
export const SUNHUB_QUICK_QUIZ_NAME =
  "Scaling Up 4 Decisions Quick Quiz (SunHub)";

const DESCRIPTION =
  "Will you scale or fail? Find out in two minutes by answering eight questions about People, Strategy, Execution, and Cash.";
const LANGUAGE = "enUS";
const ANCHOR_MIN = "Not true";
const ANCHOR_MAX = "Completely true";

const INVITATION_SUBJECT = "Your Scaling Up Quick Quiz is ready";
const INVITATION_BODY_MARKDOWN = `Hi {{firstName}},

Your Scaling Up 4 Decisions Quick Quiz is ready.

[Take the quiz]({{assessmentUrl}})

Best,
Scaling Up`;

interface SourceQuestion {
  stableKey: string;
  label: string;
  sectionName: string;
}

const SOURCE_QUESTIONS: readonly SourceQuestion[] = [
  {
    stableKey: "sunhub_strategy_sales_easy",
    label: "Sales come easy",
    sectionName: "About your strategy",
  },
  {
    stableKey: "sunhub_people_rehire_team",
    label: "I would enthusiastically rehire everyone on my team",
    sectionName: "About your people",
  },
  {
    stableKey: "sunhub_cash_invest_or_loan",
    label: "People are begging to invest or loan us money",
    sectionName: "About your cash",
  },
  {
    stableKey: "sunhub_execution_efficient_processes",
    label: "We have efficient processes",
    sectionName: "About your execution",
  },
  {
    stableKey: "sunhub_people_relaxed_focused",
    label: "I’m relaxed and focused",
    sectionName: "About your people",
  },
  {
    stableKey: "sunhub_strategy_dominate_niche",
    label: "We dominate our niche",
    sectionName: "About your strategy",
  },
  {
    stableKey: "sunhub_cash_generating_cash",
    label: "We’re generating lots of cash",
    sectionName: "About your cash",
  },
  {
    stableKey: "sunhub_execution_raving_fans",
    label: "All of our clients are raving fans",
    sectionName: "About your execution",
  },
] as const;

// The tier resolver treats both bounds as inclusive. These touching seams are
// deliberately just below the next reachable average. With eight integer
// answers, no submission can land on a seam; displayed scores transition
// exactly at 24/25, 49/50, and 74/75.
const TIER_SEAM_25 = 2.499999;
const TIER_SEAM_50 = 4.999999;
const TIER_SEAM_75 = 7.499999;

const SCORING_CONFIG = {
  tierMetric: "overallAvg" as const,
  passThreshold: 0,
  tiers: [
    {
      minMetric: 0,
      maxMetric: TIER_SEAM_25,
      label: "0–24%",
      message:
        "Ouch! It’s been tough to scale easily. We can help. If action followed knowledge, we’d all have six packs. —Niel Malan",
    },
    {
      minMetric: TIER_SEAM_25,
      maxMetric: TIER_SEAM_50,
      label: "25–49%",
      message:
        "Good start. Though wondering if there is an easier way to scale. Believe you can and you’re halfway there. —Theodore Roosevelt",
    },
    {
      minMetric: TIER_SEAM_50,
      maxMetric: TIER_SEAM_75,
      label: "50–74%",
      message:
        "You’re close. With a little more finesse you can nail the scale. Professionals do it all; amateurs only do the fun parts.",
    },
    {
      minMetric: TIER_SEAM_75,
      maxMetric: 10,
      label: "75–100%",
      message:
        "You rock (or fib!). You’re ready. Keep moving; grab profit share! If everything seems in control, you’re just not going fast enough. —Mario Andretti",
    },
  ],
  rollup: { overall: "meanOfQuestions" as const },
  scaleUpScore: true,
} as const;

export function buildSunHubQuickQuizContent(): SeedContent {
  const sections = SOURCE_QUESTIONS.map((question, index) => ({
    stableKey: `sunhub_page_${index + 1}`,
    sortOrder: index + 1,
    name: question.sectionName,
    description: "",
  }));

  const questions = SOURCE_QUESTIONS.map((question, index) => ({
    stableKey: question.stableKey,
    sortOrder: index + 1,
    type: "SLIDER_LIKERT" as const,
    label: question.label,
    sectionStableKey: sections[index].stableKey,
    isRequired: true as const,
    scale: {
      min: 0 as const,
      max: 10 as const,
      step: 1 as const,
      anchorMin: ANCHOR_MIN,
      anchorMax: ANCHOR_MAX,
    },
  }));

  return {
    alias: SUNHUB_QUICK_QUIZ_ALIAS,
    name: SUNHUB_QUICK_QUIZ_NAME,
    description: DESCRIPTION,
    invitationSubject: INVITATION_SUBJECT,
    invitationBodyMarkdown: INVITATION_BODY_MARKDOWN,
    language: LANGUAGE,
    sections,
    questions,
    scoringConfig: SCORING_CONFIG,
    reportConfig: null,
    aggregationMode: "FULL_VISIBILITY",
  };
}

const db = new PrismaClient();
const SYSTEM_SEED_EMAIL = "system-seed@scalingup.platform";

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
  const content = buildSunHubQuickQuizContent();
  return client.$transaction(async (tx) => {
    const systemUser = await resolveSystemUser(tx);
    return ensureTemplateVersionContent(
      tx as unknown as Parameters<typeof ensureTemplateVersionContent>[0],
      systemUser.id,
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
      "ERROR: Refusing to seed against a Neon (prod) host without --i-know-this-is-prod.",
    );
    process.exit(1);
  }

  try {
    const result = await runSeed(db);
    console.log(
      `[seed-sunhub-quick-quiz] ${result.action} — templateId=${result.templateId} versionId=${result.versionId} v${result.versionNumber} hash=${result.contentHash}`,
    );
  } finally {
    await db.$disconnect();
  }
}

if (require.main === module) {
  main().catch((error) => {
    console.error("[seed-sunhub-quick-quiz] fatal:", error);
    process.exit(1);
  });
}
