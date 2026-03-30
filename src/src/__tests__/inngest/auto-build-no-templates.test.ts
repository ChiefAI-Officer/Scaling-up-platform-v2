/* eslint-disable @typescript-eslint/no-explicit-any */

/**
 * Tests that auto-build correctly handles the no-templates case.
 * The Inngest function delegates to runAutoBuild(), which returns
 * a result indicating no templates were found.
 */

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

jest.mock("@/services/notifications", () => ({
  sendWorkshopBuiltEmail: jest.fn(),
}));

import { db } from "@/lib/db";
import { runAutoBuild } from "@/lib/auto-build-service";
import { sendWorkshopBuiltEmail } from "@/services/notifications";
import { inngest } from "@/inngest/client";

// Force module load so createFunction captures the handler
import "@/inngest/functions/auto-build-workshop";

const mockStep = {
  run: jest.fn(async (_name: string, fn: () => Promise<unknown>) => fn()),
  sleepUntil: jest.fn(),
  sleep: jest.fn(),
  sendEvent: jest.fn(),
};

describe("Auto-build with no active templates", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Idempotency check passes (status not yet advanced)
    (db.landingPage.findMany as jest.Mock).mockResolvedValueOnce([]);
    (db.workshop.findUnique as jest.Mock).mockResolvedValueOnce({ status: "AWAITING_APPROVAL" });
  });

  it("does NOT advance status to PRE_EVENT when no templates exist", async () => {
    (runAutoBuild as jest.Mock).mockResolvedValueOnce({
      success: false,
      pagesCreated: 0,
      templates: [],
      status: "AWAITING_APPROVAL",
      preEventWorkflow: null,
      postEventWorkflow: null,
      error: "No active PageTemplates found.",
    });

    const result = await capturedHandler({
      event: { data: { workshopId: "ws-1" }, name: "workshop/approved" },
      step: mockStep,
    });

    expect(result).toMatchObject({
      workshopId: "ws-1",
      status: "AWAITING_APPROVAL",
      pagesCreated: 0,
    });
  });

  it("does NOT send coach email when no pages created", async () => {
    (runAutoBuild as jest.Mock).mockResolvedValueOnce({
      success: false,
      pagesCreated: 0,
      templates: [],
      status: "AWAITING_APPROVAL",
      preEventWorkflow: null,
      postEventWorkflow: null,
      error: "No active PageTemplates found.",
    });

    await capturedHandler({
      event: { data: { workshopId: "ws-1" }, name: "workshop/approved" },
      step: mockStep,
    });

    // sendWorkshopBuiltEmail is inside runAutoBuild (mocked) — should not be called separately
    expect(sendWorkshopBuiltEmail).not.toHaveBeenCalled();
  });

  it("does NOT assign workflows when no pages created", async () => {
    (runAutoBuild as jest.Mock).mockResolvedValueOnce({
      success: false,
      pagesCreated: 0,
      templates: [],
      status: "AWAITING_APPROVAL",
      preEventWorkflow: null,
      postEventWorkflow: null,
      error: "No active PageTemplates found.",
    });

    await capturedHandler({
      event: { data: { workshopId: "ws-1" }, name: "workshop/approved" },
      step: mockStep,
    });

    // Workflow scheduling is inside runAutoBuild (mocked) — Inngest.send should not be called
    expect(inngest.send).not.toHaveBeenCalled();
  });
});
