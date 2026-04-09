/* eslint-disable @typescript-eslint/no-explicit-any */

/**
 * Cycle 3: Approval response surfaces autoBuildError (RED phase)
 *
 * When inngest.send fails during workshop approval, the response should
 * include `autoBuildError` so the admin knows auto-build didn't trigger.
 */

import crypto from "crypto";

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
    send: jest.fn(),
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

import { POST } from "@/app/api/approvals/[id]/respond/route";
import { db } from "@/lib/db";
import { getApiActor } from "@/lib/auth/authorization";
import { inngest } from "@/inngest/client";
import { runAutoBuild } from "@/lib/auto-build-service";

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
    workshopTitle: "Test Workshop",
  };

  // Transaction mock — pass a tx proxy that has the same methods as db
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
  (db.coach.findUnique as jest.Mock).mockResolvedValue(null); // skip email
}

describe("Approval response autoBuildError", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("includes autoBuildError when runAutoBuild throws", async () => {
    setupApprovalScenario();

    // Make runAutoBuild throw — inline build failure
    (runAutoBuild as jest.Mock).mockRejectedValueOnce(new Error("DB connection failed"));

    const req = requestWithJson({ action: "APPROVE" });
    const res = await POST(req, routeParams("apr-1"));
    const body = await res.json();

    expect(body.success).toBe(true);
    expect(body.status).toBe("APPROVED");
    expect(body.autoBuildError).toBeDefined();
  });
});
