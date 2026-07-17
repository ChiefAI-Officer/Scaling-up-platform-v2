/**
 * Admin assessment template detail page.
 *
 * Redirects to the tabbed editor on the Versions tab (the new home
 * for version-management actions per WF16/17/18 + grill Q6).
 *
 * If the template has no versions (impossible in current flows — POST
 * /api/admin/assessment-templates creates v1 in the same transaction —
 * but defensively handled), we redirect back to the templates list with
 * a flash. notFound() throws if the template itself doesn't exist.
 *
 * Plan: ~/.claude/plans/yes-we-were-in-cosmic-jellyfish.md (F6 + grill Q6)
 */

export const dynamic = "force-dynamic";

import { notFound, redirect } from "next/navigation";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth/auth";
import { db } from "@/lib/db";

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

  const template = await db.assessmentTemplate.findUnique({
    where: { id },
    select: { id: true },
  });
  if (!template) notFound();

  // Wave ED8 (spec 19ak §5, post-rollback landing) — prefer the highest
  // NON-ARCHIVED version (draft or published): after a rollback the operator
  // should land on the version that matters, not the version they just
  // retired. UNCONDITIONAL (Wave-Q doctrine): `archivedAt` is persisted admin
  // intent on a read path, so this is never flag-gated.
  const latestVersion =
    (await db.assessmentTemplateVersion.findFirst({
      where: { templateId: id, archivedAt: null },
      orderBy: { versionNumber: "desc" },
      select: { id: true },
    })) ??
    // Every version archived — fall back to the overall max so the redirect
    // still lands somewhere (the editor renders archived versions read-only).
    (await db.assessmentTemplateVersion.findFirst({
      where: { templateId: id },
      orderBy: { versionNumber: "desc" },
      select: { id: true },
    }));

  if (!latestVersion) {
    // Shouldn't happen in current flows — every template has at least v1
    // created in the same transaction (per the template-create route).
    redirect("/admin/assessments/templates");
  }

  redirect(
    `/admin/assessments/templates/${id}/versions/${latestVersion.id}/edit?tab=versions`,
  );
}
