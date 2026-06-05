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

import { readFileSync } from "fs";
import { join } from "path";

import { POST } from "@/app/api/assessments/import/route";
import { db } from "@/lib/db";
import { getApiActor } from "@/lib/auth/authorization";
import { withRateLimit } from "@/lib/rate-limit";
import {
  getCrosswalkByVariant,
  validateCrosswalkAgainstVersion,
  qspV2Crosswalk,
} from "@/lib/assessments/esperto-import/crosswalks";

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
          create: jest.fn().mockResolvedValue({ id: "org-new" }),
        },
        orgRespondent: {
          findMany: jest.fn().mockResolvedValue([]),
          create: jest.fn().mockResolvedValue({ id: "r-new" }),
          update: jest.fn().mockResolvedValue({ id: "r1" }),
        },
        auditLog: { create: jest.fn().mockResolvedValue({ id: "a1" }) },
      }),
  );
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
