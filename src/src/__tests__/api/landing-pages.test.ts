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
    landingPage: {
      findFirst: jest.fn(),
      update: jest.fn(),
      create: jest.fn(),
    },
    workshop: {
      findUnique: jest.fn(),
    },
  },
}));

jest.mock("@/lib/audit", () => ({
  logAudit: jest.fn(),
}));

jest.mock("@/lib/auth/authorization", () => ({
  getApiActor: jest.fn(),
  canManageCoachData: jest.fn(),
}));

import { GET, POST } from "@/app/api/landing-pages/route";
import { db } from "@/lib/db";
import { logAudit } from "@/lib/audit";
import { canManageCoachData, getApiActor } from "@/lib/auth/authorization";

function buildRequest(url: string, init?: RequestInit): Request {
  return new Request(url, init);
}

function asGetRequest(request: Request): Parameters<typeof GET>[0] {
  return request as unknown as Parameters<typeof GET>[0];
}

function asPostRequest(request: Request): Parameters<typeof POST>[0] {
  return request as unknown as Parameters<typeof POST>[0];
}

function makeLandingPage(overrides: Record<string, unknown> = {}) {
  return {
    id: "lp-1",
    slug: "john-smith-scaling-up-2026-02-15",
    status: "PUBLISHED",
    content: JSON.stringify({
      title: "Scaling Up Master Class",
    }),
    workshop: {
      id: "ws-1",
      coachId: "coach-1",
      title: "Scaling Up Master Class",
      eventDate: new Date("2026-02-15T15:00:00.000Z"),
      coach: {
        firstName: "John",
        lastName: "Smith",
      },
      workshopType: {
        slug: "scaling-up",
      },
    },
    ...overrides,
  };
}

function makeWorkshop(overrides: Record<string, unknown> = {}) {
  return {
    id: "ws-1",
    coachId: "coach-1",
    title: "Scaling Up Master Class",
    description: "Business growth workshop",
    eventDate: new Date("2026-02-15T15:00:00.000Z"),
    eventTime: "09:00",
    venueName: "Austin Convention Center",
    venueAddress: JSON.stringify({ street: "500 E Cesar Chavez St" }),
    priceCents: 49500,
    stripeProductId: "prod_123",
    stripePriceId: "price_123",
    coach: {
      firstName: "John",
      lastName: "Smith",
      bio: "Coach bio",
      profileImage: "https://example.com/profile.jpg",
    },
    workshopType: {
      slug: "scaling-up",
    },
    ...overrides,
  };
}

describe("Landing Pages API", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (canManageCoachData as jest.Mock).mockReturnValue(true);
  });

  describe("GET /api/landing-pages", () => {
    it("returns 401 when unauthenticated", async () => {
      (getApiActor as jest.Mock).mockResolvedValue(null);

      const response = await GET(
        asGetRequest(buildRequest("http://localhost/api/landing-pages?slug=test"))
      );

      expect(response.status).toBe(401);
    });

    it("returns 400 when slug/workshopId is missing", async () => {
      (getApiActor as jest.Mock).mockResolvedValue({
        userId: "admin-1",
        email: "admin@example.com",
        role: "ADMIN",
        coachId: null,
      });

      const response = await GET(
        asGetRequest(buildRequest("http://localhost/api/landing-pages"))
      );

      expect(response.status).toBe(400);
    });

    it("returns 404 for unauthorized access to another coach's page", async () => {
      (getApiActor as jest.Mock).mockResolvedValue({
        userId: "coach-user",
        email: "coach@example.com",
        role: "COACH",
        coachId: "coach-2",
      });
      (db.landingPage.findFirst as jest.Mock).mockResolvedValue(makeLandingPage());
      (canManageCoachData as jest.Mock).mockReturnValue(false);

      const response = await GET(
        asGetRequest(
          buildRequest(
            "http://localhost/api/landing-pages?slug=john-smith-scaling-up-2026-02-15"
          )
        )
      );

      expect(response.status).toBe(404);
    });

    it("returns landing page data when authorized", async () => {
      (getApiActor as jest.Mock).mockResolvedValue({
        userId: "admin-1",
        email: "admin@example.com",
        role: "ADMIN",
        coachId: null,
      });
      (db.landingPage.findFirst as jest.Mock).mockResolvedValue(makeLandingPage());

      const response = await GET(
        asGetRequest(
          buildRequest(
            "http://localhost/api/landing-pages?slug=john-smith-scaling-up-2026-02-15"
          )
        )
      );
      const body = await response.json();

      expect(response.status).toBe(200);
      expect(body.slug).toBe("john-smith-scaling-up-2026-02-15");
      expect(body.url).toContain("/workshop/john-smith-scaling-up-2026-02-15");
      expect(body.content.title).toBe("Scaling Up Master Class");
    });
  });

  describe("POST /api/landing-pages", () => {
    it("returns 400 for invalid payload", async () => {
      (getApiActor as jest.Mock).mockResolvedValue({
        userId: "admin-1",
        email: "admin@example.com",
        role: "ADMIN",
        coachId: null,
      });
      const consoleSpy = jest.spyOn(console, "error").mockImplementation(() => {
        // suppress expected Zod validation log noise
      });

      const response = await POST(
        asPostRequest(
          buildRequest("http://localhost/api/landing-pages", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({}),
          })
        )
      );

      expect(response.status).toBe(400);
      consoleSpy.mockRestore();
    });

    it("creates a new landing page and logs audit event", async () => {
      (getApiActor as jest.Mock).mockResolvedValue({
        userId: "admin-1",
        email: "admin@example.com",
        role: "ADMIN",
        coachId: null,
      });
      (db.workshop.findUnique as jest.Mock).mockResolvedValue(makeWorkshop());
      (db.landingPage.findFirst as jest.Mock).mockResolvedValue(null);
      (db.landingPage.create as jest.Mock).mockResolvedValue({
        id: "lp-1",
        slug: "john-smith-scaling-up-2026-02-15",
      });

      const response = await POST(
        asPostRequest(
          buildRequest("http://localhost/api/landing-pages", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ workshopId: "ws-1" }),
          })
        )
      );
      const body = await response.json();

      expect(response.status).toBe(200);
      expect(db.landingPage.create).toHaveBeenCalled();
      expect(logAudit).toHaveBeenCalledWith(
        expect.objectContaining({
          entityType: "LandingPage",
          entityId: "lp-1",
          action: "CREATE",
        })
      );
      expect(body.url).toContain("/workshop/john-smith-scaling-up-2026-02-15");
    });
  });
});
