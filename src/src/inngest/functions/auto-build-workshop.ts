/**
 * Auto-Build Workshop on Approval (Sprint 5 Flagship)
 *
 * Triggered when a workshop is approved via Inngest event.
 * Acts as a retry/backup for the inline auto-build called from approval routes.
 *
 * The idempotency guard prevents duplicate work when both inline + Inngest fire.
 */

import { inngest } from "@/inngest/client";
import { db } from "@/lib/db";
import { runAutoBuild } from "@/lib/auto-build-service";

export const autoBuildWorkshop = inngest.createFunction(
    { id: "auto-build-workshop", retries: 2 },
    { event: "workshop/approved" },
    async ({ event, step }) => {
        const { workshopId } = event.data;

        // Idempotency guard: skip if workshop has already been built (e.g. inline build or Inngest retry)
        const idempotencyResult = await step.run("idempotency-check", async () => {
            const existingPages = await db.landingPage.findMany({
                where: { workshopId },
                select: { id: true },
            });
            const ws = await db.workshop.findUnique({
                where: { id: workshopId },
                select: { status: true },
            });

            const pageCount = existingPages.length;
            const status = ws?.status ?? "NOT_FOUND";
            const statusAlreadyAdvanced = status === "PRE_EVENT" || status === "POST_EVENT" || status === "COMPLETED";

            if (statusAlreadyAdvanced) {
                console.warn(
                    `[auto-build] SKIP workshopId=${workshopId} pages=${pageCount} status=${status}`
                );
                return { skip: true, pageCount, status };
            }

            console.log(
                `[auto-build] PROCEED workshopId=${workshopId} pages=${pageCount} status=${status}`
            );
            return { skip: false, pageCount, status };
        });

        if (idempotencyResult.skip) {
            return {
                workshopId,
                skipped: true,
                reason: `Idempotency guard: pages=${idempotencyResult.pageCount}, status=${idempotencyResult.status}`,
            };
        }

        // Delegate to shared service
        const result = await step.run("auto-build", () => runAutoBuild(workshopId));

        return {
            workshopId,
            ...result,
        };
    }
);
