/**
 * Tests for PUT /api/workshops/[id]/landing-pages/[template]
 *
 * Covers: REGISTRATION and THANK_YOU templates (AP-02, AP-03 bug investigation).
 * These templates were reported to return 400 on save. Tests here validate the
 * correct path (200) and the expected 400 paths (invalid template, invalid body).
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
    landingPage: {
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
  },
}));

jest.mock("@/lib/auth/authorization", () => ({
  getApiActor: jest.fn(),
  canManageCoachData: jest.fn(),
}));

import { PUT } from "@/app/api/workshops/[id]/landing-pages/[template]/route";
import { db } from "@/lib/db";
import { getApiActor, canManageCoachData } from "@/lib/auth/authorization";

const adminActor = {
  userId: "admin-user",
  email: "admin@example.com",
  role: "ADMIN",
  coachId: null,
};

const fakeWorkshop = {
  id: "workshop-1",
  title: "Test Workshop",
  coachId: "coach-1",
};

function buildPutRequest(
  workshopId: string,
  template: string,
  body: Record<string, unknown>
): Parameters<typeof PUT>[0] {
  return new Request(
    `http://localhost/api/workshops/${workshopId}/landing-pages/${template}`,
    {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }
  ) as unknown as Parameters<typeof PUT>[0];
}

function routeParams(workshopId: string, template: string) {
  return { params: Promise.resolve({ id: workshopId, template }) };
}

describe("PUT /api/workshops/[id]/landing-pages/[template]", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("REGISTRATION template (AP-02)", () => {
    it("returns 401 when unauthenticated", async () => {
      (getApiActor as jest.Mock).mockResolvedValue(null);

      const response = await PUT(
        buildPutRequest("workshop-1", "REGISTRATION", {
          content: { heroHeadline: "Test" },
          status: "DRAFT",
        }),
        routeParams("workshop-1", "REGISTRATION")
      );

      expect(response.status).toBe(401);
    });

    it("returns 200 for REGISTRATION with valid payload — CREATE path", async () => {
      (getApiActor as jest.Mock).mockResolvedValue(adminActor);
      (canManageCoachData as jest.Mock).mockReturnValue(true);
      (db.workshop.findUnique as jest.Mock).mockResolvedValue(fakeWorkshop);
      (db.landingPage.findUnique as jest.Mock).mockResolvedValue(null);
      (db.landingPage.create as jest.Mock).mockResolvedValue({
        id: "lp-1",
        workshopId: "workshop-1",
        template: "REGISTRATION",
        slug: "test-workshop-registration-abc123",
        content: JSON.stringify({ heroHeadline: "Test" }),
        status: "DRAFT",
        publishedAt: null,
      });

      const response = await PUT(
        buildPutRequest("workshop-1", "REGISTRATION", {
          content: { heroHeadline: "Test" },
          status: "DRAFT",
        }),
        routeParams("workshop-1", "REGISTRATION")
      );
      const body = await response.json();

      expect(response.status).toBe(200);
      expect(body.success).toBe(true);
    });

    it("returns 200 for REGISTRATION with valid payload — UPDATE path", async () => {
      (getApiActor as jest.Mock).mockResolvedValue(adminActor);
      (canManageCoachData as jest.Mock).mockReturnValue(true);
      (db.workshop.findUnique as jest.Mock).mockResolvedValue(fakeWorkshop);
      (db.landingPage.findUnique as jest.Mock).mockResolvedValue({
        id: "lp-1",
        workshopId: "workshop-1",
        template: "REGISTRATION",
        slug: "test-workshop-registration-abc123",
        content: JSON.stringify({ heroHeadline: "Old Headline" }),
        status: "DRAFT",
        publishedAt: null,
      });
      (db.landingPage.update as jest.Mock).mockResolvedValue({
        id: "lp-1",
        workshopId: "workshop-1",
        template: "REGISTRATION",
        slug: "test-workshop-registration-abc123",
        content: JSON.stringify({ heroHeadline: "New Headline" }),
        status: "DRAFT",
        publishedAt: null,
      });

      const response = await PUT(
        buildPutRequest("workshop-1", "REGISTRATION", {
          content: { heroHeadline: "New Headline" },
          status: "DRAFT",
        }),
        routeParams("workshop-1", "REGISTRATION")
      );
      const body = await response.json();

      expect(response.status).toBe(200);
      expect(body.success).toBe(true);
    });

    it("returns 200 when publishing REGISTRATION page", async () => {
      (getApiActor as jest.Mock).mockResolvedValue(adminActor);
      (canManageCoachData as jest.Mock).mockReturnValue(true);
      (db.workshop.findUnique as jest.Mock).mockResolvedValue(fakeWorkshop);
      (db.landingPage.findUnique as jest.Mock).mockResolvedValue(null);
      (db.landingPage.create as jest.Mock).mockResolvedValue({
        id: "lp-1",
        workshopId: "workshop-1",
        template: "REGISTRATION",
        slug: "test-workshop-registration-abc123",
        content: JSON.stringify({ heroHeadline: "Test" }),
        status: "PUBLISHED",
        publishedAt: new Date(),
      });

      const response = await PUT(
        buildPutRequest("workshop-1", "REGISTRATION", {
          content: { heroHeadline: "Test" },
          status: "PUBLISHED",
        }),
        routeParams("workshop-1", "REGISTRATION")
      );
      const body = await response.json();

      expect(response.status).toBe(200);
      expect(body.success).toBe(true);
    });
  });

  describe("THANK_YOU template (AP-03)", () => {
    it("returns 200 for THANK_YOU with valid payload — CREATE path", async () => {
      (getApiActor as jest.Mock).mockResolvedValue(adminActor);
      (canManageCoachData as jest.Mock).mockReturnValue(true);
      (db.workshop.findUnique as jest.Mock).mockResolvedValue(fakeWorkshop);
      (db.landingPage.findUnique as jest.Mock).mockResolvedValue(null);
      (db.landingPage.create as jest.Mock).mockResolvedValue({
        id: "lp-2",
        workshopId: "workshop-1",
        template: "THANK_YOU",
        slug: "test-workshop-thank-you-abc123",
        content: JSON.stringify({ headline: "Thank you!" }),
        status: "DRAFT",
        publishedAt: null,
      });

      const response = await PUT(
        buildPutRequest("workshop-1", "THANK_YOU", {
          content: {
            headline: "Thank you for Registering",
            subheadline: "You'll receive an email shortly.",
            videoUrl: "",
            additionalMessage: "",
            calendarReminderText: "Add this event to your calendar",
          },
          status: "DRAFT",
        }),
        routeParams("workshop-1", "THANK_YOU")
      );
      const body = await response.json();

      expect(response.status).toBe(200);
      expect(body.success).toBe(true);
    });

    it("returns 200 for THANK_YOU — UPDATE path", async () => {
      (getApiActor as jest.Mock).mockResolvedValue(adminActor);
      (canManageCoachData as jest.Mock).mockReturnValue(true);
      (db.workshop.findUnique as jest.Mock).mockResolvedValue(fakeWorkshop);
      (db.landingPage.findUnique as jest.Mock).mockResolvedValue({
        id: "lp-2",
        workshopId: "workshop-1",
        template: "THANK_YOU",
        slug: "test-workshop-thank-you-abc123",
        content: JSON.stringify({ headline: "Old Headline" }),
        status: "DRAFT",
        publishedAt: null,
      });
      (db.landingPage.update as jest.Mock).mockResolvedValue({
        id: "lp-2",
        workshopId: "workshop-1",
        template: "THANK_YOU",
        slug: "test-workshop-thank-you-abc123",
        content: JSON.stringify({ headline: "New Headline" }),
        status: "DRAFT",
        publishedAt: null,
      });

      const response = await PUT(
        buildPutRequest("workshop-1", "THANK_YOU", {
          content: { headline: "New Headline" },
          status: "DRAFT",
        }),
        routeParams("workshop-1", "THANK_YOU")
      );
      const body = await response.json();

      expect(response.status).toBe(200);
      expect(body.success).toBe(true);
    });
  });

  describe("template validation", () => {
    it("returns 400 for an unknown template string", async () => {
      (getApiActor as jest.Mock).mockResolvedValue(adminActor);

      const response = await PUT(
        buildPutRequest("workshop-1", "INVALID_TEMPLATE", {
          content: {},
          status: "DRAFT",
        }),
        routeParams("workshop-1", "INVALID_TEMPLATE")
      );

      expect(response.status).toBe(400);
    });

    it("normalizes lowercase registration to REGISTRATION (200)", async () => {
      (getApiActor as jest.Mock).mockResolvedValue(adminActor);
      (canManageCoachData as jest.Mock).mockReturnValue(true);
      (db.workshop.findUnique as jest.Mock).mockResolvedValue(fakeWorkshop);
      (db.landingPage.findUnique as jest.Mock).mockResolvedValue(null);
      (db.landingPage.create as jest.Mock).mockResolvedValue({
        id: "lp-3",
        workshopId: "workshop-1",
        template: "REGISTRATION",
        slug: "test-registration-abc123",
        content: JSON.stringify({}),
        status: "DRAFT",
        publishedAt: null,
      });

      const response = await PUT(
        buildPutRequest("workshop-1", "registration", {
          content: {},
          status: "DRAFT",
        }),
        routeParams("workshop-1", "registration")
      );

      expect(response.status).toBe(200);
    });

    it("normalizes kebab-case thank-you to THANK_YOU (200)", async () => {
      (getApiActor as jest.Mock).mockResolvedValue(adminActor);
      (canManageCoachData as jest.Mock).mockReturnValue(true);
      (db.workshop.findUnique as jest.Mock).mockResolvedValue(fakeWorkshop);
      (db.landingPage.findUnique as jest.Mock).mockResolvedValue(null);
      (db.landingPage.create as jest.Mock).mockResolvedValue({
        id: "lp-4",
        workshopId: "workshop-1",
        template: "THANK_YOU",
        slug: "test-thank-you-abc123",
        content: JSON.stringify({}),
        status: "DRAFT",
        publishedAt: null,
      });

      const response = await PUT(
        buildPutRequest("workshop-1", "thank-you", {
          content: {},
          status: "DRAFT",
        }),
        routeParams("workshop-1", "thank-you")
      );

      expect(response.status).toBe(200);
    });
  });

  describe("body validation", () => {
    it("returns 400 for invalid status value", async () => {
      (getApiActor as jest.Mock).mockResolvedValue(adminActor);

      const response = await PUT(
        buildPutRequest("workshop-1", "REGISTRATION", {
          content: {},
          status: "INVALID_STATUS",
        }),
        routeParams("workshop-1", "REGISTRATION")
      );

      expect(response.status).toBe(400);
    });
  });

  describe("access control", () => {
    it("returns 404 when workshop is not found", async () => {
      (getApiActor as jest.Mock).mockResolvedValue(adminActor);
      (canManageCoachData as jest.Mock).mockReturnValue(true);
      (db.workshop.findUnique as jest.Mock).mockResolvedValue(null);

      const response = await PUT(
        buildPutRequest("nonexistent-workshop", "REGISTRATION", {
          content: {},
          status: "DRAFT",
        }),
        routeParams("nonexistent-workshop", "REGISTRATION")
      );

      expect(response.status).toBe(404);
    });

    it("returns 404 when coach tries to access another coach's workshop", async () => {
      (getApiActor as jest.Mock).mockResolvedValue({
        userId: "coach-user",
        email: "coach@example.com",
        role: "COACH",
        coachId: "coach-2", // different from workshop.coachId
      });
      (canManageCoachData as jest.Mock).mockReturnValue(false);
      (db.workshop.findUnique as jest.Mock).mockResolvedValue({
        id: "workshop-1",
        title: "Test Workshop",
        coachId: "coach-1", // different from actor.coachId
      });

      const response = await PUT(
        buildPutRequest("workshop-1", "REGISTRATION", {
          content: {},
          status: "DRAFT",
        }),
        routeParams("workshop-1", "REGISTRATION")
      );

      expect(response.status).toBe(404);
    });
  });
});
