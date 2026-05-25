/**
 * Tests for schedule-emails Inngest function.
 * Focused on the venue_address variable passed to the "1 day before" email:
 * it must be a formatted string, not a raw JSON blob.
 */

/* eslint-disable @typescript-eslint/no-explicit-any */

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
  },
}));

jest.mock("@/lib/db", () => ({
  db: {
    workshop: {
      findUnique: jest.fn(),
    },
  },
}));

jest.mock("@/services/email-sender", () => ({
  sendEmailTemplate: jest.fn().mockResolvedValue(undefined),
}));

// ---- Imports (after mocks) ----

import { db } from "@/lib/db";
import { sendEmailTemplate } from "@/services/email-sender";

// Force module load so createFunction captures the handler
import "@/inngest/functions/schedule-emails";

// ---- Helpers ----

function makeStep(workshopOverrides: Record<string, unknown> = {}) {
  const mockWorkshop = {
    id: "ws-1",
    title: "Scaling Up Workshop",
    eventDate: new Date(Date.now() + 10 * 24 * 60 * 60 * 1000), // 10 days from now
    venueName: "Main Hall",
    venueAddress: JSON.stringify({ street: "123 Main St", city: "Austin", state: "TX", zip: "78701" }),
    coach: { firstName: "Jane", lastName: "Coach" },
    workshopType: null,
    ...workshopOverrides,
  };

  (db.workshop.findUnique as jest.Mock).mockResolvedValue(mockWorkshop);

  return {
    run: jest.fn(async (_name: string, fn: () => Promise<unknown>) => fn()),
    sleepUntil: jest.fn().mockResolvedValue(undefined),
  };
}

function makeEvent(workshopId = "ws-1") {
  return {
    data: {
      registrationId: "reg-1",
      workshopId,
      email: "attendee@example.com",
      firstName: "Alex",
    },
  };
}

// ---- Tests ----

describe("schedule-emails: venue_address formatting", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("passes a formatted address string (not raw JSON) to the 1-day-before email", async () => {
    const step = makeStep({
      venueAddress: JSON.stringify({ street: "123 Main St", city: "Austin", state: "TX", zip: "78701" }),
    });

    await capturedHandler({ event: makeEvent(), step });

    const calls = (sendEmailTemplate as jest.Mock).mock.calls;
    const oneDayBeforeCall = calls.find(
      ([arg]: [{ templateId: string }]) => arg.templateId === "pre-event-1-day"
    );
    expect(oneDayBeforeCall).toBeDefined();
    const variables = oneDayBeforeCall[0].variables;
    expect(variables.venue_address).toBe("123 Main St, Austin, TX 78701");
    // Must NOT be a raw JSON string
    expect(variables.venue_address).not.toMatch(/^\{/);
  });

  it("falls back to the default message when venueAddress is null", async () => {
    const step = makeStep({ venueAddress: null });

    await capturedHandler({ event: makeEvent(), step });

    const calls = (sendEmailTemplate as jest.Mock).mock.calls;
    const oneDayBeforeCall = calls.find(
      ([arg]: [{ templateId: string }]) => arg.templateId === "pre-event-1-day"
    );
    expect(oneDayBeforeCall).toBeDefined();
    expect(oneDayBeforeCall[0].variables.venue_address).toBe(
      "See registration confirmation for details"
    );
  });
});
