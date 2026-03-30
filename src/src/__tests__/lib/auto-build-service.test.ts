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
    },
    workflowAssignment: {
      findUnique: jest.fn(),
      create: jest.fn(),
    },
  },
}));

jest.mock("@/lib/template-interpolation", () => ({
  buildWorkshopVariables: jest.fn(),
  interpolateContent: jest.fn((content: string) => content), // pass-through
  templateHasPlaceholders: jest.fn(() => true),
  findRemainingPlaceholders: jest.fn(() => []),
}));

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
import { buildWorkshopVariables, templateHasPlaceholders } from "@/lib/template-interpolation";
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
  (db.workflow.findFirst as jest.Mock).mockResolvedValue(null); // no workflows
  (db.landingPage.findFirst as jest.Mock).mockResolvedValue({ slug: "test-solo-slug" });
  (db.workshop.update as jest.Mock).mockResolvedValue({ id: "ws-1" });
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

    // Mock workflows exist
    (db.workflow.findFirst as jest.Mock)
      .mockResolvedValueOnce({ id: "wf-pre", name: "Pre-Event Sequence", isActive: true })
      .mockResolvedValueOnce({ id: "wf-post", name: "Post-Event Follow Up", isActive: true });
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
});
