/* eslint-disable @typescript-eslint/no-explicit-any */

/**
 * Cycle 5-7: Approval routes call runAutoBuild inline on approval.
 */

// --- Mocks (hoisted before imports) ---

jest.mock("next/server", () => {
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

jest.mock("@/lib/authorization", () => ({
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
  runAutoBuild: jest.fn(),
}));

// --- Imports (after mocks) ---

import { GET, POST } from "@/app/api/approvals/[id]/respond/route";
import { db } from "@/lib/db";
import { getApiActor } from "@/lib/authorization";
import { runAutoBuild } from "@/lib/auto-build-service";
import crypto from "crypto";

// --- Helpers ---

function routeParams(id = "apr-1") {
  return { params: Promise.resolve({ id }) };
}

function requestWithJson(payload: unknown): Parameters<typeof POST>[0] {
  return {
    json: async () => payload,
  } as unknown as Parameters<typeof POST>[0];
}

function setupApprovalScenario() {
  (getApiActor as jest.Mock).mockResolvedValue({
    id: "admin-1",
    email: "admin@example.com",
    role: "ADMIN",
  });

  const approval = {
    id: "apr-1",
    status: "PENDING",
    type: "WORKSHOP_REQUEST",
    coachId: "coach-1",
    workshopId: "ws-1",
  };

  (db.$transaction as jest.Mock).mockImplementation(async (fn: (...args: unknown[]) => unknown) => {
    const tx = {
      approvalQueue: db.approvalQueue,
      workshop: db.workshop,
      coach: db.coach,
    };
    return fn(tx);
  });

  (db.approvalQueue.findUnique as jest.Mock).mockResolvedValue(approval);
  (db.approvalQueue.update as jest.Mock).mockResolvedValue({ ...approval, status: "APPROVED" });
  (db.workshop.findUnique as jest.Mock).mockResolvedValue({ title: "Test Workshop" });
  (db.workshop.update as jest.Mock).mockResolvedValue({});
  (db.coach.findUnique as jest.Mock).mockResolvedValue(null);
}

// --- Tests ---

describe("Approval inline auto-build", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  // Cycle 5
  it("POST approval calls runAutoBuild inline and returns pagesCreated", async () => {
    setupApprovalScenario();
    (runAutoBuild as jest.Mock).mockResolvedValue({
      success: true,
      pagesCreated: 3,
      templates: ["SOLO_LANDING", "REGISTRATION", "THANK_YOU"],
      status: "PRE_EVENT",
      preEventWorkflow: null,
      postEventWorkflow: null,
    });

    const req = requestWithJson({ action: "APPROVE" });
    const res = await POST(req, routeParams("apr-1"));
    const body = await res.json();

    expect(runAutoBuild).toHaveBeenCalledWith("ws-1");
    expect(body.success).toBe(true);
    expect(body.pagesCreated).toBe(3);
    expect(body.workshopStatus).toBe("PRE_EVENT");
  });

  // Cycle 7a: GET (email-link) approval calls runAutoBuild inline
  it("GET (email-link) approval calls runAutoBuild inline", async () => {
    process.env.APPROVAL_LINK_SECRET = "test-secret";

    const approval = {
      id: "apr-get-1",
      status: "PENDING",
      type: "WORKSHOP_REQUEST",
      coachId: "coach-1",
      workshopId: "ws-get-1",
    };

    (db.approvalQueue.findUnique as jest.Mock).mockResolvedValue(approval);
    (db.$transaction as jest.Mock).mockImplementation(async (fn: (...args: unknown[]) => unknown) => {
      const tx = {
        approvalQueue: db.approvalQueue,
        workshop: db.workshop,
        coach: db.coach,
      };
      return fn(tx);
    });
    (db.approvalQueue.update as jest.Mock).mockResolvedValue({ ...approval, status: "APPROVED" });
    (db.coach.findUnique as jest.Mock).mockResolvedValue({
      email: "coach@example.com",
      firstName: "John",
      lastName: "Smith",
    });
    (db.workshop.findUnique as jest.Mock).mockResolvedValue({ title: "Test Workshop" });
    (runAutoBuild as jest.Mock).mockResolvedValue({
      success: true,
      pagesCreated: 2,
      templates: ["SOLO_LANDING", "REGISTRATION"],
      status: "PRE_EVENT",
      preEventWorkflow: null,
      postEventWorkflow: null,
    });

    const token = crypto
      .createHmac("sha256", "test-secret")
      .update("apr-get-1:approve")
      .digest("hex")
      .substring(0, 32);

    const url = `http://localhost/api/approvals/apr-get-1/respond?action=approve&token=${token}`;
    const req = { url } as unknown as Parameters<typeof GET>[0];
    const res = await GET(req, { params: Promise.resolve({ id: "apr-get-1" }) });

    expect(res.status).toBe(200);
    expect(runAutoBuild).toHaveBeenCalledWith("ws-get-1");

    delete process.env.APPROVAL_LINK_SECRET;
  });

  // Cycle 6
  it("POST approval returns success even when runAutoBuild throws", async () => {
    setupApprovalScenario();
    (runAutoBuild as jest.Mock).mockRejectedValue(new Error("DB connection failed"));

    const req = requestWithJson({ action: "APPROVE" });
    const res = await POST(req, routeParams("apr-1"));
    const body = await res.json();

    expect(body.success).toBe(true);
    expect(body.status).toBe("APPROVED");
    expect(body.autoBuildError).toBeDefined();
  });
});
