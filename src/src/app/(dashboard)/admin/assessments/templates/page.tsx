/**
 * Admin assessment templates list page (MVP).
 *
 * Server component — admin/staff gate at request time; delegates the table +
 * delete + new-button rendering to the client component.
 */

export const dynamic = "force-dynamic";

import { redirect } from "next/navigation";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth/auth";
import { AssessmentTemplatesList } from "@/components/admin/AssessmentTemplatesList";

export default async function AdminAssessmentTemplatesPage() {
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
      {/* Breadcrumb — WF14 */}
      <div className="wf-breadcrumb">
        <a href="/admin/dashboard">Admin</a>
        <span className="wf-breadcrumb-sep">/</span>
        <a href="/admin/assessments">Assessments</a>
        <span className="wf-breadcrumb-sep">/</span>
        <span className="wf-breadcrumb-current">Templates</span>
      </div>

      <AssessmentTemplatesList />
    </div>
  );
}
