import { notFound } from "next/navigation";

import { ReferredResultsList } from "@/components/assessments/ReferredResultsList";
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

async function resolvePublicQuickAlias(): Promise<string | null> {
  const campaign = await db.assessmentCampaign.findFirst({
    where: {
      deletedAt: null,
      accessMode: "PUBLIC",
      status: "ACTIVE",
      template: { alias: "scaling-up-quick" },
    },
    select: { alias: true },
    orderBy: { createdAt: "desc" },
  });
  return campaign?.alias ?? null;
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

  const [publicQuickAlias, params] = await Promise.all([
    resolvePublicQuickAlias(),
    searchParams,
  ]);
  const coachLink =
    publicQuickAlias && coach.email
      ? `${APP_URL}/quiz/${publicQuickAlias}?coach=${encodeURIComponent(coach.email)}`
      : null;

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
            See the Quick Assessment results attributed to your coach link.
          </p>
        </div>
      </FadeUp>

      <FadeUp delay={0.05}>
        <ReferredResultsList
          coachLink={coachLink}
          initialQuery={firstSearchValue(params.query)}
          initialTemplateId={firstSearchValue(params.templateId)}
          initialCursorTrail={normalizePublicReferralCursorTrail(params.cursor)}
        />
      </FadeUp>
    </div>
  );
}
