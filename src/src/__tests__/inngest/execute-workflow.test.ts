/**
 * Tests for Inngest Function: Execute Workflow (JV-11 + JV-22)
 *
 * Covers: assignment fetching, step type routing (EMAIL_COACH, EMAIL_STAFF,
 * EMAIL_CUSTOM, EMAIL_ATTENDEES, NOTIFICATION), timing logic, dedup guard,
 * attachments, error handling, and execution recording.
 */

/* eslint-disable @typescript-eslint/no-explicit-any */

// ============================================
// Mocks — declared before imports
// ============================================

jest.mock("@/lib/db", () => ({
  db: {
    workflowAssignment: { findUnique: jest.fn() },
    workflowStepExecution: {
      create: jest.fn(async () => ({ id: "exec-new" })),
      update: jest.fn(async () => ({ id: "exec-new" })),
      findFirst: jest.fn(),
      // ENH-MAY6-10: per-recipient child writes via upsert.
      upsert: jest.fn(async () => ({ id: "child-new" })),
      findMany: jest.fn(async () => []),
    },
    registration: { findMany: jest.fn() },
  },
}));

// eslint-disable-next-line no-var
var capturedHandler: (...args: unknown[]) => unknown;
jest.mock("@/inngest/client", () => ({
  inngest: {
    createFunction: jest.fn(
      (_config: unknown, _trigger: unknown, handler: (...args: unknown[]) => unknown) => {
        capturedHandler = handler;
        return handler;
      }
    ),
    send: jest.fn(),
  },
}));

jest.mock("@/lib/workflows/workflow-service", () => ({
  interpolateTemplate: jest.fn((input: string) => input),
  calculateSendDate: jest.fn(),
}));

jest.mock("@/lib/workflows/workflow-types", () => ({
  STEP_TYPES: {
    EMAIL_ATTENDEES: "EMAIL_ATTENDEES",
    EMAIL_COACH: "EMAIL_COACH",
    EMAIL_STAFF: "EMAIL_STAFF",
    EMAIL_CUSTOM: "EMAIL_CUSTOM",
    NOTIFICATION: "NOTIFICATION",
    SEND_SURVEY_LINK: "SEND_SURVEY_LINK",
    SEND_FILE_LINK: "SEND_FILE_LINK",
  },
  TRIGGER_TYPES: {
    RELATIVE_TO_EVENT: "RELATIVE_TO_EVENT",
    ON_REGISTRATION: "ON_REGISTRATION",
    ON_APPROVAL: "ON_APPROVAL",
  },
}));

jest.mock("@/lib/surveys/survey-types", () => ({
  SURVEY_TYPES: {
    PRE_WORKSHOP: "PRE_WORKSHOP",
    POST_WORKSHOP: "POST_WORKSHOP",
  },
}));

jest.mock("@/lib/ics-generator", () => ({
  buildLocationString: jest.fn(() => "123 Main St, New York, NY"),
}));

jest.mock("@/lib/files/file-service", () => ({
  getWorkflowStepFiles: jest.fn(async () => []),
  canDeliverWorkflowAttachments: jest.fn(() => true),
  buildProtectedEmailAttachments: jest.fn(() => []),
}));

jest.mock("@/lib/smtp-transport", () => ({
  sendEmailViaSMTP: jest.fn(async () => ({ messageId: "mock-msg-id" })),
}));

jest.mock("@/lib/delivery-telemetry", () => ({
  recordDeliveryTelemetry: jest.fn(async () => {}),
}));

jest.mock("@/lib/surveys/survey-automation", () => ({
  getOrCreateSurveyLink: jest.fn(),
}));

// ============================================
// Imports (after mocks)
// ============================================

import { db } from "@/lib/db";
import {
  interpolateTemplate,
  calculateSendDate,
} from "@/lib/workflows/workflow-service";
import { sendEmailViaSMTP } from "@/lib/smtp-transport";
import {
  getWorkflowStepFiles,
  canDeliverWorkflowAttachments,
  buildProtectedEmailAttachments,
} from "@/lib/files/file-service";
import { recordDeliveryTelemetry } from "@/lib/delivery-telemetry";
import { getOrCreateSurveyLink } from "@/lib/surveys/survey-automation";

// Force the module to load so capturedHandler is assigned
import "@/inngest/functions/execute-workflow";

// ============================================
// Helpers
// ============================================

const mockStep = {
  run: jest.fn(async (_name: string, fn: () => Promise<unknown>) => fn()),
  sleepUntil: jest.fn(),
};

function buildEvent(overrides: Record<string, unknown> = {}) {
  return {
    data: {
      workshopId: "ws-1",
      workflowAssignmentId: "assign-1",
      ...overrides,
    },
  };
}

function makeStep(overrides: Record<string, unknown> = {}): any {
  return {
    id: "step-1",
    sortOrder: 0,
    stepType: "EMAIL_COACH",
    triggerType: "IMMEDIATE",
    subject: "Hello {{coachName}}",
    body: "<p>Workshop {{workshopTitle}} is ready</p>",
    isActive: true,
    emailTemplate: null,
    offsetDays: null,
    offsetHours: null,
    sendTimeOfDay: null,
    customRecipients: null,
    ...overrides,
  };
}

function makeAssignment(overrides: Record<string, unknown> = {}): any {
  const {
    steps,
    workshopOverrides,
    coachOverrides,
    ...rest
  } = overrides as any;

  return {
    id: "assign-1",
    isActive: true,
    workflow: {
      id: "wf-1",
      name: "Pre-Event Sequence",
      steps: steps ?? [makeStep()],
    },
    workshop: {
      id: "ws-1",
      title: "Scaling Up Workshop",
      workshopCode: "WS-001",
      eventDate: new Date("2026-06-15"),
      eventTime: "9:00 AM",
      timezone: "America/New_York",
      landingPageSlug: "scaling-up",
      status: "PRE_EVENT",
      coach: {
        firstName: "John",
        lastName: "Smith",
        email: "coach@example.com",
        ...(coachOverrides ?? {}),
      },
      ...(workshopOverrides ?? {}),
    },
    ...rest,
  };
}

function invoke(event = buildEvent()) {
  return capturedHandler({ event, step: mockStep });
}

// ============================================
// Test Suite
// ============================================

describe("execute-workflow Inngest function", () => {
  const findUnique = db.workflowAssignment.findUnique as jest.Mock;
  const executionCreate = db.workflowStepExecution.create as jest.Mock;
  const executionFindFirst = db.workflowStepExecution.findFirst as jest.Mock;
  const registrationFindMany = db.registration.findMany as jest.Mock;
  const mockInterpolate = interpolateTemplate as jest.Mock;
  const mockCalculateSendDate = calculateSendDate as jest.Mock;
  const mockSendEmail = sendEmailViaSMTP as jest.Mock;
  const mockGetStepFiles = getWorkflowStepFiles as jest.Mock;
  const mockCanDeliver = canDeliverWorkflowAttachments as jest.Mock;
  const mockBuildAttachments = buildProtectedEmailAttachments as jest.Mock;
  const mockRecordTelemetry = recordDeliveryTelemetry as jest.Mock;
  const mockGetOrCreateSurveyLink = getOrCreateSurveyLink as jest.Mock;

  beforeEach(() => {
    jest.clearAllMocks();

    // Defaults
    mockInterpolate.mockImplementation((input: string) => input);
    mockGetStepFiles.mockResolvedValue([]);
    mockCanDeliver.mockReturnValue(true);
    mockBuildAttachments.mockReturnValue([]);
    executionCreate.mockResolvedValue({});
    executionFindFirst.mockResolvedValue(null);
    registrationFindMany.mockResolvedValue([]);
    mockSendEmail.mockResolvedValue({ messageId: "mock-msg-id" });
    mockRecordTelemetry.mockResolvedValue(undefined);
    mockGetOrCreateSurveyLink.mockResolvedValue({
      surveyId: "survey-1",
      surveyUrl: "https://app.test/survey/survey-1",
      surveyType: "PRE_WORKSHOP",
    });

    // Default ENV
    process.env.ADMIN_EMAIL = "admin@scalingup.com";
    process.env.APP_URL = "https://app.test";
  });

  // ------------------------------------------------------------------
  // 1. Assignment not found
  // ------------------------------------------------------------------
  it("returns skipped when assignment not found", async () => {
    findUnique.mockResolvedValue(null);

    const result = await invoke();

    expect(result).toEqual({
      skipped: true,
      reason: "Assignment not found or inactive",
    });
    expect(mockSendEmail).not.toHaveBeenCalled();
  });

  // ------------------------------------------------------------------
  // 2. Assignment inactive
  // ------------------------------------------------------------------
  it("returns skipped when assignment is inactive", async () => {
    findUnique.mockResolvedValue(makeAssignment({ isActive: false }));

    const result = await invoke();

    expect(result).toEqual({
      skipped: true,
      reason: "Assignment not found or inactive",
    });
    expect(mockSendEmail).not.toHaveBeenCalled();
  });

  // ------------------------------------------------------------------
  // 3. EMAIL_COACH: sends email to coach
  // ------------------------------------------------------------------
  it("EMAIL_COACH: sends email to coach with correct subject/body", async () => {
    const assignment = makeAssignment({
      steps: [
        makeStep({
          stepType: "EMAIL_COACH",
          subject: "Hello Coach",
          body: "<p>Ready</p>",
        }),
      ],
    });
    findUnique.mockResolvedValue(assignment);

    const result = await invoke();

    expect(mockSendEmail).toHaveBeenCalledTimes(1);
    expect(mockSendEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        to: "coach@example.com",
        subject: "Hello Coach",
        html: "<p>Ready</p>",
      })
    );
    expect(result).toMatchObject({
      success: true,
      stepsExecuted: 1,
      stepsFailed: 0,
      totalSteps: 1,
    });
  });

  // ------------------------------------------------------------------
  // 4. EMAIL_STAFF: sends to admin email
  // ------------------------------------------------------------------
  it("EMAIL_STAFF: sends to admin email from env", async () => {
    process.env.ADMIN_EMAIL = "ops@company.com";
    const assignment = makeAssignment({
      steps: [
        makeStep({
          stepType: "EMAIL_STAFF",
          subject: "Staff Alert",
          body: "<p>Alert body</p>",
        }),
      ],
    });
    findUnique.mockResolvedValue(assignment);

    await invoke();

    expect(mockSendEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        to: "ops@company.com",
        subject: "Staff Alert",
        html: "<p>Alert body</p>",
      })
    );
  });

  // ------------------------------------------------------------------
  // 5. EMAIL_CUSTOM: parses JSON array recipients
  // ------------------------------------------------------------------
  it("EMAIL_CUSTOM: parses JSON array recipients", async () => {
    const assignment = makeAssignment({
      steps: [
        makeStep({
          stepType: "EMAIL_CUSTOM",
          customRecipients: '["alice@test.com","bob@test.com"]',
          subject: "Custom",
          body: "Hi",
        }),
      ],
    });
    findUnique.mockResolvedValue(assignment);

    await invoke();

    expect(mockSendEmail).toHaveBeenCalledTimes(2);
    expect(mockSendEmail).toHaveBeenCalledWith(
      expect.objectContaining({ to: "alice@test.com" })
    );
    expect(mockSendEmail).toHaveBeenCalledWith(
      expect.objectContaining({ to: "bob@test.com" })
    );
  });

  // ------------------------------------------------------------------
  // 6. EMAIL_CUSTOM: parses comma-separated recipients
  // ------------------------------------------------------------------
  it("EMAIL_CUSTOM: parses comma-separated recipients", async () => {
    const assignment = makeAssignment({
      steps: [
        makeStep({
          stepType: "EMAIL_CUSTOM",
          customRecipients: "alice@test.com, bob@test.com",
          subject: "Custom",
          body: "Hi",
        }),
      ],
    });
    findUnique.mockResolvedValue(assignment);

    await invoke();

    expect(mockSendEmail).toHaveBeenCalledTimes(2);
    expect(mockSendEmail).toHaveBeenCalledWith(
      expect.objectContaining({ to: "alice@test.com" })
    );
    expect(mockSendEmail).toHaveBeenCalledWith(
      expect.objectContaining({ to: "bob@test.com" })
    );
  });

  // ------------------------------------------------------------------
  // 7. EMAIL_ATTENDEES: sends personalized emails to all registrations
  // ------------------------------------------------------------------
  it("EMAIL_ATTENDEES: sends personalized emails to all registrations", async () => {
    const assignment = makeAssignment({
      steps: [
        makeStep({
          stepType: "EMAIL_ATTENDEES",
          subject: "Welcome {{registrantName}}",
          body: "<p>Hello {{registrantName}}</p>",
        }),
      ],
    });
    findUnique.mockResolvedValue(assignment);

    registrationFindMany.mockResolvedValue([
      {
        id: "reg-1",
        email: "attendee1@test.com",
        firstName: "Alice",
        lastName: "Smith",
        company: "Acme",
      },
      {
        id: "reg-2",
        email: "attendee2@test.com",
        firstName: "Bob",
        lastName: "Jones",
        company: "Corp",
      },
    ]);

    const result = await invoke();

    expect(mockSendEmail).toHaveBeenCalledTimes(2);
    expect(mockSendEmail).toHaveBeenCalledWith(
      expect.objectContaining({ to: "attendee1@test.com" })
    );
    expect(mockSendEmail).toHaveBeenCalledWith(
      expect.objectContaining({ to: "attendee2@test.com" })
    );
    // Should call interpolateTemplate with personal context for each attendee
    expect(mockInterpolate).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ registrantName: "Alice Smith" })
    );
    expect(mockInterpolate).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ registrantName: "Bob Jones" })
    );
    expect(result).toMatchObject({
      success: true,
      stepsExecuted: 1,
    });
  });

  // ------------------------------------------------------------------
  // 8. EMAIL_ATTENDEES: deduplicates emails (case insensitive)
  // ------------------------------------------------------------------
  it("EMAIL_ATTENDEES: deduplicates emails (same email different case)", async () => {
    const assignment = makeAssignment({
      steps: [
        makeStep({
          stepType: "EMAIL_ATTENDEES",
          subject: "Hi",
          body: "Body",
        }),
      ],
    });
    findUnique.mockResolvedValue(assignment);

    registrationFindMany.mockResolvedValue([
      {
        id: "reg-1",
        email: "ALICE@test.com",
        firstName: "Alice",
        lastName: "A",
        company: "",
      },
      {
        id: "reg-2",
        email: "alice@test.com",
        firstName: "Alice",
        lastName: "B",
        company: "",
      },
    ]);

    await invoke();

    // Only one email should be sent because the addresses match case-insensitively
    expect(mockSendEmail).toHaveBeenCalledTimes(1);
    expect(mockSendEmail).toHaveBeenCalledWith(
      expect.objectContaining({ to: "ALICE@test.com" })
    );
  });

  // ------------------------------------------------------------------
  // 9. EMAIL_ATTENDEES dedup guard: skips if execution already SENT
  // ------------------------------------------------------------------
  it("EMAIL_ATTENDEES dedup guard: skips if execution already SENT", async () => {
    const assignment = makeAssignment({
      steps: [
        makeStep({
          stepType: "EMAIL_ATTENDEES",
          subject: "Hi",
          body: "Body",
        }),
      ],
    });
    findUnique.mockResolvedValue(assignment);

    // Simulate existing SENT execution
    executionFindFirst.mockResolvedValue({
      id: "exec-1",
      status: "SENT",
    });

    const result = await invoke();

    // Should NOT fetch registrations or send any emails
    expect(registrationFindMany).not.toHaveBeenCalled();
    expect(mockSendEmail).not.toHaveBeenCalled();
    // stepsExecuted should still count (the function increments and returns)
    expect(result).toMatchObject({
      success: true,
      stepsExecuted: 1,
    });
  });

  // ------------------------------------------------------------------
  // 10. NOTIFICATION: logs but doesn't send email
  // ------------------------------------------------------------------
  it("NOTIFICATION: logs and records execution without sending email", async () => {
    const consoleSpy = jest.spyOn(console, "log").mockImplementation();
    const assignment = makeAssignment({
      steps: [
        makeStep({
          stepType: "NOTIFICATION",
          subject: "System Alert",
          body: "Something happened",
        }),
      ],
    });
    findUnique.mockResolvedValue(assignment);

    const result = await invoke();

    expect(mockSendEmail).not.toHaveBeenCalled();
    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining("[Workflow Notification]")
    );
    expect(executionCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          stepId: "step-1",
          status: "SENT",
        }),
      })
    );
    expect(result).toMatchObject({
      success: true,
      stepsExecuted: 1,
    });

    consoleSpy.mockRestore();
  });

  // ------------------------------------------------------------------
  // 11. RELATIVE_TO_EVENT: calls sleepUntil for future dates
  // ------------------------------------------------------------------
  it("RELATIVE_TO_EVENT timing: calls sleepUntil for future dates", async () => {
    const futureDate = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days ahead
    mockCalculateSendDate.mockReturnValue(futureDate);

    const assignment = makeAssignment({
      steps: [
        makeStep({
          triggerType: "RELATIVE_TO_EVENT",
          stepType: "EMAIL_COACH",
          offsetDays: -7,
          subject: "Reminder",
          body: "Coming soon",
        }),
      ],
    });
    findUnique.mockResolvedValue(assignment);

    await invoke();

    expect(mockCalculateSendDate).toHaveBeenCalledWith(
      expect.any(Date),
      -7,
      null,
      null,
      "America/New_York"
    );
    expect(mockStep.sleepUntil).toHaveBeenCalledWith(
      expect.stringContaining("wait-"),
      futureDate
    );
    // Should still execute the step after sleeping
    expect(mockSendEmail).toHaveBeenCalledTimes(1);
  });

  // ------------------------------------------------------------------
  // 12. RELATIVE_TO_EVENT: fires immediately (SENT) for past dates
  // ------------------------------------------------------------------
  it("RELATIVE_TO_EVENT timing: fires immediately (SENT) for past dates", async () => {
    const pastDate = new Date(Date.now() - 24 * 60 * 60 * 1000); // 1 day ago
    mockCalculateSendDate.mockReturnValue(pastDate);

    const assignment = makeAssignment({
      steps: [
        makeStep({
          triggerType: "RELATIVE_TO_EVENT",
          stepType: "EMAIL_COACH",
          offsetDays: -30,
          subject: "Old",
          body: "Missed",
        }),
      ],
    });
    findUnique.mockResolvedValue(assignment);

    const result = await invoke();

    expect(mockStep.sleepUntil).not.toHaveBeenCalled();
    expect(mockSendEmail).toHaveBeenCalled();
    const skippedCall = (executionCreate as jest.Mock).mock.calls.find(
      ([data]: [{ data: { status: string } }]) => data?.data?.status === "SKIPPED"
    );
    expect(skippedCall).toBeUndefined();
    // The step fires immediately so stepsExecuted = 1
    expect(result).toMatchObject({
      success: true,
      stepsExecuted: 1,
      stepsFailed: 0,
      totalSteps: 1,
    });
  });

  // ------------------------------------------------------------------
  // RELATIVE_TO_EVENT past-timestamp behavior
  // ------------------------------------------------------------------
  describe("RELATIVE_TO_EVENT past-timestamp behavior", () => {
    it("fires immediately (SENT) when sendAt is in the past — does NOT create SKIPPED record", async () => {
      const pastSendAt = new Date(Date.now() - 60 * 60 * 1000);
      (calculateSendDate as jest.Mock).mockReturnValue(pastSendAt);
      const mockCreate = db.workflowStepExecution.create as jest.Mock;
      mockCreate.mockResolvedValue({});
      const assignment = makeAssignment({
        steps: [makeStep({ triggerType: "RELATIVE_TO_EVENT", stepType: "EMAIL_COACH", offsetDays: 0, offsetHours: -1 })],
      });
      (db.workflowAssignment.findUnique as jest.Mock).mockResolvedValue(assignment);

      await capturedHandler({ event: buildEvent(), step: mockStep });

      expect(mockStep.sleepUntil).not.toHaveBeenCalled();
      expect(sendEmailViaSMTP).toHaveBeenCalled();
      const skippedCall = mockCreate.mock.calls.find(
        ([data]: [{ data: { status: string } }]) => data?.data?.status === "SKIPPED"
      );
      expect(skippedCall).toBeUndefined();
    });

    it("sleeps until sendAt when it is in the future", async () => {
      const futureSendAt = new Date(Date.now() + 2 * 60 * 60 * 1000);
      (calculateSendDate as jest.Mock).mockReturnValue(futureSendAt);
      const assignment = makeAssignment({
        steps: [makeStep({ triggerType: "RELATIVE_TO_EVENT", stepType: "EMAIL_COACH", offsetDays: 0, offsetHours: -2 })],
      });
      (db.workflowAssignment.findUnique as jest.Mock).mockResolvedValue(assignment);

      await capturedHandler({ event: buildEvent(), step: mockStep });

      expect(mockStep.sleepUntil).toHaveBeenCalledWith(expect.stringContaining("wait-"), futureSendAt);
    });
  });

  // ------------------------------------------------------------------
  // 13. Step failure: records FAILED execution with error message
  // ------------------------------------------------------------------
  it("step failure: records FAILED execution with error message", async () => {
    mockStep.run.mockImplementation(
      async (name: string, fn: () => Promise<unknown>) => {
        if (name.startsWith("execute-")) {
          throw new Error("SMTP connection refused");
        }
        return fn();
      }
    );

    const assignment = makeAssignment({
      steps: [
        makeStep({
          stepType: "EMAIL_COACH",
          subject: "Hi",
          body: "Test",
        }),
      ],
    });
    findUnique.mockResolvedValue(assignment);

    const result = await invoke();

    // Should record failure via the record-failure step
    expect(mockStep.run).toHaveBeenCalledWith(
      expect.stringContaining("record-failure-"),
      expect.any(Function)
    );
    expect(executionCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: "FAILED",
          errorMessage: "SMTP connection refused",
          attempts: 1,
        }),
      })
    );
    expect(result).toMatchObject({
      success: true,
      stepsExecuted: 0,
      stepsFailed: 1,
      totalSteps: 1,
    });

    // Restore default mock
    mockStep.run.mockImplementation(
      async (_name: string, fn: () => Promise<unknown>) => fn()
    );
  });

  // ------------------------------------------------------------------
  // 14. Variable interpolation: passes context to interpolateTemplate
  // ------------------------------------------------------------------
  it("variable interpolation: passes correct context to interpolateTemplate", async () => {
    const assignment = makeAssignment({
      steps: [
        makeStep({
          stepType: "EMAIL_COACH",
          subject: "Hello {{coachName}}",
          body: "<p>Workshop {{workshopTitle}}</p>",
        }),
      ],
    });
    findUnique.mockResolvedValue(assignment);

    await invoke();

    // Should call interpolateTemplate with subject and body, with base context
    expect(mockInterpolate).toHaveBeenCalledWith(
      "Hello {{coachName}}",
      expect.objectContaining({
        workshopTitle: "Scaling Up Workshop",
        workshopCode: "WS-001",
        coachName: "John Smith",
        coachEmail: "coach@example.com",
        // workshopTime now carries the DST-aware zone abbreviation
        workshopTime: expect.stringMatching(/9:00 AM (EDT|EST)/),
        workshopTimezone: expect.stringMatching(/^(EDT|EST)$/),
      })
    );
    expect(mockInterpolate).toHaveBeenCalledWith(
      "<p>Workshop {{workshopTitle}}</p>",
      expect.objectContaining({
        workshopTitle: "Scaling Up Workshop",
      })
    );
  });

  // ------------------------------------------------------------------
  // 15. Correct stepsExecuted/stepsFailed/totalSteps counts
  // ------------------------------------------------------------------
  it("returns correct stepsExecuted/stepsFailed/totalSteps counts with mixed results", async () => {
    // First step succeeds, second step also succeeds (both NOTIFICATION to avoid email sending)
    const assignment = makeAssignment({
      steps: [
        makeStep({
          id: "step-1",
          sortOrder: 0,
          stepType: "NOTIFICATION",
          subject: "One",
          body: "Body1",
        }),
        makeStep({
          id: "step-2",
          sortOrder: 1,
          stepType: "NOTIFICATION",
          subject: "Two",
          body: "Body2",
        }),
        makeStep({
          id: "step-3",
          sortOrder: 2,
          stepType: "EMAIL_COACH",
          subject: "Three",
          body: "Body3",
        }),
      ],
    });
    findUnique.mockResolvedValue(assignment);

    // Make the third step (execute-step-2-EMAIL_COACH) fail
    mockStep.run.mockImplementation(
      async (name: string, fn: () => Promise<unknown>) => {
        // The execute-step-2-EMAIL_COACH will be the 4th call
        // calls: fetch-assignment, execute-step-0-NOTIFICATION, execute-step-1-NOTIFICATION, execute-step-2-EMAIL_COACH
        if (name === "execute-step-2-EMAIL_COACH") {
          throw new Error("Failed step");
        }
        return fn();
      }
    );

    const consoleSpy = jest.spyOn(console, "log").mockImplementation();
    const result = await invoke();
    consoleSpy.mockRestore();

    expect(result).toMatchObject({
      success: true,
      stepsExecuted: 2,
      stepsFailed: 1,
      totalSteps: 3,
    });

    // Restore default mock
    mockStep.run.mockImplementation(
      async (_name: string, fn: () => Promise<unknown>) => fn()
    );
  });

  // ------------------------------------------------------------------
  // 16. Attachments: calls file service when step has files
  // ------------------------------------------------------------------
  it("attachments: calls file service and includes attachments in email", async () => {
    const mockFiles = [
      { id: "file-1", filename: "guide.pdf", contentType: "application/pdf" },
    ];
    const mockAttachments = [
      {
        filename: "guide.pdf",
        path: "https://protected.url/guide.pdf",
        contentType: "application/pdf",
      },
    ];
    mockGetStepFiles.mockResolvedValue(mockFiles);
    mockCanDeliver.mockReturnValue(true);
    mockBuildAttachments.mockReturnValue(mockAttachments);

    const assignment = makeAssignment({
      steps: [
        makeStep({
          stepType: "EMAIL_COACH",
          subject: "With Attachment",
          body: "See attached",
        }),
      ],
    });
    findUnique.mockResolvedValue(assignment);

    await invoke();

    expect(mockGetStepFiles).toHaveBeenCalledWith("step-1");
    expect(mockCanDeliver).toHaveBeenCalledWith(
      expect.objectContaining({
        recipientRole: "COACH",
        workshopStatus: "PRE_EVENT",
      })
    );
    expect(mockBuildAttachments).toHaveBeenCalledWith(
      expect.objectContaining({
        files: mockFiles,
        workshopId: "ws-1",
        workshopStatus: "PRE_EVENT",
        recipientRole: "COACH",
      })
    );
    expect(mockSendEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        attachments: mockAttachments,
      })
    );
  });

  // ------------------------------------------------------------------
  // 17. Attachments blocked by policy: records telemetry, sends without attachments
  // ------------------------------------------------------------------
  it("attachments: records telemetry and sends without attachments when policy blocks delivery", async () => {
    const mockFiles = [
      { id: "file-1", filename: "guide.pdf", contentType: "application/pdf" },
    ];
    mockGetStepFiles.mockResolvedValue(mockFiles);
    mockCanDeliver.mockReturnValue(false);
    mockBuildAttachments.mockReturnValue([]);

    const assignment = makeAssignment({
      steps: [
        makeStep({
          stepType: "EMAIL_COACH",
          subject: "Blocked Attachments",
          body: "No file",
        }),
      ],
    });
    findUnique.mockResolvedValue(assignment);

    await invoke();

    expect(mockRecordTelemetry).toHaveBeenCalledWith(
      expect.objectContaining({
        status: "SKIPPED",
        metadata: expect.objectContaining({
          reason: "attachment_policy_blocked",
        }),
      })
    );
    // Email still sent, but without attachments
    expect(mockSendEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        attachments: [],
      })
    );
  });

  // ------------------------------------------------------------------
  // 18. EMAIL_CUSTOM with empty customRecipients sends no emails
  // ------------------------------------------------------------------
  it("EMAIL_CUSTOM: sends no emails when customRecipients is null", async () => {
    const assignment = makeAssignment({
      steps: [
        makeStep({
          stepType: "EMAIL_CUSTOM",
          customRecipients: null,
          subject: "No One",
          body: "Body",
        }),
      ],
    });
    findUnique.mockResolvedValue(assignment);

    await invoke();

    // sendEmailViaSMTP iterates over empty recipients array so no calls
    expect(mockSendEmail).not.toHaveBeenCalled();
  });

  // ------------------------------------------------------------------
  // 19. Email template fallback: uses emailTemplate when subject/body empty
  // ------------------------------------------------------------------
  it("uses emailTemplate subject/body as fallback when step subject/body is empty", async () => {
    const assignment = makeAssignment({
      steps: [
        makeStep({
          stepType: "EMAIL_COACH",
          subject: "",
          body: "",
          emailTemplate: {
            subject: "Template Subject",
            body: "<p>Template Body</p>",
          },
        }),
      ],
    });
    findUnique.mockResolvedValue(assignment);

    await invoke();

    expect(mockInterpolate).toHaveBeenCalledWith("Template Subject", expect.any(Object));
    expect(mockInterpolate).toHaveBeenCalledWith("<p>Template Body</p>", expect.any(Object));
  });

  // ------------------------------------------------------------------
  // 20. EMAIL_ATTENDEES with files and blocked policy
  // ------------------------------------------------------------------
  it("EMAIL_ATTENDEES: records telemetry when attachment policy blocks delivery", async () => {
    const mockFiles = [
      { id: "file-1", filename: "doc.pdf", contentType: "application/pdf" },
    ];
    mockGetStepFiles.mockResolvedValue(mockFiles);
    mockCanDeliver.mockReturnValue(false);

    const assignment = makeAssignment({
      steps: [
        makeStep({
          stepType: "EMAIL_ATTENDEES",
          subject: "Hi",
          body: "Body",
        }),
      ],
    });
    findUnique.mockResolvedValue(assignment);

    registrationFindMany.mockResolvedValue([
      {
        id: "reg-1",
        email: "a@test.com",
        firstName: "A",
        lastName: "B",
        company: "",
      },
    ]);

    await invoke();

    expect(mockRecordTelemetry).toHaveBeenCalledWith(
      expect.objectContaining({
        status: "SKIPPED",
        metadata: expect.objectContaining({
          reason: "attachment_policy_blocked",
        }),
      })
    );
    // Emails still sent but without attachments
    expect(mockSendEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        attachments: [],
      })
    );
  });

  // ------------------------------------------------------------------
  // 21. APP_URL defaults when env not set
  // ------------------------------------------------------------------
  it("uses default APP_URL when env variable is not set", async () => {
    delete process.env.APP_URL;

    const assignment = makeAssignment({
      steps: [
        makeStep({
          stepType: "EMAIL_COACH",
          subject: "Test",
          body: "Body",
        }),
      ],
    });
    findUnique.mockResolvedValue(assignment);

    await invoke();

    // interpolateTemplate should receive workshopUrl with default domain
    expect(mockInterpolate).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        workshopUrl: "https://scaling-up-platform-v2.vercel.app/workshop/scaling-up",
      })
    );
  });

  // ------------------------------------------------------------------
  // 22. EMAIL_ATTENDEES telemetry includes workflow and step metadata
  // ------------------------------------------------------------------
  it("EMAIL_ATTENDEES: includes telemetry metadata in sendEmailViaSMTP calls", async () => {
    const assignment = makeAssignment({
      steps: [
        makeStep({
          id: "step-attendee",
          stepType: "EMAIL_ATTENDEES",
          subject: "Hi",
          body: "Body",
        }),
      ],
    });
    findUnique.mockResolvedValue(assignment);

    registrationFindMany.mockResolvedValue([
      {
        id: "reg-1",
        email: "person@test.com",
        firstName: "Person",
        lastName: "One",
        company: "Acme",
      },
    ]);

    await invoke();

    expect(mockSendEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        telemetry: expect.objectContaining({
          workshopId: "ws-1",
          workshopCode: "WS-001",
          workflowId: "wf-1",
          workflowStepId: "step-attendee",
          recipientRole: "ATTENDEE",
          registrationId: "reg-1",
        }),
      })
    );
  });

  // ------------------------------------------------------------------
  // 24. SEND_SURVEY_LINK: creates/uses survey links and emails attendees
  // ------------------------------------------------------------------
  it("SEND_SURVEY_LINK: generates survey links and emails attendees", async () => {
    const assignment = makeAssignment({
      steps: [
        makeStep({
          id: "step-survey",
          stepType: "SEND_SURVEY_LINK",
          triggerType: "ON_REGISTRATION",
          subject: "Survey for {{registrantName}}",
          body: "<p>Open {{surveyUrl}}</p>",
        }),
      ],
    });
    findUnique.mockResolvedValue(assignment);
    registrationFindMany.mockResolvedValue([
      {
        id: "reg-1",
        email: "attendee@test.com",
        firstName: "Alice",
        lastName: "Smith",
        company: "Acme",
      },
    ]);

    await invoke();

    expect(mockGetOrCreateSurveyLink).toHaveBeenCalledWith({
      workshopId: "ws-1",
      registrationId: "reg-1",
      surveyType: "PRE_WORKSHOP",
    });
    expect(mockInterpolate).toHaveBeenCalledWith(
      "<p>Open {{surveyUrl}}</p>",
      expect.objectContaining({
        registrantName: "Alice Smith",
        surveyUrl: "https://app.test/survey/survey-1",
      })
    );
    expect(mockSendEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        to: "attendee@test.com",
        telemetry: expect.objectContaining({
          workflowStepId: "step-survey",
          recipientRole: "ATTENDEE",
          registrationId: "reg-1",
        }),
      })
    );
  });

  // ------------------------------------------------------------------
  // 25. SEND_FILE_LINK: emails attendees with protected file links
  // ------------------------------------------------------------------
  it("SEND_FILE_LINK: emails attendees with protected file links", async () => {
    mockGetStepFiles.mockResolvedValue([
      { id: "file-1", filename: "guide.pdf", contentType: "application/pdf" },
    ]);
    mockCanDeliver.mockReturnValue(true);
    mockBuildAttachments.mockReturnValue([
      {
        filename: "guide.pdf",
        path: "https://app.test/api/files/file-1/download?token=abc",
        contentType: "application/pdf",
      },
    ]);

    const assignment = makeAssignment({
      steps: [
        makeStep({
          id: "step-files",
          stepType: "SEND_FILE_LINK",
          subject: "Files for {{registrantName}}",
          body: "<div>{{fileLinks}}</div>",
        }),
      ],
    });
    findUnique.mockResolvedValue(assignment);
    registrationFindMany.mockResolvedValue([
      {
        id: "reg-1",
        email: "attendee@test.com",
        firstName: "Alice",
        lastName: "Smith",
        company: "Acme",
      },
    ]);

    await invoke();

    expect(mockBuildAttachments).toHaveBeenCalledWith(
      expect.objectContaining({
        recipientRole: "ATTENDEE",
      })
    );
    expect(mockInterpolate).toHaveBeenCalledWith(
      "<div>{{fileLinks}}</div>",
      expect.objectContaining({
        fileLinks: expect.stringContaining("guide.pdf"),
      })
    );
    expect(mockSendEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        to: "attendee@test.com",
        telemetry: expect.objectContaining({
          workflowStepId: "step-files",
          recipientRole: "ATTENDEE",
          registrationId: "reg-1",
        }),
      })
    );
  });

  // ------------------------------------------------------------------
  // 23. Multiple steps: all execute in order
  // ------------------------------------------------------------------
  it("processes multiple steps in sortOrder sequence", async () => {
    const consoleSpy = jest.spyOn(console, "log").mockImplementation();
    const assignment = makeAssignment({
      steps: [
        makeStep({
          id: "s1",
          sortOrder: 0,
          stepType: "EMAIL_COACH",
          subject: "First",
          body: "1",
        }),
        makeStep({
          id: "s2",
          sortOrder: 1,
          stepType: "NOTIFICATION",
          subject: "Second",
          body: "2",
        }),
      ],
    });
    findUnique.mockResolvedValue(assignment);

    const result = await invoke();

    expect(result).toMatchObject({
      success: true,
      stepsExecuted: 2,
      stepsFailed: 0,
      totalSteps: 2,
    });
    expect(mockSendEmail).toHaveBeenCalledTimes(1); // only EMAIL_COACH sends
    consoleSpy.mockRestore();
  });

  // ------------------------------------------------------------------
  // 24. EMAIL_STAFF defaults to admin@scalingup.com when env not set
  // ------------------------------------------------------------------
  it("EMAIL_STAFF: defaults to admin@scalingup.com when ADMIN_EMAIL env not set", async () => {
    delete process.env.ADMIN_EMAIL;

    const assignment = makeAssignment({
      steps: [
        makeStep({
          stepType: "EMAIL_STAFF",
          subject: "Staff",
          body: "Body",
        }),
      ],
    });
    findUnique.mockResolvedValue(assignment);

    await invoke();

    expect(mockSendEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        to: "admin@scalingup.com",
      })
    );
  });

  // ------------------------------------------------------------------
  // 25. RELATIVE_TO_EVENT with offsetHours and sendTimeOfDay
  // ------------------------------------------------------------------
  it("RELATIVE_TO_EVENT: passes offsetHours and sendTimeOfDay to calculateSendDate", async () => {
    const futureDate = new Date(Date.now() + 3600000);
    mockCalculateSendDate.mockReturnValue(futureDate);

    const assignment = makeAssignment({
      steps: [
        makeStep({
          triggerType: "RELATIVE_TO_EVENT",
          stepType: "EMAIL_COACH",
          offsetDays: -1,
          offsetHours: -2,
          sendTimeOfDay: "09:00",
          subject: "Reminder",
          body: "Soon",
        }),
      ],
    });
    findUnique.mockResolvedValue(assignment);

    await invoke();

    expect(mockCalculateSendDate).toHaveBeenCalledWith(
      expect.any(Date),
      -1,
      -2,
      "09:00",
      "America/New_York"
    );
  });

  // ------------------------------------------------------------------
  // 26. Return shape includes workshopId and workflowId
  // ------------------------------------------------------------------
  it("return value includes workshopId and workflowId", async () => {
    const assignment = makeAssignment({
      steps: [
        makeStep({
          stepType: "NOTIFICATION",
          subject: "N",
          body: "B",
        }),
      ],
    });
    findUnique.mockResolvedValue(assignment);

    const consoleSpy = jest.spyOn(console, "log").mockImplementation();
    const result = await invoke();
    consoleSpy.mockRestore();

    expect(result).toMatchObject({
      success: true,
      workshopId: "ws-1",
      workflowId: "wf-1",
    });
  });

  // ------------------------------------------------------------------
  // BUG-MAY4-1b: 0-attendees → SKIPPED (not false SENT)
  // ------------------------------------------------------------------
  describe("BUG-MAY4-1b: zero-registrant steps record SKIPPED, not SENT", () => {
    it("EMAIL_ATTENDEES with 0 registrants: records SKIPPED, sends no emails", async () => {
      const assignment = makeAssignment({
        steps: [
          makeStep({
            stepType: "EMAIL_ATTENDEES",
            subject: "Hi",
            body: "Body",
          }),
        ],
      });
      findUnique.mockResolvedValue(assignment);
      registrationFindMany.mockResolvedValue([]); // 0 registrants

      await invoke();

      expect(mockSendEmail).not.toHaveBeenCalled();
      const sentCall = executionCreate.mock.calls.find(
        ([arg]: [{ data?: Record<string, unknown> }]) => arg?.data?.status === "SENT"
      );
      expect(sentCall).toBeUndefined();
      const skippedCall = executionCreate.mock.calls.find(
        ([arg]: [{ data?: Record<string, unknown> }]) => arg?.data?.status === "SKIPPED"
      );
      expect(skippedCall).toBeDefined();
    });

    it("SEND_SURVEY_LINK with 0 registrants: records SKIPPED with 'no recipients' reason", async () => {
      const assignment = makeAssignment({
        steps: [
          makeStep({
            id: "step-survey",
            stepType: "SEND_SURVEY_LINK",
            subject: "Survey",
            body: "Take it",
          }),
        ],
      });
      findUnique.mockResolvedValue(assignment);
      registrationFindMany.mockResolvedValue([]);

      await invoke();

      expect(mockSendEmail).not.toHaveBeenCalled();
      expect(mockGetOrCreateSurveyLink).not.toHaveBeenCalled();
      const skippedCall = executionCreate.mock.calls.find(
        ([arg]: [{ data?: Record<string, unknown> }]) => arg?.data?.status === "SKIPPED"
      );
      expect(skippedCall).toBeDefined();
      // BUG-MAY4 follow-on: error must say "no recipients", NOT "No survey link could be generated"
      expect(skippedCall?.[0]?.data?.errorMessage).toBe("No recipients at scheduled time");
    });

    it("SEND_SURVEY_LINK with registrants but link generation fails: keeps 'No survey link could be generated' message", async () => {
      const assignment = makeAssignment({
        steps: [
          makeStep({
            id: "step-survey",
            stepType: "SEND_SURVEY_LINK",
            subject: "Survey",
            body: "Take it",
          }),
        ],
      });
      findUnique.mockResolvedValue(assignment);
      registrationFindMany.mockResolvedValue([
        { id: "reg-1", email: "a@test.com", firstName: "A", lastName: "B", company: "" },
      ]);
      mockGetOrCreateSurveyLink.mockResolvedValue(null); // generation fails

      await invoke();

      expect(mockSendEmail).not.toHaveBeenCalled();
      // PR-3: every recipient failed link-gen → the reused parent is finalized
      // FAILED, keeping the operator-facing message (regression guard). The
      // per-recipient FAILED child carries the granular "link_generation_failed".
      const failedFinalize = (db.workflowStepExecution.update as jest.Mock).mock.calls.find(
        ([arg]: [{ data?: Record<string, unknown> }]) =>
          arg?.data?.status === "FAILED" &&
          arg?.data?.errorMessage === "No survey link could be generated"
      );
      expect(failedFinalize).toBeDefined();
    });

    it("SEND_FILE_LINK with 0 registrants: records SKIPPED, sends no emails", async () => {
      const assignment = makeAssignment({
        steps: [
          makeStep({
            id: "step-files",
            stepType: "SEND_FILE_LINK",
            subject: "Files",
            body: "Get them",
          }),
        ],
      });
      findUnique.mockResolvedValue(assignment);
      registrationFindMany.mockResolvedValue([]);

      await invoke();

      expect(mockSendEmail).not.toHaveBeenCalled();
      const skippedCall = executionCreate.mock.calls.find(
        ([arg]: [{ data?: Record<string, unknown> }]) => arg?.data?.status === "SKIPPED"
      );
      expect(skippedCall).toBeDefined();
    });

    it("SEND_FILE_LINK with files attached AND 0 registrants: records SKIPPED, NOT SENT", async () => {
      // BUG-MAY4 follow-on: files attached but no recipients → must NOT record SENT
      mockGetStepFiles.mockResolvedValue([
        { id: "file-1", filename: "guide.pdf", contentType: "application/pdf" },
      ]);
      mockBuildAttachments.mockReturnValue([
        {
          filename: "guide.pdf",
          path: "https://app.test/api/files/file-1/download?token=abc",
          contentType: "application/pdf",
        },
      ]);

      const assignment = makeAssignment({
        steps: [
          makeStep({
            id: "step-files",
            stepType: "SEND_FILE_LINK",
            subject: "Files",
            body: "{{fileLinks}}",
          }),
        ],
      });
      findUnique.mockResolvedValue(assignment);
      registrationFindMany.mockResolvedValue([]); // 0 recipients

      await invoke();

      expect(mockSendEmail).not.toHaveBeenCalled();

      // Must NOT have a SENT record — the previous false-SENT bug
      const sentCall = executionCreate.mock.calls.find(
        ([arg]: [{ data?: Record<string, unknown> }]) => arg?.data?.status === "SENT"
      );
      expect(sentCall).toBeUndefined();

      const skippedCall = executionCreate.mock.calls.find(
        ([arg]: [{ data?: Record<string, unknown> }]) => arg?.data?.status === "SKIPPED"
      );
      expect(skippedCall).toBeDefined();
      expect(skippedCall?.[0]?.data?.errorMessage).toBe("No recipients at scheduled time");
    });
  });

  // ------------------------------------------------------------------
  // BUG-09: scheduledFor preservation
  // ------------------------------------------------------------------
  describe("BUG-09 scheduledFor preservation", () => {
    it("RELATIVE_TO_EVENT future: creates SCHEDULED row pre-sleep, then transitions to SENT preserving scheduledFor", async () => {
      const futureSendAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
      mockCalculateSendDate.mockReturnValue(futureSendAt);

      const executionUpdate = db.workflowStepExecution.update as jest.Mock;
      executionCreate.mockClear();
      executionUpdate.mockClear();
      executionCreate.mockResolvedValueOnce({ id: "exec-sched-1" });

      const assignment = makeAssignment({
        steps: [
          makeStep({
            triggerType: "RELATIVE_TO_EVENT",
            stepType: "EMAIL_COACH",
            offsetDays: -7,
            subject: "Reminder",
            body: "Coming soon",
          }),
        ],
      });
      findUnique.mockResolvedValue(assignment);

      await invoke();

      // Pre-sleep: SCHEDULED row created with futureSendAt
      const scheduleCall = executionCreate.mock.calls.find(
        ([arg]: [{ data?: Record<string, unknown> }]) => arg?.data?.status === "SCHEDULED"
      );
      expect(scheduleCall).toBeDefined();
      expect(scheduleCall![0].data).toMatchObject({
        status: "SCHEDULED",
        scheduledFor: futureSendAt,
      });

      // Post-sleep: terminal transition via update, preserving scheduledFor
      expect(executionUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: "exec-sched-1" },
          data: expect.objectContaining({
            status: "SENT",
            scheduledFor: futureSendAt,
          }),
        })
      );
    });

    it("RELATIVE_TO_EVENT past: no SCHEDULED row; fresh terminal row carries the past sendAt", async () => {
      const pastSendAt = new Date(Date.now() - 24 * 60 * 60 * 1000);
      mockCalculateSendDate.mockReturnValue(pastSendAt);

      const executionUpdate = db.workflowStepExecution.update as jest.Mock;
      executionCreate.mockClear();
      executionUpdate.mockClear();

      const assignment = makeAssignment({
        steps: [
          makeStep({
            triggerType: "RELATIVE_TO_EVENT",
            stepType: "EMAIL_COACH",
            offsetDays: -30,
          }),
        ],
      });
      findUnique.mockResolvedValue(assignment);

      await invoke();

      // No SCHEDULED row when sendAt is in the past
      const scheduleCall = executionCreate.mock.calls.find(
        ([arg]: [{ data?: Record<string, unknown> }]) => arg?.data?.status === "SCHEDULED"
      );
      expect(scheduleCall).toBeUndefined();

      // Terminal create carries the past sendAt (not new Date() / "now")
      const sentCall = executionCreate.mock.calls.find(
        ([arg]: [{ data?: Record<string, unknown> }]) => arg?.data?.status === "SENT"
      );
      expect(sentCall).toBeDefined();
      expect(sentCall![0].data.scheduledFor).toBe(pastSendAt);

      // No update call (no SCHEDULED row to transition)
      expect(executionUpdate).not.toHaveBeenCalled();
    });
  });

  describe("BUG-MAY6-9 / Wave 6 Tier B: link-gen FAILED children + parent rollup", () => {
    it("SEND_SURVEY_LINK with mixed link-gen failure: writes FAILED child for failing recipient and rolls parent up to FAILED", async () => {
      const futureDate = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
      mockCalculateSendDate.mockReturnValue(futureDate);

      const executionCreateMock = db.workflowStepExecution.create as jest.Mock;
      const executionUpsertMock = db.workflowStepExecution.upsert as jest.Mock;
      const executionFindManyMock = db.workflowStepExecution.findMany as jest.Mock;
      const executionUpdateMock = db.workflowStepExecution.update as jest.Mock;

      // Pre-loop SCHEDULED parent row id
      executionCreateMock.mockResolvedValue({ id: "parent-1" });

      const assignment = makeAssignment({
        steps: [
          makeStep({
            id: "step-survey",
            stepType: "SEND_SURVEY_LINK",
            triggerType: "RELATIVE_TO_EVENT",
            offsetDays: -1,
          }),
        ],
      });
      findUnique.mockResolvedValue(assignment);
      registrationFindMany.mockResolvedValue([
        { id: "reg-1", email: "fail@test.com", firstName: "Fail", lastName: "User", company: "" },
        { id: "reg-2", email: "ok@test.com", firstName: "OK", lastName: "User", company: "" },
      ]);

      // First recipient → null (link-gen failure); second → success
      mockGetOrCreateSurveyLink
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce({ surveyId: "survey-2", surveyUrl: "https://app.test/s/2" });

      // PR-3: sendFanoutRecipients first queries prior-SENT children (skip set
      // — none on a fresh run), THEN finalizeParentRollup reads all children.
      executionFindManyMock
        .mockResolvedValueOnce([]) // skip-set query (no prior SENT)
        .mockResolvedValueOnce([{ status: "FAILED" }, { status: "SENT" }]); // rollup

      await invoke();

      // Per-recipient FAILED child write for the failing recipient
      const failedUpsert = executionUpsertMock.mock.calls.find(
        (call) =>
          call[0]?.create?.status === "FAILED" &&
          call[0]?.create?.errorMessage === "link_generation_failed"
      );
      expect(failedUpsert).toBeDefined();
      expect(failedUpsert![0].create.recipientEmail).toBe("fail@test.com");
      expect(failedUpsert![0].create.parentId).toBe("parent-1");

      // Per-recipient SENT child write for the successful recipient (existing behavior)
      const sentUpsert = executionUpsertMock.mock.calls.find(
        (call) =>
          call[0]?.create?.status === "SENT" &&
          call[0]?.create?.recipientEmail === "ok@test.com"
      );
      expect(sentUpsert).toBeDefined();

      // Parent rollup: findMany on children, then update parent to FAILED
      expect(executionFindManyMock).toHaveBeenCalledWith(
        expect.objectContaining({ where: expect.objectContaining({ parentId: "parent-1" }) })
      );
      const rollupUpdate = executionUpdateMock.mock.calls.find(
        (call) =>
          call[0]?.where?.id === "parent-1" &&
          call[0]?.data?.status === "FAILED"
      );
      expect(rollupUpdate).toBeDefined();
    });
  });

  // ------------------------------------------------------------------
  // PR-3 (audit Inngest dedup): retry-resend protection
  // ------------------------------------------------------------------
  describe("PR-3: retry dedup on the immediate path", () => {
    it("EMAIL_ATTENDEES immediate path synthesizes ONE parent (deliveryBatchKey) and skips prior-SENT recipients on replay", async () => {
      // IMMEDIATE trigger → no future sendAt → executionId undefined → the
      // step had no parent before PR-3 (the Q-C gap). It now synthesizes one
      // via ensureExecutionParent so an Inngest retry reuses it.
      const assignment = makeAssignment({
        steps: [
          makeStep({
            id: "step-att",
            stepType: "EMAIL_ATTENDEES",
            triggerType: "IMMEDIATE",
            subject: "Hi",
            body: "Body",
          }),
        ],
      });
      findUnique.mockResolvedValue(assignment);
      registrationFindMany.mockResolvedValue([
        { id: "reg-1", email: "a@test.com", firstName: "A", lastName: "B", company: "" },
        { id: "reg-2", email: "b@test.com", firstName: "B", lastName: "C", company: "" },
      ]);
      // A prior retry already SENT reg-1 under the reused (synthesized) parent.
      (db.workflowStepExecution.findMany as jest.Mock).mockResolvedValue([
        { registrationId: "reg-1", status: "SENT" },
      ]);

      await invoke();

      // reg-1 (already SENT) is skipped; only reg-2 is emailed — no re-send.
      expect(mockSendEmail).toHaveBeenCalledTimes(1);
      expect(mockSendEmail).toHaveBeenCalledWith(
        expect.objectContaining({ to: "b@test.com" })
      );
      // Parent synthesized via upsert keyed by a deliveryBatchKey (not a bare create).
      const parentUpsert = (db.workflowStepExecution.upsert as jest.Mock).mock.calls.find(
        (call) =>
          call[0]?.create?.status === "SCHEDULED" && call[0]?.where?.deliveryBatchKey
      );
      expect(parentUpsert).toBeDefined();
    });
  });

  // ------------------------------------------------------------------
  // workshopLocation token for VIRTUAL workshops (BUG-MAY25)
  // ------------------------------------------------------------------
  describe("workshopLocation context value", () => {
    it("uses virtualLink as workshopLocation for VIRTUAL workshops", async () => {
      const assignment = makeAssignment({
        steps: [
          makeStep({
            stepType: "EMAIL_COACH",
            subject: "Join: {{workshopLocation}}",
            body: "Link",
          }),
        ],
        workshopOverrides: {
          format: "VIRTUAL",
          virtualLink: "https://zoom.us/j/123456",
        },
      });
      findUnique.mockResolvedValue(assignment);

      await invoke();

      expect(mockInterpolate).toHaveBeenCalledWith(
        "Join: {{workshopLocation}}",
        expect.objectContaining({ workshopLocation: "https://zoom.us/j/123456" })
      );
    });

    it("uses buildLocationString for IN_PERSON workshops", async () => {
      const assignment = makeAssignment({
        steps: [
          makeStep({ stepType: "EMAIL_COACH", subject: "Venue: {{workshopLocation}}", body: "" }),
        ],
        workshopOverrides: {
          format: "IN_PERSON",
          virtualLink: null,
        },
      });
      findUnique.mockResolvedValue(assignment);

      await invoke();

      expect(mockInterpolate).toHaveBeenCalledWith(
        "Venue: {{workshopLocation}}",
        expect.objectContaining({ workshopLocation: "123 Main St, New York, NY" })
      );
    });
  });

  // Cancellation guard: stale memoization bypass
  // ------------------------------------------------------------------
  describe("cancellation guard (stale fetch-assignment memoization fix)", () => {
    it("skips EMAIL_COACH when assignment becomes inactive during sleep (workshop canceled)", async () => {
      // fetch-assignment sees isActive:true (memoized before sleep)
      // fresh re-check inside execute-step sees isActive:false (canceled during sleep)
      findUnique
        .mockResolvedValueOnce(makeAssignment()) // initial fetch-assignment step
        .mockResolvedValueOnce({ isActive: false }); // fresh check inside execute-step
      executionFindFirst.mockResolvedValue(null);

      await invoke();

      expect(sendEmailViaSMTP).not.toHaveBeenCalled();
    });

    it("skips EMAIL_COACH when assignment is permanently deleted during sleep", async () => {
      // fetch-assignment sees isActive:true (memoized before sleep)
      // fresh re-check inside execute-step returns null (workshop+assignment cascade-deleted)
      findUnique
        .mockResolvedValueOnce(makeAssignment()) // initial fetch-assignment step
        .mockResolvedValueOnce(null); // fresh check — deleted
      executionFindFirst.mockResolvedValue(null);

      await invoke();

      expect(sendEmailViaSMTP).not.toHaveBeenCalled();

    });
  });
});
