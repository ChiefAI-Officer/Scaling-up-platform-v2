/**
 * Wave N — hasComparableLongitudinal() unit tests.
 *
 * Mocking strategy (mirrors respondent-longitudinal.test.ts):
 *   - canAccessTemplate (access-control) is mocked via jest.mock so template
 *     access is fully controllable; asAccessDb is identity.
 *   - reportConfigFor is the REAL module (not mocked) — the scored-only scope
 *     gate must react to actual template aliases.
 *   - isRespondentLongitudinalEnabled is the REAL module — the flag is driven
 *     by process.env (default-OFF), set per-test and restored.
 *   - `db` is a hand-built object exposing the narrow delegates the predicate
 *     reads: orgRespondent.findFirst/findMany, assessmentSubmission.count.
 *
 * Cases (per the implementation prompt):
 *   flag-off → false; qualitative → false; no template access → false;
 *   1 submission → false; 2 scored submissions (incl. via email-union across
 *   two OrgRespondent rows) → true.
 */

import type { ApiActor } from "@/lib/auth/access-control";
import {
  hasComparableLongitudinal,
  type LongitudinalEligibilityDb,
} from "@/lib/assessments/longitudinal-eligibility";

// ── Mock access-control: canAccessTemplate controllable; asAccessDb identity ──
const mockCanAccessTemplate = jest.fn<Promise<boolean>, unknown[]>();

jest.mock("@/lib/assessments/access-control", () => ({
  canAccessTemplate: (...args: unknown[]) => mockCanAccessTemplate(...args),
  asAccessDb: (prisma: unknown) => prisma,
}));

// ─── Fixtures ──────────────────────────────────────────────────────────────

const ORG_ID = "org-1";
const TEMPLATE_ID = "tpl-rock";
const RESP_ID = "resp-1";
const SCORED_ALIAS = "RockHabits"; // reportType: "scored"
const QUALITATIVE_ALIAS = "leadership-vision-alignment"; // qualitative
const EMAIL = "alice@example.com";

interface OrgRespondentRow {
  id: string;
  organizationId: string;
  normalizedEmail: string | null;
  deletedAt: Date | null;
}

function makeActor(overrides: Partial<ApiActor> = {}): ApiActor {
  return {
    userId: "user-1",
    email: "coach@example.com",
    role: "COACH",
    coachId: "coach-1",
    ...overrides,
  };
}

function makeRespondent(
  overrides: Partial<OrgRespondentRow> = {},
): OrgRespondentRow {
  return {
    id: RESP_ID,
    organizationId: ORG_ID,
    normalizedEmail: EMAIL,
    deletedAt: null,
    ...overrides,
  };
}

/**
 * Build a stub DB whose:
 *  - orgRespondent.findFirst returns `entry` (the org-bound entry row).
 *  - orgRespondent.findMany returns `emailRows` (the email-union set).
 *  - assessmentSubmission.count returns `count`.
 * Each delegate records its `where` arg for assertions.
 */
function makeDb(opts: {
  entry: OrgRespondentRow | null;
  emailRows?: OrgRespondentRow[];
  count: number;
}): {
  db: LongitudinalEligibilityDb;
  calls: {
    findFirstWhere: unknown[];
    findManyWhere: unknown[];
    countWhere: unknown[];
  };
} {
  const calls = {
    findFirstWhere: [] as unknown[],
    findManyWhere: [] as unknown[],
    countWhere: [] as unknown[],
  };
  const db: LongitudinalEligibilityDb = {
    orgRespondent: {
      findFirst: async (args) => {
        calls.findFirstWhere.push(args.where);
        return opts.entry;
      },
      findMany: async (args) => {
        calls.findManyWhere.push(args.where);
        return opts.emailRows ?? [];
      },
    },
    assessmentSubmission: {
      count: async (args) => {
        calls.countWhere.push(args.where);
        return opts.count;
      },
    },
  };
  return { db, calls };
}

// ─── Env (flag) management ───────────────────────────────────────────────────

const FLAG_ENV_KEYS = [
  "WAVE_N_RESPONDENT_LONGITUDINAL_ENABLED",
  "WAVE_N_RESPONDENT_LONGITUDINAL_CANARY",
  "WAVE_N_RESPONDENT_LONGITUDINAL_KILL",
];
const savedEnv: Record<string, string | undefined> = {};

beforeEach(() => {
  for (const k of FLAG_ENV_KEYS) {
    savedEnv[k] = process.env[k];
    delete process.env[k];
  }
  mockCanAccessTemplate.mockReset();
  mockCanAccessTemplate.mockResolvedValue(true); // default: access granted
});

afterEach(() => {
  for (const k of FLAG_ENV_KEYS) {
    if (savedEnv[k] === undefined) delete process.env[k];
    else process.env[k] = savedEnv[k];
  }
});

function enableFlag(): void {
  process.env.WAVE_N_RESPONDENT_LONGITUDINAL_ENABLED = "1";
}

const baseArgs = {
  organizationId: ORG_ID,
  respondentId: RESP_ID,
  templateId: TEMPLATE_ID,
  templateAlias: SCORED_ALIAS,
};

// ─── Tests ───────────────────────────────────────────────────────────────────

describe("hasComparableLongitudinal", () => {
  it("flag-off → false (short-circuits before any DB read)", async () => {
    // Flag intentionally NOT enabled (default-OFF in beforeEach).
    const { db, calls } = makeDb({
      entry: makeRespondent(),
      count: 5,
    });

    const result = await hasComparableLongitudinal(db, makeActor(), baseArgs);

    expect(result).toBe(false);
    // No DB read, no template-access check — cheapest gate first.
    expect(calls.findFirstWhere).toHaveLength(0);
    expect(calls.countWhere).toHaveLength(0);
    expect(mockCanAccessTemplate).not.toHaveBeenCalled();
  });

  it("qualitative template → false (scope gate, no DB read)", async () => {
    enableFlag();
    const { db, calls } = makeDb({
      entry: makeRespondent(),
      count: 5,
    });

    const result = await hasComparableLongitudinal(db, makeActor(), {
      ...baseArgs,
      templateAlias: QUALITATIVE_ALIAS,
    });

    expect(result).toBe(false);
    expect(calls.findFirstWhere).toHaveLength(0);
    expect(calls.countWhere).toHaveLength(0);
    expect(mockCanAccessTemplate).not.toHaveBeenCalled();
  });

  it("no template access → false (no DB read)", async () => {
    enableFlag();
    mockCanAccessTemplate.mockResolvedValue(false);
    const { db, calls } = makeDb({
      entry: makeRespondent(),
      count: 5,
    });

    const result = await hasComparableLongitudinal(db, makeActor(), baseArgs);

    expect(result).toBe(false);
    expect(mockCanAccessTemplate).toHaveBeenCalledTimes(1);
    // Template access failed before the respondent bind / count.
    expect(calls.findFirstWhere).toHaveLength(0);
    expect(calls.countWhere).toHaveLength(0);
  });

  it("unknown/cross-org/soft-deleted entry respondent → false", async () => {
    enableFlag();
    const { db, calls } = makeDb({
      entry: null, // org-bound findFirst returns nothing
      count: 5,
    });

    const result = await hasComparableLongitudinal(db, makeActor(), baseArgs);

    expect(result).toBe(false);
    expect(calls.findFirstWhere).toHaveLength(1);
    // The bind is org + live (deletedAt null).
    expect(calls.findFirstWhere[0]).toEqual({
      id: RESP_ID,
      organizationId: ORG_ID,
      deletedAt: null,
    });
    expect(calls.countWhere).toHaveLength(0);
  });

  it("1 scored submission → false (need ≥2 to compare)", async () => {
    enableFlag();
    const { db, calls } = makeDb({
      entry: makeRespondent(),
      emailRows: [makeRespondent()],
      count: 1,
    });

    const result = await hasComparableLongitudinal(db, makeActor(), baseArgs);

    expect(result).toBe(false);
    expect(calls.countWhere).toHaveLength(1);
    // Count is scoped to the template + submitted + live campaign.
    expect(calls.countWhere[0]).toMatchObject({
      submittedAt: { not: null },
      campaign: { templateId: TEMPLATE_ID, deletedAt: null },
    });
  });

  it("2 scored submissions → true", async () => {
    enableFlag();
    const { db } = makeDb({
      entry: makeRespondent(),
      emailRows: [makeRespondent()],
      count: 2,
    });

    const result = await hasComparableLongitudinal(db, makeActor(), baseArgs);

    expect(result).toBe(true);
  });

  it("2 scored submissions via email-union across TWO OrgRespondent rows → true", async () => {
    enableFlag();
    // The same human is two OrgRespondent rows sharing normalizedEmail (an
    // Esperto import row + a fresh email invite). The union must count BOTH
    // ids' submissions — one submission each → 2 total → eligible.
    const entry = makeRespondent({ id: "resp-import", normalizedEmail: EMAIL });
    const sibling = makeRespondent({ id: "resp-email", normalizedEmail: EMAIL });
    const { db, calls } = makeDb({
      entry,
      emailRows: [entry, sibling],
      count: 2, // count over { in: [resp-email, resp-import] }
    });

    const result = await hasComparableLongitudinal(db, makeActor(), {
      ...baseArgs,
      respondentId: "resp-import",
    });

    expect(result).toBe(true);
    // The union findMany was issued (email present) and the count's id set
    // includes BOTH rows.
    expect(calls.findManyWhere).toHaveLength(1);
    expect(calls.findManyWhere[0]).toEqual({
      organizationId: ORG_ID,
      normalizedEmail: EMAIL,
      deletedAt: null,
    });
    const countWhere = calls.countWhere[0] as {
      respondentId: { in: string[] };
    };
    expect(new Set(countWhere.respondentId.in)).toEqual(
      new Set(["resp-import", "resp-email"]),
    );
  });

  it("no email on the entry respondent → falls back to the single id (no union findMany)", async () => {
    enableFlag();
    const { db, calls } = makeDb({
      entry: makeRespondent({ normalizedEmail: null }),
      count: 2,
    });

    const result = await hasComparableLongitudinal(db, makeActor(), baseArgs);

    expect(result).toBe(true);
    // No email ⇒ no union query; count over just the entry id.
    expect(calls.findManyWhere).toHaveLength(0);
    const countWhere = calls.countWhere[0] as {
      respondentId: { in: string[] };
    };
    expect(countWhere.respondentId.in).toEqual([RESP_ID]);
  });

  it("admin (privileged) with flag on + scored + ≥2 → true", async () => {
    enableFlag();
    // canAccessTemplate is mocked; admin bypass lives inside it, so the mock
    // returning true models the privileged path.
    mockCanAccessTemplate.mockResolvedValue(true);
    const { db } = makeDb({
      entry: makeRespondent(),
      emailRows: [makeRespondent()],
      count: 3,
    });

    const result = await hasComparableLongitudinal(
      db,
      makeActor({ role: "ADMIN", coachId: null }),
      baseArgs,
    );

    expect(result).toBe(true);
  });

  it("canary flag (org-scoped) enables eligibility for the matching org", async () => {
    process.env.WAVE_N_RESPONDENT_LONGITUDINAL_CANARY = ORG_ID;
    const { db } = makeDb({
      entry: makeRespondent(),
      emailRows: [makeRespondent()],
      count: 2,
    });

    const result = await hasComparableLongitudinal(db, makeActor(), baseArgs);

    expect(result).toBe(true);
  });

  it("kill switch overrides an enabled flag → false", async () => {
    enableFlag();
    process.env.WAVE_N_RESPONDENT_LONGITUDINAL_KILL = "1";
    const { db, calls } = makeDb({
      entry: makeRespondent(),
      count: 9,
    });

    const result = await hasComparableLongitudinal(db, makeActor(), baseArgs);

    expect(result).toBe(false);
    expect(calls.countWhere).toHaveLength(0);
  });
});
