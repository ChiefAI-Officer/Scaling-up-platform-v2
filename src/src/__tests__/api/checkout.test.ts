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

jest.mock("@/lib/rate-limit", () => ({
  RateLimits: {
    registration: { limit: 20, window: 60000 },
  },
  withRateLimit: jest.fn(),
}));

jest.mock("@/services/stripe", () => {
  class MockStripeDiscountCodeError extends Error {
    constructor(message = "Discount code is invalid or expired") {
      super(message);
      this.name = "StripeDiscountCodeError";
    }
  }

  return {
    createCheckoutSession: jest.fn(),
    StripeDiscountCodeError: MockStripeDiscountCodeError,
  };
});

import { POST } from "@/app/api/checkout/route";
import { db } from "@/lib/db";
import { withRateLimit } from "@/lib/rate-limit";
import {
  createCheckoutSession,
  StripeDiscountCodeError,
} from "@/services/stripe";

function buildRequest(body: Record<string, unknown>): Request {
  return new Request("http://localhost/api/checkout", {
    method: "POST",
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify(body),
  });
}

function asPostRequest(request: Request): Parameters<typeof POST>[0] {
  return request as unknown as Parameters<typeof POST>[0];
}

const baseRegistration = {
  id: "reg-1",
  email: "attendee@example.com",
  paymentStatus: "PENDING",
  workshop: {
    id: "ws-1",
    title: "Scaling Up Workshop",
    landingPageSlug: "workshop-landing",
    isFree: false,
    priceCents: 50000,
    workshopType: {
      name: "AI Workshop",
    },
  },
};

describe("POST /api/checkout", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (withRateLimit as jest.Mock).mockResolvedValue({
      allowed: true,
      headers: { "x-ratelimit-limit": "20" },
    });
    (db.registration.findUnique as jest.Mock).mockResolvedValue(baseRegistration);
    (db.registration.update as jest.Mock).mockResolvedValue({
      id: "reg-1",
      stripeSessionId: "cs_test_123",
    });
    (createCheckoutSession as jest.Mock).mockResolvedValue({
      id: "cs_test_123",
      url: "https://checkout.stripe.com/test-session",
    });
  });

  it("returns 400 when registrationId is missing", async () => {
    const response = await POST(asPostRequest(buildRequest({})));
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.success).toBe(false);
  });

  it("forwards discountCode and returns checkout url", async () => {
    const response = await POST(
      asPostRequest(
        buildRequest({
          registrationId: "reg-1",
          discountCode: "DETROIT60",
        })
      )
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(createCheckoutSession).toHaveBeenCalledWith(
      expect.objectContaining({
        registrationId: "reg-1",
        discountCode: "DETROIT60",
      })
    );
    expect(body.success).toBe(true);
    expect(body.data.url).toContain("stripe.com");
  });

  it("returns 400 when stripe discount validation fails", async () => {
    (createCheckoutSession as jest.Mock).mockRejectedValue(
      new StripeDiscountCodeError()
    );

    const response = await POST(
      asPostRequest(
        buildRequest({
          registrationId: "reg-1",
          discountCode: "BADCODE",
        })
      )
    );
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.success).toBe(false);
    expect(body.error).toBe("Discount code is invalid or expired");
  });
});
