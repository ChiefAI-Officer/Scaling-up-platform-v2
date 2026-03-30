/* eslint-disable @typescript-eslint/no-explicit-any */

/**
 * Tests for auto-build-workshop Inngest function (simplified wrapper).
 *
 * The function delegates to runAutoBuild() from the shared service.
 * Tests here focus on: idempotency guard + delegation.
 * Detailed build logic is tested in auto-build-service.test.ts.
 */

// ---- Mocks (must be declared before imports) ----

// eslint-disable-next-line no-var
var capturedHandler: (...args: unknown[]) => unknown;

jest.mock("@/inngest/client", () => ({
  inngest: {
    createFunction: jest.fn(
      (_config: unknown, _trigger: unknown, handler: (...args: unknown[]) => unknown) => {
        capturedHandler = handler;
        return handler;
      }
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

// ---- Imports (after mocks) ----

import { db } from "@/lib/db";
import { runAutoBuild } from "@/lib/auto-build-service";

// Force module load so createFunction captures the handler
import "@/inngest/functions/auto-build-workshop";

// ---- Helpers ----

const mockStep = {
  run: jest.fn(async (_name: string, fn: () => Promise<unknown>) => fn()),
  sleepUntil: jest.fn(),
  sleep: jest.fn(),
  sendEvent: jest.fn(),
};

function makeEvent(workshopId = "ws-1") {
  return {
    data: { workshopId },
    name: "workshop/approved",
  };
}

// ---- Tests ----

describe("autoBuildWorkshop Inngest function", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("captures the handler via createFunction (called at import time)", () => {
    expect(typeof capturedHandler).toBe("function");
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

    const result = await capturedHandler({
      event: makeEvent(),
      step: mockStep,
    });

    expect(runAutoBuild).toHaveBeenCalledWith("ws-1");
    expect(result).toMatchObject({
      workshopId: "ws-1",
      success: true,
      pagesCreated: 3,
      status: "PRE_EVENT",
    });
  });

  it("skips build if workshop status is already PRE_EVENT", async () => {
    (db.landingPage.findMany as jest.Mock).mockResolvedValueOnce([]);
    (db.workshop.findUnique as jest.Mock).mockResolvedValueOnce({ status: "PRE_EVENT" });

    const result = await capturedHandler({
      event: makeEvent(),
      step: mockStep,
    });

    expect(result).toEqual({
      workshopId: "ws-1",
      skipped: true,
      reason: "Idempotency guard: pages=0, status=PRE_EVENT",
    });
    expect(runAutoBuild).not.toHaveBeenCalled();
  });

  it("skips build if workshop status is POST_EVENT", async () => {
    (db.landingPage.findMany as jest.Mock).mockResolvedValueOnce([{ id: "lp-1" }]);
    (db.workshop.findUnique as jest.Mock).mockResolvedValueOnce({ status: "POST_EVENT" });

    const result = await capturedHandler({
      event: makeEvent(),
      step: mockStep,
    });

    expect(result).toMatchObject({ skipped: true });
    expect(runAutoBuild).not.toHaveBeenCalled();
  });

  it("skips build if workshop status is COMPLETED", async () => {
    (db.landingPage.findMany as jest.Mock).mockResolvedValueOnce([]);
    (db.workshop.findUnique as jest.Mock).mockResolvedValueOnce({ status: "COMPLETED" });

    const result = await capturedHandler({
      event: makeEvent(),
      step: mockStep,
    });

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

    const result = await capturedHandler({
      event: makeEvent(),
      step: mockStep,
    });

    expect(result).toMatchObject({ workshopId: "ws-1", success: true });
    expect(runAutoBuild).toHaveBeenCalledWith("ws-1");
  });
});
