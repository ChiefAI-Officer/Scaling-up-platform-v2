/**
 * Admin public-campaigns API — Task 8 (Quick Assessment PUBLIC flow).
 *
 * Tests:
 *   POST /api/admin/public-campaigns — create a PUBLIC campaign
 *   POST /api/admin/public-campaigns/[id]/publish — DRAFT → ACTIVE
 *
 * Mocks: db, auth/authorization, campaign-create-service, audit, rate-limit.
 * No real DB / no network.
 */

jest.mock("next/server", () => ({
  NextResponse: {
    json: (body: unknown, init?: ResponseInit) =>
      new Response(JSON.stringify(body), {
        status: init?.status ?? 200,
        headers: init?.headers,
      }),
  },
}));

jest.mock("@/lib/db", () => ({
  db: {
    assessmentCampaign: {
      create: jest.fn(),
      findUnique: jest.fn(),
      findFirst: jest.fn(),
      update: jest.fn(),
    },
    assessmentTemplate: {
      findUnique: jest.fn(),
    },
    organization: {
      findUnique: jest.fn(),
    },
    auditLog: { create: jest.fn().mockResolvedValue(undefined) },
  },
}));

jest.mock("@/lib/auth/authorization", () => ({
  getApiActor: jest.fn(),
  isPrivilegedRole: (role: string) => role === "ADMIN" || role === "STAFF",
}));

jest.mock("@/lib/assessments/campaign-create-service", () => {
  class CampaignCreateError extends Error {
    code: string;
    details: Record<string, unknown>;
    constructor(code: string, details: Record<string, unknown> = {}) {
      super(code);
      this.name = "CampaignCreateError";
      this.code = code;
      this.details = details;
    }
  }
  return {
    CampaignCreateError,
    resolvePublishedTemplateVersion: jest.fn(),
  };
});

jest.mock("@/lib/audit", () => ({
  logAudit: jest.fn().mockResolvedValue(undefined),
}));

jest.mock("@/lib/rate-limit", () => ({
  RateLimits: { standard: {} },
  withRateLimit: jest.fn().mockResolvedValue({ allowed: true, headers: {} }),
}));

// ─── imports (after mocks) ───────────────────────────────────────────────────
import { POST as createPost } from "@/app/api/admin/public-campaigns/route";
import { POST as publishPost } from "@/app/api/admin/public-campaigns/[id]/publish/route";
import { db } from "@/lib/db";
import { getApiActor } from "@/lib/auth/authorization";
import {
  resolvePublishedTemplateVersion,
  CampaignCreateError,
} from "@/lib/assessments/campaign-create-service";
import { logAudit } from "@/lib/audit";

// ─── helpers ─────────────────────────────────────────────────────────────────

const adminActor = {
  userId: "user-admin-1",
  email: "admin@example.com",
  role: "ADMIN" as const,
  coachId: null as string | null,
};

const staffActor = {
  userId: "user-staff-1",
  email: "staff@example.com",
  role: "STAFF" as const,
  coachId: null as string | null,
};

const coachActor = {
  userId: "user-coach-1",
  email: "coach@example.com",
  role: "COACH" as const,
  coachId: "coach-1",
};

function makeCreateRequest(body: unknown): Request {
  return new Request("http://localhost/api/admin/public-campaigns", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

function makePublishRequest(id = "camp-1"): Request {
  return new Request(
    `http://localhost/api/admin/public-campaigns/${id}/publish`,
    { method: "POST" }
  );
}

function publishParams(id: string) {
  return { params: Promise.resolve({ id }) };
}

const validBody = {
  templateId: "tpl-1",
  organizationId: "org-1",
  name: "Public Q2 Campaign",
  openAt: "2026-07-01T00:00:00.000Z",
};

const mockVersion = {
  id: "ver-1",
  language: "enUS",
  versionNumber: 2,
  publishedAt: new Date("2026-01-01"),
};

const mockTemplate = { id: "tpl-1", alias: "rockefeller" };
const mockOrg = { id: "org-1", name: "Acme Corp" };

const mockCampaign = {
  id: "camp-1",
  name: "Public Q2 Campaign",
  templateId: "tpl-1",
  versionId: "ver-1",
  organizationId: "org-1",
  language: "enUS",
  alias: "rockefeller_pub_260701000000",
  status: "DRAFT",
  accessMode: "PUBLIC",
  createdByCoachId: null,
  openAt: new Date("2026-07-01"),
  endMode: "OPEN_END",
  closeAt: null,
  createdAt: new Date(),
  updatedAt: new Date(),
};

// ─── beforeEach ──────────────────────────────────────────────────────────────

beforeEach(() => {
  jest.clearAllMocks();
  (resolvePublishedTemplateVersion as jest.Mock).mockResolvedValue(mockVersion);
  (db.assessmentTemplate.findUnique as jest.Mock).mockResolvedValue(
    mockTemplate
  );
  (db.organization.findUnique as jest.Mock).mockResolvedValue(mockOrg);
  (db.assessmentCampaign.create as jest.Mock).mockResolvedValue(mockCampaign);
});

// ─── POST /api/admin/public-campaigns ────────────────────────────────────────

describe("POST /api/admin/public-campaigns — CREATE", () => {
  describe("auth guards", () => {
    it("returns 401 when unauthenticated", async () => {
      (getApiActor as jest.Mock).mockResolvedValue(null);
      const res = await createPost(makeCreateRequest(validBody) as never);
      expect(res.status).toBe(401);
    });

    it("returns 403 when actor is a coach (isPrivilegedRole false)", async () => {
      (getApiActor as jest.Mock).mockResolvedValue(coachActor);
      const res = await createPost(makeCreateRequest(validBody) as never);
      expect(res.status).toBe(403);
      const body = await res.json();
      expect(body.error).toMatch(/forbidden|not authorized|admin/i);
    });

    it("allows STAFF actors", async () => {
      (getApiActor as jest.Mock).mockResolvedValue(staffActor);
      const res = await createPost(makeCreateRequest(validBody) as never);
      expect(res.status).toBe(201);
    });
  });

  describe("body validation", () => {
    beforeEach(() => {
      (getApiActor as jest.Mock).mockResolvedValue(adminActor);
    });

    function omitKey(key: string): Record<string, unknown> {
      const copy: Record<string, unknown> = { ...validBody };
      delete copy[key];
      return copy;
    }

    it("returns 400 when organizationId is missing", async () => {
      const res = await createPost(makeCreateRequest(omitKey("organizationId")) as never);
      expect(res.status).toBe(400);
    });

    it("returns 400 when name is missing", async () => {
      const res = await createPost(makeCreateRequest(omitKey("name")) as never);
      expect(res.status).toBe(400);
    });

    it("returns 400 when templateId is missing", async () => {
      const res = await createPost(makeCreateRequest(omitKey("templateId")) as never);
      expect(res.status).toBe(400);
    });

    it("returns 400 when openAt is missing", async () => {
      const res = await createPost(makeCreateRequest(omitKey("openAt")) as never);
      expect(res.status).toBe(400);
    });
  });

  describe("template / org not found", () => {
    beforeEach(() => {
      (getApiActor as jest.Mock).mockResolvedValue(adminActor);
    });

    it("returns 422 when template has no published version", async () => {
      (resolvePublishedTemplateVersion as jest.Mock).mockRejectedValue(
        new CampaignCreateError("TEMPLATE_VERSION_NOT_PUBLISHED", {
          templateId: "tpl-1",
        })
      );
      const res = await createPost(makeCreateRequest(validBody) as never);
      expect(res.status).toBe(422);
      const body = await res.json();
      expect(body.error).toBe("TEMPLATE_VERSION_NOT_PUBLISHED");
    });

    it("returns 404 when template row does not exist", async () => {
      (db.assessmentTemplate.findUnique as jest.Mock).mockResolvedValue(null);
      const res = await createPost(makeCreateRequest(validBody) as never);
      expect(res.status).toBe(404);
    });

    it("returns 404 when organization does not exist", async () => {
      (db.organization.findUnique as jest.Mock).mockResolvedValue(null);
      const res = await createPost(makeCreateRequest(validBody) as never);
      expect(res.status).toBe(404);
    });
  });

  describe("happy path — no closeAt (OPEN_END)", () => {
    beforeEach(() => {
      (getApiActor as jest.Mock).mockResolvedValue(adminActor);
    });

    it("returns 201 with the created campaign", async () => {
      const res = await createPost(makeCreateRequest(validBody) as never);
      expect(res.status).toBe(201);
      const body = await res.json();
      expect(body.success).toBe(true);
      expect(body.data).toBeDefined();
    });

    it("creates campaign with accessMode=PUBLIC, status=DRAFT, createdByCoachId=null", async () => {
      await createPost(makeCreateRequest(validBody) as never);

      const createCall = (db.assessmentCampaign.create as jest.Mock).mock
        .calls[0][0];
      const data = createCall.data;

      expect(data.accessMode).toBe("PUBLIC");
      expect(data.status).toBe("DRAFT");
      expect(data.createdByCoachId).toBeNull();
    });

    it("derives endMode=OPEN_END and closeAt=null when no closeAt provided", async () => {
      await createPost(makeCreateRequest(validBody) as never);

      const createCall = (db.assessmentCampaign.create as jest.Mock).mock
        .calls[0][0];
      const data = createCall.data;

      expect(data.endMode).toBe("OPEN_END");
      expect(data.closeAt).toBeNull();
    });

    it("sets versionId from resolvePublishedTemplateVersion", async () => {
      await createPost(makeCreateRequest(validBody) as never);

      const createCall = (db.assessmentCampaign.create as jest.Mock).mock
        .calls[0][0];
      expect(createCall.data.versionId).toBe("ver-1");
    });

    it("calls logAudit with CREATE action and PUBLIC accessMode", async () => {
      await createPost(makeCreateRequest(validBody) as never);

      expect(logAudit).toHaveBeenCalledWith(
        expect.objectContaining({
          action: "CREATE",
          entityType: "AssessmentCampaign",
          changes: expect.objectContaining({ accessMode: "PUBLIC" }),
        })
      );
    });
  });

  describe("happy path — with closeAt (ENDS_AFTER)", () => {
    beforeEach(() => {
      (getApiActor as jest.Mock).mockResolvedValue(adminActor);
    });

    it("derives endMode=ENDS_AFTER when closeAt is present", async () => {
      const bodyWithClose = {
        ...validBody,
        closeAt: "2026-12-31T23:59:59.000Z",
      };
      await createPost(makeCreateRequest(bodyWithClose) as never);

      const createCall = (db.assessmentCampaign.create as jest.Mock).mock
        .calls[0][0];
      const data = createCall.data;

      expect(data.endMode).toBe("ENDS_AFTER");
      expect(data.closeAt).toBeInstanceOf(Date);
    });
  });

  describe("P2002 alias collision fallback", () => {
    beforeEach(() => {
      (getApiActor as jest.Mock).mockResolvedValue(adminActor);
    });

    it("retries with a random suffix on P2002 error", async () => {
      const p2002 = Object.assign(new Error("Unique constraint"), {
        code: "P2002",
      });
      (db.assessmentCampaign.create as jest.Mock)
        .mockRejectedValueOnce(p2002)
        .mockResolvedValueOnce({ ...mockCampaign, alias: "rockefeller_pub_260701000000_abc123" });

      const res = await createPost(makeCreateRequest(validBody) as never);
      expect(res.status).toBe(201);
      expect(db.assessmentCampaign.create).toHaveBeenCalledTimes(2);
      // Second call alias has a suffix
      const secondAlias = (db.assessmentCampaign.create as jest.Mock).mock.calls[1][0].data.alias;
      expect(secondAlias).toMatch(/rockefeller_pub_\d{12}_[a-z0-9]+/);
    });
  });
});

// ─── POST /api/admin/public-campaigns/[id]/publish ───────────────────────────

describe("POST /api/admin/public-campaigns/[id]/publish — PUBLISH", () => {
  describe("auth guards", () => {
    it("returns 401 when unauthenticated", async () => {
      (getApiActor as jest.Mock).mockResolvedValue(null);
      const res = await publishPost(
        makePublishRequest() as never,
        publishParams("camp-1")
      );
      expect(res.status).toBe(401);
    });

    it("returns 403 when actor is a coach", async () => {
      (getApiActor as jest.Mock).mockResolvedValue(coachActor);
      const res = await publishPost(
        makePublishRequest() as never,
        publishParams("camp-1")
      );
      expect(res.status).toBe(403);
    });
  });

  describe("campaign state checks", () => {
    beforeEach(() => {
      (getApiActor as jest.Mock).mockResolvedValue(adminActor);
    });

    it("returns 404 when campaign does not exist", async () => {
      (db.assessmentCampaign.findFirst as jest.Mock).mockResolvedValue(null);
      const res = await publishPost(
        makePublishRequest() as never,
        publishParams("camp-404")
      );
      expect(res.status).toBe(404);
    });

    it("returns 400 with NOT_PUBLIC when campaign accessMode is INVITED", async () => {
      (db.assessmentCampaign.findFirst as jest.Mock).mockResolvedValue({
        id: "camp-1",
        status: "DRAFT",
        accessMode: "INVITED",
      });
      const res = await publishPost(
        makePublishRequest() as never,
        publishParams("camp-1")
      );
      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error).toBe("NOT_PUBLIC");
    });

    it("returns 409 with ALREADY_ACTIVE when campaign is already ACTIVE", async () => {
      (db.assessmentCampaign.findFirst as jest.Mock).mockResolvedValue({
        id: "camp-1",
        status: "ACTIVE",
        accessMode: "PUBLIC",
      });
      const res = await publishPost(
        makePublishRequest() as never,
        publishParams("camp-1")
      );
      expect(res.status).toBe(409);
      const body = await res.json();
      expect(body.error).toBe("ALREADY_ACTIVE");
    });

    it("returns 409 when campaign is CLOSED", async () => {
      (db.assessmentCampaign.findFirst as jest.Mock).mockResolvedValue({
        id: "camp-1",
        status: "CLOSED",
        accessMode: "PUBLIC",
      });
      const res = await publishPost(
        makePublishRequest() as never,
        publishParams("camp-1")
      );
      expect(res.status).toBe(409);
    });
  });

  describe("happy path", () => {
    beforeEach(() => {
      (getApiActor as jest.Mock).mockResolvedValue(adminActor);
      (db.assessmentCampaign.findFirst as jest.Mock).mockResolvedValue({
        id: "camp-1",
        status: "DRAFT",
        accessMode: "PUBLIC",
      });
      (db.assessmentCampaign.update as jest.Mock).mockResolvedValue({
        id: "camp-1",
        status: "ACTIVE",
        accessMode: "PUBLIC",
      });
    });

    it("returns 200 with status ACTIVE", async () => {
      const res = await publishPost(
        makePublishRequest() as never,
        publishParams("camp-1")
      );
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.success).toBe(true);
      expect(body.data.status).toBe("ACTIVE");
    });

    it("calls db.assessmentCampaign.update with status ACTIVE", async () => {
      await publishPost(
        makePublishRequest() as never,
        publishParams("camp-1")
      );
      expect(db.assessmentCampaign.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: "camp-1" },
          data: { status: "ACTIVE" },
        })
      );
    });

    it("calls logAudit with UPDATE action", async () => {
      await publishPost(
        makePublishRequest() as never,
        publishParams("camp-1")
      );
      expect(logAudit).toHaveBeenCalledWith(
        expect.objectContaining({
          action: "UPDATE",
          entityType: "AssessmentCampaign",
          entityId: "camp-1",
          changes: expect.objectContaining({ accessMode: "PUBLIC" }),
        })
      );
    });
  });
});
