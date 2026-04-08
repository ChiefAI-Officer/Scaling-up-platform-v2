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

jest.mock("@/inngest/client", () => ({
  inngest: {
    send: jest.fn().mockResolvedValue({ ids: [] }),
  },
}));

jest.mock("@/services/notifications", () => ({
  sendRegistrationNotification: jest.fn().mockResolvedValue(undefined),
}));

jest.mock("@/lib/ics-generator", () => ({
  generateIcsContent: jest.fn().mockReturnValue("BEGIN:VCALENDAR\nEND:VCALENDAR"),
  parseDurationHours: jest.fn().mockReturnValue(2),
  buildLocationString: jest.fn().mockReturnValue("Virtual"),
}));

import { POST } from "@/app/api/webhooks/stripe/route";
import { db } from "@/lib/db";
import { constructWebhookEvent } from "@/services/stripe";
import { createOrUpdateContact } from "@/services/hubspot";
import { sendRegistrationNotification } from "@/services/notifications";
import { inngest } from "@/inngest/client";
import Stripe from "stripe";

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

  beforeEach(() => {
    process.env.STRIPE_WEBHOOK_SECRET = "test-whsec-value";
  });

  describe("configuration guard", () => {
    beforeEach(() => {
      delete process.env.STRIPE_WEBHOOK_SECRET;
    });

    afterEach(() => {
      process.env.STRIPE_WEBHOOK_SECRET = "test-whsec-value";
    });

    it("returns 503 when STRIPE_WEBHOOK_SECRET is not set", async () => {
      const response = await POST(
        buildWebhookRequest({ signature: "any-sig", body: "{}" })
      );
      expect(response.status).toBe(503);
      const body = await response.json();
      expect(body.error).toBe("Webhook misconfigured");
    });
  });

  it("returns 400 when stripe signature header is missing", async () => {
    const response = await POST(
      buildWebhookRequest({ body: "{}" })
    );

    expect(response.status).toBe(400);
  });

  it("returns 400 for invalid webhook signature", async () => {
    (constructWebhookEvent as jest.Mock).mockImplementation(() => {
      const err = new Error("No signatures found matching the expected signature for payload.");
      err.name = "StripeSignatureVerificationError";
      Object.setPrototypeOf(err, Stripe.errors.StripeSignatureVerificationError.prototype);
      throw err;
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
      status: "PENDING_PAYMENT",
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

  it("sets status to REGISTERED (not CONFIRMED) after checkout completion", async () => {
    (constructWebhookEvent as jest.Mock).mockReturnValue({
      id: "evt_status_1",
      type: "checkout.session.completed",
      data: {
        object: {
          id: "cs_status",
          amount_total: 5000,
          payment_intent: "pi_status",
          metadata: { registrationId: "reg-status" },
        },
      },
    });
    (db.registration.findUnique as jest.Mock).mockResolvedValue({
      id: "reg-status",
      email: "status@example.com",
      paymentStatus: "PENDING",
      status: "PENDING_PAYMENT",
      stripePaymentId: null,
    });
    (db.registration.update as jest.Mock).mockResolvedValue({
      id: "reg-status",
      email: "status@example.com",
      firstName: "Test",
      lastName: "User",
      company: null,
      workshop: {
        id: "ws-status",
        title: "Status Test",
        workshopCode: "WS-2026-STAT",
        eventDate: new Date(),
        coach: { id: "c1", firstName: "C", lastName: "O", email: "c@e.com" },
      },
    });

    await POST(buildWebhookRequest({ signature: "good-sig", body: "{}" }));

    expect(db.registration.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: "REGISTERED",
        }),
      })
    );
  });

  it("does not overwrite CANCELLED registration on checkout completion", async () => {
    (constructWebhookEvent as jest.Mock).mockReturnValue({
      id: "evt_cancelled_1",
      type: "checkout.session.completed",
      data: {
        object: {
          id: "cs_cancelled",
          amount_total: 5000,
          payment_intent: "pi_cancelled",
          metadata: { registrationId: "reg-cancelled" },
        },
      },
    });
    (db.registration.findUnique as jest.Mock).mockResolvedValue({
      id: "reg-cancelled",
      email: "cancelled@example.com",
      paymentStatus: "CANCELLED",
      status: "CANCELLED",
      stripePaymentId: null,
    });

    await POST(buildWebhookRequest({ signature: "good-sig", body: "{}" }));

    // Should not update — registration was already cancelled
    expect(db.registration.update).not.toHaveBeenCalled();
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

  it("publishes registration/created Inngest event after checkout completion", async () => {
    process.env.HUBSPOT_ACCESS_TOKEN = "test-token";
    (constructWebhookEvent as jest.Mock).mockReturnValue({
      id: "evt_inngest_1",
      type: "checkout.session.completed",
      data: {
        object: {
          id: "cs_inngest",
          amount_total: 10000,
          payment_intent: "pi_inngest",
          metadata: {
            registrationId: "reg-inngest",
          },
        },
      },
    });
    (db.registration.findUnique as jest.Mock).mockResolvedValue({
      id: "reg-inngest",
      email: "buyer@example.com",
      paymentStatus: "PENDING",
      status: "PENDING_PAYMENT",
      stripePaymentId: null,
    });
    (db.registration.update as jest.Mock).mockResolvedValueOnce({
      id: "reg-inngest",
      email: "buyer@example.com",
      firstName: "Jane",
      lastName: "Doe",
      company: "Acme",
      jobTitle: "CTO",
      phone: "555-1234",
      workshop: {
        id: "ws-inngest",
        title: "Test Workshop",
        workshopCode: "WS-2026-ABCD",
        eventDate: new Date("2026-06-01T10:00:00.000Z"),
        eventTime: "10:00",
        timezone: "America/New_York",
        duration: "2 hours",
        format: "VIRTUAL",
        virtualLink: "https://zoom.us/j/123",
        coach: {
          id: "coach-1",
          firstName: "Coach",
          lastName: "Smith",
          email: "coach@example.com",
        },
      },
    }).mockResolvedValue({});
    (createOrUpdateContact as jest.Mock).mockResolvedValue("hs_inngest");

    await POST(
      buildWebhookRequest({
        signature: "good-signature",
        body: JSON.stringify({}),
      })
    );

    expect(inngest.send).toHaveBeenCalledWith(
      expect.objectContaining({
        name: "registration/created",
        data: expect.objectContaining({
          registrationId: "reg-inngest",
          workshopId: "ws-inngest",
        }),
      })
    );
  });

  it("sends registration notification after checkout completion", async () => {
    process.env.HUBSPOT_ACCESS_TOKEN = "test-token";
    (constructWebhookEvent as jest.Mock).mockReturnValue({
      id: "evt_notif_1",
      type: "checkout.session.completed",
      data: {
        object: {
          id: "cs_notif",
          amount_total: 10000,
          payment_intent: "pi_notif",
          metadata: {
            registrationId: "reg-notif",
          },
        },
      },
    });
    (db.registration.findUnique as jest.Mock).mockResolvedValue({
      id: "reg-notif",
      email: "notif@example.com",
      paymentStatus: "PENDING",
      status: "PENDING_PAYMENT",
      stripePaymentId: null,
    });
    (db.registration.update as jest.Mock).mockResolvedValueOnce({
      id: "reg-notif",
      email: "notif@example.com",
      firstName: "Notify",
      lastName: "User",
      company: "TestCo",
      jobTitle: null,
      phone: "555-0000",
      workshop: {
        id: "ws-notif",
        title: "Notification Workshop",
        workshopCode: "WS-2026-NOTF",
        eventDate: new Date("2026-06-15T09:00:00.000Z"),
        eventTime: "09:00",
        timezone: "America/New_York",
        duration: "2 hours",
        format: "VIRTUAL",
        virtualLink: "https://zoom.us/j/456",
        coach: {
          id: "coach-2",
          firstName: "Notify",
          lastName: "Coach",
          email: "ncoach@example.com",
        },
      },
    }).mockResolvedValue({});
    (createOrUpdateContact as jest.Mock).mockResolvedValue("hs_notif");

    await POST(
      buildWebhookRequest({
        signature: "good-signature",
        body: JSON.stringify({}),
      })
    );

    expect(sendRegistrationNotification).toHaveBeenCalledWith(
      expect.objectContaining({
        workshopId: "ws-notif",
        workshopTitle: "Notification Workshop",
        coachEmail: "ncoach@example.com",
        registrantEmail: "notif@example.com",
      })
    );
  });

  it("cancels PENDING registration when checkout.session.expired fires", async () => {
    (constructWebhookEvent as jest.Mock).mockReturnValue({
      id: "evt_expired_1",
      type: "checkout.session.expired",
      data: {
        object: {
          id: "cs_expired",
          metadata: {
            registrationId: "reg-expired",
          },
        },
      },
    });
    (db.registration.updateMany as jest.Mock) = jest.fn().mockResolvedValue({ count: 1 });

    const response = await POST(
      buildWebhookRequest({
        signature: "good-signature",
        body: JSON.stringify({}),
      })
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.received).toBe(true);
    expect(db.registration.updateMany).toHaveBeenCalledWith({
      where: { id: "reg-expired", paymentStatus: "PENDING" },
      data: { status: "CANCELLED", paymentStatus: "CANCELLED" },
    });
  });

  it("does nothing when checkout.session.expired has no registrationId metadata", async () => {
    (constructWebhookEvent as jest.Mock).mockReturnValue({
      id: "evt_expired_2",
      type: "checkout.session.expired",
      data: {
        object: {
          id: "cs_expired_no_meta",
          metadata: {},
        },
      },
    });
    (db.registration.updateMany as jest.Mock) = jest.fn().mockResolvedValue({ count: 0 });

    const response = await POST(
      buildWebhookRequest({
        signature: "good-signature",
        body: JSON.stringify({}),
      })
    );

    expect(response.status).toBe(200);
    expect(db.registration.updateMany).not.toHaveBeenCalled();
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
      status: "PENDING_PAYMENT",
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
