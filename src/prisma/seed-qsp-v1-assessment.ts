/**
 * Seed: Quarterly Session Prep v1 Assessment Template
 *
 * Creates an AssessmentTemplate (alias "qsp-v1") plus its immutable v1
 * AssessmentTemplateVersion (language "enUS") with 1 section and 6
 * SLIDER_LIKERT questions (scale 1–10).
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
 * statement acquires `pg_advisory_xact_lock(hashtext('assessment-qsp-v1-seed'))`.
 * That serializes concurrent prod seed attempts so two callers can't race the
 * create.
 *
 * Run: npx tsx prisma/seed-qsp-v1-assessment.ts
 */

import { PrismaClient } from "@prisma/client";
import { createHash } from "crypto";

const db = new PrismaClient();

const TEMPLATE_ALIAS = "qsp-v1";
const ADVISORY_LOCK_KEY = "assessment-qsp-v1-seed";

// ─── Verbatim content ─────────────────────────────────────────────────────

const TEMPLATE_NAME = "Quarterly Session Prep v1";
const TEMPLATE_DESCRIPTION =
  "Six-question retrospective covering the key elements of a quarterly CEO/executive session";

const INVITATION_SUBJECT = "Please complete your Quarterly Session Prep";

// ─── Question definitions ─────────────────────────────────────────────────

interface SectionDef {
  name: string;
  description: string;
  questions: Array<{
    label: string;
    helpText: string;
  }>;
}

const SECTIONS: SectionDef[] = [
  {
    name: "Quarterly Retrospective",
    description: "Rate your progress over the past quarter",
    questions: [
      {
        label: "How well did you achieve your quarterly priorities?",
        helpText: "Consider your top 3 priorities for the quarter",
      },
      {
        label: "How effectively did your team execute against the plan?",
        helpText: "Consider team performance and delivery",
      },
      {
        label: "How strong was your cash flow and financial performance?",
        helpText: "Consider revenue, margins, and cash position",
      },
      {
        label: "How well did you serve your customers this quarter?",
        helpText: "Consider NPS, retention, and customer feedback",
      },
      {
        label: "How effectively did you develop your people this quarter?",
        helpText: "Consider hiring, coaching, and team development",
      },
      {
        label:
          "Overall, how would you rate the health of your business this quarter?",
        helpText: "Your holistic view of the business",
      },
    ],
  },
];

const SCORING_CONFIG = {
  tierMetric: "average",
  passThreshold: 7,
  scale: { min: 1, max: 10 },
  tiers: [
    { label: "Strong", minScore: 9, maxScore: null },
    { label: "On Track", minScore: 7, maxScore: 8.99 },
    { label: "Needs Work", minScore: 5, maxScore: 6.99 },
    { label: "At Risk", minScore: 1, maxScore: 4.99 },
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
  helpText: string;
  sectionStableKey: string;
  isRequired: true;
  scale: {
    min: 1;
    max: 10;
    step: 1;
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

    section.questions.forEach((q, qIdx) => {
      const questionNumber = qIdx + 1;
      questionSortOrder += 1;
      questions.push({
        stableKey: `${sectionStableKey}_Q${questionNumber}`,
        sortOrder: questionSortOrder,
        type: "SLIDER_LIKERT",
        label: q.label,
        helpText: q.helpText,
        sectionStableKey,
        isRequired: true,
        scale: {
          min: 1,
          max: 10,
          step: 1,
        },
      });
    });
  });

  return { sections, questions };
}

// ─── Content hash ────────────────────────────────────────────────────────
// Deterministic across runs: build the input object with a fixed key order,
// serialize without whitespace, sha256, hex.
export function computeContentHash(input: {
  questions: QuestionPayload[];
  sections: SectionPayload[];
  scoringConfig: unknown;
  reportConfig: null;
  invitationSubject: string;
  invitationBodyMarkdown: string | null;
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

// ─── Core seed logic (exported for testing) ──────────────────────────────

export interface SeedResult {
  state: "A" | "B" | "C" | "D";
  templateId: string;
  versionId: string;
  sectionCount: number;
  questionCount: number;
  contentHash: string;
}

export async function runSeed(
  client: PrismaClient
): Promise<SeedResult> {
  const { sections, questions } = buildSectionsAndQuestions();

  const contentHash = computeContentHash({
    questions,
    sections,
    scoringConfig: SCORING_CONFIG,
    reportConfig: null,
    invitationSubject: INVITATION_SUBJECT,
    invitationBodyMarkdown: "",
  });

  const result = await client.$transaction(async (tx) => {
    await tx.$executeRawUnsafe(
      `SELECT pg_advisory_xact_lock(hashtext('${ADVISORY_LOCK_KEY}'))`
    );

    const systemUser = await resolveSystemUser(tx);

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
          `[seed-qsp-v1-assessment] Found ${orphanedV1s.length} orphaned ` +
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
          invitationBodyMarkdown: "",
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
          reportConfig: undefined,
          contentHash,
          publishedAt: new Date(),
          publishedBy: systemUser.id,
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
        `[seed-qsp-v1-assessment] Found ${v1Rows.length} v1/enUS rows ` +
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
          publishedAt: new Date(),
          publishedBy: systemUser.id,
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
      // STATE B — exact match. Idempotent no-op.
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

    // STATE C — mismatch.
    throw new Error(
      `[seed-qsp-v1-assessment] Existing v1/enUS version ` +
        `(${existingVersion.id}) has contentHash=${existingVersion.contentHash} ` +
        `which does not match the seed's computed contentHash=${contentHash}. ` +
        `Published assessment versions are immutable. ` +
        `To change v1 content, publish a NEW versionNumber instead of mutating v1. ` +
        `Refusing to silently mutate the immutable published row.`
    );
  }, {
    maxWait: 30_000,
    timeout: 60_000,
  });

  return result;
}

// ─── Main ────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const result = await runSeed(db);

  console.log(
    JSON.stringify({
      seed: "qsp-v1-assessment",
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
