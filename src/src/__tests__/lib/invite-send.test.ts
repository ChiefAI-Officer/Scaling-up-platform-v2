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
  INVITE_BATCH_CAP,
  type SendInvitesDeps,
} from "@/lib/assessments/invite-send";

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
