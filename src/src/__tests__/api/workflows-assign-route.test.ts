jest.mock("next/server", () => ({
  NextResponse: {
    json: (body: unknown, init?: ResponseInit) =>
      new Response(JSON.stringify(body), {
        status: init?.status || 200,
        headers: init?.headers,
      }),
  },
}));

jest.mock("next-auth", () => ({
  getServerSession: jest.fn(),
}));

jest.mock("@/lib/auth/auth", () => ({
  authOptions: {},
}));

jest.mock("@/lib/auth/authorization", () => ({
  isPrivilegedRole: (role: string) => role === "ADMIN" || role === "STAFF",
}));

jest.mock("@/lib/workflows/workflow-service", () => ({
  assignWorkflowToWorkshop: jest.fn(),
  unassignWorkflow: jest.fn(),
}));

jest.mock("@/inngest/client", () => ({
  inngest: { send: jest.fn().mockResolvedValue(undefined) },
}));

import { getServerSession } from "next-auth";
import { POST, DELETE } from "@/app/api/workflows/[id]/assign/route";
import {
  assignWorkflowToWorkshop,
  unassignWorkflow,
} from "@/lib/workflows/workflow-service";

function session(role: "ADMIN" | "COACH" | "STAFF" = "ADMIN") {
  return { user: { id: "user-1", email: "u@example.com", role } };
}

function params(id = "wf-1") {
  return { params: Promise.resolve({ id }) };
}

function postRequest(body: unknown) {
  return { json: async () => body } as Parameters<typeof POST>[0];
}

function deleteRequest(body: unknown) {
  return { json: async () => body } as Parameters<typeof DELETE>[0];
}

const mockAssignment = {
  id: "a-1",
  workflowId: "wf-1",
  workshopId: "ws-1",
  workshopCode: "WS-2026-XXXX",
  assignedBy: "user-1",
  isActive: true,
  assignedAt: new Date("2026-04-24T00:00:00Z"),
  workflow: { id: "wf-1", name: "Test Workflow", steps: [] },
  workshop: {
    id: "ws-1",
    title: "Workshop",
    workshopCode: "WS-2026-XXXX",
    eventDate: new Date("2026-06-01T09:00:00Z"),
    status: "PRE_EVENT",
  },
};

describe("POST /api/workflows/[id]/assign — role guard", () => {
  beforeEach(() => jest.clearAllMocks());

  it("returns 401 for unauthenticated requests", async () => {
    (getServerSession as jest.Mock).mockResolvedValue(null);

    const res = await POST(postRequest({ workshopId: "ws-1" }), params());
    expect(res.status).toBe(401);
    expect(assignWorkflowToWorkshop).not.toHaveBeenCalled();
  });

  it("returns 403 for COACH role", async () => {
    (getServerSession as jest.Mock).mockResolvedValue(session("COACH"));

    const res = await POST(postRequest({ workshopId: "ws-1" }), params());
    expect(res.status).toBe(403);
    expect(assignWorkflowToWorkshop).not.toHaveBeenCalled();
  });

  it("allows ADMIN to assign", async () => {
    (getServerSession as jest.Mock).mockResolvedValue(session("ADMIN"));
    (assignWorkflowToWorkshop as jest.Mock).mockResolvedValue(mockAssignment);

    const res = await POST(postRequest({ workshopId: "ws-1" }), params());
    const body = await res.json();

    expect(res.status).toBe(201);
    expect(body.success).toBe(true);
    expect(assignWorkflowToWorkshop).toHaveBeenCalledWith({
      workflowId: "wf-1",
      workshopId: "ws-1",
      assignedBy: "user-1",
    });
  });

  it("allows STAFF to assign", async () => {
    (getServerSession as jest.Mock).mockResolvedValue(session("STAFF"));
    (assignWorkflowToWorkshop as jest.Mock).mockResolvedValue(mockAssignment);

    const res = await POST(postRequest({ workshopId: "ws-1" }), params());
    expect(res.status).toBe(201);
  });
});

describe("DELETE /api/workflows/[id]/assign — role guard", () => {
  beforeEach(() => jest.clearAllMocks());

  it("returns 401 for unauthenticated requests", async () => {
    (getServerSession as jest.Mock).mockResolvedValue(null);

    const res = await DELETE(deleteRequest({ assignmentId: "a-1" }), params());
    expect(res.status).toBe(401);
    expect(unassignWorkflow).not.toHaveBeenCalled();
  });

  it("returns 403 for COACH role", async () => {
    (getServerSession as jest.Mock).mockResolvedValue(session("COACH"));

    const res = await DELETE(deleteRequest({ assignmentId: "a-1" }), params());
    expect(res.status).toBe(403);
    expect(unassignWorkflow).not.toHaveBeenCalled();
  });

  it("allows ADMIN to unassign", async () => {
    (getServerSession as jest.Mock).mockResolvedValue(session("ADMIN"));
    (unassignWorkflow as jest.Mock).mockResolvedValue({ id: "a-1" });

    const res = await DELETE(deleteRequest({ assignmentId: "a-1" }), params());
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(unassignWorkflow).toHaveBeenCalledWith("a-1");
  });

  it("allows STAFF to unassign", async () => {
    (getServerSession as jest.Mock).mockResolvedValue(session("STAFF"));
    (unassignWorkflow as jest.Mock).mockResolvedValue({ id: "a-1" });

    const res = await DELETE(deleteRequest({ assignmentId: "a-1" }), params());
    expect(res.status).toBe(200);
  });
});

describe("POST /api/workflows/[id]/assign — response serialization", () => {
  beforeEach(() => jest.clearAllMocks());

  it("serializes eventDate to ISO string in response", async () => {
    (getServerSession as jest.Mock).mockResolvedValue(session("ADMIN"));
    (assignWorkflowToWorkshop as jest.Mock).mockResolvedValue(mockAssignment);

    const res = await POST(postRequest({ workshopId: "ws-1" }), params());
    const body = await res.json();

    expect(typeof body.data.workshop.eventDate).toBe("string");
    expect(body.data.workshop.eventDate).toBe("2026-06-01T09:00:00.000Z");
    expect(typeof body.data.assignedAt).toBe("string");
  });

  it("handles null eventDate without crashing", async () => {
    (getServerSession as jest.Mock).mockResolvedValue(session("ADMIN"));
    (assignWorkflowToWorkshop as jest.Mock).mockResolvedValue({
      ...mockAssignment,
      workshop: { ...mockAssignment.workshop, eventDate: null },
    });

    const res = await POST(postRequest({ workshopId: "ws-1" }), params());
    const body = await res.json();

    expect(res.status).toBe(201);
    expect(body.data.workshop.eventDate).toBe("");
  });
});
