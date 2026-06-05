/**
 * Esperto historical import — S1 RESTRICTED-CLIENT data-loss capstone (12a S1 / R3).
 *
 * Spec ref: docs/specs/v7.6/12-esperto-historical-import.md §5–§6, §19 (one
 * all-or-nothing tx), §17 (advisory lock allowlist); plan 12a S1, step 10.
 *
 * This is the cross-cutting GUARD test. The two commit writers
 * (commitRosterImport / commitResultsImport) claim — in their module headers and
 * narrow tx interfaces — that they NEVER call delete / deleteMany / updateMany on
 * ANY delegate, and that the ONLY raw SQL they ever issue is the roster commit's
 * `pg_advisory_xact_lock` statement. Those claims are enforced at compile time by
 * the narrow `RosterCommitTx` / `ResultsCommitTx` interfaces, but a `db as never`
 * cast (used everywhere these are wired to Prisma) erases that protection. THIS
 * test re-establishes it at RUNTIME by handing the writers a transaction client
 * whose destructive ops + non-allowlisted raw SQL THROW.
 *
 * Strategy:
 *   - A restricted tx exposes every delegate the writers touch. Its
 *     delete / deleteMany / updateMany (on every delegate) THROW a FORBIDDEN
 *     error. Its $executeRaw THROWS unless the SQL is the allowlisted advisory
 *     lock. The read/insert/backfill ops (findFirst/findMany/findUnique/create/
 *     upsert/update) are plausible-shape jest.fns.
 *   - Driving BOTH writers through it must RESOLVE (no FORBIDDEN throw) — proving
 *     they used only allowed ops + the one allowlisted raw statement.
 *   - A belt-and-suspenders assertion confirms delete/deleteMany/updateMany were
 *     never even called.
 *   - A NON-VACUOUS sanity test points the SAME restricted tx at a destructive
 *     call and asserts it throws — proving the guard is real, not a no-op.
 */

import members from "./fixtures/members.json";
import reportQspV2 from "./fixtures/report-qsp-v2.json";

import { parseEspertoExport } from "../../../../lib/assessments/esperto-import/parse";
import { buildRosterImportPlan } from "../../../../lib/assessments/esperto-import/roster-plan";
import { commitRosterImport } from "../../../../lib/assessments/esperto-import/commit";
import { buildResultsImportPlan } from "../../../../lib/assessments/esperto-import/results-plan";
import { commitResultsImport } from "../../../../lib/assessments/esperto-import/results-commit";
import { qspV2Crosswalk } from "../../../../lib/assessments/esperto-import/crosswalks/qsp-v2";
import type { EspertoMembers, EspertoReport } from "../../../../lib/assessments/esperto-import/types";
import { buildQspV2Content } from "../../../../../prisma/seed-qsp-v2-assessment";

const actor = { userId: "admin-1", email: "admin@example.com" };

// ────────────────────────────────────────────────────────────────────────
// Restricted transaction client
// ────────────────────────────────────────────────────────────────────────

const FORBIDDEN = (delegate: string, method: string) => () => {
  throw new Error(`FORBIDDEN destructive op: ${delegate}.${method}`);
};

/**
 * Spy handles so a test can assert the destructive ops were never CALLED (not
 * just that they would throw). Each is a jest.fn that throws when invoked.
 */
interface RestrictedSpies {
  delete: jest.Mock[];
  deleteMany: jest.Mock[];
  updateMany: jest.Mock[];
}

/**
 * Build a restricted tx whose destructive ops throw FORBIDDEN and whose
 * $executeRaw throws unless the SQL is the allowlisted advisory lock. Read /
 * insert / backfill ops return plausible shapes. Returns { tx, spies } so the
 * caller can assert non-invocation.
 */
function makeRestrictedTx(): {
  tx: Record<string, unknown>;
  spies: RestrictedSpies;
} {
  const spies: RestrictedSpies = { delete: [], deleteMany: [], updateMany: [] };

  /** Attach throwing destructive ops to a delegate, tracking them in `spies`. */
  function withDestructiveGuards(
    delegate: string,
    base: Record<string, unknown>,
  ): Record<string, unknown> {
    const del = jest.fn(FORBIDDEN(delegate, "delete"));
    const delMany = jest.fn(FORBIDDEN(delegate, "deleteMany"));
    const updMany = jest.fn(FORBIDDEN(delegate, "updateMany"));
    spies.delete.push(del);
    spies.deleteMany.push(delMany);
    spies.updateMany.push(updMany);
    return { ...base, delete: del, deleteMany: delMany, updateMany: updMany };
  }

  // Stateless counters so each create() returns a distinct id.
  let respCount = 0;
  let campCount = 0;
  let partCount = 0;
  let invCount = 0;
  let subCount = 0;

  const tx: Record<string, unknown> = {
    // The ONLY allowlisted raw SQL is the advisory lock. Anything else is
    // rejected. (async so it behaves like Prisma's $executeRaw — production code
    // `await`s it, which surfaces both a sync throw and a rejected promise
    // identically; we reject so `.rejects` matchers can observe it.)
    $executeRaw: jest.fn(
      async (template: TemplateStringsArray | string, ...values: unknown[]) => {
        const sql = Array.isArray(template)
          ? (template as TemplateStringsArray).join(" ")
          : String(template);
        if (!sql.includes("pg_advisory_xact_lock")) {
          throw new Error(`FORBIDDEN raw SQL (not allowlisted): ${sql}`);
        }
        void values;
        return 1;
      },
    ),

    organization: withDestructiveGuards("organization", {
      findFirst: jest.fn().mockResolvedValue(null),
      findMany: jest.fn().mockResolvedValue([]),
      findUnique: jest.fn().mockResolvedValue(null),
      create: jest.fn(({ data }: { data: Record<string, unknown> }) =>
        Promise.resolve({ id: "org-restricted", ...data }),
      ),
      upsert: jest.fn(() => Promise.resolve({ id: "org-restricted" })),
      update: jest.fn(({ where }: { where: { id: string } }) =>
        Promise.resolve({ id: where.id }),
      ),
    }),

    orgRespondent: withDestructiveGuards("orgRespondent", {
      // No existing rows → roster commit takes the create branch for all 3.
      findFirst: jest.fn().mockResolvedValue(null),
      findMany: jest.fn().mockResolvedValue([]),
      findUnique: jest.fn().mockResolvedValue(null),
      create: jest.fn(({ data }: { data: Record<string, unknown> }) =>
        Promise.resolve({ id: `resp-${respCount++}`, ...data }),
      ),
      upsert: jest.fn(() => Promise.resolve({ id: `resp-${respCount++}` })),
      // `update` is allowed (used ONLY for the null→value externalId backfill).
      update: jest.fn(({ where }: { where: { id: string } }) =>
        Promise.resolve({ id: where.id }),
      ),
    }),

    assessmentCampaign: withDestructiveGuards("assessmentCampaign", {
      // No existing campaign → results commit takes the create branch.
      findUnique: jest.fn().mockResolvedValue(null),
      findFirst: jest.fn().mockResolvedValue(null),
      findMany: jest.fn().mockResolvedValue([]),
      create: jest.fn(({ data }: { data: Record<string, unknown> }) =>
        Promise.resolve({ id: `camp-${campCount++}`, ...data }),
      ),
      upsert: jest.fn(() => Promise.resolve({ id: `camp-${campCount++}` })),
      update: jest.fn(({ where }: { where: { id: string } }) =>
        Promise.resolve({ id: where.id }),
      ),
    }),

    assessmentCampaignParticipant: withDestructiveGuards(
      "assessmentCampaignParticipant",
      {
        findFirst: jest.fn().mockResolvedValue(null),
        findMany: jest.fn().mockResolvedValue([]),
        findUnique: jest.fn().mockResolvedValue(null),
        create: jest.fn(() => Promise.resolve({ id: `part-${partCount++}` })),
        upsert: jest.fn(() => Promise.resolve({ id: `part-${partCount++}` })),
        update: jest.fn(({ where }: { where: { id: string } }) =>
          Promise.resolve({ id: where.id }),
        ),
      },
    ),

    assessmentInvitation: withDestructiveGuards("assessmentInvitation", {
      findFirst: jest.fn().mockResolvedValue(null),
      findMany: jest.fn().mockResolvedValue([]),
      findUnique: jest.fn().mockResolvedValue(null),
      create: jest.fn(() => Promise.resolve({ id: `inv-${invCount++}` })),
      upsert: jest.fn(() => Promise.resolve({ id: `inv-${invCount++}` })),
      update: jest.fn(({ where }: { where: { id: string } }) =>
        Promise.resolve({ id: where.id }),
      ),
    }),

    assessmentSubmission: withDestructiveGuards("assessmentSubmission", {
      // No existing submission → create branch.
      findFirst: jest.fn().mockResolvedValue(null),
      findMany: jest.fn().mockResolvedValue([]),
      findUnique: jest.fn().mockResolvedValue(null),
      create: jest.fn(() => Promise.resolve({ id: `sub-${subCount++}` })),
      upsert: jest.fn(() => Promise.resolve({ id: `sub-${subCount++}` })),
      update: jest.fn(({ where }: { where: { id: string } }) =>
        Promise.resolve({ id: where.id }),
      ),
    }),

    auditLog: withDestructiveGuards("auditLog", {
      findFirst: jest.fn().mockResolvedValue(null),
      findMany: jest.fn().mockResolvedValue([]),
      findUnique: jest.fn().mockResolvedValue(null),
      create: jest.fn(() => Promise.resolve({ id: "audit-1" })),
      upsert: jest.fn(() => Promise.resolve({ id: "audit-1" })),
      update: jest.fn(({ where }: { where: { id: string } }) =>
        Promise.resolve({ id: where.id }),
      ),
    }),
  };

  return { tx, spies };
}

/** A db whose $transaction invokes the callback with the restricted tx. */
function makeDb(tx: Record<string, unknown>) {
  return {
    $transaction: jest.fn(
      async (cb: (t: Record<string, unknown>) => Promise<unknown>) => cb(tx),
    ),
  };
}

// ────────────────────────────────────────────────────────────────────────
// Plan builders (valid plans built from the sanitized fixtures)
// ────────────────────────────────────────────────────────────────────────

function rosterPlanFromFixture() {
  const parsed = parseEspertoExport(members as unknown as EspertoMembers);
  if (parsed.kind !== "members") throw new Error("fixture is not a members export");
  return buildRosterImportPlan({
    parsedMembers: parsed.data,
    ownerCoachId: "coach-1",
    companyName: "Acme Corp",
    existing: { orgId: null, respondents: [] },
  });
}

/** The 3 fixture memberids, mapped to roster respondent ids (externalId === memberid). */
const FIXTURE_MEMBER_IDS = ["mWSw2H9f6E", "CVMmsiWPTP", "MxRWB1GIwu"];

function resultsPlanFromFixture() {
  const parsed = parseEspertoExport(reportQspV2 as unknown as EspertoReport);
  if (parsed.kind !== "report") throw new Error("fixture is not a report export");
  const respondents = FIXTURE_MEMBER_IDS.map((memberid, i) => ({
    id: `resp-${i}`,
    externalId: memberid,
  }));
  // A LOCKED copy of the real crosswalk (results import is refused unless locked).
  const lockedCrosswalk = { ...qspV2Crosswalk, locked: true };
  return buildResultsImportPlan({
    parsedReport: parsed.data,
    crosswalk: lockedCrosswalk,
    targetOrgId: "org-1",
    respondents,
  });
}

/** ctx for the results commit — uses the REAL QSP v2 version for scoring. */
const resultsCtx = {
  templateId: "tmpl-1",
  versionId: "ver-1",
  // buildQspV2Content() returns { questions, sections, scoringConfig } — exactly
  // a valid TemplateVersionForScoring covering every QSP stableKey the fixture
  // answers map to, so scoreSubmission succeeds for real.
  versionForScoring: (() => {
    const c = buildQspV2Content();
    return {
      questions: c.questions,
      sections: c.sections,
      scoringConfig: c.scoringConfig,
    };
  })() as never,
  organizationId: "org-1",
  ownerCoachId: "coach-1",
  language: "enUS",
  createdByUserId: "admin-1",
};

// ────────────────────────────────────────────────────────────────────────
// Tests
// ────────────────────────────────────────────────────────────────────────

describe("S1 restricted-client guard — the guard is REAL (non-vacuous)", () => {
  it("a destructive call on the restricted tx THROWS FORBIDDEN (proves the guard is not a no-op)", () => {
    const { tx } = makeRestrictedTx();
    const orgRespondent = tx.orgRespondent as { deleteMany: () => unknown };
    expect(() => orgRespondent.deleteMany()).toThrow(/FORBIDDEN destructive op/);

    const campaign = tx.assessmentCampaign as { delete: () => unknown };
    expect(() => campaign.delete()).toThrow(/FORBIDDEN destructive op/);

    const submission = tx.assessmentSubmission as { updateMany: () => unknown };
    expect(() => submission.updateMany()).toThrow(/FORBIDDEN destructive op/);
  });

  it("a non-allowlisted raw SQL on the restricted tx THROWS", async () => {
    const { tx } = makeRestrictedTx();
    const runRaw = tx.$executeRaw as (s: string) => Promise<number>;
    await expect(runRaw("DELETE FROM org_respondent")).rejects.toThrow(
      /FORBIDDEN raw SQL/,
    );
  });

  it("the allowlisted advisory-lock raw SQL on the restricted tx RESOLVES", async () => {
    const { tx } = makeRestrictedTx();
    const runRaw = tx.$executeRaw as (s: string) => Promise<number>;
    await expect(
      runRaw("SELECT pg_advisory_xact_lock(hashtext($1), hashtext($2))"),
    ).resolves.toBe(1);
  });
});

describe("S1 restricted-client guard — commitRosterImport uses ONLY allowed ops", () => {
  it("RESOLVES against the restricted tx (no FORBIDDEN throw) for a valid roster plan", async () => {
    const { tx, spies } = makeRestrictedTx();
    const db = makeDb(tx);
    const plan = rosterPlanFromFixture();

    // Sanity-check the plan is non-trivial (3 real creates, no blocks).
    expect(plan.blocks).toHaveLength(0);
    expect(plan.creates).toHaveLength(3);

    await expect(
      commitRosterImport(db as never, plan, actor),
    ).resolves.toMatchObject({ orgAction: "create", created: 3 });

    // Belt-and-suspenders: no destructive op was even CALLED.
    for (const spy of [...spies.delete, ...spies.deleteMany, ...spies.updateMany]) {
      expect(spy).not.toHaveBeenCalled();
    }
  });

  it("issues the advisory lock as the ONLY raw SQL", async () => {
    const { tx } = makeRestrictedTx();
    const db = makeDb(tx);
    await commitRosterImport(db as never, rosterPlanFromFixture(), actor);

    const runRaw = tx.$executeRaw as jest.Mock;
    expect(runRaw).toHaveBeenCalledTimes(1);
    const template = runRaw.mock.calls[0][0] as TemplateStringsArray;
    expect(template.join(" ")).toContain("pg_advisory_xact_lock");
  });
});

describe("S1 restricted-client guard — commitResultsImport uses ONLY allowed ops", () => {
  it("RESOLVES against the restricted tx (no FORBIDDEN throw) for a valid results plan", async () => {
    const { tx, spies } = makeRestrictedTx();
    const db = makeDb(tx);
    const plan = resultsPlanFromFixture();

    // Sanity-check the plan is non-trivial (1 campaign, 3 scorable rows, no blocks).
    expect(plan.blocks).toHaveLength(0);
    expect(plan.campaigns).toHaveLength(1);
    expect(plan.campaigns[0].rows).toHaveLength(3);

    await expect(
      commitResultsImport(db as never, plan, resultsCtx, actor),
    ).resolves.toMatchObject({
      campaigns: [
        expect.objectContaining({
          campaignAction: "create",
          submissionsCreated: 3,
        }),
      ],
    });

    // Belt-and-suspenders: no destructive op was even CALLED.
    for (const spy of [...spies.delete, ...spies.deleteMany, ...spies.updateMany]) {
      expect(spy).not.toHaveBeenCalled();
    }
  });

  it("issues NO raw SQL at all (the campaign is keyed by its unique externalId)", async () => {
    const { tx } = makeRestrictedTx();
    const db = makeDb(tx);
    await commitResultsImport(db as never, resultsPlanFromFixture(), resultsCtx, actor);

    const runRaw = tx.$executeRaw as jest.Mock;
    expect(runRaw).not.toHaveBeenCalled();
  });
});
