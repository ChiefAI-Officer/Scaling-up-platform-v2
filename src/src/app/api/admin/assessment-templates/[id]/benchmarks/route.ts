/**
 * Wave S (spec 19s S-3) — PUT /api/admin/assessment-templates/[id]/benchmarks.
 *
 * Atomic full-set reconcile of a template's QUESTION-kind peer benchmarks
 * (D8/D14): the submitted `entries` array is the complete desired set — a key
 * absent from it means "delete the row". Values are bounds-checked (0–10) and
 * rounded to 1dp by `reconcileQuestionBenchmarks`; keys are validated against
 * the currently-published version's SLIDER_LIKERT questions.
 *
 * Guard ladder (S-2 + house convention): rate limit → getApiActor 401 →
 * isPrivilegedRole 403 → flag OFF 404 → template missing/deleted 404 → alias
 * not editor-enabled 404.
 *
 * No published version → 409 `TEMPLATE_VERSION_NOT_PUBLISHED`: chosen over
 * 400 because the body is well-formed — the TEMPLATE's state conflicts with
 * the operation, matching the house 409 conflict-state family
 * (TEMPLATE_HAS_ACTIVE_CAMPAIGNS, ALREADY_PUBLISHED). The campaign-create
 * path maps the same condition to 422, but that constant travels through
 * CampaignCreateError; here the route owns the status directly.
 *
 * PUT only — the server-rendered PeerBenchmarksPanel receives its initial
 * data as props and this route returns the saved set, so no GET exists.
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { getApiActor, isPrivilegedRole } from "@/lib/auth/authorization";
import { logAudit } from "@/lib/audit";
import { RateLimits, withRateLimit } from "@/lib/rate-limit";
import { isPeerBenchmarksEnabled } from "@/lib/assessments/wave-s-flags";
import { activePublishedWhere } from "@/lib/assessments/active-version";
import {
  isPeerEditorEnabledAlias,
  listRatingQuestionKeys,
  reconcileQuestionBenchmarks,
  PeerBenchmarkValidationError,
  MAX_BENCHMARK_ENTRIES,
} from "@/lib/assessments/peer-benchmarks";

const PutBenchmarksBodySchema = z.object({
  entries: z
    .array(
      z.object({
        stableKey: z.string().min(1).max(200),
        value: z.number(),
      }),
    )
    .max(MAX_BENCHMARK_ENTRIES),
});

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
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

    // Flag OFF ⇒ the capability does not exist (404, zero DB reads).
    if (!isPeerBenchmarksEnabled()) {
      return NextResponse.json(
        { success: false, error: "Not found" },
        { status: 404 },
      );
    }

    const { id } = await params;
    const template = await db.assessmentTemplate.findFirst({
      where: { id, deletedAt: null },
      select: { id: true, alias: true },
    });
    if (!template) {
      return NextResponse.json(
        { success: false, error: "Template not found" },
        { status: 404 },
      );
    }
    // Only aliases with a governed benchmark dataset expose the editor.
    // Scaling Up Full is editor-enabled before its paired-bar report UI ships.
    if (!isPeerEditorEnabledAlias(template.alias)) {
      return NextResponse.json(
        { success: false, error: "Not found" },
        { status: 404 },
      );
    }

    const body = await request.json().catch(() => ({}));
    const parsed = PutBenchmarksBodySchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: "Invalid body", details: parsed.error.flatten() },
        { status: 400 },
      );
    }

    // validKeys = the current ACTIVE version's rating questions. Latest
    // published non-archived wins (same resolution rule as campaign create).
    // Wave ED8 — archived-exclusion is PERSISTED admin intent (Wave-Q
    // doctrine): expressed in the DB where, NEVER flag-gated.
    const published = await db.assessmentTemplateVersion.findFirst({
      where: { templateId: id, ...activePublishedWhere },
      orderBy: { versionNumber: "desc" },
      select: { questions: true },
    });
    if (!published) {
      return NextResponse.json(
        {
          success: false,
          error: "TEMPLATE_VERSION_NOT_PUBLISHED",
          message:
            "This template has no published version — publish one before setting peer averages.",
        },
        { status: 409 },
      );
    }
    const validKeys = new Set(
      listRatingQuestionKeys(published.questions, template.alias).map(
        (q) => q.stableKey,
      ),
    );

    try {
      const { before, after } = await reconcileQuestionBenchmarks(db, {
        templateId: template.id,
        entries: parsed.data.entries,
        validKeys,
      });

      // Benchmark values are non-PII platform config — the full before/after
      // delta goes in the audit trail (S-6).
      await logAudit({
        entityType: "ASSESSMENT_TEMPLATE",
        entityId: template.id,
        action: "BENCHMARKS_RECONCILED",
        performedBy: actor.email ?? actor.userId,
        changes: { before, after },
      });

      return NextResponse.json({
        success: true,
        data: {
          entries: Object.entries(after).map(([stableKey, value]) => ({
            stableKey,
            value,
          })),
        },
      });
    } catch (error) {
      if (error instanceof PeerBenchmarkValidationError) {
        return NextResponse.json(
          { success: false, error: error.code, message: error.message },
          { status: 400 },
        );
      }
      throw error;
    }
  } catch (error) {
    console.error("Error reconciling template benchmarks:", error);
    return NextResponse.json(
      { success: false, error: "Failed to save peer averages" },
      { status: 500 },
    );
  }
}
