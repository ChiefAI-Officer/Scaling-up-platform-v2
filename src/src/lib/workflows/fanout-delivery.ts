/**
 * PR-3 (audit Inngest dedup) — shared fan-out delivery for attendee-targeted
 * workflow steps (EMAIL_ATTENDEES, SEND_SURVEY_LINK, SEND_FILE_LINK) across both
 * trigger-workflow-step.ts and execute-workflow.ts.
 *
 * The retry-resend bug came from each invocation creating a FRESH parent row, so
 * a transient-SMTP throw → Inngest retry → new parent → prior recipients re-sent.
 * Fix: anchor on ONE reused parent per logical delivery batch and skip recipients
 * that already have a SENT child under it.
 *
 *   ensureExecutionParent()  — upsert/reuse the single parent row, keyed by a
 *     SEMANTIC deliveryBatchKey (not raw Inngest runId, which only dedupes one
 *     run's retries — not duplicate event emission or concurrent runs).
 *   sendFanoutRecipients()   — load the parent's SENT children, skip them, send
 *     the rest, record each SENT immediately, roll the parent up.
 *
 * Residual: at-least-once (a crash between a successful send and its SENT-write
 * re-sends that single recipient on retry). Exactly-once needs a provider-side
 * idempotency key — out of scope.
 */

import type { Prisma } from "@prisma/client";
import type { db } from "@/lib/db";
import { recordRecipientExecution, finalizeParentRollup } from "./recipient-execution";

type Client = Prisma.TransactionClient | typeof db;

export type FanoutRecipient = { registrationId: string; email: string };

export type FanoutOutcome = { parentId: string; sent: number; skipped: number };

// SMTP auth-failure signatures that recur on every retry (bad auth / permanent
// reject). Shared by the terminal-vs-transient classifier and the redactor.
const SMTP_AUTH_PATTERN = /EAUTH|535|Invalid login|Authentication/i;

/**
 * Shared SMTP terminal-vs-transient classifier. A terminal error (bad auth /
 * permanent reject) will recur on every retry, so it stops the batch and records
 * FAILED rather than burning Inngest retries. Everything else is treated as
 * transient (rethrown → Inngest retry → the reused parent skips prior SENTs).
 * Single source of truth for the two Inngest send functions.
 */
export function isTerminalSmtpError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  return SMTP_AUTH_PATTERN.test(msg);
}

/**
 * Map a send error to a STABLE, non-sensitive code for storage in
 * `WorkflowStepExecution.errorMessage`. That field is rendered in the admin
 * workflow-executions panel and the "trigger now" operator toast, so it must
 * never carry raw SMTP server text (hostnames, credential hints, 5xx detail).
 * The raw error is kept only in `console.error` (ephemeral server logs).
 */
export function redactSmtpError(
  err: unknown
): "smtp_auth_failed" | "smtp_send_failed" {
  const msg = err instanceof Error ? err.message : String(err);
  return SMTP_AUTH_PATTERN.test(msg) ? "smtp_auth_failed" : "smtp_send_failed";
}

/**
 * Upsert (create-or-reuse) the single parent execution row for a delivery batch,
 * keyed by the unique `deliveryBatchKey`. `update: {}` means a retry of the same
 * batch returns the existing row (with its already-SENT children) rather than a
 * fresh parent.
 */
export async function ensureExecutionParent(
  client: Client,
  args: {
    deliveryBatchKey: string;
    stepId: string;
    workshopId: string;
    scheduledFor?: Date;
  }
): Promise<string> {
  try {
    const row = await client.workflowStepExecution.upsert({
      where: { deliveryBatchKey: args.deliveryBatchKey },
      create: {
        deliveryBatchKey: args.deliveryBatchKey,
        stepId: args.stepId,
        workshopId: args.workshopId,
        status: "SCHEDULED",
        scheduledFor: args.scheduledFor ?? new Date(),
      },
      update: {},
      select: { id: true },
    });
    return row.id;
  } catch (err) {
    // Prisma upsert is NOT atomic on a unique column: two concurrent runs with
    // the same deliveryBatchKey can both miss the row and race the create — the
    // loser throws a P2002 unique violation. Re-read the winner instead of
    // failing the whole batch (which on the immediate path would otherwise
    // record a spurious FAILED parent for that one attempt).
    if (
      err &&
      typeof err === "object" &&
      "code" in err &&
      (err as { code?: string }).code === "P2002"
    ) {
      const existing = await client.workflowStepExecution.findUnique({
        where: { deliveryBatchKey: args.deliveryBatchKey },
        select: { id: true },
      });
      if (existing) return existing.id;
    }
    throw err;
  }
}

/**
 * Send to each recipient at most once per parent. Recipients with an existing
 * SENT child under `parentId` (from a prior run of the same batch) are skipped.
 * `sendOne` builds + sends the actual email. A non-terminal (transient) error is
 * rethrown so Inngest retries — the parent is reused, so the recipients already
 * sent are skipped on the next run. A terminal error records the recipient FAILED
 * and stops the batch.
 */
export async function sendFanoutRecipients(
  client: Client,
  args: {
    parentId: string;
    stepId: string;
    workshopId: string;
    recipients: FanoutRecipient[];
    sendOne: (recipient: FanoutRecipient) => Promise<void>;
    isTerminalError?: (err: unknown) => boolean;
  }
): Promise<FanoutOutcome> {
  const priorSent = await client.workflowStepExecution.findMany({
    where: { parentId: args.parentId, status: "SENT" },
    select: { registrationId: true, recipientEmail: true },
  });
  const alreadySent = new Set(
    priorSent.map((r) => r.registrationId).filter((id): id is string => !!id)
  );
  const seenEmail = new Set(
    priorSent
      .map((r) => r.recipientEmail?.trim().toLowerCase())
      .filter((email): email is string => !!email)
  );

  let sent = 0;
  let skipped = 0;

  for (const recipient of args.recipients) {
    const normalizedEmail = recipient.email.trim().toLowerCase();
    if (alreadySent.has(recipient.registrationId)) {
      seenEmail.add(normalizedEmail);
      skipped++;
      continue;
    }
    if (seenEmail.has(normalizedEmail)) {
      skipped++;
      continue;
    }
    seenEmail.add(normalizedEmail);

    try {
      await args.sendOne(recipient);
      await recordRecipientExecution(client, {
        parentId: args.parentId,
        stepId: args.stepId,
        workshopId: args.workshopId,
        registrationId: recipient.registrationId,
        recipientEmail: recipient.email,
        status: "SENT",
      });
      sent++;
    } catch (err) {
      const terminal = args.isTerminalError ? args.isTerminalError(err) : false;
      if (!terminal) {
        // Transient — let Inngest retry; the parent is reused so this recipient
        // (not yet recorded SENT) is retried while prior SENT ones are skipped.
        throw err;
      }
      // Terminal — record the failure and stop the batch (the cause, e.g. an
      // auth failure, affects every remaining recipient). Store only a redacted
      // code; keep the raw error in the server log for debugging.
      console.error(
        `[fanout-delivery] terminal send error for ${recipient.registrationId}:`,
        err
      );
      await recordRecipientExecution(client, {
        parentId: args.parentId,
        stepId: args.stepId,
        workshopId: args.workshopId,
        registrationId: recipient.registrationId,
        recipientEmail: recipient.email,
        status: "FAILED",
        errorMessage: redactSmtpError(err),
      });
      break;
    }
  }

  await finalizeParentRollup(client, args.parentId);
  return { parentId: args.parentId, sent, skipped };
}
