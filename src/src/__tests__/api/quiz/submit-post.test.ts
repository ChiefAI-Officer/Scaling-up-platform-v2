/**
 * Assessment v7.6 — PUBLIC quiz submit route tests.
 *
 * Covers:
 *   - 400 invalid body
 *   - 404 CAMPAIGN_NOT_FOUND
 *   - 403 NOT_PUBLIC (INVITED-only campaign)
 *   - 410 NOT_OPEN (DRAFT / CLOSED / before openAt / after closeAt)
 *   - 200 happy path creates submission with publicTaker + null respondentId
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
  const assessmentSubmission = { create: jest.fn() };
  const assessmentEmailOutbox = { create: jest.fn() };
  const queryRaw = jest.fn().mockResolvedValue([{ reportStyle: "CLASSIC" }]);
  return {
    db: {
      assessmentCampaign: { findUnique: jest.fn() },
      assessmentTemplateVersion: { findUnique: jest.fn() },
      assessmentSubmission,
      $transaction: jest.fn(
        (
          callback: (tx: {
            assessmentSubmission: { create: jest.Mock };
            assessmentEmailOutbox: { create: jest.Mock };
            $queryRaw: jest.Mock;
          }) => Promise<unknown>,
        ) => {
          mockSubmitPostTransactionActive = true;
          return Promise.resolve(
            callback({
              assessmentSubmission,
              assessmentEmailOutbox,
              $queryRaw: queryRaw,
            }),
          ).finally(() => {
            mockSubmitPostTransactionActive = false;
          });
        },
      ),
      $queryRaw: queryRaw,
    },
  };
});

jest.mock("@/inngest/client", () => ({
  inngest: { send: jest.fn().mockResolvedValue(undefined) },
}));

jest.mock("@/lib/audit", () => ({
  logAudit: jest.fn().mockResolvedValue(undefined),
}));

jest.mock("@/lib/rate-limit", () => ({
  RateLimits: { standard: {} },
  withRateLimit: jest.fn().mockResolvedValue({ allowed: true, headers: {} }),
}));

// eslint-disable-next-line no-var
var reportBuildInputs: Array<Record<string, unknown>>;
// eslint-disable-next-line no-var
var reportBuildTransactionStates: boolean[];
// eslint-disable-next-line no-var
var mockSubmitPostTransactionActive = false;
jest.mock("@/lib/assessments/report-email", () => {
  const actual = jest.requireActual("@/lib/assessments/report-email");
  return {
    ...actual,
    buildRespondentReportFromSubmission: jest.fn(
      (args: Record<string, unknown>) => {
        reportBuildInputs.push(args);
        reportBuildTransactionStates.push(mockSubmitPostTransactionActive);
        return actual.buildRespondentReportFromSubmission(args);
      },
    ),
  };
});

// Scoring helper is real — feed it a valid template version + valid answers
// so we don't have to deal with stubbing the engine internals.
import { POST } from "@/app/api/quiz/[campaignAlias]/submit/route";
import { db } from "@/lib/db";

const validBody = {
  publicTaker: {
    firstName: "Alex",
    lastName: "Doe",
    email: "alex@example.com",
  },
  answers: [{ stableKey: "S1_Q1", value: 3 }],
};

// Minimal but engine-valid template version that scores a single SLIDER_LIKERT.
const validVersion = {
  id: "ver-1",
  publishedAt: new Date(),
  reportConfig: {
    reportHtml: {
      schemaVersion: 1,
      introductionHtml: "<p>Published intro</p>",
      conclusionHtml: "<p>Published conclusion</p>",
    },
  },
  questions: [
    {
      stableKey: "S1_Q1",
      sortOrder: 1,
      type: "SLIDER_LIKERT",
      label: "Q",
      isRequired: true,
      sectionStableKey: "S1",
      scale: {
        min: 0,
        max: 3,
        step: 1,
        anchorMin: "A",
        anchorMax: "B",
      },
    },
  ],
  sections: [
    { stableKey: "S1", sortOrder: 1, name: "Section 1" },
  ],
  scoringConfig: {
    tierMetric: "countAchieved",
    passThreshold: 2,
    tiers: [
      { minMetric: 0, maxMetric: 0, label: "Low", message: "low" },
      { minMetric: 1, maxMetric: 1, label: "High", message: "high" },
    ],
  },
};

const activeOpenCampaign = {
  id: "c1",
  status: "ACTIVE",
  accessMode: "PUBLIC",
  openAt: new Date("2026-01-01T00:00:00Z"),
  closeAt: null,
  templateId: "tpl-1",
  versionId: "ver-1",
  deletedAt: null,
  reportStyle: "CLASSIC",
  template: { name: "Scaling Up Quick Assessment", alias: "quick-assessment" },
};

function jsonReq(body: unknown): Request {
  return new Request("http://localhost/api/quiz/demo/submit", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

const aliasParams = { params: Promise.resolve({ campaignAlias: "demo" }) };

beforeEach(() => {
  jest.clearAllMocks();
  reportBuildInputs = [];
  reportBuildTransactionStates = [];
  mockSubmitPostTransactionActive = false;
  delete process.env.WAVE_ED10_PREVIEW_SETTINGS_ENABLED;
  delete process.env.WAVE_ED10_PREVIEW_SETTINGS_KILL;
  delete process.env.WAVE_REPORT_HTML_AUTHORING_ENABLED;
  delete process.env.WAVE_REPORT_HTML_AUTHORING_KILL;
  (db as unknown as { $queryRaw: jest.Mock }).$queryRaw.mockResolvedValue([
    { reportStyle: "CLASSIC" },
  ]);
});

describe("POST /api/quiz/[campaignAlias]/submit", () => {
  it("400 when body is missing publicTaker email", async () => {
    const res = await POST(
      jsonReq({
        publicTaker: { firstName: "A", lastName: "B" },
        answers: [{ stableKey: "k", value: 1 }],
      }) as never,
      aliasParams,
    );
    expect(res.status).toBe(400);
  });

  it("404 CAMPAIGN_NOT_FOUND when alias unknown", async () => {
    (db.assessmentCampaign.findUnique as jest.Mock).mockResolvedValue(null);
    const res = await POST(jsonReq(validBody) as never, aliasParams);
    expect(res.status).toBe(404);
  });

  it("403 NOT_PUBLIC when accessMode is INVITED", async () => {
    (db.assessmentCampaign.findUnique as jest.Mock).mockResolvedValue({
      ...activeOpenCampaign,
      accessMode: "INVITED",
    });
    const res = await POST(jsonReq(validBody) as never, aliasParams);
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error).toBe("NOT_PUBLIC");
  });

  it("410 NOT_OPEN when DRAFT", async () => {
    (db.assessmentCampaign.findUnique as jest.Mock).mockResolvedValue({
      ...activeOpenCampaign,
      status: "DRAFT",
    });
    const res = await POST(jsonReq(validBody) as never, aliasParams);
    expect(res.status).toBe(410);
  });

  it("410 NOT_OPEN when closeAt is in the past", async () => {
    (db.assessmentCampaign.findUnique as jest.Mock).mockResolvedValue({
      ...activeOpenCampaign,
      closeAt: new Date("2025-01-01T00:00:00Z"),
    });
    const res = await POST(jsonReq(validBody) as never, aliasParams);
    expect(res.status).toBe(410);
  });

  it("happy path: creates submission with publicTaker + null respondentId", async () => {
    (db.assessmentCampaign.findUnique as jest.Mock).mockResolvedValue(
      activeOpenCampaign,
    );
    (db.assessmentTemplateVersion.findUnique as jest.Mock).mockResolvedValue(
      validVersion,
    );
    (db.assessmentSubmission.create as jest.Mock).mockResolvedValue({
      id: "sub-1",
    });
    const res = await POST(jsonReq(validBody) as never, aliasParams);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.submissionId).toBe("sub-1");
    expect(body.data.redirectUrl).toBe("/quiz/demo/thank-you");
    expect((db as unknown as { $queryRaw: jest.Mock }).$queryRaw).toHaveBeenCalledTimes(1);
    const createArgs = (db.assessmentSubmission.create as jest.Mock).mock
      .calls[0][0];
    expect(createArgs.data.respondentId).toBeNull();
    expect(createArgs.data.invitationId).toBeNull();
    expect(createArgs.data.publicTaker).toEqual({
      firstName: "Alex",
      lastName: "Doe",
      email: "alex@example.com",
    });
  });

  it("uses the style saved before completion wins the lock, not the stale campaign pre-read", async () => {
    (db.assessmentCampaign.findUnique as jest.Mock).mockResolvedValue({
      ...activeOpenCampaign,
      reportStyle: "CLASSIC",
    });
    (db.assessmentTemplateVersion.findUnique as jest.Mock).mockResolvedValue(
      validVersion,
    );
    (db.assessmentSubmission.create as jest.Mock).mockResolvedValue({
      id: "sub-race",
    });
    (db as unknown as { $queryRaw: jest.Mock }).$queryRaw.mockResolvedValueOnce([
      { reportStyle: "EXECUTIVE_BOARDROOM" },
    ]);

    const res = await POST(jsonReq(validBody) as never, aliasParams);

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.reportStyle).toBe("EXECUTIVE_BOARDROOM");
    expect(
      reportBuildInputs.some(
        (input) => input.reportStyle === "EXECUTIVE_BOARDROOM",
      ),
    ).toBe(true);
    expect(
      reportBuildInputs.every((input) => input.publicLeadActions === true),
    ).toBe(true);
    expect(reportBuildTransactionStates).toEqual([false, false, false]);
  });

  it("threads safe report HTML from the pinned version into immediate report models", async () => {
    process.env.WAVE_ED10_PREVIEW_SETTINGS_ENABLED = "1";
    process.env.WAVE_REPORT_HTML_AUTHORING_ENABLED = "1";
    (db.assessmentCampaign.findUnique as jest.Mock).mockResolvedValue(
      activeOpenCampaign,
    );
    (db.assessmentTemplateVersion.findUnique as jest.Mock).mockResolvedValue(
      validVersion,
    );
    (db.assessmentSubmission.create as jest.Mock).mockResolvedValue({
      id: "sub-html",
    });

    const res = await POST(jsonReq(validBody) as never, aliasParams);

    expect(res.status).toBe(200);
    expect(reportBuildInputs).not.toHaveLength(0);
    expect(reportBuildInputs.every((input) =>
      JSON.stringify(input.reportHtml) === JSON.stringify({
        introductionHtml: "<p>Published intro</p>",
        conclusionHtml: "<p>Published conclusion</p>",
      }),
    )).toBe(true);
    expect(db.assessmentTemplateVersion.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "ver-1" },
        select: expect.objectContaining({ reportConfig: true }),
      }),
    );
  });

  it("omits report HTML from immediate report models while the successor is off", async () => {
    (db.assessmentCampaign.findUnique as jest.Mock).mockResolvedValue(
      activeOpenCampaign,
    );
    (db.assessmentTemplateVersion.findUnique as jest.Mock).mockResolvedValue(
      validVersion,
    );
    (db.assessmentSubmission.create as jest.Mock).mockResolvedValue({
      id: "sub-no-html",
    });

    const res = await POST(jsonReq(validBody) as never, aliasParams);

    expect(res.status).toBe(200);
    expect(reportBuildInputs).not.toHaveLength(0);
    expect(
      reportBuildInputs.every(
        (input) => !Object.prototype.hasOwnProperty.call(input, "reportHtml"),
      ),
    ).toBe(true);
  });
});
