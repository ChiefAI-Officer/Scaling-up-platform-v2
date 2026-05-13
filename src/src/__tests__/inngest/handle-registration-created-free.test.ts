/**
 * Wave 13-A: handleRegistrationCreatedFree Inngest handler tests.
 *
 * Tests use the same pattern as process-payment-completed.test.ts:
 * capture the inner handler via jest.fn() on inngest.createFunction, then
 * call it directly with a mock step and event.
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
    send: jest.fn(),
  },
}));

jest.mock("@/lib/db", () => ({
  db: {
    registration: {
      findUnique: jest.fn(),
      updateMany: jest.fn(),
    },
  },
}));

jest.mock("@/services/notifications", () => ({
  sendPaidRegistrationNotificationStrict: jest.fn(),
}));

jest.mock("@/lib/ics-generator", () => ({
  generateIcsContent: jest.fn().mockReturnValue("BEGIN:VCALENDAR\nEND:VCALENDAR"),
  buildLocationString: jest.fn().mockReturnValue("Virtual"),
  parseDurationHoursFromEvent: jest.fn().mockReturnValue(8),
}));

// ---- Imports (after mocks) ----

import { db } from "@/lib/db";
import { sendPaidRegistrationNotificationStrict } from "@/services/notifications";

// Force module load so createFunction captures the handler
import "@/inngest/functions/handle-registration-created-free";

// ---- Helpers ----

const mockStep = {
  run: jest.fn(async (_name: string, fn: () => Promise<unknown>) => fn()),
};

function makeEvent(registrationId = "reg-free-1") {
  return {
    data: {
      registrationId,
      workshopId: "ws-1",
      email: "attendee@example.com",
      firstName: "Jane",
    },
    name: "registration/created" as const,
  };
}

const AFTER_CUTOFF = new Date("2026-05-13T00:00:00.000Z");
const BEFORE_CUTOFF = new Date("2026-05-11T12:00:00.000Z");

function makeReg(overrides: Record<string, unknown> = {}) {
  return {
    id: "reg-free-1",
    email: "attendee@example.com",
    firstName: "Jane",
    lastName: "Doe",
    company: "Acme",
    paymentStatus: "FREE",
    notificationSentAt: null,
    createdAt: AFTER_CUTOFF,
    workshop: {
      id: "ws-1",
      title: "Scaling Up Workshop",
      workshopCode: "WS-2026-ABCD",
      description: "A great workshop",
      eventDate: new Date("2026-06-01T00:00:00.000Z"),
      eventTime: "09:00 - 17:00",
      timezone: "America/New_York",
      duration: "Full Day",
      format: "IN_PERSON",
      virtualLink: null,
      venueName: "Marriott Downtown",
      venueAddress: '{"street":"123 Main St","city":"New York","state":"NY","zip":"10001"}',
      coach: {
        firstName: "Jeff",
        lastName: "Verdun",
        email: "jeff@scalingup.com",
      },
    },
    ...overrides,
  };
}

async function callHandler(registrationId = "reg-free-1") {
  return capturedHandler({ event: makeEvent(registrationId), step: mockStep });
}

// ---- Tests ----

describe("handleRegistrationCreatedFree (Wave 13-A)", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Default CUTOFF: well before our AFTER_CUTOFF fixture date
    process.env.REGISTRATION_HANDLER_CUTOFF_AT = "2026-05-12T00:00:00.000Z";
    // Default: updateMany claims successfully
    (db.registration.updateMany as jest.Mock).mockResolvedValue({ count: 1 });
  });

  afterEach(() => {
    delete process.env.REGISTRATION_HANDLER_CUTOFF_AT;
  });

  it("1. not_found — registration missing → returns skipped:not_found", async () => {
    (db.registration.findUnique as jest.Mock).mockResolvedValue(null);
    const result = await callHandler();
    expect(result).toEqual({ ok: true, skipped: "not_found" });
    expect(sendPaidRegistrationNotificationStrict).not.toHaveBeenCalled();
  });

  it("2. paid_path_handles — paymentStatus=PAID → returns skipped:paid_path_handles", async () => {
    (db.registration.findUnique as jest.Mock).mockResolvedValue(
      makeReg({ paymentStatus: "PAID" })
    );
    const result = await callHandler();
    expect(result).toEqual({ ok: true, skipped: "paid_path_handles" });
    expect(sendPaidRegistrationNotificationStrict).not.toHaveBeenCalled();
  });

  it("3. pre_cutoff — createdAt before CUTOFF → returns skipped:pre_cutoff", async () => {
    (db.registration.findUnique as jest.Mock).mockResolvedValue(
      makeReg({ createdAt: BEFORE_CUTOFF })
    );
    const result = await callHandler();
    expect(result).toEqual({ ok: true, skipped: "pre_cutoff" });
    expect(sendPaidRegistrationNotificationStrict).not.toHaveBeenCalled();
  });

  it("4. already_sent — notificationSentAt non-null → returns skipped:already_sent", async () => {
    (db.registration.findUnique as jest.Mock).mockResolvedValue(
      makeReg({ notificationSentAt: new Date() })
    );
    const result = await callHandler();
    expect(result).toEqual({ ok: true, skipped: "already_sent" });
    expect(sendPaidRegistrationNotificationStrict).not.toHaveBeenCalled();
  });

  it("5. race_lost — updateMany returns count:0 → returns skipped:race_lost", async () => {
    (db.registration.findUnique as jest.Mock).mockResolvedValue(makeReg());
    (db.registration.updateMany as jest.Mock).mockResolvedValue({ count: 0 });
    const result = await callHandler();
    expect(result).toEqual({ ok: true, skipped: "race_lost" });
    expect(sendPaidRegistrationNotificationStrict).not.toHaveBeenCalled();
  });

  it("6. FREE happy path — claims, sends notification with location fields, returns registrationId", async () => {
    (db.registration.findUnique as jest.Mock).mockResolvedValue(makeReg());
    (sendPaidRegistrationNotificationStrict as jest.Mock).mockResolvedValue(undefined);

    const result = await callHandler("reg-free-1");

    expect(result).toEqual({ ok: true, registrationId: "reg-free-1" });
    expect(db.registration.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "reg-free-1", notificationSentAt: null },
      })
    );
    expect(sendPaidRegistrationNotificationStrict).toHaveBeenCalledWith(
      expect.objectContaining({
        workshopTitle: "Scaling Up Workshop",
        registrantEmail: "attendee@example.com",
        registrantName: "Jane Doe",
        format: "IN_PERSON",
        venueName: "Marriott Downtown",
        venueAddress: '{"street":"123 Main St","city":"New York","state":"NY","zip":"10001"}',
        virtualLink: null,
        icsAttachment: expect.objectContaining({ filename: expect.stringContaining(".ics") }),
      })
    );
  });

  it("7. SMTP error rollback — sendPaidRegistrationNotificationStrict throws → rollback updateMany called, error rethrown", async () => {
    const smtpError = new Error("SMTP timeout");
    (db.registration.findUnique as jest.Mock).mockResolvedValue(makeReg());
    (sendPaidRegistrationNotificationStrict as jest.Mock).mockRejectedValue(smtpError);
    // Second updateMany is the rollback call
    (db.registration.updateMany as jest.Mock)
      .mockResolvedValueOnce({ count: 1 }) // claim
      .mockResolvedValueOnce({ count: 1 }); // rollback

    await expect(callHandler()).rejects.toThrow("SMTP timeout");

    // Rollback: second updateMany call sets notificationSentAt back to null
    expect(db.registration.updateMany).toHaveBeenCalledTimes(2);
    const rollbackCall = (db.registration.updateMany as jest.Mock).mock.calls[1][0];
    expect(rollbackCall.data).toEqual({ notificationSentAt: null });
  });

  it("8. Replay dedup — second invocation with notificationSentAt already set → skipped:already_sent", async () => {
    (db.registration.findUnique as jest.Mock).mockResolvedValue(
      makeReg({ notificationSentAt: new Date("2026-05-13T10:00:00.000Z") })
    );
    const result = await callHandler();
    expect(result).toEqual({ ok: true, skipped: "already_sent" });
    expect(sendPaidRegistrationNotificationStrict).not.toHaveBeenCalled();
    expect(db.registration.updateMany).not.toHaveBeenCalled();
  });
});
