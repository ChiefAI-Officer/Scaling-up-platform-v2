/**
 * Assessment v7.6 — GET/PATCH /api/assessment-campaigns/[id].
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

jest.mock("@/lib/db", () => ({
  db: {
    organization: { findUnique: jest.fn() },
    accessGroupCoach: { findMany: jest.fn().mockResolvedValue([]) },
    accessGroupTemplate: { findMany: jest.fn().mockResolvedValue([]) },
    assessmentCampaign: (() => {
      // SEC-M6: canManageCampaign now loads via findFirst → delegate to
      // findUnique so existing sequencing is preserved.
      const findUnique = jest.fn();
      const findFirst = jest.fn((args) => findUnique(args));
      return { findUnique, findFirst, update: jest.fn(), updateMany: jest.fn() };
    })(),
    auditLog: { create: jest.fn().mockResolvedValue(undefined) },
  },
}));

jest.mock("@/lib/auth/authorization", () => ({
  getApiActor: jest.fn(),
  isPrivilegedRole: (role: string) => role === "ADMIN" || role === "STAFF",
}));

jest.mock("@/lib/rate-limit", () => ({
  RateLimits: { standard: {} },
  withRateLimit: jest.fn().mockResolvedValue({ allowed: true, headers: {} }),
}));

import { GET, PATCH } from "@/app/api/assessment-campaigns/[id]/route";
import { db } from "@/lib/db";
import { getApiActor } from "@/lib/auth/authorization";

const coachActor = {
  userId: "u1",
  email: "coach@example.com",
  role: "COACH" as const,
  coachId: "coach-1",
};
const otherCoachActor = {
  userId: "u2",
  email: "other@example.com",
  role: "COACH" as const,
  coachId: "coach-2",
};

function detailParams(id: string) {
  return { params: Promise.resolve({ id }) };
}

beforeEach(() => {
  jest.clearAllMocks();
  delete process.env.WAVE_D_CUSTOM_HTML_EMAIL_ENABLED;
  delete process.env.ASSESSMENT_INVITE_BRANDED_CUSTOM_HTML_ENABLED;
  delete process.env.WAVE_INVITATION_BANNER_ENABLED;
  delete process.env.WAVE_INVITATION_BANNER_CANARY;
  delete process.env.WAVE_INVITATION_BANNER_KILL;
  delete process.env.WAVE_REPORT_STYLES_ENABLED;
  delete process.env.WAVE_REPORT_STYLES_KILL;
  delete process.env.WAVE_REPORT_STYLES_CANARY;
  delete process.env.WAVE_ADMIN_OWNED_ASSESSMENT_PRESENTATION_ENABLED;
  delete process.env.WAVE_ADMIN_OWNED_ASSESSMENT_PRESENTATION_KILL;
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
  (db.organization.findUnique as jest.Mock).mockResolvedValue({
    id: "org-1",
    ownerCoachId: "coach-1",
    deletedAt: null,
  });
});

describe("GET /api/assessment-campaigns/[id]", () => {
  it("401 unauthenticated", async () => {
    (getApiActor as jest.Mock).mockResolvedValue(null);
    const res = await GET(
      new Request("http://localhost/api/assessment-campaigns/c1") as never,
      detailParams("c1"),
    );
    expect(res.status).toBe(401);
  });

  it("404 wrong-coach actor (createdByCoachId mismatch)", async () => {
    (getApiActor as jest.Mock).mockResolvedValue(otherCoachActor);
    (db.assessmentCampaign.findUnique as jest.Mock).mockResolvedValue({
      id: "c1",
      organizationId: "org-1",
      templateId: "tpl-1",
      createdByCoachId: "coach-1",
      status: "DRAFT",
      accessMode: "INVITED",
    });
    const res = await GET(
      new Request("http://localhost/api/assessment-campaigns/c1") as never,
      detailParams("c1"),
    );
    expect(res.status).toBe(404);
  });

  it("happy path: creator coach reads campaign", async () => {
    (getApiActor as jest.Mock).mockResolvedValue(coachActor);
    (db.assessmentCampaign.findUnique as jest.Mock).mockResolvedValue({
      id: "c1",
      organizationId: "org-1",
      templateId: "tpl-1",
      createdByCoachId: "coach-1",
      status: "DRAFT",
      invitedWelcomeSnapshot: { schemaVersion: 1 },
    });
    const res = await GET(
      new Request("http://localhost/api/assessment-campaigns/c1") as never,
      detailParams("c1"),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data).not.toHaveProperty("invitedWelcomeSnapshot");
  });
});

describe("PATCH /api/assessment-campaigns/[id]", () => {
  function patchReq(body: unknown): Request {
    return new Request("http://localhost/api/assessment-campaigns/c1", {
      method: "PATCH",
      body: JSON.stringify(body),
      headers: { "Content-Type": "application/json" },
    });
  }

  it("404 when wrong coach", async () => {
    (getApiActor as jest.Mock).mockResolvedValue(otherCoachActor);
    (db.assessmentCampaign.findUnique as jest.Mock).mockResolvedValue({
      id: "c1",
      organizationId: "org-1",
      templateId: "tpl-1",
      createdByCoachId: "coach-1",
      status: "DRAFT",
    });
    const res = await PATCH(
      patchReq({ name: "Renamed" }) as never,
      detailParams("c1"),
    );
    expect(res.status).toBe(404);
  });

  it("409 only when CLOSED (CLOSED is read-only)", async () => {
    (getApiActor as jest.Mock).mockResolvedValue(coachActor);
    (db.assessmentCampaign.findUnique as jest.Mock).mockResolvedValue({
      id: "c1",
      organizationId: "org-1",
      templateId: "tpl-1",
      createdByCoachId: "coach-1",
      status: "CLOSED",
    });
    const res = await PATCH(
      patchReq({ name: "Renamed" }) as never,
      detailParams("c1"),
    );
    expect(res.status).toBe(409);
  });

  it("200 on an ACTIVE campaign (editable since commit 223721f — lock only CLOSED)", async () => {
    (getApiActor as jest.Mock).mockResolvedValue(coachActor);
    (db.assessmentCampaign.findUnique as jest.Mock).mockResolvedValue({
      id: "c1",
      organizationId: "org-1",
      templateId: "tpl-1",
      createdByCoachId: "coach-1",
      status: "ACTIVE",
    });
    (db.assessmentCampaign.update as jest.Mock).mockResolvedValue({
      id: "c1",
      name: "Renamed",
      invitedWelcomeSnapshot: { schemaVersion: 1 },
    });
    const res = await PATCH(
      patchReq({ name: "Renamed" }) as never,
      detailParams("c1"),
    );
    expect(res.status).toBe(200);
    expect((await res.json()).data).not.toHaveProperty(
      "invitedWelcomeSnapshot",
    );
  });

  it("happy path updates name", async () => {
    (getApiActor as jest.Mock).mockResolvedValue(coachActor);
    (db.assessmentCampaign.findUnique as jest.Mock).mockResolvedValue({
      id: "c1",
      organizationId: "org-1",
      templateId: "tpl-1",
      createdByCoachId: "coach-1",
      status: "DRAFT",
    });
    (db.assessmentCampaign.update as jest.Mock).mockResolvedValue({
      id: "c1",
      name: "Renamed",
    });
    const res = await PATCH(
      patchReq({ name: "Renamed" }) as never,
      detailParams("c1"),
    );
    expect(res.status).toBe(200);
    expect(db.assessmentCampaign.update).toHaveBeenCalledWith({
      where: { id: "c1" },
      data: { name: "Renamed" },
    });
  });

  it.each(["ADMIN", "STAFF"] as const)(
    "keeps generic campaign-management writes available to %s",
    async (role) => {
      (getApiActor as jest.Mock).mockResolvedValue({
        ...coachActor,
        role,
        coachId: null,
      });
      (db.assessmentCampaign.findUnique as jest.Mock).mockResolvedValue({
        id: "c1",
        organizationId: "org-1",
        templateId: "tpl-1",
        createdByCoachId: "coach-1",
        status: "DRAFT",
      });
      (db.assessmentCampaign.update as jest.Mock).mockResolvedValue({
        id: "c1",
        name: "Admin rename",
      });

      const res = await PATCH(
        patchReq({ name: "Admin rename" }) as never,
        detailParams("c1"),
      );

      expect(res.status).toBe(200);
      expect(db.assessmentCampaign.update).toHaveBeenCalledWith({
        where: { id: "c1" },
        data: { name: "Admin rename" },
      });
    },
  );

  describe("report appearance", () => {
    function reportStyleCampaign(overrides: Record<string, unknown> = {}) {
      return {
        id: "c1",
        organizationId: "org-1",
        templateId: "tpl-1",
        createdByCoachId: "coach-1",
        status: "ACTIVE",
        versionId: "v1",
        customSlides: null,
        deletedAt: null,
        reportStyle: "CLASSIC",
        reportStyleSource: "TEMPLATE_DEFAULT",
        reportStyleLockedAt: null,
        template: { alias: "scaling-up-full" },
        ...overrides,
      };
    }

    it("owner may set an eligible available campaign style through the atomic conditional write", async () => {
      process.env.WAVE_REPORT_STYLES_ENABLED = "1";
      (getApiActor as jest.Mock).mockResolvedValue(coachActor);
      (db.assessmentCampaign.findUnique as jest.Mock).mockResolvedValue(
        reportStyleCampaign(),
      );
      (db.assessmentCampaign.updateMany as jest.Mock).mockResolvedValue({ count: 1 });

      const res = await PATCH(
        patchReq({ reportStyle: "MODERN_DASHBOARD" }) as never,
        detailParams("c1"),
      );

      expect(res.status).toBe(200);
      expect(db.assessmentCampaign.updateMany).toHaveBeenCalledWith({
        where: { id: "c1", reportStyleLockedAt: null },
        data: {
          reportStyle: "MODERN_DASHBOARD",
          reportStyleSource: "CAMPAIGN_OVERRIDE",
        },
      });
      expect(db.assessmentCampaign.update).not.toHaveBeenCalled();
    });

    it("lets the owner update a closed campaign that has no completed-response lock", async () => {
      process.env.WAVE_REPORT_STYLES_ENABLED = "1";
      (getApiActor as jest.Mock).mockResolvedValue(coachActor);
      (db.assessmentCampaign.findUnique as jest.Mock).mockResolvedValue(
        reportStyleCampaign({ status: "CLOSED" }),
      );
      (db.assessmentCampaign.updateMany as jest.Mock).mockResolvedValue({ count: 1 });

      const res = await PATCH(
        patchReq({ reportStyle: "EXECUTIVE_BOARDROOM" }) as never,
        detailParams("c1"),
      );

      expect(res.status).toBe(200);
      expect(db.assessmentCampaign.updateMany).toHaveBeenCalledWith({
        where: { id: "c1", reportStyleLockedAt: null },
        data: {
          reportStyle: "EXECUTIVE_BOARDROOM",
          reportStyleSource: "CAMPAIGN_OVERRIDE",
        },
      });
    });

    it("rejects a report style mixed with generic campaign fields without update or audit side effects", async () => {
      process.env.WAVE_REPORT_STYLES_ENABLED = "1";
      (getApiActor as jest.Mock).mockResolvedValue(coachActor);
      (db.assessmentCampaign.findUnique as jest.Mock).mockResolvedValue(
        reportStyleCampaign(),
      );

      const res = await PATCH(
        patchReq({ reportStyle: "MODERN_DASHBOARD", name: "Discarded rename" }) as never,
        detailParams("c1"),
      );

      expect(res.status).toBe(400);
      await expect(res.json()).resolves.toEqual({
        success: false,
        error: "Report appearance must be updated separately from other campaign fields",
      });
      expect(db.assessmentCampaign.updateMany).not.toHaveBeenCalled();
      expect(db.assessmentCampaign.update).not.toHaveBeenCalled();
      expect(db.auditLog.create).not.toHaveBeenCalled();
    });

    it("returns 403 when a different coach tries to change the appearance", async () => {
      process.env.WAVE_REPORT_STYLES_ENABLED = "1";
      (getApiActor as jest.Mock).mockResolvedValue(otherCoachActor);
      (db.assessmentCampaign.findUnique as jest.Mock).mockResolvedValue(
        reportStyleCampaign(),
      );

      const res = await PATCH(
        patchReq({ reportStyle: "MODERN_DASHBOARD" }) as never,
        detailParams("c1"),
      );

      expect(res.status).toBe(403);
      expect(db.assessmentCampaign.updateMany).not.toHaveBeenCalled();
    });

    it.each(["ADMIN", "STAFF"] as const)(
      "returns 403 when %s tries to change a coach-owned campaign appearance",
      async (role) => {
        process.env.WAVE_REPORT_STYLES_ENABLED = "1";
        (getApiActor as jest.Mock).mockResolvedValue({
          ...coachActor,
          role,
          coachId: null,
        });
        (db.assessmentCampaign.findUnique as jest.Mock).mockResolvedValue(
          reportStyleCampaign(),
        );

        const res = await PATCH(
          patchReq({ reportStyle: "EXECUTIVE_BOARDROOM" }) as never,
          detailParams("c1"),
        );

        expect(res.status).toBe(403);
        expect(db.assessmentCampaign.updateMany).not.toHaveBeenCalled();
      },
    );

    it("returns the stable admin-owned error to a coach without update or audit", async () => {
      process.env.WAVE_ADMIN_OWNED_ASSESSMENT_PRESENTATION_ENABLED = "1";
      process.env.WAVE_REPORT_STYLES_ENABLED = "1";
      (getApiActor as jest.Mock).mockResolvedValue(coachActor);
      (db.assessmentCampaign.findUnique as jest.Mock).mockResolvedValue(
        reportStyleCampaign(),
      );

      const res = await PATCH(
        patchReq({ reportStyle: "MODERN_DASHBOARD" }) as never,
        detailParams("c1"),
      );

      expect(res.status).toBe(403);
      await expect(res.json()).resolves.toEqual({
        success: false,
        error: "REPORT_STYLE_ADMIN_OWNED",
      });
      expect(db.assessmentCampaign.updateMany).not.toHaveBeenCalled();
      expect(db.assessmentCampaign.update).not.toHaveBeenCalled();
      expect(db.auditLog.create).not.toHaveBeenCalled();
    });

    it.each(["ADMIN", "STAFF"] as const)(
      "keeps the isolated compatibility write lane for %s in admin-owned mode",
      async (role) => {
        process.env.WAVE_ADMIN_OWNED_ASSESSMENT_PRESENTATION_ENABLED = "1";
        process.env.WAVE_REPORT_STYLES_ENABLED = "1";
        (getApiActor as jest.Mock).mockResolvedValue({
          ...coachActor,
          role,
          coachId: null,
        });
        (db.assessmentCampaign.findUnique as jest.Mock).mockResolvedValue(
          reportStyleCampaign(),
        );
        (db.assessmentCampaign.updateMany as jest.Mock).mockResolvedValue({ count: 1 });

        const res = await PATCH(
          patchReq({ reportStyle: "EXECUTIVE_BOARDROOM" }) as never,
          detailParams("c1"),
        );

        expect(res.status).toBe(200);
        expect(db.assessmentCampaign.updateMany).toHaveBeenCalledWith({
          where: { id: "c1", reportStyleLockedAt: null },
          data: {
            reportStyle: "EXECUTIVE_BOARDROOM",
            reportStyleSource: "CAMPAIGN_OVERRIDE",
          },
        });
      },
    );

    it("keeps the first-response lock on the active admin compatibility lane", async () => {
      process.env.WAVE_ADMIN_OWNED_ASSESSMENT_PRESENTATION_ENABLED = "1";
      process.env.WAVE_REPORT_STYLES_ENABLED = "1";
      (getApiActor as jest.Mock).mockResolvedValue({
        ...coachActor,
        role: "ADMIN",
        coachId: null,
      });
      (db.assessmentCampaign.findUnique as jest.Mock).mockResolvedValue(
        reportStyleCampaign({
          reportStyleLockedAt: new Date("2026-08-06T04:00:00.000Z"),
        }),
      );

      const res = await PATCH(
        patchReq({ reportStyle: "EXECUTIVE_BOARDROOM" }) as never,
        detailParams("c1"),
      );

      expect(res.status).toBe(409);
      await expect(res.json()).resolves.toEqual(
        expect.objectContaining({ error: "REPORT_STYLE_LOCKED" }),
      );
      expect(db.assessmentCampaign.updateMany).not.toHaveBeenCalled();
      expect(db.auditLog.create).not.toHaveBeenCalled();
    });

    it("rejects an invalid appearance key before any campaign mutation", async () => {
      process.env.WAVE_REPORT_STYLES_ENABLED = "1";
      (getApiActor as jest.Mock).mockResolvedValue(coachActor);

      const res = await PATCH(
        patchReq({ reportStyle: "NOT_A_REPORT_STYLE" }) as never,
        detailParams("c1"),
      );

      expect(res.status).toBe(400);
      expect(db.assessmentCampaign.updateMany).not.toHaveBeenCalled();
      expect(db.assessmentCampaign.update).not.toHaveBeenCalled();
    });

    it("allows an arbitrary template alias when report appearances are available", async () => {
      process.env.WAVE_REPORT_STYLES_ENABLED = "1";
      (getApiActor as jest.Mock).mockResolvedValue(coachActor);
      (db.assessmentCampaign.findUnique as jest.Mock).mockResolvedValue(
        reportStyleCampaign({ template: { alias: "rockefeller-habits" } }),
      );
      (db.assessmentCampaign.updateMany as jest.Mock).mockResolvedValue({ count: 1 });

      const res = await PATCH(
        patchReq({ reportStyle: "MODERN_DASHBOARD" }) as never,
        detailParams("c1"),
      );

      expect(res.status).toBe(200);
      expect(db.assessmentCampaign.updateMany).toHaveBeenCalled();
    });

    it("rejects flag-off updates without mutating", async () => {
      (getApiActor as jest.Mock).mockResolvedValue(coachActor);
      (db.assessmentCampaign.findUnique as jest.Mock).mockResolvedValue(
        reportStyleCampaign(),
      );

      const res = await PATCH(
        patchReq({ reportStyle: "MODERN_DASHBOARD" }) as never,
        detailParams("c1"),
      );

      expect(res.status).toBe(400);
      expect(db.assessmentCampaign.updateMany).not.toHaveBeenCalled();
    });

    it("returns the final locked appearance when the conditional update loses to completion", async () => {
      process.env.WAVE_REPORT_STYLES_ENABLED = "1";
      (getApiActor as jest.Mock).mockResolvedValue(coachActor);
      (db.assessmentCampaign.findUnique as jest.Mock)
        .mockResolvedValueOnce(reportStyleCampaign())
        .mockResolvedValueOnce(reportStyleCampaign())
        .mockResolvedValueOnce(
          reportStyleCampaign({
            reportStyle: "EXECUTIVE_BOARDROOM",
            reportStyleSource: "CAMPAIGN_OVERRIDE",
            reportStyleLockedAt: new Date("2026-08-06T04:00:00.000Z"),
          }),
        );
      (db.assessmentCampaign.updateMany as jest.Mock).mockResolvedValue({ count: 0 });

      const res = await PATCH(
        patchReq({ reportStyle: "MODERN_DASHBOARD" }) as never,
        detailParams("c1"),
      );

      expect(res.status).toBe(409);
      await expect(res.json()).resolves.toEqual({
        error: "REPORT_STYLE_LOCKED",
        message:
          "Report appearance was locked when the first response completed. Refresh to see the final style.",
        data: {
          id: "c1",
          reportStyle: "EXECUTIVE_BOARDROOM",
          reportStyleSource: "CAMPAIGN_OVERRIDE",
          reportStyleLockedAt: "2026-08-06T04:00:00.000Z",
        },
      });
    });

    it("returns the final locked appearance to the authorized owner", async () => {
      process.env.WAVE_REPORT_STYLES_ENABLED = "1";
      (getApiActor as jest.Mock).mockResolvedValue(coachActor);
      (db.assessmentCampaign.findUnique as jest.Mock).mockResolvedValue(
        reportStyleCampaign({
          reportStyle: "MODERN_DASHBOARD",
          reportStyleSource: "CAMPAIGN_OVERRIDE",
          reportStyleLockedAt: new Date("2026-08-05T09:30:00.000Z"),
        }),
      );

      const res = await PATCH(
        patchReq({ reportStyle: "CLASSIC" }) as never,
        detailParams("c1"),
      );

      expect(res.status).toBe(409);
      await expect(res.json()).resolves.toEqual({
        error: "REPORT_STYLE_LOCKED",
        message:
          "Report appearance was locked when the first response completed. Refresh to see the final style.",
        data: {
          id: "c1",
          reportStyle: "MODERN_DASHBOARD",
          reportStyleSource: "CAMPAIGN_OVERRIDE",
          reportStyleLockedAt: "2026-08-05T09:30:00.000Z",
        },
      });
      expect(db.assessmentCampaign.updateMany).not.toHaveBeenCalled();
    });

    it.each([
      ["different coach", otherCoachActor],
      ["admin", { ...coachActor, role: "ADMIN" as const, coachId: null }],
      ["staff", { ...coachActor, role: "STAFF" as const, coachId: null }],
    ])("returns metadata-free 403 to %s when the campaign appearance is already locked", async (_label, actor) => {
      process.env.WAVE_REPORT_STYLES_ENABLED = "1";
      (getApiActor as jest.Mock).mockResolvedValue(actor);
      (db.assessmentCampaign.findUnique as jest.Mock).mockResolvedValue(
        reportStyleCampaign({
          reportStyle: "MODERN_DASHBOARD",
          reportStyleSource: "CAMPAIGN_OVERRIDE",
          reportStyleLockedAt: new Date("2026-08-05T09:30:00.000Z"),
        }),
      );

      const res = await PATCH(
        patchReq({ reportStyle: "CLASSIC" }) as never,
        detailParams("c1"),
      );

      expect(res.status).toBe(403);
      await expect(res.json()).resolves.toEqual({
        success: false,
        error: "Forbidden",
      });
      expect(db.assessmentCampaign.updateMany).not.toHaveBeenCalled();
    });
  });

  // ── Task 12 (#20) — full-HTML invitation body on PATCH ──────────────────
  const ORIGINAL_HTML_FLAG = process.env.WAVE_D_CUSTOM_HTML_EMAIL_ENABLED;
  const ORIGINAL_BRANDED_HTML_FLAG = process.env.ASSESSMENT_INVITE_BRANDED_CUSTOM_HTML_ENABLED;
  const ORIGINAL_BANNER_FLAG = process.env.WAVE_INVITATION_BANNER_ENABLED;
  const ORIGINAL_BANNER_CANARY = process.env.WAVE_INVITATION_BANNER_CANARY;
  const ORIGINAL_BANNER_KILL = process.env.WAVE_INVITATION_BANNER_KILL;
  const VALID_HTML = '<h1>Hi {{respondentFirstName}}</h1><a href="{{invitationUrl}}">Go</a>';

  function draftActorSetup() {
    (getApiActor as jest.Mock).mockResolvedValue(coachActor);
    (db.assessmentCampaign.findUnique as jest.Mock).mockResolvedValue({
      id: "c1",
      organizationId: "org-1",
      templateId: "tpl-1",
      createdByCoachId: "coach-1",
      status: "DRAFT",
      accessMode: "INVITED",
    });
    (db.assessmentCampaign.update as jest.Mock).mockResolvedValue({ id: "c1" });
  }

  afterAll(() => {
    if (ORIGINAL_HTML_FLAG === undefined) delete process.env.WAVE_D_CUSTOM_HTML_EMAIL_ENABLED;
    else process.env.WAVE_D_CUSTOM_HTML_EMAIL_ENABLED = ORIGINAL_HTML_FLAG;
    if (ORIGINAL_BRANDED_HTML_FLAG === undefined) {
      delete process.env.ASSESSMENT_INVITE_BRANDED_CUSTOM_HTML_ENABLED;
    } else {
      process.env.ASSESSMENT_INVITE_BRANDED_CUSTOM_HTML_ENABLED = ORIGINAL_BRANDED_HTML_FLAG;
    }
    if (ORIGINAL_BANNER_FLAG === undefined) delete process.env.WAVE_INVITATION_BANNER_ENABLED;
    else process.env.WAVE_INVITATION_BANNER_ENABLED = ORIGINAL_BANNER_FLAG;
    if (ORIGINAL_BANNER_CANARY === undefined) delete process.env.WAVE_INVITATION_BANNER_CANARY;
    else process.env.WAVE_INVITATION_BANNER_CANARY = ORIGINAL_BANNER_CANARY;
    if (ORIGINAL_BANNER_KILL === undefined) delete process.env.WAVE_INVITATION_BANNER_KILL;
    else process.env.WAVE_INVITATION_BANNER_KILL = ORIGINAL_BANNER_KILL;
  });

  it("flag ON + valid invitationBodyHtml → stored RAW", async () => {
    process.env.WAVE_D_CUSTOM_HTML_EMAIL_ENABLED = "1";
    draftActorSetup();
    const res = await PATCH(patchReq({ invitationBodyHtml: VALID_HTML }) as never, detailParams("c1"));
    expect(res.status).toBe(200);
    expect(db.assessmentCampaign.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ invitationBodyHtml: VALID_HTML }),
      }),
    );
  });

  it("flag ON + invitationBodyHtml missing the URL token → 400, no update", async () => {
    process.env.WAVE_D_CUSTOM_HTML_EMAIL_ENABLED = "1";
    draftActorSetup();
    const res = await PATCH(
      patchReq({ invitationBodyHtml: "<p>No token here</p>" }) as never,
      detailParams("c1"),
    );
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(String(json.error)).toMatch(/survey link token/i);
    expect(db.assessmentCampaign.update).not.toHaveBeenCalled();
  });

  it("flag ON + empty string clears the override (stored null)", async () => {
    process.env.WAVE_D_CUSTOM_HTML_EMAIL_ENABLED = "1";
    draftActorSetup();
    const res = await PATCH(patchReq({ invitationBodyHtml: "" }) as never, detailParams("c1"));
    expect(res.status).toBe(200);
    expect(db.assessmentCampaign.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ invitationBodyHtml: null }),
      }),
    );
  });

  it("flag OFF → invitationBodyHtml ignored (not in the update payload)", async () => {
    delete process.env.WAVE_D_CUSTOM_HTML_EMAIL_ENABLED;
    draftActorSetup();
    const res = await PATCH(
      patchReq({ name: "Renamed", invitationBodyHtml: VALID_HTML }) as never,
      detailParams("c1"),
    );
    expect(res.status).toBe(200);
    const callArg = (db.assessmentCampaign.update as jest.Mock).mock.calls[0][0];
    expect(callArg.data).not.toHaveProperty("invitationBodyHtml");
  });

  it("both flags ON accepts tokenless HTML and stores the raw bytes", async () => {
    process.env.WAVE_D_CUSTOM_HTML_EMAIL_ENABLED = "1";
    process.env.ASSESSMENT_INVITE_BRANDED_CUSTOM_HTML_ENABLED = "1";
    draftActorSetup();
    const raw = "<h1>Coach-authored body</h1>";
    const response = await PATCH(
      patchReq({ invitationBodyHtml: raw }) as never,
      detailParams("c1"),
    );
    expect(response.status).toBe(200);
    expect(db.assessmentCampaign.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ invitationBodyHtml: raw }),
      }),
    );
  });

  it("branded mode OFF rejects tokenless HTML without writing", async () => {
    process.env.WAVE_D_CUSTOM_HTML_EMAIL_ENABLED = "1";
    delete process.env.ASSESSMENT_INVITE_BRANDED_CUSTOM_HTML_ENABLED;
    draftActorSetup();
    const response = await PATCH(
      patchReq({ invitationBodyHtml: "<p>No URL token</p>" }) as never,
      detailParams("c1"),
    );
    expect(response.status).toBe(400);
    expect(db.assessmentCampaign.update).not.toHaveBeenCalled();
  });

  it.each([
    ["global enablement", "global", "ignored"],
    ["organization canary", "canary", "org-1"],
    ["template canary", "canary", "tpl-1"],
  ])("universal banner %s accepts a body-only partial PATCH with GH220 off", async (_name, mode, value) => {
    process.env.WAVE_D_CUSTOM_HTML_EMAIL_ENABLED = "1";
    delete process.env.ASSESSMENT_INVITE_BRANDED_CUSTOM_HTML_ENABLED;
    if (mode === "global") process.env.WAVE_INVITATION_BANNER_ENABLED = "1";
    else process.env.WAVE_INVITATION_BANNER_CANARY = value;
    draftActorSetup();

    const response = await PATCH(
      patchReq({ invitationBodyHtml: "<p>Body fragment</p>" }) as never,
      detailParams("c1"),
    );

    expect(response.status).toBe(200);
    expect(db.assessmentCampaign.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ invitationBodyHtml: "<p>Body fragment</p>" }),
      }),
    );
  });

  it.each([
    ["global enablement", "global"],
    ["template canary", "template"],
  ])("PUBLIC campaign under universal banner %s still requires the legacy URL token", async (_name, mode) => {
    process.env.WAVE_D_CUSTOM_HTML_EMAIL_ENABLED = "1";
    delete process.env.ASSESSMENT_INVITE_BRANDED_CUSTOM_HTML_ENABLED;
    if (mode === "global") process.env.WAVE_INVITATION_BANNER_ENABLED = "1";
    else process.env.WAVE_INVITATION_BANNER_CANARY = "tpl-1";
    draftActorSetup();
    (getApiActor as jest.Mock).mockResolvedValue({
      userId: "admin-1",
      email: "admin@example.com",
      role: "ADMIN",
      coachId: null,
    });
    (db.assessmentCampaign.findUnique as jest.Mock).mockResolvedValue({
      id: "c1",
      organizationId: null,
      templateId: "tpl-1",
      createdByCoachId: null,
      status: "DRAFT",
      accessMode: "PUBLIC",
    });

    const response = await PATCH(
      patchReq({ invitationBodyHtml: "<p>Body fragment</p>" }) as never,
      detailParams("c1"),
    );

    expect(response.status).toBe(400);
    expect(db.assessmentCampaign.update).not.toHaveBeenCalled();
  });

  it.each([
    ["flag off", undefined, undefined],
    ["nonmatching canary", "other-org", undefined],
    ["kill switch", "org-1", "1"],
  ])("universal banner %s retains the PATCH URL-token requirement", async (_name, canary, kill) => {
    process.env.WAVE_D_CUSTOM_HTML_EMAIL_ENABLED = "1";
    if (canary) process.env.WAVE_INVITATION_BANNER_CANARY = canary;
    if (kill) process.env.WAVE_INVITATION_BANNER_KILL = kill;
    draftActorSetup();

    const response = await PATCH(
      patchReq({ invitationBodyHtml: "<p>Body fragment</p>" }) as never,
      detailParams("c1"),
    );

    expect(response.status).toBe(400);
    expect(db.assessmentCampaign.update).not.toHaveBeenCalled();
  });

  it("both flags ON still rejects a URL token in img src", async () => {
    process.env.WAVE_D_CUSTOM_HTML_EMAIL_ENABLED = "1";
    process.env.ASSESSMENT_INVITE_BRANDED_CUSTOM_HTML_ENABLED = "1";
    draftActorSetup();
    const response = await PATCH(
      patchReq({ invitationBodyHtml: '<img src="{{invitationUrl}}">' }) as never,
      detailParams("c1"),
    );
    expect(response.status).toBe(400);
    expect(db.assessmentCampaign.update).not.toHaveBeenCalled();
  });
});
