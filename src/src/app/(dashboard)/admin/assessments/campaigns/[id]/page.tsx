/**
 * Admin — campaign detail page (Wave Z, Z-2).
 *
 * Server component. Admin/STAFF oversight + intervention view for ANY campaign,
 * reusing the coach `CampaignDetail` via its host-context props. It calls the
 * existing coach-agnostic building blocks directly (getCampaignOverview /
 * getCampaignRespondents / canViewGroupReport) — NOT `requireCoach`, and NO
 * refactor of the live portal page (the /co-validate decision).
 *
 * Deliberately a reduced-nav variant of the coach detail:
 *   - basePath / hidePortalOnlyLinks retarget the Back link + suppress the
 *     portal-only "View Trends" and "Add members" dead-ends;
 *   - longitudinalRespondentIds is OMITTED (defaults []) — the per-row "over
 *     time" link targets a `requireCoach()` route with no admin equivalent;
 *   - custom-slides AUTHORING is omitted (coach-authoring, not oversight);
 *   - the group-report link IS kept (verified admin-safe) and the full
 *     management surface (close/delete/remove/reminders/resend) rides along.
 */

export const dynamic = "force-dynamic";

import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { getApiActor, isPrivilegedRole } from "@/lib/auth/authorization";
import {
  asAccessDb,
  canManageCampaign,
  canViewGroupReport,
} from "@/lib/assessments/access-control";
import {
  asCampaignDetailDb,
  getCampaignOverview,
  getCampaignRespondents,
} from "@/lib/assessments/campaign-detail";
import { CampaignDetail } from "@/components/assessments/CampaignDetail";
import { waveDCustomHtmlEmailEnabled } from "@/lib/assessments/wave-d-feature-flags";
import {
  isGroupReportEnabled,
  isGroupReportAlias,
} from "@/lib/assessments/wave-f-flags";

const ADMIN_CAMPAIGNS = "/admin/assessments/campaigns";

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function AdminCampaignDetailPage({ params }: PageProps) {
  const actor = await getApiActor();
  if (!actor) {
    redirect("/login");
  }
  if (!isPrivilegedRole(actor.role)) {
    redirect("/unauthorized");
  }
  const { id } = await params;

  // canManageCampaign("read") admits privileged actors for any live campaign;
  // a deleted/unknown id → redirect to the admin list (NEVER a /portal path).
  const allowed = await canManageCampaign(asAccessDb(db), actor, id, "read");
  if (!allowed) {
    redirect(ADMIN_CAMPAIGNS);
  }

  const detailDb = asCampaignDetailDb(db);
  const [overview, respondents] = await Promise.all([
    getCampaignOverview(detailDb, id),
    getCampaignRespondents(detailDb, id),
  ]);

  // Group-report link visibility — mirrors the portal composition (calls the
  // same shared gates: INVITED + allowlisted alias + SU-Full publish guard +
  // flag + canViewGroupReport → true for privileged). Kept because the report
  // is a real oversight surface and is admin-safe (the (report) layout is
  // auth-free; the report page's own gate admits privileged).
  const campaignForFlag = await db.assessmentCampaign.findFirst({
    where: { id, deletedAt: null },
    select: {
      id: true,
      status: true,
      accessMode: true,
      createdByCoachId: true,
      organizationId: true,
      template: { select: { alias: true } },
      version: { select: { id: true, publishedAt: true } },
    },
  });
  const canShowGroupReport =
    campaignForFlag !== null &&
    campaignForFlag.accessMode === "INVITED" &&
    isGroupReportAlias(campaignForFlag.template?.alias) &&
    (campaignForFlag.template?.alias !== "scaling-up-full" ||
      campaignForFlag.version?.publishedAt != null) &&
    isGroupReportEnabled(actor, campaignForFlag) &&
    (await canViewGroupReport(asAccessDb(db), actor, id));

  return (
    <div>
      {/* Breadcrumb */}
      <div className="wf-breadcrumb">
        <a href="/admin/dashboard">Admin</a>
        <span className="wf-breadcrumb-sep">/</span>
        <a href="/admin/assessments">Assessments</a>
        <span className="wf-breadcrumb-sep">/</span>
        <a href={ADMIN_CAMPAIGNS}>Campaigns</a>
        <span className="wf-breadcrumb-sep">/</span>
        <span className="wf-breadcrumb-current">{overview.campaign.name}</span>
      </div>

      <CampaignDetail
        initialOverview={overview}
        initialRespondents={respondents}
        customHtmlEmailEnabled={waveDCustomHtmlEmailEnabled()}
        canViewGroupReport={canShowGroupReport}
        groupReportHref={`/assessments/${id}/report`}
        basePath={ADMIN_CAMPAIGNS}
        hidePortalOnlyLinks
      />
    </div>
  );
}
