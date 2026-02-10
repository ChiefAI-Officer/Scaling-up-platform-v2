jest.mock("next/server", () => ({
  NextResponse: {
    json: (body: unknown, init?: ResponseInit) =>
      new Response(JSON.stringify(body), {
        status: init?.status || 200,
        headers: init?.headers,
      }),
  },
}));

jest.mock("@/lib/db", () => ({
  db: {
    approvalQueue: {
      findMany: jest.fn(),
    },
  },
}));

jest.mock("@/lib/approval-engine", () => ({
  evaluateApproval: jest.fn(),
}));

jest.mock("@/lib/authorization", () => ({
  getApiActor: jest.fn(),
  isPrivilegedRole: (role: string) => role === "ADMIN" || role === "STAFF",
}));

import { POST } from "@/app/api/approvals/route";
import { evaluateApproval } from "@/lib/approval-engine";
import { getApiActor } from "@/lib/authorization";

function buildPostRequest(body: Record<string, unknown>): Parameters<typeof POST>[0] {
  return new Request("http://localhost/api/approvals", {
    method: "POST",
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify(body),
  }) as unknown as Parameters<typeof POST>[0];
}

describe("POST /api/approvals authorization", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (evaluateApproval as jest.Mock).mockResolvedValue({
      autoApproved: false,
      reason: "Queued for review",
      approvalId: "apr-1",
      routeTo: "admin@scalingup.com",
    });
  });

  it("returns 401 when unauthenticated", async () => {
    (getApiActor as jest.Mock).mockResolvedValue(null);

    const response = await POST(
      buildPostRequest({
        type: "WORKSHOP_REQUEST",
        details: "Test request",
      })
    );

    expect(response.status).toBe(401);
  });

  it("derives coach identity from session actor", async () => {
    (getApiActor as jest.Mock).mockResolvedValue({
      userId: "user-1",
      email: "coach@example.com",
      role: "COACH",
      coachId: "coach-1",
    });

    const response = await POST(
      buildPostRequest({
        type: "WORKSHOP_REQUEST",
        workshopTypeId: "scaling-up",
        details: "Need approval",
      })
    );

    expect(response.status).toBe(200);
    expect(evaluateApproval).toHaveBeenCalledWith(
      expect.objectContaining({
        coachId: "coach-1",
        coachEmail: "coach@example.com",
        requestedBy: "coach@example.com",
        workshopTypeSlug: "scaling-up",
      })
    );
  });

  it("blocks coach identity spoofing", async () => {
    (getApiActor as jest.Mock).mockResolvedValue({
      userId: "user-1",
      email: "coach@example.com",
      role: "COACH",
      coachId: "coach-1",
    });

    const response = await POST(
      buildPostRequest({
        type: "WORKSHOP_REQUEST",
        coachId: "coach-other",
        details: "Spoof attempt",
      })
    );

    expect(response.status).toBe(403);
    expect(evaluateApproval).not.toHaveBeenCalled();
  });
});
