/**
 * Admin assessment template version editor — mounts the 7-tab
 * TemplateEditorTabbed (Metadata / Sections / Questions / Scoring &
 * Tiers / Conditional Logic / Access / Versions).
 *
 * Wireframe rebuild: see ~/.claude/plans/yes-we-were-in-cosmic-jellyfish.md
 * (commits 554ea90 → 7907dc2 → cleanup).
 */

export const dynamic = "force-dynamic";

import { redirect, notFound } from "next/navigation";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth/auth";
import { db } from "@/lib/db";
import { TemplateEditorTabbed } from "@/components/admin/TemplateEditorTabbed";
import { isWaveQAdminControlsEnabled } from "@/lib/assessments/wave-q-flags";
import { isPeerBenchmarksEnabled } from "@/lib/assessments/wave-s-flags";
import {
  isPeerRenderEnabledAlias,
  listRatingQuestionKeys,
  getQuestionBenchmarks,
} from "@/lib/assessments/peer-benchmarks";
import {
  PeerBenchmarksPanel,
  type PeerBenchmarkRow,
} from "@/components/assessments/PeerBenchmarksPanel";

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
        description: true,
        invitationSubject: true,
        invitationBodyMarkdown: true,
        // F0 — Results Email card fields (Checkpoint 1b).
        resultsEmailSubject: true,
        resultsEmailBodyMarkdown: true,
        resultsEmailContentApproved: true,
        // Wave Q (#1) — template-row results-email default toggle.
        sendResultsDefault: true,
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
        // Content surfaces needed by the Sections card (F2) + future
        // Questions / Scoring tabs (F3/F4).
        questions: true,
        sections: true,
        scoringConfig: true,
        reportConfig: true,
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
        contentHash: true,
      },
    }),
  ]);

  if (!template || !version || version.templateId !== id) {
    notFound();
  }

  // Wave S (spec 19s S-3) — peer-averages editor rows. Rendered ONLY when the
  // flag is ON and the alias is render-enabled (D10 — same list as the report
  // joins, so no dead switches); otherwise nothing is fetched or rendered.
  // Rows come from the currently-PUBLISHED version (not the URL's version),
  // matching the API's validKeys resolution.
  let peerBenchmarkRows: PeerBenchmarkRow[] | null = null;
  if (isPeerBenchmarksEnabled() && isPeerRenderEnabledAlias(template.alias)) {
    const published = await db.assessmentTemplateVersion.findFirst({
      where: { templateId: id, publishedAt: { not: null } },
      orderBy: { versionNumber: "desc" },
      select: { questions: true },
    });
    if (published) {
      const ratingKeys = listRatingQuestionKeys(
        published.questions,
        template.alias,
      );
      if (ratingKeys.length > 0) {
        const benchmarks = await getQuestionBenchmarks(db, id);
        peerBenchmarkRows = ratingKeys.map((q) => ({
          stableKey: q.stableKey,
          label: q.label,
          value: benchmarks.get(q.stableKey) ?? null,
        }));
      }
    }
  }

  return (
    <div className="space-y-6">
      <TemplateEditorTabbed
        template={{
          id: template.id,
          name: template.name,
          alias: template.alias,
          description: template.description,
          invitationSubject: template.invitationSubject,
          invitationBodyMarkdown: template.invitationBodyMarkdown,
          resultsEmailSubject: template.resultsEmailSubject,
          resultsEmailBodyMarkdown: template.resultsEmailBodyMarkdown,
          resultsEmailContentApproved: template.resultsEmailContentApproved,
          sendResultsDefault: template.sendResultsDefault,
          aggregationMode: template.aggregationMode,
          // accessMode is a campaign-level concept; templates default to INVITED
          // (v1 PUBLIC mode is hardcoded for Website Assessment per WF16 spec).
          accessMode: "INVITED",
        }}
        version={{
          id: version.id,
          versionNumber: version.versionNumber,
          language: version.language,
          questions: version.questions,
          sections: version.sections,
          scoringConfig: version.scoringConfig,
          reportConfig: version.reportConfig,
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
          contentHash: v.contentHash,
        }))}
        // Wave Q — server-only env read; the client editor receives the flag
        // as a prop and gates the sendResultsDefault toggle on it.
        waveQEnabled={isWaveQAdminControlsEnabled()}
      />
      {peerBenchmarkRows && (
        <PeerBenchmarksPanel templateId={template.id} rows={peerBenchmarkRows} />
      )}
    </div>
  );
}
