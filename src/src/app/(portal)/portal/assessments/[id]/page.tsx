/**
 * Assessment v7.6 — Coach campaign detail page (Task F).
 *
 * Server component. Resolves auth, gates access via canManageCampaign,
 * fetches the initial overview + respondents via the service helpers,
 * then hands off to the client component. Wave 1 placeholder removed.
 */

import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { requireCoach } from "@/lib/auth/authorization";
import { normalizeRole } from "@/lib/auth/access-control";
import type { ApiActor } from "@/lib/auth/access-control";
import {
  asAccessDb,
  canManageCampaign,
  canViewGroupReport,
} from "@/lib/assessments/access-control";
import {
  asCampaignDetailDb,
  getCampaignOverview,
  getCampaignRespondents,
  resolveCanEditReportAppearance,
} from "@/lib/assessments/campaign-detail";
import { CampaignDetail } from "@/components/assessments/CampaignDetail";
import {
  assessmentInviteBrandedCustomHtmlEnabled,
  waveDCoachNotifyEnabled,
  waveDCustomHtmlEmailEnabled,
  waveDResultsEmailEnabled,
} from "@/lib/assessments/wave-d-feature-flags";
import { isResultsEmailApproved } from "@/lib/assessments/results-email-approval";
import {
  isGroupReportEnabled,
  isGroupReportAlias,
  groupReportRequiresPublishedVersion,
} from "@/lib/assessments/wave-f-flags";
import { isCustomSlidesEnabled } from "@/lib/assessments/wave-m-flags";
import { isOnScreenResultsEnabled } from "@/lib/assessments/wave-osr-flags";
import { isReportStyleSelectionEnabled } from "@/lib/assessments/wave-report-styles-flags";
import { deriveReportStylePreviewCapabilities } from "@/lib/assessments/report-style-registry";
import { isAdminOwnedAssessmentPresentationEnabled } from "@/lib/assessments/wave-admin-owned-assessment-presentation-flags";
import { isInvitationBannerEnabled } from "@/lib/assessments/wave-invitation-banner-flags";
import {
  REPORT_COMPARISON_ALIAS,
  isReportComparisonEnabled,
} from "@/lib/assessments/wave-report-comparison-flags";
import { resolveSummaryReportingCapability } from "@/lib/assessments/summary-reports/capability";
import {
  asLongitudinalEligibilityDb,
  hasComparableLongitudinal,
} from "@/lib/assessments/longitudinal-eligibility";
import type { CustomSlide } from "@/lib/assessments/custom-slides";
import type { CustomSlidesPanelSection } from "@/components/assessments/CustomSlidesPanel";
import { isMobileResponsiveEnabled } from "@/lib/mobile-responsive-flags";

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function CampaignDetailPage({ params }: PageProps) {
  const { coach, session } = await requireCoach();
  const { id } = await params;
  const mobileResponsiveEnabled = isMobileResponsiveEnabled();

  const actor: ApiActor = {
    userId: session.user.id,
    email: session.user.email ?? "",
    role: normalizeRole(session.user.role ?? "COACH"),
    coachId: coach.id,
  };

  const allowed = await canManageCampaign(
    asAccessDb(db),
    actor,
    id,
    "read"
  );
  if (!allowed) {
    redirect("/portal/assessments");
  }

  const detailDb = asCampaignDetailDb(db);
  const [overview, respondents] = await Promise.all([
    getCampaignOverview(detailDb, id),
    getCampaignRespondents(detailDb, id),
  ]);

  // Wave F #22 (T10) — gate the campaign-level "View group report" entry
  // point. The group report is a bulk-PII surface (claudex R3-M2), so the
  // entry point is shown ONLY when: the campaign is INVITED, the report is
  // enabled for this actor+campaign (flag/canary), AND the actor passes the
  // strict group-report currency check. Computed SERVER-side; the client
  // receives ONLY the boolean (never recomputes auth). The campaign metadata
  // needed for the flag (accessMode + ownership pointers) is loaded directly
  // since the overview loader does not carry them.
  const campaignForFlag = await db.assessmentCampaign.findFirst({
    where: { id, deletedAt: null },
    select: {
      id: true,
      status: true,
      accessMode: true,
      createdByCoachId: true,
      organizationId: true,
      // Wave M (#19): the stored (already-sanitized) slides feed the editor's
      // initial value AND its CAS sentinel; versionId resolves the section
      // anchors for the "Before section" picker.
      customSlides: true,
      template: {
        select: {
          alias: true,
          resultsEmailContentApproved: true,
          resultsEmailContentApprovedHash: true,
          resultsEmailSubject: true,
          resultsEmailBodyMarkdown: true,
        },
      },
      // Wave J (J-3): the SU-Full-scoped publish guard reads publishedAt so the
      // entry-point link is gated lock-step with the loader (never show a link
      // that would land on the loader's `notApplicable(unpublished)` panel).
      // Wave M: also read the version's sections for the slide-position picker.
      version: {
        select: {
          id: true,
          publishedAt: true,
          sections: true,
          questions: true,
        },
      },
    },
  });
  const resultsEmailEnabled = waveDResultsEmailEnabled();
  const resultsEmailApproved =
    resultsEmailEnabled &&
    campaignForFlag?.template != null &&
    isResultsEmailApproved(campaignForFlag.template);
  const coachNotifyEnabled = waveDCoachNotifyEnabled();
  const groupReportGate =
    campaignForFlag !== null &&
    campaignForFlag.accessMode === "INVITED" &&
    // Allowlisted surface — LVA + SU-Full + QSP + Rockefeller (#72 / DT-5).
    isGroupReportAlias(campaignForFlag.template?.alias) &&
    // Publish guard, lock-step with the loader (R3-H1): a scored surface (SU-Full,
    // Rockefeller) needs a published version; qualitative (LVA, QSP) is NEVER
    // gated on publishedAt.
    (!groupReportRequiresPublishedVersion(campaignForFlag.template?.alias) ||
      campaignForFlag.version?.publishedAt != null) &&
    isGroupReportEnabled(actor, campaignForFlag);

  // Summary Reports is a narrower, independently flagged campaign-local
  // surface. Resolve its pure umbrella/family/publish gate before requesting
  // group-report access so flag-off and unsupported campaigns add no lookup.
  const summaryReportingCandidate = resolveSummaryReportingCapability(
    process.env,
    campaignForFlag,
    overview.campaign.name,
    overview.campaign.templateName,
  );
  const needsGroupReportAccess =
    groupReportGate || summaryReportingCandidate !== null;
  const hasGroupReportAccess =
    needsGroupReportAccess &&
    (await canViewGroupReport(asAccessDb(db), actor, id));
  const canShowGroupReport = groupReportGate && hasGroupReportAccess;
  const summaryReporting =
    summaryReportingCandidate && hasGroupReportAccess
      ? summaryReportingCandidate
      : null;

  // Wave M (#19) — custom-slides editor. Gated by the per-campaign flag
  // (canary/global/kill) AND status ∈ {DRAFT, ACTIVE} (CLOSED is read-only,
  // mirrors the PATCH route's 409). Computed SERVER-side; the client receives a
  // boolean + the stored slides (initial value + CAS sentinel) + the version's
  // sections (the "Before section" picker).
  const slidesStatus = campaignForFlag?.status ?? null;
  const customSlidesEnabled =
    campaignForFlag !== null &&
    (slidesStatus === "DRAFT" || slidesStatus === "ACTIVE") &&
    isCustomSlidesEnabled(id);
  const initialCustomSlides = customSlidesEnabled
    ? toCustomSlides(campaignForFlag?.customSlides)
    : [];
  const customSlidesSections = customSlidesEnabled
    ? projectSections(campaignForFlag?.version?.sections)
    : [];

  // Report appearance availability is a server decision. The client receives
  // only this resolved capability and never derives ownership, template
  // eligibility, or flag/canary status itself.
  const adminOwnedPresentation =
    isAdminOwnedAssessmentPresentationEnabled();
  const reportStylesAvailable =
    !adminOwnedPresentation &&
    campaignForFlag !== null &&
    isReportStyleSelectionEnabled({ templateId: overview.campaign.templateId, campaignId: id });
  const hasCurrentWriteAccess =
    reportStylesAvailable &&
    campaignForFlag !== null &&
    (await canManageCampaign(asAccessDb(db), actor, id, "write"));
  const canEditReportAppearance =
    reportStylesAvailable &&
    campaignForFlag !== null &&
    resolveCanEditReportAppearance({
      actorRole: actor.role,
      actorCoachId: actor.coachId,
      campaignOwnerCoachId: campaignForFlag.createdByCoachId,
      reportStyleLockedAt: overview.campaign.reportStyleLockedAt,
      reportStylesAvailable,
      hasCurrentWriteAccess,
    });

  const reportNativeComparisonEnabled =
    campaignForFlag?.template?.alias === REPORT_COMPARISON_ALIAS &&
    isReportComparisonEnabled({
      organizationId: overview.campaign.organizationId,
      templateId: overview.campaign.templateId,
    });
  const legacyOverTimeRespondentIds: string[] = [];
  if (!reportNativeComparisonEnabled) {
    const eligibilityDb = asLongitudinalEligibilityDb(db);
    for (const row of respondents) {
      if (!row.hasSubmission) continue;
      try {
        const eligible = await hasComparableLongitudinal(
          eligibilityDb,
          actor,
          {
            organizationId: overview.campaign.organizationId,
            respondentId: row.respondent.id,
            templateId: overview.campaign.templateId,
            templateAlias: campaignForFlag?.template?.alias,
          },
        );
        if (eligible) legacyOverTimeRespondentIds.push(row.respondent.id);
      } catch (error) {
        console.error(
          `[campaign-detail] longitudinal eligibility check failed (campaign=${id}, respondent=${row.respondent.id}):`,
          error,
        );
      }
    }
  }

  return (
    <CampaignDetail
      responsiveEnabled={mobileResponsiveEnabled}
      initialOverview={overview}
      initialRespondents={respondents}
      customHtmlEmailEnabled={waveDCustomHtmlEmailEnabled()}
      brandedCustomHtmlEnabled={assessmentInviteBrandedCustomHtmlEnabled()}
      invitationBannerEnabled={
        campaignForFlag?.accessMode === "INVITED" &&
        isInvitationBannerEnabled({
          organizationId: overview.campaign.organizationId ?? undefined,
          templateId: overview.campaign.templateId,
        })
      }
      resultsEmailEnabled={resultsEmailEnabled}
      resultsEmailApproved={resultsEmailApproved}
      coachNotifyEnabled={coachNotifyEnabled}
      canViewGroupReport={canShowGroupReport}
      groupReportHref={`/assessments/${id}/report`}
      summaryReporting={summaryReporting}
      customSlidesEnabled={customSlidesEnabled}
      // Wave OSR (#71) — gate computed here, server-side, from the same flag the
      // PATCH route enforces. CLOSED is excluded inside the component (the route
      // 409s it), so this is the flag check only.
      onScreenResultsEnabled={isOnScreenResultsEnabled()}
      initialCustomSlides={initialCustomSlides}
      customSlidesSections={customSlidesSections}
      reportStylesAvailable={reportStylesAvailable}
      reportStylePreviewCapabilities={
        adminOwnedPresentation
          ? undefined
          : deriveReportStylePreviewCapabilities({
              templateAlias: overview.campaign.templateAlias,
              questions: campaignForFlag?.version?.questions ?? [],
            })
      }
      canEditReportAppearance={canEditReportAppearance}
      legacyOverTimeRespondentIds={legacyOverTimeRespondentIds}
    />
  );
}

/**
 * Coerce the persisted `customSlides` JSON (Prisma `Json` ⇒ `unknown`) to a
 * `CustomSlide[]` the editor can load. Defensive: a malformed row is dropped.
 * The stored shape IS the editor shape (id, title?, html [sanitized], position,
 * sortOrder); the editor sends back the unchanged stored value as the CAS
 * sentinel, so we must pass through the stored value faithfully.
 */
function toCustomSlides(json: unknown): CustomSlide[] {
  if (!Array.isArray(json)) return [];
  const out: CustomSlide[] = [];
  for (const s of json) {
    if (!s || typeof s !== "object") continue;
    const rec = s as Record<string, unknown>;
    if (typeof rec.id !== "string") continue;
    if (typeof rec.html !== "string") continue;
    if (typeof rec.sortOrder !== "number") continue;
    const pos = rec.position;
    if (!pos || typeof pos !== "object") continue;
    out.push(rec as unknown as CustomSlide);
  }
  return out;
}

/** Project a version's `sections` JSON to `{ stableKey, name }[]`, sorted. */
function projectSections(sectionsJson: unknown): CustomSlidesPanelSection[] {
  if (!Array.isArray(sectionsJson)) return [];
  const rows: Array<{ stableKey: string; name: string; sortOrder: number }> = [];
  for (const s of sectionsJson) {
    if (!s || typeof s !== "object") continue;
    const rec = s as { stableKey?: unknown; name?: unknown; sortOrder?: unknown };
    if (typeof rec.stableKey !== "string") continue;
    const key = rec.stableKey.trim();
    if (key.length === 0) continue;
    rows.push({
      stableKey: key,
      name:
        typeof rec.name === "string" && rec.name.trim() !== "" ? rec.name : key,
      sortOrder: typeof rec.sortOrder === "number" ? rec.sortOrder : 0,
    });
  }
  rows.sort((a, b) => a.sortOrder - b.sortOrder);
  return rows.map(({ stableKey, name }) => ({ stableKey, name }));
}
