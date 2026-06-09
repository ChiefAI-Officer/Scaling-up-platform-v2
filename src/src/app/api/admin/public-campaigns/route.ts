/**
 * Admin Public Campaigns — Task 8 (Quick Assessment PUBLIC flow).
 *
 * POST /api/admin/public-campaigns
 *   Create an accessMode="PUBLIC" campaign for a published template.
 *   Admin/STAFF-only. Coaches are forbidden.
 *   organizationId is REQUIRED (schema reality: NOT NULL FK — no synthetic rows).
 *
 * Spec ref: docs/specs/v7.6/13-assessment-brand-and-results-report.md
 * Designed for quick/public assessments where respondents self-enroll.
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { getApiActor, isPrivilegedRole } from "@/lib/auth/authorization";
import { logAudit } from "@/lib/audit";
import { RateLimits, withRateLimit } from "@/lib/rate-limit";
import {
  CampaignCreateError,
  resolvePublishedTemplateVersion,
} from "@/lib/assessments/campaign-create-service";

// ─── alias helpers (copied from assessment-campaigns/route.ts) ───────────────

function pad2(n: number): string {
  return n.toString().padStart(2, "0");
}

function buildAliasTimestamp(d: Date): string {
  const yy = (d.getUTCFullYear() % 100).toString().padStart(2, "0");
  return (
    yy +
    pad2(d.getUTCMonth() + 1) +
    pad2(d.getUTCDate()) +
    pad2(d.getUTCHours()) +
    pad2(d.getUTCMinutes()) +
    pad2(d.getUTCSeconds())
  );
}

function slugifyForAlias(s: string): string {
  return (
    s
      .toLowerCase()
      .normalize("NFKD")
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^_+|_+$/g, "")
      .slice(0, 80) || "x"
  );
}

// ─── Zod schema ──────────────────────────────────────────────────────────────

const createPublicCampaignSchema = z.object({
  templateId: z.string().min(1),
  organizationId: z.string().min(1),
  name: z.string().min(1).max(200),
  openAt: z.string().min(1),
  closeAt: z.string().optional().nullable(),
  publicConfig: z.record(z.unknown()).optional().nullable(),
});

// ─── POST ─────────────────────────────────────────────────────────────────────

export async function POST(request: NextRequest) {
  try {
    // 1. Rate limit
    const rateLimit = await withRateLimit(request, RateLimits.standard);
    if (!rateLimit.allowed) {
      return NextResponse.json(
        { success: false, error: "Too many requests" },
        { status: 429, headers: rateLimit.headers }
      );
    }

    // 2. Auth
    const actor = await getApiActor();
    if (!actor) {
      return NextResponse.json(
        { success: false, error: "Authentication required" },
        { status: 401 }
      );
    }
    if (!isPrivilegedRole(actor.role)) {
      return NextResponse.json(
        { success: false, error: "Forbidden: admin or staff required" },
        { status: 403 }
      );
    }

    // 3. Body validation
    let rawBody: unknown;
    try {
      rawBody = await request.json();
    } catch {
      return NextResponse.json(
        { success: false, error: "Invalid JSON body" },
        { status: 400 }
      );
    }

    const validation = createPublicCampaignSchema.safeParse(rawBody);
    if (!validation.success) {
      return NextResponse.json(
        { success: false, error: validation.error.issues },
        { status: 400 }
      );
    }

    const { templateId, organizationId, name, openAt, closeAt, publicConfig } =
      validation.data;

    // Validate openAt is a real date
    const openAtDate = new Date(openAt);
    if (Number.isNaN(openAtDate.getTime())) {
      return NextResponse.json(
        { success: false, error: "openAt must be a valid ISO date" },
        { status: 400 }
      );
    }

    // Derive endMode + closeAt
    let endMode: "OPEN_END" | "ENDS_AFTER" = "OPEN_END";
    let closeAtDate: Date | null = null;
    if (closeAt != null && closeAt !== "") {
      const d = new Date(closeAt);
      if (Number.isNaN(d.getTime())) {
        return NextResponse.json(
          { success: false, error: "closeAt must be a valid ISO date" },
          { status: 400 }
        );
      }
      endMode = "ENDS_AFTER";
      closeAtDate = d;
    }

    // 4. Resolve published template version — 422 on unpublished
    let version: Awaited<ReturnType<typeof resolvePublishedTemplateVersion>>;
    try {
      version = await resolvePublishedTemplateVersion(db, templateId, "enUS");
    } catch (err) {
      if (
        err instanceof CampaignCreateError &&
        err.code === "TEMPLATE_VERSION_NOT_PUBLISHED"
      ) {
        return NextResponse.json(
          {
            success: false,
            error: "TEMPLATE_VERSION_NOT_PUBLISHED",
            details: err.details,
          },
          { status: 422 }
        );
      }
      throw err;
    }

    // 5. Fetch template row (alias for slug generation)
    const template = await db.assessmentTemplate.findUnique({
      where: { id: templateId },
      select: { id: true, alias: true },
    });
    if (!template) {
      return NextResponse.json(
        { success: false, error: "Template not found" },
        { status: 404 }
      );
    }

    // 5b. Verify org exists
    const org = await db.organization.findUnique({
      where: { id: organizationId },
      select: { id: true, name: true },
    });
    if (!org) {
      return NextResponse.json(
        { success: false, error: "Organization not found" },
        { status: 404 }
      );
    }

    // 6. Build alias
    const ts = buildAliasTimestamp(new Date());
    const tmplSlug = slugifyForAlias(
      (template as { alias?: string | null }).alias ?? template.id
    );
    const aliasBase = `${tmplSlug}_pub_${ts}`;

    // 7. Create campaign with P2002 alias-collision fallback
    let campaign;
    try {
      campaign = await db.assessmentCampaign.create({
        data: {
          name,
          templateId,
          versionId: version.id,
          organizationId,
          language: version.language,
          alias: aliasBase,
          status: "DRAFT",
          accessMode: "PUBLIC",
          publicConfig: publicConfig ?? undefined,
          openAt: openAtDate,
          endMode,
          closeAt: closeAtDate,
          createdBy: actor.userId,
          createdByCoachId: null,
        },
      });
    } catch (err) {
      if (
        typeof err === "object" &&
        err !== null &&
        "code" in err &&
        (err as { code: string }).code === "P2002"
      ) {
        const aliasFallback = `${aliasBase}_${Math.random()
          .toString(36)
          .slice(2, 8)}`;
        campaign = await db.assessmentCampaign.create({
          data: {
            name,
            templateId,
            versionId: version.id,
            organizationId,
            language: version.language,
            alias: aliasFallback,
            status: "DRAFT",
            accessMode: "PUBLIC",
            publicConfig: publicConfig ?? undefined,
            openAt: openAtDate,
            endMode,
            closeAt: closeAtDate,
            createdBy: actor.userId,
            createdByCoachId: null,
          },
        });
      } else {
        throw err;
      }
    }

    // 8. Audit
    await logAudit({
      entityType: "AssessmentCampaign",
      entityId: campaign.id,
      action: "CREATE",
      performedBy: actor.email,
      changes: {
        accessMode: "PUBLIC",
        templateId,
        organizationId,
        versionId: version.id,
        alias: campaign.alias,
      },
    });

    // 9. Return 201
    return NextResponse.json({ success: true, data: campaign }, { status: 201 });
  } catch (error) {
    console.error("Error creating public campaign:", error);
    return NextResponse.json(
      { success: false, error: "Internal server error" },
      { status: 500 }
    );
  }
}
