/**
 * Admin assessment template version editor.
 *
 * F1 (Checkpoint 1a): swapped from AssessmentVersionEditor to
 * TemplateEditorTabbed — the new 7-tab editor shell. Tab content
 * placeholders for F1; real Metadata / Sections / Questions / Scoring
 * & Tiers / Versions panels land in F2-F5.
 *
 * AssessmentVersionEditor.tsx stays in place (referenced by no other
 * routes after this swap) — F7 cleanup phase deletes it.
 */

export const dynamic = "force-dynamic";

import { redirect, notFound } from "next/navigation";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth/auth";
import { db } from "@/lib/db";
import { TemplateEditorTabbed } from "@/components/admin/TemplateEditorTabbed";

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

  const [template, version, allVersions] = await Promise.all([
    db.assessmentTemplate.findUnique({
      where: { id },
      select: {
        id: true,
        name: true,
        alias: true,
        aggregationMode: true,
      },
    }),
    db.assessmentTemplateVersion.findUnique({
      where: { id: versionId },
      select: {
        id: true,
        templateId: true,
        versionNumber: true,
        language: true,
        publishedAt: true,
        contentHash: true,
      },
    }),
    db.assessmentTemplateVersion.findMany({
      where: { templateId: id },
      orderBy: { versionNumber: "desc" },
      select: {
        id: true,
        versionNumber: true,
        language: true,
        publishedAt: true,
      },
    }),
  ]);

  if (!template || !version || version.templateId !== id) {
    notFound();
  }

  return (
    <div className="space-y-6">
      <TemplateEditorTabbed
        template={{
          id: template.id,
          name: template.name,
          alias: template.alias,
          aggregationMode: template.aggregationMode,
          // accessMode is a campaign-level concept; templates default to INVITED
          // (v1 PUBLIC mode is hardcoded for Website Assessment per WF16 spec).
          accessMode: "INVITED",
        }}
        version={{
          id: version.id,
          versionNumber: version.versionNumber,
          language: version.language,
          publishedAt:
            version.publishedAt instanceof Date
              ? version.publishedAt.toISOString()
              : version.publishedAt,
          contentHash: version.contentHash,
        }}
        allVersions={allVersions.map((v) => ({
          id: v.id,
          versionNumber: v.versionNumber,
          language: v.language,
          publishedAt:
            v.publishedAt instanceof Date
              ? v.publishedAt.toISOString()
              : v.publishedAt,
        }))}
      />
    </div>
  );
}
