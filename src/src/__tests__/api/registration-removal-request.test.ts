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
    },
    approvalQueue: {
      findFirst: jest.fn(),
      create: jest.fn(),
    },
  },
}));

jest.mock("@/lib/authorization", () => ({
  getApiActor: jest.fn(),
  canManageCoachData: jest.fn(),
}));

jest.mock("@/lib/rate-limit", () => ({
  RateLimits: {
    standard: { limit: 100, window: 60000 },
  },
  withRateLimit: jest.fn(),
}));

import { POST } from "@/app/api/registrations/[id]/removal-request/route";
import { db } from "@/lib/db";
import { canManageCoachData, getApiActor } from "@/lib/authorization";
import { withRateLimit } from "@/lib/rate-limit";

function buildRequest(body: Record<string, unknown>): Request {
  return new Request("http://localhost/api/registrations/reg-1/removal-request", {
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
  firstName: "Alex",
  lastName: "Rivera",
  email: "alex@example.com",
  workshopId: "ws-1",
  workshop: {
    id: "ws-1",
    title: "Scaling Up Masterclass",
    coachId: "coach-1",
    eventDate: new Date("2026-03-01T10:00:00.000Z"),
  },
};

describe("POST /api/registrations/[id]/removal-request", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (withRateLimit as jest.Mock).mockResolvedValue({
      allowed: true,
      headers: { "x-ratelimit-limit": "100" },
    });
    (getApiActor as jest.Mock).mockResolvedValue({
      userId: "user-1",
      email: "coach@example.com",
      role: "COACH",
      coachId: "coach-1",
    });
    (canManageCoachData as jest.Mock).mockReturnValue(true);
    (db.registration.findUnique as jest.Mock).mockResolvedValue(baseRegistration);
    (db.approvalQueue.findFirst as jest.Mock).mockResolvedValue(null);
    (db.approvalQueue.create as jest.Mock).mockResolvedValue({ id: "apr-1" });
  });

  it("returns 401 when unauthenticated", async () => {
    (getApiActor as jest.Mock).mockResolvedValue(null);

    const response = await POST(asPostRequest(buildRequest({})), {
      params: Promise.resolve({ id: "reg-1" }),
    });

    expect(response.status).toBe(401);
  });

  it("returns 404 when registration is not found", async () => {
    (db.registration.findUnique as jest.Mock).mockResolvedValue(null);

    const response = await POST(asPostRequest(buildRequest({})), {
      params: Promise.resolve({ id: "reg-1" }),
    });

    expect(response.status).toBe(404);
  });

  it("returns 404 when actor cannot access the registration", async () => {
    (canManageCoachData as jest.Mock).mockReturnValue(false);

    const response = await POST(asPostRequest(buildRequest({})), {
      params: Promise.resolve({ id: "reg-1" }),
    });

    expect(response.status).toBe(404);
  });

  it("returns 409 when pending removal request already exists", async () => {
    (db.approvalQueue.findFirst as jest.Mock).mockResolvedValue({ id: "apr-existing" });

    const response = await POST(asPostRequest(buildRequest({})), {
      params: Promise.resolve({ id: "reg-1" }),
    });
    const body = await response.json();

    expect(response.status).toBe(409);
    expect(body.success).toBe(false);
    expect(body.approvalId).toBe("apr-existing");
  });

  it("creates a cancellation approval request for attendee removal", async () => {
    const response = await POST(
      asPostRequest(buildRequest({ reason: "Competitor attendee request" })),
      {
        params: Promise.resolve({ id: "reg-1" }),
      }
    );
    const body = await response.json();

    expect(response.status).toBe(201);
    expect(body.success).toBe(true);
    expect(db.approvalQueue.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          type: "CANCELLATION",
          coachId: "coach-1",
          workshopId: "ws-1",
          requestedBy: "coach@example.com",
        }),
      })
    );
  });
});
