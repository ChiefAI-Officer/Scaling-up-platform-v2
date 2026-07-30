import {
  createCipheriv,
  createHash,
  randomBytes,
} from "node:crypto";
import { db } from "@/lib/db";
import { inngest } from "@/inngest/client";
import { resolvePublicLeadsState } from "@/lib/assessments/public-leads-state";

const BATCH_SIZE = 500;

function csvCell(value: string): string {
  const protectedValue = /^[=+\-@]/.test(value) ? `'${value}` : value;
  return `"${protectedValue.replaceAll('"', '""')}"`;
}

function exportKey(): { key: Buffer; version: string } {
  const encoded = process.env.PUBLIC_LEADS_EXPORT_KEY?.trim() ?? "";
  const key = Buffer.from(encoded, "base64");
  if (key.length !== 32) throw new Error("PUBLIC_LEADS_EXPORT_KEY_INVALID");
  return {
    key,
    version: process.env.PUBLIC_LEADS_EXPORT_KEY_VERSION?.trim() || "v1",
  };
}

function takerOf(value: unknown): {
  firstName: string;
  lastName: string;
  email: string;
} {
  const item =
    value && typeof value === "object"
      ? (value as Record<string, unknown>)
      : {};
  return {
    firstName: typeof item.firstName === "string" ? item.firstName : "",
    lastName: typeof item.lastName === "string" ? item.lastName : "",
    email: typeof item.email === "string" ? item.email : "",
  };
}

export const publicLeadExport = inngest.createFunction(
  {
    id: "assessment-public-lead-export",
    retries: 4,
    concurrency: { limit: 2 },
  },
  { event: "assessment/public-lead-export.requested" },
  async ({ event, step }) => {
    const exportId = event.data.exportId;
    return step.run("generate-export", async () => {
      const job = await db.publicLeadExport.findUnique({
        where: { id: exportId },
      });
      if (!job || job.status === "COMPLETED" || job.status === "ABORTED") {
        return { status: job?.status ?? "missing" };
      }

      await db.publicLeadExport.update({
        where: { id: exportId },
        data: { status: "RUNNING", startedAt: job.startedAt ?? new Date() },
      });

      try {
        const actor = await db.user.findFirst({
          where: { id: job.requestedByUserId, deletedAt: null },
          select: { id: true, role: true },
        });
        if (!actor) throw new Error("EXPORT_ACTOR_INELIGIBLE");

        if (job.ownerCoachId) {
          const coach = await db.coach.findFirst({
            where: {
              id: job.ownerCoachId,
              deletedAt: null,
              certificationStatus: "ACTIVE",
              OR: [
                { certificationExpiry: null },
                { certificationExpiry: { gt: new Date() } },
              ],
            },
            select: { id: true },
          });
          const state = resolvePublicLeadsState(process.env, {
            coachId: job.ownerCoachId,
          });
          if (!coach || !state.presentationEnabled) {
            throw new Error("EXPORT_AUTHORIZATION_REVOKED");
          }
        }

        const lines = [
          ["Name", "Email", "Submitted at", "Assessment"]
            .map(csvCell)
            .join(","),
        ];
        let after = -1;
        let emitted = 0;
        while (true) {
          const items = await db.publicLeadExportItem.findMany({
            where: {
              exportId,
              sortOrder: { gt: after },
              exclusion: null,
            },
            orderBy: { sortOrder: "asc" },
            take: BATCH_SIZE,
            include: {
              submission: {
                select: {
                  id: true,
                  submittedAt: true,
                  publicTaker: true,
                  publicLeadDeletedAt: true,
                  referringCoachId: true,
                  campaign: {
                    select: {
                      deletedAt: true,
                      template: { select: { name: true } },
                    },
                  },
                },
              },
            },
          });
          if (items.length === 0) break;

          // Reauthorization is intentionally repeated for every stable batch.
          if (job.ownerCoachId) {
            const coachStillEligible = await db.coach.count({
              where: {
                id: job.ownerCoachId,
                deletedAt: null,
                certificationStatus: "ACTIVE",
                OR: [
                  { certificationExpiry: null },
                  { certificationExpiry: { gt: new Date() } },
                ],
              },
            });
            if (coachStillEligible !== 1) {
              throw new Error("EXPORT_AUTHORIZATION_REVOKED");
            }
          }

          for (const item of items) {
            after = item.sortOrder;
            const submission = item.submission;
            const excluded =
              submission.publicLeadDeletedAt !== null ||
              submission.campaign.deletedAt !== null ||
              (job.ownerCoachId !== null &&
                submission.referringCoachId !== job.ownerCoachId);
            if (excluded) {
              await db.publicLeadExportExclusion.upsert({
                where: { exportItemId: item.id },
                update: {},
                create: {
                  exportItemId: item.id,
                  reason: "AUTHORIZATION_OR_RETENTION_CHANGED",
                },
              });
              continue;
            }
            const taker = takerOf(submission.publicTaker);
            const name = `${taker.firstName} ${taker.lastName}`.trim();
            lines.push(
              [
                name,
                taker.email,
                submission.submittedAt.toISOString(),
                submission.campaign.template.name,
              ]
                .map(csvCell)
                .join(","),
            );
            emitted += 1;
          }
          if (items.length < BATCH_SIZE) break;
        }

        const plaintext = Buffer.from(`${lines.join("\r\n")}\r\n`, "utf8");
        const digest = createHash("sha256").update(plaintext).digest("hex");
        const { key, version } = exportKey();
        const nonce = randomBytes(12);
        const cipher = createCipheriv("aes-256-gcm", key, nonce);
        const ciphertext = Buffer.concat([
          cipher.update(plaintext),
          cipher.final(),
        ]);
        const authTag = cipher.getAuthTag();

        await db.publicLeadExport.update({
          where: { id: exportId },
          data: {
            status: "COMPLETED",
            emittedDigest: digest,
            emittedRowCount: emitted,
            artifactCiphertext: ciphertext,
            artifactNonce: nonce,
            artifactAuthTag: authTag,
            artifactKeyVersion: version,
            completedAt: new Date(),
            expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
          },
        });
        return { status: "COMPLETED", emitted };
      } catch (error) {
        await db.publicLeadExport.update({
          where: { id: exportId },
          data: {
            status: "ABORTED",
            abortedAt: new Date(),
            errorClass:
              error instanceof Error ? error.constructor.name : "unknown",
          },
        });
        throw error;
      }
    });
  },
);
