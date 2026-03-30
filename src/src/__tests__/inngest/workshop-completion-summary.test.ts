/**
 * Unit tests for workshop-completion-summary Inngest function
 *
 * Tests the completion summary flow triggered on "workshop/completed":
 * - Summary building with attendee list + revenue
 * - Email notification via sendWorkshopCompletionSummary
 * - Edge cases: zero registrations, paid vs free, attendance tracking
 */

// ---------------------------------------------------------------------------
// Mocks — must be defined BEFORE imports that reference them
// ---------------------------------------------------------------------------

// eslint-disable-next-line no-var
var capturedHandler: (...args: unknown[]) => unknown;
jest.mock("@/inngest/client", () => ({
  inngest: {
    createFunction: jest.fn((_config: unknown, _trigger: unknown, handler: (...args: unknown[]) => unknown) => {
      capturedHandler = handler;
      return handler;
    }),
  },
}));

jest.mock("@/lib/db", () => ({
  db: {
    workshop: {
      findUnique: jest.fn(),
    },
  },
}));

jest.mock("@/services/notifications", () => ({
  sendWorkshopCompletionSummary: jest.fn().mockResolvedValue(undefined),
}));

// ---------------------------------------------------------------------------
// Imports (after mocks are registered)
// ---------------------------------------------------------------------------

import { db } from "@/lib/db";
import { sendWorkshopCompletionSummary } from "@/services/notifications";
// Importing the module triggers inngest.createFunction, which captures the handler
import "@/inngest/functions/workshop-completion-summary";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const mockStep = {
  run: jest.fn(async (_name: string, fn: () => Promise<unknown>) => fn()),
};

function createEvent(workshopId = "ws-done-1") {
  return {
    name: "workshop/completed" as const,
    data: { workshopId },
  };
}

function createWorkshopWithRegistrations(
  registrations: Array<{
    firstName: string;
    lastName: string;
    email: string;
    company: string | null;
    paymentStatus: string;
    amountPaidCents: number | null;
    attended: boolean;
  }> = []
) {
  return {
    id: "ws-done-1",
    title: "Scaling Up Masterclass",
    workshopCode: "SU-MC-001",
    eventDate: new Date("2026-05-01T09:00:00Z"),
    coach: {
      firstName: "Jane",
      lastName: "Doe",
      email: "jane@example.com",
    },
    registrations,
  };
}

function sampleRegistrations() {
  return [
    {
      firstName: "Alice",
      lastName: "Adams",
      email: "alice@example.com",
      company: "Acme Inc",
      paymentStatus: "COMPLETED",
      amountPaidCents: 49900,
      attended: true,
    },
    {
      firstName: "Bob",
      lastName: "Brown",
      email: "bob@example.com",
      company: "Beta Corp",
      paymentStatus: "COMPLETED",
      amountPaidCents: 49900,
      attended: true,
    },
    {
      firstName: "Carol",
      lastName: "Clark",
      email: "carol@example.com",
      company: null,
      paymentStatus: "FREE",
      amountPaidCents: 0,
      attended: false,
    },
  ];
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("workshop-completion-summary Inngest function", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockStep.run.mockImplementation(
      async (_name: string, fn: () => Promise<unknown>) => fn()
    );
  });

  it("builds summary with attendees and revenue, sends email", async () => {
    const regs = sampleRegistrations();
    (db.workshop.findUnique as jest.Mock).mockResolvedValue(
      createWorkshopWithRegistrations(regs)
    );

    const result = await capturedHandler({
      event: createEvent(),
      step: mockStep,
    });

    expect(result).toEqual({
      workshopId: "ws-done-1",
      totalRegistrations: 3,
      totalRevenueCents: 99800,
    });
    expect(sendWorkshopCompletionSummary).toHaveBeenCalledTimes(1);
  });

  it("throws error when workshop not found", async () => {
    (db.workshop.findUnique as jest.Mock).mockResolvedValue(null);

    await expect(
      capturedHandler({ event: createEvent(), step: mockStep })
    ).rejects.toThrow("Workshop ws-done-1 not found");
  });

  it("sends summary with empty attendee list when zero registrations", async () => {
    (db.workshop.findUnique as jest.Mock).mockResolvedValue(
      createWorkshopWithRegistrations([])
    );

    const result = await capturedHandler({
      event: createEvent(),
      step: mockStep,
    });

    expect(result).toEqual({
      workshopId: "ws-done-1",
      totalRegistrations: 0,
      totalRevenueCents: 0,
    });
    expect(sendWorkshopCompletionSummary).toHaveBeenCalledWith(
      expect.objectContaining({
        attendees: [],
        totalRegistrations: 0,
      })
    );
  });

  it("correctly sums amountPaidCents for revenue calculation", async () => {
    const regs = [
      {
        firstName: "A",
        lastName: "One",
        email: "a@test.com",
        company: null,
        paymentStatus: "COMPLETED",
        amountPaidCents: 25000,
        attended: true,
      },
      {
        firstName: "B",
        lastName: "Two",
        email: "b@test.com",
        company: null,
        paymentStatus: "COMPLETED",
        amountPaidCents: 30000,
        attended: true,
      },
      {
        firstName: "C",
        lastName: "Three",
        email: "c@test.com",
        company: null,
        paymentStatus: "FREE",
        amountPaidCents: null,
        attended: false,
      },
    ];
    (db.workshop.findUnique as jest.Mock).mockResolvedValue(
      createWorkshopWithRegistrations(regs)
    );

    const result = await capturedHandler({
      event: createEvent(),
      step: mockStep,
    });

    expect(result.totalRevenueCents).toBe(55000);
  });

  it("counts attended vs total registrations", async () => {
    const regs = sampleRegistrations(); // 2 attended, 1 not
    (db.workshop.findUnique as jest.Mock).mockResolvedValue(
      createWorkshopWithRegistrations(regs)
    );

    await capturedHandler({ event: createEvent(), step: mockStep });

    expect(sendWorkshopCompletionSummary).toHaveBeenCalledWith(
      expect.objectContaining({
        totalRegistrations: 3,
        attended: 2,
      })
    );
  });

  it("correctly categorizes paid vs free registrations", async () => {
    const regs = sampleRegistrations(); // 2 COMPLETED, 1 FREE
    (db.workshop.findUnique as jest.Mock).mockResolvedValue(
      createWorkshopWithRegistrations(regs)
    );

    await capturedHandler({ event: createEvent(), step: mockStep });

    expect(sendWorkshopCompletionSummary).toHaveBeenCalledWith(
      expect.objectContaining({
        paidCount: 2,
        freeCount: 1,
      })
    );
  });

  it("return value includes workshopId, totalRegistrations, totalRevenueCents", async () => {
    const regs = sampleRegistrations();
    (db.workshop.findUnique as jest.Mock).mockResolvedValue(
      createWorkshopWithRegistrations(regs)
    );

    const result = await capturedHandler({
      event: createEvent(),
      step: mockStep,
    });

    expect(result).toHaveProperty("workshopId", "ws-done-1");
    expect(result).toHaveProperty("totalRegistrations", 3);
    expect(result).toHaveProperty("totalRevenueCents", 99800);
  });

  it("calls sendWorkshopCompletionSummary with correct summary shape", async () => {
    const regs = sampleRegistrations();
    (db.workshop.findUnique as jest.Mock).mockResolvedValue(
      createWorkshopWithRegistrations(regs)
    );

    await capturedHandler({ event: createEvent(), step: mockStep });

    expect(sendWorkshopCompletionSummary).toHaveBeenCalledWith({
      workshopId: "ws-done-1",
      workshopTitle: "Scaling Up Masterclass",
      workshopCode: "SU-MC-001",
      eventDate: "2026-05-01T09:00:00.000Z",
      coachName: "Jane Doe",
      totalRegistrations: 3,
      attended: 2,
      paidCount: 2,
      freeCount: 1,
      totalRevenueCents: 99800,
      attendees: [
        {
          name: "Alice Adams",
          email: "alice@example.com",
          company: "Acme Inc",
          paid: true,
          amount: 49900,
          attended: true,
        },
        {
          name: "Bob Brown",
          email: "bob@example.com",
          company: "Beta Corp",
          paid: true,
          amount: 49900,
          attended: true,
        },
        {
          name: "Carol Clark",
          email: "carol@example.com",
          company: "",
          paid: false,
          amount: 0,
          attended: false,
        },
      ],
    });
  });

  it("invokes step.run for each step name", async () => {
    const regs = sampleRegistrations();
    (db.workshop.findUnique as jest.Mock).mockResolvedValue(
      createWorkshopWithRegistrations(regs)
    );

    await capturedHandler({ event: createEvent(), step: mockStep });

    const stepNames = mockStep.run.mock.calls.map(
      (c: unknown[]) => c[0]
    );
    expect(stepNames).toEqual(["build-summary", "send-summary-email"]);
  });
});
