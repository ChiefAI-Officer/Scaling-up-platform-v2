import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
} from "node:crypto";
import { db } from "@/lib/db";
import { inngest } from "@/inngest/client";
import {
  publicLeadRetentionCutoff,
  resolvePublicLeadsState,
} from "@/lib/assessments/public-leads-state";

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

function encryptChunk(plaintext: Buffer, key: Buffer) {
  const nonce = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, nonce);
  return {
    ciphertext: Buffer.concat([cipher.update(plaintext), cipher.final()]),
    nonce,
    authTag: cipher.getAuthTag(),
  };
}

function decryptChunk(
  ciphertext: Buffer,
  nonce: Buffer,
  authTag: Buffer,
  key: Buffer,
) {
  const decipher = createDecipheriv("aes-256-gcm", key, nonce);
  decipher.setAuthTag(authTag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]);
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
        const { key, version } = exportKey();
        let after = job.nextSortOrder - 1;
        while (true) {
          // Actor, owner, policy, and retention are re-evaluated for every
          // durable batch checkpoint. A retry resumes at nextSortOrder.
          const actor = await db.user.findFirst({
            where: { id: job.requestedByUserId, deletedAt: null },
            select: {
              id: true,
              role: true,
              coachProfile: {
                select: { id: true, deletedAt: true },
              },
            },
          });
          if (
            !actor ||
            (job.ownerCoachId !== null &&
              (actor.coachProfile?.id !== job.ownerCoachId ||
                actor.coachProfile.deletedAt !== null))
          ) {
            throw new Error("EXPORT_ACTOR_INELIGIBLE");
          }
          const state = resolvePublicLeadsState(process.env, {
            coachId: job.ownerCoachId,
          });
          const retentionCutoff = publicLeadRetentionCutoff(state);
          if (!state.presentationEnabled || retentionCutoff === null) {
            throw new Error("EXPORT_AUTHORIZATION_REVOKED");
          }
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
          const lines =
            job.nextSortOrder === 0
              ? [
                  ["Name", "Email", "Submitted at", "Assessment"]
                    .map(csvCell)
                    .join(","),
                ]
              : [];
          let emittedInBatch = 0;
          for (const item of items) {
            after = item.sortOrder;
            const submission = item.submission;
            const excluded =
              submission.publicLeadDeletedAt !== null ||
              submission.submittedAt < retentionCutoff ||
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
            emittedInBatch += 1;
          }
          const plaintext = Buffer.from(`${lines.join("\r\n")}\r\n`, "utf8");
          const encrypted = encryptChunk(plaintext, key);
          await db.$transaction([
            db.publicLeadExportChunk.upsert({
              where: {
                exportId_batchIndex: {
                  exportId,
                  batchIndex: job.nextSortOrder,
                },
              },
              update: {},
              create: {
                exportId,
                batchIndex: job.nextSortOrder,
                ...encrypted,
                rowCount: emittedInBatch,
              },
            }),
            db.publicLeadExport.update({
              where: {
                id: exportId,
                nextSortOrder: job.nextSortOrder,
              },
              data: {
                nextSortOrder: after + 1,
                emittedRowCount: { increment: emittedInBatch },
              },
            }),
          ]);
          job.nextSortOrder = after + 1;
          if (items.length < BATCH_SIZE) break;
        }

        const digestBuilder = createHash("sha256");
        let emitted = 0;
        let chunkAfter = -1;
        let chunkCount = 0;
        while (true) {
          const chunks = await db.publicLeadExportChunk.findMany({
            where: { exportId, batchIndex: { gt: chunkAfter } },
            orderBy: { batchIndex: "asc" },
            take: 100,
          });
          if (chunks.length === 0) break;
          for (const chunk of chunks) {
            digestBuilder.update(
              decryptChunk(
                Buffer.from(chunk.ciphertext),
                Buffer.from(chunk.nonce),
                Buffer.from(chunk.authTag),
                key,
              ),
            );
            emitted += chunk.rowCount;
            chunkAfter = chunk.batchIndex;
            chunkCount += 1;
          }
        }
        if (chunkCount === 0) {
          digestBuilder.update(
            `${["Name", "Email", "Submitted at", "Assessment"]
              .map(csvCell)
              .join(",")}\r\n`,
          );
        }
        const digest = digestBuilder.digest("hex");

        await db.publicLeadExport.update({
          where: { id: exportId },
          data: {
            status: "COMPLETED",
            emittedDigest: digest,
            emittedRowCount: emitted,
            artifactCiphertext: null,
            artifactNonce: null,
            artifactAuthTag: null,
            artifactKeyVersion: version,
            completedAt: new Date(),
            expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
          },
        });
        return {
          status: "COMPLETED",
          emitted,
        };
      } catch (error) {
        const message = error instanceof Error ? error.message : "";
        const authorizationFailure =
          message === "EXPORT_ACTOR_INELIGIBLE" ||
          message === "EXPORT_AUTHORIZATION_REVOKED";
        await db.publicLeadExport.update({
          where: { id: exportId },
          data: {
            ...(authorizationFailure
              ? { status: "ABORTED", abortedAt: new Date() }
              : {}),
            errorClass:
              error instanceof Error ? error.constructor.name : "unknown",
          },
        });
        throw error;
      }
    });
  },
);

export const publicLeadExportWatchdog = inngest.createFunction(
  {
    id: "assessment-public-lead-export-watchdog",
    retries: 2,
    concurrency: { limit: 1 },
  },
  { cron: "*/5 * * * *" },
  async ({ step }) =>
    step.run("resume-or-abort-public-lead-exports", async () => {
      const now = new Date();
      const stale = await db.publicLeadExport.findMany({
        where: {
          status: { in: ["PENDING", "RUNNING"] },
          updatedAt: { lt: new Date(now.getTime() - 5 * 60 * 1_000) },
        },
        orderBy: { updatedAt: "asc" },
        take: 25,
        select: { id: true, createdAt: true },
      });
      let resumed = 0;
      let aborted = 0;
      for (const job of stale) {
        if (job.createdAt < new Date(now.getTime() - 24 * 60 * 60 * 1_000)) {
          await db.publicLeadExport.update({
            where: { id: job.id },
            data: {
              status: "ABORTED",
              abortedAt: now,
              errorClass: "EXPORT_WATCHDOG_TIMEOUT",
            },
          });
          aborted += 1;
        } else {
          await inngest.send({
            name: "assessment/public-lead-export.requested",
            data: { exportId: job.id },
          });
          resumed += 1;
        }
      }
      return { resumed, aborted };
    }),
);
