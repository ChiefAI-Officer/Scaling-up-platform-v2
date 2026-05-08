/**
 * BUG-MAY6-1: Order workflow steps for the Inngest sleep/execute loop.
 *
 * The execute-workflow Inngest function processes steps via sequential
 * `step.sleepUntil(sendAt) → step.run("execute-...")` calls. Time only moves
 * forward inside that function, so a step whose computed `sendAt` is earlier
 * than a previous step's would skip its sleep (past-guard) and fire
 * immediately when the loop reached it.
 *
 * Sorting RELATIVE_TO_EVENT steps by ascending `sendAt` before iteration
 * guarantees each step sleeps until exactly its scheduled time. Non-RELATIVE
 * steps (ON_REGISTRATION, ON_APPROVAL) carry no sendAt and stay in their
 * original sortOrder ahead of the timed group.
 */

import { calculateSendDate } from "./workflow-service";
import { TRIGGER_TYPES } from "./workflow-types";

export interface OrderableStep {
  sortOrder: number;
  triggerType: string;
  offsetDays: number | null;
  offsetHours: number | null;
  sendTimeOfDay: string | null;
}

export interface OrderedStep<T extends OrderableStep> {
  step: T;
  sendAt: Date | null;
}

export function orderStepsForExecution<T extends OrderableStep>(
  steps: T[],
  eventDate: Date,
  timezone: string,
): Array<OrderedStep<T>> {
  const withTiming: Array<OrderedStep<T>> = steps.map((step) => ({
    step,
    sendAt:
      step.triggerType === TRIGGER_TYPES.RELATIVE_TO_EVENT
        ? calculateSendDate(
            eventDate,
            step.offsetDays ?? 0,
            step.offsetHours,
            step.sendTimeOfDay,
            timezone,
          )
        : null,
  }));

  return withTiming.sort((a, b) => {
    // Non-RELATIVE (sendAt=null) → keep in original sortOrder, ahead of timed steps
    if (a.sendAt === null && b.sendAt === null) {
      return a.step.sortOrder - b.step.sortOrder;
    }
    if (a.sendAt === null) return -1;
    if (b.sendAt === null) return 1;

    // RELATIVE → ascending by sendAt; tie-break on sortOrder for stable display
    const delta = a.sendAt.getTime() - b.sendAt.getTime();
    if (delta !== 0) return delta;
    return a.step.sortOrder - b.step.sortOrder;
  });
}
