import { inngest } from "@/inngest/client";
import {
  productionAssessmentEmailIntentReconcilerDeps,
  reconcileAssessmentEmailIntents,
  type ReconcileResult,
} from "@/lib/assessments/assessment-email-intent-reconciler";

function outboxDrainEvents(result: ReconcileResult) {
  return [...new Set(result.handedOffSubmissionIds)].map((submissionId) => ({
    name: "assessment/quick-lead.enqueued" as const,
    data: { submissionId },
  }));
}

async function requestOutboxDrain(
  step: { sendEvent: (name: string, events: ReturnType<typeof outboxDrainEvents>) => Promise<unknown> },
  result: ReconcileResult,
): Promise<void> {
  const events = outboxDrainEvents(result);
  if (events.length > 0) {
    await step.sendEvent("request-outbox-drain", events);
  }
}

export const assessmentEmailIntentReconciliation = inngest.createFunction(
  { id: "assessment-email-intent-reconciliation" },
  { event: "assessment/email-delivery-intent.created" },
  async ({ event, step }) => {
    const result = await step.run("reconcile-submission-email-intents", () =>
      reconcileAssessmentEmailIntents(
        productionAssessmentEmailIntentReconcilerDeps(),
        {
          kind: "submission",
          submissionId: event.data.submissionId,
          maxRows: 10,
        },
      ),
    );

    await requestOutboxDrain(step, result);
    return result;
  },
);

export const assessmentEmailIntentReconciliationCron = inngest.createFunction(
  { id: "assessment-email-intent-reconciliation-cron" },
  { cron: "*/3 * * * *" },
  async ({ step }) => {
    const result = await step.run("reconcile-scheduled-email-intents", () =>
      reconcileAssessmentEmailIntents(
        productionAssessmentEmailIntentReconcilerDeps(),
        { kind: "scheduled", maxRows: 50 },
      ),
    );

    await requestOutboxDrain(step, result);
    return result;
  },
);
