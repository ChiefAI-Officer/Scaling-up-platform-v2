/**
 * Assessment v7.6 — Admin template version edit + duplicate route tests.
 *
 * Covers:
 *   - GET /api/admin/assessment-templates/[id]/versions/[versionId]
 *   - PATCH content on draft version
 *   - PATCH 409 ALREADY_PUBLISHED on published
 *   - POST /duplicate creates a new draft with content copied + versionNumber++
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
    assessmentTemplate: { findUnique: jest.fn() },
    assessmentTemplateVersion: {
      findUnique: jest.fn(),
      findFirst: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
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

import {
  GET as versionGET,
  PATCH as versionPATCH,
} from "@/app/api/admin/assessment-templates/[id]/versions/[versionId]/route";
import { POST as duplicatePOST } from "@/app/api/admin/assessment-templates/[id]/versions/[versionId]/duplicate/route";
import { db } from "@/lib/db";
import { getApiActor } from "@/lib/auth/authorization";

const adminActor = {
  userId: "u1",
  email: "admin@example.com",
  role: "ADMIN" as const,
  coachId: null,
};

function jsonReq(url: string, body: unknown, method = "PATCH"): Request {
  return new Request(url, {
    method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

const versionParams = {
  params: Promise.resolve({ id: "tpl-1", versionId: "ver-1" }),
};

beforeEach(() => {
  jest.clearAllMocks();
});

describe("GET /api/admin/assessment-templates/[id]/versions/[versionId]", () => {
  it("404 when version is on a different template", async () => {
    (getApiActor as jest.Mock).mockResolvedValue(adminActor);
    (db.assessmentTemplateVersion.findUnique as jest.Mock).mockResolvedValue({
      id: "ver-1",
      templateId: "tpl-other",
    });
    (db.assessmentTemplate.findUnique as jest.Mock).mockResolvedValue({});
    const res = await versionGET(new Request("http://l") as never, versionParams);
    expect(res.status).toBe(404);
  });

  it("200 returns version + template", async () => {
    (getApiActor as jest.Mock).mockResolvedValue(adminActor);
    (db.assessmentTemplateVersion.findUnique as jest.Mock).mockResolvedValue({
      id: "ver-1",
      templateId: "tpl-1",
      versionNumber: 1,
      language: "en",
      questions: [],
      sections: [],
      scoringConfig: {},
      reportConfig: null,
      publishedAt: null,
      contentHash: "h",
    });
    (db.assessmentTemplate.findUnique as jest.Mock).mockResolvedValue({
      id: "tpl-1",
      name: "Demo",
      alias: "demo",
      invitationSubject: "s",
      invitationBodyMarkdown: "b",
    });
    const res = await versionGET(new Request("http://l") as never, versionParams);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.version.versionNumber).toBe(1);
    expect(body.data.template.alias).toBe("demo");
  });
});

describe("PATCH /api/admin/assessment-templates/[id]/versions/[versionId]", () => {
  const validBody = {
    questions: [{ id: "q" }],
    sections: [{ id: "s" }],
    scoringConfig: { tiers: [] },
  };

  it("409 ALREADY_PUBLISHED when version is published", async () => {
    (getApiActor as jest.Mock).mockResolvedValue(adminActor);
    (db.assessmentTemplateVersion.findUnique as jest.Mock).mockResolvedValue({
      templateId: "tpl-1",
      publishedAt: new Date(),
    });
    (db.assessmentTemplate.findUnique as jest.Mock).mockResolvedValue({
      invitationSubject: "s",
      invitationBodyMarkdown: "b",
    });
    const res = await versionPATCH(
      jsonReq("http://l", validBody) as never,
      versionParams,
    );
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.error).toBe("ALREADY_PUBLISHED");
  });

  it("200 updates content + recomputes contentHash + audit", async () => {
    (getApiActor as jest.Mock).mockResolvedValue(adminActor);
    (db.assessmentTemplateVersion.findUnique as jest.Mock).mockResolvedValue({
      templateId: "tpl-1",
      publishedAt: null,
    });
    (db.assessmentTemplate.findUnique as jest.Mock).mockResolvedValue({
      invitationSubject: "s",
      invitationBodyMarkdown: "b",
    });
    (db.assessmentTemplateVersion.update as jest.Mock).mockResolvedValue({});
    const res = await versionPATCH(
      jsonReq("http://l", validBody) as never,
      versionParams,
    );
    expect(res.status).toBe(200);
    const upd = (db.assessmentTemplateVersion.update as jest.Mock).mock.calls[0][0];
    expect(upd.data.contentHash).toMatch(/^[0-9a-f]{64}$/);
    expect(db.auditLog.create).toHaveBeenCalled();
  });
});

describe("POST /duplicate", () => {
  it("404 when source version is on a different template", async () => {
    (getApiActor as jest.Mock).mockResolvedValue(adminActor);
    (db.assessmentTemplateVersion.findUnique as jest.Mock).mockResolvedValue({
      id: "ver-1",
      templateId: "tpl-other",
    });
    const res = await duplicatePOST(
      new Request("http://l", { method: "POST" }) as never,
      versionParams,
    );
    expect(res.status).toBe(404);
  });

  it("200 copies content + bumps versionNumber + audits", async () => {
    (getApiActor as jest.Mock).mockResolvedValue(adminActor);
    (db.assessmentTemplateVersion.findUnique as jest.Mock).mockResolvedValue({
      id: "ver-1",
      templateId: "tpl-1",
      language: "en",
      questions: [{ id: "q" }],
      sections: [],
      scoringConfig: {},
      reportConfig: null,
      contentHash: "abc",
    });
    (db.assessmentTemplateVersion.findFirst as jest.Mock).mockResolvedValue({
      versionNumber: 1,
    });
    (db.assessmentTemplateVersion.create as jest.Mock).mockResolvedValue({
      id: "ver-2",
      versionNumber: 2,
    });
    const res = await duplicatePOST(
      new Request("http://l", { method: "POST" }) as never,
      versionParams,
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.newVersionId).toBe("ver-2");
    expect(body.data.versionNumber).toBe(2);
    const createArgs = (db.assessmentTemplateVersion.create as jest.Mock).mock
      .calls[0][0];
    expect(createArgs.data.versionNumber).toBe(2);
    expect(createArgs.data.publishedAt).toBeNull();
    expect(db.auditLog.create).toHaveBeenCalled();
  });
});
