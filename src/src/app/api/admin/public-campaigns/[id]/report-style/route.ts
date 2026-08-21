import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { getApiActor, isPrivilegedRole } from "@/lib/auth/authorization";
import { logAudit } from "@/lib/audit";
import { RateLimits, withRateLimit } from "@/lib/rate-limit";
import { REPORT_STYLE_KEYS } from "@/lib/assessments/report-style-registry";
import { isReportStyleSelectionEnabled } from "@/lib/assessments/wave-report-styles-flags";

const REPORT_STYLE_LOCKED_MESSAGE =
  "Report appearance was locked when the first response completed. Refresh to see the final style.";

const reportStyleBodySchema = z
  .object({ reportStyle: z.enum(REPORT_STYLE_KEYS) })
  .strict();

type PublicAppearanceCampaign = {
  id: string;
  templateId: string;
  accessMode: string;
  createdByCoachId: string | null;
  deletedAt: Date | null;
  reportStyle: (typeof REPORT_STYLE_KEYS)[number];
  reportStyleSource: "TEMPLATE_DEFAULT" | "CAMPAIGN_OVERRIDE";
  reportStyleLockedAt: Date | null;
};

const PUBLIC_APPEARANCE_SELECT = {
  id: true,
  templateId: true,
  accessMode: true,
  createdByCoachId: true,
  deletedAt: true,
  reportStyle: true,
  reportStyleSource: true,
  reportStyleLockedAt: true,
} as const;

function lockedResponse(campaign?: PublicAppearanceCampaign | null) {
  return NextResponse.json(
    {
      error: "REPORT_STYLE_LOCKED",
      message: REPORT_STYLE_LOCKED_MESSAGE,
      ...(campaign
        ? {
            data: {
              id: campaign.id,
              reportStyle: campaign.reportStyle,
              reportStyleSource: campaign.reportStyleSource,
              reportStyleLockedAt: campaign.reportStyleLockedAt,
            },
          }
        : {}),
    },
    { status: 409 },
  );
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
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

    const rateLimit = await withRateLimit(request, RateLimits.standard);
    if (!rateLimit.allowed) {
      return NextResponse.json(
        { success: false, error: "Too many requests" },
        { status: 429, headers: rateLimit.headers },
      );
    }

    const body = await request.json().catch(() => null);
    const validation = reportStyleBodySchema.safeParse(body);
    if (!validation.success) {
      return NextResponse.json(
        { success: false, error: validation.error.issues },
        { status: 400 },
      );
    }

    const { id } = await params;
    const campaign = (await db.assessmentCampaign.findUnique({
      where: { id },
      select: PUBLIC_APPEARANCE_SELECT,
    })) as PublicAppearanceCampaign | null;

    if (!campaign || campaign.deletedAt !== null) {
      return NextResponse.json(
        { success: false, error: "Campaign not found" },
        { status: 404 },
      );
    }
    if (
      campaign.accessMode !== "PUBLIC" ||
      campaign.createdByCoachId !== null
    ) {
      return NextResponse.json(
        { success: false, error: "Forbidden" },
        { status: 403 },
      );
    }
    if (campaign.reportStyleLockedAt !== null) {
      return lockedResponse(campaign);
    }
    if (
      !isReportStyleSelectionEnabled({
        templateId: campaign.templateId,
        campaignId: campaign.id,
      })
    ) {
      return NextResponse.json(
        {
          success: false,
          error: "Report appearance is not available for this campaign",
        },
        { status: 400 },
      );
    }

    const { reportStyle } = validation.data;
    const changed = await db.assessmentCampaign.updateMany({
      where: {
        id,
        accessMode: "PUBLIC",
        createdByCoachId: null,
        deletedAt: null,
        reportStyleLockedAt: null,
      },
      data: {
        reportStyle,
        reportStyleSource: "CAMPAIGN_OVERRIDE",
      },
    });
    if (changed.count === 0) {
      const finalCampaign = (await db.assessmentCampaign.findFirst({
        where: {
          id,
          accessMode: "PUBLIC",
          createdByCoachId: null,
          deletedAt: null,
        },
        select: PUBLIC_APPEARANCE_SELECT,
      })) as PublicAppearanceCampaign | null;
      if (finalCampaign?.reportStyleLockedAt) {
        return lockedResponse(finalCampaign);
      }
      return NextResponse.json(
        { success: false, error: "Campaign not found" },
        { status: 404 },
      );
    }

    await logAudit({
      entityType: "AssessmentCampaign",
      entityId: id,
      action: "UPDATE",
      performedBy: actor.email,
      changes: {
        reportStyle,
        reportStyleSource: "CAMPAIGN_OVERRIDE",
      },
    });

    return NextResponse.json({
      success: true,
      data: {
        id,
        reportStyle,
        reportStyleSource: "CAMPAIGN_OVERRIDE",
        reportStyleLockedAt: null,
      },
    });
  } catch (error) {
    console.error("Error updating public campaign report appearance:", error);
    return NextResponse.json(
      { success: false, error: "Internal server error" },
      { status: 500 },
    );
  }
}
