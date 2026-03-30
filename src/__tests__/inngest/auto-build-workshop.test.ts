/* eslint-disable @typescript-eslint/no-explicit-any */

/**
 * Tests for auto-build-workshop Inngest function (simplified wrapper).
 *
 * The function delegates to runAutoBuild() from the shared service.
 * Tests here focus on: idempotency guard + delegation.
 * Detailed build logic is tested in auto-build-service.test.ts.
 */

// ---- Mocks (must be declared before imports) ----

jest.mock("@/inngest/client", () => ({
  inngest: {
    createFunction: jest.fn(
      (_config: unknown, _trigger: unknown, handler: unknown) => handler
    ),
    send: jest.fn(),
  },
}));

jest.mock("@/lib/db", () => ({
  db: {
    workshop: { findUnique: jest.fn() },
    landingPage: { findMany: jest.fn() },
  },
}));

jest.mock("@/lib/auto-build-service", () => ({
  runAutoBuild: jest.fn(),
}));

jest.mock("@/services/notifications", () => ({
  sendWorkshopBuiltEmail: jest.fn().mockResolvedValue(undefined),
}));

// ---- Imports (after mocks) ----

import { db } from "@/lib/db";
import { runAutoBuild } from "@/lib/auto-build-service";
import { autoBuildWorkshop } from "@/inngest/functions/auto-build-workshop";

// Type the handler so we can call it directly
type HandlerArgs = {
  event: { name: string; data: { workshopId: string } };
  step: { run: jest.Mock; sleep: jest.Mock; sleepUntil: jest.Mock; sendEvent: jest.Mock; waitForEvent: jest.Mock };
};

const handler = autoBuildWorkshop as unknown as (args: HandlerArgs) => Promise<unknown>;

function makeEvent(workshopId = "ws-test-123") {
  return {
    name: "workshop/approved" as const,
    data: { approvalId: "apr-001", workshopId, coachId: "coach-001" },
  };
}

function createStep(): HandlerArgs["step"] {
  return {
    run: jest.fn(async (_name: string, fn: () => Promise<unknown>) => fn()),
    sleep: jest.fn(),
    sleepUntil: jest.fn(),
    sendEvent: jest.fn(),
    waitForEvent: jest.fn(),
  };
}

// ---- Tests ----

describe("auto-build-workshop Inngest function", () => {
  let step: HandlerArgs["step"];

  beforeEach(() => {
    jest.clearAllMocks();
    step = createStep();
  });

  it("delegates to runAutoBuild when idempotency check passes", async () => {
    (db.landingPage.findMany as jest.Mock).mockResolvedValueOnce([]);
    (db.workshop.findUnique as jest.Mock).mockResolvedValueOnce({ status: "AWAITING_APPROVAL" });
    (runAutoBuild as jest.Mock).mockResolvedValueOnce({
      success: true,
      pagesCreated: 3,
      templates: ["SOLO_LANDING", "REGISTRATION", "THANK_YOU"],
      status: "PRE_EVENT",
      preEventWorkflow: "Pre-Event Sequence",
      postEventWorkflow: "Post-Event Follow Up",
    });

    const result = await handler({ event: makeEvent(), step });

    expect(runAutoBuild).toHaveBeenCalledWith("ws-test-123");
    expect(result).toMatchObject({
      workshopId: "ws-test-123",
      success: true,
      pagesCreated: 3,
      status: "PRE_EVENT",
    });
  });

  it("skips build if workshop status is already PRE_EVENT", async () => {
    (db.landingPage.findMany as jest.Mock).mockResolvedValueOnce([]);
    (db.workshop.findUnique as jest.Mock).mockResolvedValueOnce({ status: "PRE_EVENT" });

    const result = await handler({ event: makeEvent(), step });

    expect(result).toEqual({
      workshopId: "ws-test-123",
      skipped: true,
      reason: "Idempotency guard: pages=0, status=PRE_EVENT",
    });
    expect(runAutoBuild).not.toHaveBeenCalled();
  });

  it("skips build if workshop status is POST_EVENT", async () => {
    (db.landingPage.findMany as jest.Mock).mockResolvedValueOnce([{ id: "lp-1" }]);
    (db.workshop.findUnique as jest.Mock).mockResolvedValueOnce({ status: "POST_EVENT" });

    const result = await handler({ event: makeEvent(), step });

    expect(result).toMatchObject({ skipped: true });
    expect(runAutoBuild).not.toHaveBeenCalled();
  });

  it("skips build if workshop status is COMPLETED", async () => {
    (db.landingPage.findMany as jest.Mock).mockResolvedValueOnce([]);
    (db.workshop.findUnique as jest.Mock).mockResolvedValueOnce({ status: "COMPLETED" });

    const result = await handler({ event: makeEvent(), step });

    expect(result).toMatchObject({ skipped: true });
    expect(runAutoBuild).not.toHaveBeenCalled();
  });

  it("proceeds when pages exist but status has not advanced", async () => {
    (db.landingPage.findMany as jest.Mock).mockResolvedValueOnce([{ id: "lp-1" }]);
    (db.workshop.findUnique as jest.Mock).mockResolvedValueOnce({ status: "AWAITING_APPROVAL" });
    (runAutoBuild as jest.Mock).mockResolvedValueOnce({
      success: true,
      pagesCreated: 1,
      templates: ["THANK_YOU"],
      status: "PRE_EVENT",
      preEventWorkflow: null,
      postEventWorkflow: null,
    });

    const result = await handler({ event: makeEvent(), step });

    expect(result).toMatchObject({ workshopId: "ws-test-123", success: true });
    expect(runAutoBuild).toHaveBeenCalledWith("ws-test-123");
  });
});
