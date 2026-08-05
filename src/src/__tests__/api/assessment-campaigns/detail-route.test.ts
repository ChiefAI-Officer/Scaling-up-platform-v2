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
  delete process.env.WAVE_REPORT_STYLES_ENABLED;
  delete process.env.WAVE_REPORT_STYLES_KILL;
  delete process.env.WAVE_REPORT_STYLES_CANARY;
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
    });
    const res = await GET(
      new Request("http://localhost/api/assessment-campaigns/c1") as never,
      detailParams("c1"),
    );
    expect(res.status).toBe(200);
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
    });
    const res = await PATCH(
      patchReq({ name: "Renamed" }) as never,
      detailParams("c1"),
    );
    expect(res.status).toBe(200);
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

    it("keeps the existing cross-coach rejection behavior", async () => {
      (getApiActor as jest.Mock).mockResolvedValue(otherCoachActor);
      (db.assessmentCampaign.findUnique as jest.Mock).mockResolvedValue(
        reportStyleCampaign(),
      );

      const res = await PATCH(
        patchReq({ reportStyle: "MODERN_DASHBOARD" }) as never,
        detailParams("c1"),
      );

      expect(res.status).toBe(404);
      expect(db.assessmentCampaign.updateMany).not.toHaveBeenCalled();
    });

    it("allows an admin intervention before the first completion", async () => {
      process.env.WAVE_REPORT_STYLES_ENABLED = "1";
      (getApiActor as jest.Mock).mockResolvedValue({
        ...coachActor,
        role: "ADMIN",
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
      expect(db.assessmentCampaign.updateMany).toHaveBeenCalled();
    });

    it("rejects an ineligible template without mutating", async () => {
      process.env.WAVE_REPORT_STYLES_ENABLED = "1";
      (getApiActor as jest.Mock).mockResolvedValue(coachActor);
      (db.assessmentCampaign.findUnique as jest.Mock).mockResolvedValue(
        reportStyleCampaign({ template: { alias: "rockefeller-habits" } }),
      );

      const res = await PATCH(
        patchReq({ reportStyle: "MODERN_DASHBOARD" }) as never,
        detailParams("c1"),
      );

      expect(res.status).toBe(400);
      expect(db.assessmentCampaign.updateMany).not.toHaveBeenCalled();
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

    it("returns the locked race contract when the conditional update finds no mutable row", async () => {
      process.env.WAVE_REPORT_STYLES_ENABLED = "1";
      (getApiActor as jest.Mock).mockResolvedValue(coachActor);
      (db.assessmentCampaign.findUnique as jest.Mock).mockResolvedValue(
        reportStyleCampaign(),
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
      });
    });
  });

  // ── Task 12 (#20) — full-HTML invitation body on PATCH ──────────────────
  const ORIGINAL_HTML_FLAG = process.env.WAVE_D_CUSTOM_HTML_EMAIL_ENABLED;
  const ORIGINAL_BRANDED_HTML_FLAG = process.env.ASSESSMENT_INVITE_BRANDED_CUSTOM_HTML_ENABLED;
  const VALID_HTML = '<h1>Hi {{respondentFirstName}}</h1><a href="{{invitationUrl}}">Go</a>';

  function draftActorSetup() {
    (getApiActor as jest.Mock).mockResolvedValue(coachActor);
    (db.assessmentCampaign.findUnique as jest.Mock).mockResolvedValue({
      id: "c1",
      organizationId: "org-1",
      templateId: "tpl-1",
      createdByCoachId: "coach-1",
      status: "DRAFT",
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
