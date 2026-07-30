/**
 * Shared assessment-email outbox worker.
 *
 * Event and cron invocations both claim one row at a time through a database
 * lease. The claim is the only transition that increments attempts, so two
 * overlapping invocations cannot both hand the same row to SMTP.
 */

import { randomUUID } from "node:crypto";
import { Prisma } from "@prisma/client";
import { inngest } from "@/inngest/client";
import { db } from "@/lib/db";
import { sendEmailViaSMTP } from "@/lib/smtp-transport";
import { resolvePublicLeadsState } from "@/lib/assessments/public-leads-state";
import { normalizeMailbox } from "@/lib/assessments/quick-assessment-lead";

const DEFAULT_LEASE_MS = 120_000;
const DEFAULT_INVOCATION_BUDGET_MS = 45_000;
const DEFAULT_EVENT_ROWS = 10;
const DEFAULT_CRON_ROWS = 50;
const DEFAULT_MAX_ATTEMPTS = 5;

export interface ClaimedOutboxRow {
  id: string;
  submissionId: string;
  recipientEmail: string;
  recipientRole: string;
  emailType: string;
  subject: string;
  bodyHtml: string;
  status: "SENDING";
  attempts: number;
  leaseToken: string;
  leaseExpiresAt: Date;
  featureKey?: string | null;
  previousStatus?: string;
  sendFenceGeneration: number;
}

interface UpdateManyResult {
  count: number;
}

export interface OutboxDb {
  $queryRaw<T>(query: Prisma.Sql): Promise<T>;
  assessmentEmailOutbox: {
    updateMany(args: unknown): Promise<UpdateManyResult>;
  };
  auditLog: {
    create(args: unknown): Promise<unknown>;
  };
}

export interface ClaimInput {
  submissionId: string | null;
  now: Date;
  leaseToken: string;
  leaseExpiresAt: Date;
  releaseHeld: boolean;
}

export interface DeadLetterInput {
  submissionId: string;
  outboxId: string;
  recipientRole: string;
  attempts: number;
  errorClass: string;
}

export interface DrainDeps {
  db: OutboxDb;
  sendEmail: (o: { to: string; subject: string; html: string }) => Promise<void>;
  claimNext?: (input: ClaimInput) => Promise<ClaimedOutboxRow | null>;
  recordDeadLetter?: (input: DeadLetterInput) => Promise<void>;
  authorizeBeforeSend?: (
    row: ClaimedOutboxRow,
  ) => Promise<{ allowed: boolean; reason?: string; bodyHtml?: string }>;
  now?: () => Date;
  makeLeaseToken?: () => string;
  maxAttempts?: number;
  maxRows?: number;
  leaseMs?: number;
  invocationBudgetMs?: number;
}

export interface DrainResult {
  sent: number;
  failed: number;
  skipped: number;
}

/**
 * Atomically claims the oldest due row. Expired SENDING leases are reclaimable;
 * FOR UPDATE SKIP LOCKED prevents a competing worker from selecting the same
 * candidate before the UPDATE installs its token.
 */
export async function claimNextOutboxRow(
  claimDb: Pick<OutboxDb, "$queryRaw">,
  input: ClaimInput,
): Promise<ClaimedOutboxRow | null> {
  const submissionClause = input.submissionId
    ? Prisma.sql`AND "submissionId" = ${input.submissionId}`
    : Prisma.empty;
  const heldClause = input.releaseHeld
    ? Prisma.sql`OR "status" = 'HELD'`
    : Prisma.empty;

  const rows = await claimDb.$queryRaw<ClaimedOutboxRow[]>(Prisma.sql`
    WITH candidate AS (
      SELECT "id", "status" AS "previousStatus"
      FROM "assessment_email_outbox"
      WHERE (
        (
          "status" = 'PENDING'
          AND "nextAttemptAt" <= ${input.now}
        )
        OR (
          "status" = 'SENDING'
          AND "leaseExpiresAt" <= ${input.now}
        )
        ${heldClause}
      )
      ${submissionClause}
      ORDER BY "nextAttemptAt" ASC, "createdAt" ASC, "id" ASC
      FOR UPDATE SKIP LOCKED
      LIMIT 1
    )
    UPDATE "assessment_email_outbox" AS outbox
    SET
      "status" = 'SENDING',
      "leaseToken" = ${input.leaseToken},
      "leaseExpiresAt" = ${input.leaseExpiresAt},
      "attempts" = outbox."attempts" + 1,
      "updatedAt" = ${input.now}
    FROM candidate
    WHERE outbox."id" = candidate."id"
    RETURNING
      outbox."id",
      outbox."submissionId",
      outbox."recipientEmail",
      outbox."recipientRole",
      outbox."emailType",
      outbox."subject",
      outbox."bodyHtml",
      outbox."status",
      outbox."attempts",
      outbox."leaseToken",
      outbox."leaseExpiresAt",
      outbox."featureKey",
      outbox."sendFenceGeneration",
      candidate."previousStatus"
  `);

  return rows[0] ?? null;
}

function errorClassOf(error: unknown): string {
  if (error instanceof Error && error.name.trim()) return error.name;
  return typeof error;
}

function errorMessageOf(error: unknown): string {
  const value = error instanceof Error ? error.message : String(error);
  return value.slice(0, 2_000);
}

async function defaultRecordDeadLetter(
  auditDb: Pick<OutboxDb, "auditLog">,
  input: DeadLetterInput,
): Promise<void> {
  await auditDb.auditLog.create({
    data: {
      entityType: "AssessmentEmailOutbox",
      entityId: input.outboxId,
      action: "ASSESSMENT_EMAIL_DEAD_LETTER",
      performedBy: "assessment-email-worker",
      changes: JSON.stringify({
        submissionId: input.submissionId,
        recipientRole: input.recipientRole,
        attempts: input.attempts,
        errorClass: input.errorClass,
      }),
    },
  });
}

async function defaultAuthorizeBeforeSend(
  authorizationDb: Pick<OutboxDb, "$queryRaw">,
  row: ClaimedOutboxRow,
): Promise<{ allowed: boolean; reason?: string; bodyHtml?: string }> {
  if (row.featureKey !== "PUBLIC_LEADS") {
    return { allowed: true };
  }
  const candidates = await authorizationDb.$queryRaw<
    Array<{
      coachId: string;
      email: string;
      deletedAt: Date | null;
      certificationStatus: string;
      certificationExpiry: Date | null;
      publicLeadDeletedAt: Date | null;
    }>
  >(Prisma.sql`
    SELECT
      coach."id" AS "coachId",
      coach."email",
      coach."deletedAt",
      coach."certificationStatus",
      coach."certificationExpiry",
      submission."publicLeadDeletedAt"
    FROM "assessment_submissions" AS submission
    LEFT JOIN "coaches" AS coach
      ON coach."id" = submission."referringCoachId"
    WHERE submission."id" = ${row.submissionId}
    LIMIT 1
  `);
  const candidate = candidates[0];
  const state = resolvePublicLeadsState(process.env, {
    coachId: candidate?.coachId ?? null,
  });
  const eligible =
    candidate !== undefined &&
    candidate.deletedAt === null &&
    candidate.publicLeadDeletedAt === null &&
    candidate.certificationStatus === "ACTIVE" &&
    (candidate.certificationExpiry === null ||
      candidate.certificationExpiry > new Date()) &&
    normalizeMailbox(candidate.email) ===
      normalizeMailbox(row.recipientEmail);
  if (row.recipientRole === "REFERRING_COACH") {
    return state.sendCoachNotification && eligible
      ? { allowed: true }
      : { allowed: false, reason: "PUBLIC_LEAD_AUTHORIZATION_REVOKED" };
  }
  if (row.recipientRole === "TAKER_COPY" && !state.presentationEnabled) {
    return {
      allowed: true,
      bodyHtml: row.bodyHtml
        .replace(
          /href="mailto:[^"]*"/g,
          'href="https://scalingup.com/coaches"',
        )
        .replaceAll("Talk to your coach →", "Find a coach →"),
    };
  }
  return { allowed: true };
}

/**
 * Drains either one submission (event path) or the global oldest-due queue
 * (cron path). Claims happen only inside the sequential send slot and before
 * the invocation budget is exhausted.
 */
export async function drainLeadOutbox(
  deps: DrainDeps,
  submissionId: string | null,
): Promise<DrainResult> {
  const currentTime = deps.now ?? (() => new Date());
  const makeLeaseToken = deps.makeLeaseToken ?? randomUUID;
  const maxAttempts = deps.maxAttempts ?? DEFAULT_MAX_ATTEMPTS;
  const maxRows =
    deps.maxRows ??
    (submissionId === null ? DEFAULT_CRON_ROWS : DEFAULT_EVENT_ROWS);
  const leaseMs = deps.leaseMs ?? DEFAULT_LEASE_MS;
  const invocationBudgetMs =
    deps.invocationBudgetMs ?? DEFAULT_INVOCATION_BUDGET_MS;
  const claimNext =
    deps.claimNext ??
    ((input: ClaimInput) => claimNextOutboxRow(deps.db, input));
  const recordDeadLetter =
    deps.recordDeadLetter ??
    ((input: DeadLetterInput) => defaultRecordDeadLetter(deps.db, input));
  const authorizeBeforeSend =
    deps.authorizeBeforeSend ??
    ((row: ClaimedOutboxRow) => defaultAuthorizeBeforeSend(deps.db, row));
  const releaseHeld =
    (process.env.PUBLIC_LEADS_POLICY_APPROVED === "1" ||
      process.env.PUBLIC_LEADS_POLICY_APPROVED?.toLowerCase() === "true") &&
    (process.env.PUBLIC_LEADS_DISTRIBUTED_LIMITER_READY === "1" ||
      process.env.PUBLIC_LEADS_DISTRIBUTED_LIMITER_READY?.toLowerCase() ===
        "true");

  const startedAt = currentTime().getTime();
  let sent = 0;
  let failed = 0;
  let skipped = 0;

  for (let index = 0; index < maxRows; index += 1) {
    const claimNow = currentTime();
    if (claimNow.getTime() - startedAt >= invocationBudgetMs) break;

    const leaseToken = makeLeaseToken();
    const row = await claimNext({
      submissionId,
      now: claimNow,
      leaseToken,
      leaseExpiresAt: new Date(claimNow.getTime() + leaseMs),
      releaseHeld,
    });
    if (!row) break;

    try {
      if (row.previousStatus === "HELD") {
        await deps.db.auditLog.create({
          data: {
            entityType: "AssessmentEmailOutbox",
            entityId: row.id,
            action: "PUBLIC_LEAD_HELD_RELEASE",
            performedBy: "assessment-email-worker",
            changes: JSON.stringify({
              submissionId: row.submissionId,
              recipientRole: row.recipientRole,
            }),
          },
        });
      }
      const authorization = await authorizeBeforeSend(row);
      if (!authorization.allowed) {
        const cancellation =
          await deps.db.assessmentEmailOutbox.updateMany({
            where: {
              id: row.id,
              status: "SENDING",
              leaseToken: row.leaseToken,
            },
            data: {
              status: "CANCELLED",
              cancelledAt: currentTime(),
              cancelReason:
                authorization.reason ?? "AUTHORIZATION_REVOKED",
              bodyHtml: "",
              leaseToken: null,
              leaseExpiresAt: null,
              sendFenceGeneration: { increment: 1 },
            },
          });
        skipped += cancellation.count;
        continue;
      }
      const fenced = await deps.db.assessmentEmailOutbox.updateMany({
        where: {
          id: row.id,
          status: "SENDING",
          leaseToken: row.leaseToken,
          sendFenceGeneration: row.sendFenceGeneration,
        },
        data: {},
      });
      if (fenced.count !== 1) {
        skipped += 1;
        continue;
      }
      await deps.sendEmail({
        to: row.recipientEmail,
        subject: row.subject,
        html: authorization.bodyHtml ?? row.bodyHtml,
      });

      const completion = await deps.db.assessmentEmailOutbox.updateMany({
        where: {
          id: row.id,
          status: "SENDING",
          leaseToken: row.leaseToken,
        },
        data: {
          status: "SENT",
          sentAt: currentTime(),
          bodyHtml: "",
          leaseToken: null,
          leaseExpiresAt: null,
          lastError: null,
        },
      });

      if (completion.count === 1) {
        sent += 1;
      } else {
        skipped += 1;
        console.warn("[assessment-email] lease completion lost", {
          outboxId: row.id,
          recipientRole: row.recipientRole,
        });
      }
    } catch (error) {
      const terminal = row.attempts >= maxAttempts;
      if (terminal) {
        // Audit must succeed before the only rendered retry payload is purged.
        await recordDeadLetter({
          submissionId: row.submissionId,
          outboxId: row.id,
          recipientRole: row.recipientRole,
          attempts: row.attempts,
          errorClass: errorClassOf(error),
        });
      }

      const failureNow = currentTime();
      const backoffMs = Math.pow(2, row.attempts) * 60_000;
      const completion = await deps.db.assessmentEmailOutbox.updateMany({
        where: {
          id: row.id,
          status: "SENDING",
          leaseToken: row.leaseToken,
        },
        data: {
          status: terminal ? "FAILED" : "PENDING",
          lastError: errorMessageOf(error),
          nextAttemptAt: new Date(failureNow.getTime() + backoffMs),
          leaseToken: null,
          leaseExpiresAt: null,
          ...(terminal ? { bodyHtml: "" } : {}),
        },
      });

      if (completion.count === 1) {
        failed += 1;
      } else {
        skipped += 1;
      }
    }
  }

  return { sent, failed, skipped };
}

export const quickAssessmentLeadEmail = inngest.createFunction(
  { id: "quick-assessment-lead-email", retries: 3 },
  { event: "assessment/quick-lead.enqueued" },
  async ({ event, step }) =>
    step.run("drain-lead-outbox", () =>
      drainLeadOutbox(
        {
          db: db as unknown as OutboxDb,
          sendEmail: ({ to, subject, html }) =>
            sendEmailViaSMTP({ to, subject, html }),
        },
        event.data.submissionId,
      ),
    ),
);

export const quickAssessmentLeadEmailCron = inngest.createFunction(
  { id: "quick-assessment-lead-email-cron" },
  { cron: "*/3 * * * *" },
  async ({ step }) =>
    step.run("drain-global-assessment-outbox", () =>
      drainLeadOutbox(
        {
          db: db as unknown as OutboxDb,
          sendEmail: ({ to, subject, html }) =>
            sendEmailViaSMTP({ to, subject, html }),
        },
        null,
      ),
    ),
);

/**
 * A Coach tombstone is intentionally reported as pending until the maximum
 * transport-bound lease window has elapsed. This reconciler records the
 * durable quiescence receipt; a transport call already in flight at deletion
 * remains an explicitly acknowledged possible exposure.
 */
export const publicLeadMailFenceReconciler = inngest.createFunction(
  {
    id: "assessment-public-lead-mail-fence-reconciler",
    retries: 3,
    concurrency: { limit: 1 },
  },
  { cron: "*/2 * * * *" },
  async ({ step }) =>
    step.run("reconcile-public-lead-mail-fences", async () => {
      const now = new Date();
      const transportBound = new Date(now.getTime() - DEFAULT_LEASE_MS);
      const coaches = await db.coach.findMany({
        where: {
          deletedAt: { lte: transportBound },
          publicLeadMailQuiescedAt: null,
        },
        take: 100,
        select: { id: true, deletedAt: true },
      });
      for (const coach of coaches) {
        await db.$transaction(async (tx) => {
          const activeLeases = await tx.assessmentEmailOutbox.count({
            where: {
              featureKey: "PUBLIC_LEADS",
              recipientRole: "REFERRING_COACH",
              status: "SENDING",
              leaseExpiresAt: { gt: now },
              submission: { referringCoachId: coach.id },
            },
          });
          if (activeLeases > 0) return;
          const updated = await tx.coach.updateMany({
            where: { id: coach.id, publicLeadMailQuiescedAt: null },
            data: { publicLeadMailQuiescedAt: now },
          });
          if (updated.count !== 1) return;
          await tx.auditLog.create({
            data: {
              entityType: "Coach",
              entityId: coach.id,
              action: "PUBLIC_LEAD_MAIL_QUIESCED",
              performedBy: "assessment-email-worker",
              changes: JSON.stringify({
                deletedAt: coach.deletedAt,
                quiescedAt: now,
                transportBoundElapsed: true,
                possibleInFlightExposure: true,
              }),
            },
          });
        });
      }
      return { reconciled: coaches.length };
    }),
);
