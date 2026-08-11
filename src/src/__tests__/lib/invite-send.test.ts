/**
 * Assessment v7.6 — sendInvitesBatch shared lib (Wave D, R1-M6).
 *
 * Verifies the extracted per-recipient invite-create + send logic that BOTH
 * the manual /invite route and the Wave-D Inngest fan-out call:
 *   - new recipient → create row + send + mark SENT
 *   - already-SENT recipient → no-op (idempotency ledger = invitation.status)
 *   - PENDING row → re-key fresh token + send
 *   - SMTP throw → row stays PENDING, status "send-failed"
 *   - batch > INVITE_BATCH_CAP → throws (caller must chunk)
 *   - structured result returned
 */

import {
  sendInvitesBatch,
  StableInvitationQuarantineError,
  INVITE_BATCH_CAP,
  type SendInvitesDeps,
} from "@/lib/assessments/invite-send";
import { createHash } from "crypto";

function makeDeps(overrides?: Partial<SendInvitesDeps>): {
  deps: SendInvitesDeps;
  create: jest.Mock;
  update: jest.Mock;
  findMany: jest.Mock;
  sendEmail: jest.Mock;
} {
  const create = jest.fn((args: { data: { respondentId: string; expiresAt: Date } }) =>
    Promise.resolve({ id: "inv-" + args.data.respondentId, expiresAt: args.data.expiresAt })
  );
  const update = jest.fn().mockResolvedValue({ id: "inv-x", expiresAt: new Date() });
  const findMany = jest.fn().mockResolvedValue([]);
  const sendEmail = jest.fn().mockResolvedValue(undefined);

  const deps: SendInvitesDeps = {
    db: {
      assessmentInvitation: {
        findMany,
        create,
        update,
      },
    },
    sendEmail,
    now: () => new Date("2026-06-16T12:00:00.000Z"),
    ...overrides,
  };
  return { deps, create, update, findMany, sendEmail };
}

const CAMPAIGN = {
  id: "c1",
  name: "Demo",
  alias: "demo",
  closeAt: null as Date | null,
  invitationSubject: null as string | null,
  invitationBodyMarkdown: null as string | null,
  template: {
    alias: "five-dysfunctions",
    invitationSubject: "Take the assessment",
    invitationBodyMarkdown: "Hi {{respondentFirstName}}",
  },
};

/** Org/coach/template names live at the input top-level, not on the campaign. */
const NAMES = {
  organizationName: "Acme Corp",
  coachName: "Pat Coach",
  templateName: "Five Dysfunctions",
};

function participant(id: string) {
  return {
    respondentId: id,
    respondent: {
      id,
      firstName: "F" + id,
      lastName: "L" + id,
      email: `${id}@example.com`,
    },
  };
}

function stagedOriginal(tokenId: string, invitationId: string = "inv-r1") {
  return {
    tokenId,
    invitationId,
    newTokenHash: "a".repeat(64),
    previousTokenHash: "b".repeat(64),
    previousExpiresAt: new Date("2026-06-30T00:00:00.000Z"),
  };
}

function expectSecretNotLogged(errorSpy: jest.SpyInstance, secret: string) {
  for (const value of errorSpy.mock.calls.flat()) {
    if (value instanceof Error) {
      expect(value.message).not.toContain(secret);
    } else if (typeof value === "string") {
      expect(value).not.toContain(secret);
    } else {
      expect(JSON.stringify(value)).not.toContain(secret);
    }
  }
}

describe("sendInvitesBatch", () => {
  it("exports a batch cap of 25", () => {
    expect(INVITE_BATCH_CAP).toBe(25);
  });

  it("creates + sends + marks SENT for a brand-new recipient", async () => {
    const { deps, create, update, sendEmail } = makeDeps();
    const result = await sendInvitesBatch(deps, {
      campaign: CAMPAIGN,
      recipients: [participant("r1")],
      baseUrl: "https://app.example.com",
    });

    expect(create).toHaveBeenCalledTimes(1);
    expect(sendEmail).toHaveBeenCalledTimes(1);
    // status flips to SENT after a successful send
    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "inv-r1" },
        data: expect.objectContaining({ status: "SENT" }),
      })
    );
    expect(result.sent).toEqual(["r1"]);
    expect(result.skipped).toEqual([]);
    expect(result.failed).toEqual([]);
    expect(result.results).toEqual([{ respondentId: "r1", status: "sent" }]);
  });

  it("forwards the universal banner and resolved coach byline to every email", async () => {
    const { deps, sendEmail } = makeDeps();
    const coachByline = {
      mode: "image_name" as const,
      coachName: "Dana Coach",
      coachImageUrl: "https://cdn.test/dana.png",
    };

    await sendInvitesBatch(deps, {
      campaign: CAMPAIGN,
      recipients: [participant("r1")],
      baseUrl: "https://app.example.com",
      chrome: "universalBanner",
      coachByline,
    });

    expect(sendEmail).toHaveBeenCalledWith(expect.objectContaining({
      chrome: "universalBanner",
      coachByline,
    }));
  });

  it("keeps the disabled parent-only invitation write failure path byte-identical", async () => {
    const writeError = new Error("legacy invitation write failure");
    const { deps, create, sendEmail } = makeDeps();
    create.mockRejectedValueOnce(writeError);
    const errorSpy = jest.spyOn(console, "error").mockImplementation(() => {});

    const result = await sendInvitesBatch(deps, {
      campaign: CAMPAIGN,
      recipients: [participant("r1")],
      baseUrl: "https://app.example.com",
      stableLinksEnabled: false,
    });

    expect(sendEmail).not.toHaveBeenCalled();
    expect(result.failed).toEqual(["r1"]);
    expect(errorSpy).toHaveBeenCalledWith(
      "[invite-send] failed to write invitation row",
      writeError,
    );
    errorSpy.mockRestore();
  });

  it("enabled: invitation write failures expose only an allowlisted disposition", async () => {
    const secret = "database-error-containing-token-or-hash";
    const stableTokens = {
      stageExistingOriginal: jest
        .fn()
        .mockResolvedValue(stagedOriginal("token-r1")),
      registerOriginal: jest.fn(),
      confirm: jest.fn(),
      uncertain: jest.fn(),
      removeRegistered: jest.fn(),
      rollbackRejected: jest.fn(),
      reconcileRejected: jest.fn(),
    };
    const { deps, create } = makeDeps({
      prepareEmail: jest.fn(),
      stableTokens,
    });
    create.mockRejectedValueOnce(new Error(secret));
    const errorSpy = jest.spyOn(console, "error").mockImplementation(() => {});

    const result = await sendInvitesBatch(deps, {
      campaign: CAMPAIGN,
      recipients: [participant("r1")],
      baseUrl: "https://app.example.com",
      stableLinksEnabled: true,
    });

    expect(result.failed).toEqual(["r1"]);
    expect(errorSpy).toHaveBeenCalledWith(
      "[invite-send] failed to write invitation row",
      {
        respondentId: "r1",
        disposition: "INVITATION_WRITE_FAILED",
      },
    );
    expectSecretNotLogged(errorSpy, secret);
    errorSpy.mockRestore();
  });

  it("enabled: stages a new original over a never-delivered rollback root before sending", async () => {
    const providerSend = jest.fn().mockResolvedValue(undefined);
    const prepareEmail = jest.fn().mockReturnValue({ send: providerSend });
    const stableTokens = {
      stageExistingOriginal: jest.fn().mockResolvedValue({
        tokenId: "token-r1",
        invitationId: "inv-r1",
        newTokenHash: "a".repeat(64),
        previousTokenHash: "b".repeat(64),
        previousExpiresAt: new Date("2026-06-30T00:00:00.000Z"),
      }),
      registerOriginal: jest.fn().mockResolvedValue({ tokenId: "token-r1" }),
      confirm: jest.fn().mockResolvedValue(undefined),
      uncertain: jest.fn(),
      removeRegistered: jest.fn(),
      rollbackRejected: jest.fn(),
      reconcileRejected: jest.fn(),
    };
    const { deps, create, sendEmail } = makeDeps({ prepareEmail, stableTokens });

    const result = await sendInvitesBatch(deps, {
      campaign: CAMPAIGN,
      recipients: [participant("r1")],
      baseUrl: "https://app.example.com",
      stableLinksEnabled: true,
    });

    const preparedPayload = prepareEmail.mock.calls[0][0];
    const expectedHash = createHash("sha256")
      .update(preparedPayload.rawToken)
      .digest("hex");
    expect(stableTokens.registerOriginal).not.toHaveBeenCalled();
    expect(stableTokens.stageExistingOriginal).toHaveBeenCalledWith({
      invitationId: "inv-r1",
      tokenHash: expectedHash,
      expiresAt: expect.any(Date),
    });
    const parentRootHash = create.mock.calls[0][0].data.tokenHash;
    expect(parentRootHash).toMatch(/^[a-f0-9]{64}$/);
    expect(parentRootHash).not.toBe(expectedHash);
    expect(stableTokens.confirm).toHaveBeenCalledWith({
      tokenId: "token-r1",
      invitationId: "inv-r1",
      confirmedAt: expect.any(Date),
    });
    expect(prepareEmail.mock.invocationCallOrder[0]).toBeLessThan(
      stableTokens.stageExistingOriginal.mock.invocationCallOrder[0],
    );
    expect(stableTokens.stageExistingOriginal.mock.invocationCallOrder[0]).toBeLessThan(
      providerSend.mock.invocationCallOrder[0],
    );
    expect(providerSend.mock.invocationCallOrder[0]).toBeLessThan(
      stableTokens.confirm.mock.invocationCallOrder[0],
    );
    expect(sendEmail).not.toHaveBeenCalled();
    expect(result.sent).toEqual(["r1"]);
  });

  it("enabled: prepares then stage-rotates a PENDING original before provider handoff", async () => {
    const providerSend = jest.fn().mockResolvedValue(undefined);
    const prepareEmail = jest.fn().mockReturnValue({ send: providerSend });
    const staged = {
      tokenId: "token-rotated",
      invitationId: "inv-r1",
      newTokenHash: "a".repeat(64),
      previousTokenHash: "b".repeat(64),
      previousExpiresAt: new Date("2026-06-30T00:00:00.000Z"),
    };
    const stableTokens = {
      stageExistingOriginal: jest.fn().mockResolvedValue(staged),
      registerOriginal: jest.fn(),
      confirm: jest.fn().mockResolvedValue(undefined),
      uncertain: jest.fn(),
      removeRegistered: jest.fn(),
      rollbackRejected: jest.fn(),
      reconcileRejected: jest.fn(),
    };
    const { deps, findMany, update } = makeDeps({ prepareEmail, stableTokens });
    findMany.mockResolvedValue([
      {
        id: "inv-r1",
        respondentId: "r1",
        status: "PENDING",
        revokedAt: null,
      },
    ]);

    const result = await sendInvitesBatch(deps, {
      campaign: CAMPAIGN,
      recipients: [participant("r1")],
      baseUrl: "https://app.example.com",
      stableLinksEnabled: true,
    });

    const preparedPayload = prepareEmail.mock.calls[0][0];
    const expectedHash = createHash("sha256")
      .update(preparedPayload.rawToken)
      .digest("hex");
    expect(stableTokens.stageExistingOriginal).toHaveBeenCalledWith({
      invitationId: "inv-r1",
      tokenHash: expectedHash,
      expiresAt: expect.any(Date),
    });
    expect(stableTokens.registerOriginal).not.toHaveBeenCalled();
    expect(prepareEmail.mock.invocationCallOrder[0]).toBeLessThan(
      stableTokens.stageExistingOriginal.mock.invocationCallOrder[0],
    );
    expect(stableTokens.stageExistingOriginal.mock.invocationCallOrder[0]).toBeLessThan(
      providerSend.mock.invocationCallOrder[0],
    );
    expect(stableTokens.confirm).toHaveBeenCalledWith({
      tokenId: staged.tokenId,
      invitationId: staged.invitationId,
      confirmedAt: expect.any(Date),
    });
    expect(update).toHaveBeenCalledTimes(1);
    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "inv-r1" },
        data: expect.objectContaining({ status: "SENT" }),
      }),
    );
    expect(result.sent).toEqual(["r1"]);
  });

  it("enabled: rejects a missing stable adapter before mutating invitation state", async () => {
    const { deps, create, update, sendEmail } = makeDeps();

    await expect(
      sendInvitesBatch(deps, {
        campaign: CAMPAIGN,
        recipients: [participant("r1")],
        baseUrl: "https://app.example.com",
        stableLinksEnabled: true,
      }),
    ).rejects.toThrow(/stable invitation dependencies/i);

    expect(create).not.toHaveBeenCalled();
    expect(update).not.toHaveBeenCalled();
    expect(sendEmail).not.toHaveBeenCalled();
  });

  it("enabled: a PENDING retry preparation failure is per-recipient and precedes staging", async () => {
    const secret = "raw-or-hash-secret";
    const prepareEmail = jest.fn(() => {
      throw new Error(secret);
    });
    const stableTokens = {
      stageExistingOriginal: jest.fn(),
      registerOriginal: jest.fn(),
      confirm: jest.fn(),
      uncertain: jest.fn(),
      removeRegistered: jest.fn(),
      rollbackRejected: jest.fn(),
      reconcileRejected: jest.fn(),
    };
    const { deps, findMany, update, sendEmail } = makeDeps({
      prepareEmail,
      stableTokens,
    });
    findMany.mockResolvedValue([
      {
        id: "inv-r1",
        respondentId: "r1",
        status: "PENDING",
        revokedAt: null,
      },
    ]);
    const errorSpy = jest.spyOn(console, "error").mockImplementation(() => {});

    const result = await sendInvitesBatch(deps, {
      campaign: CAMPAIGN,
      recipients: [participant("r1")],
      baseUrl: "https://app.example.com",
      stableLinksEnabled: true,
    });

    expect(stableTokens.stageExistingOriginal).not.toHaveBeenCalled();
    expect(update).not.toHaveBeenCalled();
    expect(sendEmail).not.toHaveBeenCalled();
    expect(result.failed).toEqual(["r1"]);
    expectSecretNotLogged(errorSpy, secret);
    errorSpy.mockRestore();
  });

  it("enabled: a PENDING retry staging failure never reaches the provider", async () => {
    const secret = "staging-secret";
    const providerSend = jest.fn();
    const stableTokens = {
      stageExistingOriginal: jest.fn().mockRejectedValue(new Error(secret)),
      registerOriginal: jest.fn(),
      confirm: jest.fn(),
      uncertain: jest.fn(),
      removeRegistered: jest.fn(),
      rollbackRejected: jest.fn(),
      reconcileRejected: jest.fn(),
    };
    const { deps, findMany, update } = makeDeps({
      prepareEmail: jest.fn().mockReturnValue({ send: providerSend }),
      stableTokens,
    });
    findMany.mockResolvedValue([
      {
        id: "inv-r1",
        respondentId: "r1",
        status: "PENDING",
        revokedAt: null,
      },
    ]);
    const errorSpy = jest.spyOn(console, "error").mockImplementation(() => {});

    const result = await sendInvitesBatch(deps, {
      campaign: CAMPAIGN,
      recipients: [participant("r1")],
      baseUrl: "https://app.example.com",
      stableLinksEnabled: true,
    });

    expect(providerSend).not.toHaveBeenCalled();
    expect(update).not.toHaveBeenCalled();
    expect(result.failed).toEqual(["r1"]);
    expectSecretNotLogged(errorSpy, secret);
    errorSpy.mockRestore();
  });

  it("enabled: ambiguous provider handoff marks a new original UNCERTAIN without cleanup", async () => {
    const secret = "raw-token-or-hash-from-provider";
    const providerSend = jest.fn().mockRejectedValue(new Error(secret));
    const stableTokens = {
      stageExistingOriginal: jest
        .fn()
        .mockResolvedValue(stagedOriginal("token-r1")),
      registerOriginal: jest.fn().mockResolvedValue({ tokenId: "token-r1" }),
      confirm: jest.fn(),
      uncertain: jest.fn().mockResolvedValue(undefined),
      removeRegistered: jest.fn(),
      rollbackRejected: jest.fn(),
      reconcileRejected: jest.fn(),
    };
    const { deps, update } = makeDeps({
      prepareEmail: jest.fn().mockReturnValue({ send: providerSend }),
      stableTokens,
    });
    const errorSpy = jest.spyOn(console, "error").mockImplementation(() => {});

    const result = await sendInvitesBatch(deps, {
      campaign: CAMPAIGN,
      recipients: [participant("r1")],
      baseUrl: "https://app.example.com",
      stableLinksEnabled: true,
    });

    expect(stableTokens.uncertain).toHaveBeenCalledWith("token-r1");
    expect(stableTokens.removeRegistered).not.toHaveBeenCalled();
    expect(stableTokens.rollbackRejected).not.toHaveBeenCalled();
    expect(stableTokens.confirm).not.toHaveBeenCalled();
    expect(update).not.toHaveBeenCalled();
    expect(result.failed).toEqual(["r1"]);
    expectSecretNotLogged(errorSpy, secret);
    errorSpy.mockRestore();
  });

  it("enabled: definite rejection retries quarantine before reconciling a new original", async () => {
    const providerSend = jest.fn().mockRejectedValue({ responseCode: 550 });
    const stableTokens = {
      stageExistingOriginal: jest
        .fn()
        .mockResolvedValue(stagedOriginal("token-r1")),
      registerOriginal: jest.fn().mockResolvedValue({ tokenId: "token-r1" }),
      confirm: jest.fn(),
      uncertain: jest.fn(),
      removeRegistered: jest.fn(),
      rollbackRejected: jest
        .fn()
        .mockRejectedValueOnce(new Error("transient quarantine failure"))
        .mockRejectedValueOnce(new Error("transient quarantine failure"))
        .mockResolvedValueOnce(undefined),
      reconcileRejected: jest.fn().mockResolvedValue(undefined),
    };
    const { deps, create, update } = makeDeps({
      prepareEmail: jest.fn().mockReturnValue({ send: providerSend }),
      stableTokens,
    });
    const errorSpy = jest.spyOn(console, "error").mockImplementation(() => {});

    const result = await sendInvitesBatch(deps, {
      campaign: CAMPAIGN,
      recipients: [participant("r1")],
      baseUrl: "https://app.example.com",
      stableLinksEnabled: true,
    });

    expect(stableTokens.rollbackRejected).toHaveBeenCalledTimes(3);
    expect(stableTokens.rollbackRejected).toHaveBeenCalledWith(
      stagedOriginal("token-r1"),
    );
    expect(stableTokens.reconcileRejected).toHaveBeenCalledWith(
      stagedOriginal("token-r1"),
    );
    expect(stableTokens.removeRegistered).not.toHaveBeenCalled();
    expect(stableTokens.uncertain).not.toHaveBeenCalled();
    expect(create).toHaveBeenCalledTimes(1);
    expect(update).not.toHaveBeenCalled();
    expect(result.failed).toEqual(["r1"]);
    errorSpy.mockRestore();
  });

  it("enabled: quarantine exhaustion persists the outbox before an identifier-only fast-path event", async () => {
    const persistRejectedCleanupAudit = jest
      .fn()
      .mockResolvedValue(undefined);
    const enqueueRejectedQuarantineRetry = jest
      .fn()
      .mockRejectedValue(new Error("event submission unavailable"));
    const stableTokens = {
      stageExistingOriginal: jest
        .fn()
        .mockResolvedValue(stagedOriginal("token-r1")),
      registerOriginal: jest.fn(),
      confirm: jest.fn(),
      uncertain: jest.fn(),
      removeRegistered: jest.fn(),
      rollbackRejected: jest
        .fn()
        .mockRejectedValue(new Error("database unavailable")),
      reconcileRejected: jest.fn(),
    };
    const { deps } = makeDeps({
      prepareEmail: jest.fn().mockReturnValue({
        send: jest.fn().mockRejectedValue({ responseCode: 550 }),
      }),
      stableTokens,
      persistRejectedCleanupAudit,
      enqueueRejectedQuarantineRetry,
    });
    const errorSpy = jest.spyOn(console, "error").mockImplementation(() => {});

    await expect(
      sendInvitesBatch(deps, {
        campaign: CAMPAIGN,
        recipients: [participant("r1")],
        baseUrl: "https://app.example.com",
        stableLinksEnabled: true,
      }),
    ).rejects.toBeInstanceOf(StableInvitationQuarantineError);

    expect(stableTokens.rollbackRejected).toHaveBeenCalledTimes(3);
    expect(enqueueRejectedQuarantineRetry).toHaveBeenCalledWith({
      invitationId: "inv-r1",
      tokenId: "token-r1",
    });
    expect(persistRejectedCleanupAudit).toHaveBeenCalledWith({
      invitationId: "inv-r1",
      tokenId: "token-r1",
    });
    expect(persistRejectedCleanupAudit.mock.invocationCallOrder[0]).toBeLessThan(
      enqueueRejectedQuarantineRetry.mock.invocationCallOrder[0],
    );
    expect(stableTokens.reconcileRejected).not.toHaveBeenCalled();
    const dispatched = JSON.stringify(
      enqueueRejectedQuarantineRetry.mock.calls,
    );
    expect(dispatched).not.toContain("rawToken");
    expect(dispatched).not.toContain("tokenHash");
    errorSpy.mockRestore();
  });

  it("enabled: reconciliation exhaustion persists a strict token-id audit with bounded retries", async () => {
    const persistRejectedCleanupAudit = jest
      .fn()
      .mockRejectedValueOnce(new Error("audit unavailable"))
      .mockRejectedValueOnce(new Error("audit unavailable"))
      .mockResolvedValueOnce(undefined);
    const stableTokens = {
      stageExistingOriginal: jest
        .fn()
        .mockResolvedValue(stagedOriginal("token-r1")),
      registerOriginal: jest.fn().mockResolvedValue({ tokenId: "token-r1" }),
      confirm: jest.fn(),
      uncertain: jest.fn(),
      removeRegistered: jest.fn(),
      rollbackRejected: jest.fn().mockResolvedValue(undefined),
      reconcileRejected: jest
        .fn()
        .mockRejectedValue(new Error("reconciliation unavailable")),
    };
    const { deps } = makeDeps({
      prepareEmail: jest.fn().mockReturnValue({
        send: jest.fn().mockRejectedValue({ responseCode: 550 }),
      }),
      stableTokens,
      persistRejectedCleanupAudit,
      enqueueRejectedQuarantineRetry: jest.fn().mockResolvedValue(undefined),
    });
    const errorSpy = jest.spyOn(console, "error").mockImplementation(() => {});

    const result = await sendInvitesBatch(deps, {
      campaign: CAMPAIGN,
      recipients: [participant("r1")],
      baseUrl: "https://app.example.com",
      stableLinksEnabled: true,
    });

    expect(stableTokens.reconcileRejected).toHaveBeenCalledTimes(3);
    expect(persistRejectedCleanupAudit).toHaveBeenCalledTimes(3);
    expect(persistRejectedCleanupAudit).toHaveBeenCalledWith({
      invitationId: "inv-r1",
      tokenId: "token-r1",
    });
    expect(result.failed).toEqual(["r1"]);
    errorSpy.mockRestore();
  });

  it("enabled: definite rejection rolls a PENDING retry back through its exact staged chain", async () => {
    const staged = {
      tokenId: "token-rotated",
      invitationId: "inv-r1",
      newTokenHash: "a".repeat(64),
      previousTokenHash: "b".repeat(64),
      previousExpiresAt: new Date("2026-06-30T00:00:00.000Z"),
    };
    const stableTokens = {
      stageExistingOriginal: jest.fn().mockResolvedValue(staged),
      registerOriginal: jest.fn(),
      confirm: jest.fn(),
      uncertain: jest.fn(),
      removeRegistered: jest.fn(),
      rollbackRejected: jest.fn().mockResolvedValue(undefined),
      reconcileRejected: jest.fn().mockResolvedValue(undefined),
    };
    const { deps, findMany, update } = makeDeps({
      prepareEmail: jest.fn().mockReturnValue({
        send: jest.fn().mockRejectedValue({ responseCode: 500 }),
      }),
      stableTokens,
    });
    findMany.mockResolvedValue([
      {
        id: "inv-r1",
        respondentId: "r1",
        status: "PENDING",
        revokedAt: null,
      },
    ]);
    const errorSpy = jest.spyOn(console, "error").mockImplementation(() => {});

    const result = await sendInvitesBatch(deps, {
      campaign: CAMPAIGN,
      recipients: [participant("r1")],
      baseUrl: "https://app.example.com",
      stableLinksEnabled: true,
    });

    expect(stableTokens.rollbackRejected).toHaveBeenCalledWith(staged);
    expect(stableTokens.reconcileRejected).toHaveBeenCalledWith(staged);
    expect(stableTokens.removeRegistered).not.toHaveBeenCalled();
    expect(stableTokens.uncertain).not.toHaveBeenCalled();
    expect(update).not.toHaveBeenCalled();
    expect(result.failed).toEqual(["r1"]);
    errorSpy.mockRestore();
  });

  it("enabled: provider acceptance still counts as sent when child confirmation persistence fails", async () => {
    const secret = "confirmation-error-with-secret";
    const stableTokens = {
      stageExistingOriginal: jest
        .fn()
        .mockResolvedValue(stagedOriginal("token-r1")),
      registerOriginal: jest.fn().mockResolvedValue({ tokenId: "token-r1" }),
      confirm: jest.fn().mockRejectedValue(new Error(secret)),
      uncertain: jest.fn(),
      removeRegistered: jest.fn(),
      rollbackRejected: jest.fn(),
      reconcileRejected: jest.fn(),
    };
    const { deps, update } = makeDeps({
      prepareEmail: jest.fn().mockReturnValue({
        send: jest.fn().mockResolvedValue(undefined),
      }),
      stableTokens,
    });
    const errorSpy = jest.spyOn(console, "error").mockImplementation(() => {});

    const result = await sendInvitesBatch(deps, {
      campaign: CAMPAIGN,
      recipients: [participant("r1")],
      baseUrl: "https://app.example.com",
      stableLinksEnabled: true,
    });

    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "inv-r1" },
        data: expect.objectContaining({ status: "SENT" }),
      }),
    );
    expect(result.sent).toEqual(["r1"]);
    expect(result.failed).toEqual([]);
    expectSecretNotLogged(errorSpy, secret);
    errorSpy.mockRestore();
  });

  it("enabled: provider acceptance preserves legacy retry signaling when the parent status write fails", async () => {
    const secret = "parent-write-error-with-secret";
    const stableTokens = {
      stageExistingOriginal: jest
        .fn()
        .mockResolvedValueOnce(stagedOriginal("token-r1"))
        .mockResolvedValueOnce(stagedOriginal("token-r2", "inv-r2")),
      registerOriginal: jest
        .fn()
        .mockResolvedValueOnce({ tokenId: "token-r1" })
        .mockResolvedValueOnce({ tokenId: "token-r2" }),
      confirm: jest.fn().mockResolvedValue(undefined),
      uncertain: jest.fn(),
      removeRegistered: jest.fn(),
      rollbackRejected: jest.fn(),
      reconcileRejected: jest.fn(),
    };
    const { deps, update } = makeDeps({
      prepareEmail: jest.fn().mockReturnValue({
        send: jest.fn().mockResolvedValue(undefined),
      }),
      stableTokens,
    });
    update
      .mockRejectedValueOnce(new Error(secret))
      .mockResolvedValueOnce({ id: "inv-r2", expiresAt: new Date() });
    const errorSpy = jest.spyOn(console, "error").mockImplementation(() => {});

    const result = await sendInvitesBatch(deps, {
      campaign: CAMPAIGN,
      recipients: [participant("r1"), participant("r2")],
      baseUrl: "https://app.example.com",
      stableLinksEnabled: true,
    });

    expect(result.failed).toEqual(["r1"]);
    expect(result.sent).toEqual(["r2"]);
    expect(result.results).toEqual([
      { respondentId: "r1", status: "send-failed" },
      { respondentId: "r2", status: "sent" },
    ]);
    expect(stableTokens.confirm).toHaveBeenCalledTimes(2);
    expectSecretNotLogged(errorSpy, secret);
    errorSpy.mockRestore();
  });

  it("skips an already-SENT recipient (no duplicate send)", async () => {
    const { deps, create, update, findMany, sendEmail } = makeDeps();
    findMany.mockResolvedValue([
      {
        id: "inv-r1",
        campaignId: "c1",
        respondentId: "r1",
        status: "SENT",
        revokedAt: null,
      },
    ]);

    const result = await sendInvitesBatch(deps, {
      campaign: CAMPAIGN,
      recipients: [participant("r1")],
      baseUrl: "https://app.example.com",
    });

    expect(sendEmail).not.toHaveBeenCalled();
    expect(create).not.toHaveBeenCalled();
    expect(update).not.toHaveBeenCalled();
    expect(result.sent).toEqual([]);
    expect(result.skipped).toEqual(["r1"]);
    expect(result.results[0].status).toBe("already-invited");
  });

  it("treats a revoked invitation as already-invited (no re-send)", async () => {
    const { deps, sendEmail } = makeDeps();
    (deps.db.assessmentInvitation.findMany as jest.Mock).mockResolvedValue([
      {
        id: "inv-r1",
        campaignId: "c1",
        respondentId: "r1",
        status: "PENDING",
        revokedAt: new Date(),
      },
    ]);

    const result = await sendInvitesBatch(deps, {
      campaign: CAMPAIGN,
      recipients: [participant("r1")],
      baseUrl: "https://app.example.com",
    });

    expect(sendEmail).not.toHaveBeenCalled();
    expect(result.results[0].status).toBe("already-invited");
  });

  it("re-keys a PENDING row with a fresh token then sends", async () => {
    const { deps, create, update, findMany, sendEmail } = makeDeps();
    findMany.mockResolvedValue([
      {
        id: "inv-r1",
        campaignId: "c1",
        respondentId: "r1",
        status: "PENDING",
        revokedAt: null,
      },
    ]);
    update.mockResolvedValue({ id: "inv-r1", expiresAt: new Date() });

    const result = await sendInvitesBatch(deps, {
      campaign: CAMPAIGN,
      recipients: [participant("r1")],
      baseUrl: "https://app.example.com",
    });

    // No create — re-key via update with a fresh tokenHash + PENDING.
    expect(create).not.toHaveBeenCalled();
    const firstUpdate = update.mock.calls[0][0];
    expect(firstUpdate.where).toEqual({ id: "inv-r1" });
    expect(firstUpdate.data).toEqual(
      expect.objectContaining({ status: "PENDING", tokenHash: expect.any(String) })
    );
    // Then flipped to SENT after the send.
    expect(sendEmail).toHaveBeenCalledTimes(1);
    expect(result.sent).toEqual(["r1"]);
  });

  it("leaves the row PENDING + reports send-failed when SMTP throws", async () => {
    const { deps, update, sendEmail } = makeDeps();
    sendEmail.mockRejectedValueOnce(new Error("smtp down"));

    const result = await sendInvitesBatch(deps, {
      campaign: CAMPAIGN,
      recipients: [participant("r1")],
      baseUrl: "https://app.example.com",
    });

    // The follow-up update to SENT must NOT run for a failed send.
    expect(update).not.toHaveBeenCalled();
    expect(result.failed).toEqual(["r1"]);
    expect(result.results[0].status).toBe("send-failed");
  });

  it("keeps the disabled parent-only provider failure path byte-identical", async () => {
    const providerError = new Error("legacy provider failure");
    const { deps, sendEmail } = makeDeps();
    sendEmail.mockRejectedValueOnce(providerError);
    const errorSpy = jest.spyOn(console, "error").mockImplementation(() => {});

    const result = await sendInvitesBatch(deps, {
      campaign: CAMPAIGN,
      recipients: [participant("r1")],
      baseUrl: "https://app.example.com",
      stableLinksEnabled: false,
    });

    expect(result.failed).toEqual(["r1"]);
    expect(errorSpy).toHaveBeenCalledWith(
      "[invite-send] SMTP send failed",
      { respondentId: "r1", invitationId: "inv-r1" },
      providerError,
    );
    errorSpy.mockRestore();
  });

  it("throws when the batch exceeds INVITE_BATCH_CAP (caller must chunk)", async () => {
    const { deps } = makeDeps();
    const big = Array.from({ length: INVITE_BATCH_CAP + 1 }, (_, i) => participant("r" + i));
    await expect(
      sendInvitesBatch(deps, {
        campaign: CAMPAIGN,
        recipients: big,
        baseUrl: "https://app.example.com",
      })
    ).rejects.toThrow(/batch/i);
  });

  it("forwards organizationName, coachName, templateName, and rawToken to the email", async () => {
    const { deps, sendEmail } = makeDeps();
    await sendInvitesBatch(deps, {
      campaign: CAMPAIGN,
      recipients: [participant("r1")],
      baseUrl: "https://app.example.com",
      ...NAMES,
    });
    expect(sendEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        organizationName: "Acme Corp",
        coachName: "Pat Coach",
        templateName: "Five Dysfunctions",
        rawToken: expect.any(String),
        baseUrl: "https://app.example.com",
      })
    );
  });

  it("returns a structured per-recipient result for a mixed batch", async () => {
    const { deps, findMany, sendEmail } = makeDeps();
    findMany.mockResolvedValue([
      { id: "inv-r2", campaignId: "c1", respondentId: "r2", status: "SENT", revokedAt: null },
    ]);
    sendEmail.mockImplementation((o: { respondent: { email: string } }) =>
      o.respondent.email === "r3@example.com"
        ? Promise.reject(new Error("smtp"))
        : Promise.resolve(undefined)
    );

    const result = await sendInvitesBatch(deps, {
      campaign: CAMPAIGN,
      recipients: [participant("r1"), participant("r2"), participant("r3")],
      baseUrl: "https://app.example.com",
    });

    expect(result.sent).toEqual(["r1"]);
    expect(result.skipped).toEqual(["r2"]);
    expect(result.failed).toEqual(["r3"]);
    expect(result.results).toHaveLength(3);
  });
});

// ── Invitation chrome + unified coach-byline threading ─────────────────────
describe("sendInvitesBatch — invitation chrome + coachByline passthrough", () => {
  it("threads the caller's chrome and byline through to the mailer", async () => {
    const { deps, sendEmail } = makeDeps();
    await sendInvitesBatch(deps, {
      campaign: CAMPAIGN,
      recipients: [participant("r1")],
      baseUrl: "https://app.example.com",
      ...NAMES,
      chrome: "waveP",
      coachByline: {
        mode: "image_name",
        coachName: "Pat Coach",
        coachImageUrl: "https://blob.example.com/coach.png",
      },
    });
    expect(sendEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        chrome: "waveP",
        coachByline: {
          mode: "image_name",
          coachName: "Pat Coach",
          coachImageUrl: "https://blob.example.com/coach.png",
        },
      })
    );
  });

  it("defaults to legacy chrome + Scaling Up-only byline when the caller passes neither", async () => {
    const { deps, sendEmail } = makeDeps();
    await sendInvitesBatch(deps, {
      campaign: CAMPAIGN,
      recipients: [participant("r1")],
      baseUrl: "https://app.example.com",
    });
    expect(sendEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        chrome: "legacy",
        coachByline: { mode: "scaling_up_only" },
      })
    );
  });
});
