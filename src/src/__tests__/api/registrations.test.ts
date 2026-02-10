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
  db: {},
}));

jest.mock("@/lib/authorization", () => ({
  canManageCoachData: jest.fn(),
  getApiActor: jest.fn(),
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
import {
  createWorkshopRegistration,
  RegistrationServiceError,
} from "@/lib/registration-service";

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
