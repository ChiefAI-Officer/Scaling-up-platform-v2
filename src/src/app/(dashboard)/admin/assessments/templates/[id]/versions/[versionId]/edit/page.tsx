/**
 * Admin assessment template version editor.
 *
 * Edits a draft version's content (sections / questions / scoring / report).
 * Published versions render in read-only mode (defensive — the PATCH route
 * also rejects with 409 ALREADY_PUBLISHED).
 */

export const dynamic = "force-dynamic";

import { redirect } from "next/navigation";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth/auth";
import { AssessmentVersionEditor } from "@/components/admin/AssessmentVersionEditor";

export default async function AdminAssessmentVersionEditPage({
  params,
}: {
  params: Promise<{ id: string; versionId: string }>;
}) {
  const session = await getServerSession(authOptions);
  if (!session) {
    redirect("/login");
  }
  const role = (session.user as { role?: string } | undefined)?.role;
  if (role !== "ADMIN" && role !== "STAFF") {
    redirect("/unauthorized");
  }
  const { id, versionId } = await params;
  return (
    <div className="space-y-6">
      <AssessmentVersionEditor templateId={id} versionId={versionId} />
    </div>
  );
}
