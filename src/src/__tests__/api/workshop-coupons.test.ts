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
  canManageCoachData: jest.fn(() => true),
}));

jest.mock("@/lib/db", () => ({
  db: {
    workshop: {
      findUnique: jest.fn(),
      update: jest.fn(),
    },
    auditLog: {
      create: jest.fn(),
    },
    pricingTier: {
      findUnique: jest.fn(),
    },
    approvalQueue: {
      create: jest.fn(),
    },
    landingPage: {
      findMany: jest.fn().mockResolvedValue([]),
    },
  },
}));

jest.mock("@/lib/templates/template-interpolation", () => ({
  buildWorkshopVariables: jest.fn().mockResolvedValue(null),
  interpolateContent: jest.fn((c: unknown) => c),
  rewriteIdentityFields: jest.fn((c: unknown) => c),
}));

jest.mock("@/services/notifications", () => ({
  sendCustomPriceChangeEmail: jest.fn().mockResolvedValue(undefined),
}));

import { getApiActor } from "@/lib/auth/authorization";
import { db } from "@/lib/db";
import { PATCH } from "@/app/api/workshops/[id]/route";

const mockWorkshop = {
  id: "w1",
  coachId: "c1",
  status: "PRE_EVENT",
  title: "Test Workshop",
  coupons: "[]",
  eventDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
  isFree: false,
  priceCents: 10000,
  pricingTierId: null,
};

function buildRequest(body: unknown): Request {
  return new Request("http://localhost/api/workshops/w1", {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("PATCH /api/workshops/[id] — coupon editing", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (db.workshop.findUnique as jest.Mock).mockResolvedValue(mockWorkshop);
    (db.workshop.update as jest.Mock).mockResolvedValue({ ...mockWorkshop });
    (db.auditLog.create as jest.Mock).mockResolvedValue({});
  });

  it("admin PATCH with valid coupons array saves as JSON string", async () => {
    (getApiActor as jest.Mock).mockResolvedValue({ role: "ADMIN", coachId: null });
    const coupons = [{ code: "SAVE20", discountPercent: 20, singleUse: false }];

    const req = buildRequest({ coupons });
    const res = await PATCH(req as unknown as import("next/server").NextRequest, {
      params: Promise.resolve({ id: "w1" }),
    });

    expect(res.status).toBe(200);
    const updateCall = (db.workshop.update as jest.Mock).mock.calls[0][0];
    expect(updateCall.data.coupons).toBe(JSON.stringify(coupons));
  });

  it("admin PATCH with invalid coupon (negative discount) returns 400", async () => {
    (getApiActor as jest.Mock).mockResolvedValue({ role: "ADMIN", coachId: null });
    const coupons = [{ code: "BAD", discountPercent: -5, singleUse: false }];

    const req = buildRequest({ coupons });
    const res = await PATCH(req as unknown as import("next/server").NextRequest, {
      params: Promise.resolve({ id: "w1" }),
    });

    expect(res.status).toBe(400);
  });

  it("coach PATCH with coupons is ignored (coupons not saved)", async () => {
    (getApiActor as jest.Mock).mockResolvedValue({ role: "COACH", coachId: "c1" });
    // Set status to REQUESTED so coach is not blocked by the PRE_EVENT lockdown
    (db.workshop.findUnique as jest.Mock).mockResolvedValue({
      ...mockWorkshop,
      status: "REQUESTED",
    });
    const coupons = [{ code: "HACK", discountPercent: 100, singleUse: false }];

    const req = buildRequest({ coupons });
    const res = await PATCH(req as unknown as import("next/server").NextRequest, {
      params: Promise.resolve({ id: "w1" }),
    });

    // Coach sending "coupons" (not in COACH_EDITABLE_FIELDS) → 403
    // OR if somehow 200, coupons must not be in the update payload
    if (res.status === 200) {
      const updateCall = (db.workshop.update as jest.Mock).mock.calls[0][0];
      expect(updateCall.data).not.toHaveProperty("coupons");
    } else {
      expect([400, 403]).toContain(res.status);
    }
  });
});
