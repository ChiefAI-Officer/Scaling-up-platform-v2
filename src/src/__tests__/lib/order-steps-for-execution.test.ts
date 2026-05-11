/**
 * BUG-MAY6-1: orderStepsForExecution sorts workflow steps by their computed
 * sendAt before the Inngest sleep/execute loop. Without this, a sequential
 * loop that processed steps in sortOrder would fire any step whose offset is
 * earlier-in-time than a previous step's immediately when the loop reached
 * it, because the "past-guard" branch in execute-workflow.ts skips the sleep
 * for sendAt < now.
 *
 * Jeff's failing case: Step 1 (1h before) → Step 2 (2h before) → Step 3 (1h before).
 * Sequential sortOrder iteration fires Step 2 at the same moment as Step 1
 * (1h before event) instead of 2h before.
 */

import { orderStepsForExecution } from "@/lib/workflows/order-steps-for-execution";
import { TRIGGER_TYPES } from "@/lib/workflows/workflow-types";

type TestStep = {
  id: string;
  sortOrder: number;
  triggerType: string;
  offsetDays: number | null;
  offsetHours: number | null;
  sendTimeOfDay: string | null;
  stepType: string;
};

function makeStep(overrides: Partial<TestStep> & { id: string }): TestStep {
  return {
    sortOrder: 0,
    triggerType: TRIGGER_TYPES.RELATIVE_TO_EVENT,
    offsetDays: 0,
    offsetHours: null,
    sendTimeOfDay: null,
    stepType: "EMAIL_ATTENDEES",
    ...overrides,
  };
}

describe("orderStepsForExecution — BUG-MAY6-1", () => {
  // Event on May 6 2026 at 4 PM ET = 20:00 UTC
  const eventDate = new Date("2026-05-06T20:00:00.000Z");
  const timezone = "America/New_York";

  it("Jeff's failing case: step with offsetHours=-2 sorts before steps with offsetHours=-1, regardless of sortOrder", () => {
    const step1 = makeStep({ id: "s1", sortOrder: 0, offsetHours: -1, stepType: "EMAIL_ATTENDEES" });
    const step2 = makeStep({ id: "s2", sortOrder: 1, offsetHours: -2, stepType: "SEND_SURVEY_LINK" });
    const step3 = makeStep({ id: "s3", sortOrder: 2, offsetHours: -1, stepType: "SEND_FILE_LINK" });

    const ordered = orderStepsForExecution([step1, step2, step3], eventDate, timezone);

    // Iteration order should be by ascending sendAt: s2 (2h before = 18:00 UTC) first,
    // then s1 and s3 (both 1h before = 19:00 UTC) in stable sortOrder.
    expect(ordered.map((entry) => entry.step.id)).toEqual(["s2", "s1", "s3"]);
  });

  it("attaches the computed sendAt to each RELATIVE step (so the caller can persist it)", () => {
    const step1 = makeStep({ id: "s1", sortOrder: 0, offsetHours: -1 });
    const step2 = makeStep({ id: "s2", sortOrder: 1, offsetHours: -2 });

    const ordered = orderStepsForExecution([step1, step2], eventDate, timezone);

    const s1 = ordered.find((e) => e.step.id === "s1")!;
    const s2 = ordered.find((e) => e.step.id === "s2")!;
    expect(s1.sendAt?.toISOString()).toBe("2026-05-06T19:00:00.000Z");
    expect(s2.sendAt?.toISOString()).toBe("2026-05-06T18:00:00.000Z");
  });

  it("non-RELATIVE steps (ON_REGISTRATION, ON_APPROVAL) carry no sendAt and sort ahead of RELATIVE steps in their original sortOrder", () => {
    const onApproval = makeStep({ id: "approval", sortOrder: 0, triggerType: TRIGGER_TYPES.ON_APPROVAL });
    const relative = makeStep({ id: "relative", sortOrder: 1, offsetHours: -1 });
    const onRegistration = makeStep({ id: "registration", sortOrder: 2, triggerType: TRIGGER_TYPES.ON_REGISTRATION });

    const ordered = orderStepsForExecution([relative, onApproval, onRegistration], eventDate, timezone);

    expect(ordered.map((entry) => entry.step.id)).toEqual(["approval", "registration", "relative"]);
    expect(ordered[0].sendAt).toBeNull();
    expect(ordered[1].sendAt).toBeNull();
    expect(ordered[2].sendAt).not.toBeNull();
  });

  it("empty steps array → empty result", () => {
    expect(orderStepsForExecution([], eventDate, timezone)).toEqual([]);
  });

  it("steps with identical sendAt are stable on sortOrder (UI rendering matches storage)", () => {
    const a = makeStep({ id: "a", sortOrder: 5, offsetHours: -1 });
    const b = makeStep({ id: "b", sortOrder: 2, offsetHours: -1 });
    const c = makeStep({ id: "c", sortOrder: 8, offsetHours: -1 });

    const ordered = orderStepsForExecution([a, b, c], eventDate, timezone);
    expect(ordered.map((entry) => entry.step.id)).toEqual(["b", "a", "c"]);
  });
});
