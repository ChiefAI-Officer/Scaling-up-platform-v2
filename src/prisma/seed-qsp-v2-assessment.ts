/**
 * Seed: Quarterly Session Prep v2 Assessment Template
 *
 * Creates an AssessmentTemplate (alias "qsp-v2") plus a new DRAFT
 * AssessmentTemplateVersion (language "enUS") with the REAL Esperto content:
 * 5 parts (sections), 17 questions:
 *   - 1 NUMBER (P1 overall rating)
 *   - 6 SLIDER_LIKERT (5-item P1 matrix + P2 personal check-in)
 *   - 10 TEXT (P1 explain + P1 leadership rocks + 3 P1 core-values boxes +
 *             3 P1 start/stop/continue + P2 explain + 3 P3 + 2 P4 + P5)
 * Aggregation-only scoring (single neutral tier, passThreshold 0).
 *
 * Content is sourced verbatim from adversarially-verified transcription of
 * the 14 Esperto survey screenshots (image9–image22) embedded in
 * "From Jeff/APP_scaling up assessemnt/APP_qtr session prep v2/qtr session prep v2.xlsx"
 * (image1–8 are Add-Campaign wizard + invitation email — skipped).
 * Confirmed against three personal report PDFs + one Group report PDF.
 *
 * Idempotency model (delegated to ensureTemplateVersionContent):
 *   - Latest version hash matches → no-op.
 *   - Latest version is a DRAFT with different hash → throws unless
 *     forceSupersedeDraft: true (protects reviewer edits).
 *   - Latest version is published with different hash → appends new DRAFT vN+1.
 *   - No versions yet → creates template + v1 DRAFT.
 *
 * Concurrency: first statement inside the transaction acquires
 * pg_try_advisory_xact_lock(hashtext('assessment-qsp-v2-seed')).
 * If the lock is not acquired another session holds it → log + exit 1.
 *
 * Run: npx tsx prisma/seed-qsp-v2-assessment.ts
 */

import { PrismaClient } from "@prisma/client";
import { createHash } from "crypto";
import {
  ensureTemplateVersionContent,
  type SeedContent,
  type SeedResult as VersionSeedResult,
} from "../src/lib/assessments/seed-template-version";

const db = new PrismaClient();

const TEMPLATE_ALIAS = "qsp-v2";
const ADVISORY_LOCK_KEY = "assessment-qsp-v2-seed";

// ─── Template-level metadata (kept from original placeholder seed) ────────

const TEMPLATE_NAME = "Quarterly Session Prep v2";
const TEMPLATE_DESCRIPTION =
  "Extended quarterly assessment adding forward-looking priorities to the retrospective";

const INVITATION_SUBJECT = "Please complete your Quarterly Session Prep";

const INVITATION_BODY_MARKDOWN = `Hi {{respondentFirstName}},

{{organizationName}} has invited you to complete the Quarterly Session Prep survey in preparation for the upcoming quarterly strategy session.

Please take a few minutes to reflect on the past quarter and share your thoughts:

{{invitationUrl}}

Your responses will be aggregated and shared with your facilitator to prepare the session.`;

// ─── Scale constant (used by every SLIDER_LIKERT question) ───────────────
//
// Sliders show emoji-only anchors (sad-face low / happy-face high).
// Emoji → empty strings per contract (no scaleLabels).

const SLIDER_SCALE = {
  min: 1,
  max: 10,
  step: 1,
  anchorMin: "",
  anchorMax: "",
} as const;

// ─── Aggregation-only scoring config (single neutral tier) ────────────────
//
// The real Esperto QSP v2 report is a pure aggregation — it shows each rating
// plus a Mean across the leadership team. There are NO tier labels, NO
// recommendation messages, and NO pass/fail threshold anywhere in the reports.
// We use a single covering tier and passThreshold: 0 to satisfy the engine's
// contract while carrying no semantic scoring.

export const SCORING_CONFIG = {
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
} as const;

// ─── Section payload type ─────────────────────────────────────────────────

export interface SectionPayload {
  stableKey: string;
  sortOrder: number;
  name: string;
  description?: string;
  partLabel?: string;
}

// ─── Question payload types ───────────────────────────────────────────────

export interface SliderLikertPayload {
  stableKey: string;
  sortOrder: number;
  type: "SLIDER_LIKERT";
  label: string;
  sectionStableKey: string;
  isRequired: boolean;
  scale: typeof SLIDER_SCALE;
}

export interface NumberPayload {
  stableKey: string;
  sortOrder: number;
  type: "NUMBER";
  label: string;
  sectionStableKey: string;
  isRequired: boolean;
}

export interface TextPayload {
  stableKey: string;
  sortOrder: number;
  type: "TEXT";
  label: string;
  sectionStableKey: string;
  isRequired: boolean;
}

export type QuestionPayload = SliderLikertPayload | NumberPayload | TextPayload;

// ─── Content interface ────────────────────────────────────────────────────

export interface QspV2Content extends Omit<SeedContent, "sections" | "questions" | "scoringConfig"> {
  sections: SectionPayload[];
  questions: QuestionPayload[];
  scoringConfig: typeof SCORING_CONFIG;
}

// ─── Content builder ──────────────────────────────────────────────────────
//
// Returns the REAL Esperto content transcribed verbatim from image9–22.
// All 17 questions are stored; the scoring engine filters to SLIDER_LIKERT
// internally (TEXT/NUMBER are pass-through, never scored).

export function buildQspV2Content(): QspV2Content {
  const sections: SectionPayload[] = [
    {
      stableKey: "P1_retrospective",
      sortOrder: 1,
      name: "PART 1: The Retrospective",
      description: "Looking back at the past 90 days.",
    },
    {
      stableKey: "P2_personal_checkin",
      sortOrder: 2,
      name: "PART 2: The Personal Check-in",
      description: "Assessing personal alignment and energy.",
    },
    {
      stableKey: "P3_growth_challenge",
      sortOrder: 3,
      name: "PART 3: The Growth Challenge",
      description: "Identifying the biggest roadblocks.",
    },
    {
      stableKey: "P4_focus",
      sortOrder: 4,
      name: "PART 4: The Focus for Next Quarter",
      description: "Setting the stage for execution.",
    },
    {
      stableKey: "P5_closing",
      sortOrder: 5,
      name: "PART 5: Closing",
      description: "Final reflections before you wrap up.",
    },
  ];

  const questions: QuestionPayload[] = [
    // ── P1: The Retrospective ────────────────────────────────────────────

    // image10: numeric Rating field (text input, label "Rating *")
    {
      stableKey: "P1_overall_rating",
      sortOrder: 1,
      type: "NUMBER",
      label: "How would you rate the past Quarter? (1-10)",
      sectionStableKey: "P1_retrospective",
      isRequired: true,
    },

    // image11: free-text explain
    {
      stableKey: "P1_rating_explanation",
      sortOrder: 2,
      type: "TEXT",
      label: "Please explain your rating.",
      sectionStableKey: "P1_retrospective",
      isRequired: true,
    },

    // image12: 5-item 1-10 slider matrix (CONFIRMED: no "The way you have performed")
    {
      stableKey: "P1_rate_success_rocks",
      sortOrder: 3,
      type: "SLIDER_LIKERT",
      label: "Success in reaching the quarterly goals (rocks)",
      sectionStableKey: "P1_retrospective",
      isRequired: true,
      scale: SLIDER_SCALE,
    },
    {
      stableKey: "P1_rate_leadership_team",
      sortOrder: 4,
      type: "SLIDER_LIKERT",
      label: "The functioning of the leadership team",
      sectionStableKey: "P1_retrospective",
      isRequired: true,
      scale: SLIDER_SCALE,
    },
    {
      stableKey: "P1_rate_core_values",
      sortOrder: 5,
      type: "SLIDER_LIKERT",
      label: "The way core values of the company have been lived",
      sectionStableKey: "P1_retrospective",
      isRequired: true,
      scale: SLIDER_SCALE,
    },
    {
      stableKey: "P1_rate_atmosphere",
      sortOrder: 6,
      type: "SLIDER_LIKERT",
      label: "The overall atmosphere within the organization",
      sectionStableKey: "P1_retrospective",
      isRequired: true,
      scale: SLIDER_SCALE,
    },
    {
      stableKey: "P1_rate_pride",
      sortOrder: 7,
      type: "SLIDER_LIKERT",
      label: "How proud you are of the company",
      sectionStableKey: "P1_retrospective",
      isRequired: true,
      scale: SLIDER_SCALE,
    },

    // image13: leadership team rocks view
    {
      stableKey: "P1_leadership_rocks_view",
      sortOrder: 8,
      type: "TEXT",
      label: "What is your view on the results of past quarters' leadership team rocks?",
      sectionStableKey: "P1_retrospective",
      isRequired: true,
    },

    // image14: 3 TEXT boxes for core-values stories (no asterisk = optional)
    {
      stableKey: "P1_core_values_story_1",
      sortOrder: 9,
      type: "TEXT",
      label: "Which employees have demonstrated that they live the core values? Why? Share the stories.",
      sectionStableKey: "P1_retrospective",
      isRequired: false,
    },
    {
      stableKey: "P1_core_values_story_2",
      sortOrder: 10,
      type: "TEXT",
      label: "Which employees have demonstrated that they live the core values? Why? Share the stories.",
      sectionStableKey: "P1_retrospective",
      isRequired: false,
    },
    {
      stableKey: "P1_core_values_story_3",
      sortOrder: 11,
      type: "TEXT",
      label: "Which employees have demonstrated that they live the core values? Why? Share the stories.",
      sectionStableKey: "P1_retrospective",
      isRequired: false,
    },

    // image15: company START (no asterisk = not required per verdict)
    {
      stableKey: "P1_company_start",
      sortOrder: 12,
      type: "TEXT",
      label: "Please list the activities which you feel that the company should START doing next quarter.",
      sectionStableKey: "P1_retrospective",
      isRequired: false,
    },

    // image16: company STOP (no asterisk = not required per verdict)
    {
      stableKey: "P1_company_stop",
      sortOrder: 13,
      type: "TEXT",
      label: "Please list the activities which you feel that the company should STOP doing next quarter.",
      sectionStableKey: "P1_retrospective",
      isRequired: false,
    },

    // image17: company CONTINUE (no asterisk = not required per verdict)
    {
      stableKey: "P1_company_continue",
      sortOrder: 14,
      type: "TEXT",
      label: "Please list the activities which you feel that the company should CONTINUE doing next quarter.",
      sectionStableKey: "P1_retrospective",
      isRequired: false,
    },

    // ── P2: The Personal Check-in (image18) ─────────────────────────────

    {
      stableKey: "P2_checkin_slider",
      sortOrder: 15,
      type: "SLIDER_LIKERT",
      label: "How aligned and energized do you feel regarding your current role and responsibilities?",
      sectionStableKey: "P2_personal_checkin",
      isRequired: true,
      scale: SLIDER_SCALE,
    },
    {
      stableKey: "P2_checkin_explain",
      sortOrder: 16,
      type: "TEXT",
      label: "Please explain your rating. How are you truly feeling about your work right now?",
      sectionStableKey: "P2_personal_checkin",
      isRequired: true,
    },

    // ── P3: The Growth Challenge (image19) ───────────────────────────────

    {
      stableKey: "P3_growth_challenge",
      sortOrder: 17,
      type: "TEXT",
      label: "What is in your view the company's biggest growth challenge right now?",
      sectionStableKey: "P3_growth_challenge",
      isRequired: true,
    },
    {
      stableKey: "P3_why_challenge",
      sortOrder: 18,
      type: "TEXT",
      label: "Why is this the biggest challenge?",
      sectionStableKey: "P3_growth_challenge",
      isRequired: true,
    },
    {
      stableKey: "P3_solution",
      sortOrder: 19,
      type: "TEXT",
      label: "Where do you believe the solution lies?",
      sectionStableKey: "P3_growth_challenge",
      isRequired: true,
    },

    // ── P4: The Focus for Next Quarter (image20) ─────────────────────────

    {
      stableKey: "P4_critical_number",
      sortOrder: 20,
      type: "TEXT",
      label: "Critical Number Identification: What is the ONE area of the business where significant improvement would have the greatest impact next quarter?",
      sectionStableKey: "P4_focus",
      isRequired: false,
    },
    {
      stableKey: "P4_top_priorities",
      sortOrder: 21,
      type: "TEXT",
      label: "Top Priorities: What specific improved outcome or priority would drive breakthrough results for this Critical Number?",
      sectionStableKey: "P4_focus",
      isRequired: false,
    },

    // ── P5: Closing (image21) ─────────────────────────────────────────────

    {
      stableKey: "P5_closing",
      sortOrder: 22,
      type: "TEXT",
      label: "Any other remarks, thoughts, concerns, or ideas for the upcoming Quarterly session?",
      sectionStableKey: "P5_closing",
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

// ─── BC-compat: legacy exports used by existing test suites ──────────────
//
// qsp-seeds.test.ts imports runSeed + computeContentHash from this file.
// scoring.test.ts imports buildTemplateContent from this file (expects the
// same shape: { sections, questions, scoringConfig }).
// Keep all three to avoid breaking existing tests.

/**
 * BC-compat alias — scoring.test.ts imports this as `buildTemplateContent`.
 * Returns the full content including all question types (not just SLIDER_LIKERT).
 * The scoring engine filters internally.
 */
export const buildTemplateContent = buildQspV2Content;

export function computeContentHash(input: {
  questions: unknown[];
  sections: unknown[];
  scoringConfig: unknown;
  reportConfig: null;
  invitationSubject: string;
  invitationBodyMarkdown: string | null;
}): string {
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

export interface SeedResult {
  state: "A" | "B" | "C" | "D";
  templateId: string;
  versionId: string;
  versionNumber: number;
  sectionCount: number;
  questionCount: number;
  contentHash: string;
}

export async function runSeed(
  client: PrismaClient,
  opts: { force?: boolean } = {}
): Promise<SeedResult> {
  const content = buildQspV2Content();

  const result = await client.$transaction(async (tx) => {
    const lockRows = await tx.$queryRawUnsafe<Array<{ acquired: boolean }>>(
      `SELECT pg_try_advisory_xact_lock(hashtext('${ADVISORY_LOCK_KEY}')) AS acquired`
    );
    const acquired = lockRows[0]?.acquired ?? false;
    if (!acquired) {
      throw new Error(
        `[seed-qsp-v2-assessment] Could not acquire advisory lock ` +
          `"${ADVISORY_LOCK_KEY}" — another seed run is in progress. ` +
          `Try again after the other session completes.`
      );
    }

    const sys = await tx.user.upsert({
      where: { email: "system-seed@scalingup.platform" },
      create: {
        email: "system-seed@scalingup.platform",
        role: "STAFF",
        name: "System Seed",
      },
      update: {},
      select: { id: true },
    });

    const seedResult: VersionSeedResult = await ensureTemplateVersionContent(
      tx as unknown as Parameters<typeof ensureTemplateVersionContent>[0],
      sys.id,
      content,
      { forceSupersedeDraft: opts.force ?? false }
    );

    await ensureAccessGroupAndTemplateLink(
      tx as unknown as Parameters<typeof ensureAccessGroupAndTemplateLink>[0],
      seedResult.templateId,
      "Scaling Up Coaches",
      sys.id
    );

    return {
      state: seedResult.action === "created" ? ("A" as const) : ("B" as const),
      templateId: seedResult.templateId,
      versionId: seedResult.versionId,
      versionNumber: seedResult.versionNumber,
      sectionCount: content.sections.length,
      questionCount: content.questions.length,
      contentHash: seedResult.contentHash,
    };
  }, {
    maxWait: 30_000,
    timeout: 60_000,
  });

  return result;
}

// ─── System user helpers ──────────────────────────────────────────────────

type Tx = Parameters<Parameters<PrismaClient["$transaction"]>[0]>[0];

async function ensureAccessGroupAndTemplateLink(
  tx: Tx,
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
          "Default access group seeded with QSP v2. " +
          "Admins add certified coaches here to grant template access.",
        createdBy: systemUserId,
      },
      select: { id: true },
    });
    groupId = created.id;
  } else {
    if (existingGroup.deletedAt !== null) {
      throw new Error(
        `[seed-qsp-v2-assessment] AccessGroup "${groupName}" exists ` +
          `but is soft-deleted (deletedAt=${existingGroup.deletedAt.toISOString()}). ` +
          `Refusing to silently un-archive.`
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
  // Fail-closed by default. Operators must explicitly opt in to superseding a
  // divergent unpublished DRAFT (e.g. reviewer edits) via QSP_V2_SEED_FORCE=1.
  const force = process.env.QSP_V2_SEED_FORCE === "1";
  if (force) {
    console.warn(
      "[seed-qsp-v2-assessment] QSP_V2_SEED_FORCE=1 — a divergent unpublished " +
        "DRAFT version (if any) WILL be superseded by a new DRAFT. Reviewer edits " +
        "on that draft may be lost. Proceeding with forceSupersedeDraft: true."
    );
  }

  const result = await runSeed(db, { force });

  console.log(
    JSON.stringify({
      seed: "qsp-v2-assessment",
      state: result.state,
      templateId: result.templateId,
      versionId: result.versionId,
      versionNumber: result.versionNumber,
      contentHash: result.contentHash,
      sectionCount: result.sectionCount,
      questionCount: result.questionCount,
      message:
        result.state === "A"
          ? "Created template + version."
          : "Idempotent no-op — exact match.",
    })
  );
}

// Only run when executed directly (not when imported by tests).
if (require.main === module) {
  main()
    .catch((err) => {
      console.error("[seed-qsp-v2-assessment] FAILED:", err);
      process.exit(1);
    })
    .finally(async () => {
      await db.$disconnect();
    });
}
