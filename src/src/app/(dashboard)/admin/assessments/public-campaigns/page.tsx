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

import { redirect } from "next/navigation";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth/auth";
import { PublicCampaignsManager } from "@/components/admin/PublicCampaignsManager";

export default async function AdminPublicCampaignsPage() {
  const session = await getServerSession(authOptions);
  if (!session) {
    redirect("/login");
  }
  const role = (session.user as { role?: string } | undefined)?.role;
  if (role !== "ADMIN" && role !== "STAFF") {
    redirect("/unauthorized");
  }

  return (
    <div>
      {/* Breadcrumb */}
      <div className="wf-breadcrumb">
        <a href="/admin/dashboard">Admin</a>
        <span className="wf-breadcrumb-sep">/</span>
        <a href="/admin/assessments">Assessments</a>
        <span className="wf-breadcrumb-sep">/</span>
        <span className="wf-breadcrumb-current">Public Campaigns</span>
      </div>

      {/* Page header */}
      <div className="wf-page-header-row">
        <div>
          <h2 className="wf-page-title">Public Campaigns</h2>
          <p className="wf-page-subtitle-strong">
            Create and publish{" "}
            <code>accessMode=&quot;PUBLIC&quot;</code> assessment campaigns.
            Respondents self-enroll — no invitation required.
            Admin and STAFF only; coaches cannot access this page.
          </p>
        </div>
      </div>

      {/* Info banner */}
      <div className="wf-intersection-banner">
        <strong>Schema note:</strong>{" "}
        <code>organizationId</code> is required (NOT NULL FK — no synthetic
        rows). Each PUBLIC campaign attaches to a real organization supplied
        by the admin. <code>createdByCoachId</code> is null for all PUBLIC
        campaigns.
      </div>

      <PublicCampaignsManager />
    </div>
  );
}
