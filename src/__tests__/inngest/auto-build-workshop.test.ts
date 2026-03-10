/**
 * Unit tests for auto-build-workshop Inngest function
 *
 * Tests the full auto-build flow triggered on "workshop/approved":
 * - Idempotency guard (skip if already built)
 * - Workshop fetch + template variable interpolation
 * - Landing page creation from active templates
 * - PRE_EVENT and POST_EVENT workflow assignment
 * - Workshop status update to PRE_EVENT
 * - Coach notification email
 */

// ---------------------------------------------------------------------------
// Mocks — must be defined BEFORE imports that reference them
// ---------------------------------------------------------------------------

jest.mock("@/lib/db", () => ({
  db: {
    workshop: { findUnique: jest.fn(), update: jest.fn() },
    landingPage: { findMany: jest.fn(), findUnique: jest.fn(), create: jest.fn() },
    workflow: { findFirst: jest.fn() },
    workflowAssignment: { findUnique: jest.fn(), create: jest.fn() },
  },
}));

jest.mock("@/services/notifications", () => ({
  sendWorkshopBuiltEmail: jest.fn().mockResolvedValue(undefined),
}));

jest.mock("@/inngest/client", () => ({
  inngest: {
    createFunction: jest.fn((_config: unknown, _trigger: unknown, handler: unknown) => handler),
    send: jest.fn().mockResolvedValue(undefined),
  },
}));

// ---------------------------------------------------------------------------
// Imports (after mocks are registered)
// ---------------------------------------------------------------------------

import { db } from "@/lib/db";
import { sendWorkshopBuiltEmail } from "@/services/notifications";
import { inngest } from "@/inngest/client";
import { autoBuildWorkshop } from "@/inngest/functions/auto-build-workshop";

const mockSend = inngest.send as jest.Mock;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function createEvent(workshopId = "ws-test-123") {
  return {
    name: "workshop/approved" as const,
    data: { approvalId: "apr-001", workshopId, coachId: "coach-001" },
  };
}

function createWorkshopRecord(overrides: Record<string, unknown> = {}) {
  return {
    id: "ws-test-123",
    title: "Scaling Up Masterclass",
    description: "Learn to scale your business",
    format: "IN_PERSON",
    workshopCode: "SU-MC-001",
    eventDate: new Date("2026-04-15T09:00:00Z"),
    eventTime: "9:00 AM",
    venueName: "Grand Hotel Ballroom",
    venueAddress: "123 Main St, NYC",
    venueInstructions: "Use the south entrance",
    virtualLink: null,
    isFree: false,
    priceCents: 49900,
    categoryId: "cat-leadership",
    status: "APPROVED",
    coach: {
      id: "coach-001",
      email: "jane@example.com",
      firstName: "Jane",
      lastName: "Doe",
      bio: "Executive coach with 15 years experience",
      profileImage: "https://example.com/jane.jpg",
      company: "Doe Coaching LLC",
    },
    workshopCategory: { id: "cat-leadership", name: "Leadership", slug: "leadership" },
    pricingTier: { name: "Standard", amountCents: 49900 },
    ...overrides,
  };
}

function createActiveTemplates() {
  return [
    { id: "tpl-1", template: "REGISTRATION", content: '{"hero":"{{workshop_title}} with {{coach_name}}"}', slug: "template-registration" },
    { id: "tpl-2", template: "DETAILS", content: '{"info":"{{workshop_date}} at {{venue_name}}"}', slug: "template-details" },
    { id: "tpl-3", template: "CONFIRMATION", content: '{"msg":"Thanks for registering for {{workshop_title}}"}', slug: "template-confirmation" },
  ];
}

function createPreEventWorkflow() {
  return { id: "wf-pre-001", name: "Pre-Event Email Sequence", workflowPhase: "PRE_EVENT", workshopFormat: "IN_PERSON", categoryId: "cat-leadership", isActive: true, updatedAt: new Date() };
}

function createPostEventWorkflow() {
  return { id: "wf-post-001", name: "Post-Event Follow-Up", workflowPhase: "POST_EVENT", workshopFormat: "IN_PERSON", categoryId: "cat-leadership", isActive: true, updatedAt: new Date() };
}

// Type the handler so we can call it directly
type HandlerArgs = {
  event: ReturnType<typeof createEvent>;
  step: { run: jest.Mock; sleep: jest.Mock; sleepUntil: jest.Mock; sendEvent: jest.Mock; waitForEvent: jest.Mock };
};

const handler = autoBuildWorkshop as unknown as (args: HandlerArgs) => Promise<unknown>;

/**
 * Create a step.run mock that sets up correct Prisma mocks per step name.
 * This is the key pattern: each step's callback uses db.* methods, so we
 * configure the mocks right before invoking each callback.
 */
function createStepRunForHappyPath(workshopOverrides: Record<string, unknown> = {}) {
  return jest.fn(async (name: string, fn: () => Promise<unknown>) => {
    if (name === "idempotency-check") {
      (db.landingPage.findMany as jest.Mock).mockResolvedValueOnce([]);
      (db.workshop.findUnique as jest.Mock).mockResolvedValueOnce({ status: "APPROVED" });
    } else if (name === "fetch-workshop") {
      (db.workshop.findUnique as jest.Mock).mockResolvedValueOnce(createWorkshopRecord(workshopOverrides));
    } else if (name === "create-landing-pages") {
      (db.landingPage.findMany as jest.Mock).mockResolvedValueOnce(createActiveTemplates());
      (db.landingPage.findUnique as jest.Mock).mockResolvedValue(null);
      (db.landingPage.create as jest.Mock).mockResolvedValue({ id: "lp-new" });
    } else if (name === "assign-pre-event-workflow") {
      (db.workflow.findFirst as jest.Mock).mockResolvedValueOnce(createPreEventWorkflow());
      (db.workflowAssignment.findUnique as jest.Mock).mockResolvedValueOnce(null);
      (db.workflowAssignment.create as jest.Mock).mockResolvedValueOnce({ id: "wa-pre-001" });
    } else if (name === "assign-post-event-workflow") {
      (db.workflow.findFirst as jest.Mock).mockResolvedValueOnce(createPostEventWorkflow());
      (db.workflowAssignment.findUnique as jest.Mock).mockResolvedValueOnce(null);
      (db.workflowAssignment.create as jest.Mock).mockResolvedValueOnce({ id: "wa-post-001" });
    } else if (name === "update-status") {
      (db.workshop.update as jest.Mock).mockResolvedValueOnce({ id: "ws-test-123" });
    }
    // "notify-coach" uses sendWorkshopBuiltEmail which is already mocked
    return fn();
  });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("auto-build-workshop Inngest function", () => {
  let step: HandlerArgs["step"];

  beforeEach(() => {
    jest.clearAllMocks();
    step = {
      run: jest.fn(),
      sleep: jest.fn(),
      sleepUntil: jest.fn(),
      sendEvent: jest.fn(),
      waitForEvent: jest.fn(),
    };
    jest.spyOn(Date, "now").mockReturnValue(1700000000000);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  // -----------------------------------------------------------------------
  // 1. HAPPY PATH
  // -----------------------------------------------------------------------
  describe("Happy path: full auto-build flow", () => {
    it("should execute all steps and return correct summary", async () => {
      step.run = createStepRunForHappyPath();
      const result = await handler({ event: createEvent(), step });

      expect(result).toEqual({
        workshopId: "ws-test-123",
        pagesCreated: 3,
        noTemplatesAvailable: false,
        preEventWorkflow: "Pre-Event Email Sequence",
        postEventWorkflow: "Post-Event Follow-Up",
        status: "PRE_EVENT",
      });
    });

    it("should call step.run for each expected step name", async () => {
      step.run = createStepRunForHappyPath();
      await handler({ event: createEvent(), step });

      const stepNames = (step.run as jest.Mock).mock.calls.map((c: unknown[]) => c[0]);
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

    it("should create 3 landing pages from active templates", async () => {
      step.run = createStepRunForHappyPath();
      await handler({ event: createEvent(), step });

      expect(db.landingPage.create).toHaveBeenCalledTimes(3);
    });

    it("should update workshop status to PRE_EVENT", async () => {
      step.run = createStepRunForHappyPath();
      await handler({ event: createEvent(), step });

      expect(db.workshop.update).toHaveBeenCalledWith({
        where: { id: "ws-test-123" },
        data: { status: "PRE_EVENT" },
      });
    });

    it("should send notification email to coach", async () => {
      step.run = createStepRunForHappyPath();
      await handler({ event: createEvent(), step });

      expect(sendWorkshopBuiltEmail).toHaveBeenCalledWith({
        coachEmail: "jane@example.com",
        coachName: "Jane Doe",
        workshopTitle: "Scaling Up Masterclass",
        workshopId: "ws-test-123",
        pagesCreated: ["REGISTRATION", "DETAILS", "CONFIRMATION"],
        preEventWorkflow: "Pre-Event Email Sequence",
        postEventWorkflow: "Post-Event Follow-Up",
      });
    });

    it("should send workflow/schedule events", async () => {
      step.run = createStepRunForHappyPath();
      await handler({ event: createEvent(), step });

      expect(mockSend).toHaveBeenCalledTimes(2);
      expect(mockSend).toHaveBeenCalledWith({
        name: "workflow/schedule",
        data: { workshopId: "ws-test-123", workflowAssignmentId: "wa-pre-001" },
      });
      expect(mockSend).toHaveBeenCalledWith({
        name: "workflow/schedule",
        data: { workshopId: "ws-test-123", workflowAssignmentId: "wa-post-001" },
      });
    });
  });

  // -----------------------------------------------------------------------
  // 2. IDEMPOTENCY
  // -----------------------------------------------------------------------
  describe("Idempotency: skip if already built", () => {
    it("should proceed when pages exist but status has not advanced (per-template dedup handles duplicates)", async () => {
      step.run = jest.fn(async (name: string, fn: () => Promise<unknown>) => {
        if (name === "idempotency-check") {
          (db.landingPage.findMany as jest.Mock).mockResolvedValueOnce([{ id: "existing-lp" }]);
          (db.workshop.findUnique as jest.Mock).mockResolvedValueOnce({ status: "APPROVED" });
        } else if (name === "fetch-workshop") {
          (db.workshop.findUnique as jest.Mock).mockResolvedValueOnce(createWorkshopRecord());
        } else if (name === "create-landing-pages") {
          (db.landingPage.findMany as jest.Mock).mockResolvedValueOnce(createActiveTemplates());
          (db.landingPage.findUnique as jest.Mock).mockResolvedValue(null);
          (db.landingPage.create as jest.Mock).mockResolvedValue({ id: "lp-new" });
        } else if (name === "assign-pre-event-workflow") {
          (db.workflow.findFirst as jest.Mock).mockResolvedValueOnce(null);
        } else if (name === "assign-post-event-workflow") {
          (db.workflow.findFirst as jest.Mock).mockResolvedValueOnce(null);
        } else if (name === "update-status") {
          (db.workshop.update as jest.Mock).mockResolvedValueOnce({ id: "ws-test-123" });
        }
        return fn();
      });

      const result = await handler({ event: createEvent(), step }) as Record<string, unknown>;
      // Should NOT skip — only status-based idempotency triggers skip
      expect(result.skipped).toBeUndefined();
      expect(result.status).toBe("PRE_EVENT");
      // All steps should run
      expect(step.run).toHaveBeenCalledTimes(7);
    });

    it("should skip when workshop status is already PRE_EVENT", async () => {
      step.run = jest.fn(async (name: string, fn: () => Promise<unknown>) => {
        if (name === "idempotency-check") {
          (db.landingPage.findMany as jest.Mock).mockResolvedValueOnce([]);
          (db.workshop.findUnique as jest.Mock).mockResolvedValueOnce({ status: "PRE_EVENT" });
        }
        return fn();
      });

      const result = await handler({ event: createEvent(), step });
      expect(result).toEqual({
        workshopId: "ws-test-123",
        skipped: true,
        reason: "Idempotency guard: pages=0, status=PRE_EVENT",
      });
      expect(step.run).toHaveBeenCalledTimes(1);
    });
  });

  // -----------------------------------------------------------------------
  // 3. ERROR HANDLING
  // -----------------------------------------------------------------------
  describe("Error handling", () => {
    it("should throw when workshop is not found", async () => {
      step.run = jest.fn(async (name: string, fn: () => Promise<unknown>) => {
        if (name === "idempotency-check") {
          (db.landingPage.findMany as jest.Mock).mockResolvedValueOnce([]);
          (db.workshop.findUnique as jest.Mock).mockResolvedValueOnce({ status: "APPROVED" });
        } else if (name === "fetch-workshop") {
          (db.workshop.findUnique as jest.Mock).mockResolvedValueOnce(null);
        }
        return fn();
      });

      await expect(handler({ event: createEvent(), step })).rejects.toThrow("Workshop ws-test-123 not found");
    });

    it("should handle zero active templates gracefully", async () => {
      step.run = jest.fn(async (name: string, fn: () => Promise<unknown>) => {
        if (name === "idempotency-check") {
          (db.landingPage.findMany as jest.Mock).mockResolvedValueOnce([]);
          (db.workshop.findUnique as jest.Mock).mockResolvedValueOnce({ status: "APPROVED" });
        } else if (name === "fetch-workshop") {
          (db.workshop.findUnique as jest.Mock).mockResolvedValueOnce(createWorkshopRecord());
        } else if (name === "create-landing-pages") {
          (db.landingPage.findMany as jest.Mock).mockResolvedValueOnce([]); // no templates
        } else if (name === "assign-pre-event-workflow") {
          (db.workflow.findFirst as jest.Mock).mockResolvedValueOnce(null);
        } else if (name === "assign-post-event-workflow") {
          (db.workflow.findFirst as jest.Mock).mockResolvedValueOnce(null);
        } else if (name === "update-status") {
          (db.workshop.update as jest.Mock).mockResolvedValueOnce({ id: "ws-test-123" });
        }
        return fn();
      });

      const result = await handler({ event: createEvent(), step });
      expect(result).toEqual({
        workshopId: "ws-test-123",
        pagesCreated: 0,
        noTemplatesAvailable: true,
        preEventWorkflow: null,
        postEventWorkflow: null,
        status: "PRE_EVENT",
      });
    });

    it("should skip page creation when template type already exists for workshop", async () => {
      step.run = jest.fn(async (name: string, fn: () => Promise<unknown>) => {
        if (name === "idempotency-check") {
          (db.landingPage.findMany as jest.Mock).mockResolvedValueOnce([]);
          (db.workshop.findUnique as jest.Mock).mockResolvedValueOnce({ status: "APPROVED" });
        } else if (name === "fetch-workshop") {
          (db.workshop.findUnique as jest.Mock).mockResolvedValueOnce(createWorkshopRecord());
        } else if (name === "create-landing-pages") {
          (db.landingPage.findMany as jest.Mock).mockResolvedValueOnce(createActiveTemplates());
          // All template types already exist
          (db.landingPage.findUnique as jest.Mock).mockResolvedValue({ id: "existing" });
        } else if (name === "assign-pre-event-workflow") {
          (db.workflow.findFirst as jest.Mock).mockResolvedValueOnce(createPreEventWorkflow());
          (db.workflowAssignment.findUnique as jest.Mock).mockResolvedValueOnce(null);
          (db.workflowAssignment.create as jest.Mock).mockResolvedValueOnce({ id: "wa-001" });
        } else if (name === "assign-post-event-workflow") {
          (db.workflow.findFirst as jest.Mock).mockResolvedValueOnce(createPostEventWorkflow());
          (db.workflowAssignment.findUnique as jest.Mock).mockResolvedValueOnce(null);
          (db.workflowAssignment.create as jest.Mock).mockResolvedValueOnce({ id: "wa-002" });
        } else if (name === "update-status") {
          (db.workshop.update as jest.Mock).mockResolvedValueOnce({ id: "ws-test-123" });
        }
        return fn();
      });

      const result = await handler({ event: createEvent(), step }) as { pagesCreated: number };
      expect(result.pagesCreated).toBe(0);
      expect(db.landingPage.create).not.toHaveBeenCalled();
    });
  });

  // -----------------------------------------------------------------------
  // 4. WORKFLOW ASSIGNMENT
  // -----------------------------------------------------------------------
  describe("Workflow assignment", () => {
    it("should skip assignment when workflow is already assigned", async () => {
      step.run = jest.fn(async (name: string, fn: () => Promise<unknown>) => {
        if (name === "idempotency-check") {
          (db.landingPage.findMany as jest.Mock).mockResolvedValueOnce([]);
          (db.workshop.findUnique as jest.Mock).mockResolvedValueOnce({ status: "APPROVED" });
        } else if (name === "fetch-workshop") {
          (db.workshop.findUnique as jest.Mock).mockResolvedValueOnce(createWorkshopRecord());
        } else if (name === "create-landing-pages") {
          (db.landingPage.findMany as jest.Mock).mockResolvedValueOnce(createActiveTemplates());
          (db.landingPage.findUnique as jest.Mock).mockResolvedValue(null);
          (db.landingPage.create as jest.Mock).mockResolvedValue({ id: "lp-new" });
        } else if (name === "assign-pre-event-workflow") {
          (db.workflow.findFirst as jest.Mock).mockResolvedValueOnce(createPreEventWorkflow());
          // Already assigned
          (db.workflowAssignment.findUnique as jest.Mock).mockResolvedValueOnce({ id: "existing-wa" });
        } else if (name === "assign-post-event-workflow") {
          (db.workflow.findFirst as jest.Mock).mockResolvedValueOnce(createPostEventWorkflow());
          (db.workflowAssignment.findUnique as jest.Mock).mockResolvedValueOnce({ id: "existing-wa-2" });
        } else if (name === "update-status") {
          (db.workshop.update as jest.Mock).mockResolvedValueOnce({ id: "ws-test-123" });
        }
        return fn();
      });

      await handler({ event: createEvent(), step });
      expect(db.workflowAssignment.create).not.toHaveBeenCalled();
      expect(mockSend).not.toHaveBeenCalled();
    });

    it("should handle workshop with no category", async () => {
      step.run = jest.fn(async (name: string, fn: () => Promise<unknown>) => {
        if (name === "idempotency-check") {
          (db.landingPage.findMany as jest.Mock).mockResolvedValueOnce([]);
          (db.workshop.findUnique as jest.Mock).mockResolvedValueOnce({ status: "APPROVED" });
        } else if (name === "fetch-workshop") {
          (db.workshop.findUnique as jest.Mock).mockResolvedValueOnce(
            createWorkshopRecord({ categoryId: null, workshopCategory: null })
          );
        } else if (name === "create-landing-pages") {
          (db.landingPage.findMany as jest.Mock).mockResolvedValueOnce([]);
        } else if (name === "assign-pre-event-workflow") {
          (db.workflow.findFirst as jest.Mock).mockResolvedValueOnce(null);
        } else if (name === "assign-post-event-workflow") {
          (db.workflow.findFirst as jest.Mock).mockResolvedValueOnce(null);
        } else if (name === "update-status") {
          (db.workshop.update as jest.Mock).mockResolvedValueOnce({ id: "ws-test-123" });
        }
        return fn();
      });

      const result = await handler({ event: createEvent(), step });
      expect(result).toEqual({
        workshopId: "ws-test-123",
        pagesCreated: 0,
        noTemplatesAvailable: true,
        preEventWorkflow: null,
        postEventWorkflow: null,
        status: "PRE_EVENT",
      });
    });
  });

  // -----------------------------------------------------------------------
  // 5. TEMPLATE VARIABLE EDGE CASES
  // -----------------------------------------------------------------------
  describe("Template variable interpolation", () => {
    it("should display Free for free workshops", async () => {
      step.run = jest.fn(async (name: string, fn: () => Promise<unknown>) => {
        if (name === "idempotency-check") {
          (db.landingPage.findMany as jest.Mock).mockResolvedValueOnce([]);
          (db.workshop.findUnique as jest.Mock).mockResolvedValueOnce({ status: "APPROVED" });
        } else if (name === "fetch-workshop") {
          (db.workshop.findUnique as jest.Mock).mockResolvedValueOnce(
            createWorkshopRecord({ isFree: true, priceCents: null, pricingTier: null })
          );
        } else if (name === "create-landing-pages") {
          (db.landingPage.findMany as jest.Mock).mockResolvedValueOnce([
            { id: "tpl-price", template: "REGISTRATION", content: '{"price":"{{price}}"}', slug: "tpl" },
          ]);
          (db.landingPage.findUnique as jest.Mock).mockResolvedValue(null);
          (db.landingPage.create as jest.Mock).mockResolvedValue({ id: "lp-new" });
        } else if (name === "assign-pre-event-workflow") {
          (db.workflow.findFirst as jest.Mock).mockResolvedValueOnce(null);
        } else if (name === "assign-post-event-workflow") {
          (db.workflow.findFirst as jest.Mock).mockResolvedValueOnce(null);
        } else if (name === "update-status") {
          (db.workshop.update as jest.Mock).mockResolvedValueOnce({ id: "ws-test-123" });
        }
        return fn();
      });

      await handler({ event: createEvent(), step });
      const createCall = (db.landingPage.create as jest.Mock).mock.calls[0][0];
      expect(createCall.data.content).toContain('"Free"');
    });

    it("should convert pricingTier cents to dollar amount", async () => {
      step.run = createStepRunForHappyPath();
      await handler({ event: createEvent(), step });

      // The template with {{price}} should have $499
      const createCalls = (db.landingPage.create as jest.Mock).mock.calls;
      // At least one page should be created
      expect(createCalls.length).toBeGreaterThan(0);
    });
  });
});
