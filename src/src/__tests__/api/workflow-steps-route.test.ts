jest.mock("next/server", () => ({
  NextResponse: {
    json: (body: unknown, init?: ResponseInit) =>
      new Response(JSON.stringify(body), {
        status: init?.status || 200,
        headers: init?.headers,
      }),
  },
}));

jest.mock("@/lib/auth/authorization", () => ({
  getApiActor: jest.fn(),
}));

jest.mock("@/lib/workflows/workflow-service", () => ({
  addWorkflowStep: jest.fn(),
  reorderWorkflowSteps: jest.fn(),
  updateWorkflowStep: jest.fn(),
  deleteWorkflowStep: jest.fn(),
}));

import { getApiActor } from "@/lib/auth/authorization";
import { POST as STEPS_POST, PATCH as STEPS_PATCH } from "@/app/api/workflows/[id]/steps/route";
import { PATCH as STEP_PATCH, DELETE as STEP_DELETE } from "@/app/api/workflows/[id]/steps/[stepId]/route";
import {
  addWorkflowStep,
  reorderWorkflowSteps,
  updateWorkflowStep,
  deleteWorkflowStep,
} from "@/lib/workflows/workflow-service";

const ADMIN = { userId: "u1", email: "a@x.com", role: "ADMIN", coachId: null };
const COACH = { userId: "u3", email: "c@x.com", role: "COACH", coachId: "coach-1" };

const stepsParams = (id = "wf-1") => ({ params: Promise.resolve({ id }) });
const stepParams = (id = "wf-1", stepId = "st-1") => ({ params: Promise.resolve({ id, stepId }) });
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const req = (body: unknown) => ({ json: async () => body }) as any;

const validStep = { stepType: "EMAIL_ATTENDEES", triggerType: "ON_REGISTRATION" };

describe("Workflow step routes — ADMIN-gated (audit PR-1)", () => {
  beforeEach(() => jest.clearAllMocks());

  it("POST /steps blocks a COACH (403, service not called)", async () => {
    (getApiActor as jest.Mock).mockResolvedValue(COACH);
    const res = await STEPS_POST(req(validStep), stepsParams());
    expect(res.status).toBe(403);
    expect(addWorkflowStep).not.toHaveBeenCalled();
  });

  it("POST /steps allows an ADMIN (201, step created)", async () => {
    (getApiActor as jest.Mock).mockResolvedValue(ADMIN);
    (addWorkflowStep as jest.Mock).mockResolvedValue({ id: "st-1" });
    const res = await STEPS_POST(req(validStep), stepsParams());
    expect(res.status).toBe(201);
    expect(addWorkflowStep).toHaveBeenCalled();
  });

  it("POST /steps returns 401 when unauthenticated", async () => {
    (getApiActor as jest.Mock).mockResolvedValue(null);
    const res = await STEPS_POST(req(validStep), stepsParams());
    expect(res.status).toBe(401);
    expect(addWorkflowStep).not.toHaveBeenCalled();
  });

  it("PATCH /steps (reorder) blocks a COACH (403)", async () => {
    (getApiActor as jest.Mock).mockResolvedValue(COACH);
    const res = await STEPS_PATCH(req({ stepIds: ["a", "b"] }), stepsParams());
    expect(res.status).toBe(403);
    expect(reorderWorkflowSteps).not.toHaveBeenCalled();
  });

  it("PATCH /steps (reorder) allows an ADMIN", async () => {
    (getApiActor as jest.Mock).mockResolvedValue(ADMIN);
    const res = await STEPS_PATCH(req({ stepIds: ["a", "b"] }), stepsParams());
    expect(res.status).toBe(200);
    expect(reorderWorkflowSteps).toHaveBeenCalledWith("wf-1", ["a", "b"]);
  });

  it("PATCH /steps/[stepId] blocks a COACH (403)", async () => {
    (getApiActor as jest.Mock).mockResolvedValue(COACH);
    const res = await STEP_PATCH(req({ subject: "x" }), stepParams());
    expect(res.status).toBe(403);
    expect(updateWorkflowStep).not.toHaveBeenCalled();
  });

  it("DELETE /steps/[stepId] blocks a COACH (403)", async () => {
    (getApiActor as jest.Mock).mockResolvedValue(COACH);
    const res = await STEP_DELETE(req(undefined), stepParams());
    expect(res.status).toBe(403);
    expect(deleteWorkflowStep).not.toHaveBeenCalled();
  });

  it("DELETE /steps/[stepId] allows an ADMIN", async () => {
    (getApiActor as jest.Mock).mockResolvedValue(ADMIN);
    (deleteWorkflowStep as jest.Mock).mockResolvedValue({ success: true });
    const res = await STEP_DELETE(req(undefined), stepParams());
    expect(res.status).toBe(200);
    expect(deleteWorkflowStep).toHaveBeenCalledWith("st-1");
  });
});
