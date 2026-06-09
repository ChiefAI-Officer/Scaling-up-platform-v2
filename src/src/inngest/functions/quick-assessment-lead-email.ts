/**
 * Inngest Function: Quick Assessment Lead Email Worker
 *
 * Drains the AssessmentEmailOutbox for a submission, sending each PENDING row
 * via SMTP with exponential-backoff retries and idempotency.
 *
 * Design for testability: the drain logic lives in `drainLeadOutbox` (pure of
 * globals, injected deps), and the Inngest fn is a thin wrapper — mirroring
 * the landing-page runner pattern used across this codebase.
 */

import { inngest } from "@/inngest/client";
import { db } from "@/lib/db";
import { sendEmailViaSMTP } from "@/lib/smtp-transport";

// ---------------------------------------------------------------------------
// Interfaces
// ---------------------------------------------------------------------------

export interface OutboxDb {
  assessmentEmailOutbox: {
    findMany(args: unknown): Promise<
      Array<{
        id: string;
        recipientEmail: string;
        recipientRole: string;
        subject: string;
        bodyHtml: string;
        status: string;
        attempts: number;
      }>
    >;
    update(args: unknown): Promise<unknown>;
  };
}

export interface DrainDeps {
  db: OutboxDb;
  sendEmail: (o: { to: string; subject: string; html: string }) => Promise<void>;
  now?: () => Date;
  maxAttempts?: number;
}

export interface DrainResult {
  sent: number;
  failed: number;
  skipped: number;
}

// ---------------------------------------------------------------------------
// Pure drain logic (fully injectable, no global DB/SMTP references)
// ---------------------------------------------------------------------------

/**
 * Drains the AssessmentEmailOutbox for a given submission.
 *
 * - Loads PENDING rows where nextAttemptAt <= now.
 * - For each row calls sendEmail; on success marks SENT + sentAt.
 * - On throw: increments attempts + records lastError; if attempts+1 >= maxAttempts
 *   marks FAILED, otherwise stays PENDING with exponential nextAttemptAt backoff
 *   (2^attempts minutes).
 * - Re-runs are idempotent: no SENT rows are returned by findMany so they are
 *   never re-sent.
 */
export async function drainLeadOutbox(
  deps: DrainDeps,
  submissionId: string
): Promise<DrainResult> {
  const now = deps.now ? deps.now() : new Date();
  const maxAttempts = deps.maxAttempts ?? 5;

  const rows = await deps.db.assessmentEmailOutbox.findMany({
    where: {
      submissionId,
      status: "PENDING",
      nextAttemptAt: { lte: now },
    },
  });

  let sent = 0;
  let failed = 0;
  const skipped = 0;

  for (const row of rows) {
    try {
      await deps.sendEmail({
        to: row.recipientEmail,
        subject: row.subject,
        html: row.bodyHtml,
      });

      await deps.db.assessmentEmailOutbox.update({
        where: { id: row.id },
        data: {
          status: "SENT",
          sentAt: now,
        },
      });

      sent++;
    } catch (err) {
      const newAttempts = row.attempts + 1;
      const lastError =
        err instanceof Error ? err.message : String(err);

      // Exponential backoff: 2^attempts minutes
      const backoffMs = Math.pow(2, row.attempts) * 60 * 1000;
      const nextAttemptAt = new Date(now.getTime() + backoffMs);

      const newStatus = newAttempts >= maxAttempts ? "FAILED" : "PENDING";

      await deps.db.assessmentEmailOutbox.update({
        where: { id: row.id },
        data: {
          attempts: newAttempts,
          lastError,
          status: newStatus,
          nextAttemptAt,
        },
      });

      failed++;
    }
  }

  return { sent, failed, skipped };
}

// ---------------------------------------------------------------------------
// Inngest function — thin wrapper around drainLeadOutbox
// ---------------------------------------------------------------------------

export const quickAssessmentLeadEmail = inngest.createFunction(
  { id: "quick-assessment-lead-email", retries: 3 },
  { event: "assessment/quick-lead.enqueued" },
  async ({ event, step }) => {
    const { submissionId } = event.data;

    const result = await step.run("drain-lead-outbox", () =>
      drainLeadOutbox(
        {
          db: db as unknown as OutboxDb,
          sendEmail: ({ to, subject, html }) =>
            sendEmailViaSMTP({ to, subject, html }),
        },
        submissionId
      )
    );

    return result;
  }
);
