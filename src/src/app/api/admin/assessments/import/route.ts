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
 *
 * Restricted-results flow (Wave O — kind:"restrictedResults"): historical
 * SU-Full per-round import from a BATCH of restricted-individual exports (one
 * respondent each) against an EXPLICIT `targetOrgId` (never inferred). Dark
 * behind `isEspertoSuFullImportEnabled` (default-OFF). Admin-created imported
 * campaigns have no `ownerCoachId` concept for this path — the campaign's
 * `createdByCoachId` is null, mirroring the QSP admin path's
 * `ownerCoachId: org.ownerCoachId ?? null`. See `handleRestrictedResultsImport`
 * below (shared step-by-step contract with the coach route's twin).
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
import { buildRestrictedImportPlan } from "@/lib/assessments/esperto-import/restricted-plan";
import type { EspertoRestricted } from "@/lib/assessments/esperto-import/types";
import {
  commitRestrictedImport,
  RestrictedCommitError,
  type RestrictedCommitCtx,
} from "@/lib/assessments/esperto-import/restricted-commit";
import {
  resolveRestrictedImportContext,
  buildRealRestrictedCommitDb,
  resolveEspertoImportHashSalt,
  emitEspertoImportMetric,
  type RestrictedCommitPrismaLike,
} from "@/lib/assessments/esperto-import/restricted-route-helpers";
import { isEspertoSuFullImportEnabled } from "@/lib/assessments/wave-o-flags";
import {
  canAccessOrganization,
  canCreateCampaign,
  asAccessDb,
} from "@/lib/assessments/access-control";
import type { ApiActor } from "@/lib/auth/access-control";

/** Upload bounds (plan 12a step 9). */
const MAX_BYTES = 5 * 1024 * 1024; // 5 MB
const MAX_MEMBER_ROWS = 2000;

/**
 * Wave O batch cap (R3-M1) — enforced right after parsing every file, BEFORE
 * any DB work. The existing `MAX_BYTES` (5 MB) body-size guard already covers
 * this kind's total payload bytes too (files[] is part of the same JSON body
 * measured before JSON.parse) — no separate byte cap is needed here.
 */
const MAX_RESTRICTED_FILES = 300;

/**
 * Wave O commit budget: up to 300 files in one `db.$transaction` (create-or-
 * reuse campaign + per-row invitation/submission writes) can exceed the
 * platform's default function timeout. Precedent: `webhooks/stripe/route.ts`
 * sets `maxDuration = 30` for its (much lighter) webhook handler; this route's
 * single-transaction commit budget is heavier, so 60s.
 */
export const maxDuration = 60;

// ownerCoachId + companyName are REQUIRED for kind:roster (they resolve the
// target org). For kind:results they are unused — the org is resolved by joining
// the report's memberids to OrgRespondent.externalId, and the campaign's owner
// coach is derived from that org's ownerCoachId — so both are optional there.
//
// kind:"restrictedResults" (Wave O, additive — roster/results stay byte-for-
// byte unchanged, R3-M4) requires `batchKind` (a stale-client signal),
// `roundLabel`, an EXPLICIT `targetOrgId` (never inferred — R2-M3), and a
// non-empty `files[]`. `aggregateFiles[]` is optional (inspected only for a
// cid-mismatch warning; never written). `payload` is unused for this kind.
const importBodySchema = z
  .object({
    mode: z.enum(["preview", "commit"]),
    kind: z.enum(["roster", "results", "restrictedResults"]),
    ownerCoachId: z.string().min(1).optional(),
    companyName: z.string().min(1).optional(),
    // Raw Esperto export JSON — validated by parseEspertoExport, not here.
    payload: z.unknown().optional(),
    // ── kind:"restrictedResults" fields (Wave O) ──────────────────────────
    batchKind: z.literal("esperto-sufull-restricted-v1").optional(),
    roundLabel: z.string().min(1).optional(),
    targetOrgId: z.string().min(1).optional(),
    files: z.array(z.unknown()).min(1).optional(),
    aggregateFiles: z.array(z.unknown()).optional(),
    ackLowResolution: z.boolean().optional(),
    expectedVersionId: z.string().min(1).optional(),
  })
  .refine(
    (b) => b.kind !== "roster" || (!!b.ownerCoachId && !!b.companyName),
    {
      message: "ownerCoachId and companyName are required for kind:roster",
      path: ["ownerCoachId"],
    },
  )
  .refine((b) => b.kind !== "restrictedResults" || b.batchKind === "esperto-sufull-restricted-v1", {
    message: 'batchKind must be "esperto-sufull-restricted-v1" for kind:restrictedResults',
    path: ["batchKind"],
  })
  .refine((b) => b.kind !== "restrictedResults" || !!b.roundLabel, {
    message: "roundLabel is required for kind:restrictedResults",
    path: ["roundLabel"],
  })
  .refine((b) => b.kind !== "restrictedResults" || !!b.targetOrgId, {
    message: "targetOrgId is required for kind:restrictedResults",
    path: ["targetOrgId"],
  })
  .refine((b) => b.kind !== "restrictedResults" || !!b.files, {
    message: "files is required for kind:restrictedResults",
    path: ["files"],
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
    const {
      mode,
      kind,
      ownerCoachId,
      companyName,
      payload,
      roundLabel,
      targetOrgId,
      files,
      aggregateFiles,
      ackLowResolution,
      expectedVersionId,
    } = validation.data;

    // ── Results import — its own pipeline (own parse-shape + resolution). ──
    if (kind === "results") {
      return handleResultsImport(payload, mode, {
        userId: actor.userId,
        email: actor.email,
      });
    }

    // ── Restricted results import (Wave O) — its own pipeline. The schema's
    //    refine()s guarantee roundLabel/targetOrgId/files are present here. ──
    if (kind === "restrictedResults") {
      return handleRestrictedResultsImport(
        files as unknown[],
        (aggregateFiles ?? undefined) as unknown[] | undefined,
        roundLabel as string,
        targetOrgId as string,
        ackLowResolution ?? false,
        mode,
        expectedVersionId,
        actor,
      );
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

// ────────────────────────────────────────────────────────────────────────
// Restricted-results (SU-Full) import pipeline — Wave O, ADMIN-scoped.
//
// Identical contract to the coach route's twin
// (`/api/assessments/import`'s `handleRestrictedResultsImport`) EXCEPT: no
// `ownerCoachId` concept for this path — an admin-created imported campaign
// gets `createdByCoachId: null` (mirroring this file's own QSP admin path,
// `ownerCoachId: org.ownerCoachId ?? null`, which is ALSO null whenever the
// target org has no owning coach). See the coach route's copy of this
// function for the full step-by-step commentary; kept in sync deliberately
// rather than factored into a shared function so each route's dispatcher
// stays a simple, auditable call with its own actor shape.
// ────────────────────────────────────────────────────────────────────────

async function handleRestrictedResultsImport(
  files: unknown[],
  aggregateFiles: unknown[] | undefined,
  roundLabel: string,
  targetOrgId: string,
  ackLowResolution: boolean,
  mode: "preview" | "commit",
  expectedVersionId: string | undefined,
  actor: ApiActor,
): Promise<NextResponse> {
  // ── 1. Flag gate FIRST — dark 404, no DB touched. ─────────────────────────
  if (!isEspertoSuFullImportEnabled({ organizationId: targetOrgId })) {
    return NextResponse.json(
      { success: false, error: "Organization not found" },
      { status: 404 },
    );
  }

  // ── 2. Explicit org access check (admin bypasses ownership, but the org
  //    must still exist and be live — canAccessOrganization enforces both). ──
  const orgAllowed = await canAccessOrganization(asAccessDb(db), actor, targetOrgId);
  if (!orgAllowed) {
    return NextResponse.json(
      { success: false, error: "Organization not found" },
      { status: 404 },
    );
  }

  // ── 3. Resolve template/version/crosswalk/scorableStableKeys. ─────────────
  const ctxResult = await resolveRestrictedImportContext(db);
  if (!ctxResult.ok) {
    const body: { success: false; error: string; details?: unknown; problems?: string[] } = {
      success: false,
      error: ctxResult.error,
    };
    if (ctxResult.code === "TEMPLATE_VERSION_NOT_PUBLISHED") body.details = ctxResult.details;
    if (ctxResult.code === "CROSSWALK_INCOMPATIBLE_WITH_VERSION") body.problems = ctxResult.problems;
    return NextResponse.json(body, { status: ctxResult.status });
  }
  const { template, publishedVersion, crosswalk, scorableStableKeys } = ctxResult;

  // ── 4. Entitlement — run for BOTH preview and commit (admin bypasses). ────
  const entitled = await canCreateCampaign(asAccessDb(db), actor, template.id);
  if (!entitled) {
    return NextResponse.json(
      { success: false, error: "Not authorized to create campaign for this template" },
      { status: 403 },
    );
  }

  // ── 5. Parse + classify every file — whole-batch 400 on ANY failure. ──────
  if (files.length > MAX_RESTRICTED_FILES) {
    return NextResponse.json(
      { success: false, error: `Too many files (max ${MAX_RESTRICTED_FILES})` },
      { status: 413 },
    );
  }

  const parsedFiles: EspertoRestricted[] = [];
  const fileErrors: { index: number; reason: string }[] = [];
  for (let i = 0; i < files.length; i++) {
    try {
      const parsed = parseEspertoExport(files[i]);
      if (parsed.kind !== "restricted-individual") {
        fileErrors.push({ index: i, reason: `expected restricted-individual, got ${parsed.kind}` });
        continue;
      }
      parsedFiles.push(parsed.data);
    } catch (error) {
      if (error instanceof EspertoParseError) {
        fileErrors.push({ index: i, reason: error.reason });
      } else {
        throw error;
      }
    }
  }
  if (fileErrors.length > 0) {
    return NextResponse.json(
      { success: false, error: "One or more files failed to parse", fileErrors },
      { status: 400 },
    );
  }

  // ── 6. Parse aggregateFiles (optional) — cid-mismatch → warning only. ─────
  const aggregateCidMismatchWarnings: { reason: string; detail: string }[] = [];
  const batchCid = parsedFiles[0]?.cid;
  if (aggregateFiles && aggregateFiles.length > 0) {
    for (let i = 0; i < aggregateFiles.length; i++) {
      try {
        const parsed = parseEspertoExport(aggregateFiles[i]);
        if (parsed.kind === "restricted-aggregate" && parsed.data.cid !== batchCid) {
          aggregateCidMismatchWarnings.push({
            reason: "aggregate-cid-mismatch",
            detail: `aggregateFiles[${i}] has cid "${parsed.data.cid}" which does not match the individual batch's cid "${batchCid}"`,
          });
        }
      } catch {
        // Malformed aggregate files are inspected best-effort only; never
        // block the batch or affect the write path over them.
      }
    }
  }

  // ── 7. Resolve targetOrgId's FULL roster (explicit org, not memberid-joined). ─
  const respondents = await db.orgRespondent.findMany({
    where: { organizationId: targetOrgId, deletedAt: null },
    select: { id: true, externalId: true },
  });

  // ── 8. Build the pure plan. ────────────────────────────────────────────────
  const plan = buildRestrictedImportPlan({
    files: parsedFiles,
    crosswalk,
    roundLabel,
    targetOrgId,
    respondents,
    versionQuestions: ctxResult.versionQuestions,
    scorableStableKeys,
    hashSalt: resolveEspertoImportHashSalt(),
  });

  // ── 9. Preview: read-only, NO writes. ──────────────────────────────────────
  if (mode === "preview") {
    emitEspertoImportMetric("preview", {
      organizationId: targetOrgId,
      templateAlias: crosswalk.templateAlias,
      fileCount: files.length,
      blockReasons: plan.blocks.map((b) => b.reason),
      skipReasonCounts: countBy(plan.skips.map((s) => s.reason)),
      warningReasons: [...plan.warnings.map((w) => w.reason), ...aggregateCidMismatchWarnings.map((w) => w.reason)],
      flagState: "on",
    });
    return NextResponse.json({
      success: true,
      data: {
        summary: {
          creates: plan.campaign?.rows.length ?? 0,
          skips: plan.skips.length,
          blocks: plan.blocks,
          warnings: [...plan.warnings, ...aggregateCidMismatchWarnings],
          ignoredArtifacts: aggregateFiles?.length ?? 0,
        },
        resolvedVersionId: publishedVersion.id,
      },
    });
  }

  // ── 10. Commit: require expectedVersionId; fresh re-resolution; write. ────
  if (!expectedVersionId) {
    return NextResponse.json(
      { success: false, error: "expectedVersionId is required for mode:commit" },
      { status: 400 },
    );
  }

  // Fresh, independent re-resolution — NOT a reuse of the value computed
  // above at step 3 (this IS the point of the check: catch a version publish
  // race between this route's own preview and commit calls).
  const freshCtxResult = await resolveRestrictedImportContext(db);
  if (!freshCtxResult.ok) {
    const body: { success: false; error: string; details?: unknown; problems?: string[] } = {
      success: false,
      error: freshCtxResult.error,
    };
    if (freshCtxResult.code === "TEMPLATE_VERSION_NOT_PUBLISHED") body.details = freshCtxResult.details;
    if (freshCtxResult.code === "CROSSWALK_INCOMPATIBLE_WITH_VERSION") body.problems = freshCtxResult.problems;
    return NextResponse.json(body, { status: freshCtxResult.status });
  }

  // Admin path: no ownerCoachId concept — an admin-created imported campaign
  // has createdByCoachId: null (mirrors this file's QSP path's
  // `ownerCoachId: org.ownerCoachId ?? null` when the target org has no
  // owning coach).
  const commitCtx: RestrictedCommitCtx = {
    templateId: template.id,
    organizationId: targetOrgId,
    ownerCoachId: null,
    language: publishedVersion.language,
    createdByUserId: actor.userId,
    previewResolvedVersionId: expectedVersionId,
    commitResolvedVersionId: freshCtxResult.publishedVersion.id,
    versionForScoringForNewCampaign: {
      questions: publishedVersion.questions,
      sections: publishedVersion.sections,
      scoringConfig: publishedVersion.scoringConfig,
    } as unknown as TemplateVersionForScoring,
    ackLowResolution,
  };

  emitEspertoImportMetric("commit_attempt", {
    organizationId: targetOrgId,
    templateAlias: crosswalk.templateAlias,
    fileCount: files.length,
  });

  const commitStartedAt = Date.now();
  try {
    const commitDb = buildRealRestrictedCommitDb(db as unknown as RestrictedCommitPrismaLike);
    const result = await commitRestrictedImport(commitDb, plan, commitCtx, actor);
    emitEspertoImportMetric("commit_result", {
      organizationId: targetOrgId,
      templateAlias: crosswalk.templateAlias,
      outcome: result.kind,
      submissionsCreated: "submissionsCreated" in result ? result.submissionsCreated : 0,
      latencyMs: Date.now() - commitStartedAt,
    });
    return NextResponse.json({
      success: true,
      data: { outcome: result, skippedArtifacts: aggregateFiles?.length ?? 0 },
    });
  } catch (error) {
    if (error instanceof RestrictedCommitError) {
      emitEspertoImportMetric("commit_conflict", {
        errorCode: error.code,
        organizationId: targetOrgId,
        templateAlias: crosswalk.templateAlias,
      });
      const status = RESTRICTED_COMMIT_ERROR_STATUS[error.code];
      return NextResponse.json(
        { success: false, error: error.code, message: error.message, details: error.details },
        { status },
      );
    }
    throw error;
  }
}

/** RestrictedCommitError.code → HTTP status (per the wiring plan's §D.10 table). */
const RESTRICTED_COMMIT_ERROR_STATUS: Record<RestrictedCommitError["code"], number> = {
  "plan-blocked": 409,
  "entitlement-denied": 403,
  "org-not-found": 404,
  "cid-mismatch": 409,
  "low-resolution-batch": 409,
  "version-changed-since-preview": 409,
  "divergent-reimport": 409,
  "externalId-conflict": 409,
};

/** Count occurrences of each string in `values` — used for skipReasonCounts. */
function countBy(values: string[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const v of values) counts[v] = (counts[v] ?? 0) + 1;
  return counts;
}

// Avoid unused-import lint on the field-map normalizer (kept for parity with
// the live respondents route; the route resolves identity via the plan layer).
void normalizeEmail;
