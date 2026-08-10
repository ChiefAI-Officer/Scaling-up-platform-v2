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
import {
  TemplateEditorTabbed,
  type ActivePreview,
} from "@/components/admin/TemplateEditorTabbed";
import { isWaveQAdminControlsEnabled } from "@/lib/assessments/wave-q-flags";
import { isPeerBenchmarksEnabled } from "@/lib/assessments/wave-s-flags";
import { isQuestionEditorUnlockEnabled } from "@/lib/assessments/wave-t-flags";
import { isFindingsLogicEnabled } from "@/lib/assessments/wave-u-flags";
import { isConditionalAuthoringEnabled } from "@/lib/assessments/wave-w-flags";
import { isTestModeEnabled } from "@/lib/assessments/wave-ed1-flags";
import { isSafeToPublishEnabled } from "@/lib/assessments/wave-ed2-flags";
import { isThreePaneEnabled } from "@/lib/assessments/wave-ed4-flags";
import { isSingleColumnEnabled } from "@/lib/assessments/wave-ed6-flags";
import { isVersionLifecycleEnabled } from "@/lib/assessments/wave-ed8-flags";
import { isFormsBuildEnabled } from "@/lib/assessments/wave-ed9-flags";
import { isPreviewSettingsEnabled } from "@/lib/assessments/wave-ed10-flags";
import { isQspStoryGroupEnabled } from "@/lib/assessments/wave-48-flags";
import { isReportStylesEnabled } from "@/lib/assessments/wave-report-styles-flags";
import { isTemplateCreationSimplifiedEnabled } from "@/lib/assessments/wave-template-creation-flags";
import { isAdminOwnedAssessmentPresentationEnabled } from "@/lib/assessments/wave-admin-owned-assessment-presentation-flags";
import {
  invitedWelcomeConfigSchema,
  resolveLegacyInvitedWelcomeConfig,
} from "@/lib/assessments/invited-welcome-config";
import { computePublishedQuestionUnions } from "@/lib/assessments/published-question-unions";
import {
  activePublishedWhere,
  DEFAULT_TEMPLATE_LANGUAGE,
} from "@/lib/assessments/active-version";
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
  const adminOwnedPresentationEnabled =
    isAdminOwnedAssessmentPresentationEnabled();

  const [template, version, allVersions, publishedVersions] = await Promise.all([
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
        defaultReportStyle: true,
        ...(adminOwnedPresentationEnabled
          ? { invitedWelcomeDefault: true as const }
          : {}),
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
        // Wave ED8 (spec 19ak §2) — lifecycle status input for the Versions
        // tab / header pill. Display only — the list keeps ALL versions
        // (drafts + archived) on purpose.
        archivedAt: true,
      },
    }),
    // Wave T (spec 19t §T-4) — every PUBLISHED version's questions JSON,
    // for the inherited-lock unions. Fetched UNCONDITIONALLY (not flag-
    // gated): the unions also drive the save path's inherited re-checks.
    // Wave ED8: do NOT add `archivedAt: null` here — identity locks against
    // ALL published history INCLUDING archived versions (spec 19ak §4). The
    // matching save-path query is pinned by template-version-patch.wave-t.test.ts.
    db.assessmentTemplateVersion.findMany({
      where: { templateId: id, publishedAt: { not: null } },
      select: { questions: true },
    }),
  ]);

  if (!template || !version || version.templateId !== id) {
    notFound();
  }

  const parsedInvitedWelcome = invitedWelcomeConfigSchema.safeParse(
    "invitedWelcomeDefault" in template
      ? template.invitedWelcomeDefault
      : undefined,
  );
  const invitedWelcomeDefault = adminOwnedPresentationEnabled
    ? parsedInvitedWelcome.success
      ? parsedInvitedWelcome.data
      : resolveLegacyInvitedWelcomeConfig(template.alias)
    : undefined;

  // Wave T — union of published question stableKeys + per-question option
  // keys across all published versions (drives isInherited, D8 slug
  // uniqueness, and the D4/D9 impact warnings in the editor).
  const { publishedKeys, publishedOptionKeys } = computePublishedQuestionUnions(
    publishedVersions.map((v) => v.questions),
  );

  // Wave S (spec 19s S-3) — peer-averages editor rows. Rendered ONLY when the
  // flag is ON and the alias is render-enabled (D10 — same list as the report
  // joins, so no dead switches); otherwise nothing is fetched or rendered.
  // Rows come from the current ACTIVE version (not the URL's version),
  // matching the API's validKeys resolution. Wave ED8 (C3) — archived
  // versions are excluded here exactly like the benchmarks API route
  // (persisted admin intent, never flag-gated); the Wave-T lock-union query
  // above deliberately KEEPS archived versions (identity locks against ALL
  // history).
  let peerBenchmarkRows: PeerBenchmarkRow[] | null = null;
  if (isPeerBenchmarksEnabled() && isPeerRenderEnabledAlias(template.alias)) {
    const published = await db.assessmentTemplateVersion.findFirst({
      where: { templateId: id, ...activePublishedWhere },
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

  // Wave ED10 (spec 19am-plan, Task 5) — the Active PUBLISHED version snapshot
  // for the Preview tab's read-only "Active" mode. Queried ONLY when the flag
  // is on (byte-identical flag-OFF path): the highest-versionNumber row that is
  // published AND non-archived for the canonical language (enUS — see
  // active-version.ts:43 DEFAULT_TEMPLATE_LANGUAGE; NOT "en-US"), which is
  // exactly the version new campaigns pin. `name` comes from the template
  // (versions carry none). Null when the flag is off OR nothing is published
  // yet. No schema/route change; the stored questions/sections JSON is passed
  // through as-is (the Preview tab normalizes it via the stored-JSON adapter).
  let activePreview: ActivePreview | null = null;
  if (isPreviewSettingsEnabled()) {
    const active = await db.assessmentTemplateVersion.findFirst({
      where: {
        templateId: id,
        language: DEFAULT_TEMPLATE_LANGUAGE,
        ...activePublishedWhere,
      },
      orderBy: { versionNumber: "desc" },
      select: {
        versionNumber: true,
        publishedAt: true,
        language: true,
        questions: true,
        sections: true,
      },
    });
    if (active) {
      activePreview = {
        versionNumber: active.versionNumber,
        publishedAt:
          active.publishedAt instanceof Date
            ? active.publishedAt.toISOString()
            : active.publishedAt,
        language: active.language,
        name: template.name,
        sections: active.sections,
        questions: active.questions,
      };
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
          defaultReportStyle: template.defaultReportStyle,
          ...(adminOwnedPresentationEnabled
            ? { invitedWelcomeDefault }
            : {}),
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
          // Wave ED8 — serialized like publishedAt (ISO string | null).
          archivedAt:
            v.archivedAt instanceof Date
              ? v.archivedAt.toISOString()
              : v.archivedAt,
        }))}
        // Wave Q — server-only env read; the client editor receives the flag
        // as a prop and gates the sendResultsDefault toggle on it.
        waveQEnabled={isWaveQAdminControlsEnabled()}
        // Wave T — the type-unlock flag gates the UI only; the published
        // unions are ALWAYS passed (they power the save path's inherited
        // locks regardless of the flag).
        questionEditorUnlocked={isQuestionEditorUnlockEnabled()}
        publishedQuestionKeys={publishedKeys}
        publishedOptionKeys={publishedOptionKeys}
        // Wave U — findings-logic authoring (panel-only gate; the save
        // path's per-type rule emission is NOT flag-gated).
        findingsEnabled={isFindingsLogicEnabled()}
        // Wave W — conditional (show-if) authoring (panel-only gate; the
        // runtime evaluation, publish gate, and submit prune are flagless).
        conditionalAuthoringEnabled={isConditionalAuthoringEnabled()}
        testModeEnabled={isTestModeEnabled()}
        safeToPublishEnabled={isSafeToPublishEnabled()}
        // Wave ED4 — three-pane authoring workspace (Questions-body swap +
        // "Edit" default tab; presentation-only, kill = flag off + redeploy).
        threePaneEnabled={isThreePaneEnabled()}
        // Wave ED6 — single-column form-builder editor. WINS over ED4
        // three-pane (Questions body → SingleColumnFormBuilder, "Build" tab
        // label, Sections folded in); presentation-only, kill = flag off +
        // redeploy.
        singleColumnEnabled={isSingleColumnEnabled()}
        // Wave ED9 — Google-Forms Build-tab presentation. Only meaningful with
        // single-column on; swaps the Build body to FormsBuilder + hides the
        // page-header title (the hero card owns it). Presentation-only, kill =
        // flag off + redeploy.
        formsBuildEnabled={isFormsBuildEnabled()}
        // Wave ED8 — version-lifecycle UI (lifecycle VersionsTab table,
        // derived-status pill, Metadata strip removal). Flag gates the UI
        // only; archived-exclusion in read paths is persisted admin intent
        // and never flag-gated (Wave-Q doctrine).
        versionLifecycleEnabled={isVersionLifecycleEnabled()}
        // Wave ED10 — Metadata→Preview + Settings tab rebuild. Plumbed through
        // now (Task 1); TabbedShell accepts + defaults it but does not read it
        // yet. Default false ⇒ byte-identical ED9 shell. Presentation-only,
        // kill = flag off + redeploy.
        previewSettingsEnabled={isPreviewSettingsEnabled()}
        // Template-creation simplification — resolved on this server page and
        // forwarded solely to the existing Scoring & Tiers presentation.
        plainLanguageScoringEnabled={isTemplateCreationSimplifiedEnabled()}
        reportStylesEnabled={isReportStylesEnabled({ templateId: template.id })}
        adminOwnedPresentationEnabled={adminOwnedPresentationEnabled}
        qspStoryGroupEnabled={isQspStoryGroupEnabled()}
        // Wave ED10 (spec 19am-plan, Task 5) — the Active published version
        // snapshot for the Preview tab's read-only "Active" mode. Null when
        // the flag is off or nothing is published. TabbedShell holds it;
        // the Preview tab (Task 6) consumes it.
        activePreview={activePreview}
      />
      {peerBenchmarkRows && (
        <PeerBenchmarksPanel templateId={template.id} rows={peerBenchmarkRows} />
      )}
    </div>
  );
}
