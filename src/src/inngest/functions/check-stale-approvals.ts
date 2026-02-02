import { inngest } from "@/inngest/client";
import { checkAndEscalateStaleApprovals } from "@/lib/approval-engine";

/**
 * Inngest Function: Check Stale Approvals
 * Runs every hour to check for approvals pending > 24 hours and escalate to Jeff.
 */
export const checkStaleApprovals = inngest.createFunction(
    { id: "check-stale-approvals" },
    { cron: "0 * * * *" }, // Every hour
    async ({ step }) => {
        const escalatedCount = await step.run("escalate-stale", async () => {
            return await checkAndEscalateStaleApprovals();
        });

        return {
            success: true,
            escalatedCount,
            checkedAt: new Date().toISOString(),
        };
    }
);

export default checkStaleApprovals;
