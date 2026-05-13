/* eslint-disable @typescript-eslint/no-explicit-any */

/**
 * Tests for processPaymentCompleted Inngest function (Stripe webhook fix v5).
 *
 * Coverage:
 *   - function-level idempotency (paymentProcessedAt skip)
 *   - HubSpot step idempotency (hubspotContactId skip)
 *   - Atomic notification claim (claim wins / claim loses)
 *   - Strict notification rollback on SMTP failure
 *   - Mark-processed final step
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
    registration: {
      findUnique: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
    },
  },
}));

jest.mock("@/services/hubspot", () => ({
  createOrUpdateContact: jest.fn(),
}));

jest.mock("@/services/notifications", () => ({
  sendPaidRegistrationNotificationStrict: jest.fn(),
}));

jest.mock("@/lib/ics-generator", () => ({
  generateIcsContent: jest.fn().mockReturnValue("BEGIN:VCALENDAR\nEND:VCALENDAR"),
  parseDurationHours: jest.fn().mockReturnValue(2),
  parseDurationHoursFromEvent: jest.fn().mockReturnValue(2),
  buildLocationString: jest.fn().mockReturnValue("Virtual"),
}));

// ---- Imports (after mocks) ----

import { db } from "@/lib/db";
import { createOrUpdateContact } from "@/services/hubspot";
import { sendPaidRegistrationNotificationStrict } from "@/services/notifications";

// Force module load so createFunction captures the handler
import "@/inngest/functions/process-payment-completed";

// ---- Helpers ----

const mockStep = {
  run: jest.fn(async (_name: string, fn: () => Promise<unknown>) => fn()),
  sleepUntil: jest.fn(),
  sleep: jest.fn(),
  sendEvent: jest.fn(),
};

function makeEvent(registrationId = "reg-1") {
  return {
    data: { registrationId, source: "checkout.session.completed" as const },
    name: "registration/payment-completed" as const,
  };
}

function makeReg(overrides: Record<string, unknown> = {}) {
  return {
    id: "reg-1",
    email: "user@example.com",
    firstName: "Ari",
    lastName: "Stone",
    company: "Scaling Up",
    jobTitle: "CEO",
    phone: "555-0001",
    paymentProcessedAt: null,
    notificationSentAt: null,
    hubspotContactId: null,
    workshop: {
      id: "ws-1",
      title: "Scaling Up Workshop",
      workshopCode: "WS-2026-TEST",
      description: "Test workshop",
      eventDate: new Date("2026-06-01T10:00:00.000Z"),
      eventTime: "10:00",
      timezone: "America/New_York",
      duration: "2 hours",
      format: "VIRTUAL",
      virtualLink: "https://zoom.us/j/123",
      venueName: null,
      venueAddress: null,
      coach: {
        firstName: "Coach",
        lastName: "Smith",
        email: "coach@example.com",
      },
    },
    ...overrides,
  };
}

// ---- Tests ----

describe("processPaymentCompleted Inngest function", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    process.env.HUBSPOT_ACCESS_TOKEN = "test-hubspot-token";
  });

  afterEach(() => {
    delete process.env.HUBSPOT_ACCESS_TOKEN;
  });

  it("captures the handler via createFunction (called at import time)", () => {
    expect(typeof capturedHandler).toBe("function");
  });

  // ===== Slice 7: skeleton + function-level idempotency =====

  it("returns skipped:not-found when registration doesn't exist", async () => {
    (db.registration.findUnique as jest.Mock).mockResolvedValue(null);

    const result = await (capturedHandler as any)({ event: makeEvent(), step: mockStep });

    expect(result).toEqual({ skipped: true, reason: "not-found" });
    // No subsequent steps called
    expect(createOrUpdateContact).not.toHaveBeenCalled();
    expect(sendPaidRegistrationNotificationStrict).not.toHaveBeenCalled();
    expect(db.registration.update).not.toHaveBeenCalled();
  });

  it("v5 idempotency: returns skipped:already-processed when paymentProcessedAt is set", async () => {
    (db.registration.findUnique as jest.Mock).mockResolvedValue(
      makeReg({ paymentProcessedAt: new Date("2026-04-29T15:00:00Z") })
    );

    const result = await (capturedHandler as any)({ event: makeEvent(), step: mockStep });

    expect(result).toEqual({ skipped: true, reason: "already-processed" });
    expect(createOrUpdateContact).not.toHaveBeenCalled();
    expect(sendPaidRegistrationNotificationStrict).not.toHaveBeenCalled();
    expect(db.registration.update).not.toHaveBeenCalled();
  });

  // ===== Slice 8: HubSpot step idempotent =====

  it("HubSpot step: syncs when hubspotContactId is null", async () => {
    (db.registration.findUnique as jest.Mock).mockResolvedValue(makeReg());
    (createOrUpdateContact as jest.Mock).mockResolvedValue("hs_contact_123");
    (db.registration.update as jest.Mock).mockResolvedValue({});
    (db.registration.updateMany as jest.Mock).mockResolvedValue({ count: 1 });
    (sendPaidRegistrationNotificationStrict as jest.Mock).mockResolvedValue(undefined);

    await (capturedHandler as any)({ event: makeEvent(), step: mockStep });

    expect(createOrUpdateContact).toHaveBeenCalledWith(
      expect.objectContaining({
        email: "user@example.com",
        workshop_name: "Scaling Up Workshop",
      })
    );
    // Persists the hubspotContactId
    expect(db.registration.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "reg-1" },
        data: { hubspotContactId: "hs_contact_123" },
      })
    );
  });

  it("HubSpot step: SKIPS when hubspotContactId is already set", async () => {
    (db.registration.findUnique as jest.Mock).mockResolvedValue(
      makeReg({ hubspotContactId: "hs_existing" })
    );
    (db.registration.updateMany as jest.Mock).mockResolvedValue({ count: 1 });
    (sendPaidRegistrationNotificationStrict as jest.Mock).mockResolvedValue(undefined);
    (db.registration.update as jest.Mock).mockResolvedValue({});

    await (capturedHandler as any)({ event: makeEvent(), step: mockStep });

    expect(createOrUpdateContact).not.toHaveBeenCalled();
  });

  // ===== Slice 10: Atomic notification claim =====

  it("notification: atomic claim WINS — sends email + sets notificationSentAt", async () => {
    (db.registration.findUnique as jest.Mock).mockResolvedValue(
      makeReg({ hubspotContactId: "hs_existing" })
    );
    (db.registration.updateMany as jest.Mock).mockResolvedValueOnce({ count: 1 }); // claim wins
    (sendPaidRegistrationNotificationStrict as jest.Mock).mockResolvedValue(undefined);
    (db.registration.update as jest.Mock).mockResolvedValue({});

    await (capturedHandler as any)({ event: makeEvent(), step: mockStep });

    // Claim updateMany called BEFORE the SMTP send
    expect(db.registration.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "reg-1", notificationSentAt: null },
        data: expect.objectContaining({ notificationSentAt: expect.any(Date) }),
      })
    );
    expect(sendPaidRegistrationNotificationStrict).toHaveBeenCalled();
  });

  it("notification: atomic claim LOSES — does NOT send email, returns already-sent", async () => {
    (db.registration.findUnique as jest.Mock).mockResolvedValue(
      makeReg({ hubspotContactId: "hs_existing" })
    );
    (db.registration.updateMany as jest.Mock).mockResolvedValueOnce({ count: 0 }); // claim lost
    (db.registration.update as jest.Mock).mockResolvedValue({});

    await (capturedHandler as any)({ event: makeEvent(), step: mockStep });

    // SMTP was NOT attempted
    expect(sendPaidRegistrationNotificationStrict).not.toHaveBeenCalled();
  });

  // ===== Slice 11: Notification rollback on SMTP failure =====

  it("notification: SMTP failure rolls back the claim and rethrows so Inngest retries", async () => {
    (db.registration.findUnique as jest.Mock).mockResolvedValue(
      makeReg({ hubspotContactId: "hs_existing" })
    );
    (db.registration.updateMany as jest.Mock)
      .mockResolvedValueOnce({ count: 1 }) // claim wins
      .mockResolvedValueOnce({ count: 1 }); // rollback
    (sendPaidRegistrationNotificationStrict as jest.Mock).mockRejectedValue(
      new Error("SMTP timeout")
    );

    await expect(
      (capturedHandler as any)({ event: makeEvent(), step: mockStep })
    ).rejects.toThrow("SMTP timeout");

    // Claim acquired
    expect(db.registration.updateMany).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        where: { id: "reg-1", notificationSentAt: null },
        data: expect.objectContaining({ notificationSentAt: expect.any(Date) }),
      })
    );
    // Rollback called with claim's timestamp scope
    expect(db.registration.updateMany).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        where: expect.objectContaining({
          id: "reg-1",
          notificationSentAt: expect.any(Date),
        }),
        data: { notificationSentAt: null },
      })
    );
  });

  // ===== Slice 12: Mark-processed final step =====

  it("happy path: full chain + sets paymentProcessedAt at the end", async () => {
    (db.registration.findUnique as jest.Mock).mockResolvedValue(makeReg());
    (createOrUpdateContact as jest.Mock).mockResolvedValue("hs_new");
    (db.registration.updateMany as jest.Mock).mockResolvedValue({ count: 1 });
    (sendPaidRegistrationNotificationStrict as jest.Mock).mockResolvedValue(undefined);
    (db.registration.update as jest.Mock).mockResolvedValue({});

    const result = await (capturedHandler as any)({ event: makeEvent(), step: mockStep });

    expect(result).toEqual({ processed: true, registrationId: "reg-1" });

    // mark-processed called with paymentProcessedAt
    const updateCalls = (db.registration.update as jest.Mock).mock.calls;
    const markProcessed = updateCalls.find(
      (call) => call[0]?.data?.paymentProcessedAt
    );
    expect(markProcessed).toBeDefined();
    expect(markProcessed[0]).toEqual(
      expect.objectContaining({
        where: { id: "reg-1" },
        data: { paymentProcessedAt: expect.any(Date) },
      })
    );
  });
});
