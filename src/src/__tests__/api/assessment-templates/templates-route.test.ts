/**
 * Assessment v7.6 — GET /api/assessment-templates.
 * INTERSECTION RBAC enforcement.
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
    accessGroupCoach: { findMany: jest.fn() },
    accessGroupTemplate: { findMany: jest.fn() },
    assessmentTemplate: { findMany: jest.fn() },
  },
}));

jest.mock("@/lib/auth/authorization", () => ({
  getApiActor: jest.fn(),
  isPrivilegedRole: (role: string) => role === "ADMIN" || role === "STAFF",
}));

import { GET } from "@/app/api/assessment-templates/route";
import { db } from "@/lib/db";
import { getApiActor } from "@/lib/auth/authorization";

const coachActor = {
  userId: "u1",
  email: "coach@example.com",
  role: "COACH" as const,
  coachId: "coach-1",
};
const adminActor = {
  userId: "admin",
  email: "admin@example.com",
  role: "ADMIN" as const,
  coachId: null,
};

beforeEach(() => {
  jest.clearAllMocks();
  delete process.env.WAVE_REPORT_STYLES_ENABLED;
  delete process.env.WAVE_REPORT_STYLES_CANARY;
  delete process.env.WAVE_REPORT_STYLES_KILL;
  delete process.env.WAVE_ADMIN_OWNED_ASSESSMENT_PRESENTATION_ENABLED;
  delete process.env.WAVE_ADMIN_OWNED_ASSESSMENT_PRESENTATION_KILL;
});

describe("GET /api/assessment-templates", () => {
  it("401 unauthenticated", async () => {
    (getApiActor as jest.Mock).mockResolvedValue(null);
    const res = await GET(
      new Request("http://localhost/api/assessment-templates") as never,
    );
    expect(res.status).toBe(401);
  });

  it("admin sees all non-deleted templates", async () => {
    (getApiActor as jest.Mock).mockResolvedValue(adminActor);
    (db.assessmentTemplate.findMany as jest.Mock).mockResolvedValue([
      { id: "t1", name: "Rockefeller", alias: "rkf", description: null, aggregationMode: "FULL_VISIBILITY" },
    ]);
    const res = await GET(
      new Request("http://localhost/api/assessment-templates") as never,
    );
    expect(res.status).toBe(200);
    // Wave Q (#6): the picker hides disabled templates UNCONDITIONALLY (not
    // flag-gated) while keeping the deletedAt filter (regression).
    expect(db.assessmentTemplate.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { deletedAt: null, disabledAt: null } }),
    );
  });

  it("keeps the flag-off query and response byte shape free of preview capabilities", async () => {
    (getApiActor as jest.Mock).mockResolvedValue(adminActor);
    (db.assessmentTemplate.findMany as jest.Mock).mockResolvedValue([
      {
        id: "t1",
        name: "Rockefeller",
        alias: "rockefeller",
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

    const res = await GET(
      new Request("http://localhost/api/assessment-templates") as never,
    );

    expect(db.assessmentTemplate.findMany).toHaveBeenCalledTimes(1);
    const query = (db.assessmentTemplate.findMany as jest.Mock).mock.calls[0][0];
    expect(query.select).not.toHaveProperty("versions");
    await expect(res.json()).resolves.toEqual({
      success: true,
      data: [
        {
          id: "t1",
          name: "Rockefeller",
          alias: "rockefeller",
          description: null,
          aggregationMode: "FULL_VISIBILITY",
          defaultReportStyle: "CLASSIC",
          reportStylesEnabled: false,
          resultsEmailApproved: false,
          sendResultsDefault: false,
        },
      ],
    });
  });

  it("queries capability inputs only for an available template", async () => {
    process.env.WAVE_REPORT_STYLES_CANARY = "t1";
    (getApiActor as jest.Mock).mockResolvedValue(adminActor);
    (db.assessmentTemplate.findMany as jest.Mock)
      .mockResolvedValueOnce([
        {
          id: "t1",
          name: "Rockefeller",
          alias: "rockefeller",
          description: null,
          aggregationMode: "FULL_VISIBILITY",
          defaultReportStyle: "CLASSIC",
          sendResultsDefault: false,
          resultsEmailContentApproved: false,
          resultsEmailContentApprovedHash: null,
          resultsEmailSubject: null,
          resultsEmailBodyMarkdown: null,
        },
      ])
      .mockResolvedValueOnce([
        {
          id: "t1",
          alias: "rockefeller",
          versions: [{ questions: [{ type: "NUMBER" }] }],
        },
      ]);

    const res = await GET(
      new Request("http://localhost/api/assessment-templates") as never,
    );

    expect(db.assessmentTemplate.findMany).toHaveBeenCalledTimes(2);
    expect(db.assessmentTemplate.findMany).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        where: { id: { in: ["t1"] } },
        select: expect.objectContaining({
          id: true,
          versions: expect.any(Object),
        }),
      }),
    );
    await expect(res.json()).resolves.toEqual(
      expect.objectContaining({
        data: [
          expect.objectContaining({
            reportStylesEnabled: true,
            reportStylePreviewCapabilities: {
              reportType: "scored",
              hasMetrics: true,
              hasNarrativeResponses: false,
            },
          }),
        ],
      }),
    );
  });

  it("keeps report appearance metadata for admins when admin-owned presentation is active", async () => {
    process.env.WAVE_ADMIN_OWNED_ASSESSMENT_PRESENTATION_ENABLED = "1";
    process.env.WAVE_REPORT_STYLES_ENABLED = "1";
    (getApiActor as jest.Mock).mockResolvedValue(adminActor);
    (db.assessmentTemplate.findMany as jest.Mock)
      .mockResolvedValueOnce([
        {
          id: "t1",
          name: "Rockefeller",
          alias: "rockefeller",
          description: null,
          aggregationMode: "FULL_VISIBILITY",
          defaultReportStyle: "MODERN_DASHBOARD",
          sendResultsDefault: false,
          resultsEmailContentApproved: false,
          resultsEmailContentApprovedHash: null,
          resultsEmailSubject: null,
          resultsEmailBodyMarkdown: null,
        },
      ])
      .mockResolvedValueOnce([
        {
          id: "t1",
          versions: [{ questions: [{ type: "NUMBER" }] }],
        },
      ]);

    const res = await GET(
      new Request("http://localhost/api/assessment-templates") as never,
    );
    const body = await res.json();

    expect(db.assessmentTemplate.findMany).toHaveBeenCalledTimes(2);
    expect(body.data[0]).toEqual(
      expect.objectContaining({
        defaultReportStyle: "MODERN_DASHBOARD",
        reportStylesEnabled: true,
        reportStylePreviewCapabilities: expect.any(Object),
      }),
    );
  });

  it("admin payload carries the raw stored sendResultsDefault (Wave Q #1)", async () => {
    (getApiActor as jest.Mock).mockResolvedValue(adminActor);
    (db.assessmentTemplate.findMany as jest.Mock).mockResolvedValue([
      {
        id: "t1",
        name: "Rockefeller",
        alias: "rkf",
        description: null,
        aggregationMode: "FULL_VISIBILITY",
        sendResultsDefault: true,
        resultsEmailContentApproved: false,
        resultsEmailContentApprovedHash: null,
        resultsEmailSubject: null,
        resultsEmailBodyMarkdown: null,
      },
    ]);
    const res = await GET(
      new Request("http://localhost/api/assessment-templates") as never,
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data[0].sendResultsDefault).toBe(true);
    // Existing approval boolean still present alongside it.
    expect(body.data[0].resultsEmailApproved).toBe(false);
  });

  it("coach with no active groups gets empty list", async () => {
    (getApiActor as jest.Mock).mockResolvedValue(coachActor);
    (db.accessGroupCoach.findMany as jest.Mock).mockResolvedValue([]);
    const res = await GET(
      new Request("http://localhost/api/assessment-templates") as never,
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data).toEqual([]);
    expect(db.assessmentTemplate.findMany).not.toHaveBeenCalled();
  });

  it("coach: INTERSECTION — only templates granted by EVERY active group", async () => {
    (getApiActor as jest.Mock).mockResolvedValue(coachActor);
    (db.accessGroupCoach.findMany as jest.Mock).mockResolvedValue([
      { accessGroupId: "g1", coachId: "coach-1", accessGroup: { id: "g1", deletedAt: null } },
      { accessGroupId: "g2", coachId: "coach-1", accessGroup: { id: "g2", deletedAt: null } },
    ]);
    // tpl-1 is granted by BOTH groups → accessible
    // tpl-2 is granted only by g1 → blocked
    (db.accessGroupTemplate.findMany as jest.Mock).mockResolvedValue([
      { accessGroupId: "g1", templateId: "tpl-1" },
      { accessGroupId: "g2", templateId: "tpl-1" },
      { accessGroupId: "g1", templateId: "tpl-2" },
    ]);
    (db.assessmentTemplate.findMany as jest.Mock).mockResolvedValue([
      { id: "tpl-1", name: "R", alias: "r", description: null, aggregationMode: "FULL_VISIBILITY" },
    ]);
    const res = await GET(
      new Request("http://localhost/api/assessment-templates") as never,
    );
    expect(res.status).toBe(200);
    expect(db.assessmentTemplate.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: { in: ["tpl-1"] }, deletedAt: null, disabledAt: null },
      }),
    );
  });

  it("coach payload carries sendResultsDefault (Wave Q #1)", async () => {
    (getApiActor as jest.Mock).mockResolvedValue(coachActor);
    (db.accessGroupCoach.findMany as jest.Mock).mockResolvedValue([
      { accessGroupId: "g1", coachId: "coach-1", accessGroup: { id: "g1", deletedAt: null } },
    ]);
    (db.accessGroupTemplate.findMany as jest.Mock).mockResolvedValue([
      { accessGroupId: "g1", templateId: "tpl-1" },
    ]);
    (db.assessmentTemplate.findMany as jest.Mock).mockResolvedValue([
      {
        id: "tpl-1",
        name: "R",
        alias: "r",
        description: null,
        aggregationMode: "FULL_VISIBILITY",
        sendResultsDefault: false,
        resultsEmailContentApproved: false,
        resultsEmailContentApprovedHash: null,
        resultsEmailSubject: null,
        resultsEmailBodyMarkdown: null,
      },
    ]);
    const res = await GET(
      new Request("http://localhost/api/assessment-templates") as never,
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data[0].sendResultsDefault).toBe(false);
  });

  it("coach admin-owned presentation payload omits report appearance metadata and its preview query", async () => {
    process.env.WAVE_ADMIN_OWNED_ASSESSMENT_PRESENTATION_ENABLED = "1";
    process.env.WAVE_REPORT_STYLES_ENABLED = "1";
    (getApiActor as jest.Mock).mockResolvedValue(coachActor);
    (db.accessGroupCoach.findMany as jest.Mock).mockResolvedValue([
      { accessGroupId: "g1", coachId: "coach-1", accessGroup: { id: "g1", deletedAt: null } },
    ]);
    (db.accessGroupTemplate.findMany as jest.Mock).mockResolvedValue([
      { accessGroupId: "g1", templateId: "tpl-1" },
    ]);
    (db.assessmentTemplate.findMany as jest.Mock).mockResolvedValue([
      {
        id: "tpl-1",
        name: "R",
        alias: "r",
        description: null,
        aggregationMode: "FULL_VISIBILITY",
        sendResultsDefault: false,
        resultsEmailContentApproved: false,
        resultsEmailContentApprovedHash: null,
        resultsEmailSubject: null,
        resultsEmailBodyMarkdown: null,
      },
    ]);

    const res = await GET(
      new Request("http://localhost/api/assessment-templates") as never,
    );
    const body = await res.json();

    expect(db.assessmentTemplate.findMany).toHaveBeenCalledTimes(1);
    const query = (db.assessmentTemplate.findMany as jest.Mock).mock.calls[0][0];
    expect(query.select).not.toHaveProperty("defaultReportStyle");
    expect(body.data[0]).not.toHaveProperty("defaultReportStyle");
    expect(body.data[0]).not.toHaveProperty("reportStylesEnabled");
    expect(body.data[0]).not.toHaveProperty("reportStylePreviewCapabilities");
  });

  it("coach: soft-deleted groups excluded from INTERSECTION denominator", async () => {
    (getApiActor as jest.Mock).mockResolvedValue(coachActor);
    (db.accessGroupCoach.findMany as jest.Mock).mockResolvedValue([
      { accessGroupId: "g1", coachId: "coach-1", accessGroup: { id: "g1", deletedAt: null } },
      { accessGroupId: "g2", coachId: "coach-1", accessGroup: { id: "g2", deletedAt: new Date() } },
    ]);
    // tpl-1 granted only by g1 → accessible because g2 is soft-deleted.
    (db.accessGroupTemplate.findMany as jest.Mock).mockResolvedValue([
      { accessGroupId: "g1", templateId: "tpl-1" },
    ]);
    (db.assessmentTemplate.findMany as jest.Mock).mockResolvedValue([
      { id: "tpl-1", name: "R", alias: "r", description: null, aggregationMode: "FULL_VISIBILITY" },
    ]);
    const res = await GET(
      new Request("http://localhost/api/assessment-templates") as never,
    );
    expect(res.status).toBe(200);
    expect(db.assessmentTemplate.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: { in: ["tpl-1"] }, deletedAt: null, disabledAt: null },
      }),
    );
  });
});
