/**
 * Esperto historical import — admin import endpoint.
 *
 * Spec ref: docs/specs/v7.6/12-esperto-historical-import.md §4/§5; plan 12a
 * steps 7 + 9, edges 11–14b, S1–S4.
 *
 * POST /api/admin/assessments/import
 *   Body: { mode: "preview"|"commit", kind: "roster"|"results",
 *           ownerCoachId, companyName, payload: <raw Esperto export JSON> }
 *
 * ADMIN-only (R2 — NOT STAFF: `User.role` defaults to STAFF, so STAFF is too
 * broad a grant for a migration-shaped backfill). Rate-limited. Upload bounds:
 * reject > 5 MB or > 2000 member rows (413) BEFORE building a plan.
 *
 * Roster flow: parse + classify the payload (must be a Members export) →
 * resolve the existing org (by ownerCoachId + normalizedName) + its respondents
 * → build a RosterImportPlan (pure). `mode:"preview"` returns the plan with NO
 * writes; `mode:"commit"` refuses (409) if the plan carries blocks, else applies
 * it via `commitRosterImport` (the only writer) and returns counts.
 *
 * Results flow: parse + classify the payload (must be a Report export) → pick
 * the crosswalk by `variant` → find the template by `crosswalk.templateAlias` →
 * PREFLIGHT a published, crosswalk-compatible version (422 on unpublished /
 * type-scale drift, §6.2) → resolve the target org by joining the report's
 * memberids to OrgRespondent.externalId (409 when 0 — roster not imported — or
 * >1 — members span multiple orgs) → build a ResultsImportPlan (pure).
 * `mode:"preview"` returns the plan with NO writes; `mode:"commit"` refuses
 * (409) if the plan carries blocks (incl. a not-locked crosswalk), else applies
 * it via `commitResultsImport` (the only writer; invitations born SUBMITTED, no
 * email) and returns per-campaign counts.
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { getApiActor } from "@/lib/auth/authorization";
import { RateLimits, withRateLimit } from "@/lib/rate-limit";
import {
  parseEspertoExport,
  EspertoParseError,
} from "@/lib/assessments/esperto-import/parse";
import {
  buildRosterImportPlan,
  normalizeEmail,
} from "@/lib/assessments/esperto-import/roster-plan";
import {
  commitRosterImport,
  RosterCommitError,
  type RosterCommitDb,
} from "@/lib/assessments/esperto-import/commit";
import {
  getCrosswalkByVariant,
  validateCrosswalkAgainstVersion,
  type VersionQuestion,
} from "@/lib/assessments/esperto-import/crosswalks";
import { buildResultsImportPlan } from "@/lib/assessments/esperto-import/results-plan";
import {
  commitResultsImport,
  ResultsCommitError,
  type ResultsCommitDb,
} from "@/lib/assessments/esperto-import/results-commit";
import type { TemplateVersionForScoring } from "@/lib/assessments/scoring";

/** Upload bounds (plan 12a step 9). */
const MAX_BYTES = 5 * 1024 * 1024; // 5 MB
const MAX_MEMBER_ROWS = 2000;

// ownerCoachId + companyName are REQUIRED for kind:roster (they resolve the
// target org). For kind:results they are unused — the org is resolved by joining
// the report's memberids to OrgRespondent.externalId, and the campaign's owner
// coach is derived from that org's ownerCoachId — so both are optional there.
const importBodySchema = z
  .object({
    mode: z.enum(["preview", "commit"]),
    kind: z.enum(["roster", "results"]),
    ownerCoachId: z.string().min(1).optional(),
    companyName: z.string().min(1).optional(),
    // Raw Esperto export JSON — validated by parseEspertoExport, not here.
    payload: z.unknown(),
  })
  .refine(
    (b) => b.kind !== "roster" || (!!b.ownerCoachId && !!b.companyName),
    {
      message: "ownerCoachId and companyName are required for kind:roster",
      path: ["ownerCoachId"],
    },
  );

export async function POST(request: NextRequest) {
  try {
    // ── Rate limit FIRST (cheap, before any body read). ──────────────────
    const rateLimit = await withRateLimit(request, RateLimits.standard);
    if (!rateLimit.allowed) {
      return NextResponse.json(
        { success: false, error: "Too many requests" },
        { status: 429, headers: rateLimit.headers },
      );
    }

    // ── ADMIN-only (not STAFF — R2). ──────────────────────────────────────
    const actor = await getApiActor();
    if (!actor) {
      return NextResponse.json(
        { success: false, error: "Authentication required" },
        { status: 401 },
      );
    }
    if (actor.role !== "ADMIN") {
      return NextResponse.json(
        { success: false, error: "Forbidden" },
        { status: 403 },
      );
    }

    // ── Size guard BEFORE parse (Codex E): Content-Length header, then the
    //    measured raw-body byte length (header can be absent/spoofed). ──────
    const contentLength = request.headers.get("content-length");
    if (contentLength && Number(contentLength) > MAX_BYTES) {
      return NextResponse.json(
        { success: false, error: "Payload too large (max 5MB)" },
        { status: 413 },
      );
    }

    const raw = await request.text();
    if (Buffer.byteLength(raw, "utf8") > MAX_BYTES) {
      return NextResponse.json(
        { success: false, error: "Payload too large (max 5MB)" },
        { status: 413 },
      );
    }

    let parsedBody: unknown;
    try {
      parsedBody = JSON.parse(raw);
    } catch {
      return NextResponse.json(
        { success: false, error: "Invalid JSON body" },
        { status: 400 },
      );
    }

    const validation = importBodySchema.safeParse(parsedBody);
    if (!validation.success) {
      return NextResponse.json(
        { success: false, error: validation.error.issues },
        { status: 400 },
      );
    }
    const { mode, kind, ownerCoachId, companyName, payload } = validation.data;

    // ── Results import — its own pipeline (own parse-shape + resolution). ──
    if (kind === "results") {
      return handleResultsImport(payload, mode, {
        userId: actor.userId,
        email: actor.email,
      });
    }

    // The refine guarantees both are present for kind:roster.
    if (!ownerCoachId || !companyName) {
      return NextResponse.json(
        { success: false, error: "ownerCoachId and companyName are required" },
        { status: 400 },
      );
    }

    // ── Parse + classify the Esperto export. ──────────────────────────────
    let parsed;
    try {
      parsed = parseEspertoExport(payload);
    } catch (error) {
      if (error instanceof EspertoParseError) {
        return NextResponse.json(
          { success: false, error: error.reason, details: error.details },
          { status: 400 },
        );
      }
      throw error;
    }

    if (parsed.kind !== "members") {
      return NextResponse.json(
        {
          success: false,
          error: `Expected a members export for kind:roster, got ${parsed.kind}`,
        },
        { status: 400 },
      );
    }

    // Row-count bound (after parse — the parsed array is authoritative).
    if (parsed.data.length > MAX_MEMBER_ROWS) {
      return NextResponse.json(
        { success: false, error: `Too many members (max ${MAX_MEMBER_ROWS})` },
        { status: 413 },
      );
    }

    // ── Resolve the existing org (by ownerCoachId + normalizedName) + its
    //    respondents, so the pure plan-builder can decide create vs merge. ──
    const normalizedName = companyName.trim();
    const existingOrg = await db.organization.findFirst({
      where: { ownerCoachId, name: normalizedName, deletedAt: null },
      select: { id: true },
    });

    let existingRespondents: {
      id: string;
      externalId: string | null;
      normalizedEmail: string | null;
    }[] = [];
    if (existingOrg) {
      existingRespondents = await db.orgRespondent.findMany({
        where: { organizationId: existingOrg.id, deletedAt: null },
        select: { id: true, externalId: true, normalizedEmail: true },
      });
    }

    const plan = buildRosterImportPlan({
      parsedMembers: parsed.data,
      ownerCoachId,
      companyName: normalizedName,
      existing: {
        orgId: existingOrg?.id ?? null,
        respondents: existingRespondents,
      },
    });

    // ── Preview: read-only, return the plan with summary counts. ──────────
    if (mode === "preview") {
      return NextResponse.json({
        success: true,
        data: {
          plan,
          summary: {
            orgAction: plan.orgAction,
            creates: plan.creates.length,
            backfills: plan.backfills.length,
            skips: plan.skips.length,
            blocks: plan.blocks.length,
          },
        },
      });
    }

    // ── Commit: refuse if the plan is blocked; else apply atomically. ─────
    if (plan.blocks.length > 0) {
      return NextResponse.json(
        {
          success: false,
          error: "Plan has blocking errors; cannot commit.",
          blocks: plan.blocks,
        },
        { status: 409 },
      );
    }

    try {
      // Type-only cast: the minimal RosterCommitDb interface isn't structurally
      // assignable FROM PrismaClient's overloaded $transaction (array + callback
      // overloads). No runtime effect; commit behavior is covered by roster-commit
      // tests against a mock tx.
      const result = await commitRosterImport(db as unknown as RosterCommitDb, plan, {
        userId: actor.userId,
        email: actor.email,
      });
      return NextResponse.json({ success: true, data: result });
    } catch (error) {
      if (error instanceof RosterCommitError) {
        // Stale-plan / in-tx divergence → 409, operator re-previews.
        return NextResponse.json(
          { success: false, error: error.code, message: error.message },
          { status: 409 },
        );
      }
      throw error;
    }
  } catch (error) {
    console.error("Error in esperto import route:", error);
    return NextResponse.json(
      { success: false, error: "Import failed" },
      { status: 500 },
    );
  }
}

// ────────────────────────────────────────────────────────────────────────
// Results import pipeline (§6.2–6.4)
//
// Auth + size + rate limit are already enforced by POST before this is called.
// Steps: parse (must be a Report) → crosswalk by variant → template by alias →
// PREFLIGHT published+compatible version → resolve target org by memberid join
// → build the pure ResultsImportPlan → preview (no writes) | commit (the only
// writer). NEVER calls an email-send function; invitations are born SUBMITTED.
// ────────────────────────────────────────────────────────────────────────

async function handleResultsImport(
  payload: unknown,
  mode: "preview" | "commit",
  actor: { userId: string; email: string },
): Promise<NextResponse> {
  // ── Parse + classify — must be a Report export. ──────────────────────────
  let parsed;
  try {
    parsed = parseEspertoExport(payload);
  } catch (error) {
    if (error instanceof EspertoParseError) {
      return NextResponse.json(
        { success: false, error: error.reason, details: error.details },
        { status: 400 },
      );
    }
    throw error;
  }

  if (parsed.kind !== "report") {
    return NextResponse.json(
      {
        success: false,
        error: `Expected a report export for kind:results, got ${parsed.kind}`,
      },
      { status: 400 },
    );
  }

  const report = parsed.data;
  if (report.personal.length === 0) {
    return NextResponse.json(
      { success: false, error: "Report has no respondent rows" },
      { status: 400 },
    );
  }
  if (report.personal.length > MAX_MEMBER_ROWS) {
    return NextResponse.json(
      { success: false, error: `Too many rows (max ${MAX_MEMBER_ROWS})` },
      { status: 413 },
    );
  }

  // ── Crosswalk by the report's self-identifying variant. ──────────────────
  const crosswalk = getCrosswalkByVariant(report.personal[0].variant);
  if (!crosswalk) {
    return NextResponse.json(
      {
        success: false,
        error: `No crosswalk for variant "${report.personal[0].variant}"`,
      },
      { status: 400 },
    );
  }

  // ── Template by the crosswalk's alias. ───────────────────────────────────
  const template = await db.assessmentTemplate.findFirst({
    where: { alias: crosswalk.templateAlias },
    select: { id: true },
  });
  if (!template) {
    return NextResponse.json(
      {
        success: false,
        error: `Template "${crosswalk.templateAlias}" not found`,
      },
      { status: 400 },
    );
  }

  // ── PREFLIGHT: a published, crosswalk-compatible version must exist (§6.2).
  //    Read the latest published version directly (it carries the scoring
  //    shape we need anyway); 422 when none, then check type/scale drift. ───
  const publishedVersion = await db.assessmentTemplateVersion.findFirst({
    where: { templateId: template.id, publishedAt: { not: null } },
    orderBy: { versionNumber: "desc" },
    select: {
      id: true,
      language: true,
      questions: true,
      sections: true,
      scoringConfig: true,
    },
  });
  if (!publishedVersion) {
    return NextResponse.json(
      {
        success: false,
        error: "TEMPLATE_VERSION_NOT_PUBLISHED",
        details: { templateId: template.id, alias: crosswalk.templateAlias },
      },
      { status: 422 },
    );
  }

  const versionQuestions =
    (publishedVersion.questions as unknown as VersionQuestion[]) ?? [];
  const compat = validateCrosswalkAgainstVersion(crosswalk, versionQuestions);
  if (!compat.ok) {
    return NextResponse.json(
      {
        success: false,
        error: "CROSSWALK_INCOMPATIBLE_WITH_VERSION",
        problems: compat.problems,
      },
      { status: 422 },
    );
  }

  // ── Resolve the target org by joining report memberids → externalId. ─────
  const memberids = Array.from(
    new Set(report.personal.map((r) => r.memberid)),
  );
  const respondents = await db.orgRespondent.findMany({
    where: { externalId: { in: memberids }, deletedAt: null },
    select: { id: true, externalId: true, organizationId: true },
  });
  const orgIds = Array.from(new Set(respondents.map((r) => r.organizationId)));
  if (orgIds.length === 0) {
    return NextResponse.json(
      {
        success: false,
        error: "roster not imported — import the company's roster first",
      },
      { status: 409 },
    );
  }
  if (orgIds.length > 1) {
    return NextResponse.json(
      {
        success: false,
        error: "members resolve to multiple organizations",
        organizationIds: orgIds,
      },
      { status: 409 },
    );
  }
  const targetOrgId = orgIds[0];

  // The org's owner coach → campaign.createdByCoachId (derived, not from body).
  const org = await db.organization.findUnique({
    where: { id: targetOrgId },
    select: { id: true, ownerCoachId: true },
  });
  if (!org) {
    return NextResponse.json(
      { success: false, error: "Target organization not found" },
      { status: 409 },
    );
  }

  // ── Build the pure plan. ─────────────────────────────────────────────────
  const plan = buildResultsImportPlan({
    parsedReport: report,
    crosswalk,
    targetOrgId,
    respondents: respondents.map((r) => ({
      id: r.id,
      externalId: r.externalId,
    })),
  });

  // ── Preview: read-only, return the plan with summary counts. ─────────────
  if (mode === "preview") {
    return NextResponse.json({
      success: true,
      data: {
        plan,
        summary: {
          campaigns: plan.campaigns.length,
          rows: plan.campaigns.reduce((n, c) => n + c.rows.length, 0),
          skips: plan.skips.length,
          blocks: plan.blocks.length,
        },
      },
    });
  }

  // ── Commit: refuse if the plan is blocked; else apply atomically. ────────
  if (plan.blocks.length > 0) {
    return NextResponse.json(
      {
        success: false,
        error: "Plan has blocking errors; cannot commit.",
        blocks: plan.blocks,
      },
      { status: 409 },
    );
  }

  try {
    // Type-only cast (same pattern as the roster commit): the minimal
    // ResultsCommitDb interface isn't structurally assignable FROM PrismaClient's
    // overloaded $transaction. No runtime effect; commit behavior is covered by
    // results-commit tests against a mock tx.
    const result = await commitResultsImport(
      db as unknown as ResultsCommitDb,
      plan,
      {
        templateId: template.id,
        versionId: publishedVersion.id,
        versionForScoring: {
          questions: publishedVersion.questions,
          sections: publishedVersion.sections,
          scoringConfig: publishedVersion.scoringConfig,
        } as unknown as TemplateVersionForScoring,
        organizationId: targetOrgId,
        ownerCoachId: org.ownerCoachId ?? null,
        language: publishedVersion.language,
        createdByUserId: actor.userId,
      },
      { userId: actor.userId, email: actor.email },
    );
    return NextResponse.json({ success: true, data: result });
  } catch (error) {
    if (error instanceof ResultsCommitError) {
      return NextResponse.json(
        { success: false, error: error.code, message: error.message },
        { status: 409 },
      );
    }
    throw error;
  }
}

// Avoid unused-import lint on the field-map normalizer (kept for parity with
// the live respondents route; the route resolves identity via the plan layer).
void normalizeEmail;
