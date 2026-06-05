/**
 * Esperto historical import — COACH-operated import endpoint.
 *
 * Spec ref: docs/specs/v7.6/12-esperto-historical-import.md §4/§5; plan 12a
 * steps 7 + 9, edges 11–14b, S1–S4. Jeff's decision: import is coach-operated,
 * so this route mirrors the ADMIN route's orchestration (parse → classify →
 * resolve org → build plan → preview/commit) but with COACH scoping.
 *
 * POST /api/assessments/import
 *   Body: { mode: "preview"|"commit", kind: "roster"|"results",
 *           companyName?, payload: <raw Esperto export JSON> }
 *
 * COACH-scoped. There is NO `ownerCoachId` in the body — it is ALWAYS derived
 * from the authenticated actor (`actor.coachId`), so a coach can never import on
 * behalf of another coach. Admins (no coachId) use the admin route. Rate-limited.
 * Upload bounds: reject > 5 MB or > 2000 member rows (413) BEFORE building a plan.
 *
 * Roster flow: parse + classify (must be a Members export) → resolve the existing
 * org SCOPED to this coach (ownerCoachId = actor.coachId + normalizedName) + its
 * respondents → build a RosterImportPlan (pure) with ownerCoachId = actor.coachId.
 * `mode:"preview"` returns the plan with NO writes; `mode:"commit"` refuses (409)
 * if the plan carries blocks, else applies it via `commitRosterImport`.
 *
 * Results flow: parse + classify (must be a Report export) → pick the crosswalk
 * by `variant` → find the template by `crosswalk.templateAlias` → PREFLIGHT a
 * published, crosswalk-compatible version (422) → resolve the target org by
 * joining the report's memberids to OrgRespondent.externalId, SCOPED to this
 * coach's orgs (organization.ownerCoachId = actor.coachId). 0 → 409 (no matching
 * roster in YOUR companies — this is the cross-coach isolation guarantee: members
 * in another coach's org resolve to none here); >1 → 409 multi-org. Build a
 * ResultsImportPlan (pure) → preview (no writes) | commit (`commitResultsImport`).
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
import { buildRosterImportPlan } from "@/lib/assessments/esperto-import/roster-plan";
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

// NO ownerCoachId in the body — it is always derived from the actor. companyName
// is REQUIRED for kind:roster (it resolves the target org). For kind:results it
// is unused — the org is resolved by joining the report's memberids to
// OrgRespondent.externalId (scoped to the coach's orgs).
const importBodySchema = z
  .object({
    mode: z.enum(["preview", "commit"]),
    kind: z.enum(["roster", "results"]),
    companyName: z.string().min(1).optional(),
    // Raw Esperto export JSON — validated by parseEspertoExport, not here.
    payload: z.unknown(),
  })
  .refine((b) => b.kind !== "roster" || !!b.companyName, {
    message: "companyName is required for kind:roster",
    path: ["companyName"],
  });

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

    // ── COACH-scoped: require an authenticated coach (actor.coachId). ─────
    //    Admins (no coachId) use the admin route — they're rejected here.
    const actor = await getApiActor();
    if (!actor) {
      return NextResponse.json(
        { success: false, error: "Authentication required" },
        { status: 401 },
      );
    }
    if (!actor.coachId) {
      return NextResponse.json(
        { success: false, error: "Only coaches can import" },
        { status: 403 },
      );
    }
    // The ONLY source of the owner coach — never the body.
    const ownerCoachId = actor.coachId;

    // ── Size guard BEFORE parse: Content-Length header, then the measured
    //    raw-body byte length (header can be absent/spoofed). ──────────────
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
    const { mode, kind, companyName, payload } = validation.data;

    // ── Results import — its own pipeline (own parse-shape + resolution). ──
    if (kind === "results") {
      return handleResultsImport(payload, mode, {
        ownerCoachId,
        userId: actor.userId,
        email: actor.email,
      });
    }

    // The refine guarantees companyName is present for kind:roster.
    if (!companyName) {
      return NextResponse.json(
        { success: false, error: "companyName is required" },
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

    // ── Resolve the existing org SCOPED to this coach (ownerCoachId =
    //    actor.coachId + normalizedName) + its respondents, so the pure
    //    plan-builder can decide create vs merge. ───────────────────────────
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
      // assignable FROM PrismaClient's overloaded $transaction. No runtime
      // effect; commit behavior is covered by roster-commit tests.
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
    console.error("Error in coach esperto import route:", error);
    return NextResponse.json(
      { success: false, error: "Import failed" },
      { status: 500 },
    );
  }
}

// ────────────────────────────────────────────────────────────────────────
// Results import pipeline (§6.2–6.4) — COACH-scoped org resolution.
//
// Auth + size + rate limit are already enforced by POST before this is called.
// Steps: parse (must be a Report) → crosswalk by variant → template by alias →
// PREFLIGHT published+compatible version → resolve target org by memberid join
// SCOPED to the coach's orgs → build the pure ResultsImportPlan → preview (no
// writes) | commit (the only writer). NEVER calls an email-send function.
// ────────────────────────────────────────────────────────────────────────

async function handleResultsImport(
  payload: unknown,
  mode: "preview" | "commit",
  actor: { ownerCoachId: string; userId: string; email: string },
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

  // ── Resolve the target org by joining report memberids → externalId,
  //    SCOPED to this coach's orgs. SECURITY: because the query is filtered by
  //    `organization.ownerCoachId = actor.ownerCoachId`, members that belong to
  //    a DIFFERENT coach's org resolve to NONE here → the coach is blocked from
  //    importing into another coach's company (cross-coach isolation). ───────
  const memberids = Array.from(
    new Set(report.personal.map((r) => r.memberid)),
  );
  const respondents = await db.orgRespondent.findMany({
    where: {
      externalId: { in: memberids },
      deletedAt: null,
      organization: { ownerCoachId: actor.ownerCoachId },
    },
    select: { id: true, externalId: true, organizationId: true, roleType: true },
  });
  const orgIds = Array.from(new Set(respondents.map((r) => r.organizationId)));
  if (orgIds.length === 0) {
    return NextResponse.json(
      {
        success: false,
        error: "No matching roster in your companies — import the roster first",
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
        // The owner coach is the authenticated coach (the org is theirs, scoped).
        ownerCoachId: actor.ownerCoachId,
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
