/**
 * Atomic-lease regression tests for the shared assessment email outbox.
 *
 * These tests exercise the pre-agreed worker seam without a real database or
 * SMTP server. The claim function models the database CAS/skip-locked boundary;
 * only a claimed row is ever handed to sendEmail.
 */

import {
  drainLeadOutbox,
  type ClaimedOutboxRow,
  type DrainDeps,
} from "@/inngest/functions/quick-assessment-lead-email";

function makeRow(
  overrides: Partial<ClaimedOutboxRow> = {},
): ClaimedOutboxRow {
  return {
    id: overrides.id ?? "row-1",
    submissionId: overrides.submissionId ?? "sub-1",
    recipientEmail: overrides.recipientEmail ?? "coach@example.com",
    recipientRole: overrides.recipientRole ?? "REFERRING_COACH",
    emailType: overrides.emailType ?? "QUICK_ASSESSMENT_LEAD",
    subject: overrides.subject ?? "Assessment complete",
    bodyHtml: overrides.bodyHtml ?? "<p>Results</p>",
    status: "SENDING",
    attempts: overrides.attempts ?? 1,
    leaseToken: overrides.leaseToken ?? "lease-1",
    leaseExpiresAt:
      overrides.leaseExpiresAt ?? new Date("2026-07-30T03:02:00.000Z"),
  };
}

function makeDeps(rows: ClaimedOutboxRow[] = []): DrainDeps & {
  claimNext: jest.Mock;
  updateMany: jest.Mock;
  sendEmail: jest.Mock;
  recordDeadLetter: jest.Mock;
} {
  const queue = [...rows];
  const claimNext = jest.fn(async () => queue.shift() ?? null);
  const updateMany = jest.fn().mockResolvedValue({ count: 1 });
  const sendEmail = jest.fn().mockResolvedValue(undefined);
  const recordDeadLetter = jest.fn().mockResolvedValue(undefined);

  return {
    db: {
      assessmentEmailOutbox: { updateMany },
      auditLog: { create: jest.fn().mockResolvedValue({}) },
      $queryRaw: jest.fn(),
    },
    claimNext,
    updateMany,
    sendEmail,
    recordDeadLetter,
    now: () => new Date("2026-07-30T03:00:00.000Z"),
    makeLeaseToken: (() => {
      let i = 0;
      return () => `lease-${++i}`;
    })(),
  };
}

describe("drainLeadOutbox atomic leases", () => {
  it("sends a claimed row once and token-guards terminal completion", async () => {
    const row = makeRow();
    const deps = makeDeps([row]);

    await expect(drainLeadOutbox(deps, "sub-1")).resolves.toEqual({
      sent: 1,
      failed: 0,
      skipped: 0,
    });

    expect(deps.sendEmail).toHaveBeenCalledTimes(1);
    expect(deps.sendEmail).toHaveBeenCalledWith({
      to: row.recipientEmail,
      subject: row.subject,
      html: row.bodyHtml,
    });
    expect(deps.updateMany).toHaveBeenCalledWith({
      where: {
        id: row.id,
        status: "SENDING",
        leaseToken: row.leaseToken,
      },
      data: expect.objectContaining({
        status: "SENT",
        bodyHtml: "",
        leaseToken: null,
        leaseExpiresAt: null,
      }),
    });
  });

  it("allows only one sender when event and cron drains race", async () => {
    const row = makeRow();
    let available = true;
    const claimNext = jest.fn(async () => {
      if (!available) return null;
      available = false;
      return row;
    });
    const deps = makeDeps();
    deps.claimNext = claimNext;

    const [eventResult, cronResult] = await Promise.all([
      drainLeadOutbox(deps, "sub-1"),
      drainLeadOutbox(deps, null),
    ]);

    expect(deps.sendEmail).toHaveBeenCalledTimes(1);
    expect(eventResult.sent + cronResult.sent).toBe(1);
  });

  it("passes submission scope to event claims and null to the global cron", async () => {
    const eventDeps = makeDeps();
    await drainLeadOutbox(eventDeps, "sub-1");
    expect(eventDeps.claimNext).toHaveBeenCalledWith(
      expect.objectContaining({ submissionId: "sub-1" }),
    );

    const cronDeps = makeDeps();
    await drainLeadOutbox(cronDeps, null);
    expect(cronDeps.claimNext).toHaveBeenCalledWith(
      expect.objectContaining({ submissionId: null }),
    );
  });

  it("claims just in time with a lease longer than the transport maximum", async () => {
    const deps = makeDeps();
    deps.leaseMs = 120_000;

    await drainLeadOutbox(deps, null);

    const claim = deps.claimNext.mock.calls[0][0];
    expect(claim.leaseExpiresAt.getTime() - claim.now.getTime()).toBe(120_000);
  });

  it("requeues a transient failure using the attempt consumed at claim time", async () => {
    const row = makeRow({ attempts: 2, leaseToken: "lease-fail" });
    const deps = makeDeps([row]);
    deps.sendEmail.mockRejectedValue(new Error("SMTP unavailable"));

    await expect(drainLeadOutbox(deps, "sub-1")).resolves.toEqual({
      sent: 0,
      failed: 1,
      skipped: 0,
    });

    expect(deps.updateMany).toHaveBeenCalledWith({
      where: {
        id: row.id,
        status: "SENDING",
        leaseToken: row.leaseToken,
      },
      data: expect.objectContaining({
        status: "PENDING",
        lastError: "SMTP unavailable",
        leaseToken: null,
        leaseExpiresAt: null,
        nextAttemptAt: new Date("2026-07-30T03:04:00.000Z"),
      }),
    });
    expect(deps.updateMany.mock.calls[0][0].data).not.toHaveProperty("attempts");
  });

  it("records a durable dead letter before purging terminal PII", async () => {
    const row = makeRow({ attempts: 5, bodyHtml: "<p>PII</p>" });
    const deps = makeDeps([row]);
    deps.sendEmail.mockRejectedValue(new Error("permanent"));

    await drainLeadOutbox(deps, "sub-1");

    expect(deps.recordDeadLetter).toHaveBeenCalledWith(
      expect.objectContaining({
        submissionId: row.submissionId,
        outboxId: row.id,
        recipientRole: row.recipientRole,
        attempts: 5,
        errorClass: "Error",
      }),
    );
    expect(deps.recordDeadLetter.mock.invocationCallOrder[0]).toBeLessThan(
      deps.updateMany.mock.invocationCallOrder[0],
    );
    expect(deps.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: "FAILED",
          bodyHtml: "",
        }),
      }),
    );
  });

  it("does not purge or terminally update when dead-letter audit fails", async () => {
    const row = makeRow({ attempts: 5, bodyHtml: "<p>PII</p>" });
    const deps = makeDeps([row]);
    deps.sendEmail.mockRejectedValue(new Error("permanent"));
    deps.recordDeadLetter.mockRejectedValue(new Error("audit unavailable"));

    await expect(drainLeadOutbox(deps, "sub-1")).rejects.toThrow(
      "audit unavailable",
    );
    expect(deps.updateMany).not.toHaveBeenCalled();
  });

  it("treats a lost lease-token completion as skipped", async () => {
    const deps = makeDeps([makeRow()]);
    deps.updateMany.mockResolvedValue({ count: 0 });

    await expect(drainLeadOutbox(deps, "sub-1")).resolves.toEqual({
      sent: 0,
      failed: 0,
      skipped: 1,
    });
  });

  it("stops before claiming when invocation budget is exhausted", async () => {
    const times = [
      new Date("2026-07-30T03:00:00.000Z"),
      new Date("2026-07-30T03:00:45.000Z"),
    ];
    const deps = makeDeps([makeRow()]);
    deps.now = () => times.shift() ?? times[0];
    deps.invocationBudgetMs = 40_000;

    await expect(drainLeadOutbox(deps, null)).resolves.toEqual({
      sent: 0,
      failed: 0,
      skipped: 0,
    });
    expect(deps.claimNext).not.toHaveBeenCalled();
  });

  it("bounds the number of claims per invocation", async () => {
    const deps = makeDeps([
      makeRow({ id: "row-1", leaseToken: "lease-1" }),
      makeRow({ id: "row-2", leaseToken: "lease-2" }),
    ]);
    deps.maxRows = 1;

    await drainLeadOutbox(deps, null);

    expect(deps.sendEmail).toHaveBeenCalledTimes(1);
    expect(deps.claimNext).toHaveBeenCalledTimes(1);
  });
});
