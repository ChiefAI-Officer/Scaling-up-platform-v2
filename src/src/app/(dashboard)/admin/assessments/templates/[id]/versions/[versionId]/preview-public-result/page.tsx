import { notFound, redirect } from "next/navigation";
import { getServerSession } from "next-auth/next";

import { PublicMarketingResult } from "@/components/assessments/PublicMarketingResult";
import { authOptions } from "@/lib/auth/auth";
import { db } from "@/lib/db";
import { loadPublicMarketingResultConfig } from "@/lib/assessments/public-marketing-result";
import { isPublicMarketingCtaEnabled } from "@/lib/assessments/wave-public-marketing-cta-flags";

export const dynamic = "force-dynamic";

export default async function PreviewPublicMarketingResultPage({
  params,
}: {
  params: Promise<{ id: string; versionId: string }>;
}) {
  const session = await getServerSession(authOptions);
  if (!session) redirect("/login");
  const role = (session.user as { role?: string } | undefined)?.role;
  if (role !== "ADMIN" && role !== "STAFF") redirect("/unauthorized");
  if (!isPublicMarketingCtaEnabled()) notFound();

  const { id, versionId } = await params;
  const version = await db.assessmentTemplateVersion.findUnique({
    where: { id: versionId },
    select: {
      templateId: true,
      versionNumber: true,
      reportConfig: true,
      template: { select: { name: true, deliveryType: true } },
    },
  });
  if (
    !version ||
    version.templateId !== id ||
    version.template.deliveryType !== "PUBLIC_MARKETING_QUIZ"
  ) {
    notFound();
  }
  const config = loadPublicMarketingResultConfig(version.reportConfig);
  if (!config) notFound();

  return (
    <main className="min-h-screen bg-slate-50 px-4 py-8">
      <div className="mx-auto max-w-6xl rounded-lg border border-amber-300 bg-amber-50 p-4 text-sm text-amber-950">
        <strong>Preview — no response will be recorded.</strong> Showing {version.template.name} version {version.versionNumber} with a sample score.
      </div>
      <PublicMarketingResult
        score={44}
        scoreBands={config.scoreBands}
        marketingCta={config.marketingCta}
        referringCoachEmail={null}
      />
    </main>
  );
}
