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
  sendWorkshopApprovedEmail: jest.fn().mockResolvedValue(undefined),
  sendWorkshopDeniedEmail: jest.fn().mockResolvedValue(undefined),
  sendApprovalInfoRequestEmail: jest.fn().mockResolvedValue(undefined),
  sendCounterOfferEmail: jest.fn().mockResolvedValue(undefined),
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

import { POST } from "@/app/api/approvals/[id]/respond/route";
import { db } from "@/lib/db";
import { logAudit } from "@/lib/audit";
import { getApiActor } from "@/lib/authorization";
import { sendCounterOfferEmail } from "@/services/notifications";

function routeParams(id = "apr-1") {
  return { params: Promise.resolve({ id }) };
}

function requestWithJson(payload: unknown): Parameters<typeof POST>[0] {
  return {
    json: async () => payload,
  } as unknown as Parameters<typeof POST>[0];
}

const adminActor = {
  userId: "admin-1",
  email: "admin@example.com",
  role: "ADMIN",
  coachId: null,
};

const pendingCustomPricingApproval = {
  id: "apr-1",
  type: "CUSTOM_PRICING",
  status: "PENDING",
  coachId: "coach-1",
  workshopId: "ws-1",
  requestData: JSON.stringify({ newPriceCents: 45000 }),
  respondedBy: null,
  respondedAt: null,
};

describe("POST /api/approvals/[id]/respond — COUNTER_OFFER action", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (getApiActor as jest.Mock).mockResolvedValue(adminActor);
  });

  it("returns 403 for COACH role", async () => {
    (getApiActor as jest.Mock).mockResolvedValue({
      userId: "coach-user-1",
      email: "coach@example.com",
      role: "COACH",
      coachId: "coach-1",
    });

    const response = await POST(
      requestWithJson({ action: "COUNTER_OFFER", counterOfferCents: 40000 }),
      routeParams()
    );

    expect(response.status).toBe(403);
    expect(db.approvalQueue.update).not.toHaveBeenCalled();
  });

  it("returns 400 if counterOfferCents is missing for COUNTER_OFFER action", async () => {
    (db.approvalQueue.findUnique as jest.Mock).mockResolvedValue(pendingCustomPricingApproval);

    const response = await POST(
      requestWithJson({ action: "COUNTER_OFFER" }),
      routeParams()
    );

    expect(response.status).toBe(400);
    expect(db.approvalQueue.update).not.toHaveBeenCalled();
  });

  it("returns 400 if approval status is not PENDING", async () => {
    (db.approvalQueue.findUnique as jest.Mock).mockResolvedValue({
      ...pendingCustomPricingApproval,
      status: "COUNTER_OFFERED",
    });

    const response = await POST(
      requestWithJson({ action: "COUNTER_OFFER", counterOfferCents: 40000 }),
      routeParams()
    );
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.success).not.toBe(true);
    expect(db.approvalQueue.update).not.toHaveBeenCalled();
  });

  it("returns 400 if approval type is not CUSTOM_PRICING", async () => {
    (db.approvalQueue.findUnique as jest.Mock).mockResolvedValue({
      ...pendingCustomPricingApproval,
      type: "WORKSHOP_REQUEST",
    });

    const response = await POST(
      requestWithJson({ action: "COUNTER_OFFER", counterOfferCents: 40000 }),
      routeParams()
    );
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.success).not.toBe(true);
    expect(db.approvalQueue.update).not.toHaveBeenCalled();
  });

  it("sets status to COUNTER_OFFERED with correct fields on happy path", async () => {
    (db.approvalQueue.findUnique as jest.Mock).mockResolvedValue(pendingCustomPricingApproval);
    (db.$transaction as jest.Mock).mockImplementation(async (fn: (tx: typeof db) => Promise<unknown>) => fn(db));
    (db.approvalQueue.update as jest.Mock).mockResolvedValue({ id: "apr-1", status: "COUNTER_OFFERED" });
    (db.workshop.update as jest.Mock).mockResolvedValue({ id: "ws-1" });

    const response = await POST(
      requestWithJson({ action: "COUNTER_OFFER", counterOfferCents: 40000, counterOfferNote: "Best we can do" }),
      routeParams()
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.status).toBe("COUNTER_OFFERED");
    expect(db.approvalQueue.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "apr-1" },
        data: expect.objectContaining({
          status: "COUNTER_OFFERED",
          counterOfferCents: 40000,
          counterOfferNote: "Best we can do",
          respondedBy: "admin@example.com",
        }),
      })
    );
  });

  it("stores null counterOfferNote when not provided", async () => {
    (db.approvalQueue.findUnique as jest.Mock).mockResolvedValue(pendingCustomPricingApproval);
    (db.$transaction as jest.Mock).mockImplementation(async (fn: (tx: typeof db) => Promise<unknown>) => fn(db));
    (db.approvalQueue.update as jest.Mock).mockResolvedValue({ id: "apr-1", status: "COUNTER_OFFERED" });
    (db.workshop.update as jest.Mock).mockResolvedValue({ id: "ws-1" });

    await POST(
      requestWithJson({ action: "COUNTER_OFFER", counterOfferCents: 40000 }),
      routeParams()
    );

    expect(db.approvalQueue.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          counterOfferNote: null,
        }),
      })
    );
  });

  it("calls sendCounterOfferEmail with originalPriceCents from requestData.newPriceCents", async () => {
    (db.approvalQueue.findUnique as jest.Mock).mockResolvedValue(pendingCustomPricingApproval);
    (db.$transaction as jest.Mock).mockImplementation(async (fn: (tx: typeof db) => Promise<unknown>) => fn(db));
    (db.approvalQueue.update as jest.Mock).mockResolvedValue({ id: "apr-1" });
    (db.workshop.update as jest.Mock).mockResolvedValue({ id: "ws-1" });
    (db.coach.findUnique as jest.Mock).mockResolvedValue({
      id: "coach-1",
      email: "coach@example.com",
      firstName: "Jane",
      lastName: "Doe",
    });
    (db.workshop.findUnique as jest.Mock).mockResolvedValue({
      id: "ws-1",
      title: "Scaling Up Workshop",
    });

    await POST(
      requestWithJson({ action: "COUNTER_OFFER", counterOfferCents: 40000 }),
      routeParams()
    );

    expect(sendCounterOfferEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        coachEmail: "coach@example.com",
        workshopId: "ws-1",
        originalPriceCents: 45000,
        counterOfferCents: 40000,
      })
    );
  });

  it("calls logAudit with action COUNTER_OFFER", async () => {
    (db.approvalQueue.findUnique as jest.Mock).mockResolvedValue(pendingCustomPricingApproval);
    (db.$transaction as jest.Mock).mockImplementation(async (fn: (tx: typeof db) => Promise<unknown>) => fn(db));
    (db.approvalQueue.update as jest.Mock).mockResolvedValue({ id: "apr-1" });
    (db.workshop.update as jest.Mock).mockResolvedValue({ id: "ws-1" });

    await POST(
      requestWithJson({ action: "COUNTER_OFFER", counterOfferCents: 40000 }),
      routeParams()
    );

    expect(logAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        entityType: "ApprovalQueue",
        entityId: "apr-1",
        action: "COUNTER_OFFER",
      })
    );
  });
});
