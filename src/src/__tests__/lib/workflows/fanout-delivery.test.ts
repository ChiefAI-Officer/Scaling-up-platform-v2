/**
 * PR-3 (audit Inngest dedup) — shared fan-out delivery helper.
 *
 * The core guarantee: dedup is anchored on the (reused) PARENT row. On a retry
 * of the same logical delivery batch, the parent already has SENT child rows for
 * the recipients sent before the failure, so they are SKIPPED (not re-emailed).
 */

jest.mock("@/lib/workflows/recipient-execution", () => ({
  recordRecipientExecution: jest.fn().mockResolvedValue(undefined),
  finalizeParentRollup: jest.fn().mockResolvedValue(undefined),
}));

import {
  sendFanoutRecipients,
  ensureExecutionParent,
  redactSmtpError,
} from "@/lib/workflows/fanout-delivery";
import {
  recordRecipientExecution,
  finalizeParentRollup,
} from "@/lib/workflows/recipient-execution";

describe("ensureExecutionParent", () => {
  it("upserts a parent keyed by deliveryBatchKey and returns its id (reused across retries)", async () => {
    const upsert = jest.fn().mockResolvedValue({ id: "parent-1" });
    const client = { workflowStepExecution: { upsert } };

    const id = await ensureExecutionParent(client as never, {
      deliveryBatchKey: "assign-1:step-1:2026-06-23T00:00:00.000Z",
      stepId: "step-1",
      workshopId: "ws-1",
    });

    expect(id).toBe("parent-1");
    const arg = upsert.mock.calls[0][0];
    // keyed by the unique deliveryBatchKey; update is a no-op so a retry reuses the row
    expect(arg.where).toEqual({ deliveryBatchKey: "assign-1:step-1:2026-06-23T00:00:00.000Z" });
    expect(arg.update).toEqual({});
    expect(arg.create).toMatchObject({
      deliveryBatchKey: "assign-1:step-1:2026-06-23T00:00:00.000Z",
      stepId: "step-1",
      workshopId: "ws-1",
      status: "SCHEDULED",
    });
  });

  it("recovers from a concurrent-create race (P2002) by re-reading the winning parent", async () => {
    // Two concurrent runs raced the create; this one lost the unique-index race.
    const upsert = jest.fn().mockRejectedValue(
      Object.assign(new Error("Unique constraint failed"), { code: "P2002" }),
    );
    const findUnique = jest.fn().mockResolvedValue({ id: "winner-parent" });
    const client = { workflowStepExecution: { upsert, findUnique } };

    const id = await ensureExecutionParent(client as never, {
      deliveryBatchKey: "manual:click-1:step-1",
      stepId: "step-1",
      workshopId: "ws-1",
    });

    // Returns the winner's id instead of failing the batch.
    expect(id).toBe("winner-parent");
    expect(findUnique).toHaveBeenCalledWith({
      where: { deliveryBatchKey: "manual:click-1:step-1" },
      select: { id: true },
    });
  });

  it("rethrows a non-P2002 error (does not swallow real failures)", async () => {
    const upsert = jest.fn().mockRejectedValue(
      Object.assign(new Error("connection reset"), { code: "P1001" }),
    );
    const findUnique = jest.fn();
    const client = { workflowStepExecution: { upsert, findUnique } };

    await expect(
      ensureExecutionParent(client as never, {
        deliveryBatchKey: "manual:click-1:step-1",
        stepId: "step-1",
        workshopId: "ws-1",
      }),
    ).rejects.toThrow("connection reset");
    expect(findUnique).not.toHaveBeenCalled();
  });
});

function clientWithSentChildren(
  sentChildren: Array<string | { registrationId: string; recipientEmail?: string | null }>
) {
  return {
    workflowStepExecution: {
      findMany: jest.fn().mockResolvedValue(
        sentChildren.map((child) =>
          typeof child === "string"
            ? { registrationId: child, recipientEmail: null }
            : child,
        ),
      ),
    },
  };
}

const recip = (id: string, email: string) => ({ registrationId: id, email });

describe("sendFanoutRecipients", () => {
  beforeEach(() => jest.clearAllMocks());

  it("sends to all recipients when the parent has no prior SENT children", async () => {
    const client = clientWithSentChildren([]);
    const sendOne = jest.fn().mockResolvedValue(undefined);

    const out = await sendFanoutRecipients(client as never, {
      parentId: "parent-1",
      stepId: "step-1",
      workshopId: "ws-1",
      recipients: [recip("r1", "a@x.com"), recip("r2", "b@x.com")],
      sendOne,
    });

    expect(sendOne).toHaveBeenCalledTimes(2);
    expect(recordRecipientExecution).toHaveBeenCalledTimes(2);
    expect(finalizeParentRollup).toHaveBeenCalledWith(client, "parent-1");
    expect(out).toEqual({ parentId: "parent-1", sent: 2, skipped: 0 });
  });

  it("SKIPS recipients already SENT under the parent (retry safety — no re-send)", async () => {
    const client = clientWithSentChildren(["r1"]); // r1 was sent on a prior run of this batch
    const sendOne = jest.fn().mockResolvedValue(undefined);

    const out = await sendFanoutRecipients(client as never, {
      parentId: "parent-1",
      stepId: "step-1",
      workshopId: "ws-1",
      recipients: [recip("r1", "a@x.com"), recip("r2", "b@x.com")],
      sendOne,
    });

    // r1 NOT re-sent; only r2 sent.
    expect(sendOne).toHaveBeenCalledTimes(1);
    expect(sendOne).toHaveBeenCalledWith(recip("r2", "b@x.com"));
    expect(out).toEqual({ parentId: "parent-1", sent: 1, skipped: 1 });
  });

  it("dedups duplicate emails within the same batch", async () => {
    const client = clientWithSentChildren([]);
    const sendOne = jest.fn().mockResolvedValue(undefined);

    const out = await sendFanoutRecipients(client as never, {
      parentId: "parent-1",
      stepId: "step-1",
      workshopId: "ws-1",
      recipients: [recip("r1", "dup@x.com"), recip("r2", "DUP@x.com")],
      sendOne,
    });

    expect(sendOne).toHaveBeenCalledTimes(1);
    expect(out.sent).toBe(1);
    expect(out.skipped).toBe(1);
  });

  it("SKIPS duplicate emails that were already SENT by another registration on a prior run", async () => {
    const client = clientWithSentChildren([
      { registrationId: "r1", recipientEmail: "dup@x.com" },
    ]);
    const sendOne = jest.fn().mockResolvedValue(undefined);

    const out = await sendFanoutRecipients(client as never, {
      parentId: "parent-1",
      stepId: "step-1",
      workshopId: "ws-1",
      recipients: [recip("r2", "DUP@x.com"), recip("r3", "other@x.com")],
      sendOne,
    });

    expect(sendOne).toHaveBeenCalledTimes(1);
    expect(sendOne).toHaveBeenCalledWith(recip("r3", "other@x.com"));
    expect(recordRecipientExecution).toHaveBeenCalledTimes(1);
    expect(out).toEqual({ parentId: "parent-1", sent: 1, skipped: 1 });
  });

  it("rethrows a transient send error so Inngest retries (parent reused → prior sends skipped next run)", async () => {
    const client = clientWithSentChildren([]);
    const sendOne = jest
      .fn()
      .mockResolvedValueOnce(undefined) // r1 ok
      .mockRejectedValueOnce(new Error("ETIMEDOUT")); // r2 transient

    await expect(
      sendFanoutRecipients(client as never, {
        parentId: "parent-1",
        stepId: "step-1",
        workshopId: "ws-1",
        recipients: [recip("r1", "a@x.com"), recip("r2", "b@x.com")],
        sendOne,
        isTerminalError: () => false,
      }),
    ).rejects.toThrow("ETIMEDOUT");

    // r1's SENT child was recorded before the throw → on retry it's skipped.
    expect(recordRecipientExecution).toHaveBeenCalledWith(
      client,
      expect.objectContaining({ registrationId: "r1", status: "SENT" }),
    );
  });

  it("on a terminal error records the recipient FAILED and stops the batch (no rethrow)", async () => {
    const client = clientWithSentChildren([]);
    const sendOne = jest.fn().mockRejectedValue(new Error("EAUTH 535 Invalid login"));

    const out = await sendFanoutRecipients(client as never, {
      parentId: "parent-1",
      stepId: "step-1",
      workshopId: "ws-1",
      recipients: [recip("r1", "a@x.com"), recip("r2", "b@x.com")],
      sendOne,
      isTerminalError: () => true,
    });

    // The stored errorMessage is a REDACTED stable code, not the raw SMTP text
    // (raw "EAUTH 535 Invalid login" would leak server detail into the admin UI).
    expect(recordRecipientExecution).toHaveBeenCalledWith(
      client,
      expect.objectContaining({
        registrationId: "r1",
        status: "FAILED",
        errorMessage: "smtp_auth_failed",
      }),
    );
    expect(sendOne).toHaveBeenCalledTimes(1); // stopped after the terminal failure
    expect(finalizeParentRollup).toHaveBeenCalled();
    expect(out.sent).toBe(0);
  });

  it("redacts a non-auth terminal error to smtp_send_failed (no raw text stored)", async () => {
    const client = clientWithSentChildren([]);
    const sendOne = jest
      .fn()
      .mockRejectedValue(new Error("550 5.1.1 mailbox host=mx.internal unavailable"));

    await sendFanoutRecipients(client as never, {
      parentId: "parent-1",
      stepId: "step-1",
      workshopId: "ws-1",
      recipients: [recip("r1", "a@x.com")],
      sendOne,
      isTerminalError: () => true,
    });

    expect(recordRecipientExecution).toHaveBeenCalledWith(
      client,
      expect.objectContaining({
        registrationId: "r1",
        status: "FAILED",
        errorMessage: "smtp_send_failed",
      }),
    );
  });
});

describe("redactSmtpError", () => {
  it("maps auth failures (EAUTH / 535 / Invalid login / Authentication) to smtp_auth_failed", () => {
    expect(redactSmtpError(new Error("EAUTH"))).toBe("smtp_auth_failed");
    expect(redactSmtpError(new Error("535 5.7.8 Authentication credentials invalid"))).toBe(
      "smtp_auth_failed",
    );
    expect(redactSmtpError(new Error("Invalid login: user@host"))).toBe("smtp_auth_failed");
    expect(redactSmtpError("Authentication failed")).toBe("smtp_auth_failed");
  });

  it("maps any other error to smtp_send_failed (never echoes raw text)", () => {
    expect(redactSmtpError(new Error("ETIMEDOUT 10.0.0.1:587"))).toBe("smtp_send_failed");
    expect(redactSmtpError(new Error("550 mailbox unavailable"))).toBe("smtp_send_failed");
    expect(redactSmtpError("connection reset")).toBe("smtp_send_failed");
    expect(redactSmtpError(undefined)).toBe("smtp_send_failed");
  });
});
