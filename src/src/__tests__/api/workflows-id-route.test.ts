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

jest.mock("@/lib/workflow-service", () => ({
  getWorkflow: jest.fn(),
  updateWorkflow: jest.fn(),
  deleteWorkflow: jest.fn(),
}));

import { getServerSession } from "next-auth";
import { GET, PATCH, DELETE } from "@/app/api/workflows/[id]/route";
import { getWorkflow, updateWorkflow, deleteWorkflow } from "@/lib/workflow-service";

function authenticatedSession(role: "ADMIN" | "COACH" = "ADMIN") {
  return {
    user: {
      id: "user-1",
      email: "user@example.com",
      role,
    },
  };
}

function routeParams(id = "wf-1") {
  return { params: Promise.resolve({ id }) };
}

function buildRequest(body: unknown) {
  return {
    json: async () => body,
  } as Parameters<typeof PATCH>[0];
}

describe("Workflow [id] API", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("blocks non-admin GET", async () => {
    (getServerSession as jest.Mock).mockResolvedValue(authenticatedSession("COACH"));

    const response = await GET({} as Parameters<typeof GET>[0], routeParams());

    expect(response.status).toBe(403);
    expect(getWorkflow).not.toHaveBeenCalled();
  });

  it("allows admin GET", async () => {
    (getServerSession as jest.Mock).mockResolvedValue(authenticatedSession("ADMIN"));
    (getWorkflow as jest.Mock).mockResolvedValue({ id: "wf-1", name: "Previewable" });

    const response = await GET({} as Parameters<typeof GET>[0], routeParams());
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.data.id).toBe("wf-1");
  });

  it("blocks non-admin PATCH", async () => {
    (getServerSession as jest.Mock).mockResolvedValue(authenticatedSession("COACH"));

    const response = await PATCH(buildRequest({ name: "Changed" }), routeParams());

    expect(response.status).toBe(403);
    expect(updateWorkflow).not.toHaveBeenCalled();
  });

  it("blocks non-admin DELETE", async () => {
    (getServerSession as jest.Mock).mockResolvedValue(authenticatedSession("COACH"));

    const response = await DELETE({} as Parameters<typeof DELETE>[0], routeParams());

    expect(response.status).toBe(403);
    expect(deleteWorkflow).not.toHaveBeenCalled();
  });

  it("allows admin DELETE", async () => {
    (getServerSession as jest.Mock).mockResolvedValue(authenticatedSession("ADMIN"));
    (deleteWorkflow as jest.Mock).mockResolvedValue({ success: true });

    const response = await DELETE({} as Parameters<typeof DELETE>[0], routeParams());
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.success).toBe(true);
    expect(deleteWorkflow).toHaveBeenCalledWith("wf-1");
  });
});
