/**
 * Fix 0: Approval Pipeline Transaction Safety Tests (RED phase)
 *
 * Tests that the approval pipeline uses db.$transaction for atomicity.
 * Currently, approvalQueue.update and inngest.send are NOT transactional.
 * These tests drive the implementation of transaction wrappers.
 */

import crypto from "crypto";

// --- Mocks (hoisted before imports) ---

jest.mock("next/server", () => {
  // Support both NextResponse.json() and new NextResponse()
  class MockNextResponse extends Response {
    static json(body: unknown, init?: ResponseInit) {
      return new Response(JSON.stringify(body), {
        status: init?.status || 200,
        headers: init?.headers,
      });
    }
  }
  return { NextResponse: MockNextResponse };
});

jest.mock("@/lib/db", () => ({
  db: {
    $transaction: jest.fn(),
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

jest.mock("@/lib/auth/authorization", () => ({
  getApiActor: jest.fn(),
  isPrivilegedRole: (role: string) => role === "ADMIN" || role === "STAFF",
}));

jest.mock("@/services/notifications", () => ({
  sendWorkshopApprovedEmail: jest.fn().mockResolvedValue(undefined),
  sendWorkshopDeniedEmail: jest.fn().mockResolvedValue(undefined),
  sendApprovalInfoRequestEmail: jest.fn().mockResolvedValue(undefined),
}));

jest.mock("@/inngest/client", () => ({
  inngest: {
    send: jest.fn().mockResolvedValue(undefined),
  },
}));

jest.mock("@/lib/auto-build-service", () => ({
  runAutoBuild: jest.fn().mockResolvedValue({
    success: true,
    pagesCreated: 0,
    templates: [],
    status: "PRE_EVENT",
    preEventWorkflow: null,
    postEventWorkflow: null,
  }),
}));

import { GET, POST } from "@/app/api/approvals/[id]/respond/route";
import { db } from "@/lib/db";
import { getApiActor } from "@/lib/auth/authorization";
import { inngest } from "@/inngest/client";

// --- Helpers ---

function routeParams(id = "apr-1") {
  return { params: Promise.resolve({ id }) };
}

function requestWithJson(payload: unknown): Parameters<typeof POST>[0] {
  return {
    json: async () => payload,
  } as unknown as Parameters<typeof POST>[0];
}

/** Compute a valid token for the GET handler using the same HMAC logic as the route */
function computeToken(approvalId: string, action: string): string {
  return crypto
    .createHmac("sha256", "test-secret")
    .update(`${approvalId}:${action}`)
    .digest("hex")
    .substring(0, 32);
}

/** Create a minimal mock request for the GET handler */
function createGetRequest(id: string, action: string, token: string) {
  const url = `http://localhost/api/approvals/${id}/respond?action=${action}&token=${token}`;
  return { url } as unknown as Parameters<typeof GET>[0];
}

// --- Tests ---

describe("Approval pipeline transaction safety", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    process.env.APPROVAL_LINK_SECRET = "test-secret";
    (getApiActor as jest.Mock).mockResolvedValue({
      userId: "admin-1",
      email: "admin@example.com",
      role: "ADMIN",
      coachId: null,
    });
    // Default: $transaction executes callback with db (pass-through)
    (db.$transaction as jest.Mock).mockImplementation(
      async (fn: (...args: unknown[]) => unknown) => fn(db)
    );
  });

  afterEach(() => {
    delete process.env.APPROVAL_LINK_SECRET;
  });

  it("POST: approval DB state persists when inngest.send throws", async () => {
    (inngest.send as jest.Mock).mockRejectedValueOnce(
      new Error("Inngest unavailable")
    );
    (db.approvalQueue.findUnique as jest.Mock).mockResolvedValue({
      id: "apr-tx-1",
      status: "PENDING",
      workshopId: "ws-tx-1",
      coachId: "coach-1",
    });
    (db.approvalQueue.update as jest.Mock).mockResolvedValue({
      id: "apr-tx-1",
      status: "APPROVED",
    });

    const response = await POST(
      requestWithJson({ action: "APPROVE" }),
      routeParams("apr-tx-1")
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.success).toBe(true);
    // Inngest backup failure doesn't break the approval — inline build still succeeded
    expect(body.success).toBe(true);
    // Approval update must happen inside a transaction for atomicity
    expect(db.$transaction).toHaveBeenCalled();
  });

  it("GET: approval persists when inngest.send throws", async () => {
    const token = computeToken("apr-tx-2", "approve");
    (inngest.send as jest.Mock).mockRejectedValueOnce(
      new Error("Inngest unavailable")
    );
    (db.approvalQueue.findUnique as jest.Mock).mockResolvedValue({
      id: "apr-tx-2",
      status: "PENDING",
      workshopId: "ws-tx-2",
      coachId: "coach-1",
    });
    (db.approvalQueue.update as jest.Mock).mockResolvedValue({
      id: "apr-tx-2",
      status: "APPROVED",
    });

    const request = createGetRequest("apr-tx-2", "approve", token);
    const response = await GET(request, routeParams("apr-tx-2"));

    // GET handler returns HTML on success — status 200
    expect(response.status).toBe(200);
    expect(db.approvalQueue.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "apr-tx-2" },
        data: expect.objectContaining({ status: "APPROVED" }),
      })
    );
    // Must use transaction for atomicity
    expect(db.$transaction).toHaveBeenCalled();
  });

  it("POST: APPROVE path uses db.$transaction for atomicity", async () => {
    (db.approvalQueue.findUnique as jest.Mock).mockResolvedValue({
      id: "apr-tx-3",
      status: "PENDING",
      workshopId: "ws-tx-3",
      coachId: "coach-1",
    });
    (db.approvalQueue.update as jest.Mock).mockResolvedValue({
      id: "apr-tx-3",
      status: "APPROVED",
    });

    await POST(
      requestWithJson({ action: "APPROVE" }),
      routeParams("apr-tx-3")
    );

    // The approval status update must be wrapped in a transaction
    expect(db.$transaction).toHaveBeenCalled();
  });

  it("POST: INFO_REQUESTED wraps both updates in a single transaction", async () => {
    (db.approvalQueue.findUnique as jest.Mock).mockResolvedValue({
      id: "apr-tx-4",
      status: "PENDING",
      workshopId: "ws-tx-4",
      coachId: "coach-1",
    });
    // Mock $transaction to execute callback with a mock tx client
    const txMocks = {
      approvalQueue: {
        update: jest.fn().mockResolvedValue({
          id: "apr-tx-4",
          status: "INFO_REQUESTED",
        }),
      },
      workshop: {
        update: jest.fn().mockResolvedValue({
          id: "ws-tx-4",
          status: "INFO_REQUESTED",
        }),
      },
      approvalMessage: {
        create: jest.fn().mockResolvedValue({ id: "msg-1", from: "ADMIN", text: "Need more details", createdAt: new Date() }),
      },
    };
    (db.$transaction as jest.Mock).mockImplementation(
      async (fn: (...args: unknown[]) => unknown) => fn(txMocks)
    );

    const response = await POST(
      requestWithJson({ action: "INFO_REQUESTED", reason: "Need more details" }),
      routeParams("apr-tx-4")
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.success).toBe(true);
    // Must use a transaction
    expect(db.$transaction).toHaveBeenCalled();
    // Both updates must happen inside the transaction
    expect(txMocks.approvalQueue.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: "INFO_REQUESTED" }),
      })
    );
    expect(txMocks.workshop.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: "INFO_REQUESTED" }),
      })
    );
  });
});
