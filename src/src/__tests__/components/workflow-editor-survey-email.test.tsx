/**
 * ENH-MAY12-2: Survey step subject/body fields should always be visible
 * when stepType === SEND_SURVEY_LINK, regardless of stale emailTemplateId.
 *
 * Tests are integration-style: they render WorkflowEditor with minimal
 * required props, then interact to trigger StepCard / NewStepForm behaviour.
 */

import React from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

jest.mock("next/navigation", () => ({
    useRouter: () => ({ push: jest.fn(), replace: jest.fn(), refresh: jest.fn() }),
    useSearchParams: () => ({ get: jest.fn() }),
    usePathname: () => "/",
}));

// Stub WorkflowTimeline + WorkflowExecutions so they don't need full context
jest.mock("@/components/workflows/workflow-timeline", () => ({
    WorkflowTimeline: () => <div data-testid="wf-timeline" />,
}));
jest.mock("@/components/workflows/workflow-executions", () => ({
    WorkflowExecutions: () => <div data-testid="wf-executions" />,
}));

import { WorkflowEditor } from "@/components/workflows/workflow-editor";
import { Toaster } from "@/components/ui/toaster";

// ─── helpers ──────────────────────────────────────────────────────────────────

const emailTemplates = [
    { id: "et-1", name: "Welcome Email", subject: "Welcome to the workshop" },
];

function makeStep(overrides: Partial<{
    id: string;
    stepType: string;
    emailTemplateId: string | null;
    surveyTemplateId: string | null;
    subject: string | null;
    body: string | null;
}> = {}) {
    return {
        id: "step-1",
        workflowId: "wf-1",
        sortOrder: 0,
        stepType: "EMAIL_ATTENDEES",
        emailTemplateId: null,
        subject: null,
        body: null,
        customRecipients: null,
        triggerType: "RELATIVE_TO_EVENT",
        offsetDays: -1,
        offsetHours: null,
        sendTimeOfDay: "09:00",
        attachments: null,
        isActive: true,
        createdAt: "2026-01-01T00:00:00Z",
        updatedAt: "2026-01-01T00:00:00Z",
        emailTemplate: null,
        surveyTemplateId: null,
        ...overrides,
    };
}

function makeWorkflow(steps: ReturnType<typeof makeStep>[] = []) {
    return {
        id: "wf-1",
        name: "Test Workflow",
        description: null,
        isActive: true,
        isTemplate: false,
        categoryId: null,
        workshopFormat: null,
        workflowPhase: null,
        createdBy: "admin",
        createdAt: "2026-01-01T00:00:00Z",
        updatedAt: "2026-01-01T00:00:00Z",
        steps,
        assignments: [],
    };
}

/**
 * Render editor (with Toaster for toast assertions) + click Edit to open StepCard editing mode.
 * Returns nothing — interact with the screen after calling.
 */
function renderWithStep(stepOverrides: Parameters<typeof makeStep>[0] = {}) {
    const step = makeStep(stepOverrides);
    const workflow = makeWorkflow([step]);
    render(
        <>
            <WorkflowEditor
                workflow={workflow}
                emailTemplates={emailTemplates}
                workshops={[]}
                categories={[]}
                isNew={false}
            />
            <Toaster />
        </>
    );
    // Click Edit to enter editing mode for step 1
    fireEvent.click(screen.getByRole("button", { name: /^edit$/i }));
}

/**
 * Find subject input by the exact placeholder text used in StepCard.
 * StepCard: "e.g., Your {{workshopTitle}} workshop is tomorrow!"
 */
function querySubjectInputStepCard() {
    return screen.queryByPlaceholderText(/your \{\{workshopTitle\}\} workshop is tomorrow/i);
}

/**
 * Find body textarea by placeholder used in StepCard.
 * StepCard: "Hi {{registrantName}},\n\nYour workshop is coming up..."
 */
function queryBodyTextareaStepCard() {
    return screen.queryByPlaceholderText(/your workshop is coming up/i);
}

// Mock fetch globally — by default resolve with empty data
beforeEach(() => {
    jest.clearAllMocks();
    global.fetch = jest.fn().mockImplementation((url: string) => {
        if (typeof url === "string" && url.includes("/api/survey-templates")) {
            return Promise.resolve({
                ok: true,
                json: async () => ({ data: [{ id: "st-1", name: "Post-Event Survey" }] }),
            });
        }
        if (typeof url === "string" && url.includes("/api/files")) {
            return Promise.resolve({
                ok: true,
                json: async () => ({ data: [] }),
            });
        }
        return Promise.resolve({
            ok: true,
            json: async () => ({ data: {} }),
        });
    });
});

// ─── Test 1: stale emailTemplateId cleared on load for SEND_SURVEY_LINK ──────

it("StepCard: stale emailTemplateId is cleared — subject/body visible for SEND_SURVEY_LINK step", async () => {
    renderWithStep({
        stepType: "SEND_SURVEY_LINK",
        emailTemplateId: "stale-id",
    });

    // After rendering in edit mode, subject input and body textarea must be visible
    await waitFor(() => {
        expect(querySubjectInputStepCard()).toBeInTheDocument();
    });
    expect(queryBodyTextareaStepCard()).toBeInTheDocument();
});

// ─── Test 2: switch from EMAIL_ATTENDEES (with template) to SEND_SURVEY_LINK ─

it("StepCard: switching from EMAIL_ATTENDEES with template to SEND_SURVEY_LINK shows subject/body", async () => {
    // Start as EMAIL_ATTENDEES with a template selected
    renderWithStep({
        stepType: "EMAIL_ATTENDEES",
        emailTemplateId: "et-1",
    });

    // Initially subject/body should be hidden (templateId is set for EMAIL_ATTENDEES)
    expect(querySubjectInputStepCard()).not.toBeInTheDocument();
    expect(queryBodyTextareaStepCard()).not.toBeInTheDocument();

    // Find step type select inside the "Edit Step 1" panel
    const editPanel = screen.getByText("Edit Step 1").closest("div[class*='border-2']");
    const selects = editPanel!.querySelectorAll("select");
    const stepTypeSelect = selects[0]; // first select = Step Type

    fireEvent.change(stepTypeSelect, { target: { value: "SEND_SURVEY_LINK" } });

    // Now subject/body should appear (templateId was cleared by the handler)
    await waitFor(() => {
        expect(querySubjectInputStepCard()).toBeInTheDocument();
    });
    expect(queryBodyTextareaStepCard()).toBeInTheDocument();
});

// ─── Test 3: non-blank body without {{surveyUrl}} shows validation error ──────

it("StepCard: body without {{surveyUrl}} shows validation error, no fetch for save", async () => {
    renderWithStep({ stepType: "SEND_SURVEY_LINK", emailTemplateId: null });

    await waitFor(() => {
        expect(queryBodyTextareaStepCard()).toBeInTheDocument();
    });

    // Fill in body without {{surveyUrl}}
    fireEvent.change(queryBodyTextareaStepCard()!, {
        target: { value: "Hello, please take the survey!" },
    });

    // Clear fetch mock count before clicking Save
    (global.fetch as jest.Mock).mockClear();

    fireEvent.click(screen.getByRole("button", { name: /save changes/i }));

    // Toast renders the title in the DOM via Toaster component
    await waitFor(() => {
        expect(screen.getByText(/survey body must include/i)).toBeInTheDocument();
    });

    // Fetch should NOT have been called for a PATCH (save was blocked)
    const saveCalls = (global.fetch as jest.Mock).mock.calls.filter(
        ([url]: [string]) => typeof url === "string" && url.includes("/api/workflows")
    );
    expect(saveCalls.length).toBe(0);
});

// ─── Test 4: blank body allowed without validation error ──────────────────────

it("StepCard: blank body is allowed for SEND_SURVEY_LINK (uses default email)", async () => {
    renderWithStep({ stepType: "SEND_SURVEY_LINK", emailTemplateId: null });

    await waitFor(() => {
        expect(queryBodyTextareaStepCard()).toBeInTheDocument();
    });

    // Leave body EMPTY — clear any content
    fireEvent.change(queryBodyTextareaStepCard()!, { target: { value: "" } });

    // Clear fetch mock count
    (global.fetch as jest.Mock).mockClear();
    // Mock the PATCH call for saving the step
    (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => ({ data: makeStep({ stepType: "SEND_SURVEY_LINK" }) }),
    });

    fireEvent.click(screen.getByRole("button", { name: /save changes/i }));

    // "survey body must include" error toast should NOT appear
    await waitFor(() => {
        expect(screen.queryByText(/survey body must include/i)).not.toBeInTheDocument();
    });
});

// ─── Test 5: NewStepForm — switch to SEND_SURVEY_LINK clears templateId ──────

it("NewStepForm: switching from EMAIL_ATTENDEES (with template) to SEND_SURVEY_LINK shows subject/body", async () => {
    const workflow = makeWorkflow([]);
    render(
        <>
            <WorkflowEditor
                workflow={workflow}
                emailTemplates={emailTemplates}
                workshops={[]}
                categories={[]}
                isNew={false}
            />
            <Toaster />
        </>
    );

    // Click "+ Add Step" to open NewStepForm
    fireEvent.click(screen.getByRole("button", { name: /\+ add step/i }));

    await waitFor(() => {
        expect(screen.getByText(/^new step$/i)).toBeInTheDocument();
    });

    // Find the "New Step" panel
    const newStepPanel = screen.getByText(/^new step$/i).closest("div[class*='border-2']");
    const selects = Array.from(newStepPanel!.querySelectorAll("select"));

    // Default is EMAIL_ATTENDEES — "Email Template" select is visible; pick a template
    const templateSelectEl = selects.find(
        (s) => s.querySelector("option[value='']")?.textContent?.includes("Write custom content")
    ) as HTMLSelectElement | undefined;

    if (templateSelectEl) {
        fireEvent.change(templateSelectEl, { target: { value: "et-1" } });
        // Subject/body should now be hidden
        expect(
            screen.queryByPlaceholderText(/reminder.*workshop.*tomorrow/i)
        ).not.toBeInTheDocument();
    }

    // Switch step type to SEND_SURVEY_LINK
    const stepTypeSelect = selects[0];
    fireEvent.change(stepTypeSelect, { target: { value: "SEND_SURVEY_LINK" } });

    // subject/body should reappear since templateId was cleared
    await waitFor(() => {
        // NewStepForm body placeholder: "Just a reminder that your workshop is coming up..."
        const bodyEl = screen.queryByPlaceholderText(/just a reminder/i);
        expect(bodyEl).toBeInTheDocument();
    });
});

// ─── Test 6: NewStepForm — body without {{surveyUrl}} shows validation error ──

it("NewStepForm: body without {{surveyUrl}} shows validation error, onAdd not called", async () => {
    const workflow = makeWorkflow([]);
    render(
        <>
            <WorkflowEditor
                workflow={workflow}
                emailTemplates={emailTemplates}
                workshops={[]}
                categories={[]}
                isNew={false}
            />
            <Toaster />
        </>
    );

    fireEvent.click(screen.getByRole("button", { name: /\+ add step/i }));

    await waitFor(() => {
        expect(screen.getByText(/^new step$/i)).toBeInTheDocument();
    });

    // Change step type to SEND_SURVEY_LINK
    const newStepPanel = screen.getByText(/^new step$/i).closest("div[class*='border-2']");
    const selects = Array.from(newStepPanel!.querySelectorAll("select"));
    const stepTypeSelect = selects[0];
    fireEvent.change(stepTypeSelect, { target: { value: "SEND_SURVEY_LINK" } });

    // Wait for body textarea to appear
    await waitFor(() => {
        expect(screen.queryByPlaceholderText(/just a reminder/i)).toBeInTheDocument();
    });

    // Fill body without {{surveyUrl}}
    fireEvent.change(screen.getByPlaceholderText(/just a reminder/i), {
        target: { value: "Please fill out the survey at the link." },
    });

    // Clear fetch count
    (global.fetch as jest.Mock).mockClear();

    fireEvent.click(screen.getByRole("button", { name: /^add step$/i }));

    // Toast error should appear
    await waitFor(() => {
        expect(screen.getByText(/survey body must include/i)).toBeInTheDocument();
    });

    // No workflow POST/PATCH should have been called
    const workflowCalls = (global.fetch as jest.Mock).mock.calls.filter(
        ([url]: [string]) => typeof url === "string" && url.includes("/api/workflows")
    );
    expect(workflowCalls.length).toBe(0);
});

// ─── Test 7: regression — EMAIL_ATTENDEES with template hides subject/body ───

it("Regression: EMAIL_ATTENDEES with emailTemplateId set hides subject/body", async () => {
    renderWithStep({
        stepType: "EMAIL_ATTENDEES",
        emailTemplateId: "et-1",
    });

    // Subject and body should be hidden because templateId is non-empty
    expect(querySubjectInputStepCard()).not.toBeInTheDocument();
    expect(queryBodyTextareaStepCard()).not.toBeInTheDocument();
});
