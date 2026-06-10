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
      template: { select: { id: true, name: true, alias: true } },
    },
  });
  if (!campaign || campaign.accessMode !== "PUBLIC") {
    notFound();
  }

  const version = await db.assessmentTemplateVersion.findUnique({
    where: { id: campaign.versionId },
    select: {
      questions: true,
      sections: true,
      publishedAt: true,
    },
  });
  if (!version || version.publishedAt === null) {
    notFound();
  }

  const now = new Date();
  const isOpen =
    campaign.status === "ACTIVE" &&
    campaign.openAt <= now &&
    (campaign.closeAt === null || campaign.closeAt >= now);

  // Render the client directly (no constrained wrapper) so the full-bleed
  // branded welcome shell matches the org-survey flow + the approved mockup.
  return (
    <PublicQuizClient
      campaignAlias={campaignAlias}
      campaignName={campaign.name}
      campaignDescription={campaign.description}
      templateName={campaign.template.name}
      isOpen={isOpen}
      status={campaign.status}
      openAtIso={campaign.openAt.toISOString()}
      closeAtIso={campaign.closeAt ? campaign.closeAt.toISOString() : null}
      sections={version.sections as unknown}
      questions={version.questions as unknown}
    />
  );
}
