import { notFound } from "next/navigation";

import {
  ReferredResultsList,
  type PublicAssessmentCoachLink,
} from "@/components/assessments/ReferredResultsList";
import { FadeUp } from "@/components/ui/animated";
import { normalizePublicReferralCursorTrail } from "@/lib/assessments/referred-results-page-state";
import { isReferredResultsEnabled } from "@/lib/assessments/wave-83-flags";
import { getApiActor } from "@/lib/auth/authorization";
import { isCoachCurrentlyCertified } from "@/lib/auth/coach-status";
import { db } from "@/lib/db";

const APP_URL =
  process.env.APP_URL || "https://scaling-up-platform-v2.vercel.app";

interface ReferredResultsPageProps {
  searchParams: Promise<
    Record<string, string | string[] | undefined>
  >;
}

function firstSearchValue(
  value: string | string[] | undefined,
): string {
  return typeof value === "string" ? value : "";
}

async function resolveActivePublicCampaigns() {
  return db.assessmentCampaign.findMany({
    where: {
      deletedAt: null,
      accessMode: "PUBLIC",
      status: "ACTIVE",
    },
    select: {
      id: true,
      name: true,
      alias: true,
      template: { select: { alias: true } },
    },
    orderBy: [{ name: "asc" }, { createdAt: "desc" }],
  });
}

export default async function ReferredResultsPage({
  searchParams,
}: ReferredResultsPageProps) {
  if (!isReferredResultsEnabled()) {
    notFound();
  }

  const actor = await getApiActor();
  if (actor?.role !== "COACH" || !actor.coachId) {
    notFound();
  }

  const coach = await db.coach.findUnique({
    where: { id: actor.coachId },
    select: {
      id: true,
      email: true,
      firstName: true,
      certificationStatus: true,
      certificationExpiry: true,
    },
  });
  if (
    !coach ||
    !isCoachCurrentlyCertified(coach)
  ) {
    notFound();
  }

  const [publicCampaigns, params] = await Promise.all([
    resolveActivePublicCampaigns(),
    searchParams,
  ]);
  const coachLinks: PublicAssessmentCoachLink[] = coach.email
    ? publicCampaigns.map((campaign) => ({
        campaignId: campaign.id,
        campaignName: campaign.name,
        templateAlias: campaign.template.alias,
        url: `${APP_URL}/quiz/${campaign.alias}?coach=${encodeURIComponent(coach.email)}`,
      }))
    : [];

  return (
    <div className="space-y-6">
      <FadeUp>
        <div>
          <p className="mb-2 text-xs text-muted-foreground">
            Assessments / Referred Results
          </p>
          <h1 className="font-serif text-3xl font-medium text-foreground">
            Referred Results
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            See public assessment results attributed to your coach links.
          </p>
        </div>
      </FadeUp>

      <FadeUp delay={0.05}>
        <ReferredResultsList
          coachLinks={coachLinks}
          initialQuery={firstSearchValue(params.query)}
          initialTemplateId={firstSearchValue(params.templateId)}
          initialCursorTrail={normalizePublicReferralCursorTrail(params.cursor)}
        />
      </FadeUp>
    </div>
  );
}
