/**
 * Seed: Quarterly Session Prep v1 Assessment Template
 *
 * Creates an AssessmentTemplate (alias "qsp-v1") plus a new DRAFT
 * AssessmentTemplateVersion (language "enUS") with the REAL Esperto content:
 * 8 sections, 28 questions (1 NUMBER + 7 SLIDER_LIKERT + 20 TEXT),
 * aggregation-only scoring (single neutral tier, passThreshold 0).
 *
 * Content is sourced verbatim from the adversarially-verified transcription of
 * the 18 Esperto survey screenshots embedded in
 * "From Jeff/APP_scaling up assessemnt/APP_qtr session prep v1/qtr session prep v1.xlsx"
 * and confirmed against the 12-page output PDF.
 *
 * Idempotency model (delegated to ensureTemplateVersionContent):
 *   - Latest version hash matches → no-op.
 *   - Latest version is a DRAFT with different hash → throws unless
 *     forceSupersedeDraft: true (protects reviewer edits).
 *   - Latest version is published with different hash → appends new DRAFT vN+1.
 *   - No versions yet → creates template + v1 DRAFT.
 *
 * Concurrency: first statement inside the transaction acquires
 * pg_try_advisory_xact_lock(hashtext('assessment-qsp-v1-seed')).
 * If the lock is not acquired another session holds it → log + exit 1.
 *
 * Run: npx tsx prisma/seed-qsp-v1-assessment.ts
 */

import { PrismaClient } from "@prisma/client";
import {
  ensureTemplateVersionContent,
  type SeedContent,
  type SeedResult,
} from "../src/lib/assessments/seed-template-version";

const db = new PrismaClient();

const TEMPLATE_ALIAS = "qsp-v1";
const ADVISORY_LOCK_KEY = "assessment-qsp-v1-seed";

// ─── Template-level metadata (kept from the original placeholder seed) ─────

const TEMPLATE_NAME = "Quarterly Session Prep v1";
const TEMPLATE_DESCRIPTION =
  "Leadership-team reflection survey used to prepare a company's quarterly strategy session. Covers past-quarter performance ratings, start/stop/continue actions, forward-looking priorities, and Rockefeller Habits methodology effectiveness. Aggregation-only — no tier scoring.";

const INVITATION_SUBJECT = "Please complete your Quarterly Session Prep";

const INVITATION_BODY_MARKDOWN = `Hi {{respondentFirstName}},

{{organizationName}} has invited you to complete the Quarterly Session Prep survey in preparation for the upcoming quarterly strategy session.

Please take a few minutes to reflect on the past quarter and share your thoughts:

{{invitationUrl}}

Your responses will be aggregated and shared with your facilitator to prepare the session.`;

// ─── Scale constant (used by every SLIDER_LIKERT question) ───────────────

const SLIDER_SCALE = {
  min: 1,
  max: 10,
  step: 1,
  anchorMin: "",
  anchorMax: "",
} as const;

// ─── Aggregation-only scoring config (single neutral tier) ────────────────
//
// The real Esperto QSP v1 report is a pure aggregation — it shows each rating
// plus a Mean across the leadership team. There are NO tier labels, NO
// recommendation messages, and NO pass/fail threshold anywhere in the source.
// We use a single covering tier and passThreshold: 0 to satisfy the engine's
// contract while carrying no semantic scoring.

const SCORING_CONFIG = {
  tierMetric: "overallAvg" as const,
  passThreshold: 0,
  tiers: [
    {
      minMetric: 1,
      maxMetric: 10,
      label: "Submitted",
      message:
        "Thank you — your responses have been recorded and shared with your facilitator to prepare the quarterly session.",
    },
  ],
};

// ─── Section payload type ─────────────────────────────────────────────────

interface SectionPayload {
  stableKey: string;
  sortOrder: number;
  name: string;
  description?: string;
}

// ─── Question payload types ───────────────────────────────────────────────

interface SliderLikertPayload {
  stableKey: string;
  sortOrder: number;
  type: "SLIDER_LIKERT";
  label: string;
  sectionStableKey: string;
  isRequired: boolean;
  scale: typeof SLIDER_SCALE;
}

interface NumberPayload {
  stableKey: string;
  sortOrder: number;
  type: "NUMBER";
  label: string;
  sectionStableKey: string;
  isRequired: boolean;
}

interface TextPayload {
  stableKey: string;
  sortOrder: number;
  type: "TEXT";
  label: string;
  sectionStableKey: string;
  isRequired: boolean;
}

type QuestionPayload = SliderLikertPayload | NumberPayload | TextPayload;

// ─── Content builder ──────────────────────────────────────────────────────

export interface QspV1Content extends Omit<SeedContent, "sections" | "questions" | "scoringConfig"> {
  sections: SectionPayload[];
  questions: QuestionPayload[];
  scoringConfig: typeof SCORING_CONFIG;
}

export function buildQspV1Content(): QspV1Content {
  const sections: SectionPayload[] = [
    {
      stableKey: "S1_welcome",
      sortOrder: 1,
      name: "Welcome",
      description:
        "Welcome to the Quarterly Session Preparation Survey — This survey is in preparation of the Company's Quarterly Strategy session. We ask you to look back on what worked, what didn't work and what the focus should be in the next quarter.",
    },
    {
      stableKey: "S2_rating",
      sortOrder: 2,
      name: "Rating the Past Quarter",
      description:
        "We've asked the leadership team what their view is on the organization's performance in the last quarter.",
    },
    {
      stableKey: "S3_quarter_grid",
      sortOrder: 3,
      name: "With the past quarter in mind",
      description:
        "With this quarter in mind, please rate the following items:",
    },
    {
      stableKey: "S4_leadership_core_values",
      sortOrder: 4,
      name: "Leadership Team Priorities & Core Values",
      description:
        "Your view on the results of the past quarter leadership team priorities and core-values role-model stories.",
    },
    {
      stableKey: "S5_start_stop_continue",
      sortOrder: 5,
      name: "Start / Stop / Continue (Company & Department)",
      description:
        "Six free-text lists. Company-level questions cover activities to start, stop, and continue at the company level. Department-level questions are optional.",
    },
    {
      stableKey: "S6_challenges",
      sortOrder: 6,
      name: "Challenges, Opportunities & Priorities Ahead",
      description:
        "Forward-looking free-text questions about the company's biggest challenge, opportunity, and the respondent's priorities for the quarter ahead.",
    },
    {
      stableKey: "S7_rockefeller",
      sortOrder: 7,
      name: "Rockefeller Habits / Scaling Up Methodology",
      description:
        "How the Rockefeller Habits / Scaling Up methodology is serving the team, what works well, and what could be improved.",
    },
    {
      stableKey: "S8_closing",
      sortOrder: 8,
      name: "Closing Remarks",
      description:
        "Any further remarks the leadership team wanted to share.",
    },
  ];

  const questions: QuestionPayload[] = [
    // ── S2: Rating the Past Quarter ──────────────────────────────────────
    {
      stableKey: "S2_Q1_overall_rating",
      sortOrder: 1,
      type: "NUMBER",
      label:
        "How would you rate the overall performance of the company in the quarter we are about to close (this quarter)? (1-10)",
      sectionStableKey: "S2_rating",
      isRequired: true,
    },
    {
      stableKey: "S2_Q2_rating_explanation",
      sortOrder: 2,
      type: "TEXT",
      label: "Please explain your rating",
      sectionStableKey: "S2_rating",
      isRequired: true,
    },

    // ── S3: With the past quarter in mind (6-item slider grid) ───────────
    {
      stableKey: "S3_Q1_success_quarterly_goals",
      sortOrder: 3,
      type: "SLIDER_LIKERT",
      label: "Success in reaching the quarterly goals (priorities)",
      sectionStableKey: "S3_quarter_grid",
      isRequired: true,
      scale: SLIDER_SCALE,
    },
    {
      stableKey: "S3_Q2_leadership_team_functioning",
      sortOrder: 4,
      type: "SLIDER_LIKERT",
      label: "The functioning of the leadership team",
      sectionStableKey: "S3_quarter_grid",
      isRequired: true,
      scale: SLIDER_SCALE,
    },
    {
      stableKey: "S3_Q3_core_values_lived",
      sortOrder: 5,
      type: "SLIDER_LIKERT",
      label: "The way core values of the company have been lived",
      sectionStableKey: "S3_quarter_grid",
      isRequired: true,
      scale: SLIDER_SCALE,
    },
    {
      stableKey: "S3_Q4_overall_atmosphere",
      sortOrder: 6,
      type: "SLIDER_LIKERT",
      label: "The overall atmosphere within the organization",
      sectionStableKey: "S3_quarter_grid",
      isRequired: true,
      scale: SLIDER_SCALE,
    },
    {
      stableKey: "S3_Q5_your_performance",
      sortOrder: 7,
      type: "SLIDER_LIKERT",
      label: "The way you have performed",
      sectionStableKey: "S3_quarter_grid",
      isRequired: true,
      scale: SLIDER_SCALE,
    },
    {
      stableKey: "S3_Q6_pride_in_company",
      sortOrder: 8,
      type: "SLIDER_LIKERT",
      label: "How proud you are of the company",
      sectionStableKey: "S3_quarter_grid",
      isRequired: true,
      scale: SLIDER_SCALE,
    },

    // ── S4: Leadership Team Priorities & Core Values ─────────────────────
    {
      stableKey: "S4_Q1_leadership_priorities_view",
      sortOrder: 9,
      type: "TEXT",
      label:
        "What is your view on the results of the leadership team priorities and results in this quarter?",
      sectionStableKey: "S4_leadership_core_values",
      isRequired: true,
    },
    // Three separate TEXT boxes for the core-values role-model prompt
    // (the Esperto survey form shows 3 stacked text boxes under one heading;
    // the output report renders 3 bullets per respondent on the role-model page).
    {
      stableKey: "S4_core_values_role_model_1",
      sortOrder: 10,
      type: "TEXT",
      label:
        "Which employees do you believe have been role models in living the core values? Why? Share the stories.",
      sectionStableKey: "S4_leadership_core_values",
      isRequired: false,
    },
    {
      stableKey: "S4_core_values_role_model_2",
      sortOrder: 11,
      type: "TEXT",
      label:
        "Which employees do you believe have been role models in living the core values? Why? Share the stories.",
      sectionStableKey: "S4_leadership_core_values",
      isRequired: false,
    },
    {
      stableKey: "S4_core_values_role_model_3",
      sortOrder: 12,
      type: "TEXT",
      label:
        "Which employees do you believe have been role models in living the core values? Why? Share the stories.",
      sectionStableKey: "S4_leadership_core_values",
      isRequired: false,
    },

    // ── S5: Start / Stop / Continue ──────────────────────────────────────
    // Company-level: required (no asterisk AND no "(Optional)" tag in source;
    // inferred required by contrast with the explicitly-optional dept questions).
    // Department-level: explicitly "(Optional)" in the survey form.
    {
      stableKey: "S5_Q1_company_start",
      sortOrder: 13,
      type: "TEXT",
      label:
        "Please list the activities which you feel that the company should start doing next quarter",
      sectionStableKey: "S5_start_stop_continue",
      isRequired: true,
    },
    {
      stableKey: "S5_Q2_department_start",
      sortOrder: 14,
      type: "TEXT",
      label:
        "Please list the activities which you feel that your department should start doing next quarter (Optional)",
      sectionStableKey: "S5_start_stop_continue",
      isRequired: false,
    },
    {
      stableKey: "S5_Q3_company_stop",
      sortOrder: 15,
      type: "TEXT",
      label:
        "Please list the activities which you feel that the company should stop doing next quarter",
      sectionStableKey: "S5_start_stop_continue",
      isRequired: true,
    },
    {
      stableKey: "S5_Q4_department_stop",
      sortOrder: 16,
      type: "TEXT",
      label:
        "Please list the activities which you feel that your department should stop doing next quarter (Optional)",
      sectionStableKey: "S5_start_stop_continue",
      isRequired: false,
    },
    {
      stableKey: "S5_Q5_company_continue",
      sortOrder: 17,
      type: "TEXT",
      label:
        "Please list the activities which you feel that the company should continue doing next quarter",
      sectionStableKey: "S5_start_stop_continue",
      isRequired: true,
    },
    {
      stableKey: "S5_Q6_department_continue",
      sortOrder: 18,
      type: "TEXT",
      label:
        "And finally list the activities which you feel that your department should continue doing next quarter (Optional)",
      sectionStableKey: "S5_start_stop_continue",
      isRequired: false,
    },

    // ── S6: Challenges, Opportunities & Priorities Ahead ─────────────────
    {
      stableKey: "S6_Q1_biggest_challenge",
      sortOrder: 19,
      type: "TEXT",
      label: "What is in your view the company's biggest challenge right now?",
      sectionStableKey: "S6_challenges",
      isRequired: true,
    },
    {
      stableKey: "S6_Q2_why_biggest_challenge",
      sortOrder: 20,
      type: "TEXT",
      label: "Why is this the biggest challenge?",
      sectionStableKey: "S6_challenges",
      isRequired: true,
    },
    {
      stableKey: "S6_Q3_biggest_opportunity",
      sortOrder: 21,
      type: "TEXT",
      label:
        "What is in your view the company's biggest opportunity right now?",
      sectionStableKey: "S6_challenges",
      isRequired: true,
    },
    {
      stableKey: "S6_Q4_biggest_constraint",
      sortOrder: 22,
      type: "TEXT",
      label:
        "What is the biggest constraint now to go after this opportunity?",
      sectionStableKey: "S6_challenges",
      isRequired: true,
    },
    {
      stableKey: "S6_Q5_priorities_quarter_ahead",
      sortOrder: 23,
      type: "TEXT",
      label: "What are your priorities for the quarter ahead?",
      sectionStableKey: "S6_challenges",
      isRequired: true,
    },
    {
      stableKey: "S6_Q6_definition_of_completion",
      sortOrder: 24,
      type: "TEXT",
      label: "What is your definition of completion?",
      sectionStableKey: "S6_challenges",
      isRequired: true,
    },

    // ── S7: Rockefeller Habits / Scaling Up Methodology ──────────────────
    {
      stableKey: "S7_Q1_methodology_serving_slider",
      sortOrder: 25,
      type: "SLIDER_LIKERT",
      label:
        "How is Rockefeller Habits/Scaling Up methodology now serving the team and you in scaling?",
      sectionStableKey: "S7_rockefeller",
      isRequired: true,
      scale: SLIDER_SCALE,
    },
    {
      stableKey: "S7_Q2_what_works_well",
      sortOrder: 26,
      type: "TEXT",
      label: "What works well?",
      sectionStableKey: "S7_rockefeller",
      isRequired: true,
    },
    {
      stableKey: "S7_Q3_methodology_improvements",
      sortOrder: 27,
      type: "TEXT",
      label:
        "What could or should be improved in the Rockefeller Habits/Scaling Up methodology implementation?",
      sectionStableKey: "S7_rockefeller",
      isRequired: true,
    },

    // ── S8: Closing Remarks ───────────────────────────────────────────────
    {
      stableKey: "S8_Q1_closing_remarks",
      sortOrder: 28,
      type: "TEXT",
      label:
        "Any, remarks, thoughts, concerns or ideas for the upcoming Quarterly session?",
      sectionStableKey: "S8_closing",
      isRequired: false,
    },
  ];

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
          "Default access group seeded with QSP v1. " +
          "Admins add certified coaches here to grant template access.",
        createdBy: systemUserId,
      },
      select: { id: true },
    });
    groupId = created.id;
  } else {
    if (existingGroup.deletedAt !== null) {
      throw new Error(
        `[seed-qsp-v1-assessment] AccessGroup "${groupName}" exists ` +
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
  const content = buildQspV1Content();

  const result: SeedResult = await db.$transaction(async (tx) => {
    const lockRows = await tx.$queryRawUnsafe<Array<{ acquired: boolean }>>(
      `SELECT pg_try_advisory_xact_lock(hashtext('${ADVISORY_LOCK_KEY}')) AS acquired`
    );
    const acquired = lockRows[0]?.acquired ?? false;
    if (!acquired) {
      throw new Error(
        `[seed-qsp-v1-assessment] Could not acquire advisory lock ` +
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

    return seedResult;
  }, {
    maxWait: 30_000,
    timeout: 60_000,
  });

  console.log(
    JSON.stringify({
      seed: "qsp-v1-assessment",
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

// ─── Backwards-compatible exports ────────────────────────────────────────
//
// scoring.test.ts imports buildTemplateContent from this module (the old
// export name). Keep it as an alias so that test compiles without a
// separate PR.
export const buildTemplateContent = buildQspV1Content;

// ─── Backwards-compatible hash export ────────────────────────────────────
//
// scaling-up-full.test.ts and qsp-seeds.test.ts (pre-refactor) import
// computeContentHash from this module as a utility for cross-seed hash
// uniqueness checks. Re-export the shared helper under the old name so
// those tests keep compiling without a separate PR.
export { computeTemplateContentHash as computeContentHash } from "../src/lib/assessments/template-content-hash";

// Only run when executed directly (not when imported by tests).
if (require.main === module) {
  main()
    .catch((err) => {
      console.error("[seed-qsp-v1-assessment] FAILED:", err);
      process.exit(1);
    })
    .finally(async () => {
      await db.$disconnect();
    });
}
