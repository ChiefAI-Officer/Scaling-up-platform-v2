/* eslint-disable @typescript-eslint/no-explicit-any */

// ---- Mocks (must be declared before imports) ----

// eslint-disable-next-line no-var
var capturedHandler: Function;

jest.mock("@/inngest/client", () => ({
  inngest: {
    createFunction: jest.fn(
      (_config: unknown, _trigger: unknown, handler: Function) => {
        capturedHandler = handler;
        return handler;
      }
    ),
    send: jest.fn(),
  },
}));

jest.mock("@/lib/db", () => ({
  db: {
    workshop: {
      findUnique: jest.fn(),
      update: jest.fn(),
    },
    landingPage: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
      create: jest.fn(),
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

jest.mock("@/services/notifications", () => ({
  sendWorkshopBuiltEmail: jest.fn(),
}));

// ---- Imports (after mocks) ----

import { db } from "@/lib/db";
import { inngest } from "@/inngest/client";
import { sendWorkshopBuiltEmail } from "@/services/notifications";

// Force module load so createFunction captures the handler
import "@/inngest/functions/auto-build-workshop";

// ---- Helpers ----

const mockStep = {
  run: jest.fn(async (_name: string, fn: () => Promise<unknown>) => fn()),
  sleepUntil: jest.fn(),
  sleep: jest.fn(),
  sendEvent: jest.fn(),
};

function makeEvent(workshopId = "ws-1") {
  return {
    data: { workshopId },
    name: "workshop/approved",
  };
}

// Date.now stub for deterministic slug generation
const FIXED_NOW = 1700000000000;

const mockWorkshop = {
  id: "ws-1",
  title: "Scaling Up Workshop",
  description: "Learn to scale",
  format: "IN_PERSON",
  workshopCode: "WS-001",
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

const mockPreWorkflow = {
  id: "wf-pre-1",
  name: "Pre-Event Welcome Series",
  isActive: true,
  workflowPhase: "PRE_EVENT",
  workshopFormat: "IN_PERSON",
};

const mockPostWorkflow = {
  id: "wf-post-1",
  name: "Post-Event Follow Up",
  isActive: true,
  workflowPhase: "POST_EVENT",
  workshopFormat: "IN_PERSON",
};

const mockTemplates = [
  {
    id: "tpl-1",
    template: "REGISTRATION",
    content: '{"heading":"Register for {{workshop_title}}","coach":"{{coach_name}}"}',
    slug: "template-registration",
  },
  {
    id: "tpl-2",
    template: "THANK_YOU",
    content: '{"heading":"Thanks for attending {{workshop_title}}"}',
    slug: "template-thank-you",
  },
];

// ---- Shared setup helpers ----

/**
 * Configures all db mocks for a full happy-path run.
 * Individual tests can override specific mocks after calling this.
 */
function setupHappyPath() {
  // Idempotency check: no existing pages; then active templates
  (db.landingPage.findMany as jest.Mock)
    .mockResolvedValueOnce([])           // idempotency check: no existing pages
    .mockResolvedValueOnce(mockTemplates); // find active templates
  (db.workshop.findUnique as jest.Mock)
    .mockResolvedValueOnce({ status: "AWAITING_APPROVAL" }) // idempotency check
    .mockResolvedValueOnce(mockWorkshop); // fetch-workshop

  // Templates
  (db.landingPage.findUnique as jest.Mock).mockResolvedValue(null); // no existing page for template
  (db.landingPage.create as jest.Mock).mockResolvedValue({});

  // PRE_EVENT workflow
  (db.workflow.findFirst as jest.Mock)
    .mockResolvedValueOnce(mockPreWorkflow) // PRE_EVENT
    .mockResolvedValueOnce(mockPostWorkflow); // POST_EVENT

  // No existing assignments
  (db.workflowAssignment.findUnique as jest.Mock).mockResolvedValue(null);
  (db.workflowAssignment.create as jest.Mock)
    .mockResolvedValueOnce({ id: "assign-pre-1" })
    .mockResolvedValueOnce({ id: "assign-post-1" });

  // Status update
  (db.workshop.update as jest.Mock).mockResolvedValue({});

  // Notification
  (sendWorkshopBuiltEmail as jest.Mock).mockResolvedValue(undefined);
  (inngest.send as jest.Mock).mockResolvedValue(undefined);
}

// ---- Tests ----

describe("autoBuildWorkshop Inngest function", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(Date, "now").mockReturnValue(FIXED_NOW);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("captures the handler via createFunction (called at import time)", () => {
    // createFunction is called at module load; clearAllMocks resets the count,
    // so we verify the handler was captured instead.
    expect(typeof capturedHandler).toBe("function");
  });

  // ---- 1. Happy path ----
  it("creates pages, assigns workflows, updates status, and sends email on happy path", async () => {
    setupHappyPath();

    const result = await capturedHandler({
      event: makeEvent(),
      step: mockStep,
    });

    // Landing pages created from 2 templates
    expect(db.landingPage.create).toHaveBeenCalledTimes(2);

    // Both workflows assigned
    expect(db.workflowAssignment.create).toHaveBeenCalledTimes(2);

    // inngest.send called once per workflow assignment
    expect(inngest.send).toHaveBeenCalledTimes(2);
    expect(inngest.send).toHaveBeenCalledWith(
      expect.objectContaining({
        name: "workflow/schedule",
        data: { workshopId: "ws-1", workflowAssignmentId: "assign-pre-1" },
      })
    );
    expect(inngest.send).toHaveBeenCalledWith(
      expect.objectContaining({
        name: "workflow/schedule",
        data: { workshopId: "ws-1", workflowAssignmentId: "assign-post-1" },
      })
    );

    // Status updated to PRE_EVENT
    expect(db.workshop.update).toHaveBeenCalledWith({
      where: { id: "ws-1" },
      data: { status: "PRE_EVENT" },
    });

    // Email sent
    expect(sendWorkshopBuiltEmail).toHaveBeenCalledTimes(1);

    // Return value
    expect(result).toEqual({
      workshopId: "ws-1",
      pagesCreated: 2,
      preEventWorkflow: "Pre-Event Welcome Series",
      postEventWorkflow: "Post-Event Follow Up",
      status: "PRE_EVENT",
    });
  });

  // ---- 2. Idempotency: pages already exist ----
  it("skips build if landing pages already exist (idempotency guard)", async () => {
    (db.landingPage.findMany as jest.Mock).mockResolvedValue([{ id: "lp-1" }]);
    (db.workshop.findUnique as jest.Mock).mockResolvedValueOnce({
      status: "AWAITING_APPROVAL",
    });

    const result = await capturedHandler({
      event: makeEvent(),
      step: mockStep,
    });

    expect(result).toEqual({
      workshopId: "ws-1",
      skipped: true,
      reason: "Workshop already built (idempotency guard)",
    });
    // Should NOT have proceeded to fetch workshop or create pages
    expect(db.landingPage.create).not.toHaveBeenCalled();
    expect(db.workshop.update).not.toHaveBeenCalled();
    expect(sendWorkshopBuiltEmail).not.toHaveBeenCalled();
  });

  // ---- 3. Idempotency: status already PRE_EVENT ----
  it("skips build if workshop status is already PRE_EVENT", async () => {
    (db.landingPage.findMany as jest.Mock).mockResolvedValue([]);
    (db.workshop.findUnique as jest.Mock).mockResolvedValueOnce({
      status: "PRE_EVENT",
    });

    const result = await capturedHandler({
      event: makeEvent(),
      step: mockStep,
    });

    expect(result).toEqual({
      workshopId: "ws-1",
      skipped: true,
      reason: "Workshop already built (idempotency guard)",
    });
    expect(db.landingPage.create).not.toHaveBeenCalled();
    expect(sendWorkshopBuiltEmail).not.toHaveBeenCalled();
  });

  // ---- 4. Workshop not found ----
  it("throws error when workshop is not found in fetch step", async () => {
    (db.landingPage.findMany as jest.Mock).mockResolvedValue([]);
    (db.workshop.findUnique as jest.Mock)
      .mockResolvedValueOnce({ status: "AWAITING_APPROVAL" }) // idempotency
      .mockResolvedValueOnce(null); // fetch-workshop returns null

    await expect(
      capturedHandler({ event: makeEvent(), step: mockStep })
    ).rejects.toThrow("Workshop ws-1 not found");
  });

  // ---- 5. No active templates ----
  it("creates 0 pages but still assigns workflows and updates status when no templates exist", async () => {
    (db.landingPage.findMany as jest.Mock)
      .mockResolvedValueOnce([]) // idempotency: no existing pages
      .mockResolvedValueOnce([]); // create-landing-pages: no active templates

    (db.workshop.findUnique as jest.Mock)
      .mockResolvedValueOnce({ status: "AWAITING_APPROVAL" })
      .mockResolvedValueOnce(mockWorkshop);

    (db.workflow.findFirst as jest.Mock)
      .mockResolvedValueOnce(mockPreWorkflow)
      .mockResolvedValueOnce(mockPostWorkflow);

    (db.workflowAssignment.findUnique as jest.Mock).mockResolvedValue(null);
    (db.workflowAssignment.create as jest.Mock)
      .mockResolvedValueOnce({ id: "assign-pre-1" })
      .mockResolvedValueOnce({ id: "assign-post-1" });

    (db.workshop.update as jest.Mock).mockResolvedValue({});
    (sendWorkshopBuiltEmail as jest.Mock).mockResolvedValue(undefined);
    (inngest.send as jest.Mock).mockResolvedValue(undefined);

    const result = await capturedHandler({
      event: makeEvent(),
      step: mockStep,
    });

    expect(db.landingPage.create).not.toHaveBeenCalled();
    expect(result.pagesCreated).toBe(0);

    // Workflows still assigned
    expect(db.workflowAssignment.create).toHaveBeenCalledTimes(2);
    // Status still updated
    expect(db.workshop.update).toHaveBeenCalledWith({
      where: { id: "ws-1" },
      data: { status: "PRE_EVENT" },
    });
    // Email still sent
    expect(sendWorkshopBuiltEmail).toHaveBeenCalledTimes(1);
  });

  // ---- 6. Existing page for one template type ----
  it("skips template if a page already exists for that template type", async () => {
    (db.landingPage.findMany as jest.Mock)
      .mockResolvedValueOnce([]) // idempotency
      .mockResolvedValueOnce(mockTemplates); // active templates

    (db.workshop.findUnique as jest.Mock)
      .mockResolvedValueOnce({ status: "AWAITING_APPROVAL" })
      .mockResolvedValueOnce(mockWorkshop);

    // First template: already exists; second: does not
    (db.landingPage.findUnique as jest.Mock)
      .mockResolvedValueOnce({ id: "existing-lp" }) // REGISTRATION already exists
      .mockResolvedValueOnce(null); // THANK_YOU does not

    (db.landingPage.create as jest.Mock).mockResolvedValue({});

    // Workflows
    (db.workflow.findFirst as jest.Mock)
      .mockResolvedValueOnce(mockPreWorkflow)
      .mockResolvedValueOnce(mockPostWorkflow);
    (db.workflowAssignment.findUnique as jest.Mock).mockResolvedValue(null);
    (db.workflowAssignment.create as jest.Mock)
      .mockResolvedValueOnce({ id: "assign-pre-1" })
      .mockResolvedValueOnce({ id: "assign-post-1" });
    (db.workshop.update as jest.Mock).mockResolvedValue({});
    (sendWorkshopBuiltEmail as jest.Mock).mockResolvedValue(undefined);
    (inngest.send as jest.Mock).mockResolvedValue(undefined);

    const result = await capturedHandler({
      event: makeEvent(),
      step: mockStep,
    });

    // Only 1 page created (THANK_YOU), REGISTRATION was skipped
    expect(db.landingPage.create).toHaveBeenCalledTimes(1);
    expect(db.landingPage.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ template: "THANK_YOU" }),
      })
    );
    expect(result.pagesCreated).toBe(1);
  });

  // ---- 7. No matching PRE_EVENT workflow ----
  it("returns null for preEventWorkflow when no matching PRE_EVENT workflow exists", async () => {
    setupHappyPath();
    // Override: no PRE_EVENT workflow found
    (db.workflow.findFirst as jest.Mock)
      .mockReset()
      .mockResolvedValueOnce(null) // PRE_EVENT
      .mockResolvedValueOnce(mockPostWorkflow); // POST_EVENT

    (db.workflowAssignment.create as jest.Mock)
      .mockReset()
      .mockResolvedValueOnce({ id: "assign-post-1" });

    const result = await capturedHandler({
      event: makeEvent(),
      step: mockStep,
    });

    // Only 1 workflow assignment (POST_EVENT)
    expect(db.workflowAssignment.create).toHaveBeenCalledTimes(1);
    expect(result.preEventWorkflow).toBeNull();
    expect(result.postEventWorkflow).toBe("Post-Event Follow Up");
  });

  // ---- 8. No matching POST_EVENT workflow ----
  it("returns null for postEventWorkflow when no matching POST_EVENT workflow exists", async () => {
    setupHappyPath();
    // Override: no POST_EVENT workflow found
    (db.workflow.findFirst as jest.Mock)
      .mockReset()
      .mockResolvedValueOnce(mockPreWorkflow) // PRE_EVENT
      .mockResolvedValueOnce(null); // POST_EVENT

    (db.workflowAssignment.create as jest.Mock)
      .mockReset()
      .mockResolvedValueOnce({ id: "assign-pre-1" });

    const result = await capturedHandler({
      event: makeEvent(),
      step: mockStep,
    });

    expect(db.workflowAssignment.create).toHaveBeenCalledTimes(1);
    expect(result.preEventWorkflow).toBe("Pre-Event Welcome Series");
    expect(result.postEventWorkflow).toBeNull();
  });

  // ---- 9. Already-assigned workflow ----
  it("skips creation and returns alreadyAssigned when workflows are already assigned", async () => {
    setupHappyPath();

    // Override: both assignments already exist
    (db.workflowAssignment.findUnique as jest.Mock)
      .mockReset()
      .mockResolvedValueOnce({ id: "existing-pre" }) // PRE_EVENT already assigned
      .mockResolvedValueOnce({ id: "existing-post" }); // POST_EVENT already assigned

    // workflowAssignment.create should NOT be called
    (db.workflowAssignment.create as jest.Mock).mockReset();

    const result = await capturedHandler({
      event: makeEvent(),
      step: mockStep,
    });

    expect(db.workflowAssignment.create).not.toHaveBeenCalled();
    // inngest.send should NOT be called for workflow scheduling
    expect(inngest.send).not.toHaveBeenCalled();

    // Workflows still reported by name (alreadyAssigned flag is internal)
    expect(result.preEventWorkflow).toBe("Pre-Event Welcome Series");
    expect(result.postEventWorkflow).toBe("Post-Event Follow Up");
  });

  // ---- 10. Variable interpolation ----
  it("interpolates {{workshop_title}}, {{coach_name}}, and other variables in template content", async () => {
    const templateWithVars = [
      {
        id: "tpl-interp",
        template: "REGISTRATION",
        content:
          '{"heading":"Register for {{workshop_title}}","coach":"{{ coach_name }}","date":"{{workshop_date}}","price":"{{price}}","format":"{{workshop_format}}","venue":"{{venue_name}}","code":"{{workshop_code}}"}',
        slug: "template-registration",
      },
    ];

    (db.landingPage.findMany as jest.Mock)
      .mockResolvedValueOnce([]) // idempotency
      .mockResolvedValueOnce(templateWithVars); // active templates

    (db.workshop.findUnique as jest.Mock)
      .mockResolvedValueOnce({ status: "AWAITING_APPROVAL" })
      .mockResolvedValueOnce(mockWorkshop);

    (db.landingPage.findUnique as jest.Mock).mockResolvedValue(null);
    (db.landingPage.create as jest.Mock).mockResolvedValue({});

    (db.workflow.findFirst as jest.Mock)
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(null);

    (db.workshop.update as jest.Mock).mockResolvedValue({});
    (sendWorkshopBuiltEmail as jest.Mock).mockResolvedValue(undefined);

    await capturedHandler({ event: makeEvent(), step: mockStep });

    const createCall = (db.landingPage.create as jest.Mock).mock.calls[0][0];
    const content = JSON.parse(createCall.data.content);

    expect(content.heading).toBe("Register for Scaling Up Workshop");
    expect(content.coach).toBe("John Smith");
    // Date is locale-formatted; check it contains key parts
    expect(content.date).toContain("June");
    expect(content.date).toContain("2026");
    expect(content.price).toBe("$500");
    expect(content.format).toBe("IN_PERSON");
    expect(content.venue).toBe("Conference Center");
    expect(content.code).toBe("WS-001");
  });

  // ---- 11. Email notification ----
  it("calls sendWorkshopBuiltEmail with correct parameters", async () => {
    setupHappyPath();

    await capturedHandler({ event: makeEvent(), step: mockStep });

    expect(sendWorkshopBuiltEmail).toHaveBeenCalledTimes(1);
    expect(sendWorkshopBuiltEmail).toHaveBeenCalledWith({
      coachEmail: "coach@example.com",
      coachName: "John Smith",
      workshopTitle: "Scaling Up Workshop",
      workshopId: "ws-1",
      pagesCreated: ["REGISTRATION", "THANK_YOU"],
      preEventWorkflow: "Pre-Event Welcome Series",
      postEventWorkflow: "Post-Event Follow Up",
    });
  });

  // ---- 12. Workflow execution trigger via inngest.send ----
  it("sends workflow/schedule event for each newly created assignment", async () => {
    setupHappyPath();

    await capturedHandler({ event: makeEvent(), step: mockStep });

    expect(inngest.send).toHaveBeenCalledTimes(2);

    // PRE_EVENT workflow scheduling
    expect(inngest.send).toHaveBeenNthCalledWith(1, {
      name: "workflow/schedule",
      data: {
        workshopId: "ws-1",
        workflowAssignmentId: "assign-pre-1",
      },
    });

    // POST_EVENT workflow scheduling
    expect(inngest.send).toHaveBeenNthCalledWith(2, {
      name: "workflow/schedule",
      data: {
        workshopId: "ws-1",
        workflowAssignmentId: "assign-post-1",
      },
    });
  });

  // ---- 13. Slug generation format ----
  it("generates slugs with kebab-cased title, template suffix, and base36 timestamp", async () => {
    setupHappyPath();

    await capturedHandler({ event: makeEvent(), step: mockStep });

    const calls = (db.landingPage.create as jest.Mock).mock.calls;
    expect(calls.length).toBe(2);

    const slug1 = calls[0][0].data.slug;
    const slug2 = calls[1][0].data.slug;

    const expectedTimestamp = FIXED_NOW.toString(36);

    // First template: REGISTRATION
    expect(slug1).toBe(`scaling-up-workshop-registration-${expectedTimestamp}`);
    // Second template: THANK_YOU
    expect(slug2).toBe(`scaling-up-workshop-thank-you-${expectedTimestamp}`);
  });

  // ---- 14. Landing page created with DRAFT status ----
  it("creates landing pages with DRAFT status and correct workshopId", async () => {
    setupHappyPath();

    await capturedHandler({ event: makeEvent(), step: mockStep });

    const calls = (db.landingPage.create as jest.Mock).mock.calls;
    for (const call of calls) {
      expect(call[0].data.workshopId).toBe("ws-1");
      expect(call[0].data.status).toBe("DRAFT");
    }
  });

  // ---- 15. Step.run called with expected step names ----
  it("executes all expected steps in order", async () => {
    setupHappyPath();

    await capturedHandler({ event: makeEvent(), step: mockStep });

    const stepNames = mockStep.run.mock.calls.map(
      (call: any[]) => call[0]
    );

    expect(stepNames).toEqual([
      "idempotency-check",
      "fetch-workshop",
      "create-landing-pages",
      "assign-pre-event-workflow",
      "assign-post-event-workflow",
      "update-status",
      "notify-coach",
    ]);
  });

  // ---- 16. Free workshop price interpolation ----
  it("interpolates price as 'Free' for free workshops without pricing tier", async () => {
    const freeWorkshop = {
      ...mockWorkshop,
      isFree: true,
      priceCents: null,
      pricingTier: null,
    };

    const templateWithPrice = [
      {
        id: "tpl-price",
        template: "REGISTRATION",
        content: '{"price":"{{price}}"}',
        slug: "template-reg",
      },
    ];

    (db.landingPage.findMany as jest.Mock)
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce(templateWithPrice);

    (db.workshop.findUnique as jest.Mock)
      .mockResolvedValueOnce({ status: "AWAITING_APPROVAL" })
      .mockResolvedValueOnce(freeWorkshop);

    (db.landingPage.findUnique as jest.Mock).mockResolvedValue(null);
    (db.landingPage.create as jest.Mock).mockResolvedValue({});

    (db.workflow.findFirst as jest.Mock)
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(null);

    (db.workshop.update as jest.Mock).mockResolvedValue({});
    (sendWorkshopBuiltEmail as jest.Mock).mockResolvedValue(undefined);

    await capturedHandler({ event: makeEvent(), step: mockStep });

    const content = JSON.parse(
      (db.landingPage.create as jest.Mock).mock.calls[0][0].data.content
    );
    expect(content.price).toBe("Free");
  });

  // ---- 17. Workshop with no category ----
  it("handles workshop with null category gracefully", async () => {
    const noCategoryWorkshop = {
      ...mockWorkshop,
      categoryId: null,
      workshopCategory: null,
    };

    (db.landingPage.findMany as jest.Mock)
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([]);

    (db.workshop.findUnique as jest.Mock)
      .mockResolvedValueOnce({ status: "AWAITING_APPROVAL" })
      .mockResolvedValueOnce(noCategoryWorkshop);

    (db.workflow.findFirst as jest.Mock)
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(null);

    (db.workshop.update as jest.Mock).mockResolvedValue({});
    (sendWorkshopBuiltEmail as jest.Mock).mockResolvedValue(undefined);

    const result = await capturedHandler({
      event: makeEvent(),
      step: mockStep,
    });

    // Should complete without errors
    expect(result.status).toBe("PRE_EVENT");
    expect(result.preEventWorkflow).toBeNull();
    expect(result.postEventWorkflow).toBeNull();
  });

  // ---- 18. Email includes null workflow names when no workflows matched ----
  it("sends email with null workflow names when none are matched", async () => {
    (db.landingPage.findMany as jest.Mock)
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([]);

    (db.workshop.findUnique as jest.Mock)
      .mockResolvedValueOnce({ status: "AWAITING_APPROVAL" })
      .mockResolvedValueOnce(mockWorkshop);

    (db.workflow.findFirst as jest.Mock)
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(null);

    (db.workshop.update as jest.Mock).mockResolvedValue({});
    (sendWorkshopBuiltEmail as jest.Mock).mockResolvedValue(undefined);

    await capturedHandler({ event: makeEvent(), step: mockStep });

    expect(sendWorkshopBuiltEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        preEventWorkflow: null,
        postEventWorkflow: null,
        pagesCreated: [],
      })
    );
  });
});
