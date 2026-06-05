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
 * Results flow: 501 — implemented in a later slice.
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

/** Upload bounds (plan 12a step 9). */
const MAX_BYTES = 5 * 1024 * 1024; // 5 MB
const MAX_MEMBER_ROWS = 2000;

const importBodySchema = z.object({
  mode: z.enum(["preview", "commit"]),
  kind: z.enum(["roster", "results"]),
  ownerCoachId: z.string().min(1),
  companyName: z.string().min(1),
  // Raw Esperto export JSON — validated by parseEspertoExport, not here.
  payload: z.unknown(),
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
    const { mode, kind, ownerCoachId, companyName, payload } = validation.data;

    // ── Results import is a later slice. ──────────────────────────────────
    if (kind === "results") {
      return NextResponse.json(
        { success: false, error: "results import not yet implemented" },
        { status: 501 },
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

// Avoid unused-import lint on the field-map normalizer (kept for parity with
// the live respondents route; the route resolves identity via the plan layer).
void normalizeEmail;
