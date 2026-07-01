/**
 * Esperto historical import — Wave O RESTRICTED (SU-Full) route-helper unit
 * tests.
 *
 * Spec ref: docs/specs/v7.6/12-esperto-historical-import.md §4 (restricted
 * shape), §6.2 (published-version preflight), §7 (crosswalk lock gate);
 * Wave O — per-round SU-Full historical import.
 *
 * `resolveRestrictedImportContext` is the ONE place both import routes
 * resolve crosswalk → template → published version → compat check →
 * scorableStableKeys. These tests cover every discriminated error branch +
 * the happy path + the `isRequired`-derived scorableStableKeys contract.
 *
 * `buildRealRestrictedCommitDb` is covered separately: the acquireRoundLock
 * raw-SQL shape, and — the correctness amendment — that a soft-deleted
 * (quarantined) campaign sharing the incoming batch's externalId is invisible
 * to `assessmentCampaign.findUnique`, so a fresh import takes the CREATE path
 * rather than resurrecting condemned data via REUSE.
 *
 * NOTE: at the time these tests were written, the crosswalk registry
 * (`crosswalks/index.ts`) has NOT yet registered a "scaling-up-full" stub
 * (only qsp-v2 / RockHabits / leadership-vision-alignment exist) — this is a
 * pre-existing gap, not introduced here. The CROSSWALK_NOT_FOUND branch below
 * locks in TODAY's real (accidental) behavior; once a real stub is added to
 * the registry, that specific test will need updating to mock/override the
 * registry instead of relying on the gap, but every other branch is exercised
 * with a MOCKED crosswalk lookup so this suite does not otherwise depend on
 * the registry's current contents.
 */

jest.mock("../../../../lib/assessments/esperto-import/crosswalks", () => {
  const actual = jest.requireActual(
    "../../../../lib/assessments/esperto-import/crosswalks",
  );
  return {
    ...actual,
    getCrosswalkByTemplateAlias: jest.fn(actual.getCrosswalkByTemplateAlias),
    validateCrosswalkAgainstVersion: jest.fn(actual.validateCrosswalkAgainstVersion),
  };
});

import {
  resolveRestrictedImportContext,
  buildRealRestrictedCommitDb,
  resolveEspertoImportHashSalt,
  emitEspertoImportMetric,
  SU_FULL_TEMPLATE_ALIAS,
  type RestrictedContextDb,
  type RestrictedCommitPrismaLike,
} from "../../../../lib/assessments/esperto-import/restricted-route-helpers";
import {
  getCrosswalkByTemplateAlias,
  validateCrosswalkAgainstVersion,
} from "../../../../lib/assessments/esperto-import/crosswalks";
import type { Crosswalk } from "../../../../lib/assessments/esperto-import/crosswalks";

const lockedCrosswalk: Crosswalk = {
  templateAlias: SU_FULL_TEMPLATE_ALIAS,
  espertoVariant: "ScalingUpAssessment",
  locked: true,
  map: [
    { espertoKey: "Q1_1", stableKey: "SUF_rate_a", ourType: "SLIDER_LIKERT" },
    { espertoKey: "Q2", stableKey: "SUF_headcount", ourType: "NUMBER" },
  ],
  droppedKeys: [{ key: "demo_role", reason: "demographic — not scored" }],
};

function makeDb(
  overrides: Partial<RestrictedContextDb> = {},
): RestrictedContextDb {
  return {
    assessmentTemplate: {
      findFirst: jest.fn().mockResolvedValue({ id: "tmpl-sufull" }),
    },
    assessmentTemplateVersion: {
      findFirst: jest.fn().mockResolvedValue({
        id: "ver-1",
        language: "enUS",
        questions: [
          { stableKey: "SUF_rate_a", type: "SLIDER_LIKERT", isRequired: true, scale: { min: 0, max: 10 } },
          { stableKey: "SUF_headcount", type: "NUMBER", isRequired: true },
          { stableKey: "SUF_optional_note", type: "TEXT", isRequired: false },
        ],
        sections: [],
        scoringConfig: {},
      }),
    },
    ...overrides,
  } as RestrictedContextDb;
}

beforeEach(() => {
  jest.clearAllMocks();
  (getCrosswalkByTemplateAlias as jest.Mock).mockReturnValue(lockedCrosswalk);
  (validateCrosswalkAgainstVersion as jest.Mock).mockReturnValue({
    ok: true,
    problems: [],
  });
});

describe("resolveRestrictedImportContext — error branches", () => {
  it("CROSSWALK_NOT_FOUND (500) when the registry has no SU-Full stub", async () => {
    (getCrosswalkByTemplateAlias as jest.Mock).mockReturnValue(null);
    const result = await resolveRestrictedImportContext(makeDb());
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe("CROSSWALK_NOT_FOUND");
      expect(result.status).toBe(500);
    }
  });

  it("TEMPLATE_NOT_FOUND (400) when no AssessmentTemplate matches the crosswalk alias", async () => {
    const db = makeDb({
      assessmentTemplate: { findFirst: jest.fn().mockResolvedValue(null) },
    });
    const result = await resolveRestrictedImportContext(db);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe("TEMPLATE_NOT_FOUND");
      expect(result.status).toBe(400);
    }
  });

  it("TEMPLATE_VERSION_NOT_PUBLISHED (422) when no published version exists", async () => {
    const db = makeDb({
      assessmentTemplateVersion: { findFirst: jest.fn().mockResolvedValue(null) },
    });
    const result = await resolveRestrictedImportContext(db);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe("TEMPLATE_VERSION_NOT_PUBLISHED");
      expect(result.status).toBe(422);
      if (result.code === "TEMPLATE_VERSION_NOT_PUBLISHED") {
        expect(result.details.templateId).toBe("tmpl-sufull");
      }
    }
  });

  it("CROSSWALK_INCOMPATIBLE_WITH_VERSION (422) when the compat check fails", async () => {
    (validateCrosswalkAgainstVersion as jest.Mock).mockReturnValue({
      ok: false,
      problems: ["stableKey SUF_rate_a expects SLIDER_LIKERT but version has TEXT"],
    });
    const result = await resolveRestrictedImportContext(makeDb());
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe("CROSSWALK_INCOMPATIBLE_WITH_VERSION");
      expect(result.status).toBe(422);
      if (result.code === "CROSSWALK_INCOMPATIBLE_WITH_VERSION") {
        expect(result.problems).toHaveLength(1);
      }
    }
  });
});

describe("resolveRestrictedImportContext — happy path", () => {
  it("resolves template/version/crosswalk and derives scorableStableKeys from isRequired (not hardcoded to SLIDER_LIKERT)", async () => {
    const result = await resolveRestrictedImportContext(makeDb());
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.template.id).toBe("tmpl-sufull");
      expect(result.publishedVersion.id).toBe("ver-1");
      expect(result.crosswalk).toBe(lockedCrosswalk);
      // Both required questions (one SLIDER_LIKERT, one NUMBER) are scorable;
      // the non-required TEXT question is excluded.
      expect(result.scorableStableKeys.sort()).toEqual(
        ["SUF_headcount", "SUF_rate_a"].sort(),
      );
    }
  });

  it("excludes a required-but-not-mapped stableKey only if isRequired is false; includes every isRequired:true key regardless of type", async () => {
    const db = makeDb({
      assessmentTemplateVersion: {
        findFirst: jest.fn().mockResolvedValue({
          id: "ver-2",
          language: "enUS",
          questions: [
            { stableKey: "SUF_rate_a", type: "SLIDER_LIKERT", isRequired: true, scale: { min: 0, max: 10 } },
            { stableKey: "SUF_headcount", type: "NUMBER", isRequired: false },
            { stableKey: "SUF_multi", type: "MULTI_CHOICE", isRequired: true },
          ],
          sections: [],
          scoringConfig: {},
        }),
      },
    });
    const result = await resolveRestrictedImportContext(db);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.scorableStableKeys.sort()).toEqual(
        ["SUF_multi", "SUF_rate_a"].sort(),
      );
    }
  });
});

// ────────────────────────────────────────────────────────────────────────
// buildRealRestrictedCommitDb
// ────────────────────────────────────────────────────────────────────────

function makePrismaLike(
  overrides: Partial<RestrictedCommitPrismaLike> = {},
): RestrictedCommitPrismaLike & {
  __campaignFindFirstCalls: Array<{ where: unknown; select?: unknown }>;
} {
  const campaignFindFirstCalls: Array<{ where: unknown; select?: unknown }> = [];
  const base: RestrictedCommitPrismaLike = {
    $executeRaw: jest.fn().mockResolvedValue(1) as unknown as RestrictedCommitPrismaLike["$executeRaw"],
    organization: {
      findUnique: jest.fn().mockResolvedValue({ id: "org-1", espertoSuFullCid: null }),
      update: jest.fn().mockResolvedValue({}),
    },
    assessmentCampaign: {
      findFirst: jest.fn(async (args: { where: unknown; select?: unknown }) => {
        campaignFindFirstCalls.push(args);
        return null;
      }),
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
    auditLog: {
      create: jest.fn().mockResolvedValue({ id: "audit-1" }),
    },
    $transaction: jest.fn(async (fn) => fn(base)),
    ...overrides,
  };
  return Object.assign(base, { __campaignFindFirstCalls: campaignFindFirstCalls });
}

describe("buildRealRestrictedCommitDb — acquireRoundLock", () => {
  it("runs a tagged-template pg_advisory_xact_lock(hashtext(...)) via $executeRaw (never $executeRawUnsafe)", async () => {
    const prisma = makePrismaLike();
    const commitDb = buildRealRestrictedCommitDb(prisma);
    await commitDb.acquireRoundLock("esperto:sufull:cid1:round-1");
    expect(prisma.$executeRaw).toHaveBeenCalledTimes(1);
    const call = (prisma.$executeRaw as jest.Mock).mock.calls[0];
    // Tagged-template call: first arg is a TemplateStringsArray whose joined
    // text contains the advisory-lock SQL; second arg is the interpolated key.
    const templateStrings = call[0] as unknown as string[];
    expect(templateStrings.join("?")).toContain("pg_advisory_xact_lock(hashtext(");
    expect(call[1]).toBe("esperto:sufull:cid1:round-1");
  });
});

describe("buildRealRestrictedCommitDb — assessmentCampaign.findUnique soft-delete safety", () => {
  it("queries via findFirst with deletedAt:null pinned (liveCampaignWhere), never a bare findUnique", async () => {
    const prisma = makePrismaLike();
    const commitDb = buildRealRestrictedCommitDb(prisma);
    await commitDb.assessmentCampaign.findUnique({
      where: { externalId: "esperto:sufull:cid1:round-1" },
      select: { id: true },
    });
    expect(prisma.assessmentCampaign.findFirst).toHaveBeenCalledTimes(1);
    const args = (prisma.assessmentCampaign.findFirst as jest.Mock).mock.calls[0][0];
    expect(args.where).toEqual({
      externalId: "esperto:sufull:cid1:round-1",
      deletedAt: null,
    });
  });

  it("a soft-deleted campaign sharing the batch's externalId is INVISIBLE — findUnique resolves null (CREATE path, not REUSE)", async () => {
    // Simulate the real DB: a row exists with this externalId but deletedAt is set
    // (quarantined). The underlying findFirst call in a real Prisma client would
    // filter it out via `deletedAt: null` — here we assert the ADAPTER passes
    // that filter through by simulating what Prisma itself would return: our
    // fake findFirst inspects the where clause and only "returns" the row when
    // the where clause does NOT exclude soft-deleted rows, proving the adapter's
    // filter is what keeps it hidden.
    const quarantined = {
      id: "camp-quarantined",
      organizationId: "org-1",
      templateId: "tmpl-sufull",
      versionId: "ver-1",
      importManifest: null,
      deletedAt: new Date("2026-01-01T00:00:00Z"),
    };
    const prisma = makePrismaLike({
      assessmentCampaign: {
        findFirst: jest.fn(async (args: { where: { deletedAt?: unknown; externalId?: string } }) => {
          // Faithful fake of a real Postgres WHERE: only match when the filter
          // does not exclude this soft-deleted row.
          if (
            args.where.externalId === quarantined.id ||
            (args.where as { externalId?: string }).externalId ===
              "esperto:sufull:cid1:round-1"
          ) {
            if (args.where.deletedAt === null) return null; // excluded — soft-deleted
            return quarantined;
          }
          return null;
        }),
        create: jest.fn().mockResolvedValue({ id: "camp-new" }),
        update: jest.fn().mockResolvedValue({}),
      },
    });
    const commitDb = buildRealRestrictedCommitDb(prisma);
    const result = await commitDb.assessmentCampaign.findUnique({
      where: { externalId: "esperto:sufull:cid1:round-1" },
      select: { id: true },
    });
    expect(result).toBeNull();
  });
});

describe("buildRealRestrictedCommitDb — $transaction re-wraps the tx client", () => {
  it("passes a RestrictedCommitDb-shaped tx (with acquireRoundLock) into the callback", async () => {
    const prisma = makePrismaLike();
    const commitDb = buildRealRestrictedCommitDb(prisma);
    let sawAcquireRoundLock = false;
    await commitDb.$transaction(async (tx) => {
      sawAcquireRoundLock = typeof tx.acquireRoundLock === "function";
      return null;
    });
    expect(sawAcquireRoundLock).toBe(true);
  });
});

// ────────────────────────────────────────────────────────────────────────
// resolveEspertoImportHashSalt
// ────────────────────────────────────────────────────────────────────────

describe("resolveEspertoImportHashSalt", () => {
  const ORIGINAL_ENV = { ...process.env };

  afterEach(() => {
    process.env = { ...ORIGINAL_ENV };
  });

  it("returns the env var when set", () => {
    process.env.WAVE_O_ESPERTO_IMPORT_HASH_SALT = "real-salt-value";
    expect(resolveEspertoImportHashSalt()).toBe("real-salt-value");
  });

  /** A copy of process.env with WAVE_O_ESPERTO_IMPORT_HASH_SALT and VERCEL_ENV removed. */
  function envWithoutSaltAndVercel(): NodeJS.ProcessEnv {
    const copy = { ...process.env };
    delete copy.WAVE_O_ESPERTO_IMPORT_HASH_SALT;
    delete copy.VERCEL_ENV;
    return copy;
  }

  it("falls back to a fixed dev-only constant when unset outside production/Vercel", () => {
    process.env = { ...envWithoutSaltAndVercel(), NODE_ENV: "test" };
    const salt = resolveEspertoImportHashSalt();
    expect(salt).toMatch(/dev/i);
    // Deterministic across calls (never crypto.randomBytes).
    expect(resolveEspertoImportHashSalt()).toBe(salt);
  });

  it("throws when unset AND NODE_ENV=production", () => {
    process.env = { ...envWithoutSaltAndVercel(), NODE_ENV: "production" };
    expect(() => resolveEspertoImportHashSalt()).toThrow(
      /WAVE_O_ESPERTO_IMPORT_HASH_SALT must be set in production/,
    );
  });

  it("throws when unset AND VERCEL_ENV is set (even if NODE_ENV isn't 'production')", () => {
    process.env = { ...envWithoutSaltAndVercel(), VERCEL_ENV: "preview", NODE_ENV: "test" };
    expect(() => resolveEspertoImportHashSalt()).toThrow(
      /WAVE_O_ESPERTO_IMPORT_HASH_SALT must be set in production/,
    );
  });
});

// ────────────────────────────────────────────────────────────────────────
// emitEspertoImportMetric
// ────────────────────────────────────────────────────────────────────────

describe("emitEspertoImportMetric", () => {
  it("logs a JSON marker via console.info with the assessment.esperto_import.<event> namespace", () => {
    const spy = jest.spyOn(console, "info").mockImplementation(() => {});
    emitEspertoImportMetric("preview", { organizationId: "org-1", fileCount: 3 });
    expect(spy).toHaveBeenCalledTimes(1);
    const logged = JSON.parse(spy.mock.calls[0][0] as string);
    expect(logged.marker).toBe("assessment.esperto_import.preview");
    expect(logged.surface).toBe("esperto_import");
    expect(logged.organizationId).toBe("org-1");
    expect(logged.fileCount).toBe(3);
    spy.mockRestore();
  });

  it("never throws even if console.info itself throws", () => {
    const spy = jest.spyOn(console, "info").mockImplementation(() => {
      throw new Error("logging backend down");
    });
    expect(() => emitEspertoImportMetric("commit_result", {})).not.toThrow();
    spy.mockRestore();
  });

  it("drops undefined fields before serializing", () => {
    const spy = jest.spyOn(console, "info").mockImplementation(() => {});
    emitEspertoImportMetric("commit_conflict", { errorCode: "cid-mismatch", extra: undefined });
    const logged = JSON.parse(spy.mock.calls[0][0] as string);
    expect("extra" in logged).toBe(false);
    expect(logged.errorCode).toBe("cid-mismatch");
    spy.mockRestore();
  });
});
