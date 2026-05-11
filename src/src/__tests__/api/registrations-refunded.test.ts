/**
 * Q-MAY6-1 + Round 2 H1 + M2 + Round 3 H2: POST /api/registrations/[id]/refunded.
 *
 * Marks a paid registration as refunded after operator has processed the
 * refund manually in Stripe dashboard. Eligibility-guarded atomic flip:
 * - Required `stripeRefundId` (re_...) as evidence
 * - paymentStatus = COMPLETED → REFUNDED (so Financials stops counting)
 * - Guard: registration must not be already refunded
 * - Guard: workshop must still be CANCELED (reinstated workshop rejects)
 * - 409 when row is ineligible (stale tab, double-click, reinstated)
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

jest.mock("@/lib/auth/authorization", () => ({
  getApiActor: jest.fn(),
  isPrivilegedRole: jest.fn((role: string) => role === "ADMIN" || role === "STAFF"),
}));

jest.mock("@/lib/db", () => ({
  db: {
    registration: {
      updateMany: jest.fn(),
      findUnique: jest.fn(),
    },
    auditLog: {
      create: jest.fn(),
    },
  },
}));

import { getApiActor } from "@/lib/auth/authorization";
import { db } from "@/lib/db";
import { POST } from "@/app/api/registrations/[id]/refunded/route";

function buildRequest(body: unknown): Request {
  return new Request("http://localhost/api/registrations/r1/refunded", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

const ctx = { params: Promise.resolve({ id: "r1" }) };

const adminActor = {
  userId: "u-admin",
  email: "admin@example.com",
  role: "ADMIN" as const,
  coachId: null,
};

const staffActor = {
  userId: "u-staff",
  email: "staff@example.com",
  role: "STAFF" as const,
  coachId: null,
};

const coachActor = {
  userId: "u-coach",
  email: "coach@example.com",
  role: "COACH" as const,
  coachId: "c1",
};

describe("POST /api/registrations/[id]/refunded", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (db.registration.updateMany as jest.Mock).mockResolvedValue({ count: 1 });
    (db.auditLog.create as jest.Mock).mockResolvedValue({});
  });

  it("returns 401 when unauthenticated", async () => {
    (getApiActor as jest.Mock).mockResolvedValue(null);
    const res = await POST(
      buildRequest({ stripeRefundId: "re_1abc234DefGhiJk" }),
      ctx,
    );
    expect(res.status).toBe(401);
    expect(db.registration.updateMany).not.toHaveBeenCalled();
  });

  it("returns 403 when actor is a coach", async () => {
    (getApiActor as jest.Mock).mockResolvedValue(coachActor);
    const res = await POST(
      buildRequest({ stripeRefundId: "re_1abc234DefGhiJk" }),
      ctx,
    );
    expect(res.status).toBe(403);
    expect(db.registration.updateMany).not.toHaveBeenCalled();
  });

  it("returns 400 when stripeRefundId is missing", async () => {
    (getApiActor as jest.Mock).mockResolvedValue(adminActor);
    const res = await POST(buildRequest({}), ctx);
    expect(res.status).toBe(400);
    expect(db.registration.updateMany).not.toHaveBeenCalled();
  });

  it("returns 400 when stripeRefundId is malformed", async () => {
    (getApiActor as jest.Mock).mockResolvedValue(adminActor);
    const res = await POST(buildRequest({ stripeRefundId: "asdf" }), ctx);
    expect(res.status).toBe(400);
    expect(db.registration.updateMany).not.toHaveBeenCalled();
  });

  it("admin can mark a paid+canceled registration refunded (200, flips paymentStatus)", async () => {
    (getApiActor as jest.Mock).mockResolvedValue(adminActor);

    const res = await POST(
      buildRequest({ stripeRefundId: "re_1abc234DefGhiJk" }),
      ctx,
    );

    expect(res.status).toBe(200);
    expect(db.registration.updateMany).toHaveBeenCalledTimes(1);
    const call = (db.registration.updateMany as jest.Mock).mock.calls[0][0];

    // Eligibility-guarded WHERE — Round 2 M2
    expect(call.where).toMatchObject({
      id: "r1",
      paymentStatus: "COMPLETED",
      refundedAt: null,
      workshop: { status: "CANCELED" },
    });

    // Flips paymentStatus to REFUNDED so Financials stops counting (Round 2 H1)
    // and persists evidence (Round 3 H2).
    expect(call.data).toMatchObject({
      paymentStatus: "REFUNDED",
      refundedBy: "u-admin",
      stripeRefundId: "re_1abc234DefGhiJk",
    });
    expect(call.data.refundedAt).toBeInstanceOf(Date);
  });

  it("staff can mark refunded (STAFF role passes the gate)", async () => {
    (getApiActor as jest.Mock).mockResolvedValue(staffActor);

    const res = await POST(
      buildRequest({ stripeRefundId: "re_1abc234DefGhiJk" }),
      ctx,
    );

    expect(res.status).toBe(200);
    expect(db.registration.updateMany).toHaveBeenCalledTimes(1);
  });

  it("returns 409 when registration is not eligible (already refunded / not paid / workshop reinstated)", async () => {
    (getApiActor as jest.Mock).mockResolvedValue(adminActor);
    (db.registration.updateMany as jest.Mock).mockResolvedValue({ count: 0 });

    const res = await POST(
      buildRequest({ stripeRefundId: "re_1abc234DefGhiJk" }),
      ctx,
    );

    expect(res.status).toBe(409);
  });

  it("writes an audit log entry on success", async () => {
    (getApiActor as jest.Mock).mockResolvedValue(adminActor);

    const res = await POST(
      buildRequest({ stripeRefundId: "re_1abc234DefGhiJk" }),
      ctx,
    );

    expect(res.status).toBe(200);
    expect(db.auditLog.create).toHaveBeenCalledTimes(1);
    const auditCall = (db.auditLog.create as jest.Mock).mock.calls[0][0];
    expect(auditCall.data).toMatchObject({
      entityType: "Registration",
      entityId: "r1",
      action: "MARK_REFUNDED",
      performedBy: "u-admin",
    });
    expect(JSON.parse(auditCall.data.changes)).toEqual({
      stripeRefundId: "re_1abc234DefGhiJk",
    });
  });
});
