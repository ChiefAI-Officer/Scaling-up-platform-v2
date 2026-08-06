jest.mock("next/server", () => ({
  NextResponse: {
    json: (body: unknown, init?: ResponseInit) =>
      new Response(JSON.stringify(body), { status: init?.status ?? 200 }),
  },
}));

jest.mock("@/lib/db", () => ({
  db: {
    assessmentCampaign: {
      findUnique: jest.fn(),
      findFirst: jest.fn(),
      updateMany: jest.fn(),
    },
  },
}));

jest.mock("@/lib/auth/authorization", () => ({
  getApiActor: jest.fn(),
  isPrivilegedRole: (role: string) => role === "ADMIN" || role === "STAFF",
}));

jest.mock("@/lib/audit", () => ({
  logAudit: jest.fn().mockResolvedValue(undefined),
}));

jest.mock("@/lib/rate-limit", () => ({
  RateLimits: { standard: {} },
  withRateLimit: jest.fn().mockResolvedValue({ allowed: true, headers: {} }),
}));

import { PATCH } from "@/app/api/admin/public-campaigns/[id]/report-style/route";
import { db } from "@/lib/db";
import { getApiActor } from "@/lib/auth/authorization";
import { logAudit } from "@/lib/audit";

const adminActor = {
  userId: "admin-1",
  email: "admin@example.com",
  role: "ADMIN" as const,
  coachId: null,
};

const coachActor = {
  userId: "coach-user-1",
  email: "coach@example.com",
  role: "COACH" as const,
  coachId: "coach-1",
};

function patchRequest(reportStyle: string) {
  return new Request("http://localhost/api/admin/public-campaigns/camp-1/report-style", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ reportStyle }),
  });
}

function routeParams(id = "camp-1") {
  return { params: Promise.resolve({ id }) };
}

function publicCampaign(overrides: Record<string, unknown> = {}) {
  return {
    id: "camp-1",
    templateId: "tpl-1",
    accessMode: "PUBLIC",
    createdByCoachId: null,
    deletedAt: null,
    reportStyle: "CLASSIC",
    reportStyleSource: "TEMPLATE_DEFAULT",
    reportStyleLockedAt: null,
    ...overrides,
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  delete process.env.WAVE_REPORT_STYLES_ENABLED;
  delete process.env.WAVE_REPORT_STYLES_CANARY;
  delete process.env.WAVE_REPORT_STYLES_KILL;
  (getApiActor as jest.Mock).mockResolvedValue(adminActor);
  (db.assessmentCampaign.findUnique as jest.Mock).mockResolvedValue(
    publicCampaign(),
  );
  (db.assessmentCampaign.findFirst as jest.Mock).mockResolvedValue(null);
  (db.assessmentCampaign.updateMany as jest.Mock).mockResolvedValue({ count: 1 });
});

describe("PATCH /api/admin/public-campaigns/[id]/report-style", () => {
  it("requires authentication", async () => {
    (getApiActor as jest.Mock).mockResolvedValue(null);

    const res = await PATCH(patchRequest("CLASSIC") as never, routeParams());

    expect(res.status).toBe(401);
    expect(db.assessmentCampaign.updateMany).not.toHaveBeenCalled();
  });

  it("requires an Admin or Staff actor", async () => {
    (getApiActor as jest.Mock).mockResolvedValue(coachActor);

    const res = await PATCH(patchRequest("CLASSIC") as never, routeParams());

    expect(res.status).toBe(403);
    expect(db.assessmentCampaign.updateMany).not.toHaveBeenCalled();
  });

  it("rejects a key outside the closed catalog before loading the campaign", async () => {
    process.env.WAVE_REPORT_STYLES_ENABLED = "1";

    const res = await PATCH(patchRequest("NOT_A_STYLE") as never, routeParams());

    expect(res.status).toBe(400);
    expect(db.assessmentCampaign.findUnique).not.toHaveBeenCalled();
    expect(db.assessmentCampaign.updateMany).not.toHaveBeenCalled();
  });

  it.each([
    ["an invited campaign", { accessMode: "INVITED" }],
    ["a coach-owned public campaign", { createdByCoachId: "coach-1" }],
    ["a deleted public campaign", { deletedAt: new Date("2026-08-01") }],
  ])("does not mutate %s", async (_label, overrides) => {
    process.env.WAVE_REPORT_STYLES_ENABLED = "1";
    (db.assessmentCampaign.findUnique as jest.Mock).mockResolvedValue(
      publicCampaign(overrides),
    );

    const res = await PATCH(
      patchRequest("MODERN_DASHBOARD") as never,
      routeParams(),
    );

    expect([403, 404]).toContain(res.status);
    expect(db.assessmentCampaign.updateMany).not.toHaveBeenCalled();
  });

  it("rejects updates while server availability is off", async () => {
    const res = await PATCH(
      patchRequest("MODERN_DASHBOARD") as never,
      routeParams(),
    );

    expect(res.status).toBe(400);
    expect(db.assessmentCampaign.updateMany).not.toHaveBeenCalled();
  });

  it("lets an exact campaign canary enable the update", async () => {
    process.env.WAVE_REPORT_STYLES_CANARY = "camp-1";

    const res = await PATCH(
      patchRequest("EXECUTIVE_BOARDROOM") as never,
      routeParams(),
    );

    expect(res.status).toBe(200);
    expect(db.assessmentCampaign.updateMany).toHaveBeenCalledWith({
      where: {
        id: "camp-1",
        accessMode: "PUBLIC",
        createdByCoachId: null,
        deletedAt: null,
        reportStyleLockedAt: null,
      },
      data: {
        reportStyle: "EXECUTIVE_BOARDROOM",
        reportStyleSource: "CAMPAIGN_OVERRIDE",
      },
    });
  });

  it("lets the kill switch override global and canary availability", async () => {
    process.env.WAVE_REPORT_STYLES_ENABLED = "1";
    process.env.WAVE_REPORT_STYLES_CANARY = "camp-1";
    process.env.WAVE_REPORT_STYLES_KILL = "1";

    const res = await PATCH(
      patchRequest("MODERN_DASHBOARD") as never,
      routeParams(),
    );

    expect(res.status).toBe(400);
    expect(db.assessmentCampaign.updateMany).not.toHaveBeenCalled();
  });

  it("returns the selected appearance, provenance, and timestamp when already locked", async () => {
    process.env.WAVE_REPORT_STYLES_ENABLED = "1";
    (db.assessmentCampaign.findUnique as jest.Mock).mockResolvedValue(
      publicCampaign({
        reportStyle: "EXECUTIVE_BOARDROOM",
        reportStyleSource: "CAMPAIGN_OVERRIDE",
        reportStyleLockedAt: new Date("2026-08-06T04:00:00.000Z"),
      }),
    );

    const res = await PATCH(
      patchRequest("MODERN_DASHBOARD") as never,
      routeParams(),
    );

    expect(res.status).toBe(409);
    await expect(res.json()).resolves.toEqual({
      error: "REPORT_STYLE_LOCKED",
      message:
        "Report appearance was locked when the first response completed. Refresh to see the final style.",
      data: {
        id: "camp-1",
        reportStyle: "EXECUTIVE_BOARDROOM",
        reportStyleSource: "CAMPAIGN_OVERRIDE",
        reportStyleLockedAt: "2026-08-06T04:00:00.000Z",
      },
    });
    expect(db.assessmentCampaign.updateMany).not.toHaveBeenCalled();
  });

  it("returns 409 with the final locked appearance when completion wins the conditional race", async () => {
    process.env.WAVE_REPORT_STYLES_ENABLED = "1";
    (db.assessmentCampaign.findUnique as jest.Mock).mockResolvedValueOnce(
      publicCampaign(),
    );
    (db.assessmentCampaign.findFirst as jest.Mock).mockResolvedValueOnce(
      publicCampaign({
        reportStyle: "CLASSIC",
        reportStyleSource: "TEMPLATE_DEFAULT",
        reportStyleLockedAt: new Date("2026-08-06T05:00:00.000Z"),
      }),
    );
    (db.assessmentCampaign.updateMany as jest.Mock).mockResolvedValue({ count: 0 });

    const res = await PATCH(
      patchRequest("MODERN_DASHBOARD") as never,
      routeParams(),
    );

    expect(res.status).toBe(409);
    await expect(res.json()).resolves.toEqual(
      expect.objectContaining({
        error: "REPORT_STYLE_LOCKED",
        data: expect.objectContaining({
          reportStyle: "CLASSIC",
          reportStyleSource: "TEMPLATE_DEFAULT",
          reportStyleLockedAt: "2026-08-06T05:00:00.000Z",
        }),
      }),
    );
    expect(logAudit).not.toHaveBeenCalled();
  });

  it.each([
    [
      "after an access transition without a lock",
      {
        accessMode: "INVITED",
        reportStyleLockedAt: null,
      },
    ],
    [
      "after an ownership transition with a lock",
      {
        createdByCoachId: "coach-1",
        reportStyleLockedAt: new Date("2026-08-06T05:00:00.000Z"),
      },
    ],
    [
      "after deletion with a lock",
      {
        deletedAt: new Date("2026-08-06T05:00:00.000Z"),
        reportStyleLockedAt: new Date("2026-08-06T05:00:00.000Z"),
      },
    ],
  ])(
    "fails closed without appearance metadata %s",
    async (_label, transition) => {
      process.env.WAVE_REPORT_STYLES_ENABLED = "1";
      const transitionedCampaign = publicCampaign({
        reportStyle: "EXECUTIVE_BOARDROOM",
        reportStyleSource: "CAMPAIGN_OVERRIDE",
        ...transition,
      });
      (db.assessmentCampaign.findUnique as jest.Mock).mockResolvedValueOnce(
        publicCampaign(),
      );
      (db.assessmentCampaign.findFirst as jest.Mock).mockImplementationOnce(
        async ({ where }: { where: Record<string, unknown> }) =>
          transitionedCampaign.id === where.id &&
          transitionedCampaign.accessMode === where.accessMode &&
          transitionedCampaign.createdByCoachId === where.createdByCoachId &&
          transitionedCampaign.deletedAt === where.deletedAt
            ? transitionedCampaign
            : null,
      );
      (db.assessmentCampaign.updateMany as jest.Mock).mockResolvedValue({
        count: 0,
      });

      const res = await PATCH(
        patchRequest("MODERN_DASHBOARD") as never,
        routeParams(),
      );

      expect(res.status).toBe(404);
      await expect(res.json()).resolves.toEqual({
        success: false,
        error: "Campaign not found",
      });
      expect(db.assessmentCampaign.findFirst).toHaveBeenCalledWith({
        where: {
          id: "camp-1",
          accessMode: "PUBLIC",
          createdByCoachId: null,
          deletedAt: null,
        },
        select: expect.any(Object),
      });
      expect(logAudit).not.toHaveBeenCalled();
    },
  );

  it("audits a successful atomic override", async () => {
    process.env.WAVE_REPORT_STYLES_ENABLED = "1";

    const res = await PATCH(
      patchRequest("MODERN_DASHBOARD") as never,
      routeParams(),
    );

    expect(res.status).toBe(200);
    expect(logAudit).toHaveBeenCalledWith({
      entityType: "AssessmentCampaign",
      entityId: "camp-1",
      action: "UPDATE",
      performedBy: "admin@example.com",
      changes: {
        reportStyle: "MODERN_DASHBOARD",
        reportStyleSource: "CAMPAIGN_OVERRIDE",
      },
    });
  });
});
