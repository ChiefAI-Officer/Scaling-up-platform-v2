/**
 * Admin — Public Campaigns page.
 *
 * Server-component shell that enforces admin/STAFF gate at request time,
 * then delegates to the client component for listing + creating PUBLIC
 * accessMode campaigns.
 *
 * PUBLIC campaigns allow respondents to self-enroll (no invitation required).
 * Coaches are forbidden from this flow — only admin/STAFF may create or publish.
 *
 * Task 8: Quick Assessment PUBLIC campaign admin UI.
 */

export const dynamic = "force-dynamic";

import Link from "next/link";
import { redirect } from "next/navigation";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth/auth";
import { PublicCampaignsManager } from "@/components/admin/PublicCampaignsManager";
import { PublicCampaignList } from "@/components/admin/public-campaigns/PublicCampaignList";
import { isPublicCampaignsSimpleUiEnabled } from "@/lib/assessments/wave-public-campaigns-simple-ui-flags";
import { PageHeader } from "@/components/ui/page-header";
import { isMobileResponsiveEnabled } from "@/lib/mobile-responsive-flags";
import { isReportHtmlExperienceEnabled } from "@/lib/assessments/wave-report-html-authoring-flags";

interface PublicCampaignsPageProps {
  searchParams: Promise<{ created?: string | string[] }>;
}

export default async function AdminPublicCampaignsPage({
  searchParams,
}: PublicCampaignsPageProps) {
  const mobileResponsiveEnabled = isMobileResponsiveEnabled();
  const reportHtmlExperienceActive = isReportHtmlExperienceEnabled();
  const session = await getServerSession(authOptions);
  if (!session) {
    redirect("/login");
  }
  const role = (session.user as { role?: string } | undefined)?.role;
  if (role !== "ADMIN" && role !== "STAFF") {
    redirect("/unauthorized");
  }

  if (isPublicCampaignsSimpleUiEnabled()) {
    const { created } = await searchParams;
    const createdCampaignId =
      typeof created === "string" ? created : undefined;

    return (
      <div className={mobileResponsiveEnabled ? "min-w-0 max-w-full" : undefined}>
        <div className="wf-breadcrumb">
          <a href="/admin/dashboard">Admin</a>
          <span className="wf-breadcrumb-sep">/</span>
          <a href="/admin/assessments">Assessments</a>
          <span className="wf-breadcrumb-sep">/</span>
          <span className="wf-breadcrumb-current">Public campaigns</span>
        </div>

        {mobileResponsiveEnabled ? (
          <PageHeader
            responsiveEnabled
            title="Public campaigns"
            description="Share an assessment with anyone using a public link."
            actions={
              <Link
                className="wf-btn wf-btn-primary min-h-11"
                href="/admin/assessments/public-campaigns/new"
              >
                Create campaign
              </Link>
            }
          />
        ) : (
          <div className="wf-page-header-row">
            <div>
              <h2 className="wf-page-title">Public campaigns</h2>
              <p className="wf-page-subtitle">
                Share an assessment with anyone using a public link.
              </p>
            </div>
            <Link
              className="wf-btn wf-btn-primary"
              href="/admin/assessments/public-campaigns/new"
            >
              Create campaign
            </Link>
          </div>
        )}

        <PublicCampaignList
          createdCampaignId={createdCampaignId}
          {...(mobileResponsiveEnabled ? { responsiveEnabled: true } : {})}
        />
      </div>
    );
  }

  return (
    <div className={mobileResponsiveEnabled ? "min-w-0 max-w-full" : undefined}>
      {/* Breadcrumb */}
      <div className="wf-breadcrumb">
        <a href="/admin/dashboard">Admin</a>
        <span className="wf-breadcrumb-sep">/</span>
        <a href="/admin/assessments">Assessments</a>
        <span className="wf-breadcrumb-sep">/</span>
        <span className="wf-breadcrumb-current">Public Campaigns</span>
      </div>

      {/* Page header */}
      {mobileResponsiveEnabled ? (
        <PageHeader
          responsiveEnabled
          title="Public Campaigns"
          description="Create and publish public assessment campaigns. Respondents self-enroll with no invitation required."
        />
      ) : (
        <div className="wf-page-header-row">
          <div>
            <h2 className="wf-page-title">Public Campaigns</h2>
            <p className="wf-page-subtitle-strong">
              Create and publish{" "}
              <code>accessMode=&quot;PUBLIC&quot;</code> assessment campaigns.
              Respondents self-enroll — no invitation required.
              {!reportHtmlExperienceActive && (
                <>
                  {" "}When report appearances are available, Admin and STAFF can
                  choose one until the first response is completed.
                </>
              )}
            </p>
          </div>
        </div>
      )}

      {/* Info banner */}
      <div className="wf-intersection-banner">
        <strong>Schema note:</strong>{" "}
        <code>organizationId</code> is required (NOT NULL FK — no synthetic
        rows). Each PUBLIC campaign attaches to a real organization supplied
        by the admin. <code>createdByCoachId</code> is null for all PUBLIC
        campaigns.
        {!reportHtmlExperienceActive && (
          <> Report appearance is then fixed by the first completed response.</>
        )}
      </div>

      <PublicCampaignsManager responsiveEnabled={mobileResponsiveEnabled} />
    </div>
  );
}
