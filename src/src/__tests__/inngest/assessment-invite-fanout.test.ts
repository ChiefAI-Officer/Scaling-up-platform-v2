/**
 * Tests for runInviteFanout — the pure, injected-dep fan-out function that
 * powers the assessmentInviteFanout Inngest function (Wave D auto-send engine).
 *
 * All tests mock the step runner + Prisma + the mailer; no real DB / SMTP /
 * Inngest. The step runner is mocked as `(name, fn) => fn()` so each durable
 * step executes inline.
 *
 * Coverage:
 *   - Happy path: CAS claim (count=1) → sends all recipients in ≤25 chunks →
 *     marks invitesSentAt → flips ON_OPEN DRAFT→ACTIVE.
 *   - Re-entrancy/replay: CAS count=0 → early return, no send.
 *   - Deleted mid-flight at pre-flight: abort, no send, no invitesSentAt, NO release.
 *   - Paused: abort + RELEASE claim (inviteSendStartedAt back to null), no invitesSentAt.
 *   - Auto-send flag OFF: abort + RELEASE claim, no send.
 *   - >25 recipients → multiple batch steps, each ≤25.
 *   - Deleted mid-run (between batches): remaining batches aborted, already-sent kept.
 *   - Event payload is {campaignId} only.
 */

/* eslint-disable @typescript-eslint/no-explicit-any */

import {
  runInviteFanout,
  ASSESSMENT_SEND_INVITES_EVENT,
  type InviteFanoutDeps,
} from "@/inngest/functions/assessment-invite-fanout";

// ---------------------------------------------------------------------------
// Builders
// ---------------------------------------------------------------------------

const CAMPAIGN_ID = "camp-123";
const FIXED_NOW = new Date("2026-06-16T12:00:00Z");

function makeCampaign(
  overrides: Partial<{
    id: string;
    name: string;
    alias: string;
    closeAt: Date | null;
    status: string;
    inviteTiming: string;
    deletedAt: Date | null;
    invitationSubject: string | null;
    invitationBodyMarkdown: string | null;
    participants: ReturnType<typeof makeParticipants>;
  }> = {},
) {
  return {
    id: overrides.id ?? CAMPAIGN_ID,
    name: overrides.name ?? "Q3 Team Assessment",
    alias: overrides.alias ?? "q3-team",
    closeAt: overrides.closeAt ?? null,
    status: overrides.status ?? "ACTIVE",
    inviteTiming: overrides.inviteTiming ?? "IMMEDIATELY",
    deletedAt: overrides.deletedAt ?? null,
    invitationSubject:
      overrides.invitationSubject !== undefined
        ? overrides.invitationSubject
        : null,
    invitationBodyMarkdown:
      overrides.invitationBodyMarkdown !== undefined
        ? overrides.invitationBodyMarkdown
        : null,
    template: {
      name: "Five Dysfunctions",
      invitationSubject: "You're invited",
      invitationBodyMarkdown: "Hello {{first_name}}",
    },
    organization: {
      name: "Acme Corp",
      owner: { firstName: "Olivia", lastName: "Owner" },
    },
    creatorCoach: { firstName: "Carla", lastName: "Coach" },
    participants: overrides.participants ?? makeParticipants(2),
  };
}

function makeParticipants(n: number) {
  return Array.from({ length: n }, (_, i) => ({
    respondentId: `resp-${i}`,
    respondent: {
      id: `resp-${i}`,
      firstName: `First${i}`,
      lastName: `Last${i}`,
      email: `person${i}@example.com`,
      deletedAt: null,
    },
  }));
}

function makeDeps(
  overrides: Partial<InviteFanoutDeps> = {},
): InviteFanoutDeps & {
  updateMany: jest.Mock;
  findUnique: jest.Mock;
  sendInvitesBatch: jest.Mock;
  sendEmail: jest.Mock;
  isPaused: jest.Mock;
  isAutoSendEnabled: jest.Mock;
  runStep: jest.Mock;
} {
  const updateMany = jest.fn().mockResolvedValue({ count: 1 });
  const findUnique = jest.fn().mockResolvedValue(makeCampaign());
  const update = jest.fn().mockResolvedValue({});
  const sendInvitesBatch = jest
    .fn()
    .mockResolvedValue({ sent: [], skipped: [], failed: [], results: [] });
  const sendEmail = jest.fn().mockResolvedValue(undefined);
  const isPaused = jest.fn().mockReturnValue(false);
  const isAutoSendEnabled = jest.fn().mockReturnValue(true);
  // Mirror REAL Inngest: every step.run return is JSON-serialized + parsed back,
  // so a Date returned from a step comes back as an ISO string (exactly as in
  // prod). The fan-out MUST rehydrate any Date it reads back across this
  // boundary, or it will hand a string where a Date is expected.
  const runStep = jest.fn(
    async (_name: string, fn: () => unknown) =>
      JSON.parse(JSON.stringify(await fn())),
  );

  const deps = {
    db: {
      assessmentCampaign: {
        updateMany,
        findUnique,
        update,
      },
    },
    sendEmail,
    sendInvitesBatch,
    isPaused,
    isAutoSendEnabled,
    now: () => FIXED_NOW,
    runStep,
    baseUrl: "https://app.example.com",
    ...overrides,
  } as any;

  return Object.assign(deps, {
    updateMany,
    findUnique,
    update,
    sendInvitesBatch,
    sendEmail,
    isPaused,
    isAutoSendEnabled,
    runStep,
  });
}

/** Find the updateMany call that sets invitesSentAt (the mark-sent step). */
function findMarkSent(updateMany: jest.Mock) {
  const call = updateMany.mock.calls.find(
    (c: any) => c[0]?.data && c[0].data.invitesSentAt !== undefined,
  );
  return call ? call[0] : undefined;
}

// ---------------------------------------------------------------------------
// Event shape
// ---------------------------------------------------------------------------

describe("ASSESSMENT_SEND_INVITES_EVENT", () => {
  it("is the documented event name", () => {
    expect(ASSESSMENT_SEND_INVITES_EVENT).toBe(
      "assessment/campaign.send-invites",
    );
  });
});

// ---------------------------------------------------------------------------
// runInviteFanout
// ---------------------------------------------------------------------------

describe("runInviteFanout", () => {
  beforeEach(() => jest.clearAllMocks());

  // -------------------------------------------------------------------------
  // Happy path
  // -------------------------------------------------------------------------
  it("claims (CAS count=1), sends all recipients, marks invitesSentAt", async () => {
    const deps = makeDeps();
    deps.findUnique.mockResolvedValue(makeCampaign({ participants: makeParticipants(2) } as any));
    deps.sendInvitesBatch.mockResolvedValue({
      sent: ["resp-0", "resp-1"],
      skipped: [],
      failed: [],
      results: [],
    });

    const result = await runInviteFanout(deps, { campaignId: CAMPAIGN_ID });

    // CAS claim + 1 heartbeat (single batch) + mark-sent
    expect(deps.updateMany).toHaveBeenCalledTimes(3);
    const claimCall = deps.updateMany.mock.calls[0][0];
    expect(claimCall.where).toEqual({
      id: CAMPAIGN_ID,
      inviteSendStartedAt: null,
      invitesSentAt: null,
      deletedAt: null,
    });
    expect(claimCall.data).toEqual({ inviteSendStartedAt: FIXED_NOW });

    // one batch (2 recipients ≤ 25)
    expect(deps.sendInvitesBatch).toHaveBeenCalledTimes(1);

    // mark-sent
    const markCall = findMarkSent(deps.updateMany);
    expect(markCall.where.id).toBe(CAMPAIGN_ID);
    expect(markCall.data.invitesSentAt).toEqual(FIXED_NOW);

    expect(result.claimed).toBe(true);
    expect(result.sent).toBe(2);
  });

  // -------------------------------------------------------------------------
  // FIX 1 — mark-sent must be deletedAt-guarded
  // -------------------------------------------------------------------------
  it("the mark-sent updateMany where-clause includes deletedAt: null (IMMEDIATELY — no flip)", async () => {
    const deps = makeDeps();
    deps.findUnique.mockResolvedValue(
      makeCampaign({ inviteTiming: "IMMEDIATELY", status: "ACTIVE" } as any),
    );
    deps.sendInvitesBatch.mockResolvedValue({
      sent: ["resp-0", "resp-1"],
      skipped: [],
      failed: [],
      results: [],
    });

    await runInviteFanout(deps, { campaignId: CAMPAIGN_ID });

    const markCall = findMarkSent(deps.updateMany);
    expect(markCall).toBeDefined();
    // The guard: a campaign soft-deleted between recheck and mark-sent must
    // NOT get invitesSentAt stamped on a deleted row.
    expect(markCall.where.deletedAt).toBeNull();
  });

  it("BOTH mark-sent and mark-sent-fallback where-clauses include deletedAt: null (ON_OPEN flip)", async () => {
    const deps = makeDeps();
    deps.findUnique.mockResolvedValue(
      makeCampaign({ inviteTiming: "ON_OPEN", status: "DRAFT" } as any),
    );
    deps.sendInvitesBatch.mockResolvedValue({
      sent: ["resp-0", "resp-1"],
      skipped: [],
      failed: [],
      results: [],
    });

    await runInviteFanout(deps, { campaignId: CAMPAIGN_ID });

    // Both writes that can set invitesSentAt must carry deletedAt: null.
    const stampCalls = deps.updateMany.mock.calls.filter(
      (c: any) => c[0]?.data && c[0].data.invitesSentAt !== undefined,
    );
    expect(stampCalls.length).toBe(2); // mark-sent (guarded flip) + fallback
    for (const c of stampCalls) {
      expect(c[0].where.deletedAt).toBeNull();
    }
  });

  it("does NOT stamp invitesSentAt when the campaign is soft-deleted before mark-sent (updateMany count 0, no-op)", async () => {
    const deps = makeDeps();
    deps.findUnique.mockResolvedValue(
      makeCampaign({ inviteTiming: "IMMEDIATELY", status: "ACTIVE" } as any),
    );
    deps.sendInvitesBatch.mockResolvedValue({
      sent: ["resp-0", "resp-1"],
      skipped: [],
      failed: [],
      results: [],
    });

    // Simulate the DB: the deletedAt-guarded mark-sent matches no live row
    // because the campaign was soft-deleted in the window → count 0 (no-op).
    deps.updateMany.mockImplementation(async (args: any) => {
      if (args?.data && args.data.invitesSentAt !== undefined) {
        // mark-sent / fallback against a deleted row → no row updated
        return { count: 0 };
      }
      return { count: 1 };
    });

    const result = await runInviteFanout(deps, { campaignId: CAMPAIGN_ID });

    const markCall = findMarkSent(deps.updateMany);
    expect(markCall.where.deletedAt).toBeNull();
    // The write executed but matched 0 rows — no invitesSentAt stamped on the
    // deleted campaign. Completion still returns (the deletion is the desired
    // terminal state); the guard merely prevents a stamp on a dead row.
    expect(result.claimed).toBe(true);
  });

  it("passes db + sendAssessmentInvitationEmail mailer + now into sendInvitesBatch deps", async () => {
    const deps = makeDeps();
    await runInviteFanout(deps, { campaignId: CAMPAIGN_ID });

    const [batchDeps] = deps.sendInvitesBatch.mock.calls[0];
    expect(batchDeps.db).toBe(deps.db);
    expect(batchDeps.sendEmail).toBe(deps.sendEmail);
    expect(typeof batchDeps.now).toBe("function");
  });

  it("flips ON_OPEN DRAFT campaign to ACTIVE on completion", async () => {
    const deps = makeDeps();
    deps.findUnique.mockResolvedValue(
      makeCampaign({ inviteTiming: "ON_OPEN", status: "DRAFT" }),
    );

    await runInviteFanout(deps, { campaignId: CAMPAIGN_ID });

    const markCall = findMarkSent(deps.updateMany);
    expect(markCall.data.invitesSentAt).toEqual(FIXED_NOW);
    expect(markCall.data.status).toBe("ACTIVE");
  });

  it("does NOT flip status for an IMMEDIATELY campaign", async () => {
    const deps = makeDeps();
    deps.findUnique.mockResolvedValue(
      makeCampaign({ inviteTiming: "IMMEDIATELY", status: "ACTIVE" }),
    );

    await runInviteFanout(deps, { campaignId: CAMPAIGN_ID });

    const markCall = findMarkSent(deps.updateMany);
    expect(markCall.data.status).toBeUndefined();
  });

  it("does NOT flip status for an ON_OPEN campaign that is already ACTIVE", async () => {
    const deps = makeDeps();
    deps.findUnique.mockResolvedValue(
      makeCampaign({ inviteTiming: "ON_OPEN", status: "ACTIVE" }),
    );

    await runInviteFanout(deps, { campaignId: CAMPAIGN_ID });

    const markCall = findMarkSent(deps.updateMany);
    expect(markCall.data.status).toBeUndefined();
  });

  // -------------------------------------------------------------------------
  // Re-entrancy / replay
  // -------------------------------------------------------------------------
  it("re-entrant invocation (CAS count=0) returns early without sending", async () => {
    const deps = makeDeps();
    deps.updateMany.mockResolvedValueOnce({ count: 0 }); // claim loses

    const result = await runInviteFanout(deps, { campaignId: CAMPAIGN_ID });

    expect(result.claimed).toBe(false);
    expect(deps.findUnique).not.toHaveBeenCalled();
    expect(deps.sendInvitesBatch).not.toHaveBeenCalled();
    // only the claim updateMany ran — no mark-sent
    expect(deps.updateMany).toHaveBeenCalledTimes(1);
  });

  // -------------------------------------------------------------------------
  // Deleted mid-flight at pre-flight
  // -------------------------------------------------------------------------
  it("aborts (no send, no invitesSentAt) when deletedAt set at pre-flight, and does NOT release the claim", async () => {
    const deps = makeDeps();
    deps.findUnique.mockResolvedValue(
      makeCampaign({ deletedAt: new Date("2026-06-16T11:00:00Z") }),
    );

    const result = await runInviteFanout(deps, { campaignId: CAMPAIGN_ID });

    expect(result.aborted).toBe(true);
    expect(result.reason).toBe("deleted");
    expect(deps.sendInvitesBatch).not.toHaveBeenCalled();
    // claim happened (count=1), but NO further updateMany (no mark-sent, no release)
    expect(deps.updateMany).toHaveBeenCalledTimes(1);
  });

  // -------------------------------------------------------------------------
  // Paused → abort + release
  // -------------------------------------------------------------------------
  it("aborts and RELEASES the claim (inviteSendStartedAt → null) when sends are paused", async () => {
    const deps = makeDeps();
    deps.isPaused.mockReturnValue(true);

    const result = await runInviteFanout(deps, { campaignId: CAMPAIGN_ID });

    expect(result.aborted).toBe(true);
    expect(result.reason).toBe("paused");
    expect(deps.sendInvitesBatch).not.toHaveBeenCalled();

    // claim + release (2 updateMany), NO mark-sent
    expect(deps.updateMany).toHaveBeenCalledTimes(2);
    const releaseCall = deps.updateMany.mock.calls[1][0];
    expect(releaseCall.where.id).toBe(CAMPAIGN_ID);
    expect(releaseCall.data.inviteSendStartedAt).toBeNull();
    expect(releaseCall.data.invitesSentAt).toBeUndefined();
  });

  it("aborts and RELEASES the claim when the auto-send flag is OFF", async () => {
    const deps = makeDeps();
    deps.isAutoSendEnabled.mockReturnValue(false);

    const result = await runInviteFanout(deps, { campaignId: CAMPAIGN_ID });

    expect(result.aborted).toBe(true);
    expect(result.reason).toBe("flag-off");
    expect(deps.sendInvitesBatch).not.toHaveBeenCalled();

    expect(deps.updateMany).toHaveBeenCalledTimes(2);
    const releaseCall = deps.updateMany.mock.calls[1][0];
    expect(releaseCall.data.inviteSendStartedAt).toBeNull();
  });

  // -------------------------------------------------------------------------
  // Chunking
  // -------------------------------------------------------------------------
  it("chunks >25 recipients into multiple batch steps, each ≤25", async () => {
    const deps = makeDeps();
    deps.findUnique.mockResolvedValue(
      makeCampaign({ participants: makeParticipants(57) } as any),
    );

    await runInviteFanout(deps, { campaignId: CAMPAIGN_ID });

    // 57 → 25 + 25 + 7 = 3 batches
    expect(deps.sendInvitesBatch).toHaveBeenCalledTimes(3);
    for (const call of deps.sendInvitesBatch.mock.calls) {
      const input = call[1];
      expect(input.recipients.length).toBeLessThanOrEqual(25);
    }
    const sizes = deps.sendInvitesBatch.mock.calls.map(
      (c: any) => c[1].recipients.length,
    );
    expect(sizes).toEqual([25, 25, 7]);

    // each batch is its own named step + heartbeat step
    const batchSteps = deps.runStep.mock.calls
      .map((c: any) => c[0])
      .filter((n: string) => n.startsWith("send-batch-"));
    expect(batchSteps).toEqual(["send-batch-1", "send-batch-2", "send-batch-3"]);
  });

  it("heartbeats inviteSendHeartbeatAt before each batch", async () => {
    const deps = makeDeps();
    deps.findUnique.mockResolvedValue(
      makeCampaign({ participants: makeParticipants(30) } as any),
    );

    await runInviteFanout(deps, { campaignId: CAMPAIGN_ID });

    // 2 batches → 2 heartbeats; heartbeat is via updateMany (id-scoped)
    const heartbeatCalls = deps.updateMany.mock.calls.filter(
      (c: any) => c[0].data && c[0].data.inviteSendHeartbeatAt !== undefined,
    );
    expect(heartbeatCalls.length).toBe(2);
    expect(heartbeatCalls[0][0].data.inviteSendHeartbeatAt).toEqual(FIXED_NOW);
  });

  // -------------------------------------------------------------------------
  // Deleted / paused mid-run (between batches)
  // -------------------------------------------------------------------------
  it("aborts remaining batches if the campaign is deleted mid-run; already-sent batches stay sent", async () => {
    const deps = makeDeps();
    deps.findUnique
      // pre-flight load: healthy
      .mockResolvedValueOnce(
        makeCampaign({ participants: makeParticipants(57) } as any),
      )
      // mid-run re-read before batch 1: healthy
      .mockResolvedValueOnce(makeCampaign({ deletedAt: null }))
      // mid-run re-read before batch 2: now deleted
      .mockResolvedValueOnce(
        makeCampaign({ deletedAt: new Date("2026-06-16T11:30:00Z") }),
      );

    const result = await runInviteFanout(deps, { campaignId: CAMPAIGN_ID });

    // only batch 1 ran before the deletion was observed
    expect(deps.sendInvitesBatch).toHaveBeenCalledTimes(1);
    expect(result.aborted).toBe(true);
    expect(result.reason).toBe("deleted-mid-run");

    // NOT marked sent (incomplete)
    const markCalls = deps.updateMany.mock.calls.filter(
      (c: any) => c[0].data && c[0].data.invitesSentAt !== undefined,
    );
    expect(markCalls.length).toBe(0);
  });

  it("aborts remaining batches if sends are paused mid-run", async () => {
    const deps = makeDeps();
    deps.findUnique.mockResolvedValue(
      makeCampaign({ participants: makeParticipants(57) } as any),
    );
    // healthy at pre-flight + before batch 1, paused before batch 2
    deps.isPaused
      .mockReturnValueOnce(false) // pre-flight
      .mockReturnValueOnce(false) // before batch 1
      .mockReturnValueOnce(true); // before batch 2

    const result = await runInviteFanout(deps, { campaignId: CAMPAIGN_ID });

    expect(deps.sendInvitesBatch).toHaveBeenCalledTimes(1);
    expect(result.aborted).toBe(true);
    expect(result.reason).toBe("paused-mid-run");

    const markCalls = deps.updateMany.mock.calls.filter(
      (c: any) => c[0].data && c[0].data.invitesSentAt !== undefined,
    );
    expect(markCalls.length).toBe(0);
  });

  // -------------------------------------------------------------------------
  // No recipients → still completes
  // -------------------------------------------------------------------------
  it("completes (marks invitesSentAt) with zero recipients — no batch steps", async () => {
    const deps = makeDeps();
    deps.findUnique.mockResolvedValue(
      makeCampaign({ participants: [] } as any),
    );

    const result = await runInviteFanout(deps, { campaignId: CAMPAIGN_ID });

    expect(deps.sendInvitesBatch).not.toHaveBeenCalled();
    const markCall = findMarkSent(deps.updateMany);
    expect(markCall.data.invitesSentAt).toEqual(FIXED_NOW);
    expect(result.sent).toBe(0);
  });

  it("skips soft-deleted participants (respondent.deletedAt set)", async () => {
    const deps = makeDeps();
    const camp = makeCampaign({ participants: makeParticipants(3) } as any);
    (camp.participants as any)[1].respondent.deletedAt = new Date();
    deps.findUnique.mockResolvedValue(camp);

    await runInviteFanout(deps, { campaignId: CAMPAIGN_ID });

    const input = deps.sendInvitesBatch.mock.calls[0][1];
    expect(input.recipients.length).toBe(2);
    expect(input.recipients.map((r: any) => r.respondentId)).toEqual([
      "resp-0",
      "resp-2",
    ]);
  });

  // -------------------------------------------------------------------------
  // Campaign vanished after claim (defensive)
  // -------------------------------------------------------------------------
  it("aborts cleanly if the campaign is not found at pre-flight", async () => {
    const deps = makeDeps();
    deps.findUnique.mockResolvedValue(null);

    const result = await runInviteFanout(deps, { campaignId: CAMPAIGN_ID });

    expect(result.aborted).toBe(true);
    expect(result.reason).toBe("not-found");
    expect(deps.sendInvitesBatch).not.toHaveBeenCalled();
  });

  // -------------------------------------------------------------------------
  // FIX 1 — step-boundary Date rehydration (closeAt survives JSON round-trip)
  // -------------------------------------------------------------------------
  it("rehydrates campaign.closeAt to a real Date after the preflight-load step (does NOT pass a string into the send path)", async () => {
    const deps = makeDeps();
    const closeAt = new Date("2026-09-30T00:00:00Z");
    deps.findUnique.mockResolvedValue(
      makeCampaign({ closeAt, participants: makeParticipants(1) } as any),
    );
    deps.sendInvitesBatch.mockResolvedValue({
      sent: ["resp-0"],
      skipped: [],
      failed: [],
      results: [],
    });

    // With the JSON-round-trip runner, closeAt comes back from preflight-load as
    // a STRING. The fan-out must rehydrate it to a Date before handing it to
    // sendInvitesBatch (which uses it as expiresAt + the mailer calls
    // closeAt.toLocaleDateString — a TypeError on a string).
    const result = await runInviteFanout(deps, { campaignId: CAMPAIGN_ID });

    expect(result.aborted).toBe(false);
    const input = deps.sendInvitesBatch.mock.calls[0][1];
    expect(input.campaign.closeAt).toBeInstanceOf(Date);
    expect(input.campaign.closeAt.toISOString()).toBe(closeAt.toISOString());
    // proves a real Date method works (the prod crash was .toLocaleDateString)
    expect(() => input.campaign.closeAt.toLocaleDateString("en-US")).not.toThrow();
  });

  // -------------------------------------------------------------------------
  // FIX 2 — no false completion on a total send failure (SMTP outage)
  // -------------------------------------------------------------------------
  it("on a TOTAL send failure (zero sent, zero already-SENT, ≥1 failed): does NOT mark sent, RELEASES the claim, and throws", async () => {
    const deps = makeDeps();
    deps.findUnique.mockResolvedValue(
      makeCampaign({ participants: makeParticipants(2) } as any),
    );
    deps.sendInvitesBatch.mockResolvedValue({
      sent: [],
      skipped: [],
      failed: ["resp-0", "resp-1"],
      results: [],
    });

    await expect(
      runInviteFanout(deps, { campaignId: CAMPAIGN_ID }),
    ).rejects.toThrow();

    // NOT marked sent (nothing got through)
    expect(findMarkSent(deps.updateMany)).toBeUndefined();

    // claim RELEASED so a later run / the cron can re-claim
    const releaseCall = deps.updateMany.mock.calls.find(
      (c: any) =>
        c[0]?.data && c[0].data.inviteSendStartedAt === null,
    );
    expect(releaseCall).toBeDefined();
    expect(releaseCall[0].data.invitesSentAt).toBeUndefined();
  });

  it("on a PARTIAL failure (some sent, some failed) still marks complete; bad addresses stay PENDING", async () => {
    const deps = makeDeps();
    deps.findUnique.mockResolvedValue(
      makeCampaign({ participants: makeParticipants(2) } as any),
    );
    deps.sendInvitesBatch.mockResolvedValue({
      sent: ["resp-0"],
      skipped: [],
      failed: ["resp-1"],
      results: [],
    });

    const result = await runInviteFanout(deps, { campaignId: CAMPAIGN_ID });

    expect(result.aborted).toBe(false);
    expect(result.sent).toBe(1);
    const markCall = findMarkSent(deps.updateMany);
    expect(markCall).toBeDefined();
    expect(markCall.data.invitesSentAt).toEqual(FIXED_NOW);
  });

  it("completes (does NOT release / throw) when progress is only already-SENT recipients (zero new sends, zero failures)", async () => {
    const deps = makeDeps();
    deps.findUnique.mockResolvedValue(
      makeCampaign({ participants: makeParticipants(2) } as any),
    );
    deps.sendInvitesBatch.mockResolvedValue({
      sent: [],
      skipped: ["resp-0", "resp-1"],
      failed: [],
      results: [],
    });

    const result = await runInviteFanout(deps, { campaignId: CAMPAIGN_ID });

    expect(result.aborted).toBe(false);
    const markCall = findMarkSent(deps.updateMany);
    expect(markCall).toBeDefined();
    expect(markCall.data.invitesSentAt).toEqual(FIXED_NOW);
  });

  // -------------------------------------------------------------------------
  // FIX 3 — heartbeat carries a LIVE timestamp (fresh per batch)
  // -------------------------------------------------------------------------
  it("writes a FRESH now() into each heartbeat (advances across batches — liveness signal)", async () => {
    const t1 = new Date("2026-06-16T12:00:00Z");
    const t2 = new Date("2026-06-16T12:01:00Z");
    const t3 = new Date("2026-06-16T12:02:00Z");
    const t4 = new Date("2026-06-16T12:03:00Z");
    const t5 = new Date("2026-06-16T12:04:00Z");
    const clock = [t1, t2, t3, t4, t5];
    let i = 0;
    // increasing clock so a heartbeat written from the run-start value would be
    // detectable (all equal) vs. a fresh value (advances).
    const now = jest.fn(() => clock[Math.min(i++, clock.length - 1)]);

    const deps = makeDeps({ now } as any);
    deps.findUnique.mockResolvedValue(
      makeCampaign({ participants: makeParticipants(30) } as any),
    );

    await runInviteFanout(deps, { campaignId: CAMPAIGN_ID });

    const heartbeatCalls = deps.updateMany.mock.calls.filter(
      (c: any) => c[0].data && c[0].data.inviteSendHeartbeatAt !== undefined,
    );
    // 2 batches → 2 heartbeats
    expect(heartbeatCalls.length).toBe(2);
    const h1 = heartbeatCalls[0][0].data.inviteSendHeartbeatAt;
    const h2 = heartbeatCalls[1][0].data.inviteSendHeartbeatAt;
    // the two heartbeats must NOT be the same captured value
    expect(h2).not.toEqual(h1);
  });

  // -------------------------------------------------------------------------
  // FIX 4 — status-guard the DRAFT→ACTIVE flip
  // -------------------------------------------------------------------------
  it("status-guards the DRAFT→ACTIVE flip (where.status === DRAFT) so it cannot flip a campaign moved out of DRAFT mid-run", async () => {
    const deps = makeDeps();
    deps.findUnique.mockResolvedValue(
      makeCampaign({ inviteTiming: "ON_OPEN", status: "DRAFT" }),
    );
    deps.sendInvitesBatch.mockResolvedValue({
      sent: ["resp-0", "resp-1"],
      skipped: [],
      failed: [],
      results: [],
    });

    await runInviteFanout(deps, { campaignId: CAMPAIGN_ID });

    const markCall = findMarkSent(deps.updateMany);
    expect(markCall.data.status).toBe("ACTIVE");
    expect(markCall.where.status).toBe("DRAFT");
    // invitesSentAt set regardless of the flip
    expect(markCall.data.invitesSentAt).toEqual(FIXED_NOW);
  });

  it("does NOT add a status guard when there is no flip (IMMEDIATELY campaign)", async () => {
    const deps = makeDeps();
    deps.findUnique.mockResolvedValue(
      makeCampaign({ inviteTiming: "IMMEDIATELY", status: "ACTIVE" }),
    );

    await runInviteFanout(deps, { campaignId: CAMPAIGN_ID });

    const markCall = findMarkSent(deps.updateMany);
    expect(markCall.data.status).toBeUndefined();
    expect(markCall.where.status).toBeUndefined();
    expect(markCall.data.invitesSentAt).toEqual(FIXED_NOW);
  });
});
