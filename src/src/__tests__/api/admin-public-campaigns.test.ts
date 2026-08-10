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
      findMany: jest.fn(),
      findUnique: jest.fn(),
      findFirst: jest.fn(),
      update: jest.fn(),
    },
    assessmentTemplate: {
      findUnique: jest.fn(),
    },
    assessmentTemplateVersion: {
      findMany: jest.fn(),
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

jest.mock("@/lib/assessments/wave-public-campaigns-simple-ui-flags", () => ({
  isPublicCampaignsSimpleUiEnabled: jest.fn(),
}));

// ─── imports (after mocks) ───────────────────────────────────────────────────
import {
  GET as listGet,
  POST as createPost,
} from "@/app/api/admin/public-campaigns/route";
import { POST as publishPost } from "@/app/api/admin/public-campaigns/[id]/publish/route";
import { db } from "@/lib/db";
import { getApiActor } from "@/lib/auth/authorization";
import {
  resolvePublishedTemplateVersion,
  CampaignCreateError,
} from "@/lib/assessments/campaign-create-service";
import { logAudit } from "@/lib/audit";
import { isPublicCampaignsSimpleUiEnabled } from "@/lib/assessments/wave-public-campaigns-simple-ui-flags";

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
  organizationId: null,
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
  delete process.env.WAVE_REPORT_STYLES_ENABLED;
  delete process.env.WAVE_REPORT_STYLES_CANARY;
  delete process.env.WAVE_REPORT_STYLES_KILL;
  (isPublicCampaignsSimpleUiEnabled as jest.Mock).mockReturnValue(false);
  (resolvePublishedTemplateVersion as jest.Mock).mockResolvedValue(mockVersion);
  (db.assessmentTemplate.findUnique as jest.Mock).mockResolvedValue(
    { ...mockTemplate, disabledAt: null, defaultReportStyle: "MODERN_DASHBOARD" }
  );
  (db.organization.findUnique as jest.Mock).mockResolvedValue(mockOrg);
  (db.assessmentCampaign.create as jest.Mock).mockResolvedValue(mockCampaign);
  (db.assessmentTemplateVersion.findMany as jest.Mock).mockResolvedValue([]);
});

// ─── GET /api/admin/public-campaigns ─────────────────────────────────────────

describe("GET /api/admin/public-campaigns — LIST", () => {
  it("returns only the server-filtered admin-owned PUBLIC campaign rows", async () => {
    (getApiActor as jest.Mock).mockResolvedValue(adminActor);
    (db.assessmentCampaign.findMany as jest.Mock).mockResolvedValue([
      {
        ...mockCampaign,
        reportStyle: "CLASSIC",
        reportStyleSource: "TEMPLATE_DEFAULT",
        reportStyleLockedAt: null,
      },
    ]);

    const res = await listGet();

    expect(res.status).toBe(200);
    expect(db.assessmentCampaign.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          accessMode: "PUBLIC",
          createdByCoachId: null,
          deletedAt: null,
        },
      }),
    );
  });

  it("keeps list query and payload count-free when simple UI is disabled", async () => {
    (getApiActor as jest.Mock).mockResolvedValue(adminActor);
    (db.assessmentCampaign.findMany as jest.Mock).mockResolvedValue([
      {
        ...mockCampaign,
        reportStyle: "CLASSIC",
        reportStyleSource: "TEMPLATE_DEFAULT",
        reportStyleLockedAt: null,
      },
    ]);

    const res = await listGet();

    expect(db.assessmentCampaign.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        include: {
          organization: { select: { id: true, name: true } },
          template: { select: { id: true, name: true, alias: true } },
        },
      }),
    );
    const body = await res.json();
    expect(body.data[0]).not.toHaveProperty("_count");
    expect(body.data[0]).not.toHaveProperty("responseCount");
  });

  it("adds a response count without exposing Prisma count data when simple UI is enabled", async () => {
    (isPublicCampaignsSimpleUiEnabled as jest.Mock).mockReturnValue(true);
    (getApiActor as jest.Mock).mockResolvedValue(adminActor);
    (db.assessmentCampaign.findMany as jest.Mock).mockResolvedValue([
      {
        ...mockCampaign,
        reportStyle: "CLASSIC",
        reportStyleSource: "TEMPLATE_DEFAULT",
        reportStyleLockedAt: null,
        _count: { submissions: 24 },
      },
    ]);

    const res = await listGet();

    expect(db.assessmentCampaign.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        include: {
          organization: { select: { id: true, name: true } },
          template: { select: { id: true, name: true, alias: true } },
          _count: { select: { submissions: true } },
        },
      }),
    );
    const body = await res.json();
    expect(body.data[0]).toHaveProperty("responseCount", 24);
    expect(body.data[0]).not.toHaveProperty("_count");
  });

  it("returns the exact campaign-canary availability and lets kill override it", async () => {
    (getApiActor as jest.Mock).mockResolvedValue(adminActor);
    (db.assessmentCampaign.findMany as jest.Mock).mockResolvedValue([
      {
        ...mockCampaign,
        templateId: "tpl-not-canary",
        reportStyle: "EXECUTIVE_BOARDROOM",
        reportStyleSource: "CAMPAIGN_OVERRIDE",
        reportStyleLockedAt: new Date("2026-08-06T04:00:00.000Z"),
      },
    ]);
    process.env.WAVE_REPORT_STYLES_CANARY = "camp-1";

    const enabledRes = await listGet();
    await expect(enabledRes.json()).resolves.toEqual(
      expect.objectContaining({
        data: [
          expect.objectContaining({ reportStylesAvailable: true }),
        ],
      }),
    );

    process.env.WAVE_REPORT_STYLES_KILL = "1";
    const killedRes = await listGet();
    await expect(killedRes.json()).resolves.toEqual(
      expect.objectContaining({
        data: [
          expect.objectContaining({
            reportStylesAvailable: false,
            reportStyle: "EXECUTIVE_BOARDROOM",
            reportStyleSource: "CAMPAIGN_OVERRIDE",
            reportStyleLockedAt: "2026-08-06T04:00:00.000Z",
          }),
        ],
      }),
    );
  });

  it("keeps flag-off queries and bytes free of version questions and capabilities", async () => {
    (getApiActor as jest.Mock).mockResolvedValue(adminActor);
    (db.assessmentCampaign.findMany as jest.Mock).mockResolvedValue([
      {
        ...mockCampaign,
        reportStyle: "CLASSIC",
        reportStyleSource: "TEMPLATE_DEFAULT",
        reportStyleLockedAt: null,
        template: {
          id: "tpl-1",
          name: "Rockefeller",
          alias: "rockefeller",
        },
        version: {
          questions: [
            { type: "TEXT", answer: "private respondent material" },
          ],
        },
      },
    ]);

    const res = await listGet();
    const query = (db.assessmentCampaign.findMany as jest.Mock).mock.calls[0][0];
    expect(query.include).not.toHaveProperty("version");
    expect(db.assessmentTemplateVersion.findMany).not.toHaveBeenCalled();
    const body = await res.json();
    expect(body.data[0]).not.toHaveProperty("version");
    expect(body.data[0]).not.toHaveProperty(
      "reportStylePreviewCapabilities",
    );
    expect(JSON.stringify(body)).not.toContain("private respondent material");
  });

  it("returns only minimal computed capabilities for an available campaign", async () => {
    process.env.WAVE_REPORT_STYLES_CANARY = "camp-1";
    (getApiActor as jest.Mock).mockResolvedValue(adminActor);
    (db.assessmentCampaign.findMany as jest.Mock).mockResolvedValue([
      {
        ...mockCampaign,
        reportStyle: "CLASSIC",
        reportStyleSource: "TEMPLATE_DEFAULT",
        reportStyleLockedAt: null,
        template: {
          id: "tpl-1",
          name: "Rockefeller",
          alias: "rockefeller",
        },
      },
    ]);
    (db.assessmentTemplateVersion.findMany as jest.Mock).mockResolvedValue([
      {
        id: "ver-1",
        questions: [
          { type: "NUMBER", answer: "private respondent material" },
        ],
      },
    ]);

    const res = await listGet();

    expect(db.assessmentTemplateVersion.findMany).toHaveBeenCalledWith({
      where: { id: { in: ["ver-1"] } },
      select: { id: true, questions: true },
    });
    const body = await res.json();
    expect(body.data[0]).toEqual(
      expect.objectContaining({
        reportStylesAvailable: true,
        reportStylePreviewCapabilities: {
          reportType: "scored",
          hasMetrics: true,
          hasNarrativeResponses: false,
        },
      }),
    );
    expect(body.data[0]).not.toHaveProperty("version");
    expect(JSON.stringify(body)).not.toContain("private respondent material");
  });
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

    it("creates a PUBLIC campaign without an organization", async () => {
      const res = await createPost(makeCreateRequest(validBody) as never);

      expect(res.status).toBe(201);
      expect(db.organization.findUnique).not.toHaveBeenCalled();
      expect(db.assessmentCampaign.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ organizationId: null }),
        }),
      );
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

  describe("template state", () => {
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

    // Wave Q (#6) — disabled templates are refused for NEW public campaigns
    // UNCONDITIONALLY (adversarial-review catch: this was the missed third
    // new-campaign path). Flag env is untouched here: enforcement must hold
    // with the flag OFF.
    it("returns 409 TEMPLATE_DISABLED for a disabled template (flag off)", async () => {
      (db.assessmentTemplate.findUnique as jest.Mock).mockResolvedValue({
        ...mockTemplate,
        disabledAt: new Date("2026-07-02T00:00:00Z"),
      });
      const res = await createPost(makeCreateRequest(validBody) as never);
      expect(res.status).toBe(409);
      const body = await res.json();
      expect(body.error).toBe("TEMPLATE_DISABLED");
      expect(db.assessmentCampaign.create).not.toHaveBeenCalled();
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
      expect(data).not.toHaveProperty("invitedWelcomeSnapshot");
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

    it("snapshots Classic with template-default provenance when appearance writes are unavailable", async () => {
      await createPost(makeCreateRequest(validBody) as never);

      expect(db.assessmentCampaign.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            reportStyle: "CLASSIC",
            reportStyleSource: "TEMPLATE_DEFAULT",
            reportStyleLockedAt: null,
          }),
        }),
      );
    });

    it("snapshots the current template default when no explicit choice is supplied", async () => {
      process.env.WAVE_REPORT_STYLES_ENABLED = "1";

      await createPost(makeCreateRequest(validBody) as never);

      expect(db.assessmentCampaign.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            reportStyle: "MODERN_DASHBOARD",
            reportStyleSource: "TEMPLATE_DEFAULT",
            reportStyleLockedAt: null,
          }),
        }),
      );
    });

    it("preserves explicit intent when the choice equals the template default", async () => {
      process.env.WAVE_REPORT_STYLES_ENABLED = "1";

      await createPost(
        makeCreateRequest({ ...validBody, reportStyle: "MODERN_DASHBOARD" }) as never,
      );

      expect(db.assessmentCampaign.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            reportStyle: "MODERN_DASHBOARD",
            reportStyleSource: "CAMPAIGN_OVERRIDE",
            reportStyleLockedAt: null,
          }),
        }),
      );
    });

    it("honors an exact template canary for an explicit choice", async () => {
      process.env.WAVE_REPORT_STYLES_CANARY = "tpl-1";

      const res = await createPost(
        makeCreateRequest({ ...validBody, reportStyle: "EXECUTIVE_BOARDROOM" }) as never,
      );

      expect(res.status).toBe(201);
      expect(db.assessmentCampaign.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            reportStyle: "EXECUTIVE_BOARDROOM",
            reportStyleSource: "CAMPAIGN_OVERRIDE",
          }),
        }),
      );
    });

    it("rejects a crafted non-Classic choice while the server flag is off", async () => {
      const res = await createPost(
        makeCreateRequest({ ...validBody, reportStyle: "EXECUTIVE_BOARDROOM" }) as never,
      );

      expect(res.status).toBe(400);
      expect(db.assessmentCampaign.create).not.toHaveBeenCalled();
    });

    it("rejects a crafted non-Classic choice while the kill switch overrides the flag", async () => {
      process.env.WAVE_REPORT_STYLES_ENABLED = "1";
      process.env.WAVE_REPORT_STYLES_KILL = "1";

      const res = await createPost(
        makeCreateRequest({ ...validBody, reportStyle: "MODERN_DASHBOARD" }) as never,
      );

      expect(res.status).toBe(400);
      expect(db.assessmentCampaign.create).not.toHaveBeenCalled();
    });

    it("rejects a report style outside the closed catalog before campaign creation", async () => {
      process.env.WAVE_REPORT_STYLES_ENABLED = "1";

      const res = await createPost(
        makeCreateRequest({ ...validBody, reportStyle: "NOT_A_STYLE" }) as never,
      );

      expect(res.status).toBe(400);
      expect(db.assessmentCampaign.create).not.toHaveBeenCalled();
    });

    it("calls logAudit with CREATE action and PUBLIC accessMode", async () => {
      await createPost(makeCreateRequest(validBody) as never);

      expect(logAudit).toHaveBeenCalledWith(
        expect.objectContaining({
          action: "CREATE",
          entityType: "AssessmentCampaign",
          changes: expect.objectContaining({
            accessMode: "PUBLIC",
            organizationId: null,
          }),
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

    it.each([
      ["equal to", "2026-07-01T00:00:00.000Z"],
      ["before", "2026-06-30T23:59:59.999Z"],
    ])(
      "rejects closeAt %s openAt before creating a campaign",
      async (_relationship, closeAt) => {
        const res = await createPost(
          makeCreateRequest({ ...validBody, closeAt }) as never,
        );

        expect(res.status).toBe(400);
        await expect(res.json()).resolves.toEqual({
          success: false,
          error: "closeAt must be after openAt",
        });
        expect(db.assessmentCampaign.create).not.toHaveBeenCalled();
      },
    );
  });

  describe("P2002 alias collision fallback", () => {
    beforeEach(() => {
      (getApiActor as jest.Mock).mockResolvedValue(adminActor);
    });

    it("retries with a random suffix on P2002 error", async () => {
      process.env.WAVE_REPORT_STYLES_ENABLED = "1";
      const p2002 = Object.assign(new Error("Unique constraint"), {
        code: "P2002",
      });
      (db.assessmentCampaign.create as jest.Mock)
        .mockRejectedValueOnce(p2002)
        .mockResolvedValueOnce({ ...mockCampaign, alias: "rockefeller_pub_260701000000_abc123" });

      const res = await createPost(
        makeCreateRequest({ ...validBody, reportStyle: "EXECUTIVE_BOARDROOM" }) as never,
      );
      expect(res.status).toBe(201);
      expect(db.assessmentCampaign.create).toHaveBeenCalledTimes(2);
      expect(
        (db.assessmentCampaign.create as jest.Mock).mock.calls.map(
          ([args]) => args.data.organizationId,
        ),
      ).toEqual([null, null]);
      // Second call alias has a suffix
      const secondAlias = (db.assessmentCampaign.create as jest.Mock).mock.calls[1][0].data.alias;
      expect(secondAlias).toMatch(/rockefeller_pub_\d{12}_[a-z0-9]+/);
      expect(
        (db.assessmentCampaign.create as jest.Mock).mock.calls.map(
          ([call]) => call.data,
        ),
      ).toEqual([
        expect.objectContaining({
          reportStyle: "EXECUTIVE_BOARDROOM",
          reportStyleSource: "CAMPAIGN_OVERRIDE",
          reportStyleLockedAt: null,
        }),
        expect.objectContaining({
          reportStyle: "EXECUTIVE_BOARDROOM",
          reportStyleSource: "CAMPAIGN_OVERRIDE",
          reportStyleLockedAt: null,
        }),
      ]);
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
