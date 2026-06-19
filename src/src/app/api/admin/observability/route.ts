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
 *     groupReports: { views24h, views7d },  // Wave F #22 (R3-M1), DB-derived
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
      groupReportViewsLast24h,
      groupReportViewsLast7d,
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
      // Wave F #22 (R3-M1): the group report (bulk-PII surface) writes exactly
      // one GROUP_REPORT_VIEW AuditLog row per successful view (fail-closed).
      // Derive a dedicated panel from those rows — same DB-derived mechanism as
      // every other counter here. Successful VIEWS are the auditable signal;
      // the rest of the assessment.group_report.* signal set (rate_limited /
      // authz_deny / degraded / orphan / audit_failure / render_failure) is
      // log-derived (see docs runbook) since those paths intentionally write
      // no audit row.
      db.auditLog.count({
        where: {
          action: "GROUP_REPORT_VIEW",
          timestamp: { gte: oneDayAgo },
        },
      }),
      db.auditLog.count({
        where: {
          action: "GROUP_REPORT_VIEW",
          timestamp: { gte: sevenDaysAgo },
        },
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
        groupReports: {
          // DB-derived (GROUP_REPORT_VIEW audit rows). The other
          // assessment.group_report.* signals are log-derived — see the
          // Wave F ops runbook for the log queries + alert gates.
          views24h: groupReportViewsLast24h,
          views7d: groupReportViewsLast7d,
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
