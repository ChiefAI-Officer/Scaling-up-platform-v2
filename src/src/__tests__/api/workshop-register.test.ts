/**
 * Tests for POST /api/workshops/[id]/register
 *
 * This route handles both free and paid workshop registrations, including
 * Zod input validation, Stripe checkout for paid workshops, HubSpot sync,
 * email notifications, ICS calendar generation, and pre-workshop survey creation.
 */

/* -------------------------------------------------------------------------- */
/*  Mocks — all declared before imports so hoisting works correctly           */
/* -------------------------------------------------------------------------- */

jest.mock("next/server", () => ({
  NextResponse: {
    json: (body: unknown, init?: ResponseInit) =>
      new Response(JSON.stringify(body), {
        status: init?.status || 200,
        headers: init?.headers,
      }),
    redirect: (url: string, init?: ResponseInit) =>
      new Response(null, {
        status: init?.status || 307,
        headers: { ...init?.headers, location: url } as HeadersInit,
      }),
  },
}));

jest.mock("@/lib/db", () => ({
  db: {
    coach: { findFirst: jest.fn() },
    registration: { update: jest.fn() },
    landingPage: { findFirst: jest.fn() },
    workshop: { findUnique: jest.fn() },
  },
}));

jest.mock("@/lib/rate-limit", () => ({
  RateLimits: {
    registration: { limit: 10, window: 60000 },
  },
  withRateLimit: jest.fn(),
}));

jest.mock("@/lib/registration-service", () => {
  class MockRegistrationServiceError extends Error {
    public readonly code: string;
    public readonly status: number;

    constructor(code: string, message: string, status: number) {
      super(message);
      this.code = code;
      this.status = status;
    }
  }

  const APPROVED = ["PRE_EVENT", "POST_EVENT", "COMPLETED"];

  return {
    createWorkshopRegistration: jest.fn(),
    isApprovedWorkshopStatus: (status: string) => APPROVED.includes(status),
    APPROVED_WORKSHOP_STATUSES: APPROVED,
    RegistrationServiceError: MockRegistrationServiceError,
  };
});

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

jest.mock("@/inngest/client", () => ({
  inngest: {
    send: jest.fn().mockResolvedValue(undefined),
  },
}));

jest.mock("@/services/notifications", () => ({
  sendRegistrationNotification: jest.fn().mockResolvedValue(undefined),
}));

jest.mock("@/services/hubspot", () => ({
  createOrUpdateContact: jest.fn().mockResolvedValue("hs-contact-1"),
}));

jest.mock("@/lib/ics-generator", () => ({
  generateIcsContent: jest.fn().mockReturnValue("BEGIN:VCALENDAR\nEND:VCALENDAR"),
  parseDurationHours: jest.fn().mockReturnValue(8),
  buildLocationString: jest.fn().mockReturnValue("123 Main St"),
}));

jest.mock("@/lib/surveys/survey-automation", () => ({
  createPreWorkshopSurvey: jest.fn().mockResolvedValue({
    surveyUrl: "https://example.com/survey/1",
  }),
  sendSurveyEmail: jest.fn().mockResolvedValue(undefined),
}));

/* -------------------------------------------------------------------------- */
/*  Imports                                                                   */
/* -------------------------------------------------------------------------- */

import { POST } from "@/app/api/workshops/[id]/register/route";
import { db } from "@/lib/db";
import { withRateLimit } from "@/lib/rate-limit";
import {
  createWorkshopRegistration,
  RegistrationServiceError,
} from "@/lib/registration-service";
import {
  createCheckoutSession,
  StripeDiscountCodeError,
} from "@/services/stripe";

/* -------------------------------------------------------------------------- */
/*  Helpers                                                                   */
/* -------------------------------------------------------------------------- */

function routeParams(id = "ws-1") {
  return { params: Promise.resolve({ id }) };
}

function buildJsonRequest(
  body: Record<string, unknown>,
  headers?: Record<string, string>
): Parameters<typeof POST>[0] {
  return new Request("http://localhost/api/workshops/ws-1/register", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      accept: "application/json",
      ...headers,
    },
    body: JSON.stringify(body),
  }) as unknown as Parameters<typeof POST>[0];
}

const validPayload = {
  email: "jane@example.com",
  firstName: "Jane",
  lastName: "Doe",
  company: "Acme Inc",
  phone: "+1 555-123-4567",
};

function makeFreeWorkshop(overrides: Record<string, unknown> = {}) {
  return {
    id: "ws-1",
    title: "Scaling Up Free Workshop",
    description: "A free workshop on scaling up.",
    isFree: true,
    priceCents: 0,
    status: "PRE_EVENT",
    maxAttendees: 25,
    eventDate: new Date("2026-04-15T09:00:00Z"),
    eventTime: "9:00 AM",
    timezone: "America/New_York",
    duration: "8 hours",
    format: "IN_PERSON",
    venueName: "Conference Hall",
    landingPageSlug: "free-workshop",
    workshopCode: "WS-FREE-001",
    coachId: "coach-1",
    ...overrides,
  };
}

function makePaidWorkshop(overrides: Record<string, unknown> = {}) {
  return {
    ...makeFreeWorkshop(),
    id: "ws-2",
    title: "Scaling Up Paid Workshop",
    isFree: false,
    priceCents: 50000,
    coupons: JSON.stringify([
      {
        code: "SAVE20",
        discountPercent: 20,
        singleUse: false,
        stripePromotionCodeId: "promo_save20",
      },
    ]),
    landingPageSlug: "paid-workshop",
    workshopCode: "WS-PAID-001",
    ...overrides,
  };
}

function makeRegistration(overrides: Record<string, unknown> = {}) {
  return {
    id: "reg-1",
    workshopId: "ws-1",
    email: "jane@example.com",
    firstName: "Jane",
    lastName: "Doe",
    company: "Acme Inc",
    phone: "+1 555-123-4567",
    paymentStatus: "FREE",
    status: "REGISTERED",
    ...overrides,
  };
}

const mockCoach = {
  email: "coach@example.com",
  firstName: "John",
  lastName: "Smith",
};

/* -------------------------------------------------------------------------- */
/*  Tests                                                                     */
/* -------------------------------------------------------------------------- */

describe("POST /api/workshops/[id]/register", () => {
  beforeEach(() => {
    jest.clearAllMocks();

    // Default: rate limit allows the request
    (withRateLimit as jest.Mock).mockResolvedValue({
      allowed: true,
      headers: { "x-ratelimit-limit": "10" },
    });

    // Default: coach lookup for fire-and-forget notifications
    (db.coach.findFirst as jest.Mock).mockResolvedValue(mockCoach);

    // Default: registration update succeeds (for stripeSessionId persistence)
    (db.registration.update as jest.Mock).mockResolvedValue({
      id: "reg-1",
      stripeSessionId: "cs_test_123",
    });

    // Default: no published THANK_YOU LandingPage → helper falls back to
    // `/registration/success`. Individual tests can override per-test.
    (db.landingPage.findFirst as jest.Mock).mockResolvedValue(null);

    // Default: workshop is approved (PRE_EVENT) so the pre-approval guard
    // passes. Individual tests override status to exercise the 403 guard.
    (db.workshop.findUnique as jest.Mock).mockResolvedValue({ status: "PRE_EVENT" });
  });

  /* ======================================================================== */
  /*  1. Free workshop registration — happy path                              */
  /* ======================================================================== */

  describe("free workshop registration (happy path)", () => {
    it("returns 201 with registration data and redirectUrl for JSON requests", async () => {
      const workshop = makeFreeWorkshop();
      const registration = makeRegistration();

      (createWorkshopRegistration as jest.Mock).mockResolvedValue({
        registration,
        workshop,
      });

      const response = await POST(buildJsonRequest(validPayload), routeParams("ws-1"));
      const body = await response.json();

      expect(response.status).toBe(201);
      expect(body.success).toBe(true);
      expect(body.data).toEqual(registration);
      expect(body.redirectUrl).toContain("/registration/success?id=reg-1");
    });

    it("calls createWorkshopRegistration with correct input shape", async () => {
      const workshop = makeFreeWorkshop();
      const registration = makeRegistration();

      (createWorkshopRegistration as jest.Mock).mockResolvedValue({
        registration,
        workshop,
      });

      await POST(buildJsonRequest(validPayload), routeParams("ws-1"));

      expect(createWorkshopRegistration).toHaveBeenCalledWith(
        expect.objectContaining({
          workshopId: "ws-1",
          email: "jane@example.com",
          firstName: "Jane",
          lastName: "Doe",
          company: "Acme Inc",
          phone: "+1 555-123-4567",
        })
      );
    });

    it("does not call createCheckoutSession for free workshops", async () => {
      const workshop = makeFreeWorkshop();
      const registration = makeRegistration();

      (createWorkshopRegistration as jest.Mock).mockResolvedValue({
        registration,
        workshop,
      });

      await POST(buildJsonRequest(validPayload), routeParams("ws-1"));

      expect(createCheckoutSession).not.toHaveBeenCalled();
    });

    it("publishes registration/created to Inngest for free workshop (Wave 13-A)", async () => {
      const workshop = makeFreeWorkshop(); // id = "ws-1"
      const registration = makeRegistration();

      (createWorkshopRegistration as jest.Mock).mockResolvedValue({
        registration,
        workshop,
      });

      await POST(buildJsonRequest(validPayload), routeParams("ws-1"));

      const { inngest } = jest.requireMock("@/inngest/client");
      expect(inngest.send).toHaveBeenCalledWith(
        expect.objectContaining({
          name: "registration/created",
          data: expect.objectContaining({
            registrationId: registration.id,
          }),
        })
      );
    });

    // Note: The redirect (303) path for non-JSON requests cannot be tested in jsdom
    // because Request.formData() is not available. The redirect logic is covered by
    // the wantsJsonResponse check — when content-type is NOT application/json,
    // the handler returns NextResponse.redirect instead of NextResponse.json.
  });

  /* ======================================================================== */
  /*  2. Paid workshop registration — Stripe checkout initiated               */
  /* ======================================================================== */

  describe("paid workshop registration (Stripe checkout)", () => {
    it("returns 201 with checkoutUrl and sessionId for paid workshops", async () => {
      const workshop = makePaidWorkshop();
      const registration = makeRegistration({
        workshopId: "ws-2",
        paymentStatus: "PENDING",
      });

      (createWorkshopRegistration as jest.Mock).mockResolvedValue({
        registration,
        workshop,
      });
      (createCheckoutSession as jest.Mock).mockResolvedValue({
        id: "cs_test_123",
        url: "https://checkout.stripe.com/test-session",
      });

      const response = await POST(buildJsonRequest(validPayload), routeParams("ws-2"));
      const body = await response.json();

      expect(response.status).toBe(201);
      expect(body.success).toBe(true);
      expect(body.data.registrationId).toBe("reg-1");
      expect(body.data.checkoutUrl).toBe("https://checkout.stripe.com/test-session");
      expect(body.data.sessionId).toBe("cs_test_123");
    });

    it("calls createCheckoutSession with correct parameters", async () => {
      const workshop = makePaidWorkshop();
      const registration = makeRegistration({
        workshopId: "ws-2",
        paymentStatus: "PENDING",
      });

      (createWorkshopRegistration as jest.Mock).mockResolvedValue({
        registration,
        workshop,
      });
      (createCheckoutSession as jest.Mock).mockResolvedValue({
        id: "cs_test_456",
        url: "https://checkout.stripe.com/test-session-2",
      });

      await POST(
        buildJsonRequest({ ...validPayload, discountCode: "SAVE20" }),
        routeParams("ws-2")
      );

      expect(createCheckoutSession).toHaveBeenCalledWith(
        expect.objectContaining({
          workshopId: "ws-2",
          workshopTitle: "Scaling Up Paid Workshop",
          priceCents: 50000,
          registrationId: "reg-1",
          customerEmail: "jane@example.com",
          discountCode: "SAVE20",
          allowedPromotionCodeIds: ["promo_save20"],
        })
      );
    });

    it("persists stripeSessionId on the registration record", async () => {
      const workshop = makePaidWorkshop();
      const registration = makeRegistration({
        workshopId: "ws-2",
        paymentStatus: "PENDING",
      });

      (createWorkshopRegistration as jest.Mock).mockResolvedValue({
        registration,
        workshop,
      });
      (createCheckoutSession as jest.Mock).mockResolvedValue({
        id: "cs_test_789",
        url: "https://checkout.stripe.com/test-session-3",
      });

      await POST(buildJsonRequest(validPayload), routeParams("ws-2"));

      expect(db.registration.update).toHaveBeenCalledWith({
        where: { id: "reg-1" },
        data: { stripeSessionId: "cs_test_789" },
      });
    });

    it("returns 400 when paid workshop has no priceCents configured", async () => {
      const workshop = makePaidWorkshop({ priceCents: 0 });
      const registration = makeRegistration({
        workshopId: "ws-2",
        paymentStatus: "PENDING",
      });

      (createWorkshopRegistration as jest.Mock).mockResolvedValue({
        registration,
        workshop,
      });

      const response = await POST(buildJsonRequest(validPayload), routeParams("ws-2"));
      const body = await response.json();

      expect(response.status).toBe(400);
      expect(body.success).toBe(false);
      expect(body.error).toBe("Workshop pricing is not configured");
    });

    it("returns 500 when Stripe session has no url", async () => {
      const workshop = makePaidWorkshop();
      const registration = makeRegistration({
        workshopId: "ws-2",
        paymentStatus: "PENDING",
      });

      (createWorkshopRegistration as jest.Mock).mockResolvedValue({
        registration,
        workshop,
      });
      (createCheckoutSession as jest.Mock).mockResolvedValue({
        id: "cs_test_no_url",
        url: null,
      });

      const response = await POST(buildJsonRequest(validPayload), routeParams("ws-2"));
      const body = await response.json();

      expect(response.status).toBe(500);
      expect(body.error).toBe("Failed to initialize payment session");
    });

    it("returns 400 when Stripe discount code is invalid", async () => {
      const workshop = makePaidWorkshop();
      const registration = makeRegistration({
        workshopId: "ws-2",
        paymentStatus: "PENDING",
      });

      (createWorkshopRegistration as jest.Mock).mockResolvedValue({
        registration,
        workshop,
      });
      (createCheckoutSession as jest.Mock).mockRejectedValue(
        new StripeDiscountCodeError()
      );

      const response = await POST(
        buildJsonRequest({ ...validPayload, discountCode: "BADCODE" }),
        routeParams("ws-2")
      );
      const body = await response.json();

      expect(response.status).toBe(400);
      expect(body.success).toBe(false);
      expect(body.error).toBe("Discount code is invalid or expired");
    });
  });

  /* ======================================================================== */
  /*  3. Validation — missing required fields                                 */
  /* ======================================================================== */

  describe("validation: missing required fields", () => {
    it("returns 400 when email is missing", async () => {
      const response = await POST(
        buildJsonRequest({
          firstName: "Jane",
          lastName: "Doe",
          company: "Acme",
          phone: "+1 555-123-4567",
        }),
        routeParams("ws-1")
      );
      const body = await response.json();

      expect(response.status).toBe(400);
      expect(body.success).toBe(false);
      expect(body.error).toBe("Missing required registration fields");
    });

    it("returns 400 when firstName is missing", async () => {
      const response = await POST(
        buildJsonRequest({
          email: "jane@example.com",
          lastName: "Doe",
          company: "Acme",
          phone: "+1 555-123-4567",
        }),
        routeParams("ws-1")
      );
      const body = await response.json();

      expect(response.status).toBe(400);
      expect(body.error).toBe("Missing required registration fields");
    });

    it("returns 400 when lastName is missing", async () => {
      const response = await POST(
        buildJsonRequest({
          email: "jane@example.com",
          firstName: "Jane",
          company: "Acme",
          phone: "+1 555-123-4567",
        }),
        routeParams("ws-1")
      );
      const body = await response.json();

      expect(response.status).toBe(400);
      expect(body.error).toBe("Missing required registration fields");
    });

    it("returns 400 when company is missing (Zod validation fails)", async () => {
      const response = await POST(
        buildJsonRequest({
          email: "jane@example.com",
          firstName: "Jane",
          lastName: "Doe",
          phone: "+1 555-123-4567",
        }),
        routeParams("ws-1")
      );
      const body = await response.json();

      expect(response.status).toBe(400);
      expect(body.error).toBe("Missing required registration fields");
    });

    it("returns 400 when phone is missing (Zod validation fails)", async () => {
      const response = await POST(
        buildJsonRequest({
          email: "jane@example.com",
          firstName: "Jane",
          lastName: "Doe",
          company: "Acme Inc",
        }),
        routeParams("ws-1")
      );
      const body = await response.json();

      expect(response.status).toBe(400);
      expect(body.error).toBe("Missing required registration fields");
    });

    it("returns 400 when phone has invalid format", async () => {
      const response = await POST(
        buildJsonRequest({
          email: "jane@example.com",
          firstName: "Jane",
          lastName: "Doe",
          company: "Acme Inc",
          phone: "not-a-phone!@#",
        }),
        routeParams("ws-1")
      );
      const body = await response.json();

      expect(response.status).toBe(400);
      expect(body.error).toBe("Missing required registration fields");
    });

    it("returns 400 when email is invalid format", async () => {
      const response = await POST(
        buildJsonRequest({
          email: "not-an-email",
          firstName: "Jane",
          lastName: "Doe",
          company: "Acme Inc",
          phone: "+1 555-123-4567",
        }),
        routeParams("ws-1")
      );
      const body = await response.json();

      expect(response.status).toBe(400);
      expect(body.error).toBe("Missing required registration fields");
    });

    it("returns 400 when all fields are empty strings", async () => {
      const response = await POST(
        buildJsonRequest({
          email: "",
          firstName: "",
          lastName: "",
          company: "",
          phone: "",
        }),
        routeParams("ws-1")
      );
      const body = await response.json();

      expect(response.status).toBe(400);
      expect(body.error).toBe("Missing required registration fields");
    });
  });

  /* ======================================================================== */
  /*  4. Duplicate registration prevention                                    */
  /* ======================================================================== */

  describe("duplicate registration prevention", () => {
    it("returns 409 when registration service detects a duplicate", async () => {
      (createWorkshopRegistration as jest.Mock).mockRejectedValue(
        new RegistrationServiceError(
          "DUPLICATE_REGISTRATION",
          "You are already registered for this workshop",
          409
        )
      );

      const response = await POST(buildJsonRequest(validPayload), routeParams("ws-1"));
      const body = await response.json();

      expect(response.status).toBe(409);
      expect(body.success).toBe(false);
      expect(body.error).toBe("You are already registered for this workshop");
    });
  });

  /* ======================================================================== */
  /*  5. Workshop not found (404)                                             */
  /* ======================================================================== */

  describe("workshop not found", () => {
    it("returns 404 when workshop id does not exist", async () => {
      (createWorkshopRegistration as jest.Mock).mockRejectedValue(
        new RegistrationServiceError(
          "WORKSHOP_NOT_FOUND",
          "Workshop not found",
          404
        )
      );

      const response = await POST(
        buildJsonRequest(validPayload),
        routeParams("ws-nonexistent")
      );
      const body = await response.json();

      expect(response.status).toBe(404);
      expect(body.success).toBe(false);
      expect(body.error).toBe("Workshop not found");
    });
  });

  /* ======================================================================== */
  /*  6. Workshop capacity check                                              */
  /* ======================================================================== */

  describe("workshop capacity check", () => {
    it("returns 400 when workshop is at full capacity", async () => {
      (createWorkshopRegistration as jest.Mock).mockRejectedValue(
        new RegistrationServiceError(
          "WORKSHOP_FULL",
          "Workshop is at full capacity",
          400
        )
      );

      const response = await POST(buildJsonRequest(validPayload), routeParams("ws-1"));
      const body = await response.json();

      expect(response.status).toBe(400);
      expect(body.success).toBe(false);
      expect(body.error).toBe("Workshop is at full capacity");
    });

    it("returns 400 when workshop registration is closed", async () => {
      (createWorkshopRegistration as jest.Mock).mockRejectedValue(
        new RegistrationServiceError(
          "WORKSHOP_CLOSED",
          "Workshop is not open for registration",
          400
        )
      );

      const response = await POST(buildJsonRequest(validPayload), routeParams("ws-1"));
      const body = await response.json();

      expect(response.status).toBe(400);
      expect(body.success).toBe(false);
      expect(body.error).toBe("Workshop is not open for registration");
    });
  });

  /* ======================================================================== */
  /*  6b. Pre-approval registration guard (block registrations before approval)*/
  /* ======================================================================== */

  describe("pre-approval registration guard", () => {
    it("returns 403 when workshop status is AWAITING_APPROVAL (before any capacity/duplicate/Stripe logic)", async () => {
      (db.workshop.findUnique as jest.Mock).mockResolvedValue({
        status: "AWAITING_APPROVAL",
      });

      const response = await POST(buildJsonRequest(validPayload), routeParams("ws-1"));
      const body = await response.json();

      expect(response.status).toBe(403);
      expect(body.success).toBe(false);
      expect(body.error).toBe("Registration is not open for this workshop");
      // The guard fires BEFORE the registration service runs.
      expect(createWorkshopRegistration).not.toHaveBeenCalled();
    });

    it("returns 403 when workshop status is CANCELED", async () => {
      (db.workshop.findUnique as jest.Mock).mockResolvedValue({
        status: "CANCELED",
      });

      const response = await POST(buildJsonRequest(validPayload), routeParams("ws-1"));
      const body = await response.json();

      expect(response.status).toBe(403);
      expect(body.success).toBe(false);
      expect(body.error).toBe("Registration is not open for this workshop");
      expect(createWorkshopRegistration).not.toHaveBeenCalled();
    });

    it("allows registration when workshop status is PRE_EVENT (approved)", async () => {
      (db.workshop.findUnique as jest.Mock).mockResolvedValue({ status: "PRE_EVENT" });
      const workshop = makeFreeWorkshop();
      const registration = makeRegistration();
      (createWorkshopRegistration as jest.Mock).mockResolvedValue({
        registration,
        workshop,
      });

      const response = await POST(buildJsonRequest(validPayload), routeParams("ws-1"));

      expect(response.status).toBe(201);
      expect(createWorkshopRegistration).toHaveBeenCalled();
    });

    it("returns 404 when the workshop does not exist", async () => {
      (db.workshop.findUnique as jest.Mock).mockResolvedValue(null);

      const response = await POST(buildJsonRequest(validPayload), routeParams("ws-1"));
      const body = await response.json();

      expect(response.status).toBe(404);
      expect(body.success).toBe(false);
      expect(createWorkshopRegistration).not.toHaveBeenCalled();
    });
  });

  /* ======================================================================== */
  /*  7. Rate limiting                                                        */
  /* ======================================================================== */

  describe("rate limiting", () => {
    it("returns 429 when rate limit is exceeded", async () => {
      (withRateLimit as jest.Mock).mockResolvedValue({
        allowed: false,
        headers: { "retry-after": "30" },
      });

      const response = await POST(buildJsonRequest(validPayload), routeParams("ws-1"));
      const body = await response.json();

      expect(response.status).toBe(429);
      expect(body.success).toBe(false);
      expect(body.error).toBe("Too many requests. Please try again shortly.");
    });
  });

  /* ======================================================================== */
  /*  8. Invalid workshop id param                                            */
  /* ======================================================================== */

  describe("invalid workshop id parameter", () => {
    it("returns 400 when workshop id is empty string", async () => {
      const response = await POST(
        buildJsonRequest(validPayload),
        routeParams("")
      );
      const body = await response.json();

      expect(response.status).toBe(400);
      expect(body.error).toBe("Invalid workshop id");
    });
  });

  /* ======================================================================== */
  /*  9. fullName fallback parsing                                            */
  /* ======================================================================== */

  describe("fullName fallback parsing", () => {
    it("parses fullName into firstName and lastName when individual names are missing", async () => {
      const workshop = makeFreeWorkshop();
      const registration = makeRegistration();

      (createWorkshopRegistration as jest.Mock).mockResolvedValue({
        registration,
        workshop,
      });

      await POST(
        buildJsonRequest({
          email: "jane@example.com",
          fullName: "Jane Marie Doe",
          company: "Acme Inc",
          phone: "+1 555-123-4567",
        }),
        routeParams("ws-1")
      );

      expect(createWorkshopRegistration).toHaveBeenCalledWith(
        expect.objectContaining({
          firstName: "Jane",
          lastName: "Marie Doe",
        })
      );
    });
  });

  /* ======================================================================== */
  /*  10. Unexpected server error                                             */
  /* ======================================================================== */

  describe("unexpected server errors", () => {
    it("returns 500 for unknown errors from registration service", async () => {
      (createWorkshopRegistration as jest.Mock).mockRejectedValue(
        new Error("Database connection failed")
      );

      const response = await POST(buildJsonRequest(validPayload), routeParams("ws-1"));
      const body = await response.json();

      expect(response.status).toBe(500);
      expect(body.success).toBe(false);
      expect(body.error).toBe("Failed to register attendee");
    });
  });

  /* ======================================================================== */
  /*  11. Email normalization                                                 */
  /* ======================================================================== */

  describe("email normalization", () => {
    it("lowercases email before passing to registration service", async () => {
      const workshop = makeFreeWorkshop();
      const registration = makeRegistration();

      (createWorkshopRegistration as jest.Mock).mockResolvedValue({
        registration,
        workshop,
      });

      await POST(
        buildJsonRequest({ ...validPayload, email: "JANE@EXAMPLE.COM" }),
        routeParams("ws-1")
      );

      expect(createWorkshopRegistration).toHaveBeenCalledWith(
        expect.objectContaining({
          email: "jane@example.com",
        })
      );
    });
  });

  /* ======================================================================== */
  /*  12. marketingOptIn handling                                             */
  /* ======================================================================== */

  describe("marketingOptIn handling", () => {
    it("passes marketingOptIn=true when explicitly set", async () => {
      const workshop = makeFreeWorkshop();
      const registration = makeRegistration();

      (createWorkshopRegistration as jest.Mock).mockResolvedValue({
        registration,
        workshop,
      });

      await POST(
        buildJsonRequest({ ...validPayload, marketingOptIn: true }),
        routeParams("ws-1")
      );

      expect(createWorkshopRegistration).toHaveBeenCalledWith(
        expect.objectContaining({
          marketingOptIn: true,
        })
      );
    });

    it("defaults marketingOptIn to false when not provided", async () => {
      const workshop = makeFreeWorkshop();
      const registration = makeRegistration();

      (createWorkshopRegistration as jest.Mock).mockResolvedValue({
        registration,
        workshop,
      });

      await POST(buildJsonRequest(validPayload), routeParams("ws-1"));

      expect(createWorkshopRegistration).toHaveBeenCalledWith(
        expect.objectContaining({
          marketingOptIn: false,
        })
      );
    });
  });

  /* ======================================================================== */
  /*  13. Conflict retry from registration service                            */
  /* ======================================================================== */

  describe("conflict retry from registration service", () => {
    it("returns 409 when registration service reports a serialization conflict", async () => {
      (createWorkshopRegistration as jest.Mock).mockRejectedValue(
        new RegistrationServiceError(
          "CONFLICT_RETRY",
          "Registration is currently busy. Please try again.",
          409
        )
      );

      const response = await POST(buildJsonRequest(validPayload), routeParams("ws-1"));
      const body = await response.json();

      expect(response.status).toBe(409);
      expect(body.error).toBe("Registration is currently busy. Please try again.");
    });
  });

  /* ======================================================================== */
  /*  14. Thank-you redirect helper integration (BUG-MAY13-3 Task A3)         */
  /* ======================================================================== */

  describe("thank-you redirect helper integration (BUG-MAY13-3 Task A3)", () => {
    const ORIGINAL_ENV = process.env;
    const APP_URL = "https://scaling-up-platform-v2.vercel.app";

    beforeEach(() => {
      process.env = {
        ...ORIGINAL_ENV,
        APP_URL,
        NODE_ENV: "test",
      };
    });

    afterEach(() => {
      process.env = ORIGINAL_ENV;
    });

    it("free path + published THANK_YOU exists → JSON redirectUrl is the per-workshop slug URL (no query string)", async () => {
      const workshop = makeFreeWorkshop();
      const registration = makeRegistration();

      (createWorkshopRegistration as jest.Mock).mockResolvedValue({
        registration,
        workshop,
      });
      (db.landingPage.findFirst as jest.Mock).mockResolvedValue({
        slug: "ws-2026-a1b2-thank-you",
      });

      const response = await POST(buildJsonRequest(validPayload), routeParams("ws-1"));
      const body = await response.json();

      expect(response.status).toBe(201);
      expect(body.success).toBe(true);
      expect(body.redirectUrl).toBe(`${APP_URL}/workshop/ws-2026-a1b2-thank-you`);

      // Helper called with workshop.id, not the param id
      expect(db.landingPage.findFirst).toHaveBeenCalledWith({
        where: { workshopId: "ws-1", template: "THANK_YOU", status: "PUBLISHED" },
        select: { slug: true },
      });
    });

    it("free path + NO published THANK_YOU → JSON redirectUrl falls back to /registration/success?id=<regId>", async () => {
      const workshop = makeFreeWorkshop();
      const registration = makeRegistration();

      (createWorkshopRegistration as jest.Mock).mockResolvedValue({
        registration,
        workshop,
      });
      (db.landingPage.findFirst as jest.Mock).mockResolvedValue(null);

      const response = await POST(buildJsonRequest(validPayload), routeParams("ws-1"));
      const body = await response.json();

      expect(response.status).toBe(201);
      expect(body.redirectUrl).toBe(`${APP_URL}/registration/success?id=reg-1`);
    });

    it("paid path + published THANK_YOU exists → createCheckoutSession called with successUrl pointing to /workshop/<slug>?session_id={CHECKOUT_SESSION_ID}", async () => {
      const workshop = makePaidWorkshop();
      const registration = makeRegistration({
        workshopId: "ws-2",
        paymentStatus: "PENDING",
      });

      (createWorkshopRegistration as jest.Mock).mockResolvedValue({
        registration,
        workshop,
      });
      (createCheckoutSession as jest.Mock).mockResolvedValue({
        id: "cs_test_thankyou",
        url: "https://checkout.stripe.com/test-session-thankyou",
      });
      (db.landingPage.findFirst as jest.Mock).mockResolvedValue({
        slug: "ws-2026-paid-thank-you",
      });

      await POST(buildJsonRequest(validPayload), routeParams("ws-2"));

      expect(createCheckoutSession).toHaveBeenCalledWith(
        expect.objectContaining({
          successUrl: `${APP_URL}/workshop/ws-2026-paid-thank-you?session_id={CHECKOUT_SESSION_ID}`,
        })
      );
    });

    it("paid path + NO published THANK_YOU → createCheckoutSession called with successUrl falling back to /registration/success?session_id={CHECKOUT_SESSION_ID}", async () => {
      const workshop = makePaidWorkshop();
      const registration = makeRegistration({
        workshopId: "ws-2",
        paymentStatus: "PENDING",
      });

      (createWorkshopRegistration as jest.Mock).mockResolvedValue({
        registration,
        workshop,
      });
      (createCheckoutSession as jest.Mock).mockResolvedValue({
        id: "cs_test_fallback",
        url: "https://checkout.stripe.com/test-session-fallback",
      });
      (db.landingPage.findFirst as jest.Mock).mockResolvedValue(null);

      await POST(buildJsonRequest(validPayload), routeParams("ws-2"));

      expect(createCheckoutSession).toHaveBeenCalledWith(
        expect.objectContaining({
          successUrl: `${APP_URL}/registration/success?session_id={CHECKOUT_SESSION_ID}`,
        })
      );
    });
  });
});
