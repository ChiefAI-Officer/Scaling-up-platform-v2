/**
 * Tests for runScheduledSendSweep — the pure, injected-dep sweep that powers
 * the assessmentScheduledSendCron Inngest cron function (Wave D auto-send
 * backstop + stale-claim recovery).
 *
 * All tests mock Prisma + sendEvent + the flag checks; no real DB / Inngest.
 *
 * Coverage:
 *   - Paused / flag-off → no queries, no emits (kill switch / dark-launch gate).
 *   - Due ON_OPEN sweep: a due, unsent, unclaimed ON_OPEN campaign emits
 *     {campaignId}; IMMEDIATELY / future-openAt / already-claimed-or-sent are
 *     filtered by the WHERE predicate (so the query bounds the result set).
 *   - Stale-claim recovery: a claim with a heartbeat older than STALE_MS (and
 *     invitesSentAt null) is reset + re-emitted; a FRESH claim is NOT touched;
 *     a claim whose invitesSentAt is set is NOT reset (the guard).
 *   - Heartbeat-null handling: a claim with inviteSendStartedAt set but
 *     inviteSendHeartbeatAt null, older than STALE_MS by claim time → stale.
 *   - Page size is bounded (take present on the due query).
 *   - Emitted payload is {campaignId} only.
 */

/* eslint-disable @typescript-eslint/no-explicit-any */

import {
  runScheduledSendSweep,
  STALE_MS,
  type ScheduledSendSweepDeps,
} from "@/inngest/functions/assessment-scheduled-send-cron";
import { ASSESSMENT_SEND_INVITES_EVENT } from "@/inngest/functions/assessment-invite-fanout";

const FIXED_NOW = new Date("2026-06-16T12:00:00Z");

function makeDeps(
  overrides: Partial<ScheduledSendSweepDeps> = {},
): ScheduledSendSweepDeps & {
  findMany: jest.Mock;
  updateMany: jest.Mock;
  sendEvent: jest.Mock;
  isPaused: jest.Mock;
  isAutoSendEnabled: jest.Mock;
} {
  // First findMany = due sweep, second findMany = stale sweep.
  const findMany = jest.fn().mockResolvedValue([]);
  const updateMany = jest.fn().mockResolvedValue({ count: 1 });
  const sendEvent = jest.fn().mockResolvedValue(undefined);
  const isPaused = jest.fn().mockReturnValue(false);
  const isAutoSendEnabled = jest.fn().mockReturnValue(true);

  const deps = {
    db: {
      assessmentCampaign: {
        findMany,
        updateMany,
      },
    },
    sendEvent,
    isPaused,
    isAutoSendEnabled,
    now: () => FIXED_NOW,
    ...overrides,
  } as any;

  return Object.assign(deps, {
    findMany,
    updateMany,
    sendEvent,
    isPaused,
    isAutoSendEnabled,
  });
}

describe("STALE_MS", () => {
  it("is ~10 minutes (well beyond a normal ≤25-email batch)", () => {
    expect(STALE_MS).toBe(10 * 60 * 1000);
  });
});

describe("runScheduledSendSweep — kill-switch / dark-launch gate", () => {
  beforeEach(() => jest.clearAllMocks());

  it("does nothing when sends are paused (no queries, no emits)", async () => {
    const deps = makeDeps();
    deps.isPaused.mockReturnValue(true);

    const result = await runScheduledSendSweep(deps);

    expect(deps.findMany).not.toHaveBeenCalled();
    expect(deps.updateMany).not.toHaveBeenCalled();
    expect(deps.sendEvent).not.toHaveBeenCalled();
    expect(result).toEqual({ dueEmitted: 0, staleRecovered: 0 });
  });

  it("does nothing when the auto-send flag is OFF (no queries, no emits)", async () => {
    const deps = makeDeps();
    deps.isAutoSendEnabled.mockReturnValue(false);

    const result = await runScheduledSendSweep(deps);

    expect(deps.findMany).not.toHaveBeenCalled();
    expect(deps.updateMany).not.toHaveBeenCalled();
    expect(deps.sendEvent).not.toHaveBeenCalled();
    expect(result).toEqual({ dueEmitted: 0, staleRecovered: 0 });
  });
});

describe("runScheduledSendSweep — due ON_OPEN sweep", () => {
  beforeEach(() => jest.clearAllMocks());

  it("emits {campaignId} for each due campaign returned by the due query", async () => {
    const deps = makeDeps();
    // due sweep returns 2 campaigns; stale sweep returns none.
    deps.findMany
      .mockResolvedValueOnce([{ id: "camp-A" }, { id: "camp-B" }])
      .mockResolvedValueOnce([]);

    const result = await runScheduledSendSweep(deps);

    expect(deps.sendEvent).toHaveBeenCalledTimes(2);
    const payloads = deps.sendEvent.mock.calls.map((c: any) => c[0]);
    // payload is {campaignId} ONLY, on the documented event name.
    expect(payloads).toEqual([
      { name: ASSESSMENT_SEND_INVITES_EVENT, data: { campaignId: "camp-A" } },
      { name: ASSESSMENT_SEND_INVITES_EVENT, data: { campaignId: "camp-B" } },
    ]);
    expect(result.dueEmitted).toBe(2);
  });

  it("the due query filters status DRAFT/ACTIVE + openAt<=now + unsent + unclaimed + not-deleted (no inviteTiming filter)", async () => {
    const deps = makeDeps();
    await runScheduledSendSweep(deps);

    const dueQuery = deps.findMany.mock.calls[0][0];
    expect(dueQuery.where).toEqual({
      status: { in: ["DRAFT", "ACTIVE"] },
      openAt: { lte: FIXED_NOW },
      invitesSentAt: null,
      inviteSendStartedAt: null,
      deletedAt: null,
    });
    // selects only the id (payload is {campaignId} only)
    expect(dueQuery.select).toEqual({ id: true });
  });

  it("bounds the due query with a take (no unbounded sweep)", async () => {
    const deps = makeDeps();
    await runScheduledSendSweep(deps);

    const dueQuery = deps.findMany.mock.calls[0][0];
    expect(dueQuery.take).toBeDefined();
    expect(typeof dueQuery.take).toBe("number");
    expect(dueQuery.take).toBeGreaterThan(0);
  });

  it("emits nothing when no campaigns are due", async () => {
    const deps = makeDeps(); // both findMany default to []
    const result = await runScheduledSendSweep(deps);

    expect(deps.sendEvent).not.toHaveBeenCalled();
    expect(result.dueEmitted).toBe(0);
  });
});

describe("runScheduledSendSweep — stale-claim recovery", () => {
  beforeEach(() => jest.clearAllMocks());

  it("resets the claim (guarded) and re-emits for a stale claim", async () => {
    const deps = makeDeps();
    deps.findMany
      .mockResolvedValueOnce([]) // no due
      .mockResolvedValueOnce([
        {
          id: "camp-stale",
          inviteSendStartedAt: new Date("2026-06-16T11:00:00Z"),
          inviteSendHeartbeatAt: new Date("2026-06-16T11:40:00Z"), // 20m ago, > STALE_MS
        },
      ]);

    const result = await runScheduledSendSweep(deps);

    // reset the claim, guarded on the SAME stale predicate (incl. invitesSentAt null)
    expect(deps.updateMany).toHaveBeenCalledTimes(1);
    const resetCall = deps.updateMany.mock.calls[0][0];
    expect(resetCall.where.id).toBe("camp-stale");
    expect(resetCall.where.invitesSentAt).toBeNull();
    expect(resetCall.where.deletedAt).toBeNull();
    // must guard that the claim is still set (so we don't reset a fresh re-claim)
    expect(resetCall.where.inviteSendStartedAt).not.toBeUndefined();
    expect(resetCall.data).toEqual({ inviteSendStartedAt: null, inviteSendHeartbeatAt: null });

    // re-emit the fan-out
    expect(deps.sendEvent).toHaveBeenCalledTimes(1);
    expect(deps.sendEvent.mock.calls[0][0]).toEqual({
      name: ASSESSMENT_SEND_INVITES_EVENT,
      data: { campaignId: "camp-stale" },
    });
    expect(result.staleRecovered).toBe(1);
  });

  it("does NOT re-emit when the guarded reset matched 0 rows (claim already changed)", async () => {
    const deps = makeDeps();
    deps.findMany
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        {
          id: "camp-raced",
          inviteSendStartedAt: new Date("2026-06-16T11:00:00Z"),
          inviteSendHeartbeatAt: new Date("2026-06-16T11:40:00Z"),
        },
      ]);
    // The guarded reset finds nothing — the run completed / re-claimed between
    // our read and the write. Must NOT re-emit.
    deps.updateMany.mockResolvedValue({ count: 0 });

    const result = await runScheduledSendSweep(deps);

    expect(deps.sendEvent).not.toHaveBeenCalled();
    expect(result.staleRecovered).toBe(0);
  });

  it("treats a claim with a NULL heartbeat older than STALE_MS (by claim time) as stale", async () => {
    const deps = makeDeps();
    deps.findMany
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        {
          id: "camp-noheartbeat",
          inviteSendStartedAt: new Date("2026-06-16T11:30:00Z"), // 30m ago > STALE
          inviteSendHeartbeatAt: null,
        },
      ]);

    const result = await runScheduledSendSweep(deps);

    expect(deps.updateMany).toHaveBeenCalledTimes(1);
    expect(deps.sendEvent).toHaveBeenCalledTimes(1);
    expect(result.staleRecovered).toBe(1);
  });

  it("does NOT recover a FRESH claim (recent heartbeat within STALE_MS)", async () => {
    const deps = makeDeps();
    deps.findMany
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        {
          id: "camp-fresh",
          inviteSendStartedAt: new Date("2026-06-16T11:00:00Z"),
          inviteSendHeartbeatAt: new Date("2026-06-16T11:59:00Z"), // 1m ago, fresh
        },
      ]);

    const result = await runScheduledSendSweep(deps);

    expect(deps.updateMany).not.toHaveBeenCalled();
    expect(deps.sendEvent).not.toHaveBeenCalled();
    expect(result.staleRecovered).toBe(0);
  });

  it("does NOT recover a fresh-claim NULL-heartbeat run (claim within STALE_MS)", async () => {
    const deps = makeDeps();
    deps.findMany
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        {
          id: "camp-just-claimed",
          inviteSendStartedAt: new Date("2026-06-16T11:59:00Z"), // 1m ago, fresh
          inviteSendHeartbeatAt: null,
        },
      ]);

    const result = await runScheduledSendSweep(deps);

    expect(deps.updateMany).not.toHaveBeenCalled();
    expect(deps.sendEvent).not.toHaveBeenCalled();
    expect(result.staleRecovered).toBe(0);
  });

  it("the stale query is bounded by a take and scoped to claimed-but-unsent-not-deleted", async () => {
    const deps = makeDeps();
    await runScheduledSendSweep(deps);

    const staleQuery = deps.findMany.mock.calls[1][0];
    expect(staleQuery.where.invitesSentAt).toBeNull();
    expect(staleQuery.where.deletedAt).toBeNull();
    // inviteSendStartedAt is "not null" — i.e. claimed
    expect(staleQuery.where.inviteSendStartedAt).toEqual({ not: null });
    expect(staleQuery.take).toBeDefined();
    expect(typeof staleQuery.take).toBe("number");
  });

  // FIX 2 — reset must clear BOTH inviteSendStartedAt AND inviteSendHeartbeatAt
  it("reset updateMany data clears BOTH inviteSendStartedAt AND inviteSendHeartbeatAt (FIX-2)", async () => {
    const deps = makeDeps();
    deps.findMany
      .mockResolvedValueOnce([]) // no due
      .mockResolvedValueOnce([
        {
          id: "camp-stale-hb",
          inviteSendStartedAt: new Date("2026-06-16T11:00:00Z"),
          inviteSendHeartbeatAt: new Date("2026-06-16T11:40:00Z"), // stale
        },
      ]);

    await runScheduledSendSweep(deps);

    expect(deps.updateMany).toHaveBeenCalledTimes(1);
    const resetData = deps.updateMany.mock.calls[0][0].data;
    // Must clear the stale heartbeat so the re-claimed fresh run isn't
    // spuriously judged stale on the next cron tick.
    expect(resetData).toEqual({
      inviteSendStartedAt: null,
      inviteSendHeartbeatAt: null,
    });
  });

  // FIX 3 — reset WHERE must pin inviteSendStartedAt to the exact value read
  it("reset WHERE pins inviteSendStartedAt to the exact Date read (FIX-3)", async () => {
    const claimDate = new Date("2026-06-16T11:00:00Z");
    const deps = makeDeps();
    deps.findMany
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        {
          id: "camp-pin",
          inviteSendStartedAt: claimDate,
          inviteSendHeartbeatAt: new Date("2026-06-16T11:40:00Z"), // stale
        },
      ]);

    await runScheduledSendSweep(deps);

    const resetWhere = deps.updateMany.mock.calls[0][0].where;
    // The WHERE must use the exact Date object (or matching value) that was
    // read, not just `{ not: null }`, so a row re-claimed between read and
    // reset is not clobbered.
    expect(resetWhere.inviteSendStartedAt).toEqual(claimDate);
  });

  // FIX 3 — a row re-claimed between read and reset → updateMany matches 0 → no re-emit
  it("no re-emit when reset matches 0 rows because claim changed after read (FIX-3 race guard)", async () => {
    const claimDate = new Date("2026-06-16T11:00:00Z");
    const deps = makeDeps();
    deps.findMany
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        {
          id: "camp-race-pinned",
          inviteSendStartedAt: claimDate,
          inviteSendHeartbeatAt: new Date("2026-06-16T11:40:00Z"), // stale
        },
      ]);
    // The pinned WHERE matches 0 because the row was re-claimed between read and reset
    deps.updateMany.mockResolvedValue({ count: 0 });

    const result = await runScheduledSendSweep(deps);

    expect(deps.sendEvent).not.toHaveBeenCalled();
    expect(result.staleRecovered).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// FIX 1 — cron must backstop lost IMMEDIATELY events
// ---------------------------------------------------------------------------

describe("runScheduledSendSweep — IMMEDIATELY backstop (FIX-1)", () => {
  beforeEach(() => jest.clearAllMocks());

  it("due query does NOT filter by inviteTiming — IMMEDIATELY campaigns are included", async () => {
    const deps = makeDeps();
    await runScheduledSendSweep(deps);

    const dueQuery = deps.findMany.mock.calls[0][0];
    // The inviteTiming filter must be absent — the cron is the backstop for
    // ALL timing modes (an IMMEDIATELY campaign whose initial Inngest event
    // was lost sits with invitesSentAt=null, inviteSendStartedAt=null forever
    // unless the cron covers it).
    expect(dueQuery.where).not.toHaveProperty("inviteTiming");
  });

  it("emits for an IMMEDIATELY campaign with openAt<=now and no claim/sent (lost-event recovery)", async () => {
    const deps = makeDeps();
    deps.findMany
      .mockResolvedValueOnce([{ id: "camp-immediately-lost" }]) // returned by due sweep
      .mockResolvedValueOnce([]); // no stale claims

    const result = await runScheduledSendSweep(deps);

    expect(deps.sendEvent).toHaveBeenCalledTimes(1);
    expect(deps.sendEvent.mock.calls[0][0]).toEqual({
      name: ASSESSMENT_SEND_INVITES_EVENT,
      data: { campaignId: "camp-immediately-lost" },
    });
    expect(result.dueEmitted).toBe(1);
  });

  it("does NOT emit for an IMMEDIATELY campaign with a future openAt", async () => {
    const deps = makeDeps();
    // The WHERE clause has openAt: { lte: now }, so a future-openAt row would
    // NOT be returned by the query. Both sweeps return [].
    deps.findMany.mockResolvedValue([]);

    const result = await runScheduledSendSweep(deps);

    expect(deps.sendEvent).not.toHaveBeenCalled();
    expect(result.dueEmitted).toBe(0);
  });

  it("does NOT emit for an IMMEDIATELY campaign that is already claimed (inviteSendStartedAt set)", async () => {
    const deps = makeDeps();
    // Due sweep returns [] because inviteSendStartedAt is not null → WHERE excludes it.
    // The already-claimed row would show up in the stale sweep only if it's stale.
    deps.findMany.mockResolvedValue([]);

    const result = await runScheduledSendSweep(deps);

    expect(deps.sendEvent).not.toHaveBeenCalled();
    expect(result.dueEmitted).toBe(0);
  });

  it("does NOT emit for an IMMEDIATELY campaign that already has invitesSentAt set", async () => {
    const deps = makeDeps();
    // invitesSentAt != null → WHERE excludes it; due sweep returns [].
    deps.findMany.mockResolvedValue([]);

    const result = await runScheduledSendSweep(deps);

    expect(deps.sendEvent).not.toHaveBeenCalled();
    expect(result.dueEmitted).toBe(0);
  });
});
