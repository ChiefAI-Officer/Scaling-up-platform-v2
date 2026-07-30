import { Prisma } from "@prisma/client";
import { inngest } from "@/inngest/client";
import { db } from "@/lib/db";
import {
  publicLeadRetentionCutoff,
  resolvePublicLeadsState,
} from "@/lib/assessments/public-leads-state";

const RETENTION_QUERY_LIMIT = 5_000;
const RETENTION_SUB_BATCH = 100;

export const publicLeadRetention = inngest.createFunction(
  {
    id: "assessment-public-lead-retention",
    retries: 3,
    concurrency: { limit: 1 },
  },
  { cron: "* * * * *" },
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
        take: RETENTION_QUERY_LIMIT,
        select: {
          id: true,
          publicLeadExportItems: {
            select: { id: true, exportId: true },
          },
        },
      });

      // Process in sub-batches to limit per-transaction lock duration.
      // publicLeadDeletedAt acts as idempotency — a retry resumes cleanly.
      const now = new Date();
      let processed = 0;
      for (let i = 0; i < expired.length; i += RETENTION_SUB_BATCH) {
        const batch = expired.slice(i, i + RETENTION_SUB_BATCH);
        await db.$transaction(async (tx) => {
          const invalidatedExportIds = new Set<string>();
          for (const submission of batch) {
            for (const item of submission.publicLeadExportItems) {
              invalidatedExportIds.add(item.exportId);
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
                contentProvenance: Prisma.JsonNull,
                authorizationProvenance: Prisma.JsonNull,
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
                ...(state.deletionMode === "DELETE"
                  ? {
                      referringCoachId: null,
                      attributionSource: null,
                    }
                  : {}),
              },
            });
          }
          if (invalidatedExportIds.size > 0) {
            const exportIds = [...invalidatedExportIds];
            await tx.publicLeadExport.updateMany({
              where: { id: { in: exportIds } },
              data: {
                status: "ABORTED",
                abortedAt: now,
                errorClass: "RETENTION_INVALIDATED",
                artifactCiphertext: null,
                artifactNonce: null,
                artifactAuthTag: null,
                authorizationGeneration: { increment: 1 },
              },
            });
            await tx.publicLeadExportChunk.deleteMany({
              where: { exportId: { in: exportIds } },
            });
          }
        });
        processed += batch.length;
      }
      if (processed > 0) {
        await db.auditLog.create({
          data: {
            entityType: "AssessmentSubmission",
            entityId: policyVersion,
            action: "PUBLIC_LEAD_RETENTION_APPLIED",
            performedBy: "public-lead-retention-worker",
            changes: JSON.stringify({
              policyVersion,
              deletionMode: state.deletionMode,
              cutoff: cutoff.toISOString(),
              processed,
              mailQuiescence: "PENDING_TRANSPORT_BOUND",
            }),
          },
        });
      }
      return { status: "COMPLETED", processed };
    }),
);
