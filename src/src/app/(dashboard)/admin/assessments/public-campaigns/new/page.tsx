/**
 * Focused ADMIN/STAFF workflow for creating a public campaign draft.
 */

export const dynamic = "force-dynamic";

import { redirect } from "next/navigation";
import { getServerSession } from "next-auth/next";
import { CreatePublicCampaignForm } from "@/components/admin/public-campaigns/CreatePublicCampaignForm";
import { authOptions } from "@/lib/auth/auth";
import { listPublicCampaignCreateOptions } from "@/lib/assessments/public-campaign-create-options";
import { isPublicCampaignsSimpleUiEnabled } from "@/lib/assessments/wave-public-campaigns-simple-ui-flags";
import { db } from "@/lib/db";

export default async function NewPublicCampaignPage() {
  const session = await getServerSession(authOptions);
  if (!session) {
    redirect("/login");
  }
  const role = (session.user as { role?: string } | undefined)?.role;
  if (role !== "ADMIN" && role !== "STAFF") {
    redirect("/unauthorized");
  }

  if (!isPublicCampaignsSimpleUiEnabled()) {
    redirect("/admin/assessments/public-campaigns");
  }

  const options = await listPublicCampaignCreateOptions(db);

  return (
    <div>
      <div className="wf-breadcrumb">
        <a href="/admin/dashboard">Admin</a>
        <span className="wf-breadcrumb-sep">/</span>
        <a href="/admin/assessments">Assessments</a>
        <span className="wf-breadcrumb-sep">/</span>
        <a href="/admin/assessments/public-campaigns">Public campaigns</a>
        <span className="wf-breadcrumb-sep">/</span>
        <span className="wf-breadcrumb-current">Create campaign</span>
      </div>

      <div className="wf-page-header-row">
        <div>
          <h2 className="wf-page-title">Create a public campaign</h2>
          <p className="wf-page-subtitle">
            Create a link anyone can use to take an assessment.
          </p>
        </div>
      </div>

      <CreatePublicCampaignForm options={options} />
    </div>
  );
}
