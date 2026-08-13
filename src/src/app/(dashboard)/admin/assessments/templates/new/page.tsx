/**
 * Admin new assessment template form (MVP — paste-JSON for content).
 */

export const dynamic = "force-dynamic";

import { redirect } from "next/navigation";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth/auth";
import { AssessmentTemplateForm } from "@/components/admin/AssessmentTemplateForm";
import { SimplifiedAssessmentTemplateForm } from "@/components/admin/SimplifiedAssessmentTemplateForm";
import { isAdminOwnedAssessmentPresentationEnabled } from "@/lib/assessments/wave-admin-owned-assessment-presentation-flags";
import { isTemplateCreationSimplifiedEnabled } from "@/lib/assessments/wave-template-creation-flags";
import { PageHeader } from "@/components/ui/page-header";
import { isMobileResponsiveEnabled } from "@/lib/mobile-responsive-flags";

export default async function NewAssessmentTemplatePage() {
  const mobileResponsiveEnabled = isMobileResponsiveEnabled();
  const session = await getServerSession(authOptions);
  if (!session) {
    redirect("/login");
  }
  const role = (session.user as { role?: string } | undefined)?.role;
  if (role !== "ADMIN" && role !== "STAFF") {
    redirect("/unauthorized");
  }

  const simplified = isTemplateCreationSimplifiedEnabled();
  const welcomeAuthoringEnabled =
    simplified && isAdminOwnedAssessmentPresentationEnabled();

  return (
    <div
      className={
        mobileResponsiveEnabled ? "min-w-0 max-w-full space-y-6" : "space-y-6"
      }
    >
      {mobileResponsiveEnabled ? (
        <PageHeader
          responsiveEnabled
          title={simplified ? "Create assessment" : "New Assessment Template"}
          description={
            simplified
              ? "Give it a name. You'll add questions and settings in the editor next."
              : "Define metadata and content JSON. A first draft version is created automatically, ready to publish when you are."
          }
        />
      ) : (
        <header className="space-y-1">
          <h1 className="text-2xl font-bold text-foreground">
            {simplified ? "Create assessment" : "New Assessment Template"}
          </h1>
          {simplified ? (
            <p className="text-sm text-muted-foreground">
              Give it a name. You&apos;ll add questions and settings in the editor
              next.
            </p>
          ) : (
            <p className="text-sm text-muted-foreground">
              Define metadata + paste the content JSON (questions, sections,
              scoringConfig). A first draft version is created automatically — you
              can publish it once you&apos;re ready.
            </p>
          )}
        </header>
      )}
      {simplified ? (
        <SimplifiedAssessmentTemplateForm
          welcomeAuthoringEnabled={welcomeAuthoringEnabled}
        />
      ) : (
        <AssessmentTemplateForm mode="create" responsiveEnabled={mobileResponsiveEnabled} />
      )}
    </div>
  );
}
