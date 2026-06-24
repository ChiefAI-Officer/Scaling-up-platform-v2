jest.mock("next/server", () => ({
  NextResponse: {
    json: (body: unknown, init?: ResponseInit) =>
      new Response(JSON.stringify(body), {
        status: init?.status || 200,
        headers: init?.headers,
      }),
  },
}));

// GET legitimately stays coach-accessible (lists templates), so this route keeps
// getServerSession for GET — this mock is permanent, not a RED-only shim.
jest.mock("next-auth", () => ({ getServerSession: jest.fn() }));
jest.mock("@/lib/auth/auth", () => ({ authOptions: {} }));

jest.mock("@/lib/auth/authorization", () => ({
  getApiActor: jest.fn(),
}));

jest.mock("@/lib/workflows/workflow-service", () => ({
  createWorkflow: jest.fn(),
  listWorkflows: jest.fn(),
  duplicateWorkflow: jest.fn(),
}));

import { getServerSession } from "next-auth";
import { getApiActor } from "@/lib/auth/authorization";
import { POST } from "@/app/api/workflows/route";
import { createWorkflow, duplicateWorkflow } from "@/lib/workflows/workflow-service";

const ADMIN = { userId: "admin-1", email: "a@x.com", role: "ADMIN", coachId: null };
const COACH = { userId: "coach-1", email: "c@x.com", role: "COACH", coachId: "c1" };
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const req = (body: unknown) => ({ json: async () => body }) as any;

function asCoach() {
  // current code reads getServerSession; the fix reads getApiActor — set both so
  // RED (pre-fix) shows the vuln (coach succeeds) and GREEN (post-fix) shows 403.
  (getServerSession as jest.Mock).mockResolvedValue({ user: { id: "coach-1", role: "COACH" } });
  (getApiActor as jest.Mock).mockResolvedValue(COACH);
}
function asAdmin() {
  (getServerSession as jest.Mock).mockResolvedValue({ user: { id: "admin-1", role: "ADMIN" } });
  (getApiActor as jest.Mock).mockResolvedValue(ADMIN);
}

describe("POST /api/workflows — create + duplicate are ADMIN-only (co-validate find)", () => {
  beforeEach(() => jest.clearAllMocks());

  it("blocks a COACH from creating a (non-template) workflow (403)", async () => {
    asCoach();
    const res = await POST(req({ name: "My WF" }));
    expect(res.status).toBe(403);
    expect(createWorkflow).not.toHaveBeenCalled();
  });

  it("blocks a COACH from duplicating any workflow (403)", async () => {
    asCoach();
    const res = await POST(req({ name: "Copy", duplicateFromId: "wf-src" }));
    expect(res.status).toBe(403);
    expect(duplicateWorkflow).not.toHaveBeenCalled();
  });

  it("allows an ADMIN to create a workflow (201, createdBy = actor)", async () => {
    asAdmin();
    (createWorkflow as jest.Mock).mockResolvedValue({ id: "wf-1" });
    const res = await POST(req({ name: "My WF" }));
    expect(res.status).toBe(201);
    expect(createWorkflow).toHaveBeenCalledWith(expect.objectContaining({ createdBy: "admin-1" }));
  });

  it("allows an ADMIN to duplicate a workflow (201)", async () => {
    asAdmin();
    (duplicateWorkflow as jest.Mock).mockResolvedValue({ id: "wf-2" });
    const res = await POST(req({ name: "Copy", duplicateFromId: "wf-src" }));
    expect(res.status).toBe(201);
    expect(duplicateWorkflow).toHaveBeenCalledWith("wf-src", "admin-1", "Copy");
  });

  it("returns 401 when unauthenticated", async () => {
    (getServerSession as jest.Mock).mockResolvedValue(null);
    (getApiActor as jest.Mock).mockResolvedValue(null);
    const res = await POST(req({ name: "My WF" }));
    expect(res.status).toBe(401);
    expect(createWorkflow).not.toHaveBeenCalled();
  });
});
