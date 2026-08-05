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
import { reportEmailAttachments } from "@/lib/assessments/report-email-attachments";
import { db } from "@/lib/db";
import {
  sendEmailViaSMTP,
  type SmtpAttachment,
} from "@/lib/smtp-transport";

const DEFAULT_LEASE_MS = 600_000;
const DEFAULT_INVOCATION_BUDGET_MS = 45_000;
const DEFAULT_EVENT_ROWS = 10;
const DEFAULT_CRON_ROWS = 50;
const DEFAULT_MAX_ATTEMPTS = 5;
const DEFAULT_COMPLETION_RETRIES = 3;
const DEFAULT_SMTP_CONCURRENCY = 4;

const ASSESSMENT_SMTP_CONCURRENCY = {
  scope: "env" as const,
  key: '"assessment-email-smtp"',
  limit: assessmentSmtpConcurrencyLimit(),
};

export function assessmentSmtpConcurrencyLimit(
  configuredValue = process.env.ASSESSMENT_SMTP_CONCURRENCY,
): number {
  if (configuredValue === undefined) return DEFAULT_SMTP_CONCURRENCY;
  const parsed = Number(configuredValue);
  return Number.isSafeInteger(parsed) && parsed > 0
    ? parsed
    : DEFAULT_SMTP_CONCURRENCY;
}

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
  recoveredExpiredLease: boolean;
}

interface UpdateManyResult {
  count: number;
}

export interface OutboxTransactionDb {
  assessmentEmailOutbox: {
    updateMany(args: unknown): Promise<UpdateManyResult>;
  };
  auditLog: {
    create(args: unknown): Promise<unknown>;
  };
}

export interface OutboxDb extends OutboxTransactionDb {
  $queryRaw<T>(query: Prisma.Sql): Promise<T>;
  $transaction<T>(
    callback: (tx: OutboxTransactionDb) => Promise<T>,
  ): Promise<T>;
}

export interface ClaimInput {
  submissionId: string | null;
  leaseToken: string;
  leaseMs: number;
}

export interface DeadLetterInput {
  submissionId: string;
  outboxId: string;
  recipientRole: string;
  attempts: number;
  errorClass: string;
}

export interface TerminalFailureInput extends DeadLetterInput {
  leaseToken: string;
  lastError: string;
  nextAttemptAt: Date;
}

export interface DeliveryUncertainInput extends DeadLetterInput {
  reason:
    | "EXPIRED_LEASE_RECOVERED"
    | "LEASE_COMPLETION_LOST"
    | "SENT_STATE_PERSISTENCE_FAILED";
}

export interface DrainDeps {
  db: OutboxDb;
  sendEmail: (input: {
    to: string;
    subject: string;
    html: string;
    attachments?: SmtpAttachment[];
  }) => Promise<void>;
  resolveAttachments?: (bodyHtml: string) => SmtpAttachment[];
  claimNext?: (input: ClaimInput) => Promise<ClaimedOutboxRow | null>;
  finalizeTerminalFailure?: (
    input: TerminalFailureInput,
  ) => Promise<boolean>;
  recordDeliveryUncertain?: (
    input: DeliveryUncertainInput,
  ) => Promise<void>;
  now?: () => Date;
  makeLeaseToken?: () => string;
  maxAttempts?: number;
  maxRows?: number;
  leaseMs?: number;
  invocationBudgetMs?: number;
  completionRetries?: number;
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

  const rows = await claimDb.$queryRaw<ClaimedOutboxRow[]>(Prisma.sql`
    WITH candidate AS (
      SELECT "id", ("status" = 'SENDING') AS "recoveredExpiredLease"
      FROM "assessment_email_outbox"
      WHERE "cancelledAt" IS NULL
      AND (
        (
          "status" = 'PENDING'
          AND "nextAttemptAt" <= (statement_timestamp() AT TIME ZONE 'UTC')
        )
        OR (
          "status" = 'SENDING'
          AND "leaseExpiresAt" <= (statement_timestamp() AT TIME ZONE 'UTC')
        )
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
      "leaseExpiresAt" =
        (statement_timestamp() AT TIME ZONE 'UTC')
        + (${input.leaseMs} * INTERVAL '1 millisecond'),
      "attempts" = outbox."attempts" + 1,
      "updatedAt" = (statement_timestamp() AT TIME ZONE 'UTC')
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
      candidate."recoveredExpiredLease"
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

async function defaultRecordDeliveryUncertain(
  auditDb: Pick<OutboxTransactionDb, "auditLog">,
  input: DeliveryUncertainInput,
): Promise<void> {
  await auditDb.auditLog.create({
    data: {
      entityType: "AssessmentEmailOutbox",
      entityId: input.outboxId,
      action: "ASSESSMENT_EMAIL_DELIVERY_UNCERTAIN",
      performedBy: "assessment-email-worker",
      changes: JSON.stringify({
        submissionId: input.submissionId,
        recipientRole: input.recipientRole,
        attempts: input.attempts,
        errorClass: input.errorClass,
        reason: input.reason,
      }),
    },
  });
}

async function recordDeliveryUncertainty(
  recorder: (input: DeliveryUncertainInput) => Promise<void>,
  input: DeliveryUncertainInput,
): Promise<void> {
  const signal = {
    submissionId: input.submissionId,
    outboxId: input.outboxId,
    recipientRole: input.recipientRole,
    attempts: input.attempts,
    errorClass: input.errorClass,
    reason: input.reason,
  };
  console.error("[assessment-email] delivery outcome uncertain", signal);
  try {
    await recorder(input);
  } catch (auditError) {
    console.error("[assessment-email] uncertainty audit persistence failed", {
      ...signal,
      auditErrorClass: errorClassOf(auditError),
    });
    throw auditError;
  }
}

/**
 * Token-guards the terminal transition and writes its audit in the same
 * transaction. A stale worker that lost its lease writes neither.
 */
export async function finalizeTerminalFailure(
  outboxDb: Pick<OutboxDb, "$transaction">,
  input: TerminalFailureInput,
): Promise<boolean> {
  return outboxDb.$transaction(async (tx) => {
    const completion = await tx.assessmentEmailOutbox.updateMany({
      where: {
        id: input.outboxId,
        status: "SENDING",
        leaseToken: input.leaseToken,
      },
      data: {
        status: "FAILED",
        lastError: input.lastError,
        nextAttemptAt: input.nextAttemptAt,
        leaseToken: null,
        leaseExpiresAt: null,
        bodyHtml: "",
      },
    });
    if (completion.count !== 1) return false;

    await tx.auditLog.create({
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
    return true;
  });
}

async function completeSentWithRetry(
  outboxDb: Pick<OutboxTransactionDb, "assessmentEmailOutbox">,
  row: ClaimedOutboxRow,
  sentAt: Date,
  maxAttempts: number,
): Promise<UpdateManyResult> {
  let lastError: unknown;
  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    try {
      return await outboxDb.assessmentEmailOutbox.updateMany({
        where: {
          id: row.id,
          status: "SENDING",
          leaseToken: row.leaseToken,
        },
        data: {
          status: "SENT",
          sentAt,
          bodyHtml: "",
          leaseToken: null,
          leaseExpiresAt: null,
          lastError: null,
        },
      });
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError;
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
  const completionRetries = Math.max(
    1,
    deps.completionRetries ?? DEFAULT_COMPLETION_RETRIES,
  );
  const claimNext =
    deps.claimNext ??
    ((input: ClaimInput) => claimNextOutboxRow(deps.db, input));
  const finalizeFailure =
    deps.finalizeTerminalFailure ??
    ((input: TerminalFailureInput) =>
      finalizeTerminalFailure(deps.db, input));
  const recordDeliveryUncertain =
    deps.recordDeliveryUncertain ??
    ((input: DeliveryUncertainInput) =>
      defaultRecordDeliveryUncertain(deps.db, input));
  const resolveAttachments =
    deps.resolveAttachments ?? reportEmailAttachments;

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
      leaseToken,
      leaseMs,
    });
    if (!row) break;

    if (row.recoveredExpiredLease) {
      // A prior worker may have reached SMTP before losing its lease. Persist
      // the duplicate-risk signal before attempting another delivery.
      await recordDeliveryUncertainty(recordDeliveryUncertain, {
        submissionId: row.submissionId,
        outboxId: row.id,
        recipientRole: row.recipientRole,
        attempts: row.attempts,
        errorClass: "ExpiredLease",
        reason: "EXPIRED_LEASE_RECOVERED",
      });
    }

    let sendError: unknown;
    try {
      const attachments = resolveAttachments(row.bodyHtml);
      await deps.sendEmail({
        to: row.recipientEmail,
        subject: row.subject,
        html: row.bodyHtml,
        ...(attachments.length > 0 ? { attachments } : {}),
      });
    } catch (error) {
      sendError = error;
    }

    if (sendError === undefined) {
      try {
        const completion = await completeSentWithRetry(
          deps.db,
          row,
          currentTime(),
          completionRetries,
        );
        if (completion.count === 1) {
          sent += 1;
        } else {
          await recordDeliveryUncertainty(recordDeliveryUncertain, {
            submissionId: row.submissionId,
            outboxId: row.id,
            recipientRole: row.recipientRole,
            attempts: row.attempts,
            errorClass: "LeaseOwnershipLost",
            reason: "LEASE_COMPLETION_LOST",
          });
          skipped += 1;
        }
      } catch (persistenceError) {
        // SMTP accepted the message. Never reclassify this as a transport
        // failure or requeue it deliberately. Keep the token-owned lease/body
        // intact and surface the unavoidable at-least-once uncertainty.
        try {
          await recordDeliveryUncertainty(recordDeliveryUncertain, {
            submissionId: row.submissionId,
            outboxId: row.id,
            recipientRole: row.recipientRole,
            attempts: row.attempts,
            errorClass: errorClassOf(persistenceError),
            reason: "SENT_STATE_PERSISTENCE_FAILED",
          });
        } catch {
          // The structured fallback above is durable outside the failing DB
          // path. Preserve the original SENT-state persistence error.
        }
        throw persistenceError;
      }
      continue;
    }

    const failureNow = currentTime();
    const backoffMs = Math.pow(2, row.attempts) * 60_000;
    const nextAttemptAt = new Date(failureNow.getTime() + backoffMs);
    const terminal = row.attempts >= maxAttempts;
    if (terminal) {
      const finalized = await finalizeFailure({
        submissionId: row.submissionId,
        outboxId: row.id,
        recipientRole: row.recipientRole,
        attempts: row.attempts,
        errorClass: errorClassOf(sendError),
        leaseToken: row.leaseToken,
        lastError: errorMessageOf(sendError),
        nextAttemptAt,
      });
      if (finalized) {
        failed += 1;
      } else {
        skipped += 1;
      }
      continue;
    }

    const completion = await deps.db.assessmentEmailOutbox.updateMany({
      where: {
        id: row.id,
        status: "SENDING",
        leaseToken: row.leaseToken,
      },
      data: {
        status: "PENDING",
        lastError: errorMessageOf(sendError),
        nextAttemptAt,
        leaseToken: null,
        leaseExpiresAt: null,
      },
    });

    if (completion.count === 1) {
      failed += 1;
    } else {
      await recordDeliveryUncertainty(recordDeliveryUncertain, {
        submissionId: row.submissionId,
        outboxId: row.id,
        recipientRole: row.recipientRole,
        attempts: row.attempts,
        errorClass: "LeaseOwnershipLost",
        reason: "LEASE_COMPLETION_LOST",
      });
      skipped += 1;
    }
  }

  return { sent, failed, skipped };
}

export const quickAssessmentLeadEmail = inngest.createFunction(
  {
    id: "quick-assessment-lead-email",
    retries: 3,
    concurrency: ASSESSMENT_SMTP_CONCURRENCY,
  },
  { event: "assessment/quick-lead.enqueued" },
  async ({ event, step }) =>
    step.run("drain-lead-outbox", () =>
      drainLeadOutbox(
        {
          db: db as unknown as OutboxDb,
          sendEmail: ({ to, subject, html, attachments }) =>
            sendEmailViaSMTP({
              to,
              subject,
              html,
              ...(attachments ? { attachments } : {}),
            }),
        },
        event.data.submissionId,
      ),
    ),
);

export const quickAssessmentLeadEmailCron = inngest.createFunction(
  {
    id: "quick-assessment-lead-email-cron",
    concurrency: ASSESSMENT_SMTP_CONCURRENCY,
  },
  { cron: "*/3 * * * *" },
  async ({ step }) =>
    step.run("drain-global-assessment-outbox", () =>
      drainLeadOutbox(
        {
          db: db as unknown as OutboxDb,
          sendEmail: ({ to, subject, html, attachments }) =>
            sendEmailViaSMTP({
              to,
              subject,
              html,
              ...(attachments ? { attachments } : {}),
            }),
        },
        null,
      ),
    ),
);
