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
        workflowStepExecution: {
            findFirst: jest.fn(),
            create: jest.fn(),
            // Wave 6 follow-on: Trigger Now per-recipient parity needs these.
            update: jest.fn(async () => ({ id: "exec-1" })),
            upsert: jest.fn(async () => ({ id: "child-1" })),
            findMany: jest.fn(async () => []),
        },
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
                    // PR-3: parentId:null so a per-recipient child SENT row can't
                    // trip this step-level guard (which would under-send).
                    where: { stepId: "step-abc", workshopId: "ws-xyz", status: "SENT", parentId: null },
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
            // PR-3: the shared fan-out helper records exactly one per-recipient
            // SENT child for the single distinct address (the duplicate is
            // skipped in-batch by normalized email).
            const sentChildren = (db.workflowStepExecution.upsert as jest.Mock).mock.calls.filter(
                (call) => call[0]?.create?.status === "SENT"
            );
            expect(sentChildren).toHaveLength(1);
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

        it("records FAILED when getOrCreateSurveyLink returns null for all registrations", async () => {
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

            // PR-3: all recipients failed link-gen → reused parent finalized
            // FAILED with the operator-facing message; no email sent.
            expect(db.workflowStepExecution.update).toHaveBeenCalledWith(
                expect.objectContaining({
                    data: expect.objectContaining({
                        status: "FAILED",
                        errorMessage: "No survey link could be generated",
                    }),
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
            // PR-3: the shared fan-out helper records a per-recipient SENT child
            // for each distinct recipient.
            const sentChildren = (db.workflowStepExecution.upsert as jest.Mock).mock.calls.filter(
                (call) => call[0]?.create?.status === "SENT"
            );
            expect(sentChildren).toHaveLength(2);
        });

        // BUG-MAY4 follow-on (gap caught via prod verification May 6): trigger
        // path had its own SEND_SURVEY_LINK handler with the misleading message.
        it("with 0 registrants: records SKIPPED with errorMessage='No recipients at scheduled time'", async () => {
            (db.workflowStep.findUnique as jest.Mock).mockResolvedValue(
                makeWorkflowStep({
                    stepType: "SEND_SURVEY_LINK",
                    triggerType: "RELATIVE_TO_EVENT",
                    offsetDays: -7,
                    surveyTemplateId: null,
                })
            );
            (db.registration.findMany as jest.Mock).mockResolvedValue([]);

            await capturedHandler({ event: buildEvent(), step: mockStep });

            expect(sendEmailViaSMTP).not.toHaveBeenCalled();
            expect(getOrCreateSurveyLink).not.toHaveBeenCalled();
            expect(db.workflowStepExecution.create).toHaveBeenCalledWith(
                expect.objectContaining({
                    data: expect.objectContaining({
                        status: "SKIPPED",
                        errorMessage: "No recipients at scheduled time",
                    }),
                })
            );
        });

        it("with registrants but link generation fails: keeps 'No survey link could be generated' message", async () => {
            (db.workflowStep.findUnique as jest.Mock).mockResolvedValue(
                makeWorkflowStep({
                    stepType: "SEND_SURVEY_LINK",
                    triggerType: "RELATIVE_TO_EVENT",
                    offsetDays: -7,
                    surveyTemplateId: null,
                })
            );
            (db.registration.findMany as jest.Mock).mockResolvedValue([
                { id: "reg-1", email: "alice@example.com", firstName: "A", lastName: "B", company: "" },
            ]);
            (getOrCreateSurveyLink as jest.Mock).mockResolvedValue(null);

            await capturedHandler({ event: buildEvent(), step: mockStep });

            expect(sendEmailViaSMTP).not.toHaveBeenCalled();
            // PR-3: final state is FAILED (rollup over the link-gen FAILED child)
            // while keeping the legacy operator-facing message — regression guard.
            expect(db.workflowStepExecution.update).toHaveBeenCalledWith(
                expect.objectContaining({
                    data: expect.objectContaining({
                        status: "FAILED",
                        errorMessage: "No survey link could be generated",
                    }),
                })
            );
        });
    });

    // BUG-MAY4 follow-on (gap caught via prod verification May 6): trigger
    // path SEND_FILE_LINK had its own unconditional status: "SENT" terminal write.
    describe("SEND_FILE_LINK step", () => {
        const { getWorkflowStepFiles, buildProtectedEmailAttachments } =
            jest.requireMock("@/lib/files/file-service");

        it("with files attached AND 0 registrants: records SKIPPED, NOT SENT", async () => {
            (getWorkflowStepFiles as jest.Mock).mockResolvedValue([
                { id: "file-1", filename: "guide.pdf", contentType: "application/pdf" },
            ]);
            (buildProtectedEmailAttachments as jest.Mock).mockReturnValue([
                {
                    filename: "guide.pdf",
                    path: "https://app.test/files/file-1/download?t=abc",
                    contentType: "application/pdf",
                },
            ]);
            (db.workflowStep.findUnique as jest.Mock).mockResolvedValue(
                makeWorkflowStep({
                    stepType: "SEND_FILE_LINK",
                    triggerType: "RELATIVE_TO_EVENT",
                    offsetDays: -1,
                })
            );
            (db.registration.findMany as jest.Mock).mockResolvedValue([]);

            await capturedHandler({ event: buildEvent(), step: mockStep });

            expect(sendEmailViaSMTP).not.toHaveBeenCalled();

            // Wave 6 follow-on Part 2: no terminal SENT anywhere — on parent
            // create OR update. The pre-loop SCHEDULED create is fine.
            const sentCreateOnParent = (db.workflowStepExecution.create as jest.Mock).mock.calls.find(
                ([arg]: [{ data?: Record<string, unknown> }]) =>
                    arg?.data?.status === "SENT" && !arg?.data?.parentId
            );
            expect(sentCreateOnParent).toBeUndefined();
            const sentUpdate = (db.workflowStepExecution.update as jest.Mock).mock.calls.find(
                ([arg]: [{ data?: Record<string, unknown> }]) => arg?.data?.status === "SENT"
            );
            expect(sentUpdate).toBeUndefined();

            // Parent transitions to SKIPPED via update().
            expect(db.workflowStepExecution.update).toHaveBeenCalledWith(
                expect.objectContaining({
                    data: expect.objectContaining({
                        status: "SKIPPED",
                        errorMessage: "No recipients at scheduled time",
                    }),
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

    // ------------------------------------------
    // Timezone wiring: workshopTime carries the DST-aware zone abbreviation
    // ------------------------------------------
    describe("workshopTime context: carries timezone abbreviation", () => {
        it("interpolates workshopTime with the zone abbrev and sets workshopTimezone", async () => {
            (db.workshop.findUnique as jest.Mock).mockResolvedValue(
                makeWorkshop({
                    eventDate: new Date("2026-06-01T00:00:00.000Z"),
                    eventTime: "9:00 AM",
                    timezone: "America/New_York", // EDT in June
                })
            );

            await capturedHandler({ event: buildEvent(), step: mockStep });

            const interpolateCalls = (interpolateTemplate as jest.Mock).mock.calls;
            const ctxCalls = interpolateCalls.filter(
                ([, ctx]: [unknown, { workshopTime?: string } | undefined]) =>
                    ctx && typeof ctx.workshopTime === "string"
            );
            expect(ctxCalls.length).toBeGreaterThan(0);
            for (const [, ctx] of ctxCalls) {
                expect(ctx.workshopTime).toMatch(/9:00 AM (EDT|EST)/);
                expect(ctx.workshopTimezone).toMatch(/^(EDT|EST)$/);
            }
        });
    });

    // ----------------------------------------------------------------
    // Wave 6 follow-on: per-recipient parity with execute-workflow.ts
    // ----------------------------------------------------------------
    describe("Trigger Now per-recipient parity (Wave 6 follow-on)", () => {
        beforeEach(() => {
            // PR-3: the delivery parent is now established via upsert
            // (ensureExecutionParent), not a bare create. Return a stable id so
            // per-recipient child writes + the rollup all reference it.
            (db.workflowStepExecution.upsert as jest.Mock).mockReset().mockResolvedValue({ id: "parent-trig-1" });
            (db.workflowStepExecution.create as jest.Mock).mockResolvedValue({ id: "parent-trig-1" });
            (db.workflowStepExecution.update as jest.Mock).mockResolvedValue({ id: "parent-trig-1" });
            (db.workflowStepExecution.findMany as jest.Mock).mockReset().mockResolvedValue([]);
            (db.workflowStepExecution.findFirst as jest.Mock).mockResolvedValue(null);
        });

        async function invokeSurvey() {
            (db.workflowStep.findUnique as jest.Mock).mockResolvedValue(
                makeWorkflowStep({ stepType: "SEND_SURVEY_LINK", triggerType: "ON_REGISTRATION" })
            );
            (db.workshop.findUnique as jest.Mock).mockResolvedValue(makeWorkshop());
            return capturedHandler({ event: buildEvent(), step: mockStep });
        }

        it("SEND_SURVEY_LINK: establishes ONE reused parent keyed by deliveryBatchKey", async () => {
            (db.registration.findMany as jest.Mock).mockResolvedValue([
                { id: "reg-1", email: "ok@test.com", firstName: "OK", lastName: "User", company: "" },
            ]);
            const { getOrCreateSurveyLink } = await import("@/lib/surveys/survey-automation");
            (getOrCreateSurveyLink as jest.Mock).mockResolvedValue({
                surveyId: "s1", surveyUrl: "https://app.test/s/1",
            });

            await invokeSurvey();

            // PR-3: parent established via upsert (ensureExecutionParent), keyed
            // by a stable deliveryBatchKey so a manual-trigger retry reuses it.
            const parentUpsert = (db.workflowStepExecution.upsert as jest.Mock).mock.calls.find(
                (call) => call[0]?.create?.status === "SCHEDULED" && call[0]?.where?.deliveryBatchKey
            );
            expect(parentUpsert).toBeDefined();
            expect(parentUpsert![0].create.stepId).toBe("step-1");
            expect(parentUpsert![0].create.workshopId).toBe("ws-1");
        });

        it("SEND_SURVEY_LINK: link-gen null writes FAILED per-recipient child row + continues", async () => {
            (db.registration.findMany as jest.Mock).mockResolvedValue([
                { id: "reg-fail", email: "fail@test.com", firstName: "Fail", lastName: "User", company: "" },
                { id: "reg-ok", email: "ok@test.com", firstName: "OK", lastName: "User", company: "" },
            ]);
            const { getOrCreateSurveyLink } = await import("@/lib/surveys/survey-automation");
            (getOrCreateSurveyLink as jest.Mock)
                .mockResolvedValueOnce(null)
                .mockResolvedValueOnce({ surveyId: "s2", surveyUrl: "https://app.test/s/2" });

            await invokeSurvey();

            // FAILED child for the link-gen failure
            const failedUpsert = (db.workflowStepExecution.upsert as jest.Mock).mock.calls.find(
                (call) =>
                    call[0]?.create?.status === "FAILED" &&
                    call[0]?.create?.errorMessage === "link_generation_failed"
            );
            expect(failedUpsert).toBeDefined();
            expect(failedUpsert![0].create.parentId).toBe("parent-trig-1");
            expect(failedUpsert![0].create.recipientEmail).toBe("fail@test.com");

            // SENT child for the successful recipient
            const sentUpsert = (db.workflowStepExecution.upsert as jest.Mock).mock.calls.find(
                (call) =>
                    call[0]?.create?.status === "SENT" &&
                    call[0]?.create?.recipientEmail === "ok@test.com"
            );
            expect(sentUpsert).toBeDefined();
            expect(sentUpsert![0].create.parentId).toBe("parent-trig-1");
        });

        // ---- EMAIL_ATTENDEES parity ----

        async function invokeAttendees() {
            (db.workflowStep.findUnique as jest.Mock).mockResolvedValue(
                makeWorkflowStep({ stepType: "EMAIL_ATTENDEES", triggerType: "ON_REGISTRATION" })
            );
            (db.workshop.findUnique as jest.Mock).mockResolvedValue(makeWorkshop());
            return capturedHandler({ event: buildEvent(), step: mockStep });
        }

        it("EMAIL_ATTENDEES: establishes reused parent, writes per-recipient SENT children, rolls the parent up", async () => {
            (db.registration.findMany as jest.Mock).mockResolvedValue([
                { id: "reg-1", email: "a@test.com", firstName: "A", lastName: "One", company: "" },
                { id: "reg-2", email: "b@test.com", firstName: "B", lastName: "Two", company: "" },
            ]);

            await invokeAttendees();

            // PR-3: parent established via upsert (SCHEDULED, keyed by deliveryBatchKey)
            const parentUpsert = (db.workflowStepExecution.upsert as jest.Mock).mock.calls.find(
                (call) => call[0]?.create?.status === "SCHEDULED" && call[0]?.where?.deliveryBatchKey
            );
            expect(parentUpsert).toBeDefined();

            // Per-recipient SENT children for both recipients
            const sentChildren = (db.workflowStepExecution.upsert as jest.Mock).mock.calls.filter(
                (call) =>
                    call[0]?.create?.status === "SENT" &&
                    call[0]?.create?.parentId === "parent-trig-1"
            );
            expect(sentChildren.length).toBe(2);

            // Rollup queried children under the parent (finalizeParentRollup,
            // now invoked inside sendFanoutRecipients).
            expect(db.workflowStepExecution.findMany).toHaveBeenCalledWith(
                expect.objectContaining({ where: expect.objectContaining({ parentId: "parent-trig-1" }) })
            );
        });

        it("EMAIL_ATTENDEES with 0 registrants: parent transitions to SKIPPED (BUG-MAY4-1b twin fix)", async () => {
            (db.registration.findMany as jest.Mock).mockResolvedValue([]);

            await invokeAttendees();

            // No emails sent
            expect(sendEmailViaSMTP).not.toHaveBeenCalled();

            // Parent updated to SKIPPED — NOT a false-positive SENT
            const skippedUpdate = (db.workflowStepExecution.update as jest.Mock).mock.calls.find(
                (call) => call[0]?.where?.id === "parent-trig-1" && call[0]?.data?.status === "SKIPPED"
            );
            expect(skippedUpdate).toBeDefined();

            // Confirm no SENT update or SENT create on the parent
            const sentTerminalAnywhere =
                (db.workflowStepExecution.update as jest.Mock).mock.calls.find(
                    (call) => call[0]?.data?.status === "SENT"
                ) ||
                (db.workflowStepExecution.create as jest.Mock).mock.calls.find(
                    (call) => call[0]?.data?.status === "SENT" && !call[0]?.data?.parentId
                );
            expect(sentTerminalAnywhere).toBeUndefined();
        });

        // ---- SEND_FILE_LINK parity ----

        async function invokeFileLink() {
            const { getWorkflowStepFiles, buildProtectedEmailAttachments } =
                jest.requireMock("@/lib/files/file-service");
            (getWorkflowStepFiles as jest.Mock).mockResolvedValue([
                { id: "file-1", filename: "guide.pdf", contentType: "application/pdf" },
            ]);
            (buildProtectedEmailAttachments as jest.Mock).mockReturnValue([
                { filename: "guide.pdf", path: "https://app.test/files/file-1", contentType: "application/pdf" },
            ]);
            (db.workflowStep.findUnique as jest.Mock).mockResolvedValue(
                makeWorkflowStep({ stepType: "SEND_FILE_LINK", triggerType: "ON_REGISTRATION" })
            );
            (db.workshop.findUnique as jest.Mock).mockResolvedValue(makeWorkshop());
            return capturedHandler({ event: buildEvent(), step: mockStep });
        }

        it("SEND_FILE_LINK: establishes reused parent, writes per-recipient SENT child, rolls the parent up", async () => {
            (db.registration.findMany as jest.Mock).mockResolvedValue([
                { id: "reg-1", email: "a@test.com", firstName: "A", lastName: "One", company: "" },
            ]);

            await invokeFileLink();

            // PR-3: parent established via upsert (SCHEDULED, keyed by deliveryBatchKey)
            const parentUpsert = (db.workflowStepExecution.upsert as jest.Mock).mock.calls.find(
                (call) => call[0]?.create?.status === "SCHEDULED" && call[0]?.where?.deliveryBatchKey
            );
            expect(parentUpsert).toBeDefined();

            // Per-recipient SENT child
            const sentChild = (db.workflowStepExecution.upsert as jest.Mock).mock.calls.find(
                (call) =>
                    call[0]?.create?.status === "SENT" &&
                    call[0]?.create?.parentId === "parent-trig-1" &&
                    call[0]?.create?.recipientEmail === "a@test.com"
            );
            expect(sentChild).toBeDefined();

            // Rollup queried children under the parent
            expect(db.workflowStepExecution.findMany).toHaveBeenCalledWith(
                expect.objectContaining({ where: expect.objectContaining({ parentId: "parent-trig-1" }) })
            );
        });

        it("SEND_SURVEY_LINK: reuses ONE upserted parent — never a bare parent create()", async () => {
            (db.registration.findMany as jest.Mock).mockResolvedValue([
                { id: "reg-1", email: "ok@test.com", firstName: "OK", lastName: "User", company: "" },
            ]);
            const { getOrCreateSurveyLink } = await import("@/lib/surveys/survey-automation");
            (getOrCreateSurveyLink as jest.Mock).mockResolvedValue({
                surveyId: "s1", surveyUrl: "https://app.test/s/1",
            });

            await invokeSurvey();

            // PR-3: exactly ONE parent established, via upsert (SCHEDULED + key)
            const parentUpserts = (db.workflowStepExecution.upsert as jest.Mock).mock.calls.filter(
                (call) => call[0]?.create?.status === "SCHEDULED" && call[0]?.where?.deliveryBatchKey
            );
            expect(parentUpserts).toHaveLength(1);

            // And NEVER a bare parent create() (the old pre-create path is gone).
            const parentCreates = (db.workflowStepExecution.create as jest.Mock).mock.calls.filter(
                (call) => call[0]?.data?.status === "SCHEDULED" && !call[0]?.data?.parentId
            );
            expect(parentCreates).toHaveLength(0);

            // Rollup read fired against the parent id
            expect(db.workflowStepExecution.findMany).toHaveBeenCalledWith(
                expect.objectContaining({ where: expect.objectContaining({ parentId: "parent-trig-1" }) })
            );
        });

        // PR-3 (audit Inngest dedup): retry-resend protection on the manual path.
        it("EMAIL_ATTENDEES manual-trigger replay: skips recipients with a prior SENT child (no re-send)", async () => {
            (db.workflowStep.findUnique as jest.Mock).mockResolvedValue(
                makeWorkflowStep({ stepType: "EMAIL_ATTENDEES", triggerType: "ON_REGISTRATION" })
            );
            (db.workshop.findUnique as jest.Mock).mockResolvedValue(makeWorkshop());
            (db.registration.findMany as jest.Mock).mockResolvedValue([
                { id: "reg-1", email: "a@test.com", firstName: "A", lastName: "One", company: "" },
                { id: "reg-2", email: "b@test.com", firstName: "B", lastName: "Two", company: "" },
            ]);
            // A prior attempt of this same manual trigger already SENT reg-1 under
            // the reused parent (ensureExecutionParent returns the same row).
            (db.workflowStepExecution.findMany as jest.Mock).mockResolvedValue([
                { registrationId: "reg-1", status: "SENT" },
            ]);

            await capturedHandler({
                event: buildEvent({ manualTriggerId: "click-1", forceResend: true }),
                step: mockStep,
            });

            // Only the not-yet-sent recipient is emailed; reg-1 is skipped.
            expect(sendEmailViaSMTP).toHaveBeenCalledTimes(1);
            expect(sendEmailViaSMTP).toHaveBeenCalledWith(
                expect.objectContaining({ to: "b@test.com" })
            );
            // The parent key is derived from the per-click manualTriggerId.
            const parentUpsert = (db.workflowStepExecution.upsert as jest.Mock).mock.calls.find(
                (call) => call[0]?.create?.status === "SCHEDULED" && call[0]?.where?.deliveryBatchKey
            );
            expect(parentUpsert![0].where.deliveryBatchKey).toContain("click-1");
        });
    });

    // ------------------------------------------------------------------
    // workshopLocation token for VIRTUAL workshops (BUG-MAY25)
    // ------------------------------------------------------------------
    describe("workshopLocation context value", () => {
        it("uses virtualLink as workshopLocation for VIRTUAL workshops", async () => {
            (db.workshop.findUnique as jest.Mock).mockResolvedValue(
                makeWorkshop({ format: "VIRTUAL", virtualLink: "https://zoom.us/j/999" })
            );

            await capturedHandler({
                event: { data: { stepId: "step-1", workshopId: "ws-1" } },
                step: mockStep,
            });

            const interpolateCalls = (interpolateTemplate as jest.Mock).mock.calls;
            expect(interpolateCalls.length).toBeGreaterThan(0);
            const contextArg = interpolateCalls[0][1];
            expect(contextArg).toMatchObject({ workshopLocation: "https://zoom.us/j/999" });
        });

        it("uses buildLocationString for IN_PERSON workshops", async () => {
            (db.workshop.findUnique as jest.Mock).mockResolvedValue(
                makeWorkshop({ format: "IN_PERSON", virtualLink: null })
            );

            await capturedHandler({
                event: { data: { stepId: "step-1", workshopId: "ws-1" } },
                step: mockStep,
            });

            const interpolateCalls = (interpolateTemplate as jest.Mock).mock.calls;
            expect(interpolateCalls.length).toBeGreaterThan(0);
            const contextArg = interpolateCalls[0][1];
            expect(contextArg).toMatchObject({ workshopLocation: "123 Main St, New York, NY" });
        });
    });
});
