/**
 * Assessment v7.6 — Admin assessment template list + create.
 *
 * GET — Admin-only list of all non-deleted templates (bypasses INTERSECTION RBAC).
 * POST — Admin-only create: metadata + first AssessmentTemplateVersion (draft, publishedAt=null).
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { getApiActor, isPrivilegedRole } from "@/lib/auth/authorization";
import { logAudit } from "@/lib/audit";
import { RateLimits, withRateLimit } from "@/lib/rate-limit";
import { computeTemplateContentHash } from "@/lib/assessments/template-content-hash";
import { isTemplateCreationSimplifiedEnabled } from "@/lib/assessments/wave-template-creation-flags";
import {
  generateTemplateInternalId,
  templateInternalIdForAttempt,
} from "@/lib/assessments/template-internal-id";
import {
  buildInvitedWelcomeConfig,
  GENERIC_INVITED_WELCOME_CONFIG,
  invitedWelcomeAuthoringInputSchema,
  type InvitedWelcomeConfigV1,
} from "@/lib/assessments/invited-welcome-config";
import { isAdminOwnedAssessmentPresentationEnabled } from "@/lib/assessments/wave-admin-owned-assessment-presentation-flags";

interface AdminTemplateSummary {
  id: string;
  name: string;
  alias: string;
  aggregationMode: "FULL_VISIBILITY" | "CEO_ONLY";
  /** Wave Q (#6) — non-null when the template is disabled for NEW campaigns.
   *  Disabled templates MUST still be listed here (only deletedAt hides). */
  disabledAt: Date | null;
  /** Wave Q (#1) — template-level default for "send results to respondent". */
  sendResultsDefault: boolean;
}

export async function GET(request: NextRequest) {
  try {
    void request.url;
    const actor = await getApiActor();
    if (!actor) {
      return NextResponse.json(
        { success: false, error: "Authentication required" },
        { status: 401 },
      );
    }
    if (!isPrivilegedRole(actor.role)) {
      return NextResponse.json(
        { success: false, error: "Forbidden" },
        { status: 403 },
      );
    }

    const templates = await db.assessmentTemplate.findMany({
      // Wave Q (#6): keep `deletedAt: null` ONLY — disabled templates stay
      // listed so the admin UI can badge them and re-enable.
      where: { deletedAt: null },
      select: {
        id: true,
        name: true,
        alias: true,
        aggregationMode: true,
        disabledAt: true,
        sendResultsDefault: true,
      },
      orderBy: { name: "asc" },
    });

    return NextResponse.json({
      success: true,
      data: templates satisfies AdminTemplateSummary[],
    });
  } catch (error) {
    console.error("Error listing admin assessment templates:", error);
    return NextResponse.json(
      { success: false, error: "Failed to list templates" },
      { status: 500 },
    );
  }
}

const CreateTemplateBodySchema = z.object({
  name: z.string().min(1).max(200).trim(),
  alias: z
    .string()
    .min(1)
    .max(80)
    .regex(/^[a-z0-9][a-z0-9-]*$/, "alias must be lowercase alphanumeric with dashes"),
  description: z.string().max(2000).trim().nullable().optional(),
  invitationSubject: z.string().min(1).max(200).trim(),
  invitationBodyMarkdown: z.string().min(1).max(5000),
  aggregationMode: z.enum(["FULL_VISIBILITY", "CEO_ONLY"]).default("FULL_VISIBILITY"),
  language: z.string().min(2).max(8).default("en"),
  // Content blobs — server validates only that they parse as JSON. Deeper
  // shape validation lives in the runtime scoring engine; we accept any
  // object shape here because the MVP admin paste-flow surfaces validation
  // errors at first-campaign-submit time.
  questions: z.array(z.unknown()),
  sections: z.array(z.unknown()),
  scoringConfig: z.unknown(),
  reportConfig: z.unknown().optional().nullable(),
});

const InternalIdSchema = z
  .string()
  .min(1)
  .max(80)
  .regex(/^[a-z0-9][a-z0-9-]*$/);

const SimplifiedCreateBodySchema = z
  .object({
    creationMode: z.literal("simplified"),
    name: z.string().trim().min(1).max(200),
    internalId: InternalIdSchema.optional(),
  })
  .strict();

const SimplifiedCreateWithWelcomeBodySchema = SimplifiedCreateBodySchema.extend({
  invitedWelcomeDefault: invitedWelcomeAuthoringInputSchema.optional(),
}).strict();

const MAX_GENERATED_INTERNAL_ID_ATTEMPTS = 25;

const SIMPLIFIED_DEFAULTS = {
  description: null,
  invitationSubject: "You're invited to take an assessment",
  invitationBodyMarkdown:
    "Hi {{respondentFirstName}},\n\nYou've been invited to take the {{campaignName}} assessment.\n\n[Start the assessment]({{invitationUrl}})\n\nThe survey closes on {{closeAt}}.",
  aggregationMode: "FULL_VISIBILITY" as const,
  language: "enUS",
  questions: [] as unknown[],
  sections: [] as unknown[],
  scoringConfig: {
    tierMetric: "countAchieved",
    passThreshold: 0,
    tiers: [],
  },
  reportConfig: null,
};

type NormalizedCreateData = z.infer<typeof CreateTemplateBodySchema>;

function isPrismaUniqueError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code: string }).code === "P2002"
  );
}

export async function POST(request: NextRequest) {
  try {
    const rate = await withRateLimit(request, RateLimits.standard);
    if (!rate.allowed) {
      return NextResponse.json(
        { success: false, error: "Too many requests" },
        { status: 429, headers: rate.headers },
      );
    }

    const actor = await getApiActor();
    if (!actor) {
      return NextResponse.json(
        { success: false, error: "Authentication required" },
        { status: 401 },
      );
    }
    if (!isPrivilegedRole(actor.role)) {
      return NextResponse.json(
        { success: false, error: "Forbidden" },
        { status: 403 },
      );
    }
    const actorUserId = actor.userId;

    const body = await request.json().catch(() => ({}));
    const simplified =
      typeof body === "object" &&
      body !== null &&
      "creationMode" in body &&
      body.creationMode === "simplified";
    let data: NormalizedCreateData;
    let manualInternalId = false;
    let effectiveWelcomeDefault: Readonly<InvitedWelcomeConfigV1> =
      GENERIC_INVITED_WELCOME_CONFIG;

    if (simplified) {
      if (!isTemplateCreationSimplifiedEnabled()) {
        return NextResponse.json(
          { success: false, error: "Simplified creation is unavailable" },
          { status: 400 },
        );
      }

      const welcomeAuthoringEnabled = isAdminOwnedAssessmentPresentationEnabled();
      const simplifiedSchema = welcomeAuthoringEnabled
        ? SimplifiedCreateWithWelcomeBodySchema
        : SimplifiedCreateBodySchema;
      const parsed = simplifiedSchema.safeParse(body);
      if (!parsed.success) {
        return NextResponse.json(
          { success: false, error: "Invalid body", details: parsed.error.flatten() },
          { status: 400 },
        );
      }

      if (
        welcomeAuthoringEnabled &&
        "invitedWelcomeDefault" in parsed.data &&
        parsed.data.invitedWelcomeDefault
      ) {
        effectiveWelcomeDefault = buildInvitedWelcomeConfig(
          parsed.data.invitedWelcomeDefault,
          null,
        );
      }

      const generatedBase = generateTemplateInternalId(parsed.data.name);
      if (!parsed.data.internalId && !generatedBase) {
        return NextResponse.json(
          { success: false, error: "Internal ID is required" },
          { status: 400 },
        );
      }

      data = {
        name: parsed.data.name,
        alias: parsed.data.internalId ?? generatedBase,
        ...SIMPLIFIED_DEFAULTS,
      };
      manualInternalId = parsed.data.internalId !== undefined;
    } else {
      const parsed = CreateTemplateBodySchema.safeParse(body);
      if (!parsed.success) {
        return NextResponse.json(
          { success: false, error: "Invalid body", details: parsed.error.flatten() },
          { status: 400 },
        );
      }
      data = parsed.data;
    }

    async function createOnce(createData: NormalizedCreateData) {
      const contentHash = computeTemplateContentHash({
        questions: createData.questions,
        sections: createData.sections,
        scoringConfig: createData.scoringConfig,
        reportConfig: createData.reportConfig ?? null,
        invitationSubject: createData.invitationSubject,
        invitationBodyMarkdown: createData.invitationBodyMarkdown,
      });

      const created = await db.$transaction(async (tx) => {
        const tpl = await tx.assessmentTemplate.create({
          data: {
            name: createData.name,
            alias: createData.alias,
            description: createData.description ?? null,
            invitationSubject: createData.invitationSubject,
            invitationBodyMarkdown: createData.invitationBodyMarkdown,
            aggregationMode: createData.aggregationMode,
            invitedWelcomeDefault:
              effectiveWelcomeDefault as unknown as Prisma.InputJsonValue,
            createdBy: actorUserId,
          },
          select: { id: true, alias: true },
        });
        const version = await tx.assessmentTemplateVersion.create({
          data: {
            templateId: tpl.id,
            versionNumber: 1,
            language: createData.language,
            questions: createData.questions as Prisma.InputJsonValue,
            sections: createData.sections as Prisma.InputJsonValue,
            scoringConfig: createData.scoringConfig as Prisma.InputJsonValue,
            reportConfig:
              createData.reportConfig === null || createData.reportConfig === undefined
                ? Prisma.JsonNull
                : (createData.reportConfig as Prisma.InputJsonValue),
            contentHash,
            publishedAt: null,
            publishedBy: null,
          },
        });
        return { template: tpl, versionId: version.id };
      });

      return { ...created, contentHash };
    }

    let created: Awaited<ReturnType<typeof createOnce>>;
    if (!simplified) {
      try {
        created = await createOnce(data);
      } catch (error) {
        if (isPrismaUniqueError(error)) {
          return NextResponse.json(
            { success: false, error: "alias already in use" },
            { status: 409 },
          );
        }
        throw error;
      }
    } else {
      let successfulCreation: Awaited<ReturnType<typeof createOnce>> | undefined;
      for (
        let attempt = 1;
        attempt <= (manualInternalId ? 1 : MAX_GENERATED_INTERNAL_ID_ATTEMPTS);
        attempt += 1
      ) {
        const alias = manualInternalId
          ? data.alias
          : templateInternalIdForAttempt(data.alias, attempt);
        try {
          successfulCreation = await createOnce({ ...data, alias });
          break;
        } catch (error) {
          if (!isPrismaUniqueError(error)) throw error;
          if (manualInternalId || attempt === MAX_GENERATED_INTERNAL_ID_ATTEMPTS) {
            return NextResponse.json(
              { success: false, error: "Internal ID is already in use" },
              { status: 409 },
            );
          }
        }
      }
      if (!successfulCreation) throw new Error("Template creation did not complete");
      created = successfulCreation;
    }

    await logAudit({
      entityType: "AssessmentTemplate",
      entityId: created.template.id,
      action: "CREATE",
      performedBy: actor.email ?? actor.userId,
      changes: {
        alias: created.template.alias,
        contentHash: created.contentHash,
        language: data.language,
      },
    });

    return NextResponse.json(
      {
        success: true,
        data: simplified
          ? {
              id: created.template.id,
              alias: created.template.alias,
              versionId: created.versionId,
            }
          : { id: created.template.id, alias: created.template.alias },
      },
      { status: 201 },
    );
  } catch (error) {
    console.error("Error creating template:", error);
    return NextResponse.json(
      { success: false, error: "Failed to create template" },
      { status: 500 },
    );
  }
}
