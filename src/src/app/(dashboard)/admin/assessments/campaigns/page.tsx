/**
 * Admin — Campaigns oversight page (Wave Z, Z-2).
 *
 * Server-component shell (admin/STAFF gate at request time) that lists ALL
 * INVITED campaigns across every company, grouped by company, reusing the coach
 * `CampaignsListWithFilter` with the admin detail base path. PUBLIC campaigns
 * are excluded — they have their own "Public Campaigns" page (the two flows stay
 * distinct); imported historical rounds (accessMode INVITED, CLOSED) ARE
 * included. Drill-down → the admin campaign-detail page.
 *
 * The campaign list APIs already admit privileged actors, so no route change.
 */

export const dynamic = "force-dynamic";

import { redirect } from "next/navigation";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth/auth";
import { db } from "@/lib/db";
import {
  CampaignsListWithFilter,
  type CampaignListItem,
} from "@/components/assessments/CampaignsListWithFilter";
import { toCampaignListItems } from "@/lib/assessments/campaign-list-items";
import {
  asCampaignListEditionDb,
  resolveCampaignListEditions,
} from "@/lib/assessments/campaign-list-editions";

export default async function AdminAssessmentCampaignsPage() {
  const session = await getServerSession(authOptions);
  if (!session) {
    redirect("/login");
  }
  const role = (session.user as { role?: string } | undefined)?.role;
  if (role !== "ADMIN" && role !== "STAFF") {
    redirect("/unauthorized");
  }

  // All INVITED campaigns, every company, all statuses (incl. imported CLOSED).
  // PUBLIC excluded (own page). Same include shape the shared mapper expects.
  const campaigns = await db.assessmentCampaign.findMany({
    where: { accessMode: "INVITED", deletedAt: null },
    include: {
      organization: { select: { id: true, name: true } },
      template: { select: { id: true, name: true } },
      version: {
        select: {
          templateId: true,
          versionNumber: true,
          language: true,
          publishedAt: true,
          archivedAt: true,
        },
      },
      participants: { select: { id: true, respondentId: true } },
      invitations: {
        select: {
          respondentId: true,
          status: true,
          sentAt: true,
          revokedAt: true,
        },
      },
    },
    orderBy: { createdAt: "desc" },
  });

  const editionsByCampaignId = await resolveCampaignListEditions(
    asCampaignListEditionDb(db),
    campaigns,
  );
  const items: CampaignListItem[] = toCampaignListItems(
    campaigns,
    editionsByCampaignId,
  );

  return (
    <div>
      {/* Breadcrumb */}
      <div className="wf-breadcrumb">
        <a href="/admin/dashboard">Admin</a>
        <span className="wf-breadcrumb-sep">/</span>
        <a href="/admin/assessments">Assessments</a>
        <span className="wf-breadcrumb-sep">/</span>
        <span className="wf-breadcrumb-current">Campaigns</span>
      </div>

      {/* Page header */}
      <div className="wf-page-header-row">
        <div>
          <h2 className="wf-page-title">Campaigns</h2>
          <p className="wf-page-subtitle-strong">
            Every invited-flow campaign across all companies, grouped by company.
            Includes imported historical rounds. Public self-enroll campaigns
            live on the <a href="/admin/assessments/public-campaigns">Public
            Campaigns</a> page. Admin and STAFF only.
          </p>
        </div>
      </div>

      <CampaignsListWithFilter
        campaigns={items}
        detailBasePath="/admin/assessments/campaigns"
      />
    </div>
  );
}
