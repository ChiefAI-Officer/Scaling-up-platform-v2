import { Prisma } from "@prisma/client";
import { inngest } from "@/inngest/client";
import { db } from "@/lib/db";
import {
  publicLeadRetentionCutoff,
  resolvePublicLeadsState,
} from "@/lib/assessments/public-leads-state";

const RETENTION_BATCH_SIZE = 500;

export const publicLeadRetention = inngest.createFunction(
  {
    id: "assessment-public-lead-retention",
    retries: 3,
    concurrency: { limit: 1 },
  },
  { cron: "17 3 * * *" },
  async ({ step }) =>
    step.run("apply-public-lead-retention", async () => {
      const state = resolvePublicLeadsState(process.env, { coachId: null });
      const cutoff = publicLeadRetentionCutoff(state);
      if (
        cutoff === null ||
        state.policyVersion === null ||
        state.deletionMode === null
      ) {
        return { status: "POLICY_UNAVAILABLE", processed: 0 };
      }
      const policyVersion = state.policyVersion;

      const expired = await db.assessmentSubmission.findMany({
        where: {
          respondentId: null,
          publicLeadPolicyVersion: { not: null },
          publicLeadDeletedAt: null,
          submittedAt: { lt: cutoff },
        },
        orderBy: [{ submittedAt: "asc" }, { id: "asc" }],
        take: RETENTION_BATCH_SIZE,
        select: {
          id: true,
          publicLeadExportItems: { select: { id: true } },
        },
      });
      const now = new Date();
      await db.$transaction(async (tx) => {
        for (const submission of expired) {
          for (const item of submission.publicLeadExportItems) {
            await tx.publicLeadExportExclusion.upsert({
              where: { exportItemId: item.id },
              update: {},
              create: {
                exportItemId: item.id,
                reason: "RETENTION_EXPIRED",
              },
            });
          }
          await tx.assessmentEmailOutbox.updateMany({
            where: {
              submissionId: submission.id,
              status: { in: ["PENDING", "HELD", "SENDING"] },
            },
            data: {
              status: "CANCELLED",
              cancelledAt: now,
              cancelReason: "RETENTION_EXPIRED",
              bodyHtml: "",
              leaseToken: null,
              leaseExpiresAt: null,
              sendFenceGeneration: { increment: 1 },
            },
          });
          await tx.assessmentSubmission.update({
            where: { id: submission.id },
            data: {
              publicLeadDeletedAt: now,
              publicTaker: Prisma.JsonNull,
              publicTakerNameNormalized: null,
              publicTakerEmailNormalized: null,
              referringCoachEmail: null,
              referringCoachEmailSnapshot: null,
              answers: [],
              result: { retained: false },
            },
          });
        }
        if (expired.length > 0) {
          await tx.auditLog.create({
            data: {
              entityType: "AssessmentSubmission",
              entityId: policyVersion,
              action: "PUBLIC_LEAD_RETENTION_APPLIED",
              performedBy: "public-lead-retention-worker",
              changes: JSON.stringify({
                policyVersion,
                deletionMode: state.deletionMode,
                cutoff: cutoff.toISOString(),
                processed: expired.length,
              }),
            },
          });
        }
      });
      return { status: "COMPLETED", processed: expired.length };
    }),
);
