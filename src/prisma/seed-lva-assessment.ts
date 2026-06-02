/**
 * Seed: Leadership Vision Alignment (LVA) Assessment Template
 *
 * Creates an AssessmentTemplate (alias "leadership-vision-alignment") plus a
 * new DRAFT AssessmentTemplateVersion (language "enUS") with 8 sections and
 * 51 questions (9 NUMBER, 8+2 TEXT required, 16+16 TEXT optional, 16
 * SLIDER_LIKERT, 1 MULTI_CHOICE) via the shared `ensureTemplateVersionContent`
 * helper (version-aware append model).
 *
 * Content sourced verbatim from:
 *   "From Jeff/APP_scaling up assessemnt/APP_leadership vision alignment assessment/
 *    leadership visin alignment assement.xlsx"
 * Adversarially verified against individual + group Esperto reports.
 *
 * ─── Structure ────────────────────────────────────────────────────────────
 * S0 Welcome              — no questions (intro only)
 * S1 Company in 3 Years   — 9 NUMBER (THREE-YEAR ASPIRATIONAL figures)
 * S2 Vision on Future     — 8 TEXT required (xlsx trailing *)
 * S3 Org Strengths        — 16 SLIDER_LIKERT, scale 1-3 (Weak/Strong)
 * S4 Biggest Obstacles    — 1 MULTI_CHOICE, maxChoices 3
 * S5 Obstacles Explained  — 16 TEXT optional (one per factor) + 2 TEXT required
 * S6 Focus Areas          — 1 NUMBER optional + 14 TEXT required
 * S7 Completion           — no questions (final page only)
 *
 * ─── Scoring ─────────────────────────────────────────────────────────────
 * Only the 16 SLIDER_LIKERT questions in S3 are scored (1-3 scale). No
 * tier/band system exists in the source material — the seed uses a single
 * NEUTRAL "Submitted" tier covering the full 1-3 range (passThreshold: 0).
 * The fabricated Developing/Building/Scaling tiers from the previous seed
 * have been removed.
 *
 * ─── Idempotency model (delegated to helper) ──────────────────────────────
 *   - Latest version hash matches seed hash → no-op.
 *   - Latest version is a DRAFT with different hash → throws unless
 *     `forceSupersedeDraft: true` is set (protects reviewer edits).
 *   - Latest version is published with different hash → appends new DRAFT vN+1.
 *   - No versions yet → creates template + v1 DRAFT.
 *
 * Concurrency: first statement inside the transaction acquires
 * `pg_try_advisory_xact_lock(hashtext('assessment-lva-v1-seed'))`.
 * If the lock is not acquired (another session holds it), the seed logs and
 * exits with code 1.
 *
 * Run: npx tsx prisma/seed-lva-assessment.ts
 */

import { PrismaClient } from "@prisma/client";
import {
  ensureTemplateVersionContent,
  type SeedContent,
} from "../src/lib/assessments/seed-template-version";

const db = new PrismaClient();

const TEMPLATE_ALIAS = "leadership-vision-alignment";
const ADVISORY_LOCK_KEY = "assessment-lva-v1-seed";

// ─── Verbatim content (Leadership Vision Alignment) ──────────────────────

const TEMPLATE_NAME = "Leadership Vision Alignment";
const TEMPLATE_DESCRIPTION =
  "A comprehensive assessment covering financials, strategy, culture, leadership, and execution to assess organizational readiness and alignment.";

const INVITATION_SUBJECT =
  "You're invited: Leadership Vision Alignment Assessment";

const INVITATION_BODY_MARKDOWN = `Hi {{respondentFirstName}},

{{organizationName}} has invited you to complete the Leadership Vision Alignment assessment. Your responses will help your coach understand the current state of your organization across financials, strategy, culture, and execution.

Click the link below to begin:

{{invitationUrl}}

Your responses are confidential and shared only with your coach.`;

// ─── Scoring config ───────────────────────────────────────────────────────
//
// No tier/band system exists in any source file (xlsx, individual reports,
// or group report). A single NEUTRAL "Submitted" tier covers the full 1-3
// slider range. passThreshold: 0 means every submission "passes" (i.e. no
// gating on score). This replaces the fabricated Developing/Building/Scaling
// placeholder tiers from the previous seed.

const SCORING_CONFIG = {
  tierMetric: "overallAvg" as const,
  passThreshold: 0,
  tiers: [
    {
      minMetric: 1,
      maxMetric: 3,
      label: "Submitted",
      message:
        "Thank you — your responses have been recorded for your leadership team's vision-alignment review.",
    },
  ],
} as const;

// ─── The 16 organisational factors (verbatim from xlsx sharedStrings) ─────
//
// Used in both the SLIDER_LIKERT matrix (S3) and the MULTI_CHOICE obstacle
// question (S4). Declared once to prevent drift.
//
// Note: the MULTI_CHOICE checkbox list uses "The Leadership" (capital L, xlsx
// index 49) while the matrix row uses "The leadership" (lowercase l, xlsx
// index 34). Both are intentional — they reference the same factor but the
// xlsx stores distinct strings in the two locations. We mirror the source.

const FACTORS_FOR_MATRIX = [
  "Recruitment of new employees",
  "Retaining staff",
  "Leadership Team",
  "The leadership",
  "Culture",
  "Internal communications",
  "Strategy",
  "Execution and operational processes",
  "Marketing",
  "Sales",
  "Technology",
  "Scalability",
  "Innovation",
  "Financial processes",
  "Cash",
  "Growth Financing",
] as const;

const FACTORS_FOR_CHECKBOX = [
  "Recruitment of new employees",
  "Retaining staff",
  "Leadership Team",
  "The Leadership",
  "Culture",
  "Internal communications",
  "Strategy",
  "Execution and operational processes",
  "Marketing",
  "Sales",
  "Technology",
  "Scalability",
  "Innovation",
  "Financial processes",
  "Cash",
  "Growth Financing",
] as const;

// Stable-key slugs for the 16 factors (used in S5 "why" optional questions).
const FACTOR_STABLE_KEYS = [
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

// ─── Question type shapes ─────────────────────────────────────────────────

interface SliderQuestion {
  stableKey: string;
  sortOrder: number;
  type: "SLIDER_LIKERT";
  label: string;
  sectionStableKey: string;
  isRequired: true;
  scale: {
    min: number;
    max: number;
    step: number;
    anchorMin: string;
    anchorMax: string;
  };
}

interface TextQuestion {
  stableKey: string;
  sortOrder: number;
  type: "TEXT";
  label: string;
  sectionStableKey: string;
  isRequired: boolean;
}

interface NumberQuestion {
  stableKey: string;
  sortOrder: number;
  type: "NUMBER";
  label: string;
  helpText?: string;
  sectionStableKey: string;
  isRequired: boolean;
}

interface MultiChoiceOption {
  key: string;
  label: string;
}

interface MultiChoiceQuestion {
  stableKey: string;
  sortOrder: number;
  type: "MULTI_CHOICE";
  label: string;
  sectionStableKey: string;
  isRequired: false;
  maxChoices: number;
  options: MultiChoiceOption[];
}

type QuestionPayload =
  | SliderQuestion
  | TextQuestion
  | NumberQuestion
  | MultiChoiceQuestion;

interface SectionPayload {
  stableKey: string;
  sortOrder: number;
  name: string;
}

// ─── Content builder ──────────────────────────────────────────────────────

export interface LvaContent
  extends Omit<SeedContent, "sections" | "questions" | "scoringConfig"> {
  sections: SectionPayload[];
  questions: QuestionPayload[];
  scoringConfig: typeof SCORING_CONFIG;
}

export function buildLvaContent(): LvaContent {
  const { sections, questions } = buildSectionsAndQuestions();
  return {
    alias: TEMPLATE_ALIAS,
    name: TEMPLATE_NAME,
    description: TEMPLATE_DESCRIPTION,
    invitationSubject: INVITATION_SUBJECT,
    invitationBodyMarkdown: INVITATION_BODY_MARKDOWN,
    language: "enUS",
    sections,
    questions,
    scoringConfig: SCORING_CONFIG,
    reportConfig: null,
  };
}

function buildSectionsAndQuestions(): {
  sections: SectionPayload[];
  questions: QuestionPayload[];
} {
  const sections: SectionPayload[] = [
    { stableKey: "S0_welcome",    sortOrder: 1, name: "Welcome" },
    { stableKey: "S1_financials", sortOrder: 2, name: "The Company in Three Years — Financials & Scale" },
    { stableKey: "S2_vision",     sortOrder: 3, name: "Vision on the Future" },
    { stableKey: "S3_strengths",  sortOrder: 4, name: "Organizational Strengths and Weaknesses" },
    { stableKey: "S4_obstacles",  sortOrder: 5, name: "Biggest Obstacles to Growth" },
    { stableKey: "S5_explained",  sortOrder: 6, name: "Obstacles and Challenges Explained" },
    { stableKey: "S6_focus",      sortOrder: 7, name: "Important Focus Areas" },
    { stableKey: "S7_completion", sortOrder: 8, name: "Completion" },
  ];

  let sortOrder = 0;
  const questions: QuestionPayload[] = [];

  // ── S0 Welcome: no questions ─────────────────────────────────────────────

  // ── S1 The Company in Three Years — 9 NUMBER (aspirational, not current) ─
  // Labels verbatim from xlsx sharedStrings (indices 2,5,7,9,11,13,15,16,18).
  // The reports render these as "in three years" figures (e.g. "Company's
  // revenue in three years (in million)"). helpText carries the unit hint.
  questions.push(
    {
      stableKey: "S1_revenue",
      sortOrder: ++sortOrder,
      type: "NUMBER",
      label: "What is the company's revenue in three years?",
      helpText: "million (for example enter 2.4)",
      sectionStableKey: "S1_financials",
      isRequired: false,
    },
    {
      stableKey: "S1_gross_margin",
      sortOrder: ++sortOrder,
      type: "NUMBER",
      label: "What is the gross margin (revenue - / - direct (purchase) cost) in three years?",
      helpText: "million (for example enter 0.3)",
      sectionStableKey: "S1_financials",
      isRequired: false,
    },
    {
      stableKey: "S1_net_profit_pct",
      sortOrder: ++sortOrder,
      type: "NUMBER",
      label: "What is the relative net profit in three years?",
      helpText: "%",
      sectionStableKey: "S1_financials",
      isRequired: false,
    },
    {
      stableKey: "S1_customers",
      sortOrder: ++sortOrder,
      type: "NUMBER",
      label: "How many customers does the company have in three years?",
      helpText: "customers",
      sectionStableKey: "S1_financials",
      isRequired: false,
    },
    {
      stableKey: "S1_total_employees",
      sortOrder: ++sortOrder,
      type: "NUMBER",
      label: "How many total employees does the company have in three years?",
      helpText: "employees",
      sectionStableKey: "S1_financials",
      isRequired: false,
    },
    {
      stableKey: "S1_permanent_fte",
      sortOrder: ++sortOrder,
      type: "NUMBER",
      label: "How many permanent employees in three years? (FTE)",
      helpText: "FTE",
      sectionStableKey: "S1_financials",
      isRequired: false,
    },
    {
      stableKey: "S1_parttime_fte",
      sortOrder: ++sortOrder,
      type: "NUMBER",
      label: "How many part-time / hiring in three years? (FTE)",
      helpText: "FTE",
      sectionStableKey: "S1_financials",
      isRequired: false,
    },
    {
      stableKey: "S1_branches",
      sortOrder: ++sortOrder,
      type: "NUMBER",
      label: "How many branches does the company then have in three years?",
      helpText: "branches",
      sectionStableKey: "S1_financials",
      isRequired: false,
    },
    {
      stableKey: "S1_countries",
      sortOrder: ++sortOrder,
      type: "NUMBER",
      label: "In how many countries does the company provide its products or services in three years?",
      helpText: "countries",
      sectionStableKey: "S1_financials",
      isRequired: false,
    }
  );

  // ── S2 Vision on the Future — 8 TEXT required ────────────────────────────
  // Labels verbatim from xlsx sharedStrings (indices 20-27), trailing NBSP+*
  // stripped (the * indicates required in the xlsx).
  questions.push(
    {
      stableKey: "S2_main_products",
      sortOrder: ++sortOrder,
      type: "TEXT",
      label: "What are the main products?",
      sectionStableKey: "S2_vision",
      isRequired: true,
    },
    {
      stableKey: "S2_main_partners",
      sortOrder: ++sortOrder,
      type: "TEXT",
      label: "Who are the main business partners?",
      sectionStableKey: "S2_vision",
      isRequired: true,
    },
    {
      stableKey: "S2_main_competitors",
      sortOrder: ++sortOrder,
      type: "TEXT",
      label: "Who are the main competitors?",
      sectionStableKey: "S2_vision",
      isRequired: true,
    },
    {
      stableKey: "S2_media",
      sortOrder: ++sortOrder,
      type: "TEXT",
      label: "What do the media write about the company?",
      sectionStableKey: "S2_vision",
      isRequired: true,
    },
    {
      stableKey: "S2_reason_success",
      sortOrder: ++sortOrder,
      type: "TEXT",
      label: "What is the main reason behind the success?",
      sectionStableKey: "S2_vision",
      isRequired: true,
    },
    {
      stableKey: "S2_employees_say",
      sortOrder: ++sortOrder,
      type: "TEXT",
      label: "What do employees say about the company?",
      sectionStableKey: "S2_vision",
      isRequired: true,
    },
    {
      stableKey: "S2_major_initiatives",
      sortOrder: ++sortOrder,
      type: "TEXT",
      label: "What are the major initiatives in the coming years to achieve these goals and success?",
      sectionStableKey: "S2_vision",
      isRequired: true,
    },
    {
      stableKey: "S2_reason_not_reach",
      sortOrder: ++sortOrder,
      type: "TEXT",
      label: "What could be the key reason to NOT reach this ambition?",
      sectionStableKey: "S2_vision",
      isRequired: true,
    }
  );

  // ── S3 Organizational Strengths and Weaknesses — 16 SLIDER_LIKERT 1-3 ───
  // Labels verbatim from xlsx sharedStrings (indices 31-46).
  // Scale: 1=Weak, 2=Average (implied), 3=Strong. No scaleLabels field.
  const SLIDER_SCALE = { min: 1, max: 3, step: 1, anchorMin: "Weak", anchorMax: "Strong" } as const;

  for (let i = 0; i < FACTORS_FOR_MATRIX.length; i++) {
    questions.push({
      stableKey: `S3_${FACTOR_STABLE_KEYS[i]}`,
      sortOrder: ++sortOrder,
      type: "SLIDER_LIKERT",
      label: FACTORS_FOR_MATRIX[i],
      sectionStableKey: "S3_strengths",
      isRequired: true,
      scale: SLIDER_SCALE,
    });
  }

  // ── S4 Biggest Obstacles — 1 MULTI_CHOICE, maxChoices: 3 ─────────────────
  // Label verbatim from xlsx sharedString index 47.
  // Options use the checkbox list (index 49 for "The Leadership" with capital L).
  questions.push({
    stableKey: "S4_biggest_obstacles",
    sortOrder: ++sortOrder,
    type: "MULTI_CHOICE",
    label: "Can you indicate what three factors you see as the biggest obstacle to achieving the growth targets?",
    sectionStableKey: "S4_obstacles",
    isRequired: false,
    maxChoices: 3,
    options: FACTORS_FOR_CHECKBOX.map((label, i) => ({
      key: FACTOR_STABLE_KEYS[i],
      label,
    })),
  });

  // ── S5 Obstacles Explained — 16 optional TEXT (one per factor) + 2 required
  // Since the platform has no conditional logic, all 16 per-factor follow-ups
  // are seeded as OPTIONAL TEXT. The two always-shown questions are REQUIRED
  // (marked with * in xlsx, indices 56 and 57).
  for (let i = 0; i < FACTORS_FOR_MATRIX.length; i++) {
    questions.push({
      stableKey: `S5_why_${FACTOR_STABLE_KEYS[i]}`,
      sortOrder: ++sortOrder,
      type: "TEXT",
      label: `Why is ${FACTORS_FOR_MATRIX[i]} a hindrance?`,
      sectionStableKey: "S5_explained",
      isRequired: false,
    });
  }
  // Two always-on questions (verbatim from xlsx indices 56, 57).
  questions.push(
    {
      stableKey: "S5_other_factor",
      sortOrder: ++sortOrder,
      type: "TEXT",
      label: "Is another factor hindering your growth? If so, which?",
      sectionStableKey: "S5_explained",
      isRequired: true,
    },
    {
      stableKey: "S5_change_one_thing",
      sortOrder: ++sortOrder,
      type: "TEXT",
      label: "If you could change one thing within your company? What would it be?",
      sectionStableKey: "S5_explained",
      isRequired: true,
    }
  );

  // ── S6 Important Focus Areas — 1 NUMBER + 14 TEXT ────────────────────────
  // NUMBER: rehire % (xlsx index 59), NOT marked required (no trailing *).
  // All 14 TEXT questions ARE required (trailing * in xlsx, indices 65-92).
  questions.push(
    {
      stableKey: "S6_rehire_pct",
      sortOrder: ++sortOrder,
      type: "NUMBER",
      label: "Approximately what percentage of people in the organization would you enthusiastically hire again?",
      helpText: "%",
      sectionStableKey: "S6_focus",
      isRequired: false,
    },
    {
      stableKey: "S6_bhag",
      sortOrder: ++sortOrder,
      type: "TEXT",
      label: "What is the long-term goal of the organization (> 15 years)? (Sometimes referred to as BHAG).",
      sectionStableKey: "S6_focus",
      isRequired: true,
    },
    {
      stableKey: "S6_core_purpose",
      sortOrder: ++sortOrder,
      type: "TEXT",
      label: "What is the core purpose (mission) of the company?",
      sectionStableKey: "S6_focus",
      isRequired: true,
    },
    {
      stableKey: "S6_core_values",
      sortOrder: ++sortOrder,
      type: "TEXT",
      label: "What do you think are the core values of the organization? Mention at least three.",
      sectionStableKey: "S6_focus",
      isRequired: true,
    },
    {
      stableKey: "S6_market_focus",
      sortOrder: ++sortOrder,
      type: "TEXT",
      label: "Is there a clear market focus, what is the exact playfield? (sometimes referred to as 'sandbox').",
      sectionStableKey: "S6_focus",
      isRequired: true,
    },
    {
      stableKey: "S6_core_customer",
      sortOrder: ++sortOrder,
      type: "TEXT",
      label: "What is the defined 'core customer'? Is marketing and sales effectively aimed at the customer? Explain.",
      sectionStableKey: "S6_focus",
      isRequired: true,
    },
    {
      stableKey: "S6_strategy_one_sentence",
      sortOrder: ++sortOrder,
      type: "TEXT",
      label: "Describe the company's strategy in one sentence:",
      sectionStableKey: "S6_focus",
      isRequired: true,
    },
    {
      stableKey: "S6_strategy_implementation",
      sortOrder: ++sortOrder,
      type: "TEXT",
      label: "Does the company manage to implement the strategy effectively and efficiently? Explain.",
      sectionStableKey: "S6_focus",
      isRequired: true,
    },
    {
      stableKey: "S6_goals_clear",
      sortOrder: ++sortOrder,
      type: "TEXT",
      label: "Are the goals for the year and quarter clear?",
      sectionStableKey: "S6_focus",
      isRequired: true,
    },
    {
      stableKey: "S6_priority_org",
      sortOrder: ++sortOrder,
      type: "TEXT",
      label: "What is in your opinion the overall number one priority for the organization?",
      sectionStableKey: "S6_focus",
      isRequired: true,
    },
    {
      stableKey: "S6_priority_year",
      sortOrder: ++sortOrder,
      type: "TEXT",
      label: "What is in your opinion the most important thing to achieve this year's goals?",
      sectionStableKey: "S6_focus",
      isRequired: true,
    },
    {
      stableKey: "S6_priority_quarter",
      sortOrder: ++sortOrder,
      type: "TEXT",
      label: "What is in your opinion the number one priority this quarter to meet the targets?",
      sectionStableKey: "S6_focus",
      isRequired: true,
    },
    {
      stableKey: "S6_dept_kpis",
      sortOrder: ++sortOrder,
      type: "TEXT",
      label: "What are the three most important department KPI's?",
      sectionStableKey: "S6_focus",
      isRequired: true,
    },
    {
      stableKey: "S6_constructive_discussions",
      sortOrder: ++sortOrder,
      type: "TEXT",
      label: "Is the leadership team able to conduct constructive discussions and do all team members feel comfortable to participate? Explain your answer briefly.",
      sectionStableKey: "S6_focus",
      isRequired: true,
    },
    {
      stableKey: "S6_add_leadership_position",
      sortOrder: ++sortOrder,
      type: "TEXT",
      label: "What leadership position would you prefer to add tomorrow to the existing team? Explain your answer briefly.",
      sectionStableKey: "S6_focus",
      isRequired: true,
    }
  );

  // ── S7 Completion: no questions ──────────────────────────────────────────

  return { sections, questions };
}

// ─── System user resolution ───────────────────────────────────────────────
const SYSTEM_SEED_EMAIL = "system-seed@scalingup.platform";

async function resolveSystemUser(
  tx: Parameters<Parameters<typeof db.$transaction>[0]>[0]
): Promise<{ id: string }> {
  return tx.user.upsert({
    where: { email: SYSTEM_SEED_EMAIL },
    create: {
      email: SYSTEM_SEED_EMAIL,
      role: "STAFF",
      name: "System Seed",
    },
    update: {},
    select: { id: true },
  });
}

// ─── ensureAccessGroupAndTemplateLink ─────────────────────────────────────
async function ensureAccessGroupAndTemplateLink(
  tx: Parameters<Parameters<typeof db.$transaction>[0]>[0],
  templateId: string,
  groupName: string,
  systemUserId: string,
  defaultCoachEmail = "coach@example.com"
): Promise<void> {
  const existingGroup = await tx.accessGroup.findFirst({
    where: { name: groupName },
    select: { id: true, deletedAt: true },
  });

  let groupId: string;
  if (!existingGroup) {
    const created = await tx.accessGroup.create({
      data: {
        name: groupName,
        description:
          "Default access group seeded with the Leadership Vision Alignment template. " +
          "Admins add certified coaches here to grant template access.",
        createdBy: systemUserId,
      },
      select: { id: true },
    });
    groupId = created.id;
  } else {
    if (existingGroup.deletedAt !== null) {
      throw new Error(
        `[seed-lva-assessment] AccessGroup "${groupName}" exists ` +
          `but is soft-deleted (deletedAt=${existingGroup.deletedAt.toISOString()}). ` +
          `Refusing to silently un-archive. ` +
          `Operator must un-archive the group via admin UI or set ` +
          `deletedAt = NULL manually before re-seeding.`
      );
    }
    groupId = existingGroup.id;
  }

  await tx.accessGroupTemplate.upsert({
    where: {
      accessGroupId_templateId: {
        accessGroupId: groupId,
        templateId,
      },
    },
    create: {
      accessGroupId: groupId,
      templateId,
      addedBy: systemUserId,
    },
    update: {},
  });

  const defaultCoach = await tx.coach.findUnique({
    where: { email: defaultCoachEmail },
    select: { id: true },
  });
  if (defaultCoach) {
    await tx.accessGroupCoach.upsert({
      where: {
        accessGroupId_coachId: {
          accessGroupId: groupId,
          coachId: defaultCoach.id,
        },
      },
      create: {
        accessGroupId: groupId,
        coachId: defaultCoach.id,
        addedBy: systemUserId,
      },
      update: {},
    });
  }
}

// ─── Main ────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const content = buildLvaContent();

  const result = await db.$transaction(async (tx) => {
    const lockRows = await tx.$queryRawUnsafe<Array<{ acquired: boolean }>>(
      `SELECT pg_try_advisory_xact_lock(hashtext('${ADVISORY_LOCK_KEY}')) AS acquired`
    );
    const acquired = lockRows[0]?.acquired ?? false;
    if (!acquired) {
      throw new Error(
        `[seed-lva-assessment] Could not acquire advisory lock ` +
          `"${ADVISORY_LOCK_KEY}" — another seed run is in progress. ` +
          `Try again after the other session completes.`
      );
    }

    const sys = await resolveSystemUser(tx);

    const seedResult = await ensureTemplateVersionContent(
      tx as unknown as Parameters<typeof ensureTemplateVersionContent>[0],
      sys.id,
      content
    );

    await ensureAccessGroupAndTemplateLink(
      tx,
      seedResult.templateId,
      "Scaling Up Coaches",
      sys.id
    );

    return { ...seedResult };
  }, {
    maxWait: 30_000,
    timeout: 60_000,
  });

  console.log(
    JSON.stringify({
      seed: "lva-assessment",
      action: result.action,
      templateId: result.templateId,
      versionId: result.versionId,
      versionNumber: result.versionNumber,
      contentHash: result.contentHash,
      message:
        result.action === "created"
          ? `Appended DRAFT v${result.versionNumber}.`
          : `No-op — latest v${result.versionNumber} already matches.`,
    })
  );
}

// Only run when executed directly (not when imported by tests).
if (require.main === module) {
  main()
    .catch((err) => {
      console.error("[seed-lva-assessment] FAILED:", err);
      process.exit(1);
    })
    .finally(async () => {
      await db.$disconnect();
    });
}
