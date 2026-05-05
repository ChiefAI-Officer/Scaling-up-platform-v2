import { EventSchemas } from "inngest";

// Define all event types here for type safety
type WorkshopCreated = {
    data: {
        workshopId: string;
        coachId: string;
        title: string;
        date: string;
    };
};

type RegistrationCreated = {
    data: {
        registrationId: string;
        workshopId: string;
        email: string;
        firstName: string;
    };
};

type ApprovalRequested = {
    data: {
        approvalId: string;
        type: string;
        coachId: string;
    };
};

// JV-11: Workflow execution events
type WorkflowSchedule = {
    data: {
        workshopId: string;
        workflowAssignmentId: string;
    };
};

type WorkflowStepExecute = {
    data: {
        stepExecutionId: string;
        stepId: string;
        workshopId: string;
        registrationId?: string;
    };
};

type WorkshopApproved = {
    data: {
        approvalId: string;
        workshopId: string;
        coachId: string;
    };
};

type WorkshopCompleted = {
    data: {
        workshopId: string;
    };
};

type WorkshopDateChanged = {
    data: {
        workshopId: string;
    };
};

type WorkflowStepTrigger = {
    data: {
        stepId: string;
        workshopId: string;
        forceResend?: boolean;
    };
};

// Stripe webhook fix (May 2026, plan v5): drives the processPaymentCompleted
// Inngest function which handles HubSpot sync + strict notification + marks
// the row processed. Emitted by the slim Stripe webhook handler.
type RegistrationPaymentCompleted = {
    data: {
        registrationId: string;
        source: "checkout.session.completed" | "payment_intent.succeeded" | "recovery";
    };
};

type Events = {
    "workshop/created": WorkshopCreated;
    "workshop/approved": WorkshopApproved;
    "workshop/completed": WorkshopCompleted;
    "workshop/date-changed": WorkshopDateChanged;
    "registration/created": RegistrationCreated;
    "registration/payment-completed": RegistrationPaymentCompleted;
    "approval/requested": ApprovalRequested;
    "workflow/schedule": WorkflowSchedule;
    "workflow/step.execute": WorkflowStepExecute;
    "workflow/step.trigger": WorkflowStepTrigger;
};

export const schemas = new EventSchemas().fromRecord<Events>();
