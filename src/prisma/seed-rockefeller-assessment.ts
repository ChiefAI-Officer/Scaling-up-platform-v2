/**
 * Seed: Rockefeller Habits Checklist Assessment Template
 *
 * Creates an AssessmentTemplate (alias "RockHabits") plus a new DRAFT
 * AssessmentTemplateVersion (language "enUS") with 10 sections and 40
 * SLIDER_LIKERT questions via the shared `ensureTemplateVersionContent`
 * helper (version-aware append model).
 *
 * Idempotency model (delegated to helper):
 *   - Latest version hash matches seed hash → no-op.
 *   - Latest version is a DRAFT with different hash → throws unless
 *     `forceSupersedeDraft: true` is set (protects reviewer edits).
 *   - Latest version is published with different hash → appends new DRAFT vN+1.
 *   - No versions yet → creates template + v1 DRAFT.
 *
 * Concurrency: first statement inside the transaction acquires
 * `pg_try_advisory_xact_lock(hashtext('assessment-rockefeller-v1-seed'))`.
 * If the lock is not acquired (another session holds it), the seed logs and
 * exits with code 1.
 *
 * Run: npx tsx prisma/seed-rockefeller-assessment.ts
 */

import { PrismaClient } from "@prisma/client";
import {
  ensureTemplateVersionContent,
  type SeedContent,
} from "../src/lib/assessments/seed-template-version";

const db = new PrismaClient();

const TEMPLATE_ALIAS = "RockHabits";
const ADVISORY_LOCK_KEY = "assessment-rockefeller-v1-seed";

// ─── Verbatim content (Rockefeller Habits Checklist) ─────────────────────

const TEMPLATE_NAME = "Rockefeller Habits Checklist";
const TEMPLATE_DESCRIPTION =
  "A good strategy falls apart if you don't make great Execution Decisions. Use the popular Rockefeller Habits Checklist to improve execution throughout your organization.";

const INVITATION_SUBJECT =
  "You're invited to take the {{templateName}} survey for {{organizationName}}";

const INVITATION_BODY_MARKDOWN = `Hi {{respondentFirstName}},

{{organizationName}} invited you to complete the {{templateName}}. This 40-question checklist takes about 5 minutes. Your responses help your team identify which Rockefeller Habits are in place and where there's room to grow.

Click the link below to begin:

{{invitationUrl}}

Your coach will review the results with you afterward.`;

interface SectionDef {
  name: string;
  description: string;
  questions: string[];
}

// Question labels are verbatim from the xlsx (col A, rows 1–40).
// Section names are verbatim from the xlsx (col C, rows 1/5/9/13/17/21/25/29/33/37).
// Q1_1: no trailing period (xlsx row 1 has none).
// Section 7: straight ASCII double-quotes around "alive" (xlsx cell C25).
const SECTIONS: SectionDef[] = [
  {
    name: "The executive team is healthy and aligned.",
    description:
      "A healthy, aligned leadership team is the foundation for scaling. Rate how well your executive team trusts one another, debates openly, and operates as a genuine team.",
    questions: [
      "Team members understand each other's differences, priorities, and styles",
      "The team meets frequently (weekly is best) for strategic thinking.",
      "The team participates in ongoing executive education (monthly recommended).",
      "The team is able to engage in constructive debates and all members feel comfortable participating.",
    ],
  },
  {
    name: "Everyone is aligned with the #1 thing that needs to be accomplished this quarter to move the company forward.",
    description:
      "Rate how clearly the team is aligned on the single most important priority for this quarter — and whether everyone could actually name it.",
    questions: [
      "The Critical Number is identified to move the company ahead this quarter.",
      "3-5 Priorities (Rocks) that support the Critical Number are identified and ranked for the quarter.",
      "A Quarterly Theme and Celebration/Reward are announced to all employees that bring the Critical Number to life.",
      "Quarterly Theme/Critical Number posted throughout the company and employees are aware of the progress each week.",
    ],
  },
  {
    name: "Communication rhythm is established and information moves through organization accurately and quickly.",
    description:
      "A predictable meeting rhythm keeps information moving quickly. Rate how well your daily, weekly, monthly, and quarterly cadence is working.",
    questions: [
      "All employees are in a daily huddle that lasts less than 15 minutes.",
      "All teams have a weekly meeting.",
      "The executive and middle managers meet for a day of learning, resolving big issues, and DNA transfer each month.",
      "Quarterly and annually, the executive and middle managers meet offsite to work on the 4 Decisions.",
    ],
  },
  {
    name: "Every facet of the organization has a person assigned with accountability for ensuring goals are met.",
    description:
      "Every function and process should have one clear owner. Rate how completely accountability is assigned across the organization.",
    questions: [
      "The Function Accountability Chart (FACe) is completed (right person, doing the right things, right).",
      "Financial statements have a person assigned to each line item.",
      "Each of the 4-9 processes on the Process Accountability Chart (PACe) has someone that is accountable for them.",
      "Each 3-5 year Key Thrust/Capability has a corresponding expert on the Advisory Board if internal expertise doesn't exist.",
    ],
  },
  {
    name: "Ongoing employee input is collected to identify obstacles and opportunities.",
    description:
      "Frontline employees see obstacles and opportunities first. Rate how consistently you collect and act on their input.",
    questions: [
      "All executives (and middle managers) have a Start/Stop/Keep conversation with at least one employee weekly.",
      "The insights from employee conversations are shared at the weekly executive team meeting.",
      "Employee input about obstacles and opportunities is being collected weekly.",
      "A mid-management team is responsible for the process of closing the loop on all obstacles and opportunities.",
    ],
  },
  {
    name: "Reporting and analysis of customer feedback data is as frequent and accurate as financial data.",
    description:
      "Customer insight should be as timely and rigorous as your financials. Rate how well you gather, analyze, and act on customer feedback.",
    questions: [
      "All executives (and middle managers) have a 4Q conversation with at least one end user weekly.",
      "The insights from customer conversations are shared at the weekly executive team meeting.",
      "All employees are involved in collecting customer data.",
      "A mid-management team is responsible for the process of closing the loop on all customer feedback.",
    ],
  },
  {
    name: 'Core Values and Purpose are "alive" in the organization.',
    description:
      "Core Values and Purpose should guide real decisions, not just sit on a wall. Rate how 'alive' they are in day-to-day work.",
    questions: [
      "Core Values are discovered, Purpose is articulated, and both are known by all employees.",
      "All executives and middle managers refer back to the Core Values and Purpose when giving praise or reprimands.",
      "HR processes and activities align with the Core Values and Purpose (hiring, orientation, appraisal, recognition, etc.).",
      "Actions are identified and implemented each quarter to strengthen the Core Values and Purpose in the organization.",
    ],
  },
  {
    name: "Employees can articulate the following key components of the company's strategy accurately.",
    description:
      "Everyone should describe the company's strategy the same way. Rate how clearly the strategy is understood across the team.",
    questions: [
      "Big Hairy Audacious Goal (BHAG) – Progress is tracked and visible.",
      "Core Customer(s) – Their profile in 25 words or less.",
      "3 Brand Promises – And the corresponding Brand Promise KPIs reported on weekly.",
      "Elevator Pitch – A compelling response to the question 'What does your company do?'",
    ],
  },
  {
    name: "All employees can answer quantitatively whether they had a good day or week (Column 7 of the One-Page Strategic Plan).",
    description:
      "People do their best when they know whether they're winning. Rate whether employees can quantitatively tell if they had a good day or week.",
    questions: [
      "1 or 2 Key Performance Indicators (KPIs) are reported on weekly for each role/person.",
      "Each employee has 1 Critical Number that aligns with the company's Critical Number for the quarter (clear line of sight).",
      "Each individual/team has 3-5 Quarterly Priorities/Rocks that align with those of the company.",
      "All executives and middle managers have a coach (or peer coach) holding them accountable to behavior changes.",
    ],
  },
  {
    name: "The company's plans and performance are visible to everyone.",
    description:
      "Visible plans and metrics keep everyone rowing in the same direction. Rate how transparent your plans and performance are to the whole company.",
    questions: [
      'A "situation room" is established for weekly meetings (physical or virtual).',
      "Core Values, Purpose and Priorities are posted throughout the company.",
      "Scoreboards are up everywhere displaying current progress on KPIs and Critical Numbers.",
      "There is a system in place for tracking and managing the cascading Priorities and KPIs.",
    ],
  },
];

const SCORING_CONFIG = {
  tierMetric: "countAchieved",
  passThreshold: 2,
  tiers: [
    {
      minMetric: 0,
      maxMetric: 16,
      label: "Low",
      message: "That is a very low overall score.",
    },
    {
      minMetric: 17,
      maxMetric: 32,
      label: "OK",
      message:
        "You're doing quite okay, and have a lot to improve further upon.",
    },
    {
      minMetric: 33,
      maxMetric: 40,
      label: "Great",
      message: "That is a great overall score.",
    },
  ],
} as const;

// ─── Derived structures ──────────────────────────────────────────────────

interface SectionPayload {
  stableKey: string;
  sortOrder: number;
  name: string;
  description: string;
}

interface QuestionPayload {
  stableKey: string;
  sortOrder: number;
  type: "SLIDER_LIKERT";
  label: string;
  sectionStableKey: string;
  isRequired: true;
  scale: {
    min: 0;
    max: 3;
    step: 1;
    anchorMin: "";
    anchorMax: "";
  };
}

function buildSectionsAndQuestions(): {
  sections: SectionPayload[];
  questions: QuestionPayload[];
} {
  const sections: SectionPayload[] = [];
  const questions: QuestionPayload[] = [];
  let questionSortOrder = 0;

  SECTIONS.forEach((section, idx) => {
    const sectionNumber = idx + 1;
    const sectionStableKey = `S${sectionNumber}`;
    sections.push({
      stableKey: sectionStableKey,
      sortOrder: sectionNumber,
      name: section.name,
      description: section.description,
    });

    section.questions.forEach((label, qIdx) => {
      const questionNumber = qIdx + 1;
      questionSortOrder += 1;
      questions.push({
        stableKey: `Q${sectionNumber}_${questionNumber}`,
        sortOrder: questionSortOrder,
        type: "SLIDER_LIKERT",
        label,
        sectionStableKey,
        isRequired: true,
        scale: {
          min: 0,
          max: 3,
          step: 1,
          anchorMin: "",
          anchorMax: "",
        },
      });
    });
  });

  return { sections, questions };
}

// ─── Public content builder (for tests + cross-file reuse) ───────────────
//
// Returns a SeedContent object compatible with ensureTemplateVersionContent.
// Used by the verbatim guard tests so any accidental content mutation is
// caught before it reaches the DB.
export interface RockefellerContent extends Omit<SeedContent, "sections" | "questions" | "scoringConfig"> {
  sections: SectionPayload[];
  questions: QuestionPayload[];
  scoringConfig: typeof SCORING_CONFIG;
}

export function buildRockefellerContent(): RockefellerContent {
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

// ─── System user resolution ───────────────────────────────────────────────
//
// AccessGroup.createdBy, AccessGroupCoach.addedBy, AccessGroupTemplate.addedBy
// are FKs to User.id. The literal string "system-seed" is NOT a valid User.id
// and would fail the FK constraint. The post-deploy gate
// (verify-assessment-foundation.ts) expects this exact canonical email AND
// matches createdBy / addedBy against this exact user, so we MUST NOT fall
// back to first ADMIN (would diverge from the gate).
const SYSTEM_SEED_EMAIL = "system-seed@scalingup.platform";

async function resolveSystemUser(
  tx: Parameters<Parameters<typeof db.$transaction>[0]>[0]
): Promise<{ id: string }> {
  return tx.user.upsert({
    where: { email: SYSTEM_SEED_EMAIL },
    create: {
      email: SYSTEM_SEED_EMAIL,
      role: "STAFF", // intentionally NOT ADMIN — limits blast radius if leaked
      name: "System Seed",
      // No passwordHash — null means unfillable / no interactive login.
    },
    update: {},
    select: { id: true },
  });
}

// ─── ensureAccessGroupAndTemplateLink ─────────────────────────────────────
//
// Upserts the "Scaling Up Coaches" AccessGroup by name and the
// (group, template) join row. Runs inside the SAME advisory-locked
// transaction as the template upsert, so concurrent seed callers serialize
// behind the lock.
//
// Behavior:
//   - Group missing → create with createdBy = systemUserId.
//   - Group present and active (deletedAt IS NULL) → no-op (idempotent).
//   - Group present and soft-deleted → THROW. Operator must explicitly
//     un-archive before re-seeding.
//   - Join row upserted on (accessGroupId, templateId) with addedBy = systemUserId.
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
          "Default access group seeded with the Rockefeller Habits Checklist. " +
          "Admins add certified coaches here to grant template access.",
        createdBy: systemUserId,
      },
      select: { id: true },
    });
    groupId = created.id;
  } else {
    if (existingGroup.deletedAt !== null) {
      throw new Error(
        `[seed-rockefeller-assessment] AccessGroup "${groupName}" exists ` +
          `but is soft-deleted (deletedAt=${existingGroup.deletedAt.toISOString()}). ` +
          `Refusing to silently un-archive. ` +
          `Operator must un-archive the group via admin UI or set ` +
          `deletedAt = NULL manually before re-seeding.`
      );
    }
    groupId = existingGroup.id;
  }

  // Upsert the (group, template) join row. Idempotent by composite unique.
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

  // Add the default dev coach as a member of the access group so the
  // end-to-end flow works on a fresh DB (coach@example.com is seeded by
  // seed.ts). Skip silently if that Coach row doesn't exist (production DBs
  // won't have the dev coach; real coaches are added via the admin UI).
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
  const content = buildRockefellerContent();

  const result = await db.$transaction(async (tx) => {
    // Try to acquire the advisory lock. pg_try_advisory_xact_lock returns
    // false (not throws) when another session holds the lock, so we check
    // the return value and exit non-zero if we can't acquire.
    const lockRows = await tx.$queryRawUnsafe<Array<{ acquired: boolean }>>(
      `SELECT pg_try_advisory_xact_lock(hashtext('${ADVISORY_LOCK_KEY}')) AS acquired`
    );
    const acquired = lockRows[0]?.acquired ?? false;
    if (!acquired) {
      throw new Error(
        `[seed-rockefeller-assessment] Could not acquire advisory lock ` +
          `"${ADVISORY_LOCK_KEY}" — another seed run is in progress. ` +
          `Try again after the other session completes.`
      );
    }

    // Resolve the canonical system user first. AccessGroup rows
    // (createdBy / addedBy) reference User.id; the post-deploy gate also
    // verifies this exact user, so any divergence (e.g. first-ADMIN fallback)
    // breaks the gate.
    const sys = await resolveSystemUser(tx);

    // Delegate template + version upsert to the shared version-aware helper.
    // The helper handles: create-fresh, no-op on hash match, append-DRAFT-vN+1
    // on published-hash-mismatch, fail-closed on edited unpublished DRAFT.
    const seedResult = await ensureTemplateVersionContent(
      // The helper uses a duck-typed PrismaTx interface; the full Prisma tx
      // client is structurally compatible but TS can't prove it without the
      // intermediate unknown cast.
      tx as unknown as Parameters<typeof ensureTemplateVersionContent>[0],
      sys.id,
      content
    );

    // Always ensure the access group + template link regardless of action,
    // so a deploy that shipped before this amendment gets healed on next run.
    await ensureAccessGroupAndTemplateLink(
      tx,
      seedResult.templateId,
      "Scaling Up Coaches",
      sys.id
    );

    return { ...seedResult };
  }, {
    // Neon pooler adds per-query latency; default 5s timeout is too tight.
    maxWait: 30_000,
    timeout: 60_000,
  });

  console.log(
    JSON.stringify({
      seed: "rockefeller-assessment",
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

// ─── Backwards-compatible alias ───────────────────────────────────────────
//
// scoring-bc-snapshot.test.ts imports buildTemplateContent (the pre-refactor
// export name). Keep this re-export so that test continues to compile without
// requiring a separate PR.
export const buildTemplateContent = buildRockefellerContent;

// Only run when executed directly (not when imported by tests).
if (require.main === module) {
  main()
    .catch((err) => {
      console.error("[seed-rockefeller-assessment] FAILED:", err);
      process.exit(1);
    })
    .finally(async () => {
      await db.$disconnect();
    });
}
