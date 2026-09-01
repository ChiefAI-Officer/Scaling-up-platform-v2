/**
 * Assessment v7.6 — PUBLIC-mode quiz landing page.
 *
 * Server component shell. Fetches the campaign + published version
 * server-side so the client only has to render. Anyone can hit this URL —
 * no auth, no token. The page enforces accessMode/status/window before
 * rendering the form; the submit route enforces them again.
 */

import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { PublicQuizClient } from "@/components/assessments/public-quiz-client";
import { isCustomSlidesEnabled } from "@/lib/assessments/wave-m-flags";
import { loadSafeSlides } from "@/lib/assessments/load-safe-slides";
import { isReferredResultsEnabled } from "@/lib/assessments/wave-83-flags";
import { isQspStoryGroupEnabled } from "@/lib/assessments/wave-48-flags";
import { isPublicMarketingCtaEnabled } from "@/lib/assessments/wave-public-marketing-cta-flags";
import { loadPublicMarketingResultConfig } from "@/lib/assessments/public-marketing-result";
import { resolveActiveReportHtml } from "@/lib/assessments/report-html";
import { isReportHtmlExperienceEnabled } from "@/lib/assessments/wave-report-html-authoring-flags";
import { invitedWelcomeConfigSchema } from "@/lib/assessments/invited-welcome-config";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export const metadata: Metadata = {
  title: "Take the assessment",
  // PUBLIC campaigns ARE meant to be indexed for marketing funnels; respect that.
  // Per-campaign de-indexing can be added via publicConfig in a future slice.
  robots: { index: true, follow: true },
};

export default async function PublicQuizPage({
  params,
}: {
  params: Promise<{ campaignAlias: string }>;
}) {
  const { campaignAlias } = await params;

  const campaign = await db.assessmentCampaign.findUnique({
    where: { alias: campaignAlias },
    select: {
      id: true,
      name: true,
      description: true,
      accessMode: true,
      status: true,
      openAt: true,
      closeAt: true,
      versionId: true,
      deletedAt: true,
      // Wave M (#19): coach-authored custom slides (raw CustomSlide[] JSON).
      customSlides: true,
      template: {
        select: {
          id: true,
          name: true,
          alias: true,
          deliveryType: true,
          invitedWelcomeDefault: true,
        },
      },
    },
  });
  // SEC-M6: a soft-deleted campaign is invisible — 404 like a missing one.
  if (!campaign || campaign.deletedAt !== null || campaign.accessMode !== "PUBLIC") {
    notFound();
  }

  const version = await db.assessmentTemplateVersion.findUnique({
    where: { id: campaign.versionId },
    select: {
      questions: true,
      sections: true,
      publishedAt: true,
      reportConfig: true,
    },
  });
  if (!version || version.publishedAt === null) {
    notFound();
  }

  const parsedWelcomeConfig = invitedWelcomeConfigSchema.safeParse(
    campaign.template.invitedWelcomeDefault,
  );

  const now = new Date();
  const isOpen =
    campaign.status === "ACTIVE" &&
    campaign.openAt <= now &&
    (campaign.closeAt === null || campaign.closeAt >= now);

  // Wave M (#19): coach-authored custom slides. Gated by the default-OFF flag.
  // When ON, parse + SANITIZE server-side (the client never sanitizes —
  // R1-Med-2) into a typed SafeSlide[]; flag-off ⇒ empty so the client merge is
  // a no-op and the public flow is byte-for-byte unchanged. (v1 has no PUBLIC
  // authoring path, so this is normally empty — the renderer support is plumbed
  // ahead of the authoring path per spec §4.)
  const customSlides = isCustomSlidesEnabled(campaign.id)
    ? loadSafeSlides(campaign.customSlides)
    : [];
  const reportHtmlExperienceActive = isReportHtmlExperienceEnabled();
  const reportHtml = resolveActiveReportHtml(version.reportConfig);
  const marketingResultConfig =
    isPublicMarketingCtaEnabled() &&
    campaign.template.deliveryType === "PUBLIC_MARKETING_QUIZ"
      ? loadPublicMarketingResultConfig(
          version.reportConfig,
          reportHtmlExperienceActive,
        )
      : null;

  // Render the client directly (no constrained wrapper) so the full-bleed
  // branded welcome shell matches the org-survey flow + the approved mockup.
  return (
    <PublicQuizClient
      campaignAlias={campaignAlias}
      campaignName={campaign.name}
      campaignDescription={campaign.description}
      templateName={campaign.template.name}
      templateAlias={campaign.template.alias}
      isOpen={isOpen}
      status={campaign.status}
      openAtIso={campaign.openAt.toISOString()}
      closeAtIso={campaign.closeAt ? campaign.closeAt.toISOString() : null}
      sections={version.sections as unknown}
      questions={version.questions as unknown}
      customSlides={customSlides}
      marketingResultConfig={marketingResultConfig}
      {...(parsedWelcomeConfig.success
        ? { welcomeConfig: parsedWelcomeConfig.data }
        : {})}
      {...(reportHtmlExperienceActive && reportHtml
        ? { reportHtmlExperienceActive: true, reportHtml }
        : {})}
      {...(isReferredResultsEnabled()
        ? { referredResultsEnabled: true }
        : {})}
      {...(isQspStoryGroupEnabled()
        ? { qspStoryGroupEnabled: true }
        : {})}
    />
  );
}
