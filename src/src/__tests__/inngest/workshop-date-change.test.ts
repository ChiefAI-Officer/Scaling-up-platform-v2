/**
 * Unit tests for workshop-date-change Inngest function
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
  },
}));

jest.mock("@/lib/db", () => ({
  db: {
    workshop: { findUnique: jest.fn() },
  },
}));

jest.mock("@/services/notifications", () => ({
  sendWorkshopDateChangeEmail: jest.fn().mockResolvedValue(undefined),
}));

jest.mock("@/lib/ics-generator", () => ({
  parseDurationHoursFromEvent: jest.fn().mockReturnValue(8),
}));

import { db } from "@/lib/db";
import { sendWorkshopDateChangeEmail } from "@/services/notifications";
import "@/inngest/functions/workshop-date-change";

const mockStep = {
  run: jest.fn(async (_name: string, fn: () => Promise<unknown>) => fn()),
};

const baseWorkshop = {
  id: "ws-1",
  title: "Test Workshop",
  workshopCode: "WS-2026-AAA1",
  eventDate: new Date("2026-05-01T00:00:00.000Z"),
  eventTime: "09:00 - 17:00",
  timezone: "America/New_York",
  virtualLink: null,
  venueName: null,
  venueAddress: null,
  format: "IN_PERSON",
  duration: "8",
  landingPageSlug: "test-workshop",
  coach: { firstName: "Jane", lastName: "Smith", email: "jane@example.com" },
};

describe("workshopDateChange Inngest function", () => {
  beforeEach(() => jest.clearAllMocks());

  it("captures the handler at import time", () => {
    expect(typeof capturedHandler).toBe("function");
  });

  it("fetches workshop and delegates to sendWorkshopDateChangeEmail", async () => {
    (db.workshop.findUnique as jest.Mock).mockResolvedValueOnce(baseWorkshop);

    const result = await (capturedHandler as (arg: unknown) => Promise<unknown>)({
      event: { data: { workshopId: "ws-1" } },
      step: mockStep,
    });

    expect(db.workshop.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "ws-1" },
        include: expect.objectContaining({ coach: expect.any(Object) }),
      })
    );
    expect(sendWorkshopDateChangeEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        workshopId: "ws-1",
        workshopTitle: "Test Workshop",
        coachName: "Jane Smith",
        coachEmail: "jane@example.com",
      })
    );
    expect(result).toMatchObject({ workshopId: "ws-1", dispatched: true });
  });

  it("throws when workshop not found", async () => {
    (db.workshop.findUnique as jest.Mock).mockResolvedValueOnce(null);

    await expect(
      (capturedHandler as (arg: unknown) => Promise<unknown>)({
        event: { data: { workshopId: "missing" } },
        step: mockStep,
      })
    ).rejects.toThrow("Workshop missing not found");
    expect(sendWorkshopDateChangeEmail).not.toHaveBeenCalled();
  });

  it("throws when workshop has no coach", async () => {
    (db.workshop.findUnique as jest.Mock).mockResolvedValueOnce({ ...baseWorkshop, coach: null });

    await expect(
      (capturedHandler as (arg: unknown) => Promise<unknown>)({
        event: { data: { workshopId: "ws-1" } },
        step: mockStep,
      })
    ).rejects.toThrow("has no coach");
    expect(sendWorkshopDateChangeEmail).not.toHaveBeenCalled();
  });
});
