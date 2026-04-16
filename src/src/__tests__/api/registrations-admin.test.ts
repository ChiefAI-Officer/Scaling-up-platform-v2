// Mocks — must appear BEFORE any imports that reference the mocked modules

jest.mock("next/server", () => ({
  NextResponse: {
    json: (body: unknown, init?: ResponseInit) =>
      new Response(JSON.stringify(body), {
        status: init?.status || 200,
        headers: init?.headers,
      }),
  },
  NextRequest: class MockNextRequest extends Request {
    nextUrl: URL;
    constructor(input: string | URL, init?: RequestInit) {
      super(input, init);
      this.nextUrl = new URL(typeof input === "string" ? input : input.toString());
    }
  },
}));

jest.mock("@/lib/auth/authorization", () => ({
  getApiActor: jest.fn(),
  isPrivilegedRole: jest.fn((role: string) => role === "ADMIN" || role === "STAFF"),
  canManageCoachData: jest.fn((actor: { role: string; coachId: string | null }, coachId: string) => {
    if (actor.role === "ADMIN" || actor.role === "STAFF") return true;
    return actor.coachId === coachId;
  }),
}));

jest.mock("@/lib/db", () => ({
  db: {
    registration: {
      findMany: jest.fn(),
      count: jest.fn().mockResolvedValue(0),
    },
    workshop: {
      findUnique: jest.fn(),
    },
  },
}));

jest.mock("@/lib/rate-limit", () => ({
  RateLimits: { registration: { interval: 60000, maxRequests: 20 } },
  withRateLimit: jest.fn().mockResolvedValue({ allowed: true, headers: {} }),
}));

jest.mock("@/inngest/client", () => ({
  inngest: { send: jest.fn() },
}));

jest.mock("@/lib/registration-service", () => ({
  createWorkshopRegistration: jest.fn(),
  RegistrationServiceError: class RegistrationServiceError extends Error {
    status: number;
    constructor(message: string, status: number) {
      super(message);
      this.status = status;
    }
  },
}));

import { GET } from "@/app/api/registrations/route";
import { NextRequest } from "next/server";
import { getApiActor } from "@/lib/auth/authorization";
import { db } from "@/lib/db";

/** Build a minimal NextRequest that satisfies route handler expectations. */
function buildRequest(url: string): Parameters<typeof GET>[0] {
  return new NextRequest(url) as unknown as Parameters<typeof GET>[0];
}

describe("GET /api/registrations", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (db.registration.count as jest.Mock).mockResolvedValue(0);
  });

  it("admin can GET all registrations without workshopId", async () => {
    (getApiActor as jest.Mock).mockResolvedValue({ role: "ADMIN", coachId: null });
    (db.registration.findMany as jest.Mock).mockResolvedValue([
      { id: "r1", workshopId: "w1", email: "a@b.com", paymentStatus: "PAID", workshop: { title: "W1", coach: { firstName: "Jane", lastName: "Doe" } } },
      { id: "r2", workshopId: "w2", email: "c@d.com", paymentStatus: "PAID", workshop: { title: "W2", coach: { firstName: "Bob", lastName: "Smith" } } },
    ]);
    (db.registration.count as jest.Mock).mockResolvedValue(2);

    const req = buildRequest("http://localhost/api/registrations");
    const res = await GET(req);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.registrations).toHaveLength(2);
    // Admin query should not filter by coachId
    const findManyCall = (db.registration.findMany as jest.Mock).mock.calls[0][0];
    expect(findManyCall.where).not.toHaveProperty("workshop.coachId");
  });

  it("coach cannot GET registrations without workshopId — returns 400", async () => {
    (getApiActor as jest.Mock).mockResolvedValue({ role: "COACH", coachId: "coach1" });

    const req = buildRequest("http://localhost/api/registrations");
    const res = await GET(req);
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toBe("workshopId is required");
  });

  it("coach can GET registrations with workshopId — scoped to their workshops", async () => {
    (getApiActor as jest.Mock).mockResolvedValue({ role: "COACH", coachId: "coach1" });
    (db.workshop.findUnique as jest.Mock).mockResolvedValue({ id: "w1", coachId: "coach1" });
    (db.registration.findMany as jest.Mock).mockResolvedValue([
      { id: "r1", workshopId: "w1", email: "a@b.com", paymentStatus: "PAID", workshop: { title: "W1", coach: { firstName: "Jane", lastName: "Doe" } } },
    ]);
    (db.registration.count as jest.Mock).mockResolvedValue(1);

    const req = buildRequest("http://localhost/api/registrations?workshopId=w1");
    const res = await GET(req);
    expect(res.status).toBe(200);
    // Coach query should filter by workshopId
    const findManyCall = (db.registration.findMany as jest.Mock).mock.calls[0][0];
    expect(findManyCall.where).toMatchObject({ workshopId: "w1" });
    // The scoping is enforced — workshop.coachId filter is present
    expect(JSON.stringify(findManyCall.where)).toContain("coachId");
  });
});
