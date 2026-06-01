/* eslint-disable @typescript-eslint/no-explicit-any */

/**
 * TDD Tests for runAutoBuild() shared service
 *
 * Cycle 1: Pages created from active templates
 */

// --- Mocks (hoisted before imports) ---

jest.mock("@/lib/db", () => ({
  db: {
    workshop: {
      findUnique: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
    },
    landingPage: {
      findUnique: jest.fn(),
      findFirst: jest.fn(),
      create: jest.fn(),
    },
    pageTemplate: {
      findMany: jest.fn(),
    },
    workflow: {
      findFirst: jest.fn(),
      findMany: jest.fn(),
    },
    workflowAssignment: {
      findUnique: jest.fn(),
      create: jest.fn(),
    },
  },
}));

jest.mock("@/lib/templates/template-interpolation", () => ({
  buildWorkshopVariables: jest.fn(),
  interpolateContent: jest.fn((content: string) => content), // pass-through
  templateHasPlaceholders: jest.fn(() => true),
  findRemainingPlaceholders: jest.fn(() => []),
}));

// TEMPLATE-02: real interpolation for customHtml so XSS-escape + token-resolution can be asserted
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

jest.mock("@/services/notifications", () => ({
  sendWorkshopBuiltEmail: jest.fn().mockResolvedValue(undefined),
}));

jest.mock("@/inngest/client", () => ({
  inngest: {
    send: jest.fn().mockResolvedValue(undefined),
  },
}));

// --- Imports (after mocks) ---

import { runAutoBuild } from "@/lib/auto-build-service";
import { db } from "@/lib/db";
import { buildWorkshopVariables, templateHasPlaceholders } from "@/lib/templates/template-interpolation";
import { sendWorkshopBuiltEmail } from "@/services/notifications";

// --- Test Data ---

const mockWorkshop = {
  id: "ws-1",
  title: "Scaling Up Workshop",
  description: "Learn to scale",
  format: "IN_PERSON",
  workshopCode: "WS-2026-A1B2",
  eventDate: new Date("2026-06-15T09:00:00Z"),
  eventTime: "9:00 AM",
  venueName: "Conference Center",
  venueAddress: "123 Main St",
  venueInstructions: "Park in Lot B",
  virtualLink: null,
  isFree: false,
  priceCents: 50000,
  categoryId: "cat-1",
  status: "AWAITING_APPROVAL",
  coach: {
    id: "coach-1",
    email: "coach@example.com",
    firstName: "John",
    lastName: "Smith",
    bio: "Expert coach",
    profileImage: null,
    company: "Coaching Co",
  },
  workshopCategory: { id: "cat-1", name: "Leadership", slug: "leadership" },
  pricingTier: { name: "Standard", amountCents: 50000 },
};

const mockTemplates = [
  {
    id: "tpl-1",
    templateType: "SOLO_LANDING",
    content: '{"heading":"{{workshop_title}}"}',
    categoryId: null,
  },
  {
    id: "tpl-2",
    templateType: "REGISTRATION",
    content: '{"heading":"Register for {{workshop_title}}"}',
    categoryId: null,
  },
];

const mockVariables: Record<string, string> = {
  workshop_title: "Scaling Up Workshop",
  coach_name: "John Smith",
};

// --- Helpers ---

function setupSuccessScenario() {
  (db.workshop.findUnique as jest.Mock).mockResolvedValue(mockWorkshop);
  (buildWorkshopVariables as jest.Mock).mockResolvedValue(mockVariables);
  (db.pageTemplate.findMany as jest.Mock).mockResolvedValue(mockTemplates);
  (db.landingPage.findUnique as jest.Mock).mockResolvedValue(null); // no existing pages
  (db.landingPage.create as jest.Mock).mockResolvedValue({ id: "lp-new" });
  (db.workflow.findFirst as jest.Mock).mockResolvedValue(null); // no workflows (legacy)
  (db.workflow.findMany as jest.Mock).mockResolvedValue([]); // no workflow candidates
  (db.landingPage.findFirst as jest.Mock).mockResolvedValue({ slug: "test-solo-slug" });
  (db.workshop.update as jest.Mock).mockResolvedValue({ id: "ws-1" });
  (db.workshop.updateMany as jest.Mock).mockResolvedValue({ count: 1 }); // email claim succeeds
}

// --- Tests ---

describe("runAutoBuild", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("creates landing pages from active templates and returns pagesCreated", async () => {
    setupSuccessScenario();

    const result = await runAutoBuild("ws-1");

    expect(result.success).toBe(true);
    expect(result.pagesCreated).toBe(2);
    expect(result.status).toBe("PRE_EVENT");

    // Verify landing pages created with PUBLISHED status
    expect(db.landingPage.create).toHaveBeenCalledTimes(2);
    const createCalls = (db.landingPage.create as jest.Mock).mock.calls;
    expect(createCalls[0][0].data.status).toBe("PUBLISHED");
    expect(createCalls[1][0].data.status).toBe("PUBLISHED");
    expect(createCalls[0][0].data.workshopId).toBe("ws-1");
  });

  // Cycle 2: Zero templates guard
  it("returns error when no active templates exist, does NOT advance status", async () => {
    (db.workshop.findUnique as jest.Mock).mockResolvedValue(mockWorkshop);
    (buildWorkshopVariables as jest.Mock).mockResolvedValue(mockVariables);
    (db.pageTemplate.findMany as jest.Mock).mockResolvedValue([]); // no templates

    const result = await runAutoBuild("ws-1");

    expect(result.success).toBe(false);
    expect(result.pagesCreated).toBe(0);
    expect(result.error).toContain("No active PageTemplates");
    expect(result.status).toBe("AWAITING_APPROVAL");
    expect(db.workshop.update).not.toHaveBeenCalled();
    expect(sendWorkshopBuiltEmail).not.toHaveBeenCalled();
  });

  // Cycle 3: Status advancement + email
  it("advances workshop status to PRE_EVENT and sends coach notification", async () => {
    setupSuccessScenario();

    const result = await runAutoBuild("ws-1");

    expect(result.status).toBe("PRE_EVENT");
    expect(db.workshop.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "ws-1" },
        data: expect.objectContaining({ status: "PRE_EVENT" }),
      })
    );
    expect(sendWorkshopBuiltEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        coachEmail: "coach@example.com",
        workshopTitle: "Scaling Up Workshop",
        workshopId: "ws-1",
        pagesCreated: expect.arrayContaining(["SOLO_LANDING", "REGISTRATION"]),
      })
    );
  });

  // Cycle 4: Workflow assignment
  it("assigns PRE_EVENT and POST_EVENT workflows", async () => {
    (db.workshop.findUnique as jest.Mock).mockResolvedValue(mockWorkshop);
    (buildWorkshopVariables as jest.Mock).mockResolvedValue(mockVariables);
    (db.pageTemplate.findMany as jest.Mock).mockResolvedValue(mockTemplates);
    (db.landingPage.findUnique as jest.Mock).mockResolvedValue(null);
    (db.landingPage.create as jest.Mock).mockResolvedValue({ id: "lp-new" });
    (db.landingPage.findFirst as jest.Mock).mockResolvedValue({ slug: "test-slug" });
    (db.workshop.update as jest.Mock).mockResolvedValue({ id: "ws-1" });

    // Mock workflows exist — assignWorkflow now fetches templates via findMany
    // and ranks in code via findAutoAttachWorkflow. Provide one PRE_EVENT and
    // one POST_EVENT candidate, both wildcard category/format so they match
    // any workshop.
    const baseUpdatedAt = new Date("2026-05-01T00:00:00Z");
    (db.workflow.findMany as jest.Mock)
      .mockResolvedValueOnce([
        {
          id: "wf-pre",
          name: "Pre-Event Sequence",
          isActive: true,
          isTemplate: true,
          categoryId: null,
          workshopFormat: null,
          updatedAt: baseUpdatedAt,
        },
      ])
      .mockResolvedValueOnce([
        {
          id: "wf-post",
          name: "Post-Event Follow Up",
          isActive: true,
          isTemplate: true,
          categoryId: null,
          workshopFormat: null,
          updatedAt: baseUpdatedAt,
        },
      ]);
    (db.workflowAssignment.findUnique as jest.Mock).mockResolvedValue(null); // not already assigned
    (db.workflowAssignment.create as jest.Mock)
      .mockResolvedValueOnce({ id: "wa-1" })
      .mockResolvedValueOnce({ id: "wa-2" });

    const result = await runAutoBuild("ws-1");

    expect(result.success).toBe(true);
    expect(result.preEventWorkflow).toBe("Pre-Event Sequence");
    expect(result.postEventWorkflow).toBe("Post-Event Follow Up");
    expect(db.workflowAssignment.create).toHaveBeenCalledTimes(2);
  });

  // Cycle 5: Corrupted templates (no placeholders) are filtered out
  it("skips corrupted templates without placeholders and creates 0 pages", async () => {
    (templateHasPlaceholders as jest.Mock).mockReturnValue(false);

    (db.workshop.findUnique as jest.Mock).mockResolvedValue(mockWorkshop);
    (buildWorkshopVariables as jest.Mock).mockResolvedValue(mockVariables);
    (db.pageTemplate.findMany as jest.Mock).mockResolvedValue(mockTemplates);

    const result = await runAutoBuild("ws-corrupted");
    expect(result.pagesCreated).toBe(0);
  });

  // -------------------------------------------------------------------------
  // TEMPLATE-02: customHtml copy-through + two-pass interpolation
  // -------------------------------------------------------------------------
  describe("TEMPLATE-02 customHtml", () => {
    const ORIG_APP_URL = process.env.APP_URL;

    beforeEach(() => {
      process.env.APP_URL = "https://example.test";
      // Reset mock impl after prior tests may have called mockReturnValue(false)
      (templateHasPlaceholders as jest.Mock).mockReturnValue(true);
    });

    afterAll(() => {
      process.env.APP_URL = ORIG_APP_URL;
    });

    it("copies and interpolates customHtml into SOLO_LANDING LandingPage row", async () => {
      (db.workshop.findUnique as jest.Mock).mockResolvedValue(mockWorkshop);
      (buildWorkshopVariables as jest.Mock).mockResolvedValue(mockVariables);
      (db.pageTemplate.findMany as jest.Mock).mockResolvedValue([
        {
          id: "tpl-solo",
          templateType: "SOLO_LANDING",
          content: '{"heading":"{{workshop_title}}"}',
          categoryId: null,
          customCode: null,
          customHtml: "<p>Hello {{workshop_title}}</p>",
        },
      ]);
      (db.landingPage.findUnique as jest.Mock).mockResolvedValue(null);
      (db.landingPage.create as jest.Mock).mockResolvedValue({ id: "lp-new" });
      (db.workflow.findMany as jest.Mock).mockResolvedValue([]);
      (db.landingPage.findFirst as jest.Mock).mockResolvedValue({ slug: "solo-slug" });
      (db.workshop.update as jest.Mock).mockResolvedValue({ id: "ws-1" });
      (db.workshop.updateMany as jest.Mock).mockResolvedValue({ count: 1 });

      await runAutoBuild("ws-1");

      const createCalls = (db.landingPage.create as jest.Mock).mock.calls;
      const soloCall = createCalls.find((c) => c[0].data.template === "SOLO_LANDING");
      expect(soloCall).toBeDefined();
      expect(soloCall![0].data.customHtml).toBe("<p>Hello Scaling Up Workshop</p>");
    });

    it("does NOT filter out a template whose content has no placeholders but whose customHtml is populated", async () => {
      // templateHasPlaceholders returns false (legacy "corrupted" check).
      // Spec: a template with empty content + populated customHtml must NOT be skipped.
      (templateHasPlaceholders as jest.Mock).mockReturnValue(false);
      (db.workshop.findUnique as jest.Mock).mockResolvedValue(mockWorkshop);
      (buildWorkshopVariables as jest.Mock).mockResolvedValue(mockVariables);
      (db.pageTemplate.findMany as jest.Mock).mockResolvedValue([
        {
          id: "tpl-solo",
          templateType: "SOLO_LANDING",
          content: "{}",
          categoryId: null,
          customCode: null,
          customHtml: "<p>Just custom html</p>",
        },
      ]);
      (db.landingPage.findUnique as jest.Mock).mockResolvedValue(null);
      (db.landingPage.create as jest.Mock).mockResolvedValue({ id: "lp-new" });
      (db.workflow.findMany as jest.Mock).mockResolvedValue([]);
      (db.landingPage.findFirst as jest.Mock).mockResolvedValue({ slug: "solo-slug" });
      (db.workshop.update as jest.Mock).mockResolvedValue({ id: "ws-1" });
      (db.workshop.updateMany as jest.Mock).mockResolvedValue({ count: 1 });

      const result = await runAutoBuild("ws-1");

      expect(result.pagesCreated).toBe(1);
      expect(db.landingPage.create).toHaveBeenCalledTimes(1);
    });

    it("writes customHtml=null on REGISTRATION LandingPage even if source PageTemplate had customHtml (eligibility filter)", async () => {
      (db.workshop.findUnique as jest.Mock).mockResolvedValue(mockWorkshop);
      (buildWorkshopVariables as jest.Mock).mockResolvedValue(mockVariables);
      (db.pageTemplate.findMany as jest.Mock).mockResolvedValue([
        {
          id: "tpl-reg",
          templateType: "REGISTRATION",
          content: '{"heading":"Register for {{workshop_title}}"}',
          categoryId: null,
          customCode: null,
          customHtml: "<p>Should NOT carry over</p>",
        },
      ]);
      (db.landingPage.findUnique as jest.Mock).mockResolvedValue(null);
      (db.landingPage.create as jest.Mock).mockResolvedValue({ id: "lp-reg" });
      (db.workflow.findMany as jest.Mock).mockResolvedValue([]);
      (db.landingPage.findFirst as jest.Mock).mockResolvedValue({ slug: "reg-slug" });
      (db.workshop.update as jest.Mock).mockResolvedValue({ id: "ws-1" });
      (db.workshop.updateMany as jest.Mock).mockResolvedValue({ count: 1 });

      await runAutoBuild("ws-1");

      const createCalls = (db.landingPage.create as jest.Mock).mock.calls;
      const regCall = createCalls.find((c) => c[0].data.template === "REGISTRATION");
      expect(regCall).toBeDefined();
      expect(regCall![0].data.customHtml).toBeNull();
    });

    it("interpolates registration_url into SOLO_LANDING customHtml when REGISTRATION page is also built", async () => {
      (templateHasPlaceholders as jest.Mock).mockReturnValue(true);
      (db.workshop.findUnique as jest.Mock).mockResolvedValue(mockWorkshop);
      (buildWorkshopVariables as jest.Mock).mockResolvedValue(mockVariables);
      (db.pageTemplate.findMany as jest.Mock).mockResolvedValue([
        {
          id: "tpl-reg",
          templateType: "REGISTRATION",
          content: '{"heading":"Register"}',
          categoryId: null,
          customCode: null,
          customHtml: null,
        },
        {
          id: "tpl-solo",
          templateType: "SOLO_LANDING",
          content: '{"heading":"{{workshop_title}}"}',
          categoryId: null,
          customCode: null,
          customHtml: '<a href="{{registration_url}}">Sign up</a>',
        },
      ]);
      (db.landingPage.findUnique as jest.Mock).mockResolvedValue(null);
      // Capture each row written so we can inspect the REGISTRATION slug used in interpolation.
      (db.landingPage.create as jest.Mock).mockImplementation((args: any) =>
        Promise.resolve({ id: `lp-${args.data.template}`, slug: args.data.slug })
      );
      (db.workflow.findMany as jest.Mock).mockResolvedValue([]);
      // Step 4b + Step 6 findFirst lookups — return the actual REGISTRATION row's slug.
      (db.landingPage.findFirst as jest.Mock).mockImplementation((args: any) => {
        const tpl = args?.where?.template;
        const createCalls = (db.landingPage.create as jest.Mock).mock.calls;
        const match = createCalls.find((c) => c[0].data.template === tpl);
        if (match) {
          return Promise.resolve({ id: `lp-${tpl}`, slug: match[0].data.slug, content: match[0].data.content });
        }
        return Promise.resolve(null);
      });
      (db.workshop.update as jest.Mock).mockResolvedValue({ id: "ws-1" });
      (db.workshop.updateMany as jest.Mock).mockResolvedValue({ count: 1 });

      await runAutoBuild("ws-1");

      const createCalls = (db.landingPage.create as jest.Mock).mock.calls;
      const regCall = createCalls.find((c) => c[0].data.template === "REGISTRATION");
      const soloCall = createCalls.find((c) => c[0].data.template === "SOLO_LANDING");
      expect(regCall).toBeDefined();
      expect(soloCall).toBeDefined();
      const regSlug: string = regCall![0].data.slug;
      const customHtml: string = soloCall![0].data.customHtml;
      // Absolute URL is APP_URL + REGISTRATION's actual slug
      expect(customHtml).toContain(`https://example.test/workshop/${regSlug}`);
      // No leaked token
      expect(customHtml).not.toContain("{{registration_url}}");
    });

    it("uses empty string for {{registration_url}} when no REGISTRATION template exists", async () => {
      (db.workshop.findUnique as jest.Mock).mockResolvedValue(mockWorkshop);
      (buildWorkshopVariables as jest.Mock).mockResolvedValue(mockVariables);
      (db.pageTemplate.findMany as jest.Mock).mockResolvedValue([
        {
          id: "tpl-solo",
          templateType: "SOLO_LANDING",
          content: '{"heading":"{{workshop_title}}"}',
          categoryId: null,
          customCode: null,
          customHtml: '<a href="{{registration_url}}">register</a>',
        },
      ]);
      (db.landingPage.findUnique as jest.Mock).mockResolvedValue(null);
      (db.landingPage.create as jest.Mock).mockResolvedValue({ id: "lp-new" });
      (db.workflow.findMany as jest.Mock).mockResolvedValue([]);
      (db.landingPage.findFirst as jest.Mock).mockResolvedValue({ slug: "solo-slug" });
      (db.workshop.update as jest.Mock).mockResolvedValue({ id: "ws-1" });
      (db.workshop.updateMany as jest.Mock).mockResolvedValue({ count: 1 });

      await runAutoBuild("ws-1");

      const createCalls = (db.landingPage.create as jest.Mock).mock.calls;
      const soloCall = createCalls.find((c) => c[0].data.template === "SOLO_LANDING");
      expect(soloCall).toBeDefined();
      const customHtml: string = soloCall![0].data.customHtml;
      // Token replaced with empty string. sanitize-html drops invalid empty
      // hrefs entirely, leaving the anchor text intact — no broken
      // {{registration_url}} token leaks to public HTML.
      expect(customHtml).not.toContain("{{registration_url}}");
      expect(customHtml).toContain("register");
      expect(customHtml).toMatch(/<a[^>]*>register<\/a>/);
    });

    it("HTML-escapes variable values that contain HTML (XSS regression)", async () => {
      (db.workshop.findUnique as jest.Mock).mockResolvedValue(mockWorkshop);
      (buildWorkshopVariables as jest.Mock).mockResolvedValue({
        ...mockVariables,
        coach_bio: '<img src=x onerror=alert(1)>',
      });
      (db.pageTemplate.findMany as jest.Mock).mockResolvedValue([
        {
          id: "tpl-solo",
          templateType: "SOLO_LANDING",
          content: '{"heading":"{{workshop_title}}"}',
          categoryId: null,
          customCode: null,
          customHtml: "<div>{{coach_bio}}</div>",
        },
      ]);
      (db.landingPage.findUnique as jest.Mock).mockResolvedValue(null);
      (db.landingPage.create as jest.Mock).mockResolvedValue({ id: "lp-new" });
      (db.workflow.findMany as jest.Mock).mockResolvedValue([]);
      (db.landingPage.findFirst as jest.Mock).mockResolvedValue({ slug: "solo-slug" });
      (db.workshop.update as jest.Mock).mockResolvedValue({ id: "ws-1" });
      (db.workshop.updateMany as jest.Mock).mockResolvedValue({ count: 1 });

      await runAutoBuild("ws-1");

      const createCalls = (db.landingPage.create as jest.Mock).mock.calls;
      const soloCall = createCalls.find((c) => c[0].data.template === "SOLO_LANDING");
      const customHtml: string = soloCall![0].data.customHtml;
      expect(customHtml).toContain("&lt;img");
      expect(customHtml).not.toMatch(/<img\s+src=x/);
    });

    it("preserves customHtml=null when source PageTemplate.customHtml is null (no-op)", async () => {
      (templateHasPlaceholders as jest.Mock).mockReturnValue(true);
      (db.workshop.findUnique as jest.Mock).mockResolvedValue(mockWorkshop);
      (buildWorkshopVariables as jest.Mock).mockResolvedValue(mockVariables);
      (db.pageTemplate.findMany as jest.Mock).mockResolvedValue([
        {
          id: "tpl-solo",
          templateType: "SOLO_LANDING",
          content: '{"heading":"{{workshop_title}}"}',
          categoryId: null,
          customCode: null,
          customHtml: null,
        },
      ]);
      (db.landingPage.findUnique as jest.Mock).mockResolvedValue(null);
      (db.landingPage.create as jest.Mock).mockResolvedValue({ id: "lp-new" });
      (db.workflow.findMany as jest.Mock).mockResolvedValue([]);
      (db.landingPage.findFirst as jest.Mock).mockResolvedValue({ slug: "solo-slug" });
      (db.workshop.update as jest.Mock).mockResolvedValue({ id: "ws-1" });
      (db.workshop.updateMany as jest.Mock).mockResolvedValue({ count: 1 });

      await runAutoBuild("ws-1");

      const createCalls = (db.landingPage.create as jest.Mock).mock.calls;
      const soloCall = createCalls.find((c) => c[0].data.template === "SOLO_LANDING");
      expect(soloCall![0].data.customHtml).toBeNull();
    });

    // BLOCK-2: build-time sanitize re-runs in strict mode after interpolation,
    // so malicious substituted URLs (e.g. javascript:) get stripped even if the
    // raw token was admin-blessed.
    it("strips javascript: substituted into a token-href on build (strict re-sanitize)", async () => {
      (db.workshop.findUnique as jest.Mock).mockResolvedValue(mockWorkshop);
      (buildWorkshopVariables as jest.Mock).mockResolvedValue({
        ...mockVariables,
        virtual_link: "javascript:alert(1)",
      });
      (db.pageTemplate.findMany as jest.Mock).mockResolvedValue([
        {
          id: "tpl-solo",
          templateType: "SOLO_LANDING",
          content: '{"heading":"{{workshop_title}}"}',
          categoryId: null,
          customCode: null,
          customHtml: '<a href="{{virtual_link}}">Join</a>',
        },
      ]);
      (db.landingPage.findUnique as jest.Mock).mockResolvedValue(null);
      (db.landingPage.create as jest.Mock).mockImplementation((args: any) =>
        Promise.resolve({ id: "lp-new", ...args.data })
      );
      (db.workflow.findMany as jest.Mock).mockResolvedValue([]);
      (db.landingPage.findFirst as jest.Mock).mockResolvedValue({ slug: "solo-slug" });
      (db.workshop.update as jest.Mock).mockResolvedValue({ id: "ws-1" });
      (db.workshop.updateMany as jest.Mock).mockResolvedValue({ count: 1 });

      await runAutoBuild("ws-1");

      const createCalls = (db.landingPage.create as jest.Mock).mock.calls;
      const soloCall = createCalls.find((c) => c[0].data.template === "SOLO_LANDING");
      expect(soloCall).toBeDefined();
      const customHtml: string = soloCall![0].data.customHtml;
      expect(customHtml).toContain("<a");
      expect(customHtml).not.toContain("javascript:");
    });

    it("preserves https registration_url through strict re-sanitize", async () => {
      (templateHasPlaceholders as jest.Mock).mockReturnValue(true);
      (db.workshop.findUnique as jest.Mock).mockResolvedValue(mockWorkshop);
      (buildWorkshopVariables as jest.Mock).mockResolvedValue(mockVariables);
      (db.pageTemplate.findMany as jest.Mock).mockResolvedValue([
        {
          id: "tpl-reg",
          templateType: "REGISTRATION",
          content: '{"heading":"Register"}',
          categoryId: null,
          customCode: null,
          customHtml: null,
        },
        {
          id: "tpl-solo",
          templateType: "SOLO_LANDING",
          content: '{"heading":"{{workshop_title}}"}',
          categoryId: null,
          customCode: null,
          customHtml: '<a href="{{registration_url}}">Sign up</a>',
        },
      ]);
      (db.landingPage.findUnique as jest.Mock).mockResolvedValue(null);
      (db.landingPage.create as jest.Mock).mockImplementation((args: any) =>
        Promise.resolve({ id: `lp-${args.data.template}`, slug: args.data.slug })
      );
      (db.workflow.findMany as jest.Mock).mockResolvedValue([]);
      (db.landingPage.findFirst as jest.Mock).mockImplementation((args: any) => {
        const tpl = args?.where?.template;
        const createCalls = (db.landingPage.create as jest.Mock).mock.calls;
        const match = createCalls.find((c) => c[0].data.template === tpl);
        if (match) {
          return Promise.resolve({ id: `lp-${tpl}`, slug: match[0].data.slug, content: match[0].data.content });
        }
        return Promise.resolve(null);
      });
      (db.workshop.update as jest.Mock).mockResolvedValue({ id: "ws-1" });
      (db.workshop.updateMany as jest.Mock).mockResolvedValue({ count: 1 });

      await runAutoBuild("ws-1");

      const createCalls = (db.landingPage.create as jest.Mock).mock.calls;
      const regCall = createCalls.find((c) => c[0].data.template === "REGISTRATION");
      const soloCall = createCalls.find((c) => c[0].data.template === "SOLO_LANDING");
      const regSlug: string = regCall![0].data.slug;
      const customHtml: string = soloCall![0].data.customHtml;
      expect(customHtml).toContain(`https://example.test/workshop/${regSlug}`);
    });

    // Fix-3: HIGH-2 partial-rebuild path — REGISTRATION exists; SOLO_LANDING still needs its URL.
    it("uses existing REGISTRATION slug when REGISTRATION LandingPage already exists (partial rebuild)", async () => {
      (templateHasPlaceholders as jest.Mock).mockReturnValue(true);
      (db.workshop.findUnique as jest.Mock).mockResolvedValue(mockWorkshop);
      (buildWorkshopVariables as jest.Mock).mockResolvedValue(mockVariables);
      (db.pageTemplate.findMany as jest.Mock).mockResolvedValue([
        {
          id: "tpl-reg",
          templateType: "REGISTRATION",
          content: '{"heading":"Register"}',
          categoryId: null,
          customCode: null,
          customHtml: null,
        },
        {
          id: "tpl-solo",
          templateType: "SOLO_LANDING",
          content: '{"heading":"{{workshop_title}}"}',
          categoryId: null,
          customCode: null,
          customHtml: '<a href="{{registration_url}}">Sign up</a>',
        },
      ]);
      // landingPage.findUnique returns existing for REGISTRATION (preserving prior slug),
      // null for SOLO_LANDING so the buildOnePage proceeds.
      (db.landingPage.findUnique as jest.Mock).mockImplementation((args: any) => {
        if (args.where.workshopId_template?.template === "REGISTRATION") {
          return Promise.resolve({
            id: "lp-existing-reg",
            workshopId: "ws-1",
            template: "REGISTRATION",
            slug: "preexisting-reg-slug",
          });
        }
        return Promise.resolve(null);
      });
      (db.landingPage.create as jest.Mock).mockImplementation((args: any) =>
        Promise.resolve({ id: `lp-${args.data.template}`, slug: args.data.slug })
      );
      (db.workflow.findMany as jest.Mock).mockResolvedValue([]);
      (db.landingPage.findFirst as jest.Mock).mockResolvedValue({ slug: "solo-slug" });
      (db.workshop.update as jest.Mock).mockResolvedValue({ id: "ws-1" });
      (db.workshop.updateMany as jest.Mock).mockResolvedValue({ count: 1 });

      await runAutoBuild("ws-1");

      const createCalls = (db.landingPage.create as jest.Mock).mock.calls;
      const soloCall = createCalls.find((c) => c[0].data.template === "SOLO_LANDING");
      expect(soloCall).toBeDefined();
      const customHtml: string = soloCall![0].data.customHtml;
      expect(customHtml).toContain("https://example.test/workshop/preexisting-reg-slug");
      expect(customHtml).not.toContain("{{registration_url}}");
      // And it must not be empty either
      expect(customHtml).not.toBe('<a href="">Sign up</a>');
    });

    it("writes customHtml=null on THANK_YOU LandingPage even if source PageTemplate has customHtml (eligibility filter)", async () => {
      (db.workshop.findUnique as jest.Mock).mockResolvedValue(mockWorkshop);
      (buildWorkshopVariables as jest.Mock).mockResolvedValue(mockVariables);
      (db.pageTemplate.findMany as jest.Mock).mockResolvedValue([
        {
          id: "tpl-ty",
          templateType: "THANK_YOU",
          content: '{"heading":"Thanks!"}',
          categoryId: null,
          customCode: null,
          customHtml: "<p>Not eligible</p>",
        },
      ]);
      (db.landingPage.findUnique as jest.Mock).mockResolvedValue(null);
      (db.landingPage.create as jest.Mock).mockResolvedValue({ id: "lp-ty" });
      (db.workflow.findMany as jest.Mock).mockResolvedValue([]);
      (db.landingPage.findFirst as jest.Mock).mockResolvedValue({ slug: "ty-slug" });
      (db.workshop.update as jest.Mock).mockResolvedValue({ id: "ws-1" });
      (db.workshop.updateMany as jest.Mock).mockResolvedValue({ count: 1 });

      await runAutoBuild("ws-1");

      const createCalls = (db.landingPage.create as jest.Mock).mock.calls;
      const tyCall = createCalls.find((c) => c[0].data.template === "THANK_YOU");
      expect(tyCall).toBeDefined();
      expect(tyCall![0].data.customHtml).toBeNull();
    });
  });
});
