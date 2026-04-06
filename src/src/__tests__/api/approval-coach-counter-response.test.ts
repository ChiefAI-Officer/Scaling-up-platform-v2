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
  sendApprovalCoachRespondedEmail: jest.fn().mockResolvedValue(undefined),
  sendCounterOfferAcceptedEmail: jest.fn().mockResolvedValue(undefined),
  sendCoachDeclinedCounterEmail: jest.fn().mockResolvedValue(undefined),
}));

jest.mock("@/lib/rate-limit", () => ({
  withRateLimit: jest.fn().mockResolvedValue({ allowed: true, headers: {} }),
  RateLimits: { standard: "standard" },
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

import { POST } from "@/app/api/approvals/[id]/coach-response/route";
import { db } from "@/lib/db";
import { logAudit } from "@/lib/audit";
import { getApiActor } from "@/lib/authorization";
import {
  sendCounterOfferAcceptedEmail,
  sendCoachDeclinedCounterEmail,
  sendApprovalCoachRespondedEmail,
} from "@/services/notifications";
import { runAutoBuild } from "@/lib/auto-build-service";
import { inngest } from "@/inngest/client";

function routeParams(id = "apr-1") {
  return { params: Promise.resolve({ id }) };
}

function requestWithJson(payload: unknown): Parameters<typeof POST>[0] {
  return {
    json: async () => payload,
    headers: new Headers({ "content-type": "application/json" }),
    url: "http://localhost/api/approvals/apr-1/coach-response",
  } as unknown as Parameters<typeof POST>[0];
}

const coachActor = {
  userId: "coach-user-1",
  email: "coach@example.com",
  role: "COACH",
  coachId: "coach-1",
};

const counterOfferedApproval = {
  id: "apr-1",
  type: "CUSTOM_PRICING",
  status: "COUNTER_OFFERED",
  coachId: "coach-1",
  workshopId: "ws-1",
  requestData: JSON.stringify({ newPriceCents: 50000 }),
  counterOfferCents: 40000,
  counterOfferNote: "Best we can do",
};

const infoRequestedApproval = {
  id: "apr-1",
  type: "CUSTOM_PRICING",
  status: "INFO_REQUESTED",
  coachId: "coach-1",
  workshopId: "ws-1",
  requestData: JSON.stringify({}),
  counterOfferCents: null,
  counterOfferNote: null,
};

describe("POST /api/approvals/[id]/coach-response — counter-offer actions", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (getApiActor as jest.Mock).mockResolvedValue(coachActor);
  });

  describe("ACCEPT_COUNTER", () => {
    it("returns 403 if coach does not own the approval", async () => {
      (db.approvalQueue.findUnique as jest.Mock).mockResolvedValue({
        ...counterOfferedApproval,
        coachId: "other-coach",
      });

      const response = await POST(requestWithJson({ action: "ACCEPT_COUNTER" }), routeParams());

      expect(response.status).toBe(403);
    });

    it("returns 400 when approval is not COUNTER_OFFERED", async () => {
      (db.approvalQueue.findUnique as jest.Mock).mockResolvedValue({
        ...counterOfferedApproval,
        status: "PENDING",
      });

      const response = await POST(requestWithJson({ action: "ACCEPT_COUNTER" }), routeParams());
      const body = await response.json();

      expect(response.status).toBe(400);
      expect(body.success).not.toBe(true);
    });

    it("applies counterOfferCents to workshop.priceCents", async () => {
      (db.approvalQueue.findUnique as jest.Mock).mockResolvedValue(counterOfferedApproval);
      (db.$transaction as jest.Mock).mockImplementation(async (fn: (tx: typeof db) => Promise<unknown>) => fn(db));
      (db.approvalQueue.update as jest.Mock).mockResolvedValue({ id: "apr-1", status: "APPROVED" });
      (db.workshop.update as jest.Mock).mockResolvedValue({ id: "ws-1", priceCents: 40000 });
      (db.workshop.findUnique as jest.Mock).mockResolvedValue({ id: "ws-1", status: "AWAITING_APPROVAL" });

      await POST(requestWithJson({ action: "ACCEPT_COUNTER" }), routeParams());

      expect(db.workshop.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: "ws-1" },
          data: expect.objectContaining({ priceCents: 40000, isFree: false }),
        })
      );
    });

    it("sets approval to APPROVED and clears counter fields", async () => {
      (db.approvalQueue.findUnique as jest.Mock).mockResolvedValue(counterOfferedApproval);
      (db.$transaction as jest.Mock).mockImplementation(async (fn: (tx: typeof db) => Promise<unknown>) => fn(db));
      (db.approvalQueue.update as jest.Mock).mockResolvedValue({ id: "apr-1", status: "APPROVED" });
      (db.workshop.update as jest.Mock).mockResolvedValue({ id: "ws-1", priceCents: 40000 });
      (db.workshop.findUnique as jest.Mock).mockResolvedValue({ id: "ws-1", status: "AWAITING_APPROVAL" });

      await POST(requestWithJson({ action: "ACCEPT_COUNTER" }), routeParams());

      expect(db.approvalQueue.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            status: "APPROVED",
            counterOfferCents: null,
            counterOfferNote: null,
          }),
        })
      );
    });

    it("calls logAudit with ACCEPT_COUNTER", async () => {
      (db.approvalQueue.findUnique as jest.Mock).mockResolvedValue(counterOfferedApproval);
      (db.$transaction as jest.Mock).mockImplementation(async (fn: (tx: typeof db) => Promise<unknown>) => fn(db));
      (db.approvalQueue.update as jest.Mock).mockResolvedValue({ id: "apr-1" });
      (db.workshop.update as jest.Mock).mockResolvedValue({ id: "ws-1" });
      (db.workshop.findUnique as jest.Mock).mockResolvedValue({ id: "ws-1", status: "AWAITING_APPROVAL" });

      await POST(requestWithJson({ action: "ACCEPT_COUNTER" }), routeParams());

      expect(logAudit).toHaveBeenCalledWith(
        expect.objectContaining({ action: "ACCEPT_COUNTER", entityId: "apr-1" })
      );
    });

    it("sends sendCounterOfferAcceptedEmail to admin", async () => {
      (db.approvalQueue.findUnique as jest.Mock).mockResolvedValue(counterOfferedApproval);
      (db.$transaction as jest.Mock).mockImplementation(async (fn: (tx: typeof db) => Promise<unknown>) => fn(db));
      (db.approvalQueue.update as jest.Mock).mockResolvedValue({ id: "apr-1" });
      (db.workshop.update as jest.Mock).mockResolvedValue({ id: "ws-1" });
      (db.workshop.findUnique as jest.Mock).mockResolvedValue({ id: "ws-1", status: "AWAITING_APPROVAL" });
      (db.coach.findUnique as jest.Mock).mockResolvedValue({ id: "coach-1", firstName: "Jane", lastName: "Doe" });

      await POST(requestWithJson({ action: "ACCEPT_COUNTER" }), routeParams());

      expect(sendCounterOfferAcceptedEmail).toHaveBeenCalledWith(
        expect.objectContaining({
          approvalId: "apr-1",
          acceptedPriceCents: 40000,
        })
      );
    });

    it("triggers auto-build when workshop is in pre-build status", async () => {
      (db.approvalQueue.findUnique as jest.Mock).mockResolvedValue(counterOfferedApproval);
      (db.$transaction as jest.Mock).mockImplementation(async (fn: (tx: typeof db) => Promise<unknown>) => fn(db));
      (db.approvalQueue.update as jest.Mock).mockResolvedValue({ id: "apr-1" });
      (db.workshop.update as jest.Mock).mockResolvedValue({ id: "ws-1" });
      (db.workshop.findUnique as jest.Mock).mockResolvedValue({ id: "ws-1", status: "AWAITING_APPROVAL" });

      await POST(requestWithJson({ action: "ACCEPT_COUNTER" }), routeParams());

      expect(runAutoBuild).toHaveBeenCalledWith("ws-1");
      expect(inngest.send).toHaveBeenCalledWith(
        expect.objectContaining({ name: "workshop/approved" })
      );
    });

    it("returns 409 when approval is not COUNTER_OFFERED (race condition guard)", async () => {
      (db.approvalQueue.findUnique as jest.Mock).mockResolvedValue({
        ...counterOfferedApproval,
        status: "APPROVED",
      });

      const response = await POST(requestWithJson({ action: "ACCEPT_COUNTER" }), routeParams());

      expect(response.status).toBe(400);
    });
  });

  describe("DECLINE_COUNTER", () => {
    it("returns 400 when approval is not COUNTER_OFFERED (race condition guard)", async () => {
      (db.approvalQueue.findUnique as jest.Mock).mockResolvedValue({
        ...counterOfferedApproval,
        status: "PENDING",
      });

      const response = await POST(requestWithJson({ action: "DECLINE_COUNTER" }), routeParams());
      const body = await response.json();

      expect(response.status).toBe(400);
      expect(body.success).not.toBe(true);
    });

    it("sets status to DENIED and clears counter fields when no newPriceCents", async () => {
      (db.approvalQueue.findUnique as jest.Mock).mockResolvedValue(counterOfferedApproval);
      (db.approvalQueue.update as jest.Mock).mockResolvedValue({ id: "apr-1", status: "DENIED" });

      await POST(requestWithJson({ action: "DECLINE_COUNTER" }), routeParams());

      expect(db.approvalQueue.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            status: "DENIED",
            counterOfferCents: null,
            counterOfferNote: null,
          }),
        })
      );
    });

    it("calls sendCoachDeclinedCounterEmail without newPriceCents when declining finally", async () => {
      (db.approvalQueue.findUnique as jest.Mock).mockResolvedValue(counterOfferedApproval);
      (db.approvalQueue.update as jest.Mock).mockResolvedValue({ id: "apr-1" });
      (db.coach.findUnique as jest.Mock).mockResolvedValue({ id: "coach-1", firstName: "Jane", lastName: "Doe" });
      (db.workshop.findUnique as jest.Mock).mockResolvedValue({ id: "ws-1", title: "Workshop" });

      await POST(requestWithJson({ action: "DECLINE_COUNTER" }), routeParams());

      expect(sendCoachDeclinedCounterEmail).toHaveBeenCalledWith(
        expect.objectContaining({ approvalId: "apr-1" })
      );
      const call = (sendCoachDeclinedCounterEmail as jest.Mock).mock.calls[0][0];
      expect(call.newPriceCents).toBeUndefined();
    });

    it("updates requestData.newPriceCents and resets to PENDING when declining with new price", async () => {
      (db.approvalQueue.findUnique as jest.Mock).mockResolvedValue(counterOfferedApproval);
      (db.approvalQueue.update as jest.Mock).mockResolvedValue({ id: "apr-1", status: "PENDING" });

      await POST(requestWithJson({ action: "DECLINE_COUNTER", newPriceCents: 42000 }), routeParams());

      expect(db.approvalQueue.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            status: "PENDING",
            counterOfferCents: null,
            counterOfferNote: null,
            requestData: expect.stringContaining("42000"),
          }),
        })
      );
    });

    it("calls sendCoachDeclinedCounterEmail with newPriceCents when declining with counter", async () => {
      (db.approvalQueue.findUnique as jest.Mock).mockResolvedValue(counterOfferedApproval);
      (db.approvalQueue.update as jest.Mock).mockResolvedValue({ id: "apr-1" });
      (db.coach.findUnique as jest.Mock).mockResolvedValue({ id: "coach-1", firstName: "Jane", lastName: "Doe" });
      (db.workshop.findUnique as jest.Mock).mockResolvedValue({ id: "ws-1", title: "Workshop" });

      await POST(requestWithJson({ action: "DECLINE_COUNTER", newPriceCents: 42000 }), routeParams());

      expect(sendCoachDeclinedCounterEmail).toHaveBeenCalledWith(
        expect.objectContaining({ newPriceCents: 42000 })
      );
    });
  });

  describe("INFO_RESPONSE (regression)", () => {
    it("preserves existing INFO_REQUESTED behavior", async () => {
      (db.approvalQueue.findUnique as jest.Mock).mockResolvedValue(infoRequestedApproval);
      (db.approvalQueue.update as jest.Mock).mockResolvedValue({ id: "apr-1", status: "PENDING" });
      (db.workshop.update as jest.Mock).mockResolvedValue({ id: "ws-1" });
      (db.coach.findUnique as jest.Mock).mockResolvedValue({ id: "coach-1", firstName: "Jane", lastName: "Doe" });
      (db.workshop.findUnique as jest.Mock).mockResolvedValue({ id: "ws-1", title: "Workshop" });

      const response = await POST(
        requestWithJson({ action: "INFO_RESPONSE", response: "Here is my answer" }),
        routeParams()
      );
      const body = await response.json();

      expect(response.status).toBe(200);
      expect(body.success).toBe(true);
      expect(db.approvalQueue.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ coachResponse: "Here is my answer", status: "PENDING" }),
        })
      );
      expect(sendApprovalCoachRespondedEmail).toHaveBeenCalled();
    });
  });

  describe("Invalid action", () => {
    it("returns 400 for invalid action", async () => {
      (db.approvalQueue.findUnique as jest.Mock).mockResolvedValue(counterOfferedApproval);

      const response = await POST(requestWithJson({ action: "INVALID_ACTION" }), routeParams());

      expect(response.status).toBe(400);
    });
  });
});
