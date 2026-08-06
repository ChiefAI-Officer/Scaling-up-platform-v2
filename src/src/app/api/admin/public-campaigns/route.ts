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
import type { Prisma } from "@prisma/client";
import {
  CampaignCreateError,
  resolvePublishedTemplateVersion,
} from "@/lib/assessments/campaign-create-service";
import { DEFAULT_TEMPLATE_LANGUAGE } from "@/lib/assessments/active-version";
import {
  deriveReportStylePreviewCapabilities,
  REPORT_STYLE_KEYS,
  type ReportStyleKey,
} from "@/lib/assessments/report-style-registry";
import { resolveCampaignReportStyle } from "@/lib/assessments/report-style-policy";
import { isReportStylesEnabled } from "@/lib/assessments/wave-report-styles-flags";

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
  publicConfig: z.record(z.string(), z.unknown()).optional().nullable(),
  reportStyle: z.enum(REPORT_STYLE_KEYS).optional(),
});

// ─── GET ─────────────────────────────────────────────────────────────────────

export async function GET() {
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
        { success: false, error: "Forbidden: admin or staff required" },
        { status: 403 },
      );
    }

    const campaigns = await db.assessmentCampaign.findMany({
      where: {
        accessMode: "PUBLIC",
        createdByCoachId: null,
        deletedAt: null,
      },
      include: {
        organization: { select: { id: true, name: true } },
        template: { select: { id: true, name: true, alias: true } },
        version: { select: { questions: true } },
      },
      orderBy: { createdAt: "desc" },
    });

    return NextResponse.json({
      success: true,
      data: campaigns.map((campaign) => ({
        ...campaign,
        reportStylesAvailable: isReportStylesEnabled({
          templateId: campaign.templateId,
          campaignId: campaign.id,
        }),
        reportStylePreviewCapabilities: deriveReportStylePreviewCapabilities({
          templateAlias: campaign.template?.alias,
          questions: campaign.version?.questions ?? [],
        }),
      })),
    });
  } catch (error) {
    console.error("Error listing public campaigns:", error);
    return NextResponse.json(
      { success: false, error: "Internal server error" },
      { status: 500 },
    );
  }
}

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

    const {
      templateId,
      organizationId,
      name,
      openAt,
      closeAt,
      publicConfig,
      reportStyle: explicitReportStyle,
    } = validation.data;
    const publicConfigJson: Prisma.InputJsonValue | undefined = publicConfig
      ? (publicConfig as Prisma.InputJsonValue)
      : undefined;

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
      // C4 (Wave ED8) — shared default-language constant (value-identical to
      // the old "enUS" literal, zero behavior change).
      version = await resolvePublishedTemplateVersion(
        db,
        templateId,
        DEFAULT_TEMPLATE_LANGUAGE,
      );
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
      select: {
        id: true,
        alias: true,
        disabledAt: true,
        defaultReportStyle: true,
      },
    });
    if (!template) {
      return NextResponse.json(
        { success: false, error: "Template not found" },
        { status: 404 }
      );
    }
    // Wave Q (#6): a disabled template cannot be used for NEW campaigns —
    // public campaigns included. UNCONDITIONAL (not flag-gated), mirroring
    // the org campaign-create gate (spec 19q durable rule).
    if (template.disabledAt) {
      return NextResponse.json(
        {
          success: false,
          error: "TEMPLATE_DISABLED",
          message:
            "This template has been disabled and cannot be used for new campaigns.",
        },
        { status: 409 }
      );
    }

    const reportStylesAvailable = isReportStylesEnabled({
      templateId: template.id,
    });
    if (
      !reportStylesAvailable &&
      explicitReportStyle !== undefined
    ) {
      return NextResponse.json(
        {
          success: false,
          error: "Report appearance is not available for this campaign",
        },
        { status: 400 },
      );
    }
    const reportStylePolicy = resolveCampaignReportStyle(
      reportStylesAvailable ? explicitReportStyle : undefined,
      reportStylesAvailable
        ? (template.defaultReportStyle as ReportStyleKey)
        : "CLASSIC",
    );

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
    const createdByUserId = actor.userId;

    function campaignCreateData(alias: string) {
      return {
        name,
        templateId,
        versionId: version.id,
        organizationId,
        language: version.language,
        alias,
        status: "DRAFT" as const,
        accessMode: "PUBLIC" as const,
        publicConfig: publicConfigJson,
        openAt: openAtDate,
        endMode,
        closeAt: closeAtDate,
        reportStyle: reportStylePolicy.reportStyle,
        reportStyleSource: reportStylePolicy.reportStyleSource,
        reportStyleLockedAt: null,
        createdBy: createdByUserId,
        createdByCoachId: null,
      };
    }

    // 7. Create campaign with P2002 alias-collision fallback
    let campaign;
    try {
      campaign = await db.assessmentCampaign.create({
        data: campaignCreateData(aliasBase),
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
          data: campaignCreateData(aliasFallback),
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
        reportStyle: reportStylePolicy.reportStyle,
        reportStyleSource: reportStylePolicy.reportStyleSource,
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
