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

    it("derives coach identity from session actor and builds fallback details", async () => {
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
              eventDate: "2026-04-10",
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
          details: "Workshop: Q2 Growth Intensive on 2026-04-10",
        })
      );
    });
  });
});
