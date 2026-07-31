import { db } from "@/lib/db";
import { inngest } from "@/inngest/client";
import {
  quarantineRejectedStableInvitationTokenById,
  reconcileRejectedStableInvitationTokenById,
  type StableRejectedTokenIdentity,
} from "@/lib/assessments/stable-invitation-tokens";
import {
  drainStableInvitationRejectionRepairOutbox,
  isStableInvitationRejectionRepairResolved,
  markStableInvitationRejectionRepairResolved,
  type StableInvitationRejectionOutboxDb,
} from "@/lib/assessments/stable-invitation-rejection-outbox";
import { STABLE_INVITATION_REJECTION_RETRY_EVENT } from "./stable-invitation-rejection-retry-event";

export { STABLE_INVITATION_REJECTION_RETRY_EVENT };

export interface StableInvitationRejectionRetryDeps {
  quarantine(input: StableRejectedTokenIdentity): Promise<void>;
  reconcile(input: StableRejectedTokenIdentity): Promise<void>;
  isResolved(input: StableRejectedTokenIdentity): Promise<boolean>;
  markResolved(input: StableRejectedTokenIdentity): Promise<void>;
}

export async function runStableInvitationRejectionRetry(
  deps: StableInvitationRejectionRetryDeps,
  input: StableRejectedTokenIdentity,
) {
  if (await deps.isResolved(input)) {
    return {
      invitationId: input.invitationId,
      tokenId: input.tokenId,
      skipped: true,
    };
  }
  await deps.quarantine(input);
  await deps.reconcile(input);
  await deps.markResolved(input);
  return {
    invitationId: input.invitationId,
    tokenId: input.tokenId,
    quarantined: true,
    reconciled: true,
  };
}

export const stableInvitationRejectionRetry = inngest.createFunction(
  {
    id: "stable-invitation-rejection-retry",
    concurrency: { key: "event.data.invitationId", limit: 1 },
    retries: 10,
  },
  { event: STABLE_INVITATION_REJECTION_RETRY_EVENT },
  async ({ event }) =>
    runStableInvitationRejectionRetry(
      {
        quarantine: (input) =>
          quarantineRejectedStableInvitationTokenById(db, input),
        reconcile: (input) =>
          reconcileRejectedStableInvitationTokenById(db, input),
        isResolved: (input) =>
          isStableInvitationRejectionRepairResolved(
            db as unknown as StableInvitationRejectionOutboxDb,
            input,
          ),
        markResolved: (input) =>
          markStableInvitationRejectionRepairResolved(
            db as unknown as StableInvitationRejectionOutboxDb,
            {
              ...input,
              performedBy: "system:stable-invitation-repair-event",
            },
          ),
      },
      event.data,
    ),
);

export const stableInvitationRejectionRepairCron = inngest.createFunction(
  {
    id: "stable-invitation-rejection-repair-cron",
    concurrency: { limit: 1 },
  },
  { cron: "*/5 * * * *" },
  async ({ step }) =>
    step.run("drain-stable-invitation-rejection-outbox", () =>
      drainStableInvitationRejectionRepairOutbox({
        db: db as unknown as StableInvitationRejectionOutboxDb,
        quarantine: (input) =>
          quarantineRejectedStableInvitationTokenById(db, input),
        reconcile: (input) =>
          reconcileRejectedStableInvitationTokenById(db, input),
      }),
    ),
);
