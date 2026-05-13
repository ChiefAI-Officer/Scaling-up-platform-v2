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
    // BUG-MAY13-3 Task A2: POST handler now calls
    // resolveRegistrationSuccessUrl which queries landingPage.findFirst.
    landingPage: {
      findFirst: jest.fn().mockResolvedValue(null),
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

import { GET, POST } from "@/app/api/registrations/route";
import { withRateLimit } from "@/lib/rate-limit";
import { createRegistrationSchema } from "@/lib/validations";
import {
  createWorkshopRegistration,
  RegistrationServiceError,
} from "@/lib/registration-service";
import { db } from "@/lib/db";
import { canManageCoachData, getApiActor } from "@/lib/auth/authorization";

function buildRequest(body: Record<string, unknown>): Request {
  return new Request("http://localhost/api/registrations", {
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

describe("POST /api/registrations", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (withRateLimit as jest.Mock).mockResolvedValue({
      allowed: true,
      headers: { "x-ratelimit-limit": "10" },
    });
  });

  it("returns 429 when rate limit is exceeded", async () => {
    (withRateLimit as jest.Mock).mockResolvedValue({
      allowed: false,
      headers: { "retry-after": "30" },
    });

    const response = await POST(asPostRequest(buildRequest({ workshopId: "ws-1" })));

    expect(response.status).toBe(429);
    expect(response.headers.get("retry-after")).toBe("30");
  });

  it("returns 400 for schema validation failures", async () => {
    (createRegistrationSchema.safeParse as jest.Mock).mockReturnValue({
      success: false,
      error: {
        issues: [{ path: ["email"], message: "Invalid email" }],
      },
    });

    const response = await POST(
      asPostRequest(buildRequest({ workshopId: "ws-1", email: "invalid" }))
    );
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.success).toBe(false);
  });

  it("creates a registration and returns 201 for valid input", async () => {
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
      },
    });

    const response = await POST(asPostRequest(buildRequest(payload)));
    const body = await response.json();

    expect(response.status).toBe(201);
    expect(createWorkshopRegistration).toHaveBeenCalledWith(payload, {
      includeWorkshopDetails: true,
    });
    expect(body.success).toBe(true);
    expect(body.data.id).toBe("reg-1");
  });

  it("maps RegistrationServiceError to API status", async () => {
    const payload = {
      workshopId: "ws-1",
      email: "user@example.com",
      firstName: "Alex",
      lastName: "Rivera",
    };

    (createRegistrationSchema.safeParse as jest.Mock).mockReturnValue({
      success: true,
      data: payload,
    });
    (createWorkshopRegistration as jest.Mock).mockRejectedValue(
      new RegistrationServiceError(
        "DUPLICATE_REGISTRATION",
        "You are already registered for this workshop",
        409
      )
    );

    const response = await POST(asPostRequest(buildRequest(payload)));
    const body = await response.json();

    expect(response.status).toBe(409);
    expect(body.error).toBe("You are already registered for this workshop");
  });
});

describe("GET /api/registrations", () => {
  function buildGetRequest(workshopId: string): Parameters<typeof GET>[0] {
    const searchParams = new URLSearchParams({ workshopId });
    return {
      nextUrl: { searchParams },
    } as unknown as Parameters<typeof GET>[0];
  }

  beforeEach(() => {
    jest.clearAllMocks();
    (getApiActor as jest.Mock).mockResolvedValue({
      userId: "admin-1",
      email: "admin@example.com",
      role: "ADMIN",
      coachId: null,
    });
    (canManageCoachData as jest.Mock).mockReturnValue(true);
    (db.workshop.findUnique as jest.Mock).mockResolvedValue({
      id: "ws-1",
      coachId: "coach-1",
    });
    (db.registration.findMany as jest.Mock).mockResolvedValue([]);
    (db.registration.count as jest.Mock).mockResolvedValue(0);
  });

  it("excludes PENDING registrations from the list query", async () => {
    await GET(buildGetRequest("ws-1"));

    const findManyCall = (db.registration.findMany as jest.Mock).mock.calls[0][0];
    expect(findManyCall.where).toEqual(
      expect.objectContaining({
        paymentStatus: { not: "PENDING" },
      })
    );
  });

  it("also excludes PENDING from the count query", async () => {
    await GET(buildGetRequest("ws-1"));

    const countCall = (db.registration.count as jest.Mock).mock.calls[0][0];
    expect(countCall.where).toEqual(
      expect.objectContaining({
        paymentStatus: { not: "PENDING" },
      })
    );
  });
});
