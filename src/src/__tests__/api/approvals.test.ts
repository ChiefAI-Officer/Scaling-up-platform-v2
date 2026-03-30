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
      findMany: jest.fn(),
    },
    workshopType: {
      findFirst: jest.fn(),
    },
    workshop: {
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
    category: {
      findUnique: jest.fn(),
    },
    pricingTier: {
      findUnique: jest.fn(),
    },
    coach: {
      findFirst: jest.fn(),
      findUnique: jest.fn(),
    },
  },
}));

jest.mock("@/lib/approval-engine", () => ({
  evaluateApproval: jest.fn(),
}));

jest.mock("@/services/circle", () => ({
  verifyCertification: jest.fn().mockResolvedValue(null),
}));

jest.mock("@/services/hubspot", () => ({
  getCoachByEmail: jest.fn().mockResolvedValue(null),
}));

jest.mock("@/services/notifications", () => ({
  sendEnrichedApprovalRequest: jest.fn().mockResolvedValue(undefined),
}));

jest.mock("@/lib/authorization", () => ({
  getApiActor: jest.fn(),
  isPrivilegedRole: (role: string) => role === "ADMIN" || role === "STAFF",
}));

import { GET, POST } from "@/app/api/approvals/route";
import { db } from "@/lib/db";
import { evaluateApproval } from "@/lib/approval-engine";
import { getApiActor } from "@/lib/authorization";

function buildRequest(url: string, init?: RequestInit): Request {
  return new Request(url, init);
}

function asGetRequest(request: Request): Parameters<typeof GET>[0] {
  return request as unknown as Parameters<typeof GET>[0];
}

function asPostRequest(request: Request): Parameters<typeof POST>[0] {
  return request as unknown as Parameters<typeof POST>[0];
}

describe("Approvals API", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (evaluateApproval as jest.Mock).mockResolvedValue({
      autoApproved: false,
      reason: "Queued for review",
      approvalId: "apr-1",
      routeTo: "admin@scalingup.com",
    });
    (db.workshopType.findFirst as jest.Mock).mockResolvedValue({ id: "wt-1" });
    (db.workshop.findUnique as jest.Mock).mockResolvedValue(null);
    (db.workshop.create as jest.Mock).mockResolvedValue({ id: "ws-new" });
    (db.workshop.update as jest.Mock).mockResolvedValue({ id: "ws-new" });
    (db.category.findUnique as jest.Mock).mockResolvedValue(null);
    (db.pricingTier.findUnique as jest.Mock).mockResolvedValue(null);
    (db.coach.findFirst as jest.Mock).mockResolvedValue(null);
    (db.coach.findUnique as jest.Mock).mockResolvedValue({
      firstName: "Jane",
      lastName: "Smith",
      email: "jane@example.com",
      title: "Scaling Up Coach",
      linkedinUrl: "https://linkedin.com/in/jane",
      bio: "Experienced coach with 15 years of expertise.",
      profileImage: "https://example.com/photo.jpg",
    });
  });

  describe("GET /api/approvals", () => {
    it("returns 401 when unauthenticated", async () => {
      (getApiActor as jest.Mock).mockResolvedValue(null);

      const response = await GET(asGetRequest(buildRequest("http://localhost/api/approvals")));

      expect(response.status).toBe(401);
    });

    it("returns 403 for coach users", async () => {
      (getApiActor as jest.Mock).mockResolvedValue({
        userId: "user-1",
        email: "coach@example.com",
        role: "COACH",
        coachId: "coach-1",
      });

      const response = await GET(asGetRequest(buildRequest("http://localhost/api/approvals")));

      expect(response.status).toBe(403);
    });

    it("sanitizes invalid status and caps limit", async () => {
      (getApiActor as jest.Mock).mockResolvedValue({
        userId: "admin-1",
        email: "admin@example.com",
        role: "ADMIN",
        coachId: null,
      });
      (db.approvalQueue.findMany as jest.Mock).mockResolvedValue([
        {
          id: "apr-1",
          type: "WORKSHOP_REQUEST",
          status: "PENDING",
          requestData: "{invalid-json}",
          coachId: "coach-1",
          workshopId: "ws-1",
          requestedAt: new Date("2026-02-01T10:00:00.000Z"),
          escalatedAt: null,
        },
      ]);

      const response = await GET(
        asGetRequest(buildRequest("http://localhost/api/approvals?status=bad-status&limit=999"))
      );
      const body = await response.json();

      expect(response.status).toBe(200);
      expect(db.approvalQueue.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { status: "PENDING" },
          take: 100,
        })
      );
      expect(body.total).toBe(1);
      expect(body.approvals[0].requestData).toBeNull();
    });
  });

  describe("POST /api/approvals", () => {
    it("returns 400 when admin/staff request omits coach identity", async () => {
      (getApiActor as jest.Mock).mockResolvedValue({
        userId: "staff-1",
        email: "staff@example.com",
        role: "STAFF",
        coachId: null,
      });

      const response = await POST(
        asPostRequest(
          buildRequest("http://localhost/api/approvals", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
              type: "WORKSHOP_REQUEST",
              details: "Needs approval",
            }),
          })
        )
      );

      expect(response.status).toBe(400);
      expect(evaluateApproval).not.toHaveBeenCalled();
    });

    it("blocks coach identity spoofing", async () => {
      (getApiActor as jest.Mock).mockResolvedValue({
        userId: "coach-user",
        email: "coach@example.com",
        role: "COACH",
        coachId: "coach-1",
      });

      const response = await POST(
        asPostRequest(
          buildRequest("http://localhost/api/approvals", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
              type: "WORKSHOP_REQUEST",
              coachId: "coach-2",
            }),
          })
        )
      );

      expect(response.status).toBe(403);
      expect(evaluateApproval).not.toHaveBeenCalled();
    });

    it("rejects workshop requests that do not satisfy the March lead-time policy", async () => {
      (getApiActor as jest.Mock).mockResolvedValue({
        userId: "coach-user",
        email: "coach@example.com",
        role: "COACH",
        coachId: "coach-1",
      });

      const response = await POST(
        asPostRequest(
          buildRequest("http://localhost/api/approvals", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
              type: "WORKSHOP_REQUEST",
              workshopTypeId: "scaling-up",
              title: "Q2 Growth Intensive",
              format: "VIRTUAL",
              eventDate: new Date(
                Date.now() + 45 * 24 * 60 * 60 * 1000
              ).toISOString(),
            }),
          })
        )
      );
      const body = await response.json();

      expect(response.status).toBe(409);
      expect(body.requiresApproval).toBe(true);
      expect(body.requiredLeadTimeDays).toBe(60);
      expect(db.workshop.create).not.toHaveBeenCalled();
      expect(evaluateApproval).not.toHaveBeenCalled();
    });

    it("derives coach identity from session actor and builds fallback details", async () => {
      (getApiActor as jest.Mock).mockResolvedValue({
        userId: "coach-user",
        email: "coach@example.com",
        role: "COACH",
        coachId: "coach-1",
      });
      const eventDate = new Date(
        Date.now() + 95 * 24 * 60 * 60 * 1000
      ).toISOString();

      const response = await POST(
        asPostRequest(
          buildRequest("http://localhost/api/approvals", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
              type: "WORKSHOP_REQUEST",
              workshopTypeId: "scaling-up",
              title: "Q2 Growth Intensive",
              format: "IN_PERSON",
              eventDate,
            }),
          })
        )
      );

      expect(response.status).toBe(200);
      expect(evaluateApproval).toHaveBeenCalledWith(
        expect.objectContaining({
          coachId: "coach-1",
          coachEmail: "coach@example.com",
          requestedBy: "coach@example.com",
          workshopTypeSlug: "scaling-up",
          details: `Workshop: Q2 Growth Intensive on ${eventDate}`,
        })
      );
    });
  });

  describe("GET /api/approvals — CUSTOM_PRICING card data", () => {
    beforeEach(() => {
      (getApiActor as jest.Mock).mockResolvedValue({
        userId: "admin-1",
        email: "admin@example.com",
        role: "ADMIN",
        coachId: null,
      });
    });

    it("preserves newPriceCents in requestData for CUSTOM_PRICING approvals", async () => {
      (db.approvalQueue.findMany as jest.Mock).mockResolvedValue([
        {
          id: "apr-cp-1",
          type: "CUSTOM_PRICING",
          status: "PENDING",
          requestData: JSON.stringify({
            oldPriceCents: 0,
            newPriceCents: 29900,
            workshopTitle: "Workshop Request",
            workshopEventDate: "2026-08-17T00:00:00.000Z",
            customPricingNotes: "Testing M1 - please ignore",
            requestedBy: "coach@example.com",
          }),
          coachId: "coach-1",
          workshopId: "ws-1",
          requestedAt: new Date("2026-03-19T10:00:00.000Z"),
          escalatedAt: null,
          responseReason: null,
          coachResponse: null,
          notes: "Testing M1 - please ignore",
          coach: { firstName: "JC", lastName: "DS", email: "coach@example.com" },
        },
      ]);

      const response = await GET(asGetRequest(buildRequest("http://localhost/api/approvals")));
      const body = await response.json();

      expect(response.status).toBe(200);
      expect(body.approvals[0].requestData.newPriceCents).toBe(29900);
    });

    it("constructs details from workshopTitle and workshopEventDate in requestData", async () => {
      (db.approvalQueue.findMany as jest.Mock).mockResolvedValue([
        {
          id: "apr-cp-2",
          type: "CUSTOM_PRICING",
          status: "PENDING",
          requestData: JSON.stringify({
            oldPriceCents: 0,
            newPriceCents: 29900,
            workshopTitle: "Workshop Request",
            workshopEventDate: "2026-08-17T00:00:00.000Z",
            requestedBy: "coach@example.com",
          }),
          coachId: "coach-1",
          workshopId: "ws-1",
          requestedAt: new Date("2026-03-19T10:00:00.000Z"),
          escalatedAt: null,
          responseReason: null,
          coachResponse: null,
          notes: null,
          coach: { firstName: "JC", lastName: "DS", email: "coach@example.com" },
        },
      ]);

      const response = await GET(asGetRequest(buildRequest("http://localhost/api/approvals")));
      const body = await response.json();

      expect(response.status).toBe(200);
      expect(body.approvals[0].details).toMatch(/Workshop: Workshop Request on/);
    });

    it("includes notes field in GET response for CUSTOM_PRICING approvals", async () => {
      (db.approvalQueue.findMany as jest.Mock).mockResolvedValue([
        {
          id: "apr-cp-3",
          type: "CUSTOM_PRICING",
          status: "PENDING",
          requestData: JSON.stringify({ requestedBy: "coach@example.com" }),
          coachId: "coach-1",
          workshopId: "ws-1",
          requestedAt: new Date("2026-03-19T10:00:00.000Z"),
          escalatedAt: null,
          responseReason: null,
          coachResponse: null,
          notes: "Testing M1 - please ignore",
          coach: { firstName: "JC", lastName: "DS", email: "coach@example.com" },
        },
      ]);

      const response = await GET(asGetRequest(buildRequest("http://localhost/api/approvals")));
      const body = await response.json();

      expect(response.status).toBe(200);
      expect(body.approvals[0].notes).toBe("Testing M1 - please ignore");
    });

    it("includes workshopCode in GET approvals response", async () => {
      (db.approvalQueue.findMany as jest.Mock).mockResolvedValue([
        {
          id: "apr-ws-code",
          type: "CUSTOM_PRICING",
          status: "PENDING",
          requestData: JSON.stringify({ requestedBy: "coach@example.com" }),
          coachId: "coach-1",
          workshopId: "ws-1",
          requestedAt: new Date("2026-03-20T10:00:00.000Z"),
          escalatedAt: null,
          responseReason: null,
          coachResponse: null,
          notes: null,
          coach: { firstName: "JC", lastName: "DS", email: "coach@example.com" },
          workshop: { id: "ws-1", title: "Test Workshop", eventDate: new Date(), workshopCode: "WS-2026-2YE2" },
        },
      ]);

      const response = await GET(asGetRequest(buildRequest("http://localhost/api/approvals")));
      const body = await response.json();

      expect(response.status).toBe(200);
      expect(body.approvals[0].workshopCode).toBe("WS-2026-2YE2");
    });

    it("uses workshop relation as fallback for details when requestData lacks workshopTitle", async () => {
      (db.approvalQueue.findMany as jest.Mock).mockResolvedValue([
        {
          id: "apr-fallback",
          type: "CUSTOM_PRICING",
          status: "PENDING",
          requestData: JSON.stringify({ requestedBy: "coach@example.com" }), // no workshopTitle
          coachId: "coach-1",
          workshopId: "ws-fallback",
          requestedAt: new Date("2026-03-19T10:00:00.000Z"),
          escalatedAt: null,
          responseReason: null,
          coachResponse: null,
          notes: null,
          coach: { firstName: "JC", lastName: "DS", email: "coach@example.com" },
          workshop: { id: "ws-fallback", title: "Workshop Request", eventDate: new Date("2026-08-17T00:00:00.000Z") },
        },
      ]);

      const response = await GET(asGetRequest(buildRequest("http://localhost/api/approvals")));
      const body = await response.json();

      expect(response.status).toBe(200);
      expect(body.approvals[0].details).toMatch(/Workshop: Workshop Request on/);
    });
  });

  describe("POST /api/approvals — pricing resolution", () => {
    const farFutureDate = new Date(Date.now() + 120 * 24 * 60 * 60 * 1000).toISOString();

    beforeEach(() => {
      (getApiActor as jest.Mock).mockResolvedValue({
        userId: "user-c1",
        email: "coach@example.com",
        role: "COACH",
        coachId: "coach-1",
      });
      (db.workshopType.findFirst as jest.Mock).mockResolvedValue({ id: "wt-1" });
      (db.workshop.create as jest.Mock).mockImplementation((args: { data: unknown }) =>
        Promise.resolve({ id: "ws-new", ...(args.data as object) })
      );
      (db.workshop.update as jest.Mock).mockResolvedValue({ id: "ws-new" });
    });

    it("saves priceCents from pricing tier when pricingTierId is sent", async () => {
      (db.pricingTier.findUnique as jest.Mock).mockResolvedValue({
        id: "tier-halfday",
        amountCents: 29900,
      });
      const req = buildRequest("http://localhost/api/approvals", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          type: "WORKSHOP_REQUEST",
          pricingTierId: "tier-halfday",
          eventDate: farFutureDate,
          format: "IN_PERSON",
          timezone: "America/New_York",
        }),
      });
      await POST(asPostRequest(req));
      expect(db.workshop.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ priceCents: 29900, isFree: false }),
        })
      );
    });

    it("saves priceCents from customPrice when CUSTOM_PRICING is submitted", async () => {
      (db.pricingTier.findUnique as jest.Mock).mockResolvedValue(null);
      const req = buildRequest("http://localhost/api/approvals", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          type: "CUSTOM_PRICING",
          customPrice: 259,
          eventDate: farFutureDate,
          format: "IN_PERSON",
          timezone: "America/New_York",
        }),
      });
      await POST(asPostRequest(req));
      expect(db.workshop.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ priceCents: 25900, isFree: false }),
        })
      );
    });

    it("creates workshop with TIER price (not custom price) for CUSTOM_PRICING when tier exists", async () => {
      (db.pricingTier.findUnique as jest.Mock).mockResolvedValue({
        id: "tier-halfday",
        amountCents: 29900,
      });
      const req = buildRequest("http://localhost/api/approvals", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          type: "CUSTOM_PRICING",
          pricingTierId: "tier-halfday",
          customPrice: 249,
          eventDate: farFutureDate,
          format: "IN_PERSON",
          timezone: "America/New_York",
        }),
      });
      await POST(asPostRequest(req));
      expect(db.workshop.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ priceCents: 29900, isFree: false }),
        })
      );
    });

    it("passes newPriceCents to evaluateApproval for CUSTOM_PRICING", async () => {
      (db.pricingTier.findUnique as jest.Mock).mockResolvedValue({
        id: "tier-halfday",
        amountCents: 29900,
      });
      const req = buildRequest("http://localhost/api/approvals", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          type: "CUSTOM_PRICING",
          pricingTierId: "tier-halfday",
          customPrice: 249,
          eventDate: farFutureDate,
          format: "IN_PERSON",
          timezone: "America/New_York",
        }),
      });
      await POST(asPostRequest(req));
      expect(evaluateApproval).toHaveBeenCalledWith(
        expect.objectContaining({ newPriceCents: 24900 })
      );
    });

    it("passes customPricingNotes to evaluateApproval when sent in body", async () => {
      (db.pricingTier.findUnique as jest.Mock).mockResolvedValue(null);
      const req = buildRequest("http://localhost/api/approvals", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          type: "CUSTOM_PRICING",
          customPrice: 249,
          customPricingNotes: "Testing notes for M1",
          eventDate: farFutureDate,
          format: "IN_PERSON",
          timezone: "America/New_York",
        }),
      });
      await POST(asPostRequest(req));
      expect(evaluateApproval).toHaveBeenCalledWith(
        expect.objectContaining({ customPricingNotes: "Testing notes for M1" })
      );
    });
  });
});
