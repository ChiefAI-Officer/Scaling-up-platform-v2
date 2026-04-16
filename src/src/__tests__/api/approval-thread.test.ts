/**
 * Tests for ApprovalMessage thread feature.
 * Covers:
 *   - INFO_REQUESTED action creates an ApprovalMessage with from="ADMIN"
 *   - coach-response INFO_RESPONSE creates an ApprovalMessage with from="COACH"
 *   - Messages grow with each exchange (2 admin + 2 coach = 4 messages)
 */

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
    $transaction: jest.fn(),
    approvalQueue: {
      findUnique: jest.fn(),
      update: jest.fn(),
    },
    approvalMessage: {
      create: jest.fn().mockResolvedValue({ id: "msg-1", from: "ADMIN", text: "Need more info", createdAt: new Date() }),
      findMany: jest.fn().mockResolvedValue([]),
    },
    coach: {
      findUnique: jest.fn().mockResolvedValue(null),
    },
    workshop: {
      findUnique: jest.fn().mockResolvedValue(null),
      update: jest.fn(),
      updateMany: jest.fn().mockResolvedValue({ count: 0 }),
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
  sendApprovalCoachRespondedEmail: jest.fn().mockResolvedValue(undefined),
  sendCounterOfferEmail: jest.fn().mockResolvedValue(undefined),
  sendCounterOfferAcceptedEmail: jest.fn().mockResolvedValue(undefined),
  sendCoachDeclinedCounterEmail: jest.fn().mockResolvedValue(undefined),
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

jest.mock("@/lib/rate-limit", () => ({
  withRateLimit: jest.fn().mockResolvedValue({ allowed: true, headers: {} }),
  RateLimits: { standard: "standard" },
}));

import { POST as respondPOST } from "@/app/api/approvals/[id]/respond/route";
import { POST as coachResponsePOST } from "@/app/api/approvals/[id]/coach-response/route";
import { db } from "@/lib/db";
import { getApiActor } from "@/lib/auth/authorization";

function routeParams(id = "apr-1") {
  return { params: Promise.resolve({ id }) };
}

function adminRequest(payload: unknown): Parameters<typeof respondPOST>[0] {
  return {
    json: async () => payload,
  } as unknown as Parameters<typeof respondPOST>[0];
}

function coachRequest(payload: unknown): Parameters<typeof coachResponsePOST>[0] {
  return {
    json: async () => payload,
    headers: new Headers({ "content-type": "application/json" }),
    url: "http://localhost/api/approvals/apr-1/coach-response",
  } as unknown as Parameters<typeof coachResponsePOST>[0];
}

const adminActor = {
  userId: "admin-user-1",
  email: "admin@example.com",
  role: "ADMIN",
  coachId: null,
};

const coachActor = {
  userId: "coach-user-1",
  email: "coach@example.com",
  role: "COACH",
  coachId: "coach-1",
};

describe("ApprovalMessage thread", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Default $transaction pass-through: execute callback with db as tx client
    (db.$transaction as jest.Mock).mockImplementation(
      async (fn: (...args: unknown[]) => unknown) => fn(db)
    );
  });

  describe("INFO_REQUESTED action creates ADMIN message", () => {
    it("creates an ApprovalMessage with from='ADMIN' when INFO_REQUESTED is sent", async () => {
      (getApiActor as jest.Mock).mockResolvedValue(adminActor);
      (db.approvalQueue.findUnique as jest.Mock).mockResolvedValue({
        id: "apr-1",
        type: "WORKSHOP_REQUEST",
        status: "PENDING",
        coachId: "coach-1",
        workshopId: "ws-1",
      });
      (db.approvalQueue.update as jest.Mock).mockResolvedValue({
        id: "apr-1",
        status: "INFO_REQUESTED",
      });
      (db.workshop.update as jest.Mock).mockResolvedValue({ id: "ws-1" });

      const response = await respondPOST(
        adminRequest({ action: "INFO_REQUESTED", reason: "Please provide more details about the venue." }),
        routeParams("apr-1")
      );
      const body = await response.json();

      expect(response.status).toBe(200);
      expect(body.success).toBe(true);
      expect(body.status).toBe("INFO_REQUESTED");

      // An ADMIN ApprovalMessage should be created
      expect(db.approvalMessage.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            approvalId: "apr-1",
            from: "ADMIN",
            text: "Please provide more details about the venue.",
          }),
        })
      );
    });

    it("creates ADMIN message with empty text when no reason provided", async () => {
      (getApiActor as jest.Mock).mockResolvedValue(adminActor);
      (db.approvalQueue.findUnique as jest.Mock).mockResolvedValue({
        id: "apr-2",
        type: "WORKSHOP_REQUEST",
        status: "PENDING",
        coachId: "coach-1",
        workshopId: "ws-2",
      });
      (db.approvalQueue.update as jest.Mock).mockResolvedValue({
        id: "apr-2",
        status: "INFO_REQUESTED",
      });
      (db.workshop.update as jest.Mock).mockResolvedValue({ id: "ws-2" });

      await respondPOST(
        adminRequest({ action: "INFO_REQUESTED" }),
        routeParams("apr-2")
      );

      expect(db.approvalMessage.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            approvalId: "apr-2",
            from: "ADMIN",
            text: "",
          }),
        })
      );
    });
  });

  describe("INFO_RESPONSE coach action creates COACH message", () => {
    it("creates an ApprovalMessage with from='COACH' when coach submits INFO_RESPONSE", async () => {
      (getApiActor as jest.Mock).mockResolvedValue(coachActor);
      (db.approvalQueue.findUnique as jest.Mock).mockResolvedValue({
        id: "apr-1",
        type: "WORKSHOP_REQUEST",
        status: "INFO_REQUESTED",
        coachId: "coach-1",
        workshopId: "ws-1",
        counterOfferCents: null,
        counterOfferNote: null,
        requestData: "{}",
      });
      (db.approvalQueue.update as jest.Mock).mockResolvedValue({
        id: "apr-1",
        status: "PENDING",
      });
      (db.workshop.update as jest.Mock).mockResolvedValue({ id: "ws-1" });

      const response = await coachResponsePOST(
        coachRequest({ action: "INFO_RESPONSE", response: "The venue is at 123 Main St." }),
        routeParams("apr-1")
      );
      const body = await response.json();

      expect(response.status).toBe(200);
      expect(body.success).toBe(true);

      // A COACH ApprovalMessage should be created
      expect(db.approvalMessage.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            approvalId: "apr-1",
            from: "COACH",
            text: "The venue is at 123 Main St.",
          }),
        })
      );
    });
  });

  describe("Multi-round exchange accumulates messages", () => {
    it("creates separate messages for each exchange (simulated 2 admin + 2 coach = 4 messages)", async () => {
      // Round 1: Admin sends INFO_REQUESTED
      (getApiActor as jest.Mock).mockResolvedValue(adminActor);
      (db.approvalQueue.findUnique as jest.Mock).mockResolvedValue({
        id: "apr-thread",
        type: "WORKSHOP_REQUEST",
        status: "PENDING",
        coachId: "coach-1",
        workshopId: "ws-thread",
      });
      (db.approvalQueue.update as jest.Mock).mockResolvedValue({ id: "apr-thread", status: "INFO_REQUESTED" });
      (db.workshop.update as jest.Mock).mockResolvedValue({ id: "ws-thread" });

      await respondPOST(
        adminRequest({ action: "INFO_REQUESTED", reason: "First admin question" }),
        routeParams("apr-thread")
      );

      // Round 2: Coach responds
      (getApiActor as jest.Mock).mockResolvedValue(coachActor);
      (db.approvalQueue.findUnique as jest.Mock).mockResolvedValue({
        id: "apr-thread",
        type: "WORKSHOP_REQUEST",
        status: "INFO_REQUESTED",
        coachId: "coach-1",
        workshopId: "ws-thread",
        counterOfferCents: null,
        counterOfferNote: null,
        requestData: "{}",
      });
      (db.approvalQueue.update as jest.Mock).mockResolvedValue({ id: "apr-thread", status: "PENDING" });

      await coachResponsePOST(
        coachRequest({ action: "INFO_RESPONSE", response: "Coach answer 1" }),
        routeParams("apr-thread")
      );

      // Round 3: Admin sends another INFO_REQUESTED
      (getApiActor as jest.Mock).mockResolvedValue(adminActor);
      (db.approvalQueue.findUnique as jest.Mock).mockResolvedValue({
        id: "apr-thread",
        type: "WORKSHOP_REQUEST",
        status: "PENDING",
        coachId: "coach-1",
        workshopId: "ws-thread",
      });
      (db.approvalQueue.update as jest.Mock).mockResolvedValue({ id: "apr-thread", status: "INFO_REQUESTED" });

      await respondPOST(
        adminRequest({ action: "INFO_REQUESTED", reason: "Second admin question" }),
        routeParams("apr-thread")
      );

      // Round 4: Coach responds again
      (getApiActor as jest.Mock).mockResolvedValue(coachActor);
      (db.approvalQueue.findUnique as jest.Mock).mockResolvedValue({
        id: "apr-thread",
        type: "WORKSHOP_REQUEST",
        status: "INFO_REQUESTED",
        coachId: "coach-1",
        workshopId: "ws-thread",
        counterOfferCents: null,
        counterOfferNote: null,
        requestData: "{}",
      });
      (db.approvalQueue.update as jest.Mock).mockResolvedValue({ id: "apr-thread", status: "PENDING" });

      await coachResponsePOST(
        coachRequest({ action: "INFO_RESPONSE", response: "Coach answer 2" }),
        routeParams("apr-thread")
      );

      // Expect exactly 4 calls to approvalMessage.create
      const calls = (db.approvalMessage.create as jest.Mock).mock.calls;
      expect(calls).toHaveLength(4);

      // Verify the from values alternate ADMIN, COACH, ADMIN, COACH
      expect(calls[0][0].data.from).toBe("ADMIN");
      expect(calls[0][0].data.text).toBe("First admin question");

      expect(calls[1][0].data.from).toBe("COACH");
      expect(calls[1][0].data.text).toBe("Coach answer 1");

      expect(calls[2][0].data.from).toBe("ADMIN");
      expect(calls[2][0].data.text).toBe("Second admin question");

      expect(calls[3][0].data.from).toBe("COACH");
      expect(calls[3][0].data.text).toBe("Coach answer 2");
    });
  });
});
