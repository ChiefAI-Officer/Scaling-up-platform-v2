/**
 * Assessment v7.6 — POST/DELETE /api/assessment-campaigns/[id]/participants.
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
  assessmentCampaignParticipant: {
    updateMany: jest.fn(),
    create: jest.fn(),
    createMany: jest.fn(),
    update: jest.fn(),
  },
};

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
      return { findUnique, findFirst };
    })(),
    assessmentCampaignParticipant: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
      delete: jest.fn(),
    },
    orgRespondent: { findMany: jest.fn() },
    orgTeam: { findMany: jest.fn() },
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

import {
  POST,
  DELETE,
  buildTeamPath,
} from "@/app/api/assessment-campaigns/[id]/participants/route";
import { db } from "@/lib/db";
import { getApiActor } from "@/lib/auth/authorization";

const coachActor = {
  userId: "u1",
  email: "coach@example.com",
  role: "COACH" as const,
  coachId: "coach-1",
};

function detailParams(id: string) {
  return { params: Promise.resolve({ id }) };
}

function jsonReq(body: unknown, method = "POST"): Request {
  return new Request("http://localhost/api/assessment-campaigns/c1/participants", {
    method,
    body: JSON.stringify(body),
    headers: { "Content-Type": "application/json" },
  });
}

beforeEach(() => {
  jest.clearAllMocks();
  txMock.assessmentCampaignParticipant.updateMany.mockResolvedValue({ count: 0 });
  txMock.assessmentCampaignParticipant.create.mockImplementation((args) =>
    Promise.resolve({
      id: "p-" + args.data.respondentId,
      respondentId: args.data.respondentId,
      isCEO: args.data.isCEO,
    }),
  );
  txMock.assessmentCampaignParticipant.createMany.mockImplementation((args) =>
    Promise.resolve({ count: args.data.length }),
  );
  txMock.assessmentCampaignParticipant.update.mockResolvedValue({});
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
  (db.assessmentCampaign.findUnique as jest.Mock).mockResolvedValue({
    id: "c1",
    organizationId: "org-1",
    templateId: "tpl-1",
    createdByCoachId: "coach-1",
    status: "DRAFT",
  });
  (db.assessmentCampaignParticipant.findMany as jest.Mock).mockResolvedValue([]);
  (db.orgTeam.findMany as jest.Mock).mockResolvedValue([]);
});

describe("buildTeamPath", () => {
  it("returns empty for null teamId", () => {
    expect(buildTeamPath(null, new Map())).toEqual({ ids: [], labels: [] });
  });

  it("walks parent chain root-to-leaf", () => {
    const teams = new Map([
      ["a", { id: "a", name: "Root", parentTeamId: null, deletedAt: null }],
      ["b", { id: "b", name: "Mid", parentTeamId: "a", deletedAt: null }],
      ["c", { id: "c", name: "Leaf", parentTeamId: "b", deletedAt: null }],
    ]);
    expect(buildTeamPath("c", teams)).toEqual({
      ids: ["a", "b", "c"],
      labels: ["Root", "Mid", "Leaf"],
    });
  });

  it("skips soft-deleted ancestors", () => {
    const teams = new Map([
      ["a", { id: "a", name: "Root", parentTeamId: null, deletedAt: new Date() }],
      ["b", { id: "b", name: "Mid", parentTeamId: "a", deletedAt: null }],
      ["c", { id: "c", name: "Leaf", parentTeamId: "b", deletedAt: null }],
    ]);
    expect(buildTeamPath("c", teams)).toEqual({
      ids: ["b", "c"],
      labels: ["Mid", "Leaf"],
    });
  });
});

describe("POST /participants", () => {
  it("401 unauthenticated", async () => {
    (getApiActor as jest.Mock).mockResolvedValue(null);
    const res = await POST(jsonReq({ respondentIds: ["r1"] }) as never, detailParams("c1"));
    expect(res.status).toBe(401);
  });

  it("404 when wrong coach (createdByCoachId mismatch)", async () => {
    (getApiActor as jest.Mock).mockResolvedValue({
      ...coachActor,
      coachId: "coach-OTHER",
    });
    const res = await POST(jsonReq({ respondentIds: ["r1"] }) as never, detailParams("c1"));
    expect(res.status).toBe(404);
  });

  it("409 when campaign not DRAFT", async () => {
    (getApiActor as jest.Mock).mockResolvedValue(coachActor);
    (db.assessmentCampaign.findUnique as jest.Mock).mockResolvedValue({
      id: "c1",
      organizationId: "org-1",
      templateId: "tpl-1",
      createdByCoachId: "coach-1",
      status: "ACTIVE",
    });
    const res = await POST(jsonReq({ respondentIds: ["r1"] }) as never, detailParams("c1"));
    expect(res.status).toBe(409);
  });

  it("400 when respondentIds reference wrong org", async () => {
    (getApiActor as jest.Mock).mockResolvedValue(coachActor);
    (db.orgRespondent.findMany as jest.Mock).mockResolvedValue([]); // none match
    const res = await POST(
      jsonReq({ respondentIds: ["r1", "r2"] }) as never,
      detailParams("c1"),
    );
    expect(res.status).toBe(400);
  });

  it("happy path: creates participants with isCEO + teamPath", async () => {
    (getApiActor as jest.Mock).mockResolvedValue(coachActor);
    (db.orgRespondent.findMany as jest.Mock).mockResolvedValue([
      { id: "r1", teamId: "t1", firstName: "A", lastName: "B" },
      { id: "r2", teamId: null, firstName: "C", lastName: "D" },
    ]);
    (db.orgTeam.findMany as jest.Mock).mockResolvedValue([
      { id: "t1", name: "Engineering", parentTeamId: null, deletedAt: null },
    ]);
    const res = await POST(
      jsonReq({ respondentIds: ["r1", "r2"], ceoRespondentId: "r2" }) as never,
      detailParams("c1"),
    );
    expect(res.status).toBe(201);
    // updateMany called to unset prior CEO.
    expect(txMock.assessmentCampaignParticipant.updateMany).toHaveBeenCalledWith({
      where: { campaignId: "c1", isCEO: true },
      data: { isCEO: false },
    });
    // Both rows created in a single createMany (no per-row N+1).
    expect(txMock.assessmentCampaignParticipant.createMany).toHaveBeenCalledTimes(1);
    const createManyData = (
      txMock.assessmentCampaignParticipant.createMany as jest.Mock
    ).mock.calls[0][0].data as Array<{
      respondentId: string;
      isCEO: boolean;
      teamPathAtAdd: string[];
      teamLabelsAtAdd: string[];
    }>;
    expect(createManyData).toHaveLength(2);
    // r2 was added with isCEO=true; r1 with isCEO=false.
    const r2Row = createManyData.find((d) => d.respondentId === "r2")!;
    const r1Row = createManyData.find((d) => d.respondentId === "r1")!;
    expect(r2Row.isCEO).toBe(true);
    expect(r1Row.isCEO).toBe(false);
    expect(r1Row.teamPathAtAdd).toEqual(["t1"]);
    expect(r1Row.teamLabelsAtAdd).toEqual(["Engineering"]);
    expect(r2Row.teamPathAtAdd).toEqual([]);
  });

  it("idempotent: skips already-attached respondents", async () => {
    (getApiActor as jest.Mock).mockResolvedValue(coachActor);
    (db.orgRespondent.findMany as jest.Mock).mockResolvedValue([
      { id: "r1", teamId: null, firstName: "A", lastName: "B" },
      { id: "r2", teamId: null, firstName: "C", lastName: "D" },
    ]);
    (db.assessmentCampaignParticipant.findMany as jest.Mock).mockResolvedValue([
      { respondentId: "r1" },
    ]);
    const res = await POST(
      jsonReq({ respondentIds: ["r1", "r2"] }) as never,
      detailParams("c1"),
    );
    expect(res.status).toBe(201);
    expect(txMock.assessmentCampaignParticipant.createMany).toHaveBeenCalledTimes(1);
    const createManyData = (
      txMock.assessmentCampaignParticipant.createMany as jest.Mock
    ).mock.calls[0][0].data as Array<{ respondentId: string }>;
    expect(createManyData).toHaveLength(1);
    expect(createManyData[0].respondentId).toBe("r2");
    const body = await res.json();
    expect(body.data.added).toBe(1);
    expect(body.data.skipped).toBe(1);
  });

  it("400 ceoRespondentId not in respondentIds", async () => {
    (getApiActor as jest.Mock).mockResolvedValue(coachActor);
    const res = await POST(
      jsonReq({ respondentIds: ["r1"], ceoRespondentId: "r-other" }) as never,
      detailParams("c1"),
    );
    expect(res.status).toBe(400);
  });
});

describe("DELETE /participants", () => {
  it("400 missing respondentId", async () => {
    (getApiActor as jest.Mock).mockResolvedValue(coachActor);
    const res = await DELETE(
      new Request("http://localhost/api/assessment-campaigns/c1/participants", {
        method: "DELETE",
      }) as never,
      detailParams("c1"),
    );
    expect(res.status).toBe(400);
  });

  it("404 when participant not present", async () => {
    (getApiActor as jest.Mock).mockResolvedValue(coachActor);
    (db.assessmentCampaignParticipant.findUnique as jest.Mock).mockResolvedValue(null);
    const res = await DELETE(
      new Request("http://localhost/api/assessment-campaigns/c1/participants?respondentId=r1", {
        method: "DELETE",
      }) as never,
      detailParams("c1"),
    );
    expect(res.status).toBe(404);
  });

  it("409 when campaign not DRAFT", async () => {
    (getApiActor as jest.Mock).mockResolvedValue(coachActor);
    (db.assessmentCampaign.findUnique as jest.Mock).mockResolvedValue({
      id: "c1",
      organizationId: "org-1",
      templateId: "tpl-1",
      createdByCoachId: "coach-1",
      status: "ACTIVE",
    });
    const res = await DELETE(
      new Request("http://localhost/api/assessment-campaigns/c1/participants?respondentId=r1", {
        method: "DELETE",
      }) as never,
      detailParams("c1"),
    );
    expect(res.status).toBe(409);
  });

  it("happy path: deletes participant", async () => {
    (getApiActor as jest.Mock).mockResolvedValue(coachActor);
    (db.assessmentCampaignParticipant.findUnique as jest.Mock).mockResolvedValue({
      id: "p1",
      respondentId: "r1",
    });
    (db.assessmentCampaignParticipant.delete as jest.Mock).mockResolvedValue({});
    const res = await DELETE(
      new Request("http://localhost/api/assessment-campaigns/c1/participants?respondentId=r1", {
        method: "DELETE",
      }) as never,
      detailParams("c1"),
    );
    expect(res.status).toBe(200);
    expect(db.assessmentCampaignParticipant.delete).toHaveBeenCalled();
  });
});
