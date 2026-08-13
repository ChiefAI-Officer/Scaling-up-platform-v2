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
import { isWaveQAdminControlsEnabled } from "@/lib/assessments/wave-q-flags";
import { isMobileResponsiveEnabled } from "@/lib/mobile-responsive-flags";

export default async function AdminAssessmentTemplatesPage() {
  const mobileResponsiveEnabled = isMobileResponsiveEnabled();
  const session = await getServerSession(authOptions);
  if (!session) {
    redirect("/login");
  }
  const role = (session.user as { role?: string } | undefined)?.role;
  if (role !== "ADMIN" && role !== "STAFF") {
    redirect("/unauthorized");
  }

  return (
    <div className={mobileResponsiveEnabled ? "min-w-0 max-w-full" : undefined}>
      {/* Breadcrumb — WF14 */}
      <div className="wf-breadcrumb">
        <a href="/admin/dashboard">Admin</a>
        <span className="wf-breadcrumb-sep">/</span>
        <a href="/admin/assessments">Assessments</a>
        <span className="wf-breadcrumb-sep">/</span>
        <span className="wf-breadcrumb-current">Templates</span>
      </div>

      {/* Wave Q — server-only env read; the client list receives the flag as
          a prop and gates the Enable/Disable write capability on it. */}
      <AssessmentTemplatesList waveQEnabled={isWaveQAdminControlsEnabled()} />
    </div>
  );
}
