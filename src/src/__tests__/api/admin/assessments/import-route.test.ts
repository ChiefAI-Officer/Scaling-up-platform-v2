/**
 * Esperto historical import — POST /api/admin/assessments/import route tests.
 *
 * Spec ref: plan 12a step 7/9. ADMIN-only (STAFF rejected — R2); rate-limited;
 * preview/commit modes; size/row bounds; kind:results→501.
 *
 * Mirrors the existing admin-route test mocking (next/server, db, authorization,
 * rate-limit). The plan/commit modules are real (pure / mocked-tx) — we mock the
 * DB delegates the route touches for org + respondent resolution.
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
// locked state + version compatibility without flipping the real (locked:false)
// QSP v2 crosswalk. The roster path never imports these, so this is inert there.
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
}));

jest.mock("@/lib/rate-limit", () => ({
  RateLimits: { standard: { interval: 60000, maxRequests: 100 } },
  withRateLimit: jest.fn().mockResolvedValue({ allowed: true, headers: {} }),
}));

import { readFileSync } from "fs";
import { join } from "path";

import { POST } from "@/app/api/admin/assessments/import/route";
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
      "../../../lib/assessments/esperto-import/fixtures/report-qsp-v2.json",
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
  }));
}

const adminActor = {
  userId: "admin",
  email: "admin@example.com",
  role: "ADMIN" as const,
  coachId: null,
};
const staffActor = { ...adminActor, role: "STAFF" as const };
const coachActor = {
  userId: "u1",
  email: "coach@example.com",
  role: "COACH" as const,
  coachId: "coach-1",
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
// `.headers.get()`). The jest-env global `Request` lacks a working `.text()`;
// production NextRequest provides both, so this faithfully mirrors runtime.
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
  // Results-path db defaults (overridden per-test).
  (db.organization.findUnique as jest.Mock).mockResolvedValue({
    id: "org-r",
    ownerCoachId: "coach-r",
  });
  (db.assessmentTemplate.findFirst as jest.Mock).mockResolvedValue({ id: "tmpl-1" });
  (db.assessmentTemplateVersion.findFirst as jest.Mock).mockResolvedValue({
    id: "ver-1",
    language: "enUS",
    questions: [],
    sections: [],
    scoringConfig: {},
  });
  // Crosswalk mocks default to the real behavior; happy-path tests override.
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

describe("POST /api/admin/assessments/import — auth", () => {
  it("401 when unauthenticated", async () => {
    (getApiActor as jest.Mock).mockResolvedValue(null);
    const res = await POST(
      req({ mode: "preview", kind: "roster", ownerCoachId: "c1", companyName: "Acme", payload: membersPayload }),
    );
    expect(res.status).toBe(401);
  });

  it("403 for STAFF (ADMIN-only)", async () => {
    (getApiActor as jest.Mock).mockResolvedValue(staffActor);
    const res = await POST(
      req({ mode: "preview", kind: "roster", ownerCoachId: "c1", companyName: "Acme", payload: membersPayload }),
    );
    expect(res.status).toBe(403);
  });

  it("403 for COACH", async () => {
    (getApiActor as jest.Mock).mockResolvedValue(coachActor);
    const res = await POST(
      req({ mode: "preview", kind: "roster", ownerCoachId: "c1", companyName: "Acme", payload: membersPayload }),
    );
    expect(res.status).toBe(403);
  });

  it("429 when rate-limited", async () => {
    (getApiActor as jest.Mock).mockResolvedValue(adminActor);
    (withRateLimit as jest.Mock).mockResolvedValue({ allowed: false, headers: {} });
    const res = await POST(
      req({ mode: "preview", kind: "roster", ownerCoachId: "c1", companyName: "Acme", payload: membersPayload }),
    );
    expect(res.status).toBe(429);
  });
});

describe("POST /api/admin/assessments/import — validation", () => {
  beforeEach(() => {
    (getApiActor as jest.Mock).mockResolvedValue(adminActor);
  });

  it("400 when payload is not a members export (kind:roster)", async () => {
    const res = await POST(
      req({
        mode: "preview",
        kind: "roster",
        ownerCoachId: "c1",
        companyName: "Acme",
        payload: { personal: [{ variant: "x", campaignid: "y" }], summary: [] },
      }),
    );
    expect(res.status).toBe(400);
  });

  it("400 on malformed / unrecognized payload", async () => {
    const res = await POST(
      req({ mode: "preview", kind: "roster", ownerCoachId: "c1", companyName: "Acme", payload: { nope: true } }),
    );
    expect(res.status).toBe(400);
  });

  it("400 on missing required body fields", async () => {
    const res = await POST(req({ mode: "preview", kind: "roster" }));
    expect(res.status).toBe(400);
  });

  it("413 when the members array exceeds 2000 rows", async () => {
    const big = Array.from({ length: 2001 }, (_, i) => ({
      ...membersPayload[0],
      memberid: `M${i}`,
      email: `u${i}@example.com`,
    }));
    const res = await POST(
      req({ mode: "preview", kind: "roster", ownerCoachId: "c1", companyName: "Acme", payload: big }),
    );
    expect(res.status).toBe(413);
  });

  it("400 for kind:results when the payload is NOT a report export", async () => {
    const res = await POST(
      req({ mode: "preview", kind: "results", payload: membersPayload }),
    );
    expect(res.status).toBe(400);
  });
});

describe("POST /api/admin/assessments/import — preview", () => {
  beforeEach(() => {
    (getApiActor as jest.Mock).mockResolvedValue(adminActor);
  });

  it("returns the plan with NO writes", async () => {
    const res = await POST(
      req({ mode: "preview", kind: "roster", ownerCoachId: "c1", companyName: "Acme", payload: membersPayload }),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.plan.orgAction).toBe("create");
    expect(body.data.plan.creates).toHaveLength(1);
    // Preview must not open a write transaction.
    expect(db.$transaction).not.toHaveBeenCalled();
  });

  it("reports a resolver-split block in the preview without writing", async () => {
    (db.organization.findFirst as jest.Mock).mockResolvedValue({ id: "org-1" });
    (db.orgRespondent.findMany as jest.Mock).mockResolvedValue([
      { id: "r1", externalId: "OTHER", normalizedEmail: "jane@example.com" },
    ]);
    const res = await POST(
      req({ mode: "preview", kind: "roster", ownerCoachId: "c1", companyName: "Acme", payload: membersPayload }),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.plan.blocks).toEqual([
      { memberid: "M1", reason: "resolver-split" },
    ]);
    expect(db.$transaction).not.toHaveBeenCalled();
  });
});

describe("POST /api/admin/assessments/import — commit", () => {
  beforeEach(() => {
    (getApiActor as jest.Mock).mockResolvedValue(adminActor);
  });

  it("commits and returns counts", async () => {
    const res = await POST(
      req({ mode: "commit", kind: "roster", ownerCoachId: "c1", companyName: "Acme", payload: membersPayload }),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.created).toBe(1);
    expect(db.$transaction).toHaveBeenCalledTimes(1);
  });

  it("409 (no commit) when the plan has blocks", async () => {
    (db.organization.findFirst as jest.Mock).mockResolvedValue({ id: "org-1" });
    (db.orgRespondent.findMany as jest.Mock).mockResolvedValue([
      { id: "r1", externalId: "OTHER", normalizedEmail: "jane@example.com" },
    ]);
    const res = await POST(
      req({ mode: "commit", kind: "roster", ownerCoachId: "c1", companyName: "Acme", payload: membersPayload }),
    );
    expect(res.status).toBe(409);
    expect(db.$transaction).not.toHaveBeenCalled();
  });
});

// ────────────────────────────────────────────────────────────────────────
// kind:results pipeline (§6.2–6.4)
// ────────────────────────────────────────────────────────────────────────

describe("POST /api/admin/assessments/import — results", () => {
  beforeEach(() => {
    (getApiActor as jest.Mock).mockResolvedValue(adminActor);
    // The roster's full resolved roster is the default for happy-path tests.
    (db.orgRespondent.findMany as jest.Mock).mockResolvedValue(resolvedRoster());
  });

  it("400 when there is no crosswalk for the report's variant", async () => {
    (getCrosswalkByVariant as jest.Mock).mockReturnValue(null);
    const res = await POST(
      req({ mode: "preview", kind: "results", payload: reportFixture }),
    );
    expect(res.status).toBe(400);
  });

  it("400 when the template (by crosswalk alias) is not found", async () => {
    (getCrosswalkByVariant as jest.Mock).mockReturnValue(lockedQspV2);
    (db.assessmentTemplate.findFirst as jest.Mock).mockResolvedValue(null);
    const res = await POST(
      req({ mode: "preview", kind: "results", payload: reportFixture }),
    );
    expect(res.status).toBe(400);
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

  it("422 when the crosswalk is incompatible with the published version (type/scale drift)", async () => {
    (getCrosswalkByVariant as jest.Mock).mockReturnValue(lockedQspV2);
    (validateCrosswalkAgainstVersion as jest.Mock).mockReturnValue({
      ok: false,
      problems: ["stableKey X expects SLIDER_LIKERT but version has TEXT"],
    });
    const res = await POST(
      req({ mode: "preview", kind: "results", payload: reportFixture }),
    );
    expect(res.status).toBe(422);
    const body = await res.json();
    expect(body.error).toBe("CROSSWALK_INCOMPATIBLE_WITH_VERSION");
    expect(body.problems).toHaveLength(1);
  });

  it("409 roster-missing when no report memberid resolves to a respondent", async () => {
    (getCrosswalkByVariant as jest.Mock).mockReturnValue(lockedQspV2);
    (db.orgRespondent.findMany as jest.Mock).mockResolvedValue([]);
    const res = await POST(
      req({ mode: "preview", kind: "results", payload: reportFixture }),
    );
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.error).toContain("roster not imported");
  });

  it("409 when members resolve to MULTIPLE organizations", async () => {
    (getCrosswalkByVariant as jest.Mock).mockReturnValue(lockedQspV2);
    (db.orgRespondent.findMany as jest.Mock).mockResolvedValue([
      { id: "r0", externalId: "MxRWB1GIwu", organizationId: "org-a" },
      { id: "r1", externalId: "CVMmsiWPTP", organizationId: "org-b" },
    ]);
    const res = await POST(
      req({ mode: "preview", kind: "results", payload: reportFixture }),
    );
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.error).toContain("multiple organizations");
  });

  it("happy preview (locked crosswalk + full roster): 200 with campaigns, NO writes", async () => {
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
    // Preview must not open a write transaction.
    expect(db.$transaction).not.toHaveBeenCalled();
  });

  it("preview with the REAL (locked:false) crosswalk surfaces a crosswalk-not-locked block", async () => {
    // Use the real registry lookup (default beforeEach) — QSP v2 is locked:false.
    const res = await POST(
      req({ mode: "preview", kind: "results", payload: reportFixture }),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.summary.campaigns).toBe(0);
    expect(body.data.plan.blocks).toContainEqual(
      expect.objectContaining({ reason: "crosswalk-not-locked" }),
    );
  });

  it("409 on COMMIT when the plan has blocks (not-locked crosswalk)", async () => {
    // Real locked:false crosswalk → plan blocks → commit refused, no tx.
    const res = await POST(
      req({ mode: "commit", kind: "results", payload: reportFixture }),
    );
    expect(res.status).toBe(409);
    expect(db.$transaction).not.toHaveBeenCalled();
  });
});
