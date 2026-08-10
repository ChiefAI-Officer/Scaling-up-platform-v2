/**
 * Assessment v7.6 — GET/POST /api/assessment-campaigns.
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

jest.mock("@/lib/db", () => {
  const assessmentTemplate = { findUnique: jest.fn(), findMany: jest.fn() };
  const assessmentCampaign = {
    findMany: jest.fn(),
    create: jest.fn(),
  };
  return { db: {
    organization: { findUnique: jest.fn() },
    coach: { findUnique: jest.fn() },
    accessGroupCoach: { findMany: jest.fn().mockResolvedValue([]) },
    accessGroupTemplate: { findMany: jest.fn().mockResolvedValue([]) },
    assessmentTemplate,
    assessmentTemplateVersion: { findFirst: jest.fn() },
    assessmentCampaign,
    orgTeam: { findMany: jest.fn().mockResolvedValue([]) },
    $transaction: jest.fn(async (callback) =>
      callback({
        assessmentTemplate,
        assessmentCampaign,
        assessmentCampaignParticipant: { createMany: jest.fn() },
        auditLog: { create: jest.fn() },
      }),
    ),
    auditLog: { create: jest.fn().mockResolvedValue(undefined) },
  }};
});

jest.mock("@/lib/auth/authorization", () => ({
  getApiActor: jest.fn(),
  isPrivilegedRole: (role: string) => role === "ADMIN" || role === "STAFF",
}));

jest.mock("@/lib/rate-limit", () => ({
  RateLimits: { standard: {} },
  withRateLimit: jest.fn().mockResolvedValue({ allowed: true, headers: {} }),
}));

import { GET, POST } from "@/app/api/assessment-campaigns/route";
import { GET as listTemplates } from "@/app/api/assessment-templates/route";
import { db } from "@/lib/db";
import { getApiActor } from "@/lib/auth/authorization";

const mockWaveDCampaignCreate = db.assessmentCampaign.create as jest.Mock;

const coachActor = {
  userId: "u1",
  email: "coach@example.com",
  role: "COACH" as const,
  coachId: "coach-1",
};
const adminActor = {
  userId: "admin-u",
  email: "admin@example.com",
  role: "ADMIN" as const,
  coachId: null,
};

function jsonReq(body: unknown, method = "POST"): Request {
  return new Request("http://localhost/api/assessment-campaigns", {
    method,
    body: JSON.stringify(body),
    headers: { "Content-Type": "application/json" },
  });
}

beforeEach(() => {
  jest.clearAllMocks();
  delete process.env.WAVE_REPORT_STYLES_ENABLED;
  delete process.env.WAVE_REPORT_STYLES_KILL;
  delete process.env.WAVE_REPORT_STYLES_CANARY;
  delete process.env.WAVE_ADMIN_OWNED_ASSESSMENT_PRESENTATION_ENABLED;
  delete process.env.WAVE_ADMIN_OWNED_ASSESSMENT_PRESENTATION_KILL;
  // Default access-group state: coach in 1 group that grants the template.
  (db.accessGroupCoach.findMany as jest.Mock).mockResolvedValue([
    {
      accessGroupId: "g1",
      coachId: "coach-1",
      accessGroup: { id: "g1", deletedAt: null },
    },
  ]);
  (db.accessGroupTemplate.findMany as jest.Mock).mockResolvedValue([
    { accessGroupId: "g1", templateId: "tpl-1" },
  ]);
  (db.coach.findUnique as jest.Mock).mockResolvedValue({
    id: "coach-1",
    certificationStatus: "ACTIVE",
  });
  (db.organization.findUnique as jest.Mock).mockResolvedValue({
    id: "org-1",
    ownerCoachId: "coach-1",
    deletedAt: null,
    name: "Acme",
  });
  (db.assessmentTemplate.findUnique as jest.Mock).mockResolvedValue({
    id: "tpl-1",
    alias: "rockefeller",
    disabledAt: null,
    defaultReportStyle: "CLASSIC",
    invitedWelcomeDefault: null,
  });
  (db.assessmentTemplateVersion.findFirst as jest.Mock).mockResolvedValue({
    id: "ver-1",
    language: "enUS",
    versionNumber: 1,
    publishedAt: new Date(),
  });
  mockWaveDCampaignCreate.mockResolvedValue({
    id: "c-wave-d",
    alias: "acme_scaling_up_full_260601100000",
  });
});

describe("campaign response persistence-field boundary", () => {
  it("omits invitedWelcomeSnapshot from list responses while the rollout is off", async () => {
    (getApiActor as jest.Mock).mockResolvedValue(coachActor);
    (db.assessmentCampaign.findMany as jest.Mock).mockResolvedValue([
      { id: "c1", invitedWelcomeSnapshot: { schemaVersion: 1 } },
    ]);

    const response = await GET(
      new Request("http://localhost/api/assessment-campaigns") as never,
    );
    const body = await response.json();

    expect(body.data).toEqual([{ id: "c1" }]);
  });
});

describe("GET /api/assessment-templates report-style availability", () => {
  it("exposes a matching template canary without enabling nonmatching templates", async () => {
    process.env.WAVE_REPORT_STYLES_CANARY = "tpl-1";
    (getApiActor as jest.Mock).mockResolvedValue(adminActor);
    (db.assessmentTemplate.findMany as jest.Mock).mockResolvedValue([
      {
        id: "tpl-1",
        name: "Scaling Up Full",
        alias: "scaling-up-full",
        description: null,
        aggregationMode: "FULL_VISIBILITY",
        defaultReportStyle: "MODERN_DASHBOARD",
        sendResultsDefault: false,
        resultsEmailContentApproved: false,
        resultsEmailContentApprovedHash: null,
        resultsEmailSubject: null,
        resultsEmailBodyMarkdown: null,
      },
      {
        id: "tpl-2",
        name: "Scaling Up Full copy",
        alias: "scaling-up-full",
        description: null,
        aggregationMode: "FULL_VISIBILITY",
        defaultReportStyle: "CLASSIC",
        sendResultsDefault: false,
        resultsEmailContentApproved: false,
        resultsEmailContentApprovedHash: null,
        resultsEmailSubject: null,
        resultsEmailBodyMarkdown: null,
      },
    ]);

    const res = await listTemplates(
      new Request("http://localhost/api/assessment-templates") as never,
    );

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data).toEqual([
      expect.objectContaining({ id: "tpl-1", reportStylesEnabled: true }),
      expect.objectContaining({ id: "tpl-2", reportStylesEnabled: false }),
    ]);
  });
});

describe("GET /api/assessment-campaigns", () => {
  it("401 unauthenticated", async () => {
    (getApiActor as jest.Mock).mockResolvedValue(null);
    const res = await GET(
      new Request("http://localhost/api/assessment-campaigns") as never,
    );
    expect(res.status).toBe(401);
  });

  it("coach: filters by createdByCoachId", async () => {
    (getApiActor as jest.Mock).mockResolvedValue(coachActor);
    (db.assessmentCampaign.findMany as jest.Mock).mockResolvedValue([]);
    await GET(
      new Request("http://localhost/api/assessment-campaigns") as never,
    );
    expect(db.assessmentCampaign.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        // SEC-M6: live guard is always present.
        where: { createdByCoachId: "coach-1", deletedAt: null },
      }),
    );
  });

  it("admin: no createdByCoachId filter", async () => {
    (getApiActor as jest.Mock).mockResolvedValue(adminActor);
    (db.assessmentCampaign.findMany as jest.Mock).mockResolvedValue([]);
    await GET(
      new Request("http://localhost/api/assessment-campaigns") as never,
    );
    expect(db.assessmentCampaign.findMany).toHaveBeenCalledWith(
      // SEC-M6: even admins only see live campaigns in the list.
      expect.objectContaining({ where: { deletedAt: null } }),
    );
  });
});

describe("POST /api/assessment-campaigns", () => {
  const validBody = {
    name: "Q3",
    templateId: "tpl-1",
    organizationId: "org-1",
    openAt: "2026-06-01T10:00:00Z",
    endMode: "OPEN_END",
  };

  it("401 unauthenticated", async () => {
    (getApiActor as jest.Mock).mockResolvedValue(null);
    const res = await POST(jsonReq(validBody) as never);
    expect(res.status).toBe(401);
  });

  it("403 when actor has no coachId (admin)", async () => {
    (getApiActor as jest.Mock).mockResolvedValue(adminActor);
    const res = await POST(jsonReq(validBody) as never);
    expect(res.status).toBe(403);
  });

  it("400 invalid body", async () => {
    (getApiActor as jest.Mock).mockResolvedValue(coachActor);
    const res = await POST(jsonReq({ name: "x" }) as never);
    expect(res.status).toBe(400);
  });

  it("400 ENDS_AFTER missing closeAt", async () => {
    (getApiActor as jest.Mock).mockResolvedValue(coachActor);
    const res = await POST(
      jsonReq({ ...validBody, endMode: "ENDS_AFTER" }) as never,
    );
    expect(res.status).toBe(400);
  });

  it("404 when canAccessOrganization false", async () => {
    (getApiActor as jest.Mock).mockResolvedValue(coachActor);
    (db.organization.findUnique as jest.Mock).mockResolvedValue({
      id: "org-1",
      ownerCoachId: "coach-OTHER",
      deletedAt: null,
    });
    const res = await POST(jsonReq(validBody) as never);
    expect(res.status).toBe(404);
  });

  it("403 when canCreateCampaign false (INTERSECTION denial)", async () => {
    (getApiActor as jest.Mock).mockResolvedValue(coachActor);
    // Coach is in 2 groups, but only 1 grants the template → INTERSECTION fails.
    (db.accessGroupCoach.findMany as jest.Mock).mockResolvedValue([
      {
        accessGroupId: "g1",
        coachId: "coach-1",
        accessGroup: { id: "g1", deletedAt: null },
      },
      {
        accessGroupId: "g2",
        coachId: "coach-1",
        accessGroup: { id: "g2", deletedAt: null },
      },
    ]);
    (db.accessGroupTemplate.findMany as jest.Mock).mockResolvedValue([
      { accessGroupId: "g1", templateId: "tpl-1" },
    ]);
    const res = await POST(jsonReq(validBody) as never);
    expect(res.status).toBe(403);
  });

  it("403 when coach not certified", async () => {
    (getApiActor as jest.Mock).mockResolvedValue(coachActor);
    (db.coach.findUnique as jest.Mock).mockResolvedValue({
      id: "coach-1",
      certificationStatus: "PENDING",
    });
    const res = await POST(jsonReq(validBody) as never);
    expect(res.status).toBe(403);
  });

  it("422 TEMPLATE_VERSION_NOT_PUBLISHED when no published version (D2.1 service-layer gate)", async () => {
    (getApiActor as jest.Mock).mockResolvedValue(coachActor);
    (db.assessmentTemplateVersion.findFirst as jest.Mock).mockResolvedValue(null);
    const res = await POST(jsonReq(validBody) as never);
    expect(res.status).toBe(422);
    const body = await res.json();
    expect(body.error).toBe("TEMPLATE_VERSION_NOT_PUBLISHED");
  });

  it("ED8: version resolution carries the archived-exclusion where (persisted admin intent — never flag-gated)", async () => {
    (getApiActor as jest.Mock).mockResolvedValue(coachActor);
    // All-archived template models as findFirst → null under the Active
    // where; the route must 422 exactly like never-published.
    (db.assessmentTemplateVersion.findFirst as jest.Mock).mockResolvedValue(null);
    const res = await POST(jsonReq(validBody) as never);
    expect(res.status).toBe(422);
    expect(db.assessmentTemplateVersion.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          templateId: "tpl-1",
          // C4 — the shared DEFAULT_TEMPLATE_LANGUAGE (value-identical to the
          // old local constant).
          language: "enUS",
          publishedAt: { not: null },
          archivedAt: null,
        },
        orderBy: { versionNumber: "desc" },
      }),
    );
  });

  // ───────────────────────────────────────────────────────────────────────
  // Wave Q (#6) — disabled templates are rejected UNCONDITIONALLY (durable
  // rule: enforcement of persisted admin intent is never flag-gated).
  // ───────────────────────────────────────────────────────────────────────
  describe("Wave Q — disabled template rejection", () => {
    const savedEnabled = process.env.WAVE_Q_ADMIN_CONTROLS_ENABLED;

    beforeEach(() => {
      // Flag explicitly OFF — the 409 must fire anyway.
      delete process.env.WAVE_Q_ADMIN_CONTROLS_ENABLED;
    });

    afterEach(() => {
      if (savedEnabled === undefined) delete process.env.WAVE_Q_ADMIN_CONTROLS_ENABLED;
      else process.env.WAVE_Q_ADMIN_CONTROLS_ENABLED = savedEnabled;
    });

    it("409 TEMPLATE_DISABLED even with the flag OFF; no campaign created", async () => {
      (getApiActor as jest.Mock).mockResolvedValue(coachActor);
      (db.assessmentTemplate.findUnique as jest.Mock).mockResolvedValue({
        id: "tpl-1",
        alias: "rockefeller",
        disabledAt: new Date("2026-07-02T00:00:00Z"),
      });
      const res = await POST(jsonReq(validBody) as never);
      expect(res.status).toBe(409);
      const body = await res.json();
      expect(body).toEqual({
        success: false,
        error: "TEMPLATE_DISABLED",
        message:
          "This template has been disabled and cannot be used for new campaigns.",
      });
      expect(db.assessmentCampaign.create).not.toHaveBeenCalled();
    });

    it("template query selects disabledAt", async () => {
      (getApiActor as jest.Mock).mockResolvedValue(coachActor);
      (db.assessmentCampaign.create as jest.Mock).mockResolvedValue({
        id: "c1",
        alias: "acme_rockefeller_260601100000",
      });
      const res = await POST(jsonReq(validBody) as never);
      expect(res.status).toBe(201);
      expect(db.assessmentTemplate.findUnique).toHaveBeenCalledWith(
        expect.objectContaining({
          select: expect.objectContaining({ disabledAt: true }),
        }),
      );
    });
  });

  it("happy path creates DRAFT campaign with coach ownership", async () => {
    (getApiActor as jest.Mock).mockResolvedValue(coachActor);
    (db.assessmentCampaign.create as jest.Mock).mockResolvedValue({
      id: "c1",
      alias: "acme_rockefeller_260601100000",
      status: "DRAFT",
      templateId: "tpl-1",
      versionId: "ver-1",
      organizationId: "org-1",
    });
    const res = await POST(jsonReq(validBody) as never);
    expect(res.status).toBe(201);
    expect(db.assessmentCampaign.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: "DRAFT",
          createdByCoachId: "coach-1",
          createdBy: "u1",
          templateId: "tpl-1",
          organizationId: "org-1",
          versionId: "ver-1",
          language: "enUS",
        }),
      }),
    );
  });

  it("copies the freshly loaded template default when no report style is chosen", async () => {
    process.env.WAVE_REPORT_STYLES_ENABLED = "1";
    (getApiActor as jest.Mock).mockResolvedValue(coachActor);
    (db.assessmentTemplate.findUnique as jest.Mock).mockResolvedValue({
      id: "tpl-1",
      alias: "scaling-up-full",
      disabledAt: null,
      defaultReportStyle: "MODERN_DASHBOARD",
    });
    (db.assessmentCampaign.create as jest.Mock).mockResolvedValue({
      id: "c1",
      alias: "acme_scaling_up_full_260601100000",
    });

    const res = await POST(jsonReq(validBody) as never);

    expect(res.status).toBe(201);
    expect(db.assessmentCampaign.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          reportStyle: "MODERN_DASHBOARD",
          reportStyleSource: "TEMPLATE_DEFAULT",
        }),
      }),
    );
  });

  it("records CAMPAIGN_OVERRIDE when the explicit style equals the current template default", async () => {
    process.env.WAVE_REPORT_STYLES_ENABLED = "1";
    (getApiActor as jest.Mock).mockResolvedValue(coachActor);
    (db.assessmentTemplate.findUnique as jest.Mock).mockResolvedValue({
      id: "tpl-1",
      alias: "scaling-up-full",
      disabledAt: null,
      defaultReportStyle: "MODERN_DASHBOARD",
    });
    (db.assessmentCampaign.create as jest.Mock).mockResolvedValue({ id: "c1" });

    const res = await POST(
      jsonReq({ ...validBody, reportStyle: "MODERN_DASHBOARD" }) as never,
    );

    expect(res.status).toBe(201);
    expect(db.assessmentCampaign.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          reportStyle: "MODERN_DASHBOARD",
          reportStyleSource: "CAMPAIGN_OVERRIDE",
        }),
      }),
    );
  });

  it("records CAMPAIGN_OVERRIDE when the explicit style differs from the current template default", async () => {
    process.env.WAVE_REPORT_STYLES_ENABLED = "1";
    (getApiActor as jest.Mock).mockResolvedValue(coachActor);
    (db.assessmentTemplate.findUnique as jest.Mock).mockResolvedValue({
      id: "tpl-1",
      alias: "scaling-up-full",
      disabledAt: null,
      defaultReportStyle: "MODERN_DASHBOARD",
    });
    (db.assessmentCampaign.create as jest.Mock).mockResolvedValue({ id: "c1" });

    const res = await POST(
      jsonReq({ ...validBody, reportStyle: "EXECUTIVE_BOARDROOM" }) as never,
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

  it("400 rejects a report style outside the closed catalog before it creates a campaign", async () => {
    (getApiActor as jest.Mock).mockResolvedValue(coachActor);

    const res = await POST(
      jsonReq({ ...validBody, reportStyle: "NOT_A_STYLE" }) as never,
    );

    expect(res.status).toBe(400);
    expect(db.assessmentCampaign.create).not.toHaveBeenCalled();
  });

  it("accepts a valid report style for a template with an arbitrary alias", async () => {
    process.env.WAVE_REPORT_STYLES_ENABLED = "1";
    (getApiActor as jest.Mock).mockResolvedValue(coachActor);
    (db.assessmentTemplate.findUnique as jest.Mock).mockResolvedValue({
      id: "tpl-1",
      alias: "custom-instrument",
      disabledAt: null,
      defaultReportStyle: "MODERN_DASHBOARD",
    });
    (db.assessmentCampaign.create as jest.Mock).mockResolvedValue({ id: "c1" });

    const res = await POST(
      jsonReq({ ...validBody, reportStyle: "EXECUTIVE_BOARDROOM" }) as never,
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

  it("forces Classic in the legacy lane while report styles are unavailable", async () => {
    (getApiActor as jest.Mock).mockResolvedValue(coachActor);
    (db.assessmentTemplate.findUnique as jest.Mock).mockResolvedValue({
      id: "tpl-1",
      alias: "scaling-up-full",
      disabledAt: null,
      defaultReportStyle: "MODERN_DASHBOARD",
    });
    (db.assessmentCampaign.create as jest.Mock).mockResolvedValue({ id: "c1" });

    const res = await POST(
      jsonReq({ ...validBody, reportStyle: "EXECUTIVE_BOARDROOM" }) as never,
    );

    expect(res.status).toBe(201);
    expect(db.assessmentCampaign.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          reportStyle: "CLASSIC",
          reportStyleSource: "TEMPLATE_DEFAULT",
        }),
      }),
    );
  });

  it("persists the same resolved fields in the Wave-D transaction lane", async () => {
    process.env.WAVE_REPORT_STYLES_ENABLED = "1";
    (getApiActor as jest.Mock).mockResolvedValue(coachActor);
    (db.assessmentTemplate.findUnique as jest.Mock).mockResolvedValue({
      id: "tpl-1",
      alias: "scaling-up-full",
      disabledAt: null,
      defaultReportStyle: "MODERN_DASHBOARD",
    });

    const res = await POST(
      jsonReq({
        ...validBody,
        reportStyle: "EXECUTIVE_BOARDROOM",
        waveD: true,
      }) as never,
    );

    expect(res.status).toBe(201);
    expect(mockWaveDCampaignCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          reportStyle: "EXECUTIVE_BOARDROOM",
          reportStyleSource: "CAMPAIGN_OVERRIDE",
        }),
      }),
    );
  });

  it("forces Classic in the Wave-D transaction lane while report styles are unavailable", async () => {
    (getApiActor as jest.Mock).mockResolvedValue(coachActor);
    (db.assessmentTemplate.findUnique as jest.Mock).mockResolvedValue({
      id: "tpl-1",
      alias: "scaling-up-full",
      disabledAt: null,
      defaultReportStyle: "MODERN_DASHBOARD",
    });

    const res = await POST(
      jsonReq({
        ...validBody,
        reportStyle: "EXECUTIVE_BOARDROOM",
        waveD: true,
      }) as never,
    );

    expect(res.status).toBe(201);
    expect(mockWaveDCampaignCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          reportStyle: "CLASSIC",
          reportStyleSource: "TEMPLATE_DEFAULT",
        }),
      }),
    );
  });

  it("falls back to suffixed alias on P2002 collision", async () => {
    (getApiActor as jest.Mock).mockResolvedValue(coachActor);
    let calls = 0;
    (db.assessmentCampaign.create as jest.Mock).mockImplementation(() => {
      calls += 1;
      if (calls === 1) {
        throw Object.assign(new Error("dup"), { code: "P2002" });
      }
      return Promise.resolve({
        id: "c1",
        alias: "acme_rockefeller_260601100000_a1b2c3",
      });
    });
    const res = await POST(jsonReq(validBody) as never);
    expect(res.status).toBe(201);
    expect(db.assessmentCampaign.create).toHaveBeenCalledTimes(2);
  });
});
