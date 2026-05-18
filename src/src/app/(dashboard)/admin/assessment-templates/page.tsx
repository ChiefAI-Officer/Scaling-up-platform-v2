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
    <div className="space-y-6">
      <header className="flex items-start justify-between gap-4">
        <div className="space-y-1">
          <h1 className="text-2xl font-bold text-foreground">Assessment Templates</h1>
          <p className="text-sm text-muted-foreground">
            Create and publish assessment templates. Coaches launch campaigns
            against published versions; content is version-locked once
            published.
          </p>
        </div>
      </header>

      <AssessmentTemplatesList />
    </div>
  );
}
