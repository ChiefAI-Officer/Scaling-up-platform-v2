/**
 * Admin assessment template detail + edit page (MVP).
 */

export const dynamic = "force-dynamic";

import { redirect } from "next/navigation";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth/auth";
import { AssessmentTemplateDetail } from "@/components/admin/AssessmentTemplateDetail";

export default async function AdminAssessmentTemplateDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await getServerSession(authOptions);
  if (!session) {
    redirect("/login");
  }
  const role = (session.user as { role?: string } | undefined)?.role;
  if (role !== "ADMIN" && role !== "STAFF") {
    redirect("/unauthorized");
  }
  const { id } = await params;

  return (
    <div className="space-y-6">
      <AssessmentTemplateDetail templateId={id} />
    </div>
  );
}
