/**
 * Esperto historical import — POST /api/assessments/import (COACH-scoped) tests.
 *
 * Jeff's decision: import is coach-operated. This route mirrors the admin route's
 * orchestration (parse → classify → resolve org → build plan → preview/commit)
 * but the owner coach is ALWAYS derived from the authenticated actor — never the
 * body — and the results org-resolution is filtered by `organization.ownerCoachId`
 * so a coach can never import into another coach's company.
 *
 * Mirrors the admin-route test mocking (next/server, db, authorization,
 * rate-limit, crosswalks). Pure plan/commit modules are real (commit uses a
 * mocked tx); we mock the DB delegates the route touches.
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
    organization: { findFirst: jest.fn(), findUnique: jest.fn() },
    orgRespondent: { findMany: jest.fn() },
    assessmentTemplate: { findFirst: jest.fn() },
    assessmentTemplateVersion: { findFirst: jest.fn() },
    $transaction: jest.fn(),
  },
}));

// Crosswalk registry — mocked so a test can control variant→crosswalk lookup +
// locked state + version compatibility without flipping the real QSP v2 crosswalk.
jest.mock("@/lib/assessments/esperto-import/crosswalks", () => {
  const actual = jest.requireActual(
    "@/lib/assessments/esperto-import/crosswalks",
  );
  return {
    ...actual,
    getCrosswalkByVariant: jest.fn(actual.getCrosswalkByVariant),
    getCrosswalkByTemplateAlias: jest.fn(actual.getCrosswalkByTemplateAlias),
    validateCrosswalkAgainstVersion: jest.fn(actual.validateCrosswalkAgainstVersion),
  };
});

jest.mock("@/lib/auth/authorization", () => ({
  getApiActor: jest.fn(),
  isPrivilegedRole: (role: string) => role === "ADMIN" || role === "STAFF",
}));

jest.mock("@/lib/rate-limit", () => ({
  RateLimits: { standard: { interval: 60000, maxRequests: 100 } },
  withRateLimit: jest.fn().mockResolvedValue({ allowed: true, headers: {} }),
}));

// Wave O flag gate — default OFF (dark) unless a test flips it on.
jest.mock("@/lib/assessments/wave-o-flags", () => ({
  isEspertoSuFullImportEnabled: jest.fn().mockReturnValue(false),
}));

// Access-control predicates — mocked so tests control allow/deny without
// standing up the full AccessControlDb surface (coach/accessGroup* rows etc).
jest.mock("@/lib/assessments/access-control", () => ({
  canAccessOrganization: jest.fn().mockResolvedValue(true),
  canCreateCampaign: jest.fn().mockResolvedValue(true),
  asAccessDb: (x: unknown) => x,
}));

import { readFileSync } from "fs";
import { join } from "path";

import { POST } from "@/app/api/assessments/import/route";
import { db } from "@/lib/db";
import { getApiActor } from "@/lib/auth/authorization";
import { withRateLimit } from "@/lib/rate-limit";
import {
  getCrosswalkByVariant,
  getCrosswalkByTemplateAlias,
  validateCrosswalkAgainstVersion,
  qspV2Crosswalk,
} from "@/lib/assessments/esperto-import/crosswalks";
import type { Crosswalk } from "@/lib/assessments/esperto-import/crosswalks";
import { isEspertoSuFullImportEnabled } from "@/lib/assessments/wave-o-flags";
import {
  canAccessOrganization,
  canCreateCampaign,
} from "@/lib/assessments/access-control";
import type { EspertoRestricted } from "@/lib/assessments/esperto-import/types";

/** The real QSP v2 report fixture (3 personal rows, campaignid BDvhuDORxZ). */
const reportFixture = JSON.parse(
  readFileSync(
    join(
      __dirname,
      "../../lib/assessments/esperto-import/fixtures/report-qsp-v2.json",
    ),
    "utf8",
  ),
);

/** A locked copy of the real crosswalk for happy-path results tests. */
const lockedQspV2 = { ...qspV2Crosswalk, locked: true };

/** The 3 fixture memberids → resolved roster respondents in one org. */
const FIXTURE_MEMBERIDS = ["MxRWB1GIwu", "CVMmsiWPTP", "mWSw2H9f6E"];
function resolvedRoster(orgId = "org-r") {
  return FIXTURE_MEMBERIDS.map((m, i) => ({
    id: `resp-${i}`,
    externalId: m,
    organizationId: orgId,
    roleType: null,
  }));
}

/** The logged-in coach. coachId is what scopes ALL of this route's reads/writes. */
const coachActor = {
  role: "COACH" as const,
  coachId: "coach-1",
  userId: "u1",
  email: "c@x.com",
};

/** An admin WITHOUT a coachId — must be rejected (admins use the admin route). */
const adminNoCoach = {
  role: "ADMIN" as const,
  coachId: null,
  userId: "admin",
  email: "admin@x.com",
};

const membersPayload = [
  {
    memberid: "M1",
    title: "CEO",
    firstname: "Jane",
    middlename: "",
    lastname: "Doe",
    email: "jane@example.com",
    status: "active",
    level: "ceofounderwithteam",
    testuser: false,
    extra: [],
  },
];

// Minimal request mock implementing the surface the route uses (`.text()` +
// `.headers.get()`).
function req(body: unknown, headers: Record<string, string> = {}): Request {
  const raw = JSON.stringify(body);
  const lower: Record<string, string> = {};
  for (const k of Object.keys(headers)) lower[k.toLowerCase()] = headers[k];
  return {
    headers: { get: (k: string) => lower[k.toLowerCase()] ?? null },
    text: async () => raw,
  } as unknown as Request;
}

beforeEach(() => {
  jest.clearAllMocks();
  (withRateLimit as jest.Mock).mockResolvedValue({ allowed: true, headers: {} });
  (db.organization.findFirst as jest.Mock).mockResolvedValue(null);
  (db.orgRespondent.findMany as jest.Mock).mockResolvedValue([]);
  // Results-path db defaults (overridden per-test). org owned by coach-1.
  (db.organization.findUnique as jest.Mock).mockResolvedValue({
    id: "org-r",
    ownerCoachId: "coach-1",
  });
  (db.assessmentTemplate.findFirst as jest.Mock).mockResolvedValue({ id: "tmpl-1" });
  (db.assessmentTemplateVersion.findFirst as jest.Mock).mockResolvedValue({
    id: "ver-1",
    language: "enUS",
    questions: [],
    sections: [],
    scoringConfig: {},
  });
  (getCrosswalkByVariant as jest.Mock).mockImplementation(
    jest.requireActual("@/lib/assessments/esperto-import/crosswalks")
      .getCrosswalkByVariant,
  );
  (validateCrosswalkAgainstVersion as jest.Mock).mockReturnValue({
    ok: true,
    problems: [],
  });
  (db.$transaction as jest.Mock).mockImplementation(
    async (cb: (tx: unknown) => Promise<unknown>) =>
      cb({
        $executeRaw: jest.fn().mockResolvedValue(1),
        organization: {
          findFirst: jest.fn().mockResolvedValue(null),
          findUnique: jest.fn().mockResolvedValue({ id: "org-r", espertoSuFullCid: null }),
          create: jest.fn().mockResolvedValue({ id: "org-new" }),
          update: jest.fn().mockResolvedValue({}),
        },
        orgRespondent: {
          findMany: jest.fn().mockResolvedValue([]),
          create: jest.fn().mockResolvedValue({ id: "r-new" }),
          update: jest.fn().mockResolvedValue({ id: "r1" }),
        },
        assessmentCampaign: {
          findFirst: jest.fn().mockResolvedValue(null),
          create: jest.fn().mockResolvedValue({ id: "camp-new" }),
          update: jest.fn().mockResolvedValue({}),
        },
        assessmentTemplateVersion: {
          findUnique: jest.fn().mockResolvedValue(null),
        },
        assessmentInvitation: {
          upsert: jest.fn().mockResolvedValue({ id: "inv-1" }),
        },
        assessmentSubmission: {
          create: jest.fn().mockResolvedValue({ id: "sub-1" }),
          aggregate: jest.fn().mockResolvedValue({
            _min: { submittedAt: null },
            _max: { submittedAt: null },
          }),
        },
        auditLog: { create: jest.fn().mockResolvedValue({ id: "a1" }) },
      }),
  );
  (getCrosswalkByTemplateAlias as jest.Mock).mockImplementation(
    jest.requireActual("@/lib/assessments/esperto-import/crosswalks")
      .getCrosswalkByTemplateAlias,
  );
  (isEspertoSuFullImportEnabled as jest.Mock).mockReturnValue(false);
  (canAccessOrganization as jest.Mock).mockResolvedValue(true);
  (canCreateCampaign as jest.Mock).mockResolvedValue(true);
});

describe("POST /api/assessments/import — auth (coach-scoped)", () => {
  it("401 when unauthenticated", async () => {
    (getApiActor as jest.Mock).mockResolvedValue(null);
    const res = await POST(
      req({ mode: "preview", kind: "roster", companyName: "Acme", payload: membersPayload }),
    );
    expect(res.status).toBe(401);
  });

  it("403 when the actor has no coachId (e.g. an admin — they use the admin route)", async () => {
    (getApiActor as jest.Mock).mockResolvedValue(adminNoCoach);
    const res = await POST(
      req({ mode: "preview", kind: "roster", companyName: "Acme", payload: membersPayload }),
    );
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error).toContain("Only coaches can import");
  });

  it("429 when rate-limited", async () => {
    (getApiActor as jest.Mock).mockResolvedValue(coachActor);
    (withRateLimit as jest.Mock).mockResolvedValue({ allowed: false, headers: {} });
    const res = await POST(
      req({ mode: "preview", kind: "roster", companyName: "Acme", payload: membersPayload }),
    );
    expect(res.status).toBe(429);
  });
});

describe("POST /api/assessments/import — bounds & validation", () => {
  beforeEach(() => {
    (getApiActor as jest.Mock).mockResolvedValue(coachActor);
  });

  it("413 when the Content-Length header exceeds 5MB", async () => {
    const res = await POST(
      req(
        { mode: "preview", kind: "roster", companyName: "Acme", payload: membersPayload },
        { "content-length": String(6 * 1024 * 1024) },
      ),
    );
    expect(res.status).toBe(413);
  });

  it("413 when the members array exceeds 2000 rows", async () => {
    const big = Array.from({ length: 2001 }, (_, i) => ({
      ...membersPayload[0],
      memberid: `M${i}`,
      email: `u${i}@example.com`,
    }));
    const res = await POST(
      req({ mode: "preview", kind: "roster", companyName: "Acme", payload: big }),
    );
    expect(res.status).toBe(413);
  });

  it("400 when companyName is missing for kind:roster", async () => {
    const res = await POST(
      req({ mode: "preview", kind: "roster", payload: membersPayload }),
    );
    expect(res.status).toBe(400);
  });

  it("400 when payload is not a members export (kind:roster)", async () => {
    const res = await POST(
      req({
        mode: "preview",
        kind: "roster",
        companyName: "Acme",
        payload: { personal: [{ variant: "x", campaignid: "y" }], summary: [] },
      }),
    );
    expect(res.status).toBe(400);
  });

  it("400 for kind:results when the payload is NOT a report export", async () => {
    const res = await POST(
      req({ mode: "preview", kind: "results", payload: membersPayload }),
    );
    expect(res.status).toBe(400);
  });
});

describe("POST /api/assessments/import — roster (coach-scoped owner)", () => {
  beforeEach(() => {
    (getApiActor as jest.Mock).mockResolvedValue(coachActor);
  });

  it("preview resolves the org scoped to the coach (ownerCoachId === coach-1), NO writes", async () => {
    const res = await POST(
      req({ mode: "preview", kind: "roster", companyName: "Acme", payload: membersPayload }),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.plan.orgAction).toBe("create");
    expect(body.data.plan.creates).toHaveLength(1);
    // The org lookup must be scoped to THIS coach.
    expect(db.organization.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ ownerCoachId: "coach-1", name: "Acme", deletedAt: null }),
      }),
    );
    // The plan must carry the coach's id as the owner.
    expect(body.data.plan.ownerCoachId).toBe("coach-1");
    expect(db.$transaction).not.toHaveBeenCalled();
  });

  it("IGNORES an ownerCoachId in the body — always uses actor.coachId", async () => {
    const res = await POST(
      req({
        mode: "preview",
        kind: "roster",
        companyName: "Acme",
        // A malicious/erroneous attempt to import on behalf of another coach.
        ownerCoachId: "coach-999",
        payload: membersPayload,
      }),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    // Org lookup + plan must use coach-1, never the body value.
    expect(db.organization.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ ownerCoachId: "coach-1" }),
      }),
    );
    expect(db.organization.findFirst).not.toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ ownerCoachId: "coach-999" }),
      }),
    );
    expect(body.data.plan.ownerCoachId).toBe("coach-1");
  });

  it("commit returns counts and the plan committed under coach-1", async () => {
    const res = await POST(
      req({ mode: "commit", kind: "roster", companyName: "Acme", payload: membersPayload }),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.created).toBe(1);
    expect(db.$transaction).toHaveBeenCalledTimes(1);
  });
});

// ────────────────────────────────────────────────────────────────────────
// kind:results pipeline — coach-scoped org resolution
// ────────────────────────────────────────────────────────────────────────

describe("POST /api/assessments/import — results (coach-scoped)", () => {
  beforeEach(() => {
    (getApiActor as jest.Mock).mockResolvedValue(coachActor);
    (db.orgRespondent.findMany as jest.Mock).mockResolvedValue(resolvedRoster());
  });

  it("resolves respondents filtered by organization.ownerCoachId === coach-1 (scoping)", async () => {
    (getCrosswalkByVariant as jest.Mock).mockReturnValue(lockedQspV2);
    await POST(req({ mode: "preview", kind: "results", payload: reportFixture }));
    // The respondent lookup MUST be scoped to the coach's orgs.
    expect(db.orgRespondent.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          externalId: expect.objectContaining({ in: FIXTURE_MEMBERIDS }),
          deletedAt: null,
          organization: { ownerCoachId: "coach-1" },
        }),
      }),
    );
  });

  // SECURITY (cross-coach isolation guarantee): the report's memberids belong to
  // a company owned by a DIFFERENT coach. Because the respondent query is filtered
  // by `organization.ownerCoachId = actor.coachId`, those members resolve to NONE
  // under this coach → 409 "no matching roster in your companies", NO commit, NO tx.
  it("409 'no matching roster in your companies' when members belong to another coach's org", async () => {
    (getCrosswalkByVariant as jest.Mock).mockReturnValue(lockedQspV2);
    // Scoped query returns [] because the org is owned by another coach.
    (db.orgRespondent.findMany as jest.Mock).mockResolvedValue([]);
    const res = await POST(
      req({ mode: "commit", kind: "results", payload: reportFixture }),
    );
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.error).toContain("No matching roster in your companies");
    expect(db.$transaction).not.toHaveBeenCalled();
  });

  it("409 when members resolve to MULTIPLE of the coach's organizations", async () => {
    (getCrosswalkByVariant as jest.Mock).mockReturnValue(lockedQspV2);
    (db.orgRespondent.findMany as jest.Mock).mockResolvedValue([
      { id: "r0", externalId: "MxRWB1GIwu", organizationId: "org-a", roleType: null },
      { id: "r1", externalId: "CVMmsiWPTP", organizationId: "org-b", roleType: null },
    ]);
    const res = await POST(
      req({ mode: "preview", kind: "results", payload: reportFixture }),
    );
    expect(res.status).toBe(409);
    expect(db.$transaction).not.toHaveBeenCalled();
  });

  it("422 when no published version exists (TEMPLATE_VERSION_NOT_PUBLISHED)", async () => {
    (getCrosswalkByVariant as jest.Mock).mockReturnValue(lockedQspV2);
    (db.assessmentTemplateVersion.findFirst as jest.Mock).mockResolvedValue(null);
    const res = await POST(
      req({ mode: "preview", kind: "results", payload: reportFixture }),
    );
    expect(res.status).toBe(422);
    const body = await res.json();
    expect(body.error).toBe("TEMPLATE_VERSION_NOT_PUBLISHED");
  });

  it("happy preview (locked crosswalk + roster owned by coach-1): 200 with campaigns, NO writes", async () => {
    (getCrosswalkByVariant as jest.Mock).mockReturnValue(lockedQspV2);
    const res = await POST(
      req({ mode: "preview", kind: "results", payload: reportFixture }),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.summary.campaigns).toBe(1);
    expect(body.data.summary.rows).toBe(3);
    expect(body.data.summary.blocks).toBe(0);
    expect(body.data.plan.campaigns[0].externalId).toBe("esperto:BDvhuDORxZ");
    expect(db.$transaction).not.toHaveBeenCalled();
  });
});

// ────────────────────────────────────────────────────────────────────────
// kind:restrictedResults pipeline (Wave O) — coach-scoped
// ────────────────────────────────────────────────────────────────────────

describe("POST /api/assessments/import — restrictedResults (Wave O, coach-scoped)", () => {
  const suFullCrosswalk: Crosswalk = {
    templateAlias: "scaling-up-full",
    espertoVariant: "ScalingUpAssessment",
    locked: true,
    map: [
      { espertoKey: "Q1_1", stableKey: "SUF_rate_a", ourType: "SLIDER_LIKERT" },
      { espertoKey: "Q2", stableKey: "SUF_headcount", ourType: "NUMBER" },
    ],
    droppedKeys: [{ key: "demo_role", reason: "demographic — not scored" }],
  };

  function restrictedFile(
    mid: string,
    reportid: string,
    date: string,
    overrides: Partial<Record<string, unknown>> = {},
  ): EspertoRestricted {
    return {
      reportid,
      date,
      name: "Some Company",
      tags: [],
      mat: "mat-token",
      cid: "cidSUFULL01",
      mid,
      raw: { Q1_1: 7, Q2: 42, demo_role: "CEO", ...overrides },
      processed: {},
    };
  }

  function baseBody(over: Record<string, unknown> = {}) {
    return {
      mode: "preview",
      kind: "restrictedResults",
      batchKind: "esperto-sufull-restricted-v1",
      roundLabel: "2025 Annual",
      targetOrgId: "org-r",
      files: [restrictedFile("MID_A", "rep-A", "2025-03-01T10:00:00-04:00")],
      ...over,
    };
  }

  beforeEach(() => {
    (getApiActor as jest.Mock).mockResolvedValue(coachActor);
    (getCrosswalkByTemplateAlias as jest.Mock).mockReturnValue(suFullCrosswalk);
    (db.assessmentTemplateVersion.findFirst as jest.Mock).mockResolvedValue({
      id: "ver-1",
      language: "enUS",
      questions: [
        { stableKey: "SUF_rate_a", type: "SLIDER_LIKERT", isRequired: true, scale: { min: 0, max: 10 } },
        { stableKey: "SUF_headcount", type: "NUMBER", isRequired: true },
      ],
      sections: [],
      scoringConfig: {},
    });
    (db.orgRespondent.findMany as jest.Mock).mockResolvedValue([
      { id: "resp-A", externalId: "MID_A" },
    ]);
  });

  describe("schema validation", () => {
    it("400 when batchKind is missing (stale-client signal)", async () => {
      const body = baseBody() as Record<string, unknown>;
      delete body.batchKind;
      const res = await POST(req(body));
      expect(res.status).toBe(400);
    });

    it("400 when batchKind has the wrong value", async () => {
      const res = await POST(req(baseBody({ batchKind: "some-old-version" })));
      expect(res.status).toBe(400);
    });

    it("400 when roundLabel is missing", async () => {
      const body = baseBody() as Record<string, unknown>;
      delete body.roundLabel;
      const res = await POST(req(body));
      expect(res.status).toBe(400);
    });

    it("400 when targetOrgId is missing", async () => {
      const body = baseBody() as Record<string, unknown>;
      delete body.targetOrgId;
      const res = await POST(req(body));
      expect(res.status).toBe(400);
    });

    it("400 when files is missing", async () => {
      const body = baseBody() as Record<string, unknown>;
      delete body.files;
      const res = await POST(req(body));
      expect(res.status).toBe(400);
    });

    it("400 when files is an empty array", async () => {
      const res = await POST(req(baseBody({ files: [] })));
      expect(res.status).toBe(400);
    });
  });

  describe("flag gate", () => {
    it("dark 404 when the flag is OFF — no DB touched", async () => {
      (isEspertoSuFullImportEnabled as jest.Mock).mockReturnValue(false);
      const res = await POST(req(baseBody()));
      expect(res.status).toBe(404);
      const body = await res.json();
      expect(body.error).toBe("Organization not found");
      expect(db.assessmentTemplate.findFirst).not.toHaveBeenCalled();
    });

    it("proceeds past the gate when the flag is ON", async () => {
      (isEspertoSuFullImportEnabled as jest.Mock).mockReturnValue(true);
      const res = await POST(req(baseBody()));
      expect(res.status).toBe(200);
    });
  });

  describe("batch cap (R3-M1)", () => {
    beforeEach(() => {
      (isEspertoSuFullImportEnabled as jest.Mock).mockReturnValue(true);
    });

    it("413 when files.length exceeds 300", async () => {
      const files = Array.from({ length: 301 }, (_, i) =>
        restrictedFile(`MID_${i}`, `rep-${i}`, "2025-03-01T10:00:00-04:00"),
      );
      const res = await POST(req(baseBody({ files })));
      expect(res.status).toBe(413);
    });
  });

  describe("org access", () => {
    beforeEach(() => {
      (isEspertoSuFullImportEnabled as jest.Mock).mockReturnValue(true);
    });

    it("404 when canAccessOrganization returns false", async () => {
      (canAccessOrganization as jest.Mock).mockResolvedValue(false);
      const res = await POST(req(baseBody()));
      expect(res.status).toBe(404);
      const body = await res.json();
      expect(body.error).toBe("Organization not found");
    });
  });

  describe("crosswalk/template/version resolution", () => {
    beforeEach(() => {
      (isEspertoSuFullImportEnabled as jest.Mock).mockReturnValue(true);
    });

    it("500 when the crosswalk registry has no SU-Full stub", async () => {
      (getCrosswalkByTemplateAlias as jest.Mock).mockReturnValue(null);
      const res = await POST(req(baseBody()));
      expect(res.status).toBe(500);
    });

    it("400 when the template is not found", async () => {
      (db.assessmentTemplate.findFirst as jest.Mock).mockResolvedValue(null);
      const res = await POST(req(baseBody()));
      expect(res.status).toBe(400);
    });

    it("422 when no published version exists", async () => {
      (db.assessmentTemplateVersion.findFirst as jest.Mock).mockResolvedValue(null);
      const res = await POST(req(baseBody()));
      expect(res.status).toBe(422);
      const body = await res.json();
      expect(body.error).toBe("TEMPLATE_VERSION_NOT_PUBLISHED");
    });

    it("422 when the crosswalk is incompatible with the published version", async () => {
      (validateCrosswalkAgainstVersion as jest.Mock).mockReturnValue({
        ok: false,
        problems: ["stableKey SUF_rate_a expects SLIDER_LIKERT but version has TEXT"],
      });
      const res = await POST(req(baseBody()));
      expect(res.status).toBe(422);
      const body = await res.json();
      expect(body.error).toBe("CROSSWALK_INCOMPATIBLE_WITH_VERSION");
    });
  });

  describe("entitlement", () => {
    beforeEach(() => {
      (isEspertoSuFullImportEnabled as jest.Mock).mockReturnValue(true);
    });

    it("403 when canCreateCampaign returns false, for BOTH preview and commit", async () => {
      (canCreateCampaign as jest.Mock).mockResolvedValue(false);
      const previewRes = await POST(req(baseBody({ mode: "preview" })));
      expect(previewRes.status).toBe(403);

      const commitRes = await POST(
        req(baseBody({ mode: "commit", expectedVersionId: "ver-1" })),
      );
      expect(commitRes.status).toBe(403);
    });
  });

  describe("preview", () => {
    beforeEach(() => {
      (isEspertoSuFullImportEnabled as jest.Mock).mockReturnValue(true);
    });

    it("200 with summary + resolvedVersionId, NO writes", async () => {
      const res = await POST(req(baseBody()));
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.success).toBe(true);
      expect(body.data.summary.creates).toBe(1);
      expect(body.data.summary.blocks).toEqual([]);
      expect(body.data.resolvedVersionId).toBe("ver-1");
      expect(db.$transaction).not.toHaveBeenCalled();
    });

    it("400 when a file fails to parse", async () => {
      const res = await POST(
        req(baseBody({ files: [{ nope: true }] })),
      );
      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.fileErrors).toHaveLength(1);
    });

    it("surfaces an aggregate-cid-mismatch warning without blocking", async () => {
      const aggregateFiles = [
        {
          ...restrictedFile("MID_AGG", "rep-agg", "2025-03-01T10:00:00-04:00"),
          cid: "DIFFERENT_CID",
          processed: { group_avg: 5 },
        },
      ];
      const res = await POST(req(baseBody({ aggregateFiles })));
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(
        body.data.summary.warnings.some(
          (w: { reason: string }) => w.reason === "aggregate-cid-mismatch",
        ),
      ).toBe(true);
      expect(body.data.summary.ignoredArtifacts).toBe(1);
    });
  });

  describe("commit", () => {
    beforeEach(() => {
      (isEspertoSuFullImportEnabled as jest.Mock).mockReturnValue(true);
      // The commit path runs the REAL scoreSubmission (not mocked in this
      // route test), so the published version's scoringConfig/questions must
      // pass TemplateVersionForScoringSchema — unlike the other describe
      // blocks above, which never reach scoring.
      (db.assessmentTemplateVersion.findFirst as jest.Mock).mockResolvedValue({
        id: "ver-1",
        language: "enUS",
        questions: [
          {
            stableKey: "SUF_rate_a",
            sortOrder: 1,
            type: "SLIDER_LIKERT",
            label: "Rate A",
            isRequired: true,
            scale: { min: 0, max: 10, step: 1, anchorMin: "Low", anchorMax: "High" },
          },
          {
            stableKey: "SUF_headcount",
            sortOrder: 2,
            type: "NUMBER",
            label: "Headcount",
            isRequired: true,
          },
        ],
        sections: [],
        scoringConfig: {
          tierMetric: "overallAvg",
          passThreshold: 5,
          tiers: [{ minMetric: 0, maxMetric: 10, label: "All", message: "ok" }],
        },
      });
    });

    it("400 when expectedVersionId is missing", async () => {
      const res = await POST(req(baseBody({ mode: "commit" })));
      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error).toContain("expectedVersionId is required");
      expect(db.$transaction).not.toHaveBeenCalled();
    });

    it("commits and returns the outcome", async () => {
      const res = await POST(
        req(baseBody({ mode: "commit", expectedVersionId: "ver-1" })),
      );
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.success).toBe(true);
      expect(body.data.outcome.kind).toBe("created");
      expect(db.$transaction).toHaveBeenCalledTimes(1);
    });

    it("409 version-changed-since-preview when expectedVersionId doesn't match the fresh resolution", async () => {
      const res = await POST(
        req(baseBody({ mode: "commit", expectedVersionId: "stale-version-id" })),
      );
      expect(res.status).toBe(409);
      const body = await res.json();
      expect(body.error).toBe("version-changed-since-preview");
    });
  });
});
