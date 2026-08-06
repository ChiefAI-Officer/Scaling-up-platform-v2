/**
 * Admin new assessment template form (MVP — paste-JSON for content).
 */

export const dynamic = "force-dynamic";

import { redirect } from "next/navigation";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth/auth";
import { AssessmentTemplateForm } from "@/components/admin/AssessmentTemplateForm";
import { SimplifiedAssessmentTemplateForm } from "@/components/admin/SimplifiedAssessmentTemplateForm";
import { isTemplateCreationSimplifiedEnabled } from "@/lib/assessments/wave-template-creation-flags";

export default async function NewAssessmentTemplatePage() {
  const session = await getServerSession(authOptions);
  if (!session) {
    redirect("/login");
  }
  const role = (session.user as { role?: string } | undefined)?.role;
  if (role !== "ADMIN" && role !== "STAFF") {
    redirect("/unauthorized");
  }

  const simplified = isTemplateCreationSimplifiedEnabled();

  return (
    <div className="space-y-6">
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
      {simplified ? (
        <SimplifiedAssessmentTemplateForm />
      ) : (
        <AssessmentTemplateForm mode="create" />
      )}
    </div>
  );
}
