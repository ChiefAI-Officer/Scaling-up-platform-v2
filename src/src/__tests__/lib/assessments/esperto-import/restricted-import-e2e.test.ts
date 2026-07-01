/**
 * Wave O — historical SU-Full import END-TO-END integration test.
 *
 * Spec ref: PLAN.md (Historical Esperto Import -- SU-Full first) item 6;
 * mirrors import-e2e.test.ts's stateful-store pattern for the QSP path, but
 * drives the RESTRICTED (SU-Full) pipeline: parse -> buildRestrictedImportPlan
 * -> commitRestrictedImport, scored by the REAL SU-Full scoring engine.
 *
 * Fixtures (SANITIZED -- see fixtures/*.json): two restricted-individual files,
 * same cid (one company, one round), different mid/reportid/date. Structure is
 * faithful to the real Esperto SU-Full export (61 rating items across the
 * Q3..Q12 blocks + financial/firmographic/demographic keys); identity fields
 * are synthetic tokens and `name` is blank. Per D12, the REAL exports under
 * `From Jeff/Exports/` are gitignored and are NEVER used as fixtures.
 *
 * TEST-ONLY crosswalk: `buildTestCrosswalk()` below mechanically zips the 61
 * raw slider keys (in their known block order, Q3_1..Q12_10) against the REAL
 * SU-Full template's real stableKeys (Q01..Q61, from
 * prisma/seed-scaling-up-full-assessment.ts). This is NOT the Phase-2
 * lock-checklist-verified positional mapping (that is a separate, gated,
 * PR-reviewed piece of work) -- it exists solely to prove the PIPELINE
 * integrates end-to-end against genuine SU-Full scoring, with a
 * self-consistent `locked:true` test double standing in for the real
 * registry crosswalk (which stays `locked:false` until Phase 2 clears).
 *
 * PUBLISHED-VERSION FIDELITY (ADR-0017 / R1-H4): `buildScalingUpFullContent()`
 * is the seed's `VERSION_NUMBER = 2` (Wave J-1) DRAFT content and includes the
 * FTE background questions (`Q_FTE_CONTRACT`/`Q_FREELANCE`, `isRequired:true`).
 * Today's actually-PUBLISHED v1 has no FTE question at all. To simulate what a
 * real import scores against RIGHT NOW, this test strips those FTE questions
 * before building `versionQuestions`/`scorableStableKeys` -- exactly mirroring
 * the documented v1 behavior ("FTE source values simply dropped, phase tile
 * absent, no error").
 */

import { parseEspertoExport } from "../../../../lib/assessments/esperto-import/parse";
import {
  buildRestrictedImportPlan,
  type BuildRestrictedImportPlanInput,
} from "../../../../lib/assessments/esperto-import/restricted-plan";
import {
  commitRestrictedImport,
  type RestrictedCommitCtx,
  type RestrictedCommitDb,
} from "../../../../lib/assessments/esperto-import/restricted-commit";
import type { Crosswalk, VersionQuestion } from "../../../../lib/assessments/esperto-import/crosswalks";
import type { EspertoRestricted } from "../../../../lib/assessments/esperto-import/types";
import type { ApiActor } from "@/lib/auth/access-control";
import { buildScalingUpFullContent } from "../../../../../prisma/seed-scaling-up-full-assessment";

import respondentA from "./fixtures/restricted-individual.json";
import respondentB from "./fixtures/restricted-individual-2.json";

import { readFileSync } from "fs";
import path from "path";

const HASH_SALT = "e2e-test-fixed-salt";
const actor: ApiActor = { userId: "coach-user-1", email: "coach@example.com", role: "COACH", coachId: "coach-1" };

// ────────────────────────────────────────────────────────────────────────
// Real SU-Full content, trimmed to the actually-published-v1 shape
// (strip the v2-draft-only FTE background questions -- ADR-0017 / R1-H4).
// ────────────────────────────────────────────────────────────────────────

/** Minimal shape this test needs from a seed question -- `SeedContent.questions` is deliberately `unknown[]` (shared across templates with different question shapes). */
interface SeedQuestionShape {
  stableKey: string;
  type: string;
  isRequired: boolean;
  scale?: { min: number; max: number };
}

const REAL_CONTENT = buildScalingUpFullContent();
const ALL_QUESTIONS = REAL_CONTENT.questions as unknown as SeedQuestionShape[];
const V1_QUESTIONS = ALL_QUESTIONS.filter((q) => /^Q\d{2}$/.test(q.stableKey));

const versionQuestions: VersionQuestion[] = V1_QUESTIONS.map((q) => ({
  stableKey: q.stableKey,
  type: q.type,
  scale: q.scale ? { min: q.scale.min, max: q.scale.max } : undefined,
}));

const scorableStableKeys = V1_QUESTIONS.filter((q) => q.isRequired).map(
  (q) => q.stableKey,
);

const versionForScoring = {
  questions: V1_QUESTIONS,
  sections: REAL_CONTENT.sections,
  scoringConfig: REAL_CONTENT.scoringConfig,
} as unknown as RestrictedCommitCtx["versionForScoringForNewCampaign"];

// ────────────────────────────────────────────────────────────────────────
// TEST-ONLY crosswalk (mechanically generated -- see file header)
// ────────────────────────────────────────────────────────────────────────

/** The 61 raw slider keys in their known block order (Q3..Q12; §"reference_su_full_esperto_source_facts"). */
const RAW_SLIDER_BLOCKS: { prefix: string; count: number }[] = [
  { prefix: "Q3_", count: 4 },
  { prefix: "Q4_", count: 7 },
  { prefix: "Q5_", count: 5 },
  { prefix: "Q6_", count: 6 },
  { prefix: "Q7_", count: 5 },
  { prefix: "Q8_", count: 8 },
  { prefix: "Q9_", count: 5 },
  { prefix: "Q10_", count: 6 },
  { prefix: "Q11_", count: 5 },
  { prefix: "Q12_", count: 10 },
];

const DROPPED_KEYS = [
  "Q1o1_1", "Q1o2_2", "Q1o2_3", "Q1o4",
  "Q2o1_1", "Q2o1_2", "Q2o1_3", "Q2o2_2", "Q2o2_3",
  "ScoreSchatting", "Q12open",
  "Q13o1_1", "Q13o2_1", "Q13o3", "Q13o4",
  "Q13o5_1", "Q13o6_1", "Q13o6_2", "Q13o7_1", "Q13o7_2", "Q13o8_1",
  "Q16", "Q17",
  "provincie", "state", "country", "postcode", "geslacht", "leeftijd",
];

function buildTestCrosswalk(): Crosswalk {
  const rawKeys: string[] = [];
  for (const block of RAW_SLIDER_BLOCKS) {
    for (let i = 1; i <= block.count; i++) rawKeys.push(`${block.prefix}${i}`);
  }
  if (rawKeys.length !== versionQuestions.length) {
    throw new Error(
      `test crosswalk mismatch: ${rawKeys.length} raw slider keys vs ${versionQuestions.length} v1 questions`,
    );
  }
  const map = rawKeys.map((espertoKey, i) => ({
    espertoKey,
    stableKey: versionQuestions[i].stableKey,
    ourType: "SLIDER_LIKERT" as const,
  }));
  return {
    templateAlias: "scaling-up-full",
    espertoVariant: null,
    locked: true, // TEST DOUBLE ONLY -- the real registry crosswalk stays locked:false.
    map,
    droppedKeys: DROPPED_KEYS.map((key) => ({ key, reason: "not scored (E2E test crosswalk)" })),
  };
}

// ────────────────────────────────────────────────────────────────────────
// A small, SELF-CONTAINED stateful fake DB (deliberately NOT imported from
// restricted-commit.test.ts -- importing a *.test.ts file as a module
// re-executes its top-level describe/it blocks, silently re-running that
// file's own suite inside this one. Scoped to only what this E2E test
// exercises: entitled coach, org cid pin, campaign create/exact-reuse.)
// ────────────────────────────────────────────────────────────────────────

interface E2ECampaignRow {
  id: string;
  organizationId: string;
  templateId: string;
  versionId: string;
  importManifest: unknown;
  externalId: string;
}

class E2EFakeDb implements RestrictedCommitDb {
  private orgs = new Map<string, { id: string; espertoSuFullCid: string | null }>();
  private campaigns = new Map<string, E2ECampaignRow>();
  private nextCampaignId = 0;
  private nextInvitationId = 0;
  private nextSubmissionId = 0;
  private submissions: { id: string; campaignId: string; submittedAt: Date }[] = [];

  // Test-visible tracking.
  campaignCreates: { data: Record<string, unknown> }[] = [];
  submissionCreates: { data: Record<string, unknown> }[] = [];
  auditCreates: { data: Record<string, unknown> }[] = [];

  seedOrg(id: string, espertoSuFullCid: string | null): void {
    this.orgs.set(id, { id, espertoSuFullCid });
  }

  get campaignsByExternalId() {
    return this.campaigns;
  }

  // AccessControlDb surface for canCreateCampaign (real call, fake data) —
  // a permanently-CERTIFIED coach with unconditional template access.
  coach = {
    findUnique: async () => ({ id: "coach-1", certificationStatus: "ACTIVE" }),
  };
  accessGroupCoach = {
    findMany: async () => [
      { accessGroupId: "grp-1", coachId: "coach-1", accessGroup: { id: "grp-1", deletedAt: null } },
    ],
  };
  accessGroupTemplate = {
    findMany: async (args: { where?: { templateId?: string } }) =>
      args.where?.templateId
        ? [{ accessGroupId: "grp-1", templateId: args.where.templateId }]
        : [{ accessGroupId: "grp-1", templateId: "tmpl-sufull" }],
  };

  organization = {
    findUnique: async (args: { where: { id: string } }) =>
      this.orgs.get(args.where.id) ?? null,
    update: async (args: { where: { id: string }; data: { espertoSuFullCid: string } }) => {
      const org = this.orgs.get(args.where.id);
      if (org) org.espertoSuFullCid = args.data.espertoSuFullCid;
      return { id: args.where.id };
    },
  };

  assessmentCampaign = {
    findUnique: async (args: { where: { externalId: string } }) =>
      this.campaigns.get(args.where.externalId) ?? null,
    create: async (args: { data: Record<string, unknown> }) => {
      this.campaignCreates.push(args);
      const id = `camp-${this.nextCampaignId++}`;
      const row: E2ECampaignRow = {
        id,
        organizationId: args.data.organizationId as string,
        templateId: args.data.templateId as string,
        versionId: args.data.versionId as string,
        importManifest: args.data.importManifest,
        externalId: args.data.externalId as string,
      };
      this.campaigns.set(row.externalId, row);
      return { id };
    },
    update: async (args: { where: { id: string }; data: Record<string, unknown> }) => {
      for (const row of this.campaigns.values()) {
        if (row.id === args.where.id && "importManifest" in args.data) {
          row.importManifest = args.data.importManifest;
        }
      }
      return { id: args.where.id };
    },
  };

  assessmentTemplateVersion = {
    findUnique: async () => null, // unused — this E2E test never exercises reuse-append.
  };

  assessmentInvitation = {
    upsert: async () => ({ id: `inv-${this.nextInvitationId++}` }),
  };

  assessmentSubmission = {
    create: async (args: { data: Record<string, unknown> }) => {
      this.submissionCreates.push(args);
      const id = `sub-${this.nextSubmissionId++}`;
      this.submissions.push({
        id,
        campaignId: args.data.campaignId as string,
        submittedAt: args.data.submittedAt as Date,
      });
      return { id };
    },
    aggregate: async (args: { where: object }) => {
      const campaignId = (args.where as { campaignId: string }).campaignId;
      const rows = this.submissions.filter((s) => s.campaignId === campaignId);
      if (rows.length === 0) return { _min: { submittedAt: null }, _max: { submittedAt: null } };
      const times = rows.map((r) => r.submittedAt.getTime());
      return {
        _min: { submittedAt: new Date(Math.min(...times)) },
        _max: { submittedAt: new Date(Math.max(...times)) },
      };
    },
  };

  auditLog = {
    create: async (args: { data: Record<string, unknown> }) => {
      this.auditCreates.push(args);
      return { id: `audit-${this.auditCreates.length}` };
    },
  };

  async acquireRoundLock(): Promise<void> {
    // No real Postgres lock needed for a single-threaded Jest run.
  }

  async $transaction<T>(fn: (tx: RestrictedCommitDb) => Promise<T>): Promise<T> {
    return fn(this as unknown as RestrictedCommitDb);
  }
}

// ────────────────────────────────────────────────────────────────────────
// Helpers
// ────────────────────────────────────────────────────────────────────────

function parseFixture(json: unknown): EspertoRestricted {
  const parsed = parseEspertoExport(json);
  if (parsed.kind !== "restricted-individual") {
    throw new Error(`fixture did not parse as restricted-individual, got ${parsed.kind}`);
  }
  return parsed.data;
}

function makeCtx(): { ctx: RestrictedCommitCtx } {
  return {
    ctx: {
      templateId: "tmpl-sufull",
      organizationId: "org-e2e-1",
      ownerCoachId: "coach-1",
      language: "enUS",
      createdByUserId: actor.userId,
      previewResolvedVersionId: "ver-e2e-v1",
      commitResolvedVersionId: "ver-e2e-v1",
      versionForScoringForNewCampaign: versionForScoring,
    },
  };
}

function buildPlanInput(
  files: EspertoRestricted[],
  respondents: { id: string; externalId: string | null }[],
  roundLabel = "2025 Annual",
): BuildRestrictedImportPlanInput {
  return {
    files,
    crosswalk: buildTestCrosswalk(),
    roundLabel,
    targetOrgId: "org-e2e-1",
    respondents,
    versionQuestions,
    scorableStableKeys,
    hashSalt: HASH_SALT,
    nowIso: "2026-07-01T12:00:00.000Z",
  };
}

// ────────────────────────────────────────────────────────────────────────
// Tests
// ────────────────────────────────────────────────────────────────────────

describe("Wave O restricted (SU-Full) import — end-to-end", () => {
  it("scores two respondents for real (real domain rollup, real scaleUpScore, real tier)", async () => {
    const fileA = parseFixture(respondentA);
    const fileB = parseFixture(respondentB);

    const db = new E2EFakeDb();
    db.seedOrg("org-e2e-1", null);

    const respondents = [
      { id: "resp-A", externalId: fileA.mid },
      { id: "resp-B", externalId: fileB.mid },
    ];

    const plan = buildRestrictedImportPlan(
      buildPlanInput([fileA, fileB], respondents),
    );

    expect(plan.blocks).toEqual([]);
    expect(plan.skips).toEqual([]);
    expect(plan.campaign).not.toBeNull();
    expect(plan.campaign!.rows).toHaveLength(2);

    const { ctx } = makeCtx();
    const result = await commitRestrictedImport(db, plan, ctx, actor);

    if (result.kind !== "created") throw new Error(`expected created, got ${result.kind}`);
    expect(result.submissionsCreated).toBe(2);

    const campaign = db.campaignsByExternalId.get(plan.campaign!.externalId);
    expect(campaign).toBeDefined();
    expect(campaign!.externalId).toBe(`esperto:sufull:7wHb5mXw95:2025-annual`);

    expect(db.submissionCreates).toHaveLength(2);
    for (const call of db.submissionCreates) {
      const submission = call.data as {
        result: {
          perDomain?: unknown[];
          scaleUpScore?: number;
          tier: unknown;
          overallAverage: number;
        };
        submittedAt: Date;
        campaignId: string;
      };
      // Real ScoreResult, not a stub: perDomain populated, scaleUpScore in [0,100], tier present.
      expect(Array.isArray(submission.result.perDomain)).toBe(true);
      expect(submission.result.perDomain!.length).toBeGreaterThan(0);
      expect(typeof submission.result.scaleUpScore).toBe("number");
      expect(submission.result.scaleUpScore!).toBeGreaterThanOrEqual(0);
      expect(submission.result.scaleUpScore!).toBeLessThanOrEqual(100);
      expect(submission.result.tier).not.toBeNull();
      expect(submission.result.overallAverage).toBeGreaterThan(0);
      // Shape contract downstream reads (respondent-longitudinal.ts) depend on.
      expect(submission.submittedAt).toBeInstanceOf(Date);
      expect(submission.campaignId).toBe(campaign!.id);
    }
  });

  it("is idempotent — an exact re-import of the same round is a true no-op", async () => {
    const fileA = parseFixture(respondentA);
    const fileB = parseFixture(respondentB);
    const respondents = [
      { id: "resp-A", externalId: fileA.mid },
      { id: "resp-B", externalId: fileB.mid },
    ];

    const db = new E2EFakeDb();
    db.seedOrg("org-e2e-1", null);

    const plan = buildRestrictedImportPlan(
      buildPlanInput([fileA, fileB], respondents),
    );
    const { ctx } = makeCtx();

    const first = await commitRestrictedImport(db, plan, ctx, actor);
    expect(first.kind).toBe("created");
    expect(db.submissionCreates).toHaveLength(2);

    // Re-run the SAME plan against the SAME (now populated) db.
    const secondPlan = buildRestrictedImportPlan(
      buildPlanInput([fileA, fileB], respondents),
    );
    const second = await commitRestrictedImport(db, secondPlan, ctx, actor);

    expect(second.kind).toBe("reused-noop");
    // No new writes at all on the exact re-import.
    expect(db.submissionCreates).toHaveLength(2);
    expect(db.campaignCreates).toHaveLength(1);
  });

  it("degrades gracefully against today's published v1 (no FTE question, no phase-tile error)", () => {
    // Confirms the ADR-0017 / R1-H4 claim this test file is built around: the
    // trimmed v1 question set has no Q_FTE_CONTRACT/Q_FREELANCE, and the test
    // crosswalk never maps to them -- so completeness for a real v1 import
    // never depends on FTE at all.
    expect(versionQuestions.some((q) => q.stableKey === "Q_FTE_CONTRACT")).toBe(false);
    expect(versionQuestions.some((q) => q.stableKey === "Q_FREELANCE")).toBe(false);
    expect(scorableStableKeys).not.toContain("Q_FTE_CONTRACT");
    expect(versionQuestions).toHaveLength(61);
  });
});

describe("Wave O restricted import — NO email-send dependency (structural)", () => {
  it("restricted-commit.ts imports no email/notifications sender", () => {
    const source = readFileSync(
      path.resolve(
        __dirname,
        "../../../../lib/assessments/esperto-import/restricted-commit.ts",
      ),
      "utf8",
    );
    const FORBIDDEN_IMPORT_SUBSTRINGS = [
      "sendAssessmentInvitationEmail",
      "email-sender",
      "services/notifications",
      "../../services/notifications",
      "smtp-transport",
    ];
    for (const needle of FORBIDDEN_IMPORT_SUBSTRINGS) {
      expect(source).not.toContain(needle);
    }
  });
});
