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
      findUnique: jest.fn(),
      update: jest.fn(),
    },
    coach: {
      findUnique: jest.fn().mockResolvedValue(null),
    },
    workshop: {
      findUnique: jest.fn().mockResolvedValue(null),
      update: jest.fn(),
    },
  },
}));

jest.mock("@/lib/audit", () => ({
  logAudit: jest.fn(),
}));

jest.mock("@/lib/authorization", () => ({
  getApiActor: jest.fn(),
  isPrivilegedRole: (role: string) => role === "ADMIN" || role === "STAFF",
}));

jest.mock("@/services/notifications", () => ({
  sendWorkshopApprovedEmail: jest.fn().mockResolvedValue(undefined),
  sendWorkshopDeniedEmail: jest.fn().mockResolvedValue(undefined),
}));

jest.mock("@/inngest/client", () => ({
  inngest: {
    send: jest.fn().mockResolvedValue(undefined),
  },
}));

import { POST } from "@/app/api/approvals/[id]/respond/route";
import { db } from "@/lib/db";
import { logAudit } from "@/lib/audit";
import { getApiActor } from "@/lib/authorization";

function routeParams(id = "apr-1") {
  return { params: Promise.resolve({ id }) };
}

function requestWithJson(
  payload: unknown | "THROW"
): Parameters<typeof POST>[0] {
  return {
    json: async () => {
      if (payload === "THROW") {
        throw new SyntaxError("Unexpected end of JSON input");
      }
      return payload;
    },
  } as unknown as Parameters<typeof POST>[0];
}

describe("Approval respond API", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (getApiActor as jest.Mock).mockResolvedValue({
      userId: "admin-1",
      email: "admin@example.com",
      role: "ADMIN",
      coachId: null,
    });
  });

  it("returns 400 for malformed or empty JSON payload", async () => {
    const response = await POST(requestWithJson("THROW"), routeParams("apr-1"));
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error).toMatch(/invalid json payload/i);
    expect(db.approvalQueue.findUnique).not.toHaveBeenCalled();
  });

  it("approves pending requests with valid payload", async () => {
    (db.approvalQueue.findUnique as jest.Mock).mockResolvedValue({
      id: "apr-1",
      status: "PENDING",
    });
    (db.approvalQueue.update as jest.Mock).mockResolvedValue({
      id: "apr-1",
      status: "APPROVED",
    });

    const response = await POST(
      requestWithJson({ action: "APPROVE" }),
      routeParams("apr-1")
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.status).toBe("APPROVED");
    expect(db.approvalQueue.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "apr-1" },
        data: expect.objectContaining({ status: "APPROVED" }),
      })
    );
    expect(logAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        entityType: "ApprovalQueue",
        entityId: "apr-1",
        action: "APPROVE",
      })
    );
  });
});
