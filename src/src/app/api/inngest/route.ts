import { serve } from "inngest/next";
import { inngest } from "@/inngest/client";
import { checkStaleApprovals } from "@/inngest/functions/check-stale-approvals";
import { scheduleEmailSequence } from "@/inngest/functions/schedule-emails";
import { executeWorkflow } from "@/inngest/functions/execute-workflow";
import { autoBuildWorkshop } from "@/inngest/functions/auto-build-workshop";
import { workshopCompletionSummary } from "@/inngest/functions/workshop-completion-summary";
import { workshopDateChange } from "@/inngest/functions/workshop-date-change";
import { triggerWorkflowStep } from "@/inngest/functions/trigger-workflow-step";
import { processPaymentCompleted } from "@/inngest/functions/process-payment-completed";
import { handleRegistrationCreatedFree } from "@/inngest/functions/handle-registration-created-free";
import {
  quickAssessmentLeadEmail,
  quickAssessmentLeadEmailCron,
} from "@/inngest/functions/quick-assessment-lead-email";

export const { GET, POST, PUT } = serve({
    client: inngest,
    functions: [
        checkStaleApprovals,
        scheduleEmailSequence,
        executeWorkflow,
        autoBuildWorkshop,
        workshopCompletionSummary,
        workshopDateChange,
        triggerWorkflowStep,
        processPaymentCompleted,
        handleRegistrationCreatedFree,
        quickAssessmentLeadEmail,
        quickAssessmentLeadEmailCron,
    ],
});
