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
      findMany: jest.fn(),
      count: jest.fn(),
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
    coach: {
      findUnique: jest.fn(),
    },
    workshopType: {
      findUnique: jest.fn(),
    },
  },
}));

jest.mock("@/lib/authorization", () => ({
  getApiActor: jest.fn(),
  isPrivilegedRole: (role: string) => role === "ADMIN" || role === "STAFF",
}));

import { GET, POST } from "@/app/api/workshops/route";
import { db } from "@/lib/db";
import { getApiActor } from "@/lib/authorization";

function asPostRequest(request: Request): Parameters<typeof POST>[0] {
  return request as unknown as Parameters<typeof POST>[0];
}

function buildWorkshopPayload(eventDate: string) {
  return {
    workshopTypeId: "wt-1",
    coachId: "coach-1",
    title: "Scaling Up Growth Workshop",
    description: "Quarterly growth session",
    format: "IN_PERSON",
    eventDate,
    eventTime: "09:00",
    timezone: "America/New_York",
    isFree: true,
    maxAttendees: 40,
  };
}

function buildGetRequest(url: string): Parameters<typeof GET>[0] {
  return {
    nextUrl: new URL(url),
  } as unknown as Parameters<typeof GET>[0];
}

describe("Workshops API", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("GET /api/workshops", () => {
    it("blocks coaches from querying other coaches data", async () => {
      (getApiActor as jest.Mock).mockResolvedValue({
        userId: "user-1",
        email: "coach@example.com",
        role: "COACH",
        coachId: "coach-1",
      });

      const response = await GET(
        buildGetRequest("http://localhost/api/workshops?coachId=coach-2")
      );

      expect(response.status).toBe(403);
      expect(db.workshop.findMany).not.toHaveBeenCalled();
    });
  });

  describe("POST /api/workshops", () => {
    it("rejects workshops below minimum lead time", async () => {
      (getApiActor as jest.Mock).mockResolvedValue({
        userId: "admin-1",
        email: "admin@example.com",
        role: "ADMIN",
        coachId: null,
      });

      const fiveDaysFromNow = new Date(
        Date.now() + 5 * 24 * 60 * 60 * 1000
      ).toISOString();
      const payload = buildWorkshopPayload(fiveDaysFromNow);

      const response = await POST(
        asPostRequest(
          new Request("http://localhost/api/workshops", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify(payload),
          })
        )
      );
      const body = await response.json();

      expect(response.status).toBe(409);
      expect(body.requiresApproval).toBe(true);
    });

    it("creates workshop when lead time and certification checks pass", async () => {
      (getApiActor as jest.Mock).mockResolvedValue({
        userId: "admin-1",
        email: "admin@example.com",
        role: "ADMIN",
        coachId: null,
      });
      (db.coach.findUnique as jest.Mock).mockResolvedValue({
        id: "coach-1",
        certifications: [{ id: "cert-1", status: "ACTIVE" }],
      });
      (db.workshopType.findUnique as jest.Mock).mockResolvedValue({
        id: "wt-1",
        slug: "scaling-up",
      });
      (db.workshop.create as jest.Mock).mockResolvedValue({
        id: "ws-1",
        title: "Scaling Up Growth Workshop",
      });
      (db.workshop.update as jest.Mock).mockResolvedValue({
        id: "ws-1",
        landingPageSlug: "scaling-up-growth-workshop-ws-1",
      });

      const thirtyDaysFromNow = new Date(
        Date.now() + 30 * 24 * 60 * 60 * 1000
      ).toISOString();
      const payload = buildWorkshopPayload(thirtyDaysFromNow);

      const response = await POST(
        asPostRequest(
          new Request("http://localhost/api/workshops", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify(payload),
          })
        )
      );

      expect(response.status).toBe(201);
      expect(db.workshop.create).toHaveBeenCalled();
      expect(db.workshop.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: "ws-1" },
        })
      );
    });
  });
});
