jest.mock("@/lib/db", () => ({
  db: {
    $transaction: jest.fn(),
  },
}));

import { db } from "@/lib/db";
import { createWorkshopRegistration } from "@/lib/registration-service";

const mockTx = {
  workshop: {
    findUnique: jest.fn(),
  },
  registration: {
    count: jest.fn(),
    findFirst: jest.fn(),
    create: jest.fn(),
    findUnique: jest.fn(),
  },
};

function makeWorkshop(overrides: Record<string, unknown> = {}) {
  return {
    id: "ws-1",
    status: "PRE_EVENT",
    maxAttendees: 25,
    isFree: false,
    ...overrides,
  };
}

function makeInput(overrides: Record<string, unknown> = {}) {
  return {
    workshopId: "ws-1",
    email: "USER@EXAMPLE.COM",
    firstName: "Alex",
    lastName: "Rivera",
    ...overrides,
  };
}

describe("registration-service", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (db.$transaction as unknown as jest.Mock).mockImplementation(
      async (callback: (tx: unknown) => Promise<unknown>) => callback(mockTx)
    );
  });

  it("returns WORKSHOP_NOT_FOUND when workshop does not exist", async () => {
    mockTx.workshop.findUnique.mockResolvedValue(null);

    await expect(createWorkshopRegistration(makeInput())).rejects.toMatchObject({
      code: "WORKSHOP_NOT_FOUND",
      status: 404,
    });
  });

  it("returns WORKSHOP_CLOSED when status is not registration-open", async () => {
    mockTx.workshop.findUnique.mockResolvedValue(makeWorkshop({ status: "INFO_REQUESTED" }));

    await expect(createWorkshopRegistration(makeInput())).rejects.toMatchObject({
      code: "WORKSHOP_CLOSED",
      status: 400,
    });
  });

  it("returns WORKSHOP_FULL when active registration count hits capacity", async () => {
    mockTx.workshop.findUnique.mockResolvedValue(makeWorkshop({ maxAttendees: 2 }));
    mockTx.registration.count.mockResolvedValue(2);

    await expect(createWorkshopRegistration(makeInput())).rejects.toMatchObject({
      code: "WORKSHOP_FULL",
      status: 400,
    });
  });

  it("returns DUPLICATE_REGISTRATION when attendee already exists", async () => {
    mockTx.workshop.findUnique.mockResolvedValue(makeWorkshop());
    mockTx.registration.count.mockResolvedValue(1);
    mockTx.registration.findFirst.mockResolvedValue({ id: "reg-existing" });

    await expect(createWorkshopRegistration(makeInput())).rejects.toMatchObject({
      code: "DUPLICATE_REGISTRATION",
      status: 409,
    });
  });

  it("creates paid registration with normalized lowercase email", async () => {
    mockTx.workshop.findUnique.mockResolvedValue(makeWorkshop({ isFree: false }));
    mockTx.registration.count.mockResolvedValue(0);
    mockTx.registration.findFirst.mockResolvedValue(null);
    mockTx.registration.create.mockResolvedValue({
      id: "reg-1",
      email: "user@example.com",
      workshopId: "ws-1",
      paymentStatus: "PENDING",
      status: "REGISTERED",
    });

    const result = await createWorkshopRegistration(makeInput());

    expect(mockTx.registration.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          email: "user@example.com",
          paymentStatus: "PENDING",
        }),
      })
    );
    expect(result.registration).toMatchObject({
      id: "reg-1",
      email: "user@example.com",
    });
  });

  it("returns workshop details when includeWorkshopDetails is enabled", async () => {
    mockTx.workshop.findUnique.mockResolvedValue(makeWorkshop({ isFree: true }));
    mockTx.registration.count.mockResolvedValue(0);
    mockTx.registration.findFirst.mockResolvedValue(null);
    mockTx.registration.create.mockResolvedValue({
      id: "reg-1",
      email: "user@example.com",
      workshopId: "ws-1",
    });
    mockTx.registration.findUnique.mockResolvedValue({
      id: "reg-1",
      email: "user@example.com",
      workshopId: "ws-1",
      workshop: {
        id: "ws-1",
        title: "Scaling Up",
        workshopType: { id: "wt-1", name: "Scaling Up", slug: "scaling-up" },
        coach: {
          id: "coach-1",
          firstName: "John",
          lastName: "Smith",
          email: "coach@example.com",
        },
      },
    });

    const result = await createWorkshopRegistration(makeInput(), {
      includeWorkshopDetails: true,
    });

    expect(mockTx.registration.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "reg-1" },
      })
    );
    expect(result.registration).toHaveProperty("workshop.title", "Scaling Up");
  });
});
