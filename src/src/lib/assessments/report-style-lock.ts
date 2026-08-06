interface ReportStyleLockTransaction {
  $executeRaw: (
    strings: TemplateStringsArray,
    ...values: unknown[]
  ) => Promise<unknown>;
}

export async function lockReportStyleForFirstCompletion(
  tx: ReportStyleLockTransaction,
  campaignId: string,
  submittedAt: Date,
): Promise<void> {
  await tx.$executeRaw`
    UPDATE "assessment_campaigns"
    SET "reportStyleLockedAt" = COALESCE("reportStyleLockedAt", ${submittedAt})
    WHERE "id" = ${campaignId}
  `;
}
