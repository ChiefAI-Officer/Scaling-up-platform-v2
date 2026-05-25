/**
 * Seed: Leadership Vision Alignment (LVA) Assessment Template (v1)
 *
 * Creates an AssessmentTemplate (alias "leadership-vision-alignment") plus its
 * immutable v1 AssessmentTemplateVersion (language "enUS") with 9 sections and
 * 54 questions (NUMBER, TEXT, SLIDER_LIKERT, MULTI_CHOICE).
 *
 * Scoring note: only the 16 SLIDER_LIKERT questions in Section 4 (scale 1–3)
 * are scored. Tier thresholds are PLACEHOLDER — Jeff must confirm messaging
 * before the template is published via the admin editor.
 *
 * Idempotency / safety model (6 explicit states):
 *   A — nothing found:            create template + v1 atomically.
 *   B — exact match (hash same):  no-op; log idempotent success and return.
 *   C — mismatch (hash differs):  THROW with a friendly message before the
 *                                 immutability trigger blocks us.
 *   D — half-baked heal:          template exists but v1 missing → create v1.
 *   E — orphan:                   v1 exists without a template → THROW.
 *   F — duplicate v1 rows:        defensive paranoia → THROW.
 *
 * Concurrency: wrapped in a single Prisma interactive transaction whose first
 * statement acquires `pg_advisory_xact_lock(hashtext('assessment-lva-v1-seed'))`.
 * That serializes concurrent prod seed attempts so two callers can't race the
 * create.
 *
 * Run: npx tsx prisma/seed-lva-assessment.ts
 */

import { PrismaClient } from "@prisma/client";
import { createHash } from "crypto";

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

// ─── Scoring config (placeholder — Jeff to confirm before publish) ────────

const SCORING_CONFIG = {
  tierMetric: "overallAvg",
  passThreshold: 2,
  tiers: [
    {
      order: 1,
      minMetric: 1.0,
      maxMetric: 1.67,
      label: "Developing",
      message:
        "TODO: confirm tier messaging with Jeff before publishing.",
      action: "TODO: confirm with Jeff",
    },
    {
      order: 2,
      minMetric: 1.67,
      maxMetric: 2.34,
      label: "Building",
      message:
        "TODO: confirm tier messaging with Jeff before publishing.",
      action: "TODO: confirm with Jeff",
    },
    {
      order: 3,
      minMetric: 2.34,
      maxMetric: 3.0,
      label: "Scaling",
      message:
        "TODO: confirm tier messaging with Jeff before publishing.",
      action: "TODO: confirm with Jeff",
    },
  ],
} as const;

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
  isRequired: false;
}

interface NumberQuestion {
  stableKey: string;
  sortOrder: number;
  type: "NUMBER";
  label: string;
  sectionStableKey: string;
  isRequired: false;
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

function buildSectionsAndQuestions(): {
  sections: SectionPayload[];
  questions: QuestionPayload[];
} {
  const sections: SectionPayload[] = [
    { stableKey: "S1", sortOrder: 1, name: "Company Financials & Scale" },
    { stableKey: "S2", sortOrder: 2, name: "Business Context" },
    { stableKey: "S3", sortOrder: 3, name: "Future Vision" },
    { stableKey: "S4", sortOrder: 4, name: "Organizational Strengths" },
    { stableKey: "S5", sortOrder: 5, name: "Obstacles to Growth" },
    { stableKey: "S6", sortOrder: 6, name: "Obstacle Details" },
    { stableKey: "S7", sortOrder: 7, name: "Leadership & Culture" },
    { stableKey: "S8", sortOrder: 8, name: "Strategy & Execution" },
    { stableKey: "S9", sortOrder: 9, name: "KPIs & Leadership" },
  ];

  let sortOrder = 0;

  const questions: QuestionPayload[] = [
    // ── Section 1: Company Financials & Scale (9 NUMBER questions) ──────
    {
      stableKey: "S1_Q1",
      sortOrder: ++sortOrder,
      type: "NUMBER",
      label: "What is the company's annual revenue? (millions)",
      sectionStableKey: "S1",
      isRequired: false,
    },
    {
      stableKey: "S1_Q2",
      sortOrder: ++sortOrder,
      type: "NUMBER",
      label: "What is the gross margin? (millions)",
      sectionStableKey: "S1",
      isRequired: false,
    },
    {
      stableKey: "S1_Q3",
      sortOrder: ++sortOrder,
      type: "NUMBER",
      label: "What is the relative net profit? (%)",
      sectionStableKey: "S1",
      isRequired: false,
    },
    {
      stableKey: "S1_Q4",
      sortOrder: ++sortOrder,
      type: "NUMBER",
      label: "How many customers does the company have?",
      sectionStableKey: "S1",
      isRequired: false,
    },
    {
      stableKey: "S1_Q5",
      sortOrder: ++sortOrder,
      type: "NUMBER",
      label: "How many total employees does the company have?",
      sectionStableKey: "S1",
      isRequired: false,
    },
    {
      stableKey: "S1_Q6",
      sortOrder: ++sortOrder,
      type: "NUMBER",
      label: "How many permanent employees (FTE)?",
      sectionStableKey: "S1",
      isRequired: false,
    },
    {
      stableKey: "S1_Q7",
      sortOrder: ++sortOrder,
      type: "NUMBER",
      label: "How many part-time / contract employees (FTE)?",
      sectionStableKey: "S1",
      isRequired: false,
    },
    {
      stableKey: "S1_Q8",
      sortOrder: ++sortOrder,
      type: "NUMBER",
      label: "How many branches does the company have?",
      sectionStableKey: "S1",
      isRequired: false,
    },
    {
      stableKey: "S1_Q9",
      sortOrder: ++sortOrder,
      type: "NUMBER",
      label:
        "In how many countries does the company provide products or services?",
      sectionStableKey: "S1",
      isRequired: false,
    },

    // ── Section 2: Business Context (6 TEXT questions) ───────────────────
    {
      stableKey: "S2_Q1",
      sortOrder: ++sortOrder,
      type: "TEXT",
      label: "What are the main products or services?",
      sectionStableKey: "S2",
      isRequired: false,
    },
    {
      stableKey: "S2_Q2",
      sortOrder: ++sortOrder,
      type: "TEXT",
      label: "Who are the main business partners?",
      sectionStableKey: "S2",
      isRequired: false,
    },
    {
      stableKey: "S2_Q3",
      sortOrder: ++sortOrder,
      type: "TEXT",
      label: "Who are the main competitors?",
      sectionStableKey: "S2",
      isRequired: false,
    },
    {
      stableKey: "S2_Q4",
      sortOrder: ++sortOrder,
      type: "TEXT",
      label: "What do the media write about the company?",
      sectionStableKey: "S2",
      isRequired: false,
    },
    {
      stableKey: "S2_Q5",
      sortOrder: ++sortOrder,
      type: "TEXT",
      label: "What is the main reason behind the company's success?",
      sectionStableKey: "S2",
      isRequired: false,
    },
    {
      stableKey: "S2_Q6",
      sortOrder: ++sortOrder,
      type: "TEXT",
      label: "What do employees say about the company?",
      sectionStableKey: "S2",
      isRequired: false,
    },

    // ── Section 3: Future Vision (2 TEXT questions) ──────────────────────
    {
      stableKey: "S3_Q1",
      sortOrder: ++sortOrder,
      type: "TEXT",
      label:
        "What are the major initiatives in the coming years to achieve your goals?",
      sectionStableKey: "S3",
      isRequired: false,
    },
    {
      stableKey: "S3_Q2",
      sortOrder: ++sortOrder,
      type: "TEXT",
      label: "What could be the key reason for NOT reaching this ambition?",
      sectionStableKey: "S3",
      isRequired: false,
    },

    // ── Section 4: Organizational Strengths (16 SLIDER_LIKERT 1–3) ──────
    {
      stableKey: "S4_Q1",
      sortOrder: ++sortOrder,
      type: "SLIDER_LIKERT",
      label: "Recruitment of new employees",
      sectionStableKey: "S4",
      isRequired: true,
      scale: { min: 1, max: 3, step: 1, anchorMin: "Weak", anchorMax: "Strong" },
    },
    {
      stableKey: "S4_Q2",
      sortOrder: ++sortOrder,
      type: "SLIDER_LIKERT",
      label: "Retaining staff",
      sectionStableKey: "S4",
      isRequired: true,
      scale: { min: 1, max: 3, step: 1, anchorMin: "Weak", anchorMax: "Strong" },
    },
    {
      stableKey: "S4_Q3",
      sortOrder: ++sortOrder,
      type: "SLIDER_LIKERT",
      label: "Leadership Team",
      sectionStableKey: "S4",
      isRequired: true,
      scale: { min: 1, max: 3, step: 1, anchorMin: "Weak", anchorMax: "Strong" },
    },
    {
      stableKey: "S4_Q4",
      sortOrder: ++sortOrder,
      type: "SLIDER_LIKERT",
      label: "The leadership",
      sectionStableKey: "S4",
      isRequired: true,
      scale: { min: 1, max: 3, step: 1, anchorMin: "Weak", anchorMax: "Strong" },
    },
    {
      stableKey: "S4_Q5",
      sortOrder: ++sortOrder,
      type: "SLIDER_LIKERT",
      label: "Culture",
      sectionStableKey: "S4",
      isRequired: true,
      scale: { min: 1, max: 3, step: 1, anchorMin: "Weak", anchorMax: "Strong" },
    },
    {
      stableKey: "S4_Q6",
      sortOrder: ++sortOrder,
      type: "SLIDER_LIKERT",
      label: "Internal communications",
      sectionStableKey: "S4",
      isRequired: true,
      scale: { min: 1, max: 3, step: 1, anchorMin: "Weak", anchorMax: "Strong" },
    },
    {
      stableKey: "S4_Q7",
      sortOrder: ++sortOrder,
      type: "SLIDER_LIKERT",
      label: "Strategy",
      sectionStableKey: "S4",
      isRequired: true,
      scale: { min: 1, max: 3, step: 1, anchorMin: "Weak", anchorMax: "Strong" },
    },
    {
      stableKey: "S4_Q8",
      sortOrder: ++sortOrder,
      type: "SLIDER_LIKERT",
      label: "Execution and operational processes",
      sectionStableKey: "S4",
      isRequired: true,
      scale: { min: 1, max: 3, step: 1, anchorMin: "Weak", anchorMax: "Strong" },
    },
    {
      stableKey: "S4_Q9",
      sortOrder: ++sortOrder,
      type: "SLIDER_LIKERT",
      label: "Marketing",
      sectionStableKey: "S4",
      isRequired: true,
      scale: { min: 1, max: 3, step: 1, anchorMin: "Weak", anchorMax: "Strong" },
    },
    {
      stableKey: "S4_Q10",
      sortOrder: ++sortOrder,
      type: "SLIDER_LIKERT",
      label: "Sales",
      sectionStableKey: "S4",
      isRequired: true,
      scale: { min: 1, max: 3, step: 1, anchorMin: "Weak", anchorMax: "Strong" },
    },
    {
      stableKey: "S4_Q11",
      sortOrder: ++sortOrder,
      type: "SLIDER_LIKERT",
      label: "Technology",
      sectionStableKey: "S4",
      isRequired: true,
      scale: { min: 1, max: 3, step: 1, anchorMin: "Weak", anchorMax: "Strong" },
    },
    {
      stableKey: "S4_Q12",
      sortOrder: ++sortOrder,
      type: "SLIDER_LIKERT",
      label: "Scalability",
      sectionStableKey: "S4",
      isRequired: true,
      scale: { min: 1, max: 3, step: 1, anchorMin: "Weak", anchorMax: "Strong" },
    },
    {
      stableKey: "S4_Q13",
      sortOrder: ++sortOrder,
      type: "SLIDER_LIKERT",
      label: "Innovation",
      sectionStableKey: "S4",
      isRequired: true,
      scale: { min: 1, max: 3, step: 1, anchorMin: "Weak", anchorMax: "Strong" },
    },
    {
      stableKey: "S4_Q14",
      sortOrder: ++sortOrder,
      type: "SLIDER_LIKERT",
      label: "Financial processes",
      sectionStableKey: "S4",
      isRequired: true,
      scale: { min: 1, max: 3, step: 1, anchorMin: "Weak", anchorMax: "Strong" },
    },
    {
      stableKey: "S4_Q15",
      sortOrder: ++sortOrder,
      type: "SLIDER_LIKERT",
      label: "Cash",
      sectionStableKey: "S4",
      isRequired: true,
      scale: { min: 1, max: 3, step: 1, anchorMin: "Weak", anchorMax: "Strong" },
    },
    {
      stableKey: "S4_Q16",
      sortOrder: ++sortOrder,
      type: "SLIDER_LIKERT",
      label: "Growth Financing",
      sectionStableKey: "S4",
      isRequired: true,
      scale: { min: 1, max: 3, step: 1, anchorMin: "Weak", anchorMax: "Strong" },
    },

    // ── Section 5: Obstacles to Growth (1 MULTI_CHOICE, maxChoices:3) ───
    {
      stableKey: "S5_Q1",
      sortOrder: ++sortOrder,
      type: "MULTI_CHOICE",
      label:
        "Which three factors are the biggest obstacles to achieving your growth targets?",
      sectionStableKey: "S5",
      isRequired: false,
      maxChoices: 3,
      options: [
        { key: "S4_Q1", label: "Recruitment of new employees" },
        { key: "S4_Q2", label: "Retaining staff" },
        { key: "S4_Q3", label: "Leadership Team" },
        { key: "S4_Q4", label: "The leadership" },
        { key: "S4_Q5", label: "Culture" },
        { key: "S4_Q6", label: "Internal communications" },
        { key: "S4_Q7", label: "Strategy" },
        { key: "S4_Q8", label: "Execution and operational processes" },
        { key: "S4_Q9", label: "Marketing" },
        { key: "S4_Q10", label: "Sales" },
        { key: "S4_Q11", label: "Technology" },
        { key: "S4_Q12", label: "Scalability" },
        { key: "S4_Q13", label: "Innovation" },
        { key: "S4_Q14", label: "Financial processes" },
        { key: "S4_Q15", label: "Cash" },
        { key: "S4_Q16", label: "Growth Financing" },
      ],
    },

    // ── Section 6: Obstacle Details (5 TEXT questions) ───────────────────
    {
      stableKey: "S6_Q1",
      sortOrder: ++sortOrder,
      type: "TEXT",
      label: "Why is your biggest obstacle a hindrance to growth?",
      sectionStableKey: "S6",
      isRequired: false,
    },
    {
      stableKey: "S6_Q2",
      sortOrder: ++sortOrder,
      type: "TEXT",
      label: "Why is your second biggest obstacle a hindrance to growth?",
      sectionStableKey: "S6",
      isRequired: false,
    },
    {
      stableKey: "S6_Q3",
      sortOrder: ++sortOrder,
      type: "TEXT",
      label: "Why is your third obstacle a hindrance to growth?",
      sectionStableKey: "S6",
      isRequired: false,
    },
    {
      stableKey: "S6_Q4",
      sortOrder: ++sortOrder,
      type: "TEXT",
      label:
        "Is there another factor hindering your growth? If so, which one?",
      sectionStableKey: "S6",
      isRequired: false,
    },
    {
      stableKey: "S6_Q5",
      sortOrder: ++sortOrder,
      type: "TEXT",
      label:
        "If you could change one thing within your company, what would it be?",
      sectionStableKey: "S6",
      isRequired: false,
    },

    // ── Section 7: Leadership & Culture (1 NUMBER + 5 TEXT) ──────────────
    {
      stableKey: "S7_Q1",
      sortOrder: ++sortOrder,
      type: "NUMBER",
      label:
        "Approximately what percentage of people in the organization would you enthusiastically hire again? (%)",
      sectionStableKey: "S7",
      isRequired: false,
    },
    {
      stableKey: "S7_Q2",
      sortOrder: ++sortOrder,
      type: "TEXT",
      label: "What is the long-term goal of the organization (> 15 years / BHAG)?",
      sectionStableKey: "S7",
      isRequired: false,
    },
    {
      stableKey: "S7_Q3",
      sortOrder: ++sortOrder,
      type: "TEXT",
      label: "What is the core purpose (mission) of the company?",
      sectionStableKey: "S7",
      isRequired: false,
    },
    {
      stableKey: "S7_Q4",
      sortOrder: ++sortOrder,
      type: "TEXT",
      label:
        "What are the core values of the organization? Mention at least three.",
      sectionStableKey: "S7",
      isRequired: false,
    },
    {
      stableKey: "S7_Q5",
      sortOrder: ++sortOrder,
      type: "TEXT",
      label:
        "Is there a clear market focus — what is the exact playfield ('sandbox')?",
      sectionStableKey: "S7",
      isRequired: false,
    },
    {
      stableKey: "S7_Q6",
      sortOrder: ++sortOrder,
      type: "TEXT",
      label:
        "What is the defined 'core customer'? Is marketing and sales effectively aimed at that customer?",
      sectionStableKey: "S7",
      isRequired: false,
    },

    // ── Section 8: Strategy & Execution (6 TEXT questions) ───────────────
    {
      stableKey: "S8_Q1",
      sortOrder: ++sortOrder,
      type: "TEXT",
      label: "Describe the company's strategy in one sentence.",
      sectionStableKey: "S8",
      isRequired: false,
    },
    {
      stableKey: "S8_Q2",
      sortOrder: ++sortOrder,
      type: "TEXT",
      label:
        "Does the company manage to implement the strategy effectively and efficiently?",
      sectionStableKey: "S8",
      isRequired: false,
    },
    {
      stableKey: "S8_Q3",
      sortOrder: ++sortOrder,
      type: "TEXT",
      label: "Are the goals for the year and quarter clear?",
      sectionStableKey: "S8",
      isRequired: false,
    },
    {
      stableKey: "S8_Q4",
      sortOrder: ++sortOrder,
      type: "TEXT",
      label:
        "What is, in your opinion, the overall number one priority for the organization?",
      sectionStableKey: "S8",
      isRequired: false,
    },
    {
      stableKey: "S8_Q5",
      sortOrder: ++sortOrder,
      type: "TEXT",
      label: "What is the most important thing to achieve this year's goals?",
      sectionStableKey: "S8",
      isRequired: false,
    },
    {
      stableKey: "S8_Q6",
      sortOrder: ++sortOrder,
      type: "TEXT",
      label:
        "What is the number one priority this quarter to meet the targets?",
      sectionStableKey: "S8",
      isRequired: false,
    },

    // ── Section 9: KPIs & Leadership (3 TEXT questions) ──────────────────
    {
      stableKey: "S9_Q1",
      sortOrder: ++sortOrder,
      type: "TEXT",
      label: "What are the three most important KPIs for the key departments?",
      sectionStableKey: "S9",
      isRequired: false,
    },
    {
      stableKey: "S9_Q2",
      sortOrder: ++sortOrder,
      type: "TEXT",
      label:
        "Is the leadership team able to conduct constructive discussions where all members feel comfortable to participate?",
      sectionStableKey: "S9",
      isRequired: false,
    },
    {
      stableKey: "S9_Q3",
      sortOrder: ++sortOrder,
      type: "TEXT",
      label:
        "What leadership position would you most want to add to the existing team?",
      sectionStableKey: "S9",
      isRequired: false,
    },
  ];

  return { sections, questions };
}

// ─── Content hash ────────────────────────────────────────────────────────
// Deterministic across runs: build the input object with a fixed key order,
// serialize without whitespace, sha256, hex.
function computeContentHash(input: {
  questions: QuestionPayload[];
  sections: SectionPayload[];
  scoringConfig: unknown;
  reportConfig: null;
  invitationSubject: string;
  invitationBodyMarkdown: string;
}): string {
  // Explicit key order — DO NOT pretty-print, DO NOT sort, DO NOT add whitespace.
  const canonical = {
    questions: input.questions,
    sections: input.sections,
    scoringConfig: input.scoringConfig,
    reportConfig: input.reportConfig,
    invitationSubject: input.invitationSubject,
    invitationBodyMarkdown: input.invitationBodyMarkdown,
  };
  return createHash("sha256").update(JSON.stringify(canonical)).digest("hex");
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
  const { sections, questions } = buildSectionsAndQuestions();

  // Validate counts before touching the DB.
  if (sections.length !== 9) {
    throw new Error(
      `[seed-lva-assessment] Expected 9 sections, got ${sections.length}`
    );
  }
  if (questions.length !== 54) {
    throw new Error(
      `[seed-lva-assessment] Expected 54 questions, got ${questions.length}`
    );
  }

  // Pre-compute everything outside the tx so it's identical inside.
  const contentHash = computeContentHash({
    questions,
    sections,
    scoringConfig: SCORING_CONFIG,
    reportConfig: null,
    invitationSubject: INVITATION_SUBJECT,
    invitationBodyMarkdown: INVITATION_BODY_MARKDOWN,
  });

  const result = await db.$transaction(async (tx) => {
    // Serialize concurrent seed attempts deterministically.
    await tx.$executeRawUnsafe(
      `SELECT pg_advisory_xact_lock(hashtext('${ADVISORY_LOCK_KEY}'))`
    );

    const systemUser = await resolveSystemUser(tx);

    // Find existing template (by unique alias).
    const existingTemplate = await tx.assessmentTemplate.findUnique({
      where: { alias: TEMPLATE_ALIAS },
      select: { id: true, createdBy: true },
    });

    if (!existingTemplate) {
      // STATE E — orphan defensive check.
      const orphanedV1s = await tx.$queryRawUnsafe<Array<{ id: string }>>(
        `SELECT v.id
           FROM assessment_template_versions v
           LEFT JOIN assessment_templates t ON t.id = v."templateId"
           WHERE v."versionNumber" = 1
             AND v.language = 'enUS'
             AND t.id IS NULL`
      );
      if (orphanedV1s.length > 0) {
        throw new Error(
          `[seed-lva-assessment] Found ${orphanedV1s.length} orphaned ` +
            `v1/enUS AssessmentTemplateVersion row(s) with no matching template ` +
            `(IDs: ${orphanedV1s.map((r) => r.id).join(", ")}). ` +
            `Database invariant violation — the FK to assessment_templates is broken. ` +
            `Investigate before proceeding.`
        );
      }

      // STATE A — nothing found: create template + v1 atomically.
      const template = await tx.assessmentTemplate.create({
        data: {
          name: TEMPLATE_NAME,
          alias: TEMPLATE_ALIAS,
          description: TEMPLATE_DESCRIPTION,
          invitationSubject: INVITATION_SUBJECT,
          invitationBodyMarkdown: INVITATION_BODY_MARKDOWN,
          aggregationMode: "FULL_VISIBILITY",
          createdBy: systemUser.id,
        },
        select: { id: true },
      });

      const version = await tx.assessmentTemplateVersion.create({
        data: {
          templateId: template.id,
          versionNumber: 1,
          language: "enUS",
          questions: questions as unknown as object,
          sections: sections as unknown as object,
          scoringConfig: SCORING_CONFIG as unknown as object,
          reportConfig: undefined, // null in DB
          contentHash,
          // Intentionally NOT published — Jeff must confirm tier messaging
          // before operators publish via the admin editor.
          publishedAt: null,
          publishedBy: null,
        },
        select: { id: true },
      });

      await ensureAccessGroupAndTemplateLink(
        tx,
        template.id,
        "Scaling Up Coaches",
        systemUser.id
      );

      return {
        state: "A" as const,
        templateId: template.id,
        versionId: version.id,
        sectionCount: sections.length,
        questionCount: questions.length,
        contentHash,
      };
    }

    // Template exists — look for v1 / enUS rows.
    const v1Rows = await tx.assessmentTemplateVersion.findMany({
      where: {
        templateId: existingTemplate.id,
        versionNumber: 1,
        language: "enUS",
      },
      select: { id: true, contentHash: true },
    });

    if (v1Rows.length > 1) {
      // STATE F — duplicate v1 rows.
      throw new Error(
        `[seed-lva-assessment] Found ${v1Rows.length} v1/enUS rows ` +
          `for template ${existingTemplate.id}. Database invariant violation: ` +
          `the unique constraint (templateId, versionNumber, language) is broken. ` +
          `Investigate before proceeding.`
      );
    }

    if (v1Rows.length === 0) {
      // STATE D — half-baked heal.
      const version = await tx.assessmentTemplateVersion.create({
        data: {
          templateId: existingTemplate.id,
          versionNumber: 1,
          language: "enUS",
          questions: questions as unknown as object,
          sections: sections as unknown as object,
          scoringConfig: SCORING_CONFIG as unknown as object,
          reportConfig: undefined,
          contentHash,
          publishedAt: null,
          publishedBy: null,
        },
        select: { id: true },
      });

      await ensureAccessGroupAndTemplateLink(
        tx,
        existingTemplate.id,
        "Scaling Up Coaches",
        systemUser.id
      );

      return {
        state: "D" as const,
        templateId: existingTemplate.id,
        versionId: version.id,
        sectionCount: sections.length,
        questionCount: questions.length,
        contentHash,
      };
    }

    // Exactly one v1 row.
    const existingVersion = v1Rows[0];

    if (existingVersion.contentHash === contentHash) {
      // STATE B — exact match. Still run access-group linking to heal
      // pre-amendment deploys that skipped this step.
      await ensureAccessGroupAndTemplateLink(
        tx,
        existingTemplate.id,
        "Scaling Up Coaches",
        systemUser.id
      );

      return {
        state: "B" as const,
        templateId: existingTemplate.id,
        versionId: existingVersion.id,
        sectionCount: sections.length,
        questionCount: questions.length,
        contentHash,
      };
    }

    // STATE C — mismatch. Throw before the immutability trigger blocks us.
    throw new Error(
      `[seed-lva-assessment] Existing v1/enUS version ` +
        `(${existingVersion.id}) has contentHash=${existingVersion.contentHash} ` +
        `which does not match the seed's computed contentHash=${contentHash}. ` +
        `Published assessment versions are immutable. ` +
        `To change v1 content, publish a NEW versionNumber instead of mutating v1. ` +
        `Refusing to silently mutate the immutable published row.`
    );
  }, {
    // Neon pooler adds per-query latency; default 5s timeout is too tight.
    maxWait: 30_000,
    timeout: 60_000,
  });

  // Log a single JSON line on success.
  console.log(
    JSON.stringify({
      seed: "lva-assessment",
      state: result.state,
      templateId: result.templateId,
      versionId: result.versionId,
      contentHash: result.contentHash,
      sectionCount: result.sectionCount,
      questionCount: result.questionCount,
      message:
        result.state === "A"
          ? "Created template + v1 (DRAFT — publish after Jeff confirms tier messaging)."
          : result.state === "B"
            ? "Idempotent no-op — exact match."
            : "Healed missing v1 on existing template.",
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
