import { serve } from "inngest/next";
import { inngest } from "@/inngest/client";
import { checkStaleApprovals } from "@/inngest/functions/check-stale-approvals";
import { scheduleEmailSequence } from "@/inngest/functions/schedule-emails";
import { executeWorkflow } from "@/inngest/functions/execute-workflow";

export const { GET, POST, PUT } = serve({
    client: inngest,
    functions: [
        checkStaleApprovals,
        scheduleEmailSequence,
        executeWorkflow,
    ],
});
