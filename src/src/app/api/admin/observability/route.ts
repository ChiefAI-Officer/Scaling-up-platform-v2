/**
 * Assessment v7.6 — Admin observability dashboard data (DB-derived, v1).
 *
 * The full spec ([docs/specs/v7.6/06-observability.md]) calls for 7
 * Vercel/Inngest-backed metrics + 6 alert gates. v1 ships static — this
 * route returns DB-derived counters that give operators a usable signal
 * for "is the platform alive and adopted" without the time-series
 * backend. v1.5 can swap this for a real metrics query.
 *
 * Admin-only.
 *
 * Returns:
 *   {
 *     coaches: { active, pending, deactivated },
 *     orgs: { total, withCampaigns },
 *     templates: { total, publishedVersions, draftVersions },
 *     campaigns: { draft, active, closed, invited, public },
 *     submissions: { total, last24h, last7d, public, invited },
 *     auditLog: { last24h, byAction: Record<string, number> },
 *     timestamp: ISO string
 *   }
 */

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getApiActor, isPrivilegedRole } from "@/lib/auth/authorization";

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

    const now = new Date();
    const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

    const [
      coachActive,
      coachPending,
      coachDeactivated,
      orgsTotal,
      orgsWithCampaigns,
      templatesTotal,
      versionsPublished,
      versionsDraft,
      campaignsDraft,
      campaignsActive,
      campaignsClosed,
      campaignsInvited,
      campaignsPublic,
      submissionsTotal,
      submissionsLast24h,
      submissionsLast7d,
      submissionsPublic,
      submissionsInvited,
      auditLast24h,
      auditByActionRaw,
    ] = await Promise.all([
      db.coach.count({ where: { certificationStatus: "ACTIVE" } }),
      db.coach.count({ where: { certificationStatus: "PENDING" } }),
      db.coach.count({ where: { certificationStatus: "DEACTIVATED" } }),
      db.organization.count({ where: { deletedAt: null } }),
      db.organization.count({
        where: { deletedAt: null, campaigns: { some: {} } },
      }),
      db.assessmentTemplate.count({ where: { deletedAt: null } }),
      db.assessmentTemplateVersion.count({
        where: { publishedAt: { not: null } },
      }),
      db.assessmentTemplateVersion.count({ where: { publishedAt: null } }),
      // SEC-M6: exclude soft-deleted campaigns from operator counters.
      db.assessmentCampaign.count({ where: { status: "DRAFT", deletedAt: null } }),
      db.assessmentCampaign.count({ where: { status: "ACTIVE", deletedAt: null } }),
      db.assessmentCampaign.count({ where: { status: "CLOSED", deletedAt: null } }),
      db.assessmentCampaign.count({ where: { accessMode: "INVITED", deletedAt: null } }),
      db.assessmentCampaign.count({ where: { accessMode: "PUBLIC", deletedAt: null } }),
      db.assessmentSubmission.count(),
      db.assessmentSubmission.count({
        where: { submittedAt: { gte: oneDayAgo } },
      }),
      db.assessmentSubmission.count({
        where: { submittedAt: { gte: sevenDaysAgo } },
      }),
      db.assessmentSubmission.count({ where: { respondentId: null } }),
      db.assessmentSubmission.count({ where: { respondentId: { not: null } } }),
      db.auditLog.count({ where: { timestamp: { gte: oneDayAgo } } }),
      db.auditLog.groupBy({
        by: ["action"],
        where: { timestamp: { gte: oneDayAgo } },
        _count: { _all: true },
      }),
    ]);

    const byAction: Record<string, number> = {};
    for (const row of auditByActionRaw as Array<{
      action: string;
      _count: { _all: number };
    }>) {
      byAction[row.action] = row._count._all;
    }

    return NextResponse.json({
      success: true,
      data: {
        coaches: {
          active: coachActive,
          pending: coachPending,
          deactivated: coachDeactivated,
        },
        orgs: {
          total: orgsTotal,
          withCampaigns: orgsWithCampaigns,
        },
        templates: {
          total: templatesTotal,
          publishedVersions: versionsPublished,
          draftVersions: versionsDraft,
        },
        campaigns: {
          draft: campaignsDraft,
          active: campaignsActive,
          closed: campaignsClosed,
          invited: campaignsInvited,
          public: campaignsPublic,
        },
        submissions: {
          total: submissionsTotal,
          last24h: submissionsLast24h,
          last7d: submissionsLast7d,
          public: submissionsPublic,
          invited: submissionsInvited,
        },
        auditLog: {
          last24h: auditLast24h,
          byAction,
        },
        timestamp: now.toISOString(),
      },
    });
  } catch (error) {
    console.error("Error building observability dashboard:", error);
    return NextResponse.json(
      { success: false, error: "Failed to build dashboard" },
      { status: 500 },
    );
  }
}
