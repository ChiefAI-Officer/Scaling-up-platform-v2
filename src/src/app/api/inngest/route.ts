import { serve } from "inngest/next";
import { inngest } from "@/inngest/client";
import { checkStaleApprovals } from "@/inngest/functions/check-stale-approvals";
import { scheduleEmailSequence } from "@/inngest/functions/schedule-emails";
import { executeWorkflow } from "@/inngest/functions/execute-workflow";
import { autoBuildWorkshop } from "@/inngest/functions/auto-build-workshop";
import { workshopCompletionSummary } from "@/inngest/functions/workshop-completion-summary";
import { workshopDateChange } from "@/inngest/functions/workshop-date-change";

export const { GET, POST, PUT } = serve({
    client: inngest,
    functions: [
        checkStaleApprovals,
        scheduleEmailSequence,
        executeWorkflow,
        autoBuildWorkshop,
        workshopCompletionSummary,
        workshopDateChange,
    ],
});
