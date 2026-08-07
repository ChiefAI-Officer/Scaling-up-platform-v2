import type { ReportStyleKey } from "@/lib/assessments/report-style-registry";

interface ReportStyleLockTransaction {
  $queryRaw: (
    strings: TemplateStringsArray,
    ...values: unknown[]
  ) => Promise<Array<{ reportStyle: ReportStyleKey }>>;
}

export async function lockReportStyleForFirstCompletion(
  tx: ReportStyleLockTransaction,
  campaignId: string,
  submittedAt: Date,
): Promise<ReportStyleKey> {
  const rows = await tx.$queryRaw`
    UPDATE "assessment_campaigns"
    SET "reportStyleLockedAt" = COALESCE("reportStyleLockedAt", ${submittedAt})
    WHERE "id" = ${campaignId}
    RETURNING "reportStyle"
  `;

  const campaign = rows[0];
  if (!campaign) {
    throw new Error("Campaign disappeared while freezing report appearance");
  }

  return campaign.reportStyle;
}
