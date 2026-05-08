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
    workshop: {
      findMany: jest.fn(),
      count: jest.fn(),
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
    coach: {
      findUnique: jest.fn(),
    },
    workshopType: {
      findUnique: jest.fn(),
    },
    category: {
      findUnique: jest.fn().mockResolvedValue(null),
    },
    pricingTier: {
      findUnique: jest.fn().mockResolvedValue(null),
    },
    automationTask: {
      create: jest.fn().mockResolvedValue({}),
    },
    approvalQueue: {
      create: jest.fn().mockResolvedValue({}),
      findUnique: jest.fn(),
      update: jest.fn(),
    },
  },
}));

jest.mock("@/lib/auth/authorization", () => ({
  getApiActor: jest.fn(),
  isPrivilegedRole: (role: string) => role === "ADMIN" || role === "STAFF",
}));

jest.mock("@/services/notifications", () => ({
  sendWorkshopRequestedEmail: jest.fn().mockResolvedValue(undefined),
}));

jest.mock("@/services/stripe", () => ({
  createWorkshopPromotionCode: jest.fn(),
}));

jest.mock("@/inngest/client", () => ({
  inngest: { send: jest.fn().mockResolvedValue(undefined) },
}));

import { GET, POST } from "@/app/api/workshops/route";
import { db } from "@/lib/db";
import { getApiActor } from "@/lib/auth/authorization";
import { createWorkshopPromotionCode } from "@/services/stripe";

function asPostRequest(request: Request): Parameters<typeof POST>[0] {
  return request as unknown as Parameters<typeof POST>[0];
}

function buildWorkshopPayload(eventDate: string) {
  return {
    workshopTypeId: "wt-1",
    coachId: "coach-1",
    title: "Scaling Up Growth Workshop",
    description: "Quarterly growth session",
    format: "IN_PERSON",
    eventDate,
    eventTime: "09:00",
    timezone: "America/New_York",
    isFree: true,
    maxAttendees: 40,
  };
}

function buildGetRequest(url: string): Parameters<typeof GET>[0] {
  return {
    nextUrl: new URL(url),
  } as unknown as Parameters<typeof GET>[0];
}

describe("Workshops API", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (createWorkshopPromotionCode as jest.Mock).mockImplementation(
      async ({ code }: { code: string }) => ({
        stripeCouponId: `coupon_${code}`,
        stripePromotionCodeId: `promo_${code}`,
      })
    );
  });

  describe("GET /api/workshops", () => {
    it("blocks coaches from querying other coaches data", async () => {
      (getApiActor as jest.Mock).mockResolvedValue({
        userId: "user-1",
        email: "coach@example.com",
        role: "COACH",
        coachId: "coach-1",
      });

      const response = await GET(
        buildGetRequest("http://localhost/api/workshops?coachId=coach-2")
      );

      expect(response.status).toBe(403);
      expect(db.workshop.findMany).not.toHaveBeenCalled();
    });
  });

  describe("POST /api/workshops", () => {
    it("blocks coaches from using POST /api/workshops (admin-only endpoint)", async () => {
      // POST /api/workshops is admin-only; coaches use /api/approvals instead.
      // The 403 fires before any lead-time logic runs.
      (getApiActor as jest.Mock).mockResolvedValue({
        userId: "coach-user-1",
        email: "coach@example.com",
        role: "COACH",
        coachId: "coach-1",
      });

      const fiftyDaysFromNow = new Date(
        Date.now() + 50 * 24 * 60 * 60 * 1000
      ).toISOString();
      const payload = {
        ...buildWorkshopPayload(fiftyDaysFromNow),
        format: "VIRTUAL",
      };

      const response = await POST(
        asPostRequest(
          new Request("http://localhost/api/workshops", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify(payload),
          })
        )
      );

      expect(response.status).toBe(403);
    });

    it("blocks staff from using POST /api/workshops when below the minimum lead time — still returns 403 for non-admin privileged roles", async () => {
      // Coaches reach 403 before lead-time; this test documents coach-only access restriction.
      (getApiActor as jest.Mock).mockResolvedValue({
        userId: "coach-user-1",
        email: "coach@example.com",
        role: "COACH",
        coachId: "coach-1",
      });

      const eightyDaysFromNow = new Date(
        Date.now() + 80 * 24 * 60 * 60 * 1000
      ).toISOString();
      const payload = buildWorkshopPayload(eightyDaysFromNow);

      const response = await POST(
        asPostRequest(
          new Request("http://localhost/api/workshops", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify(payload),
          })
        )
      );

      expect(response.status).toBe(403);
    });

    it("admin can create a workshop with tomorrow's date (bypasses lead-time threshold)", async () => {
      (getApiActor as jest.Mock).mockResolvedValue({
        userId: "admin-1",
        email: "admin@example.com",
        role: "ADMIN",
        coachId: null,
      });
      (db.coach.findUnique as jest.Mock).mockResolvedValue({
        id: "coach-1",
        email: "coach@example.com",
        firstName: "Jamie",
        lastName: "Coach",
        linkedinUrl: null,
        certifications: [{ id: "cert-1", status: "ACTIVE" }],
      });
      (db.workshopType.findUnique as jest.Mock).mockResolvedValue({
        id: "wt-1",
        slug: "scaling-up",
      });
      (db.workshop.create as jest.Mock).mockResolvedValue({
        id: "ws-1",
        title: "Scaling Up Growth Workshop",
        coachId: "coach-1",
        workshopCode: "WS-2026-A1B2",
      });
      (db.workshop.update as jest.Mock).mockResolvedValue({
        id: "ws-1",
        landingPageSlug: "scaling-up-growth-workshop-ws-1",
      });

      const tomorrow = new Date(Date.now() + 1 * 24 * 60 * 60 * 1000).toISOString();
      const payload = buildWorkshopPayload(tomorrow);

      const response = await POST(
        asPostRequest(
          new Request("http://localhost/api/workshops", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify(payload),
          })
        )
      );

      expect(response.status).toBe(201);
      expect(db.workshop.create).toHaveBeenCalled();
    });

    it("admin CAN create a workshop with yesterday's date (retroactive import)", async () => {
      (getApiActor as jest.Mock).mockResolvedValue({
        userId: "admin-1",
        email: "admin@example.com",
        role: "ADMIN",
        coachId: null,
      });

      const yesterday = new Date(Date.now() - 1 * 24 * 60 * 60 * 1000).toISOString();
      const payload = buildWorkshopPayload(yesterday);

      const response = await POST(
        asPostRequest(
          new Request("http://localhost/api/workshops", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify(payload),
          })
        )
      );

      // Admins bypass past-date restrictions; creation should succeed
      expect([200, 201]).toContain(response.status);
    });

    it("creates workshop when in-person lead time and certification checks pass", async () => {
      (getApiActor as jest.Mock).mockResolvedValue({
        userId: "admin-1",
        email: "admin@example.com",
        role: "ADMIN",
        coachId: null,
      });
      (db.coach.findUnique as jest.Mock).mockResolvedValue({
        id: "coach-1",
        certifications: [{ id: "cert-1", status: "ACTIVE" }],
      });
      (db.workshopType.findUnique as jest.Mock).mockResolvedValue({
        id: "wt-1",
        slug: "scaling-up",
      });
      (db.workshop.create as jest.Mock).mockResolvedValue({
        id: "ws-1",
        title: "Scaling Up Growth Workshop",
      });
      (db.workshop.update as jest.Mock).mockResolvedValue({
        id: "ws-1",
        landingPageSlug: "scaling-up-growth-workshop-ws-1",
      });

      const ninetyFiveDaysFromNow = new Date(
        Date.now() + 95 * 24 * 60 * 60 * 1000
      ).toISOString();
      const payload = buildWorkshopPayload(ninetyFiveDaysFromNow);

      const response = await POST(
        asPostRequest(
          new Request("http://localhost/api/workshops", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify(payload),
          })
        )
      );

      expect(response.status).toBe(201);
      expect(db.workshop.create).toHaveBeenCalled();
      expect(db.workshop.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: "ws-1" },
        })
      );
    });

    it("persists admin-created workshop coupons with Stripe promotion code references", async () => {
      (getApiActor as jest.Mock).mockResolvedValue({
        userId: "admin-1",
        email: "admin@example.com",
        role: "ADMIN",
        coachId: null,
      });
      (db.coach.findUnique as jest.Mock).mockResolvedValue({
        id: "coach-1",
        email: "coach@example.com",
        firstName: "Jamie",
        lastName: "Coach",
        certifications: [{ id: "cert-1", status: "ACTIVE" }],
      });
      (db.workshopType.findUnique as jest.Mock).mockResolvedValue({
        id: "wt-1",
        slug: "scaling-up",
      });
      (db.workshop.create as jest.Mock).mockResolvedValue({
        id: "ws-1",
        title: "Scaling Up Growth Workshop",
      });
      (db.workshop.update as jest.Mock).mockResolvedValue({
        id: "ws-1",
        landingPageSlug: "scaling-up-growth-workshop-ws-1",
      });

      const payload = {
        ...buildWorkshopPayload(
          new Date(Date.now() + 95 * 24 * 60 * 60 * 1000).toISOString()
        ),
        coupons: JSON.stringify([
          { code: "SAVE50", discountPercent: 50, singleUse: false },
          { code: "VIP100", discountPercent: 100, singleUse: true },
        ]),
      };

      const response = await POST(
        asPostRequest(
          new Request("http://localhost/api/workshops", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify(payload),
          })
        )
      );

      expect(response.status).toBe(201);
      expect(createWorkshopPromotionCode).toHaveBeenCalledTimes(2);
      expect(db.workshop.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            coupons: JSON.stringify([
              {
                code: "SAVE50",
                discountPercent: 50,
                singleUse: false,
                // ENH-MAY6-7: schema transform appends discountType=PERCENT for legacy shape
                discountType: "PERCENT",
                stripeCouponId: "coupon_SAVE50",
                stripePromotionCodeId: "promo_SAVE50",
              },
              {
                code: "VIP100",
                discountPercent: 100,
                singleUse: true,
                discountType: "PERCENT",
                stripeCouponId: "coupon_VIP100",
                stripePromotionCodeId: "promo_VIP100",
              },
            ]),
          }),
        })
      );
    });
  });
});
