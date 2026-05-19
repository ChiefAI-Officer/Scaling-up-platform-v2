/**
 * Seed: Rockefeller Habits Checklist Assessment Template (v1)
 *
 * Creates an AssessmentTemplate (alias "RockHabits") plus its immutable v1
 * AssessmentTemplateVersion (language "enUS") with 10 sections and 40
 * SLIDER_LIKERT questions.
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
 * statement acquires `pg_advisory_xact_lock(hashtext('assessment-rockefeller-v1-seed'))`.
 * That serializes concurrent prod seed attempts so two callers can't race the
 * create.
 *
 * Run: npx tsx prisma/seed-rockefeller-assessment.ts
 */

import { PrismaClient } from "@prisma/client";
import { createHash } from "crypto";

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
  questions: string[];
}

const SECTIONS: SectionDef[] = [
  {
    name: "The executive team is healthy and aligned.",
    questions: [
      "Team members understand each other's differences, priorities, and styles.",
      "The team meets frequently (weekly is best) for strategic thinking.",
      "The team participates in ongoing executive education (monthly recommended).",
      "The team is able to engage in constructive debates and all members feel comfortable participating.",
    ],
  },
  {
    name: "Everyone is aligned with the #1 thing that needs to be accomplished this quarter to move the company forward.",
    questions: [
      "The Critical Number is identified to move the company ahead this quarter.",
      "3-5 Priorities (Rocks) that support the Critical Number are identified and ranked for the quarter.",
      "A Quarterly Theme and Celebration/Reward are announced to all employees that bring the Critical Number to life.",
      "Quarterly Theme/Critical Number posted throughout the company and employees are aware of the progress each week.",
    ],
  },
  {
    name: "Communication rhythm is established and information moves through organization accurately and quickly.",
    questions: [
      "All employees are in a daily huddle that lasts less than 15 minutes.",
      "All teams have a weekly meeting.",
      "The executive and middle managers meet for a day of learning, resolving big issues, and DNA transfer each month.",
      "Quarterly and annually, the executive and middle managers meet offsite to work on the 4 Decisions.",
    ],
  },
  {
    name: "Every facet of the organization has a person assigned with accountability for ensuring goals are met.",
    questions: [
      "The Function Accountability Chart (FACe) is completed (right person, doing the right things, right).",
      "Financial statements have a person assigned to each line item.",
      "Each of the 4-9 processes on the Process Accountability Chart (PACe) has someone that is accountable for them.",
      "Each 3-5 year Key Thrust/Capability has a corresponding expert on the Advisory Board if internal expertise doesn't exist.",
    ],
  },
  {
    name: "Ongoing employee input is collected to identify obstacles and opportunities.",
    questions: [
      "All executives (and middle managers) have a Start/Stop/Keep conversation with at least one employee weekly.",
      "The insights from employee conversations are shared at the weekly executive team meeting.",
      "Employee input about obstacles and opportunities is being collected weekly.",
      "A mid-management team is responsible for the process of closing the loop on all obstacles and opportunities.",
    ],
  },
  {
    name: "Reporting and analysis of customer feedback data is as frequent and accurate as financial data.",
    questions: [
      "All executives (and middle managers) have a 4Q conversation with at least one end user weekly.",
      "The insights from customer conversations are shared at the weekly executive team meeting.",
      "All employees are involved in collecting customer data.",
      "A mid-management team is responsible for the process of closing the loop on all customer feedback.",
    ],
  },
  {
    name: "Core Values and Purpose are 'alive' in the organization.",
    questions: [
      "Core Values are discovered, Purpose is articulated, and both are known by all employees.",
      "All executives and middle managers refer back to the Core Values and Purpose when giving praise or reprimands.",
      "HR processes and activities align with the Core Values and Purpose (hiring, orientation, appraisal, recognition, etc.).",
      "Actions are identified and implemented each quarter to strengthen the Core Values and Purpose in the organization.",
    ],
  },
  {
    name: "Employees can articulate the following key components of the company's strategy accurately.",
    questions: [
      "Big Hairy Audacious Goal (BHAG) – Progress is tracked and visible.",
      "Core Customer(s) – Their profile in 25 words or less.",
      "3 Brand Promises – And the corresponding Brand Promise KPIs reported on weekly.",
      "Elevator Pitch – A compelling response to the question 'What does your company do?'",
    ],
  },
  {
    name: "All employees can answer quantitatively whether they had a good day or week (Column 7 of the One-Page Strategic Plan).",
    questions: [
      "1 or 2 Key Performance Indicators (KPIs) are reported on weekly for each role/person.",
      "Each employee has 1 Critical Number that aligns with the company's Critical Number for the quarter (clear line of sight).",
      "Each individual/team has 3-5 Quarterly Priorities/Rocks that align with those of the company.",
      "All executives and middle managers have a coach (or peer coach) holding them accountable to behavior changes.",
    ],
  },
  {
    name: "The company's plans and performance are visible to everyone.",
    questions: [
      "A \"situation room\" is established for weekly meetings (physical or virtual).",
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
    anchorMin: "Not true";
    anchorMax: "Completely true";
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
          anchorMin: "Not true",
          anchorMax: "Completely true",
        },
      });
    });
  });

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

// ─── System user resolution (v7.6 — Round 3 M-4) ─────────────────────────
//
// AccessGroup.createdBy, AccessGroupCoach.addedBy, AccessGroupTemplate.addedBy
// are FKs to User.id. The literal string "system-seed" is NOT a valid User.id
// and would fail the FK constraint. The post-deploy gate
// (verify-assessment-foundation.ts) expects this exact canonical email AND
// matches createdBy / addedBy against this exact user, so we MUST NOT fall
// back to first ADMIN (would diverge from the gate).
//
// AssessmentTemplate.createdBy (existing) and AssessmentTemplateVersion.publishedBy
// (existing free-text column) ALSO use this resolved id for traceability.
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

// ─── ensureAccessGroupAndTemplateLink (v7.6 — Round 3 L-2) ───────────────
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
  const { sections, questions } = buildSectionsAndQuestions();

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

    // Long-running interactive transaction; Neon pooler adds latency per query.
    // Default Prisma timeout (5s) is too tight; we set both maxWait + timeout below.

    // v7.6: resolve the canonical system user FIRST. AccessGroup rows
    // (createdBy / addedBy) reference User.id; the post-deploy gate also
    // verifies this exact user, so any divergence (e.g. first-ADMIN fallback)
    // breaks the gate. Same id is used for AssessmentTemplate.createdBy and
    // AssessmentTemplateVersion.publishedBy below.
    const systemUser = await resolveSystemUser(tx);

    // Find existing template (by unique alias).
    const existingTemplate = await tx.assessmentTemplate.findUnique({
      where: { alias: TEMPLATE_ALIAS },
      select: { id: true, createdBy: true },
    });

    if (!existingTemplate) {
      // STATE E — orphan defensive check. The DB FK on
      // AssessmentTemplateVersion.templateId → AssessmentTemplate.id should
      // make this impossible, but we cross-check explicitly: look up any v1
      // row whose template has been deleted/missing. We can't pivot on alias
      // (alias is on the template, not the version), so we instead look for a
      // version pointing at a templateId that no longer exists. This requires
      // a raw query because Prisma can't express "left join finds null".
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
          `[seed-rockefeller-assessment] Found ${orphanedV1s.length} orphaned ` +
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
          publishedAt: new Date(),
          publishedBy: systemUser.id, // v7.6: was "system-seed" literal
        },
        select: { id: true },
      });

      // v7.6: ensure the default access group + group→template link exist.
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
      // STATE F — duplicate v1 rows. Should be impossible (unique
      // (templateId, versionNumber, language)) but defend anyway.
      throw new Error(
        `[seed-rockefeller-assessment] Found ${v1Rows.length} v1/enUS rows ` +
          `for template ${existingTemplate.id}. Database invariant violation: ` +
          `the unique constraint (templateId, versionNumber, language) is broken. ` +
          `Investigate before proceeding.`
      );
    }

    if (v1Rows.length === 0) {
      // STATE D — half-baked heal. Template was created (perhaps by a partial
      // prior run, or admin-side bootstrap) but the v1 version is missing.
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
          publishedAt: new Date(),
          publishedBy: systemUser.id, // v7.6: was "system-seed" literal
        },
        select: { id: true },
      });

      // v7.6: ensure the default access group + group→template link exist.
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
      // STATE B — exact match. Idempotent no-op for the template + version.
      //
      // v7.6 (Round 1 H-3): the access-group seeding STILL runs on B. If a
      // deploy shipped the Rockefeller seed BEFORE this amendment landed
      // (state A pre-amendment), the next run lands in state B (hash matches)
      // and would otherwise skip group linking entirely, leaving "Scaling Up
      // Coaches" unlinked to Rockefeller. The helper is idempotent and cheap,
      // so running it on B is correct.
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

    // STATE C — mismatch. Throw with a friendly message rather than let the
    // immutability trigger reject the update later.
    throw new Error(
      `[seed-rockefeller-assessment] Existing v1/enUS version ` +
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
      seed: "rockefeller-assessment",
      state: result.state,
      templateId: result.templateId,
      versionId: result.versionId,
      contentHash: result.contentHash,
      sectionCount: result.sectionCount,
      questionCount: result.questionCount,
      message:
        result.state === "A"
          ? "Created template + v1."
          : result.state === "B"
            ? "Idempotent no-op — exact match."
            : "Healed missing v1 on existing template.",
    })
  );
}

main()
  .catch((err) => {
    console.error("[seed-rockefeller-assessment] FAILED:", err);
    process.exit(1);
  })
  .finally(async () => {
    await db.$disconnect();
  });
