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

jest.mock("@/services/stripe", () => ({
  constructWebhookEvent: jest.fn(),
}));

jest.mock("@/services/hubspot", () => ({
  createOrUpdateContact: jest.fn(),
}));

import { POST } from "@/app/api/webhooks/stripe/route";
import { db } from "@/lib/db";
import { constructWebhookEvent } from "@/services/stripe";
import { createOrUpdateContact } from "@/services/hubspot";

function buildWebhookRequest(options: {
  signature?: string;
  body?: string;
}): Parameters<typeof POST>[0] {
  const headers = new Headers();
  if (options.signature) {
    headers.set("stripe-signature", options.signature);
  }

  return {
    headers,
    text: async () => options.body || "{}",
  } as unknown as Parameters<typeof POST>[0];
}

describe("Stripe webhook API", () => {
  const originalHubspotToken = process.env.HUBSPOT_ACCESS_TOKEN;

  afterEach(() => {
    process.env.HUBSPOT_ACCESS_TOKEN = originalHubspotToken;
    jest.clearAllMocks();
  });

  it("returns 400 when stripe signature header is missing", async () => {
    const response = await POST(
      buildWebhookRequest({ body: "{}" })
    );

    expect(response.status).toBe(400);
  });

  it("returns 400 for invalid webhook signature", async () => {
    (constructWebhookEvent as jest.Mock).mockImplementation(() => {
      throw new Error("invalid signature");
    });

    const response = await POST(
      buildWebhookRequest({ signature: "bad-signature", body: "{}" })
    );

    expect(response.status).toBe(400);
  });

  it("processes checkout completion and syncs HubSpot contact", async () => {
    process.env.HUBSPOT_ACCESS_TOKEN = "test-token";
    (constructWebhookEvent as jest.Mock).mockReturnValue({
      id: "evt_1",
      type: "checkout.session.completed",
      data: {
        object: {
          id: "cs_test",
          amount_total: 49500,
          payment_intent: "pi_123",
          metadata: {
            registrationId: "reg-1",
          },
        },
      },
    });
    (db.registration.findUnique as jest.Mock).mockResolvedValue({
      id: "reg-1",
      email: "user@example.com",
      paymentStatus: "PENDING",
      stripePaymentId: null,
    });
    (db.registration.update as jest.Mock)
      .mockResolvedValueOnce({
        id: "reg-1",
        email: "user@example.com",
        firstName: "Ari",
        lastName: "Stone",
        company: "Scaling Up",
        jobTitle: "CEO",
        phone: "123",
        workshop: {
          title: "Scaling Up",
          eventDate: new Date("2026-05-01T10:00:00.000Z"),
          coach: {
            firstName: "John",
            lastName: "Smith",
          },
        },
      })
      .mockResolvedValueOnce({
        id: "reg-1",
        hubspotContactId: "hs_123",
      });
    (createOrUpdateContact as jest.Mock).mockResolvedValue("hs_123");

    const response = await POST(
      buildWebhookRequest({
        signature: "good-signature",
        body: JSON.stringify({}),
      })
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.received).toBe(true);
    expect(db.registration.update).toHaveBeenCalledTimes(2);
    expect(createOrUpdateContact).toHaveBeenCalledWith(
      expect.objectContaining({
        email: "user@example.com",
        workshop_name: "Scaling Up",
      })
    );
  });

  it("ignores duplicate checkout completion events idempotently", async () => {
    process.env.HUBSPOT_ACCESS_TOKEN = "test-token";
    (constructWebhookEvent as jest.Mock).mockReturnValue({
      id: "evt_1",
      type: "checkout.session.completed",
      data: {
        object: {
          id: "cs_test",
          amount_total: 49500,
          payment_intent: "pi_123",
          metadata: {
            registrationId: "reg-1",
          },
        },
      },
    });
    (db.registration.findUnique as jest.Mock).mockResolvedValue({
      id: "reg-1",
      email: "user@example.com",
      paymentStatus: "COMPLETED",
      stripePaymentId: "pi_123",
    });

    const response = await POST(
      buildWebhookRequest({
        signature: "good-signature",
        body: JSON.stringify({}),
      })
    );

    expect(response.status).toBe(200);
    expect(db.registration.update).not.toHaveBeenCalled();
    expect(createOrUpdateContact).not.toHaveBeenCalled();
  });

  it("processes payment_intent.succeeded when registrationId metadata exists", async () => {
    process.env.HUBSPOT_ACCESS_TOKEN = "test-token";
    (constructWebhookEvent as jest.Mock).mockReturnValue({
      id: "evt_pi_1",
      type: "payment_intent.succeeded",
      data: {
        object: {
          id: "pi_789",
          amount: 29900,
          amount_received: 29900,
          metadata: {
            registrationId: "reg-2",
          },
        },
      },
    });

    (db.registration.findUnique as jest.Mock).mockResolvedValue({
      id: "reg-2",
      email: "paid@example.com",
      paymentStatus: "PENDING",
      stripePaymentId: null,
    });

    (db.registration.update as jest.Mock)
      .mockResolvedValueOnce({
        id: "reg-2",
        email: "paid@example.com",
        firstName: "Pay",
        lastName: "User",
        company: "Scaling Up",
        jobTitle: "Owner",
        phone: "123",
        workshop: {
          title: "Paid Workshop",
          eventDate: new Date("2026-05-01T10:00:00.000Z"),
          coach: {
            firstName: "Coach",
            lastName: "One",
          },
        },
      })
      .mockResolvedValueOnce({
        id: "reg-2",
        hubspotContactId: "hs_paid_1",
      });
    (createOrUpdateContact as jest.Mock).mockResolvedValue("hs_paid_1");

    const response = await POST(
      buildWebhookRequest({
        signature: "good-signature",
        body: JSON.stringify({}),
      })
    );

    expect(response.status).toBe(200);
    expect(db.registration.update).toHaveBeenCalledTimes(2);
    expect(createOrUpdateContact).toHaveBeenCalledWith(
      expect.objectContaining({
        email: "paid@example.com",
        workshop_name: "Paid Workshop",
      })
    );
  });
});
