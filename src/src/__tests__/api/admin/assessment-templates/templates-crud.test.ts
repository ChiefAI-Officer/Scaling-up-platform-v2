/**
 * Assessment v7.6 — Admin assessment template CRUD route tests (MVP).
 *
 * Covers:
 *   - POST /api/admin/assessment-templates: auth, body validation, alias collision,
 *     transaction creates template + first draft version, audit
 *   - PATCH /api/admin/assessment-templates/[id]: auth, 404, metadata update, audit
 *   - DELETE /api/admin/assessment-templates/[id]: auth, 404, 409 active-campaigns,
 *     soft-delete + audit
 *   - POST /api/admin/assessment-templates/[id]/versions/[versionId]/publish:
 *     auth, 404, 409 already-published, publishedAt + publishedBy set, audit
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

const txMock = {
  assessmentTemplate: { create: jest.fn() },
  assessmentTemplateVersion: { create: jest.fn() },
};

jest.mock("@/lib/db", () => ({
  db: {
    assessmentTemplate: {
      findFirst: jest.fn(),
      update: jest.fn(),
    },
    assessmentTemplateVersion: {
      findUnique: jest.fn(),
      update: jest.fn(),
    },
    assessmentCampaign: {
      findFirst: jest.fn(),
    },
    auditLog: { create: jest.fn().mockResolvedValue(undefined) },
    $transaction: jest.fn((fn: (tx: typeof txMock) => unknown) => fn(txMock)),
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

import { createHash } from "crypto";
import { POST as listPOST } from "@/app/api/admin/assessment-templates/route";
import {
  PATCH as detailPATCH,
  DELETE as detailDELETE,
} from "@/app/api/admin/assessment-templates/[id]/route";
import { POST as publishPOST } from "@/app/api/admin/assessment-templates/[id]/versions/[versionId]/publish/route";
import { db } from "@/lib/db";
import { getApiActor } from "@/lib/auth/authorization";

const adminActor = {
  userId: "u1",
  email: "admin@example.com",
  role: "ADMIN" as const,
  coachId: null,
};

const coachActor = {
  userId: "u2",
  email: "coach@example.com",
  role: "COACH" as const,
  coachId: "coach-1",
};

function jsonReq(url: string, body: unknown, method = "POST"): Request {
  return new Request(url, {
    method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

function emptyReq(url: string, method = "DELETE"): Request {
  return new Request(url, { method });
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe("POST /api/admin/assessment-templates (create)", () => {
  const validBody = {
    name: "Test Template",
    alias: "test-template",
    invitationSubject: "Hi",
    invitationBodyMarkdown: "Body",
    questions: [{ id: "q1" }],
    sections: [{ id: "s1" }],
    scoringConfig: { tiers: [] },
  };

  it("401 when unauthenticated", async () => {
    (getApiActor as jest.Mock).mockResolvedValue(null);
    const res = await listPOST(
      jsonReq("http://localhost/api/admin/assessment-templates", validBody) as never,
    );
    expect(res.status).toBe(401);
  });

  it("403 when actor is not admin/staff", async () => {
    (getApiActor as jest.Mock).mockResolvedValue(coachActor);
    const res = await listPOST(
      jsonReq("http://localhost/api/admin/assessment-templates", validBody) as never,
    );
    expect(res.status).toBe(403);
  });

  it("400 when body fails validation (missing required field)", async () => {
    (getApiActor as jest.Mock).mockResolvedValue(adminActor);
    const res = await listPOST(
      jsonReq("http://localhost/api/admin/assessment-templates", {
        name: "x",
      }) as never,
    );
    expect(res.status).toBe(400);
  });

  it("409 on alias collision (Prisma P2002)", async () => {
    (getApiActor as jest.Mock).mockResolvedValue(adminActor);
    (db.$transaction as jest.Mock).mockRejectedValueOnce({
      code: "P2002",
    });
    const res = await listPOST(
      jsonReq("http://localhost/api/admin/assessment-templates", validBody) as never,
    );
    expect(res.status).toBe(409);
  });

  it("201 + creates template + first draft version + audit", async () => {
    (getApiActor as jest.Mock).mockResolvedValue(adminActor);
    (txMock.assessmentTemplate.create as jest.Mock).mockResolvedValue({
      id: "tpl-1",
      alias: "test-template",
    });
    (txMock.assessmentTemplateVersion.create as jest.Mock).mockResolvedValue({});
    const res = await listPOST(
      jsonReq("http://localhost/api/admin/assessment-templates", validBody) as never,
    );
    expect(res.status).toBe(201);
    expect(txMock.assessmentTemplate.create).toHaveBeenCalled();
    expect(txMock.assessmentTemplateVersion.create).toHaveBeenCalled();
    const versionArgs = (txMock.assessmentTemplateVersion.create as jest.Mock).mock
      .calls[0][0];
    expect(versionArgs.data.publishedAt).toBeNull();
    expect(versionArgs.data.versionNumber).toBe(1);
    expect(versionArgs.data.contentHash).toMatch(/^[0-9a-f]{64}$/);
    expect(db.auditLog.create).toHaveBeenCalled();
  });
});

describe("PATCH /api/admin/assessment-templates/[id]", () => {
  function patchReq(body: unknown) {
    return jsonReq(
      "http://localhost/api/admin/assessment-templates/tpl-1",
      body,
      "PATCH",
    );
  }
  const detailParams = { params: Promise.resolve({ id: "tpl-1" }) };

  it("404 when template missing or deleted", async () => {
    (getApiActor as jest.Mock).mockResolvedValue(adminActor);
    (db.assessmentTemplate.findFirst as jest.Mock).mockResolvedValue(null);
    const res = await detailPATCH(patchReq({ name: "New name" }) as never, detailParams);
    expect(res.status).toBe(404);
  });

  it("happy path: updates metadata + writes audit", async () => {
    (getApiActor as jest.Mock).mockResolvedValue(adminActor);
    (db.assessmentTemplate.findFirst as jest.Mock).mockResolvedValue({ id: "tpl-1" });
    (db.assessmentTemplate.update as jest.Mock).mockResolvedValue({});
    const res = await detailPATCH(
      patchReq({ name: "Renamed", aggregationMode: "CEO_ONLY" }) as never,
      detailParams,
    );
    expect(res.status).toBe(200);
    const updateArgs = (db.assessmentTemplate.update as jest.Mock).mock.calls[0][0];
    expect(updateArgs.data.name).toBe("Renamed");
    expect(updateArgs.data.aggregationMode).toBe("CEO_ONLY");
    expect(db.auditLog.create).toHaveBeenCalled();
  });

  // SEC-H2 — results-email approval is bound to a content hash. The PATCH
  // handler must clear approval when content is edited without re-approving,
  // and must bind the stored hash to the post-update content when approving.
  describe("SEC-H2 results-email approval binding", () => {
    function existingTemplate(over: Record<string, unknown> = {}) {
      return {
        id: "tpl-1",
        resultsEmailSubject: "Your results",
        resultsEmailBodyMarkdown: "Here is your report.",
        resultsEmailContentApproved: true,
        resultsEmailContentApprovedHash: hashOf("Your results", "Here is your report."),
        resultsEmailContentApprovedAt: new Date("2026-06-01T00:00:00Z"),
        resultsEmailContentApprovedBy: "prev@example.com",
        ...over,
      };
    }

    function hashOf(subject: string | null, body: string | null): string {
      // Local mirror of the helper's canonicalization (kept independent so the
      // test pins the exact contract, not the implementation).
      return createHash("sha256")
        .update(JSON.stringify([subject ?? "", body ?? ""]))
        .digest("hex");
    }

    it("editing the body after approval clears approval + hash + at + by", async () => {
      (getApiActor as jest.Mock).mockResolvedValue(adminActor);
      (db.assessmentTemplate.findFirst as jest.Mock).mockResolvedValue(existingTemplate());
      (db.assessmentTemplate.update as jest.Mock).mockResolvedValue({});
      const res = await detailPATCH(
        patchReq({ resultsEmailBodyMarkdown: "Edited body" }) as never,
        detailParams,
      );
      expect(res.status).toBe(200);
      const updateArgs = (db.assessmentTemplate.update as jest.Mock).mock.calls[0][0];
      expect(updateArgs.data.resultsEmailBodyMarkdown).toBe("Edited body");
      expect(updateArgs.data.resultsEmailContentApproved).toBe(false);
      expect(updateArgs.data.resultsEmailContentApprovedHash).toBeNull();
      expect(updateArgs.data.resultsEmailContentApprovedAt).toBeNull();
      expect(updateArgs.data.resultsEmailContentApprovedBy).toBeNull();
    });

    it("editing the subject after approval clears approval", async () => {
      (getApiActor as jest.Mock).mockResolvedValue(adminActor);
      (db.assessmentTemplate.findFirst as jest.Mock).mockResolvedValue(existingTemplate());
      (db.assessmentTemplate.update as jest.Mock).mockResolvedValue({});
      const res = await detailPATCH(
        patchReq({ resultsEmailSubject: "New subject" }) as never,
        detailParams,
      );
      expect(res.status).toBe(200);
      const updateArgs = (db.assessmentTemplate.update as jest.Mock).mock.calls[0][0];
      expect(updateArgs.data.resultsEmailContentApproved).toBe(false);
      expect(updateArgs.data.resultsEmailContentApprovedHash).toBeNull();
    });

    it("does NOT clear approval when content is sent unchanged (no-op edit)", async () => {
      (getApiActor as jest.Mock).mockResolvedValue(adminActor);
      (db.assessmentTemplate.findFirst as jest.Mock).mockResolvedValue(existingTemplate());
      (db.assessmentTemplate.update as jest.Mock).mockResolvedValue({});
      const res = await detailPATCH(
        patchReq({
          resultsEmailSubject: "Your results",
          resultsEmailBodyMarkdown: "Here is your report.",
        }) as never,
        detailParams,
      );
      expect(res.status).toBe(200);
      const updateArgs = (db.assessmentTemplate.update as jest.Mock).mock.calls[0][0];
      // Approval state untouched (not forced to false).
      expect(updateArgs.data.resultsEmailContentApproved).toBeUndefined();
      expect(updateArgs.data.resultsEmailContentApprovedHash).toBeUndefined();
    });

    it("approving stores hash (of current content) + at + by", async () => {
      (getApiActor as jest.Mock).mockResolvedValue(adminActor);
      (db.assessmentTemplate.findFirst as jest.Mock).mockResolvedValue(
        existingTemplate({
          resultsEmailContentApproved: false,
          resultsEmailContentApprovedHash: null,
          resultsEmailContentApprovedAt: null,
          resultsEmailContentApprovedBy: null,
        }),
      );
      (db.assessmentTemplate.update as jest.Mock).mockResolvedValue({});
      const res = await detailPATCH(
        patchReq({ resultsEmailContentApproved: true }) as never,
        detailParams,
      );
      expect(res.status).toBe(200);
      const updateArgs = (db.assessmentTemplate.update as jest.Mock).mock.calls[0][0];
      expect(updateArgs.data.resultsEmailContentApproved).toBe(true);
      expect(updateArgs.data.resultsEmailContentApprovedHash).toBe(
        hashOf("Your results", "Here is your report."),
      );
      expect(updateArgs.data.resultsEmailContentApprovedAt).toBeInstanceOf(Date);
      expect(updateArgs.data.resultsEmailContentApprovedBy).toBe(adminActor.email);
    });

    it("editing AND approving in one request binds the hash to the NEW content", async () => {
      (getApiActor as jest.Mock).mockResolvedValue(adminActor);
      (db.assessmentTemplate.findFirst as jest.Mock).mockResolvedValue(existingTemplate());
      (db.assessmentTemplate.update as jest.Mock).mockResolvedValue({});
      const res = await detailPATCH(
        patchReq({
          resultsEmailSubject: "Fresh subject",
          resultsEmailBodyMarkdown: "Fresh body",
          resultsEmailContentApproved: true,
        }) as never,
        detailParams,
      );
      expect(res.status).toBe(200);
      const updateArgs = (db.assessmentTemplate.update as jest.Mock).mock.calls[0][0];
      expect(updateArgs.data.resultsEmailContentApproved).toBe(true);
      expect(updateArgs.data.resultsEmailContentApprovedHash).toBe(
        hashOf("Fresh subject", "Fresh body"),
      );
      expect(updateArgs.data.resultsEmailContentApprovedBy).toBe(adminActor.email);
    });

    it("explicit unapprove (false) clears hash + at + by", async () => {
      (getApiActor as jest.Mock).mockResolvedValue(adminActor);
      (db.assessmentTemplate.findFirst as jest.Mock).mockResolvedValue(existingTemplate());
      (db.assessmentTemplate.update as jest.Mock).mockResolvedValue({});
      const res = await detailPATCH(
        patchReq({ resultsEmailContentApproved: false }) as never,
        detailParams,
      );
      expect(res.status).toBe(200);
      const updateArgs = (db.assessmentTemplate.update as jest.Mock).mock.calls[0][0];
      expect(updateArgs.data.resultsEmailContentApproved).toBe(false);
      expect(updateArgs.data.resultsEmailContentApprovedHash).toBeNull();
      expect(updateArgs.data.resultsEmailContentApprovedAt).toBeNull();
      expect(updateArgs.data.resultsEmailContentApprovedBy).toBeNull();
    });
  });
});

describe("DELETE /api/admin/assessment-templates/[id]", () => {
  const detailParams = { params: Promise.resolve({ id: "tpl-1" }) };

  it("404 when template missing", async () => {
    (getApiActor as jest.Mock).mockResolvedValue(adminActor);
    (db.assessmentTemplate.findFirst as jest.Mock).mockResolvedValue(null);
    const res = await detailDELETE(
      emptyReq("http://localhost/api/admin/assessment-templates/tpl-1") as never,
      detailParams,
    );
    expect(res.status).toBe(404);
  });

  it("409 when an ACTIVE campaign references the template", async () => {
    (getApiActor as jest.Mock).mockResolvedValue(adminActor);
    (db.assessmentTemplate.findFirst as jest.Mock).mockResolvedValue({ id: "tpl-1" });
    (db.assessmentCampaign.findFirst as jest.Mock).mockResolvedValue({ id: "c1" });
    const res = await detailDELETE(
      emptyReq("http://localhost/api/admin/assessment-templates/tpl-1") as never,
      detailParams,
    );
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.error).toBe("TEMPLATE_HAS_ACTIVE_CAMPAIGNS");
  });

  it("happy path: soft-deletes + audits when no active campaigns", async () => {
    (getApiActor as jest.Mock).mockResolvedValue(adminActor);
    (db.assessmentTemplate.findFirst as jest.Mock).mockResolvedValue({ id: "tpl-1" });
    (db.assessmentCampaign.findFirst as jest.Mock).mockResolvedValue(null);
    (db.assessmentTemplate.update as jest.Mock).mockResolvedValue({});
    const res = await detailDELETE(
      emptyReq("http://localhost/api/admin/assessment-templates/tpl-1") as never,
      detailParams,
    );
    expect(res.status).toBe(200);
    const updateArgs = (db.assessmentTemplate.update as jest.Mock).mock.calls[0][0];
    expect(updateArgs.data.deletedAt).toBeInstanceOf(Date);
    expect(db.auditLog.create).toHaveBeenCalled();
  });
});

describe("POST /api/admin/assessment-templates/[id]/versions/[versionId]/publish", () => {
  const publishParams = {
    params: Promise.resolve({ id: "tpl-1", versionId: "ver-1" }),
  };

  function pubReq() {
    return emptyReq(
      "http://localhost/api/admin/assessment-templates/tpl-1/versions/ver-1/publish",
      "POST",
    );
  }

  it("404 when version missing", async () => {
    (getApiActor as jest.Mock).mockResolvedValue(adminActor);
    (db.assessmentTemplateVersion.findUnique as jest.Mock).mockResolvedValue(null);
    const res = await publishPOST(pubReq() as never, publishParams);
    expect(res.status).toBe(404);
  });

  it("404 when version belongs to a different template", async () => {
    (getApiActor as jest.Mock).mockResolvedValue(adminActor);
    (db.assessmentTemplateVersion.findUnique as jest.Mock).mockResolvedValue({
      id: "ver-1",
      templateId: "tpl-other",
      publishedAt: null,
      versionNumber: 1,
    });
    const res = await publishPOST(pubReq() as never, publishParams);
    expect(res.status).toBe(404);
  });

  it("409 when already published", async () => {
    (getApiActor as jest.Mock).mockResolvedValue(adminActor);
    (db.assessmentTemplateVersion.findUnique as jest.Mock).mockResolvedValue({
      id: "ver-1",
      templateId: "tpl-1",
      publishedAt: new Date(),
      versionNumber: 1,
    });
    const res = await publishPOST(pubReq() as never, publishParams);
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.error).toBe("ALREADY_PUBLISHED");
  });

  it("happy path: sets publishedAt + publishedBy + audit", async () => {
    (getApiActor as jest.Mock).mockResolvedValue(adminActor);
    // D2.1 strict publish-time validation now runs against the full content;
    // mock must include passable questions/sections/scoringConfig (no D2
    // opt-ins so legacy schema rules apply).
    (db.assessmentTemplateVersion.findUnique as jest.Mock).mockResolvedValue({
      id: "ver-1",
      templateId: "tpl-1",
      publishedAt: null,
      versionNumber: 1,
      questions: [
        {
          stableKey: "Q1",
          sortOrder: 1,
          type: "SLIDER_LIKERT",
          label: "Q1",
          isRequired: true,
          sectionStableKey: "S1",
          scale: { min: 0, max: 3, step: 1, anchorMin: "L", anchorMax: "H" },
        },
      ],
      sections: [{ stableKey: "S1", sortOrder: 1, name: "S1" }],
      scoringConfig: {
        tierMetric: "overallTotal",
        passThreshold: 2,
        tiers: [{ minMetric: 0, maxMetric: 3, label: "X", message: "x" }],
      },
    });
    (db.assessmentTemplateVersion.update as jest.Mock).mockResolvedValue({});
    const res = await publishPOST(pubReq() as never, publishParams);
    expect(res.status).toBe(200);
    const updateArgs = (db.assessmentTemplateVersion.update as jest.Mock).mock
      .calls[0][0];
    expect(updateArgs.data.publishedAt).toBeInstanceOf(Date);
    expect(updateArgs.data.publishedBy).toBe("u1");
    expect(db.auditLog.create).toHaveBeenCalled();
  });

  it("422 PUBLISH_VALIDATION_FAILED when content has placeholder sentinel (D2.1)", async () => {
    (getApiActor as jest.Mock).mockResolvedValue(adminActor);
    (db.assessmentTemplateVersion.findUnique as jest.Mock).mockResolvedValue({
      id: "ver-1",
      templateId: "tpl-1",
      publishedAt: null,
      versionNumber: 1,
      questions: [
        {
          stableKey: "Q1",
          sortOrder: 1,
          type: "SLIDER_LIKERT",
          label: "Q1",
          isRequired: true,
          sectionStableKey: "S1",
          scale: { min: 0, max: 10, step: 1, anchorMin: "L", anchorMax: "H" },
          recommendations: [
            { minScore: 0, maxScore: 3, text: "TODO low copy" },
            { minScore: 4, maxScore: 7, text: "mid copy" },
            { minScore: 8, maxScore: 10, text: "high copy" },
          ],
        },
      ],
      sections: [{ stableKey: "S1", sortOrder: 1, name: "S1" }],
      scoringConfig: {
        tierMetric: "overallTotal",
        passThreshold: 7,
        tiers: [{ minMetric: 0, maxMetric: 10, label: "X", message: "x" }],
      },
    });
    const res = await publishPOST(pubReq() as never, publishParams);
    expect(res.status).toBe(422);
    const body = await res.json();
    expect(body.error).toBe("PUBLISH_VALIDATION_FAILED");
  });
});
