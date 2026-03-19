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
import { inngest } from "@/inngest/client";

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

  it("advances workshop status to PRE_EVENT when approving with workshopId", async () => {
    (db.approvalQueue.findUnique as jest.Mock).mockResolvedValue({
      id: "apr-2",
      status: "PENDING",
      workshopId: "ws-99",
      coachId: "coach-1",
    });
    (db.approvalQueue.update as jest.Mock).mockResolvedValue({
      id: "apr-2",
      status: "APPROVED",
    });

    const response = await POST(
      requestWithJson({ action: "APPROVE" }),
      routeParams("apr-2")
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.status).toBe("APPROVED");

    // Workshop status should NOT be directly updated — auto-build owns that transition
    expect(db.workshop.update).not.toHaveBeenCalled();
  });

  it("does NOT update workshop status when denying", async () => {
    (db.approvalQueue.findUnique as jest.Mock).mockResolvedValue({
      id: "apr-3",
      status: "PENDING",
      workshopId: "ws-99",
      coachId: "coach-1",
    });
    (db.approvalQueue.update as jest.Mock).mockResolvedValue({
      id: "apr-3",
      status: "DENIED",
    });

    await POST(
      requestWithJson({ action: "DENY", reason: "Not ready" }),
      routeParams("apr-3")
    );

    // Workshop status should NOT be updated on denial
    expect(db.workshop.update).not.toHaveBeenCalled();
  });

  describe("CUSTOM_PRICING approvals", () => {
    it("applies newPriceCents from requestData to workshop when approved", async () => {
      (db.approvalQueue.findUnique as jest.Mock).mockResolvedValue({
        id: "apr-cp-1",
        type: "CUSTOM_PRICING",
        status: "PENDING",
        workshopId: "ws-cp-1",
        coachId: "coach-1",
        requestData: JSON.stringify({ newPriceCents: 24900 }),
      });
      (db.approvalQueue.update as jest.Mock).mockResolvedValue({ id: "apr-cp-1", status: "APPROVED" });

      const response = await POST(
        requestWithJson({ action: "APPROVE" }),
        routeParams("apr-cp-1")
      );
      const body = await response.json();

      expect(response.status).toBe(200);
      expect(body.success).toBe(true);
      expect(db.workshop.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: "ws-cp-1" },
          data: expect.objectContaining({ priceCents: 24900, isFree: false }),
        })
      );
    });

    it("also updates pricingTierId on workshop when present in requestData", async () => {
      (db.approvalQueue.findUnique as jest.Mock).mockResolvedValue({
        id: "apr-cp-2",
        type: "CUSTOM_PRICING",
        status: "PENDING",
        workshopId: "ws-cp-2",
        coachId: "coach-1",
        requestData: JSON.stringify({ newPriceCents: 24900, pricingTierId: "tier-halfday" }),
      });
      (db.approvalQueue.update as jest.Mock).mockResolvedValue({ id: "apr-cp-2", status: "APPROVED" });

      await POST(requestWithJson({ action: "APPROVE" }), routeParams("apr-cp-2"));

      expect(db.workshop.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ pricingTierId: "tier-halfday" }),
        })
      );
    });

    it("does NOT emit Inngest event or trigger auto-build for CUSTOM_PRICING approval", async () => {
      (db.approvalQueue.findUnique as jest.Mock).mockResolvedValue({
        id: "apr-cp-3",
        type: "CUSTOM_PRICING",
        status: "PENDING",
        workshopId: "ws-cp-3",
        coachId: "coach-1",
        requestData: JSON.stringify({ newPriceCents: 24900 }),
      });
      (db.approvalQueue.update as jest.Mock).mockResolvedValue({ id: "apr-cp-3", status: "APPROVED" });

      const response = await POST(requestWithJson({ action: "APPROVE" }), routeParams("apr-cp-3"));
      const body = await response.json();

      expect(body.autoBuildTriggered).not.toBe(true);
      expect(inngest.send).not.toHaveBeenCalled();
    });
  });

  it("emits workshop/approved Inngest event when approving with workshopId", async () => {
    (db.approvalQueue.findUnique as jest.Mock).mockResolvedValue({
      id: "apr-4",
      status: "PENDING",
      workshopId: "ws-100",
      coachId: "coach-2",
    });
    (db.approvalQueue.update as jest.Mock).mockResolvedValue({
      id: "apr-4",
      status: "APPROVED",
    });

    const response = await POST(
      requestWithJson({ action: "APPROVE" }),
      routeParams("apr-4")
    );
    const body = await response.json();

    expect(body.autoBuildTriggered).toBe(true);
    expect(inngest.send).toHaveBeenCalledWith({
      name: "workshop/approved",
      data: {
        approvalId: "apr-4",
        workshopId: "ws-100",
        coachId: "coach-2",
      },
    });
  });
});
