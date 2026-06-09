/**
 * Tests for drainLeadOutbox — the pure, injected-dep drain function
 * used by the quickAssessmentLeadEmail Inngest function.
 *
 * All tests mock db + sendEmail; no real DB or SMTP used.
 */

/* eslint-disable @typescript-eslint/no-explicit-any */

import {
  drainLeadOutbox,
  type DrainDeps,
} from "@/inngest/functions/quick-assessment-lead-email";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeRow(overrides: Partial<{
  id: string;
  recipientEmail: string;
  recipientRole: string;
  subject: string;
  bodyHtml: string;
  status: string;
  attempts: number;
}> = {}) {
  return {
    id: overrides.id ?? "row-1",
    recipientEmail: overrides.recipientEmail ?? "coach@example.com",
    recipientRole: overrides.recipientRole ?? "REFERRING_COACH",
    subject: overrides.subject ?? "Your lead is ready",
    bodyHtml: overrides.bodyHtml ?? "<p>Results</p>",
    status: overrides.status ?? "PENDING",
    attempts: overrides.attempts ?? 0,
  };
}

function makeDeps(overrides: Partial<DrainDeps> = {}): DrainDeps & {
  dbFindMany: jest.Mock;
  dbUpdate: jest.Mock;
  sendEmail: jest.Mock;
} {
  const dbFindMany = jest.fn();
  const dbUpdate = jest.fn().mockResolvedValue({});
  const sendEmail = jest.fn().mockResolvedValue(undefined);

  return {
    db: {
      assessmentEmailOutbox: {
        findMany: dbFindMany,
        update: dbUpdate,
      },
    },
    sendEmail,
    dbFindMany,
    dbUpdate,
    ...overrides,
  } as any;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("drainLeadOutbox", () => {
  const SUBMISSION_ID = "sub-abc-123";

  beforeEach(() => {
    jest.clearAllMocks();
  });

  // -------------------------------------------------------------------------
  // Happy path: 2 PENDING rows both send OK
  // -------------------------------------------------------------------------
  it("sends all PENDING rows and marks them SENT, returning {sent:2,failed:0,skipped:0}", async () => {
    const row1 = makeRow({ id: "row-1", recipientEmail: "coach@example.com" });
    const row2 = makeRow({ id: "row-2", recipientEmail: "team@scalingup.com", recipientRole: "SU_TEAM" });

    const deps = makeDeps();
    deps.dbFindMany.mockResolvedValue([row1, row2]);

    const result = await drainLeadOutbox(deps, SUBMISSION_ID);

    expect(result).toEqual({ sent: 2, failed: 0, skipped: 0 });

    // sendEmail called twice, once per recipient
    expect(deps.sendEmail).toHaveBeenCalledTimes(2);
    expect(deps.sendEmail).toHaveBeenCalledWith({
      to: "coach@example.com",
      subject: row1.subject,
      html: row1.bodyHtml,
    });
    expect(deps.sendEmail).toHaveBeenCalledWith({
      to: "team@scalingup.com",
      subject: row2.subject,
      html: row2.bodyHtml,
    });

    // Both rows updated to SENT with sentAt set
    expect(deps.dbUpdate).toHaveBeenCalledTimes(2);
    const call1 = deps.dbUpdate.mock.calls[0][0];
    expect(call1.where.id).toBe("row-1");
    expect(call1.data.status).toBe("SENT");
    expect(call1.data.sentAt).toBeInstanceOf(Date);

    const call2 = deps.dbUpdate.mock.calls[1][0];
    expect(call2.where.id).toBe("row-2");
    expect(call2.data.status).toBe("SENT");
    expect(call2.data.sentAt).toBeInstanceOf(Date);
  });

  // -------------------------------------------------------------------------
  // Send throws: row stays PENDING with attempts+1 and nextAttemptAt in future
  // -------------------------------------------------------------------------
  it("on send throw increments attempts, records lastError, keeps status PENDING, sets nextAttemptAt in future", async () => {
    const row = makeRow({ id: "row-fail", attempts: 0 });
    const deps = makeDeps();
    deps.dbFindMany.mockResolvedValue([row]);
    deps.sendEmail.mockRejectedValue(new Error("SMTP connection refused"));

    const fixedNow = new Date("2026-01-01T12:00:00Z");
    deps.now = () => fixedNow;

    const result = await drainLeadOutbox(deps, SUBMISSION_ID);

    expect(result).toEqual({ sent: 0, failed: 1, skipped: 0 });

    expect(deps.dbUpdate).toHaveBeenCalledTimes(1);
    const call = deps.dbUpdate.mock.calls[0][0];
    expect(call.where.id).toBe("row-fail");
    expect(call.data.attempts).toBe(1);
    expect(call.data.lastError).toBe("SMTP connection refused");
    expect(call.data.status).toBe("PENDING");
    // nextAttemptAt should be in the future relative to fixedNow
    expect(call.data.nextAttemptAt.getTime()).toBeGreaterThan(fixedNow.getTime());
  });

  // -------------------------------------------------------------------------
  // Exhausted retries: attempts:4 + throw = status FAILED (maxAttempts default 5)
  // -------------------------------------------------------------------------
  it("marks row as FAILED when attempts+1 reaches maxAttempts (default 5)", async () => {
    const row = makeRow({ id: "row-exhausted", attempts: 4 });
    const deps = makeDeps();
    deps.dbFindMany.mockResolvedValue([row]);
    deps.sendEmail.mockRejectedValue(new Error("Permanent failure"));

    const result = await drainLeadOutbox(deps, SUBMISSION_ID);

    expect(result).toEqual({ sent: 0, failed: 1, skipped: 0 });

    const call = deps.dbUpdate.mock.calls[0][0];
    expect(call.where.id).toBe("row-exhausted");
    expect(call.data.attempts).toBe(5);
    expect(call.data.status).toBe("FAILED");
    expect(call.data.lastError).toBe("Permanent failure");
  });

  // -------------------------------------------------------------------------
  // Idempotent re-run: findMany returns [] (all already SENT)
  // -------------------------------------------------------------------------
  it("is idempotent when no PENDING rows remain — no sends, returns {sent:0,failed:0,skipped:0}", async () => {
    const deps = makeDeps();
    deps.dbFindMany.mockResolvedValue([]);

    const result = await drainLeadOutbox(deps, SUBMISSION_ID);

    expect(result).toEqual({ sent: 0, failed: 0, skipped: 0 });
    expect(deps.sendEmail).not.toHaveBeenCalled();
    expect(deps.dbUpdate).not.toHaveBeenCalled();
  });

  // -------------------------------------------------------------------------
  // sendEmail is called with row's recipientEmail / subject / bodyHtml
  // -------------------------------------------------------------------------
  it("passes recipientEmail, subject, bodyHtml exactly to sendEmail", async () => {
    const row = makeRow({
      id: "row-content",
      recipientEmail: "specific@test.com",
      subject: "Exact Subject Line",
      bodyHtml: "<h1>Exact Body</h1>",
    });
    const deps = makeDeps();
    deps.dbFindMany.mockResolvedValue([row]);

    await drainLeadOutbox(deps, SUBMISSION_ID);

    expect(deps.sendEmail).toHaveBeenCalledWith({
      to: "specific@test.com",
      subject: "Exact Subject Line",
      html: "<h1>Exact Body</h1>",
    });
  });

  // -------------------------------------------------------------------------
  // findMany query filters correctly: submissionId + PENDING + nextAttemptAt <= now
  // -------------------------------------------------------------------------
  it("queries findMany with the correct submissionId, PENDING status, and nextAttemptAt filter", async () => {
    const deps = makeDeps();
    deps.dbFindMany.mockResolvedValue([]);
    const fixedNow = new Date("2026-06-09T10:00:00Z");
    deps.now = () => fixedNow;

    await drainLeadOutbox(deps, SUBMISSION_ID);

    expect(deps.dbFindMany).toHaveBeenCalledTimes(1);
    const query = deps.dbFindMany.mock.calls[0][0];
    expect(query.where.submissionId).toBe(SUBMISSION_ID);
    expect(query.where.status).toBe("PENDING");
    // nextAttemptAt filter: lte now
    expect(query.where.nextAttemptAt).toEqual({ lte: fixedNow });
  });

  // -------------------------------------------------------------------------
  // Custom maxAttempts respected
  // -------------------------------------------------------------------------
  it("respects a custom maxAttempts of 3 — marks FAILED when attempts+1 = 3", async () => {
    const row = makeRow({ id: "row-custom", attempts: 2 });
    const deps = makeDeps({ maxAttempts: 3 });
    deps.dbFindMany.mockResolvedValue([row]);
    deps.sendEmail.mockRejectedValue(new Error("fail"));

    const result = await drainLeadOutbox(deps, SUBMISSION_ID);

    expect(result.failed).toBe(1);
    const call = deps.dbUpdate.mock.calls[0][0];
    expect(call.data.status).toBe("FAILED");
    expect(call.data.attempts).toBe(3);
  });

  // -------------------------------------------------------------------------
  // Exponential backoff: row with attempts:0 gets ~2min; attempts:2 gets ~4min backoff
  // -------------------------------------------------------------------------
  it("applies exponential backoff: nextAttemptAt grows with attempts", async () => {
    const rowA = makeRow({ id: "row-a", attempts: 0 });
    const rowB = makeRow({ id: "row-b", attempts: 2 });

    const depsA = makeDeps();
    const fixedNow = new Date("2026-01-01T12:00:00Z");
    depsA.now = () => fixedNow;
    depsA.dbFindMany.mockResolvedValue([rowA]);
    depsA.sendEmail.mockRejectedValue(new Error("fail"));

    const depsB = makeDeps();
    depsB.now = () => fixedNow;
    depsB.dbFindMany.mockResolvedValue([rowB]);
    depsB.sendEmail.mockRejectedValue(new Error("fail"));

    await drainLeadOutbox(depsA, "sub-a");
    await drainLeadOutbox(depsB, "sub-b");

    const callA = depsA.dbUpdate.mock.calls[0][0];
    const callB = depsB.dbUpdate.mock.calls[0][0];

    const delayA = callA.data.nextAttemptAt.getTime() - fixedNow.getTime();
    const delayB = callB.data.nextAttemptAt.getTime() - fixedNow.getTime();

    // Delay B (attempts=2) should be strictly greater than delay A (attempts=0)
    expect(delayB).toBeGreaterThan(delayA);
    // Both should be positive (future)
    expect(delayA).toBeGreaterThan(0);
    expect(delayB).toBeGreaterThan(0);
  });

  // -------------------------------------------------------------------------
  // Mixed: one success, one failure
  // -------------------------------------------------------------------------
  it("handles a mix of success and failure across multiple rows", async () => {
    const rowOk = makeRow({ id: "row-ok", recipientEmail: "ok@example.com" });
    const rowFail = makeRow({ id: "row-bad", recipientEmail: "bad@example.com" });

    const deps = makeDeps();
    deps.dbFindMany.mockResolvedValue([rowOk, rowFail]);
    deps.sendEmail
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(new Error("network error"));

    const result = await drainLeadOutbox(deps, SUBMISSION_ID);

    expect(result).toEqual({ sent: 1, failed: 1, skipped: 0 });

    // row-ok → SENT
    const okCall = deps.dbUpdate.mock.calls.find(
      (c: any) => c[0].where.id === "row-ok"
    );
    expect(okCall[0].data.status).toBe("SENT");

    // row-bad → still PENDING (attempts < maxAttempts)
    const failCall = deps.dbUpdate.mock.calls.find(
      (c: any) => c[0].where.id === "row-bad"
    );
    expect(failCall[0].data.status).toBe("PENDING");
    expect(failCall[0].data.attempts).toBe(1);
  });
});
