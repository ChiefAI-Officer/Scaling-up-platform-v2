/**
 * Tests for Inngest Function: Trigger Workflow Step (ENH-08)
 *
 * Covers: idempotency guard (SENT already exists → skip), step-not-found,
 * workshop-not-found, EMAIL_COACH execution, EMAIL_STAFF execution,
 * EMAIL_ATTENDEES dedup, and WorkflowStepExecution record creation.
 */

/* eslint-disable @typescript-eslint/no-explicit-any */

// ============================================
// Mocks — declared before imports
// ============================================

jest.mock("@/lib/db", () => ({
    db: {
        workflowStepExecution: { findFirst: jest.fn(), create: jest.fn() },
        workflowStep: { findUnique: jest.fn() },
        workshop: { findUnique: jest.fn() },
        registration: { findMany: jest.fn() },
    },
}));

// eslint-disable-next-line no-var
var capturedHandler: (...args: unknown[]) => unknown;
jest.mock("@/inngest/client", () => ({
    inngest: {
        createFunction: jest.fn(
            (
                _config: unknown,
                _trigger: unknown,
                handler: (...args: unknown[]) => unknown
            ) => {
                capturedHandler = handler;
                return handler;
            }
        ),
        send: jest.fn(),
    },
}));

jest.mock("@/lib/workflows/workflow-service", () => ({
    interpolateTemplate: jest.fn((input: string) => input),
}));

jest.mock("@/lib/workflows/resolve-event-start-moment", () => ({
    resolveEventStartMoment: jest.fn(),
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
import { sendEmailViaSMTP } from "@/lib/smtp-transport";
import { interpolateTemplate } from "@/lib/workflows/workflow-service";
import { resolveEventStartMoment } from "@/lib/workflows/resolve-event-start-moment";

// Force the module to load so capturedHandler is assigned
import "@/inngest/functions/trigger-workflow-step";

// ============================================
// Helpers
// ============================================

const mockStep = {
    run: jest.fn(async (_name: string, fn: () => Promise<unknown>) => fn()),
};

function buildEvent(overrides: Record<string, unknown> = {}) {
    return {
        data: {
            stepId: "step-1",
            workshopId: "ws-1",
            ...overrides,
        },
    };
}

function makeWorkflowStep(overrides: Record<string, unknown> = {}): any {
    return {
        id: "step-1",
        stepType: "EMAIL_COACH",
        triggerType: "RELATIVE_TO_EVENT",
        offsetDays: -1,
        subject: "Test Email",
        body: "<p>Hello</p>",
        emailTemplate: null,
        customRecipients: null,
        surveyTemplateId: null,
        workflow: { id: "wf-1", name: "Test Workflow" },
        ...overrides,
    };
}

function makeWorkshop(overrides: Record<string, unknown> = {}): any {
    return {
        id: "ws-1",
        title: "Test Workshop",
        workshopCode: "WS-2026-TEST",
        eventDate: new Date("2026-06-01"),
        eventTime: "9:00 AM",
        format: "IN_PERSON",
        landingPageSlug: "test-workshop",
        status: "PRE_EVENT",
        venue: null,
        city: null,
        state: null,
        country: null,
        virtualLink: null,
        coach: {
            firstName: "Jane",
            lastName: "Smith",
            email: "jane@example.com",
        },
        ...overrides,
    };
}

// ============================================
// Tests
// ============================================

describe("triggerWorkflowStep Inngest function", () => {
    beforeEach(() => {
        jest.clearAllMocks();
        (db.workflowStepExecution.findFirst as jest.Mock).mockResolvedValue(null);
        (db.workflowStepExecution.create as jest.Mock).mockResolvedValue({ id: "exec-1" });
        (db.workflowStep.findUnique as jest.Mock).mockResolvedValue(makeWorkflowStep());
        (db.workshop.findUnique as jest.Mock).mockResolvedValue(makeWorkshop());
        (db.registration.findMany as jest.Mock).mockResolvedValue([]);
        // Default: pass through eventDate untouched. Specific tests override.
        (resolveEventStartMoment as jest.Mock).mockImplementation(
            (input: { eventDate: Date }) => input.eventDate
        );
    });

    // ------------------------------------------
    // Idempotency Guard
    // ------------------------------------------

    describe("idempotency guard", () => {
        it("skips execution when SENT execution exists and forceResend is not set", async () => {
            (db.workflowStepExecution.findFirst as jest.Mock).mockResolvedValueOnce({
                id: "existing-exec",
            });

            const result = await capturedHandler({
                event: buildEvent(), // no forceResend
                step: mockStep,
            });

            expect(result).toEqual({ skipped: true, reason: "already_sent" });
            expect(db.workflowStepExecution.create).not.toHaveBeenCalled();
            expect(sendEmailViaSMTP).not.toHaveBeenCalled();
        });

        it("proceeds with execution when forceResend=true even if SENT execution exists", async () => {
            (db.workflowStepExecution.findFirst as jest.Mock).mockResolvedValueOnce({
                id: "existing-exec",
            });

            const result = await capturedHandler({
                event: buildEvent({ forceResend: true }),
                step: mockStep,
            });

            expect(result).toEqual({ success: true, stepId: "step-1", workshopId: "ws-1" });
            expect(sendEmailViaSMTP).toHaveBeenCalledTimes(1);
            expect(db.workflowStepExecution.create).toHaveBeenCalledTimes(1);
        });

        it("proceeds normally when no SENT execution exists", async () => {
            (db.workflowStepExecution.findFirst as jest.Mock).mockResolvedValue(null);

            const result = await capturedHandler({
                event: buildEvent(),
                step: mockStep,
            });

            expect(result).toEqual({ success: true, stepId: "step-1", workshopId: "ws-1" });
            expect(db.workflowStepExecution.create).toHaveBeenCalledTimes(1);
        });

        it("idempotency check queries with correct stepId, workshopId, and status=SENT", async () => {
            await capturedHandler({
                event: buildEvent({ stepId: "step-abc", workshopId: "ws-xyz" }),
                step: mockStep,
            });

            expect(db.workflowStepExecution.findFirst).toHaveBeenCalledWith(
                expect.objectContaining({
                    where: { stepId: "step-abc", workshopId: "ws-xyz", status: "SENT" },
                })
            );
        });
    });

    // ------------------------------------------
    // Early Returns
    // ------------------------------------------

    describe("early returns", () => {
        it("returns skipped when step not found", async () => {
            (db.workflowStep.findUnique as jest.Mock).mockResolvedValue(null);

            const result = await capturedHandler({
                event: buildEvent(),
                step: mockStep,
            });

            expect(result).toEqual({ skipped: true, reason: "step_not_found" });
            expect(db.workflowStepExecution.create).not.toHaveBeenCalled();
        });

        it("returns skipped when workshop not found", async () => {
            (db.workshop.findUnique as jest.Mock).mockResolvedValue(null);

            const result = await capturedHandler({
                event: buildEvent(),
                step: mockStep,
            });

            expect(result).toEqual({ skipped: true, reason: "workshop_not_found" });
            expect(db.workflowStepExecution.create).not.toHaveBeenCalled();
        });
    });

    // ------------------------------------------
    // EMAIL_COACH execution
    // ------------------------------------------

    describe("EMAIL_COACH step", () => {
        it("sends email to coach and creates SENT execution record", async () => {
            (db.workflowStep.findUnique as jest.Mock).mockResolvedValue(
                makeWorkflowStep({ stepType: "EMAIL_COACH" })
            );

            const result = await capturedHandler({
                event: buildEvent(),
                step: mockStep,
            });

            expect(result).toEqual({ success: true, stepId: "step-1", workshopId: "ws-1" });
            expect(sendEmailViaSMTP).toHaveBeenCalledWith(
                expect.objectContaining({ to: "jane@example.com" })
            );
            expect(db.workflowStepExecution.create).toHaveBeenCalledWith(
                expect.objectContaining({
                    data: expect.objectContaining({
                        stepId: "step-1",
                        workshopId: "ws-1",
                        status: "SENT",
                    }),
                })
            );
        });
    });

    // ------------------------------------------
    // EMAIL_STAFF execution
    // ------------------------------------------

    describe("EMAIL_STAFF step", () => {
        it("sends email to admin and creates SENT execution record", async () => {
            (db.workflowStep.findUnique as jest.Mock).mockResolvedValue(
                makeWorkflowStep({ stepType: "EMAIL_STAFF" })
            );
            process.env.ADMIN_EMAIL = "admin@test.com";

            await capturedHandler({
                event: buildEvent(),
                step: mockStep,
            });

            expect(sendEmailViaSMTP).toHaveBeenCalledWith(
                expect.objectContaining({ to: "admin@test.com" })
            );
            expect(db.workflowStepExecution.create).toHaveBeenCalledWith(
                expect.objectContaining({
                    data: expect.objectContaining({ status: "SENT" }),
                })
            );
        });
    });

    // ------------------------------------------
    // EMAIL_ATTENDEES deduplication
    // ------------------------------------------

    describe("EMAIL_ATTENDEES step — email deduplication", () => {
        it("sends only one email when two registrations share the same address (case-insensitive)", async () => {
            (db.workflowStep.findUnique as jest.Mock).mockResolvedValue(
                makeWorkflowStep({ stepType: "EMAIL_ATTENDEES" })
            );
            (db.registration.findMany as jest.Mock).mockResolvedValue([
                {
                    id: "reg-1",
                    email: "attendee@example.com",
                    firstName: "Alice",
                    lastName: "A",
                    company: "Acme",
                },
                {
                    id: "reg-2",
                    email: "ATTENDEE@example.com", // same address, different case
                    firstName: "Alice",
                    lastName: "B",
                    company: "Acme",
                },
            ]);

            await capturedHandler({
                event: buildEvent(),
                step: mockStep,
            });

            // Only one email should have been sent despite two registrations
            expect(sendEmailViaSMTP).toHaveBeenCalledTimes(1);
            expect(db.workflowStepExecution.create).toHaveBeenCalledWith(
                expect.objectContaining({
                    data: expect.objectContaining({ status: "SENT" }),
                })
            );
        });

        it("sends emails to all distinct attendees", async () => {
            (db.workflowStep.findUnique as jest.Mock).mockResolvedValue(
                makeWorkflowStep({ stepType: "EMAIL_ATTENDEES" })
            );
            (db.registration.findMany as jest.Mock).mockResolvedValue([
                {
                    id: "reg-1",
                    email: "alice@example.com",
                    firstName: "Alice",
                    lastName: "A",
                    company: "Acme",
                },
                {
                    id: "reg-2",
                    email: "bob@example.com",
                    firstName: "Bob",
                    lastName: "B",
                    company: "Beta",
                },
            ]);

            await capturedHandler({
                event: buildEvent(),
                step: mockStep,
            });

            expect(sendEmailViaSMTP).toHaveBeenCalledTimes(2);
        });
    });

    // ------------------------------------------
    // NOTIFICATION step
    // ------------------------------------------

    describe("NOTIFICATION step", () => {
        it("creates a SENT execution record without sending email", async () => {
            (db.workflowStep.findUnique as jest.Mock).mockResolvedValue(
                makeWorkflowStep({ stepType: "NOTIFICATION" })
            );

            const result = await capturedHandler({
                event: buildEvent(),
                step: mockStep,
            });

            expect(sendEmailViaSMTP).not.toHaveBeenCalled();
            expect(db.workflowStepExecution.create).toHaveBeenCalledWith(
                expect.objectContaining({
                    data: expect.objectContaining({ status: "SENT" }),
                })
            );
            expect(result).toEqual({ success: true, stepId: "step-1", workshopId: "ws-1" });
        });
    });

    // ------------------------------------------
    // SEND_SURVEY_LINK step
    // ------------------------------------------

    describe("SEND_SURVEY_LINK step", () => {
        const { getOrCreateSurveyLink } = jest.requireMock("@/lib/surveys/survey-automation");

        it("passes surveyTemplateId from step to getOrCreateSurveyLink when pinned template is set", async () => {
            (db.workflowStep.findUnique as jest.Mock).mockResolvedValue(
                makeWorkflowStep({
                    stepType: "SEND_SURVEY_LINK",
                    triggerType: "RELATIVE_TO_EVENT",
                    offsetDays: -7,
                    surveyTemplateId: "tpl-pinned",
                })
            );
            (db.registration.findMany as jest.Mock).mockResolvedValue([
                { id: "reg-1", email: "alice@example.com", firstName: "Alice", lastName: "A", company: "Acme" },
            ]);
            (getOrCreateSurveyLink as jest.Mock).mockResolvedValue({
                surveyId: "srv-1",
                surveyUrl: "https://example.com/survey/1",
                surveyType: "PRE_WORKSHOP",
            });

            await capturedHandler({ event: buildEvent(), step: mockStep });

            expect(getOrCreateSurveyLink).toHaveBeenCalledWith(
                expect.objectContaining({ templateId: "tpl-pinned" })
            );
        });

        it("records SKIPPED when getOrCreateSurveyLink returns null for all registrations", async () => {
            (db.workflowStep.findUnique as jest.Mock).mockResolvedValue(
                makeWorkflowStep({
                    stepType: "SEND_SURVEY_LINK",
                    triggerType: "RELATIVE_TO_EVENT",
                    offsetDays: -7,
                    surveyTemplateId: null,
                })
            );
            (db.registration.findMany as jest.Mock).mockResolvedValue([
                { id: "reg-1", email: "alice@example.com", firstName: "Alice", lastName: "A", company: "Acme" },
            ]);
            (getOrCreateSurveyLink as jest.Mock).mockResolvedValue(null);

            await capturedHandler({ event: buildEvent(), step: mockStep });

            expect(db.workflowStepExecution.create).toHaveBeenCalledWith(
                expect.objectContaining({
                    data: expect.objectContaining({ status: "SKIPPED" }),
                })
            );
            expect(sendEmailViaSMTP).not.toHaveBeenCalled();
        });

        it("sends survey link emails and records SENT when links are available", async () => {
            (db.workflowStep.findUnique as jest.Mock).mockResolvedValue(
                makeWorkflowStep({
                    stepType: "SEND_SURVEY_LINK",
                    triggerType: "RELATIVE_TO_EVENT",
                    offsetDays: -7,
                    surveyTemplateId: "tpl-1",
                })
            );
            (db.registration.findMany as jest.Mock).mockResolvedValue([
                { id: "reg-1", email: "alice@example.com", firstName: "Alice", lastName: "A", company: "Acme" },
                { id: "reg-2", email: "bob@example.com", firstName: "Bob", lastName: "B", company: "Beta" },
            ]);
            (getOrCreateSurveyLink as jest.Mock).mockResolvedValue({
                surveyId: "srv-1",
                surveyUrl: "https://example.com/survey/1",
                surveyType: "PRE_WORKSHOP",
            });

            await capturedHandler({ event: buildEvent(), step: mockStep });

            expect(sendEmailViaSMTP).toHaveBeenCalledTimes(2);
            expect(db.workflowStepExecution.create).toHaveBeenCalledWith(
                expect.objectContaining({
                    data: expect.objectContaining({ status: "SENT" }),
                })
            );
        });
    });

    // ------------------------------------------
    // BUG-MAY4 follow-on: workshopDate uses resolveEventStartMoment, not raw midnight UTC
    // ------------------------------------------
    describe("workshopDate context: uses resolveEventStartMoment", () => {
        it("interpolates workshopDate from resolveEventStartMoment, NOT raw workshop.eventDate", async () => {
            // Workshop eventDate is stored as midnight UTC of one day; the true
            // local-zone start moment is on a different calendar day.
            (db.workshop.findUnique as jest.Mock).mockResolvedValue(
                makeWorkshop({
                    eventDate: new Date("2026-06-01T00:00:00.000Z"), // Mon Jun 1 in UTC
                    eventTime: "9:00 AM",
                    timezone: "America/New_York",
                })
            );
            // Force resolveEventStartMoment to return a clearly different date
            // so the test can distinguish raw-eventDate vs resolved-moment paths.
            (resolveEventStartMoment as jest.Mock).mockReturnValue(
                new Date("2026-07-15T13:00:00.000Z") // Wed Jul 15 in UTC
            );

            await capturedHandler({ event: buildEvent(), step: mockStep });

            // Verify resolveEventStartMoment was called with the workshop's date/time/zone
            expect(resolveEventStartMoment).toHaveBeenCalledWith(
                expect.objectContaining({
                    eventTime: "9:00 AM",
                    timezone: "America/New_York",
                })
            );

            // Verify interpolateTemplate received workshopDate from the RESOLVED moment,
            // not from raw workshop.eventDate (Jun 1).
            const interpolateCalls = (interpolateTemplate as jest.Mock).mock.calls;
            const callsWithWorkshopDate = interpolateCalls.filter(
                ([, ctx]: [unknown, { workshopDate?: string } | undefined]) =>
                    ctx && typeof ctx.workshopDate === "string"
            );
            expect(callsWithWorkshopDate.length).toBeGreaterThan(0);
            for (const [, ctx] of callsWithWorkshopDate) {
                expect(ctx.workshopDate).toContain("July");
                expect(ctx.workshopDate).toContain("15");
                expect(ctx.workshopDate).not.toContain("June");
            }
        });
    });
});
