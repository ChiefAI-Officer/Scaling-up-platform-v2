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
          // SEC-M4: bodyHtml holds rendered PII (the respondent's full report).
          // Purge it once the row is terminal — the column is NOT NULL, so we
          // clear to "" rather than null.
          bodyHtml: "",
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
          // SEC-M4: on a TERMINAL failure the row is never re-sent, so purge the
          // rendered-PII body. A still-PENDING row keeps its body for retry.
          ...(newStatus === "FAILED" ? { bodyHtml: "" } : {}),
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

// ---------------------------------------------------------------------------
// Scheduled cron drain — the durable retry driver
// ---------------------------------------------------------------------------
//
// The event-triggered fn above handles the immediate first attempt. But a row
// left PENDING (transient SMTP failure, or an inngest.send that never fired
// because of an outage) would otherwise never be re-attempted — drainLeadOutbox
// swallows send errors so the step.run succeeds and Inngest's own retries never
// engage. This cron is what makes the per-row exponential backoff + maxAttempts
// bookkeeping actually live: every few minutes it finds submissions with PENDING
// rows that are now due (nextAttemptAt <= now) and re-drains them.

export interface DueScanDb {
  assessmentEmailOutbox: {
    findMany(args: unknown): Promise<Array<{ submissionId: string }>>;
  };
}

/**
 * Returns the distinct submissionIds that have at least one PENDING outbox row
 * due for a (re)send (nextAttemptAt <= now). Bounded by `limit` so a backlog
 * can't blow up a single cron tick.
 */
export async function listSubmissionsWithDueOutbox(
  db: DueScanDb,
  now: Date,
  limit = 200,
): Promise<string[]> {
  const rows = await db.assessmentEmailOutbox.findMany({
    where: { status: "PENDING", nextAttemptAt: { lte: now } },
    select: { submissionId: true },
    distinct: ["submissionId"],
    take: limit,
  });
  return rows.map((r) => r.submissionId);
}

export const quickAssessmentLeadEmailCron = inngest.createFunction(
  { id: "quick-assessment-lead-email-cron" },
  { cron: "*/3 * * * *" },
  async ({ step }) => {
    const submissionIds = await step.run("scan-due-outbox", () =>
      listSubmissionsWithDueOutbox(db as unknown as DueScanDb, new Date()),
    );

    let totalSent = 0;
    let totalFailed = 0;
    for (const submissionId of submissionIds) {
      const r = await step.run(`drain-${submissionId}`, () =>
        drainLeadOutbox(
          {
            db: db as unknown as OutboxDb,
            sendEmail: ({ to, subject, html }) =>
              sendEmailViaSMTP({ to, subject, html }),
          },
          submissionId,
        ),
      );
      totalSent += r.sent;
      totalFailed += r.failed;
    }

    return { submissions: submissionIds.length, totalSent, totalFailed };
  },
);
