import { db } from "@/lib/db";
import { inngest } from "@/inngest/client";
import {
  quarantineRejectedStableInvitationTokenById,
  reconcileRejectedStableInvitationTokenById,
  type StableRejectedTokenIdentity,
} from "@/lib/assessments/stable-invitation-tokens";
import { STABLE_INVITATION_REJECTION_RETRY_EVENT } from "./stable-invitation-rejection-retry-event";

export { STABLE_INVITATION_REJECTION_RETRY_EVENT };

export interface StableInvitationRejectionRetryDeps {
  quarantine(input: StableRejectedTokenIdentity): Promise<void>;
  reconcile(input: StableRejectedTokenIdentity): Promise<void>;
}

export async function runStableInvitationRejectionRetry(
  deps: StableInvitationRejectionRetryDeps,
  input: StableRejectedTokenIdentity,
) {
  await deps.quarantine(input);
  await deps.reconcile(input);
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
      },
      event.data,
    ),
);
