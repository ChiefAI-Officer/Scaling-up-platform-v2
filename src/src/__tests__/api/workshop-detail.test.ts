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
    workshop: {
      findUnique: jest.fn(),
      update: jest.fn(),
    },
  },
}));

jest.mock("@/lib/authorization", () => ({
  getApiActor: jest.fn(),
  isPrivilegedRole: (role: string) => role === "ADMIN" || role === "STAFF",
  canManageCoachData: jest.fn(),
}));

jest.mock("@/services/stripe", () => ({
  chargeCancellationFee: jest.fn(),
}));

import { PATCH, DELETE } from "@/app/api/workshops/[id]/route";
import { db } from "@/lib/db";
import { getApiActor } from "@/lib/authorization";
import { chargeCancellationFee } from "@/services/stripe";

function routeParams(id = "ws-1") {
  return { params: Promise.resolve({ id }) };
}

function asPatchRequest(request: Request): Parameters<typeof PATCH>[0] {
  return request as unknown as Parameters<typeof PATCH>[0];
}

function buildDeleteRequest(body?: unknown): Parameters<typeof DELETE>[0] {
  return {
    text: async () =>
      body === undefined ? "" : JSON.stringify(body),
  } as unknown as Parameters<typeof DELETE>[0];
}

describe("Workshop detail API", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (getApiActor as jest.Mock).mockResolvedValue({
      userId: "admin-1",
      email: "admin@example.com",
      role: "ADMIN",
      coachId: null,
    });
  });

  describe("PATCH /api/workshops/[id]", () => {
    it("requires approval for date changes when original workshop is within lead-time window", async () => {
      (db.workshop.findUnique as jest.Mock).mockResolvedValue({
        id: "ws-1",
        format: "IN_PERSON",
        eventDate: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000),
      });

      const response = await PATCH(
        asPatchRequest(
          new Request("http://localhost/api/workshops/ws-1", {
            method: "PATCH",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
              eventDate: new Date(
                Date.now() + 30 * 24 * 60 * 60 * 1000
              ).toISOString(),
            }),
          })
        ),
        routeParams("ws-1")
      );
      const body = await response.json();

      expect(response.status).toBe(409);
      expect(body.requiresApproval).toBe(true);
      expect(db.workshop.update).not.toHaveBeenCalled();
    });

    it("updates workshop when date change is outside approval window", async () => {
      (db.workshop.findUnique as jest.Mock).mockResolvedValue({
        id: "ws-1",
        format: "VIRTUAL",
        eventDate: new Date(Date.now() + 40 * 24 * 60 * 60 * 1000),
      });
      (db.workshop.update as jest.Mock).mockResolvedValue({
        id: "ws-1",
        title: "Updated title",
      });

      const response = await PATCH(
        asPatchRequest(
          new Request("http://localhost/api/workshops/ws-1", {
            method: "PATCH",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
              title: "Updated title",
              eventDate: new Date(
                Date.now() + 70 * 24 * 60 * 60 * 1000
              ).toISOString(),
            }),
          })
        ),
        routeParams("ws-1")
      );

      expect(response.status).toBe(200);
      expect(db.workshop.update).toHaveBeenCalled();
    });
  });

  describe("DELETE /api/workshops/[id]", () => {
    it("requires cancellation fee handling for near-term workshops", async () => {
      (db.workshop.findUnique as jest.Mock).mockResolvedValue({
        id: "ws-1",
        eventDate: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000),
      });

      const response = await DELETE(
        buildDeleteRequest(),
        routeParams("ws-1")
      );

      expect(response.status).toBe(400);
      expect(chargeCancellationFee).not.toHaveBeenCalled();
      expect(db.workshop.update).not.toHaveBeenCalled();
    });

    it("charges cancellation fee and cancels workshop when payment details are provided", async () => {
      (db.workshop.findUnique as jest.Mock).mockResolvedValue({
        id: "ws-1",
        eventDate: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000),
      });
      (chargeCancellationFee as jest.Mock).mockResolvedValue({
        id: "pi_123",
      });
      (db.workshop.update as jest.Mock).mockResolvedValue({
        id: "ws-1",
        status: "CANCELED",
      });

      const response = await DELETE(
        buildDeleteRequest({
          chargeCancellationFee: true,
          stripeCustomerId: "cus_123",
          stripePaymentMethodId: "pm_123",
        }),
        routeParams("ws-1")
      );
      const body = await response.json();

      expect(response.status).toBe(200);
      expect(chargeCancellationFee).toHaveBeenCalledWith(
        "cus_123",
        "pm_123",
        50000
      );
      expect(db.workshop.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: "ws-1" },
          data: { status: "CANCELED" },
        })
      );
      expect(body.cancellationFee.charged).toBe(true);
      expect(body.cancellationFee.paymentIntentId).toBe("pi_123");
    });
  });
});
