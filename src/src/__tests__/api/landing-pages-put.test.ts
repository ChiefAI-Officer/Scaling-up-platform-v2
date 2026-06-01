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
    pageTemplate: {
      findMany: jest.fn().mockResolvedValue([]),
      findFirst: jest.fn().mockResolvedValue(null),
    },
  },
}));

jest.mock("@/lib/auth/authorization", () => ({
  getApiActor: jest.fn(),
  canManageCoachData: jest.fn(),
  isPrivilegedRole: (role: string) => role === "ADMIN" || role === "STAFF",
}));

// TEMPLATE-02: buildWorkshopVariables drives the customHtml interpolation
jest.mock("@/lib/templates/template-interpolation", () => ({
  buildWorkshopVariables: jest.fn().mockResolvedValue({
    workshop_title: "Test Workshop",
    coach_name: "Test Coach",
  }),
}));

// TEMPLATE-02: real escape-and-substitute so XSS-safe interpolation is observable
jest.mock("@/lib/templates/interpolate-content-html", () => {
  const escapeHtml = (value: string): string =>
    value
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#x27;");
  return {
    interpolateContentForHtml: jest.fn(
      (template: string, variables: Record<string, string | null | undefined>) => {
        let out = template;
        for (const [key, raw] of Object.entries(variables)) {
          const value = raw == null ? "" : raw;
          const escaped = escapeHtml(value);
          out = out.split(`{{${key}}}`).join(escaped);
          out = out.split(`{{ ${key} }}`).join(escaped);
        }
        return out;
      }
    ),
  };
});

// TEMPLATE-02: sanitize is invoked on inbound customHtml override
jest.mock("@/lib/templates/sanitize-custom-html", () => ({
  sanitizeCustomHtml: jest.fn((input: string) => ({
    sanitized: input,
    didStripContent: false,
    strippedTags: [],
    strippedAttrs: [],
  })),
  FRAME_SRC_ALLOWLIST: [],
}));

// validateCustomCode is invoked only when customCode is sent — stub harmless
jest.mock("@/lib/templates/interpolate-custom-code", () => ({
  validateCustomCode: jest.fn(() => ({ valid: true })),
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

  // -------------------------------------------------------------------------
  // TEMPLATE-02: customHtml copy-through + eligibility + admin override
  // -------------------------------------------------------------------------
  describe("TEMPLATE-02 customHtml", () => {
    it("copies + interpolates customHtml from matching PageTemplate on SOLO_LANDING CREATE", async () => {
      (getApiActor as jest.Mock).mockResolvedValue(adminActor);
      (canManageCoachData as jest.Mock).mockReturnValue(true);
      (db.workshop.findUnique as jest.Mock).mockResolvedValue(fakeWorkshop);
      (db.landingPage.findUnique as jest.Mock).mockResolvedValue(null);
      (db.pageTemplate.findMany as jest.Mock).mockResolvedValue([
        {
          customCode: null,
          customHtml: "<p>Hello {{workshop_title}}</p>",
          categoryId: null,
        },
      ]);
      (db.landingPage.create as jest.Mock).mockImplementation((args: any) =>
        Promise.resolve({ id: "lp-1", ...args.data })
      );

      const response = await PUT(
        buildPutRequest("workshop-1", "SOLO_LANDING", {
          content: { hero: "x" },
          status: "DRAFT",
        }),
        routeParams("workshop-1", "SOLO_LANDING")
      );

      expect(response.status).toBe(200);
      const created = (db.landingPage.create as jest.Mock).mock.calls[0][0];
      expect(created.data.customHtml).toBe("<p>Hello Test Workshop</p>");
    });

    it("writes customHtml=null on REGISTRATION CREATE even if PageTemplate has customHtml (eligibility filter)", async () => {
      (getApiActor as jest.Mock).mockResolvedValue(adminActor);
      (canManageCoachData as jest.Mock).mockReturnValue(true);
      (db.workshop.findUnique as jest.Mock).mockResolvedValue(fakeWorkshop);
      (db.landingPage.findUnique as jest.Mock).mockResolvedValue(null);
      (db.pageTemplate.findMany as jest.Mock).mockResolvedValue([
        {
          customCode: null,
          customHtml: "<p>not eligible</p>",
          categoryId: null,
        },
      ]);
      (db.landingPage.create as jest.Mock).mockImplementation((args: any) =>
        Promise.resolve({ id: "lp-reg", ...args.data })
      );

      const response = await PUT(
        buildPutRequest("workshop-1", "REGISTRATION", {
          content: { hero: "x" },
          status: "DRAFT",
        }),
        routeParams("workshop-1", "REGISTRATION")
      );

      expect(response.status).toBe(200);
      const created = (db.landingPage.create as jest.Mock).mock.calls[0][0];
      expect(created.data.customHtml).toBeNull();
    });

    // Fix-1: customHtml from coach-accessible PUT request body is REMOVED.
    // The PUT route is gated by canManageCoachData, not isPrivilegedRole — so
    // any coach could otherwise stuff sanitized HTML into their LandingPage row.
    // Custom HTML is admin-controlled via the page-templates PATCH route only.
    it("ignores customHtml in request body — only template-copy survives on SOLO_LANDING CREATE", async () => {
      (getApiActor as jest.Mock).mockResolvedValue(adminActor);
      (canManageCoachData as jest.Mock).mockReturnValue(true);
      (db.workshop.findUnique as jest.Mock).mockResolvedValue(fakeWorkshop);
      (db.landingPage.findUnique as jest.Mock).mockResolvedValue(null);
      (db.pageTemplate.findMany as jest.Mock).mockResolvedValue([
        {
          customCode: null,
          customHtml: "<p>FROM TEMPLATE</p>",
          categoryId: null,
        },
      ]);
      (db.landingPage.create as jest.Mock).mockImplementation((args: any) =>
        Promise.resolve({ id: "lp-1", ...args.data })
      );

      const response = await PUT(
        buildPutRequest("workshop-1", "SOLO_LANDING", {
          content: { hero: "x" },
          status: "DRAFT",
          customHtml: "<p>FROM BODY</p>",
        }),
        routeParams("workshop-1", "SOLO_LANDING")
      );

      expect(response.status).toBe(200);
      const created = (db.landingPage.create as jest.Mock).mock.calls[0][0];
      // Body customHtml is silently dropped; only the admin-blessed template copy is stored.
      expect(created.data.customHtml).toBe("<p>FROM TEMPLATE</p>");
    });

    it("ignores customHtml in request body on UPDATE — customHtml column not written", async () => {
      (getApiActor as jest.Mock).mockResolvedValue(adminActor);
      (canManageCoachData as jest.Mock).mockReturnValue(true);
      (db.workshop.findUnique as jest.Mock).mockResolvedValue(fakeWorkshop);
      (db.landingPage.findUnique as jest.Mock).mockResolvedValue({
        id: "lp-1",
        workshopId: "workshop-1",
        template: "SOLO_LANDING",
        slug: "x",
        content: "{}",
        status: "DRAFT",
        publishedAt: null,
      });
      (db.landingPage.update as jest.Mock).mockImplementation((args: any) =>
        Promise.resolve({ id: "lp-1", ...args.data })
      );

      const response = await PUT(
        buildPutRequest("workshop-1", "SOLO_LANDING", {
          content: { hero: "x" },
          status: "DRAFT",
          customHtml: "<p>FROM BODY</p>",
        }),
        routeParams("workshop-1", "SOLO_LANDING")
      );

      expect(response.status).toBe(200);
      const updated = (db.landingPage.update as jest.Mock).mock.calls[0][0];
      expect(updated.data).not.toHaveProperty("customHtml");
    });
  });
});
