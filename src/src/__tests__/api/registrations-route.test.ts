jest.mock("next/server", () => ({
  NextResponse: {
    json: (body: unknown, init?: ResponseInit) =>
      new Response(JSON.stringify(body), {
        status: init?.status || 200,
        headers: init?.headers,
      }),
  },
}));

jest.mock("@/lib/db", () => ({
  db: {
    registration: {
      findUnique: jest.fn(),
      update: jest.fn(),
    },
  },
}));

jest.mock("@/lib/auth/authorization", () => ({
  getApiActor: jest.fn(),
  canManageCoachData: jest.fn(),
}));

jest.mock("@/services/stripe", () => ({
  processRefund: jest.fn(),
}));

import { DELETE } from "@/app/api/registrations/[id]/route";
import { db } from "@/lib/db";
import { canManageCoachData, getApiActor } from "@/lib/auth/authorization";
import { processRefund } from "@/services/stripe";

function routeParams(id = "reg-1") {
  return { params: Promise.resolve({ id }) };
}

const baseRegistration = {
  id: "reg-1",
  paymentStatus: "FREE",
  stripePaymentId: null,
  status: "REGISTERED",
  workshop: {
    id: "ws-1",
    coachId: "coach-1",
    title: "Workshop",
  },
};

describe("DELETE /api/registrations/[id]", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (getApiActor as jest.Mock).mockResolvedValue({
      userId: "coach-user",
      email: "coach@example.com",
      role: "COACH",
      coachId: "coach-1",
    });
    (canManageCoachData as jest.Mock).mockReturnValue(true);
    (db.registration.findUnique as jest.Mock).mockResolvedValue(baseRegistration);
    (db.registration.update as jest.Mock).mockResolvedValue({});
    (processRefund as jest.Mock).mockResolvedValue({ id: "refund-1" });
  });

  it("blocks coaches from directly deleting paid registrations", async () => {
    (db.registration.findUnique as jest.Mock).mockResolvedValue({
      ...baseRegistration,
      paymentStatus: "COMPLETED",
      stripePaymentId: "pi_123",
    });

    const response = await DELETE({} as Parameters<typeof DELETE>[0], routeParams());
    const body = await response.json();

    expect(response.status).toBe(409);
    expect(body.error).toContain("admin review");
    expect(processRefund).not.toHaveBeenCalled();
    expect(db.registration.update).not.toHaveBeenCalled();
  });

  it("allows direct deletion for free registrations", async () => {
    const response = await DELETE({} as Parameters<typeof DELETE>[0], routeParams());
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.success).toBe(true);
    expect(db.registration.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "reg-1" },
        data: expect.objectContaining({
          status: "CANCELLED",
          paymentStatus: "FREE",
        }),
      })
    );
  });

  it("allows admins to directly refund and cancel paid registrations", async () => {
    (getApiActor as jest.Mock).mockResolvedValue({
      userId: "admin-user",
      email: "admin@example.com",
      role: "ADMIN",
      coachId: null,
    });
    (db.registration.findUnique as jest.Mock).mockResolvedValue({
      ...baseRegistration,
      paymentStatus: "COMPLETED",
      stripePaymentId: "pi_123",
    });

    const mockRequest = {
      nextUrl: { searchParams: new URLSearchParams() },
    } as unknown as Parameters<typeof DELETE>[0];
    const response = await DELETE(mockRequest, routeParams());
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.refundId).toBe("refund-1");
    expect(processRefund).toHaveBeenCalledWith("pi_123");
    expect(db.registration.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "reg-1" },
        data: expect.objectContaining({
          status: "CANCELLED",
          paymentStatus: "REFUNDED",
        }),
      })
    );
  });
});
