/**
 * Integration tests: POST /api/registrations response body includes
 * `redirectUrl` computed via `resolveRegistrationSuccessUrl`.
 *
 * BUG-MAY13-3 / Wave A Task A2.
 *
 * Two cases:
 *   1. Published THANK_YOU LandingPage exists → redirectUrl is the per-workshop
 *      `<appUrl>/workshop/<slug>` form.
 *   2. No published THANK_YOU LandingPage → redirectUrl falls back to
 *      `<appUrl>/registration/success?id=<regId>`.
 */

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
    },
    registration: {
      findMany: jest.fn(),
      count: jest.fn(),
    },
    landingPage: {
      findFirst: jest.fn(),
    },
  },
}));

jest.mock("@/lib/auth/authorization", () => ({
  canManageCoachData: jest.fn(),
  getApiActor: jest.fn(),
  isPrivilegedRole: jest.fn((role: string) => role === "ADMIN" || role === "STAFF"),
}));

jest.mock("@/lib/rate-limit", () => ({
  RateLimits: {
    registration: { limit: 10, window: 60000 },
  },
  withRateLimit: jest.fn(),
}));

jest.mock("@/lib/validations", () => ({
  createRegistrationSchema: {
    safeParse: jest.fn(),
  },
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

  return {
    createWorkshopRegistration: jest.fn(),
    RegistrationServiceError: MockRegistrationServiceError,
  };
});

import { POST } from "@/app/api/registrations/route";
import { withRateLimit } from "@/lib/rate-limit";
import { createRegistrationSchema } from "@/lib/validations";
import { createWorkshopRegistration } from "@/lib/registration-service";
import { db } from "@/lib/db";

function buildRequest(body: Record<string, unknown>): Parameters<typeof POST>[0] {
  return new Request("http://localhost/api/registrations", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  }) as unknown as Parameters<typeof POST>[0];
}

const APP_URL = "https://scaling-up-platform-v2.vercel.app";

describe("POST /api/registrations — redirectUrl in response (BUG-MAY13-3 Task A2)", () => {
  const ORIGINAL_ENV = process.env;

  beforeEach(() => {
    jest.clearAllMocks();
    process.env = {
      ...ORIGINAL_ENV,
      APP_URL,
      NODE_ENV: "test",
    };
    (withRateLimit as jest.Mock).mockResolvedValue({
      allowed: true,
      headers: { "x-ratelimit-limit": "10" },
    });

    const payload = {
      workshopId: "ws-1",
      email: "user@example.com",
      firstName: "Alex",
      lastName: "Rivera",
      company: "Scaling Up",
    };
    (createRegistrationSchema.safeParse as jest.Mock).mockReturnValue({
      success: true,
      data: payload,
    });
    (createWorkshopRegistration as jest.Mock).mockResolvedValue({
      registration: {
        id: "reg-1",
        workshopId: "ws-1",
        email: "user@example.com",
        firstName: "Alex",
        paymentStatus: "FREE",
      },
    });
  });

  afterEach(() => {
    process.env = ORIGINAL_ENV;
  });

  it("includes redirectUrl pointing to /workshop/<slug> when a published THANK_YOU exists", async () => {
    (db.landingPage.findFirst as jest.Mock).mockResolvedValue({
      slug: "ws-2026-a1b2-thank-you",
    });

    const response = await POST(buildRequest({ workshopId: "ws-1" }));
    const body = await response.json();

    expect(response.status).toBe(201);
    expect(body.success).toBe(true);
    expect(body.redirectUrl).toBe(`${APP_URL}/workshop/ws-2026-a1b2-thank-you`);

    // Helper was queried with the right workshopId + filter.
    expect(db.landingPage.findFirst).toHaveBeenCalledWith({
      where: { workshopId: "ws-1", template: "THANK_YOU", status: "PUBLISHED" },
      select: { slug: true },
    });
  });

  it("falls back to /registration/success?id=<regId> when no published THANK_YOU exists", async () => {
    (db.landingPage.findFirst as jest.Mock).mockResolvedValue(null);

    const response = await POST(buildRequest({ workshopId: "ws-1" }));
    const body = await response.json();

    expect(response.status).toBe(201);
    expect(body.success).toBe(true);
    expect(body.redirectUrl).toBe(`${APP_URL}/registration/success?id=reg-1`);
  });
});
