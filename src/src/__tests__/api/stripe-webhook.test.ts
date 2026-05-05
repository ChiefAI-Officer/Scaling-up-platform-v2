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

  it("v5: processes checkout completion fast — single DB update, NO inline HubSpot/SMTP, emits both Inngest events", async () => {
    process.env.HUBSPOT_ACCESS_TOKEN = "test-token";
    (constructWebhookEvent as jest.Mock).mockReturnValue({
      id: "evt_1",
      type: "checkout.session.completed",
      data: {
        object: {
          id: "cs_test",
          amount_total: 49500,
          payment_intent: "pi_123",
          metadata: { registrationId: "reg-1" },
        },
      },
    });
    (db.registration.findUnique as jest.Mock).mockResolvedValue({
      id: "reg-1",
      email: "user@example.com",
      firstName: "Ari",
      workshopId: "ws-1",
      paymentStatus: "PENDING",
      status: "PENDING_PAYMENT",
      stripePaymentId: null,
      paymentProcessedAt: null,
    });
    (db.registration.update as jest.Mock).mockResolvedValueOnce({});

    const response = await POST(
      buildWebhookRequest({ signature: "good-signature", body: "{}" })
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.received).toBe(true);
    // v5: single DB update on the slim path (the 2nd HubSpot-id update is
    // gone — handled by Inngest function instead)
    expect(db.registration.update).toHaveBeenCalledTimes(1);
    // v5: HubSpot is NOT called inline anymore
    expect(createOrUpdateContact).not.toHaveBeenCalled();
    // v5: notification is NOT called inline anymore
    expect(sendRegistrationNotification).not.toHaveBeenCalled();
    // v5: emits both events on fresh transition
    expect(inngest.send).toHaveBeenCalledWith(
      expect.objectContaining({ name: "registration/created" })
    );
    expect(inngest.send).toHaveBeenCalledWith(
      expect.objectContaining({
        name: "registration/payment-completed",
        data: expect.objectContaining({ registrationId: "reg-1" }),
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

  it("v5: skips emit when paymentProcessedAt is set (truly idempotent)", async () => {
    (constructWebhookEvent as jest.Mock).mockReturnValue({
      id: "evt_already",
      type: "checkout.session.completed",
      data: {
        object: {
          id: "cs_already",
          amount_total: 49500,
          payment_intent: "pi_already",
          metadata: { registrationId: "reg-already-processed" },
        },
      },
    });
    (db.registration.findUnique as jest.Mock).mockResolvedValue({
      id: "reg-already-processed",
      email: "done@example.com",
      firstName: "Done",
      workshopId: "ws-1",
      paymentStatus: "COMPLETED",
      status: "REGISTERED",
      stripePaymentId: "pi_already",
      paymentProcessedAt: new Date("2026-04-29T15:00:00Z"),
    });

    const response = await POST(
      buildWebhookRequest({ signature: "good-signature", body: "{}" })
    );

    expect(response.status).toBe(200);
    // True idempotency: nothing happens because paymentProcessedAt is set.
    expect(db.registration.update).not.toHaveBeenCalled();
    expect(inngest.send).not.toHaveBeenCalled();
  });

  it("v5: CASUALTY PATH — paymentStatus=COMPLETED + paymentProcessedAt=NULL still emits payment-completed (the Apr 30 outage rows)", async () => {
    // This is the critical bug from the Apr 30 outage: the existing
    // duplicate guard skipped this case, leaving side effects unprocessed.
    // v5 must emit the event so the Inngest function picks it up.
    (constructWebhookEvent as jest.Mock).mockReturnValue({
      id: "evt_casualty",
      type: "checkout.session.completed",
      data: {
        object: {
          id: "cs_casualty",
          amount_total: 49500,
          payment_intent: "pi_casualty",
          metadata: { registrationId: "reg-casualty" },
        },
      },
    });
    (db.registration.findUnique as jest.Mock).mockResolvedValue({
      id: "reg-casualty",
      email: "casualty@example.com",
      firstName: "Casualty",
      workshopId: "ws-casualty",
      paymentStatus: "COMPLETED", // already completed by Apr 30 attempt
      status: "REGISTERED",
      stripePaymentId: "pi_casualty",
      paymentProcessedAt: null, // but side effects didn't finish
    });

    const response = await POST(
      buildWebhookRequest({ signature: "good-signature", body: "{}" })
    );

    expect(response.status).toBe(200);
    // No DB update (paymentStatus is already COMPLETED)
    expect(db.registration.update).not.toHaveBeenCalled();
    // No registration/created re-emit (already emitted on first attempt)
    expect(inngest.send).not.toHaveBeenCalledWith(
      expect.objectContaining({ name: "registration/created" })
    );
    // BUT registration/payment-completed IS emitted to drive missing side effects
    expect(inngest.send).toHaveBeenCalledWith(
      expect.objectContaining({
        name: "registration/payment-completed",
        data: expect.objectContaining({ registrationId: "reg-casualty" }),
      })
    );
  });

  it("v5: publishes registration/created Inngest event on PENDING→COMPLETED transition only", async () => {
    (constructWebhookEvent as jest.Mock).mockReturnValue({
      id: "evt_inngest_1",
      type: "checkout.session.completed",
      data: {
        object: {
          id: "cs_inngest",
          amount_total: 10000,
          payment_intent: "pi_inngest",
          metadata: { registrationId: "reg-inngest" },
        },
      },
    });
    (db.registration.findUnique as jest.Mock).mockResolvedValue({
      id: "reg-inngest",
      email: "buyer@example.com",
      firstName: "Jane",
      workshopId: "ws-inngest",
      paymentStatus: "PENDING",
      status: "PENDING_PAYMENT",
      stripePaymentId: null,
      paymentProcessedAt: null,
    });
    (db.registration.update as jest.Mock).mockResolvedValueOnce({});

    await POST(
      buildWebhookRequest({ signature: "good-signature", body: "{}" })
    );

    expect(inngest.send).toHaveBeenCalledWith(
      expect.objectContaining({
        name: "registration/created",
        data: expect.objectContaining({
          registrationId: "reg-inngest",
          workshopId: "ws-inngest",
          email: "buyer@example.com",
          firstName: "Jane",
        }),
      })
    );
  });

  // v5: notification is no longer sent inline from the webhook — it's
  // handled by the processPaymentCompleted Inngest function with strict
  // retry semantics. See process-payment-completed.test.ts for coverage.

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

  it("v5: payment_intent.succeeded fallback uses same slim path — emits BOTH events on fresh transition", async () => {
    (constructWebhookEvent as jest.Mock).mockReturnValue({
      id: "evt_pi_1",
      type: "payment_intent.succeeded",
      data: {
        object: {
          id: "pi_789",
          amount: 29900,
          amount_received: 29900,
          metadata: { registrationId: "reg-2" },
        },
      },
    });
    (db.registration.findUnique as jest.Mock).mockResolvedValue({
      id: "reg-2",
      email: "paid@example.com",
      firstName: "Pay",
      workshopId: "ws-2",
      paymentStatus: "PENDING",
      status: "PENDING_PAYMENT",
      stripePaymentId: null,
      paymentProcessedAt: null,
    });
    (db.registration.update as jest.Mock).mockResolvedValueOnce({});

    const response = await POST(
      buildWebhookRequest({ signature: "good-signature", body: "{}" })
    );

    expect(response.status).toBe(200);
    // v5 slim: single update, NO inline HubSpot/notification
    expect(db.registration.update).toHaveBeenCalledTimes(1);
    expect(createOrUpdateContact).not.toHaveBeenCalled();
    expect(sendRegistrationNotification).not.toHaveBeenCalled();
    // Both events emitted on fresh transition; payment-completed includes the source
    expect(inngest.send).toHaveBeenCalledWith(
      expect.objectContaining({ name: "registration/created" })
    );
    expect(inngest.send).toHaveBeenCalledWith(
      expect.objectContaining({
        name: "registration/payment-completed",
        data: expect.objectContaining({
          registrationId: "reg-2",
          source: "payment_intent.succeeded",
        }),
      })
    );
  });
});
