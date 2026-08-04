/**
 * Inngest boundary coverage for assessment email delivery-intent reconciliation.
 *
 * The production change that these tests protect is a missing or widened
 * adapter boundary: the event and cron must invoke the bounded reconciler with
 * their respective scopes, then request the existing outbox drain with only
 * deduplicated submission identifiers.
 */

type Registration = {
  config: { id: string };
  trigger: { event: string } | { cron: string };
  handler: (input: {
    event?: { data: { submissionId: string } };
    step: {
      run: (name: string, work: () => Promise<unknown>) => Promise<unknown>;
      sendEvent: (name: string, events: unknown[]) => Promise<unknown>;
    };
  }) => Promise<unknown>;
};

// eslint-disable-next-line no-var
var mockRegistrations: Registration[];
// eslint-disable-next-line no-var
var mockServeCalls: unknown[][];
// eslint-disable-next-line no-var
var mockReconcileAssessmentEmailIntents: jest.Mock;
// eslint-disable-next-line no-var
var mockProductionDeps: jest.Mock;

jest.mock("@/inngest/client", () => ({
  inngest: {
    createFunction: (
      config: Registration["config"],
      trigger: Registration["trigger"],
      handler: Registration["handler"],
    ) => {
      mockRegistrations ??= [];
      const registration = { config, trigger, handler };
      mockRegistrations.push(registration);
      return registration;
    },
  },
}));

jest.mock("@/lib/assessments/assessment-email-intent-reconciler", () => ({
  reconcileAssessmentEmailIntents: (...args: unknown[]) =>
    mockReconcileAssessmentEmailIntents(...args),
  productionAssessmentEmailIntentReconcilerDeps: () => mockProductionDeps(),
}));

jest.mock("inngest/next", () => ({
  serve: (...args: unknown[]) => {
    mockServeCalls ??= [];
    mockServeCalls.push(args);
    return { GET: jest.fn(), POST: jest.fn(), PUT: jest.fn() };
  },
}));

jest.mock("@/inngest/functions/execute-workflow", () => ({
  executeWorkflow: { id: "existing-execute-workflow" },
}));

jest.mock("@/inngest/functions/trigger-workflow-step", () => ({
  triggerWorkflowStep: { id: "existing-trigger-workflow-step" },
}));

import "@/inngest/functions/assessment-email-intent-reconciliation";
import "@/app/api/inngest/route";

mockReconcileAssessmentEmailIntents = jest.fn();
mockProductionDeps = jest.fn(() => ({ production: true }));

const emptyResult = {
  handedOff: 0,
  held: 0,
  expired: 0,
  deferredByPause: 0,
  retried: 0,
  existingOutboxWon: 0,
  handedOffSubmissionIds: [],
};

function functionFor(id: string): Registration {
  const registration = mockRegistrations.find(
    (candidate) => candidate.config.id === id,
  );
  if (!registration) throw new Error(`missing ${id} registration`);
  return registration;
}

function makeStep() {
  return {
    run: jest.fn(async (_name: string, work: () => Promise<unknown>) => work()),
    sendEvent: jest.fn().mockResolvedValue(undefined),
  };
}

describe("assessment email intent reconciliation Inngest adapters", () => {
  const eventFunction = () =>
    functionFor("assessment-email-intent-reconciliation");
  const cronFunction = () =>
    functionFor("assessment-email-intent-reconciliation-cron");

  beforeEach(() => {
    jest.clearAllMocks();
    mockReconcileAssessmentEmailIntents.mockResolvedValue(emptyResult);
  });

  it("registers the event and scheduled repair exactly once with the documented triggers", () => {
    expect(mockRegistrations.filter((entry) => entry.config.id === "assessment-email-intent-reconciliation")).toHaveLength(1);
    expect(mockRegistrations.filter((entry) => entry.config.id === "assessment-email-intent-reconciliation-cron")).toHaveLength(1);
    expect(eventFunction().trigger).toEqual({
      event: "assessment/email-delivery-intent.created",
    });
    expect(cronFunction().trigger).toEqual({ cron: "*/3 * * * *" });

    const registeredFunctions = (mockServeCalls[0][0] as {
      functions: unknown[];
    }).functions;
    expect(registeredFunctions.filter((entry: unknown) => entry === eventFunction())).toHaveLength(1);
    expect(registeredFunctions.filter((entry: unknown) => entry === cronFunction())).toHaveLength(1);
  });

  it("runs the event fast path with its submission scope and requests one deduplicated ID-only drain", async () => {
    mockReconcileAssessmentEmailIntents.mockResolvedValue({
      ...emptyResult,
      handedOff: 3,
      handedOffSubmissionIds: ["submission-1", "submission-1", "submission-2"],
    });
    const step = makeStep();

    await eventFunction().handler({
      event: { data: { submissionId: "submission-1" } },
      step,
    });

    expect(mockProductionDeps).toHaveBeenCalledTimes(1);
    expect(mockReconcileAssessmentEmailIntents).toHaveBeenCalledWith(
      expect.anything(),
      { kind: "submission", submissionId: "submission-1", maxRows: 10 },
    );
    expect(step.sendEvent).toHaveBeenCalledTimes(1);
    expect(step.sendEvent).toHaveBeenCalledWith("request-outbox-drain", [
      {
        name: "assessment/quick-lead.enqueued",
        data: { submissionId: "submission-1" },
      },
      {
        name: "assessment/quick-lead.enqueued",
        data: { submissionId: "submission-2" },
      },
    ]);
    expect(JSON.stringify(step.sendEvent.mock.calls)).not.toMatch(
      /recipient|email|content|provenance/i,
    );
  });

  it("runs the scheduled repair with its bounded global scope", async () => {
    const step = makeStep();

    await cronFunction().handler({ step });

    expect(mockProductionDeps).toHaveBeenCalledTimes(1);
    expect(mockReconcileAssessmentEmailIntents).toHaveBeenCalledWith(
      expect.anything(),
      { kind: "scheduled", maxRows: 50 },
    );
  });

  it("does not request an outbox drain when reconciliation hands off nothing", async () => {
    const step = makeStep();

    await eventFunction().handler({
      event: { data: { submissionId: "submission-1" } },
      step,
    });

    expect(step.sendEvent).not.toHaveBeenCalled();
  });
});
