/**
 * Assessment v7.6 — Admin draft AssessmentTemplateVersion fetch + edit.
 *
 * GET — returns the full version row (content + metadata). Used by the
 *       version editor page (both draft + published, but only drafts are
 *       editable).
 * PATCH — edit content on a DRAFT version. 409 ALREADY_PUBLISHED on a
 *         published version (content is immutable post-publish). Recomputes
 *         contentHash so the audit trail stays valid across edits.
 *
 * Wave T (spec 19t §T-5, D5) — the PATCH validates every question row
 * (engine QuestionSchema + structural + identity checks) UNCONDITIONALLY
 * (no feature flag: correctness, not capability — kill is revert-commit,
 * co-validate C2). Validation GATES; it never rewrites — the ORIGINAL
 * payload is persisted (Zod output would strip recommendations[] and
 * unknown future fields; validate-don't-strip).
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { getApiActor, isPrivilegedRole } from "@/lib/auth/authorization";
import { logAudit } from "@/lib/audit";
import { RateLimits, withRateLimit } from "@/lib/rate-limit";
import { computeTemplateContentHash } from "@/lib/assessments/template-content-hash";
import { QuestionSchema } from "@/lib/assessments/scoring";
import { isVersionLifecycleEnabled } from "@/lib/assessments/wave-ed8-flags";
import { isPublicMarketingCtaEnabled } from "@/lib/assessments/wave-public-marketing-cta-flags";
import { prepareMarketingCtaForStorage } from "@/lib/assessments/marketing-cta-compiler";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string; versionId: string }> },
) {
  try {
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

    const { id: templateId, versionId } = await params;
    const [version, template] = await Promise.all([
      db.assessmentTemplateVersion.findUnique({
        where: { id: versionId },
        select: {
          id: true,
          templateId: true,
          versionNumber: true,
          language: true,
          questions: true,
          sections: true,
          scoringConfig: true,
          reportConfig: true,
          publishedAt: true,
          contentHash: true,
        },
      }),
      db.assessmentTemplate.findUnique({
        where: { id: templateId },
        select: {
          id: true,
          name: true,
          alias: true,
          invitationSubject: true,
          invitationBodyMarkdown: true,
        },
      }),
    ]);
    if (!version || version.templateId !== templateId || !template) {
      return NextResponse.json(
        { success: false, error: "Version not found" },
        { status: 404 },
      );
    }
    return NextResponse.json({
      success: true,
      data: { version, template },
    });
  } catch (error) {
    console.error("Error fetching template version:", error);
    return NextResponse.json(
      { success: false, error: "Failed to fetch version" },
      { status: 500 },
    );
  }
}

const PatchVersionBodySchema = z.object({
  questions: z.array(z.unknown()),
  sections: z.array(z.unknown()),
  scoringConfig: z.unknown(),
  reportConfig: z.unknown().optional().nullable(),
  // F2 (Checkpoint 1b) — language edits originate from the Metadata tab
  // (per WF16 — labelled "Language (this version)"). Optional so existing
  // callers that only patch content stay byte-compatible.
  language: z.string().min(2).max(20).optional(),
});

// ─── Wave T (§T-5) — unconditional question-payload validation ────────────
//
// Each check returns the FIRST failure found; the route maps a failure to
// `{ success: false, error, code }` with status 400. Rows that pass are
// persisted EXACTLY as sent (raw payload, never Zod output).

const STABLE_KEY_PATTERN = /^[A-Za-z][A-Za-z0-9_]{0,39}$/;

type QuestionValidationFailure = { code: string; message: string };

function readRowStableKey(row: unknown): string | null {
  if (row && typeof row === "object") {
    const key = (row as Record<string, unknown>).stableKey;
    if (typeof key === "string" && key.length > 0) return key;
  }
  return null;
}

/**
 * Defensive stableKey → type map from a version's `questions` JSON.
 * Skips non-array payloads, non-object rows, and rows without a string
 * stableKey (old/hand-seeded versions may carry anything).
 */
function buildKeyTypeMap(questions: unknown): Map<string, string> {
  const map = new Map<string, string>();
  if (!Array.isArray(questions)) return map;
  for (const row of questions) {
    const key = readRowStableKey(row);
    if (key === null) continue;
    const type = (row as Record<string, unknown>).type;
    if (!map.has(key)) map.set(key, typeof type === "string" ? type : "");
  }
  return map;
}

/** Stages 1–4: per-row schema, key format, duplicate keys, MULTI_CHOICE structure. */
function validateQuestionRowsStructural(
  rows: unknown[],
): QuestionValidationFailure | null {
  // Stage 1 — every row must pass the engine QuestionSchema (non-strict:
  // legacy stale `scale` on qualitative rows + unknown future fields pass).
  for (const row of rows) {
    const parsed = QuestionSchema.safeParse(row);
    if (parsed.success) continue;
    const key = readRowStableKey(row);
    const issue = parsed.error.issues[0];
    const detail = issue
      ? `${issue.path.join(".") || "(root)"}: ${issue.message}`
      : "failed schema validation";
    return {
      code: "INVALID_QUESTION",
      message: `Invalid question${key ? ` "${key}"` : ""} — ${detail}`,
    };
  }

  // Stage 2 — stableKey format (permanent join identifiers; ADR-0020).
  for (const row of rows) {
    const key = readRowStableKey(row) ?? "";
    if (!STABLE_KEY_PATTERN.test(key)) {
      return {
        code: "INVALID_STABLE_KEY",
        message: `Invalid stableKey "${key}" — must start with a letter and contain only letters, digits, and underscores (max 40 chars)`,
      };
    }
  }

  // Stage 3 — duplicate stableKeys within the payload.
  const seen = new Set<string>();
  for (const row of rows) {
    const key = readRowStableKey(row) as string;
    if (seen.has(key)) {
      return {
        code: "DUPLICATE_STABLE_KEY",
        message: `Duplicate stableKey "${key}" — stableKeys must be unique within a version`,
      };
    }
    seen.add(key);
  }

  // Stage 4 — MULTI_CHOICE structural checks (mirrors publish +
  // validateAnswerValues semantics).
  for (const row of rows) {
    const record = row as Record<string, unknown>;
    if (record.type !== "MULTI_CHOICE") continue;
    const key = readRowStableKey(row) as string;
    const options = Array.isArray(record.options)
      ? (record.options as Array<Record<string, unknown>>)
      : [];
    if (options.length === 0) {
      return {
        code: "MULTI_CHOICE_NO_OPTIONS",
        message: `MULTI_CHOICE question "${key}" has no options — at least one option is required`,
      };
    }
    const optionKeys = new Set<string>();
    for (const option of options) {
      const optionKey = typeof option.key === "string" ? option.key : "";
      if (optionKeys.has(optionKey)) {
        return {
          code: "DUPLICATE_OPTION_KEY",
          message: `MULTI_CHOICE question "${key}" has duplicate option key "${optionKey}" — option keys must be unique within a question`,
        };
      }
      optionKeys.add(optionKey);
    }
    const maxChoices = record.maxChoices;
    if (
      typeof maxChoices === "number" &&
      (maxChoices < 1 || maxChoices > options.length)
    ) {
      return {
        code: "MAX_CHOICES_INVALID",
        message: `MULTI_CHOICE question "${key}" has maxChoices ${maxChoices} — must be between 1 and the option count (${options.length})`,
      };
    }
  }

  return null;
}

/**
 * Stage 5 — server-side identity enforcement (spec C1). Option keys are
 * deliberately NOT enforced here: an option-key rename is indistinguishable
 * from remove+add, and D9 permits removal (with a UI warning) — a server
 * rename-lock would block a permitted edit (spec §T-5).
 */
function validateQuestionIdentity(
  rows: unknown[],
  storedDraftTypes: Map<string, string>,
  publishedTypes: Map<string, string>,
): QuestionValidationFailure | null {
  for (const row of rows) {
    const key = readRowStableKey(row) as string;
    const type = (row as Record<string, unknown>).type;
    const payloadType = typeof type === "string" ? type : "";
    const inPublished = publishedTypes.has(key);
    if (!storedDraftTypes.has(key)) {
      if (inPublished) {
        return {
          code: "KEY_COLLIDES_WITH_PUBLISHED",
          message: `stableKey "${key}" exists in a published version of this template — a new question must use a new key`,
        };
      }
      continue;
    }
    if (storedDraftTypes.get(key) !== payloadType && inPublished) {
      // Retyping a key that exists ONLY in the draft stays legal.
      return {
        code: "TYPE_LOCKED",
        message: `Question "${key}" exists in a published version — its type is locked to "${storedDraftTypes.get(key)}"; a different type must be a new question`,
      };
    }
  }
  return null;
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; versionId: string }> },
) {
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

    const { id: templateId, versionId } = await params;
    const body = await request.json().catch(() => ({}));
    const parsed = PatchVersionBodySchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: "Invalid body", details: parsed.error.flatten() },
        { status: 400 },
      );
    }

    const [version, template] = await Promise.all([
      db.assessmentTemplateVersion.findUnique({
        where: { id: versionId },
        // `questions` feeds the Wave T stored-draft key→type map (§T-5).
        select: { templateId: true, publishedAt: true, questions: true },
      }),
      db.assessmentTemplate.findUnique({
        where: { id: templateId },
        select: {
          invitationSubject: true,
          invitationBodyMarkdown: true,
          deliveryType: true,
        },
      }),
    ]);
    if (!version || version.templateId !== templateId || !template) {
      return NextResponse.json(
        { success: false, error: "Version not found" },
        { status: 404 },
      );
    }
    if (version.publishedAt !== null) {
      return NextResponse.json(
        { success: false, error: "ALREADY_PUBLISHED" },
        { status: 409 },
      );
    }

    const data = parsed.data;
    let preparedReportConfig: unknown = data.reportConfig ?? null;
    if (
      isPublicMarketingCtaEnabled() &&
      template.deliveryType === "PUBLIC_MARKETING_QUIZ"
    ) {
      const prepared = prepareMarketingCtaForStorage(preparedReportConfig);
      if (!prepared.ok) {
        return NextResponse.json(
          {
            success: false,
            error: "Invalid Marketing CTA",
            code: "INVALID_MARKETING_CTA",
            issues: prepared.issues,
          },
          { status: 422 },
        );
      }
      preparedReportConfig = prepared.reportConfig;
    }

    // ── Wave T §T-5 — unconditional validation (gates, never rewrites) ──
    const structuralFailure = validateQuestionRowsStructural(data.questions);
    if (structuralFailure) {
      return NextResponse.json(
        {
          success: false,
          error: structuralFailure.message,
          code: structuralFailure.code,
        },
        { status: 400 },
      );
    }

    // Server-side identity enforcement (co-validate C1): ONE extra query —
    // all published versions of this template (~few versions × ≤65 rows).
    // Wave ED8: do NOT add `archivedAt: null` here — identity locks against
    // ALL published history INCLUDING archived versions (an archived version's
    // stableKeys/types must still lock; spec 19ak §4). Pinned by
    // template-version-patch.wave-t.test.ts (the archived-still-locks cases).
    const publishedVersions = await db.assessmentTemplateVersion.findMany({
      where: { templateId, publishedAt: { not: null } },
      select: { questions: true },
    });
    const publishedTypes = new Map<string, string>();
    for (const published of publishedVersions) {
      for (const [key, type] of buildKeyTypeMap(published.questions)) {
        if (!publishedTypes.has(key)) publishedTypes.set(key, type);
      }
    }
    const identityFailure = validateQuestionIdentity(
      data.questions,
      buildKeyTypeMap(version.questions),
      publishedTypes,
    );
    if (identityFailure) {
      return NextResponse.json(
        {
          success: false,
          error: identityFailure.message,
          code: identityFailure.code,
        },
        { status: 400 },
      );
    }
    // ── end Wave T validation — from here the ORIGINAL payload persists ──

    const contentHash = computeTemplateContentHash({
      questions: data.questions,
      sections: data.sections,
      scoringConfig: data.scoringConfig,
      reportConfig: preparedReportConfig,
      invitationSubject: template.invitationSubject,
      invitationBodyMarkdown: template.invitationBodyMarkdown,
    });

    const updatePayload: {
      questions: Prisma.InputJsonValue;
      sections: Prisma.InputJsonValue;
      scoringConfig: Prisma.InputJsonValue;
      reportConfig: Prisma.InputJsonValue | typeof Prisma.JsonNull;
      contentHash: string;
      language?: string;
    } = {
      questions: data.questions as Prisma.InputJsonValue,
      sections: data.sections as Prisma.InputJsonValue,
      scoringConfig: data.scoringConfig as Prisma.InputJsonValue,
      reportConfig:
        preparedReportConfig === null || preparedReportConfig === undefined
          ? Prisma.JsonNull
          : (preparedReportConfig as Prisma.InputJsonValue),
      contentHash,
    };
    if (data.language !== undefined) {
      updatePayload.language = data.language;
    }

    await db.assessmentTemplateVersion.update({
      where: { id: versionId },
      data: updatePayload,
    });

    await logAudit({
      entityType: "AssessmentTemplateVersion",
      entityId: versionId,
      action: "UPDATE",
      performedBy: actor.email ?? actor.userId,
      changes: { contentEdited: true, contentHash },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error updating template version:", error);
    return NextResponse.json(
      { success: false, error: "Failed to update version" },
      { status: 500 },
    );
  }
}

// ─── Wave ED8 (spec 19ak §5) — draft-only DELETE ───────────────────────────
//
// Deletes a DRAFT version row. Published rows are never deletable (409
// ALREADY_PUBLISHED — also enforced by the DB immutability trigger, but the
// route refuses cleanly first). Flag-gated to the ED8 lifecycle capability
// (opaque 404 when off — GET/PATCH above are deliberately NOT flag-gated).
//
// Campaign preflight (co-validate C5): a campaign already pinned to this
// version blocks the delete with 409 VERSION_IN_USE; a campaign created
// between the preflight and the delete surfaces as a Prisma P2003 FK error,
// which maps to the SAME 409 instead of a raw 500.

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; versionId: string }> },
) {
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

    // Flag OFF ⇒ the capability does not exist (opaque 404, zero DB reads).
    if (!isVersionLifecycleEnabled()) {
      return NextResponse.json(
        { success: false, error: "Not found" },
        { status: 404 },
      );
    }

    const { id: templateId, versionId } = await params;

    const version = await db.assessmentTemplateVersion.findUnique({
      where: { id: versionId },
      select: {
        id: true,
        templateId: true,
        language: true,
        versionNumber: true,
        publishedAt: true,
      },
    });
    if (!version || version.templateId !== templateId) {
      return NextResponse.json(
        { success: false, error: "Version not found" },
        { status: 404 },
      );
    }
    if (version.publishedAt !== null) {
      return NextResponse.json(
        { success: false, error: "ALREADY_PUBLISHED" },
        { status: 409 },
      );
    }

    // Campaign preflight (co-validate C5).
    const campaignCount = await db.assessmentCampaign.count({
      where: { versionId },
    });
    if (campaignCount > 0) {
      return NextResponse.json(
        { success: false, error: "VERSION_IN_USE" },
        { status: 409 },
      );
    }

    try {
      await db.assessmentTemplateVersion.delete({ where: { id: versionId } });
    } catch (error) {
      // Race: a campaign was created between the preflight and the delete —
      // the FK violation maps to the same clean 409.
      if (
        typeof error === "object" &&
        error !== null &&
        (error as { code?: unknown }).code === "P2003"
      ) {
        return NextResponse.json(
          { success: false, error: "VERSION_IN_USE" },
          { status: 409 },
        );
      }
      throw error;
    }

    await logAudit({
      entityType: "AssessmentTemplateVersion",
      entityId: versionId,
      action: "TEMPLATE_VERSION_DELETED",
      performedBy: actor.email ?? actor.userId,
      changes: {
        templateId,
        versionNumber: version.versionNumber,
        language: version.language,
        wasDraft: true,
      },
    });

    return NextResponse.json({
      success: true,
      data: { deletedVersionId: versionId },
    });
  } catch (error) {
    console.error("Error deleting template version:", error);
    return NextResponse.json(
      { success: false, error: "Failed to delete version" },
      { status: 500 },
    );
  }
}
