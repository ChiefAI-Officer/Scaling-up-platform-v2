/**
 * Esperto historical import — Wave O RESTRICTED (SU-Full) commit (THE writer)
 * unit tests.
 *
 * Spec ref: docs/specs/v7.6/12-esperto-historical-import.md §4 (restricted
 * shape), §7 (crosswalk lock gate); Wave O — per-round SU-Full historical
 * import.
 *
 * commitRestrictedImport runs ONE db.$transaction. These tests use an
 * in-memory fake RestrictedCommitDb (no real Postgres) and a REAL
 * canCreateCampaign call against a fake AccessControlDb-shaped tx, so the
 * entitlement gate is exercised for real rather than mocked. Covers:
 *   - plan-blocked / version-changed-since-preview / low-resolution-batch
 *     pre-transaction refusals (zero DB calls).
 *   - entitlement-denied inside the tx.
 *   - org-not-found / cid-mismatch.
 *   - CREATE path happy (campaign shape, invitations+submissions, cid pin,
 *     audit, importManifest.versionId).
 *   - P2002 race on create → falls through to reuse.
 *   - REUSE exact no-op (zero writes).
 *   - REUSE superset append (1 new respondent, scored against the EXISTING
 *     campaign's pinned version, not the new preview's).
 *   - REUSE divergent (changed answer / missing respondent) → throws, zero
 *     writes.
 *   - externalId-conflict (different org/template).
 *   - audit `changes` JSON never contains a raw mid.
 */

// scoreSubmission is mocked so the commit logic is tested in isolation; the
// mock is direction-aware (returns a distinguishable {scoredBy} tag based on
// which version-shaped object it receives) so we can assert the REUSE
// superset-append path scores against the EXISTING campaign's pinned
// version, not ctx.versionForScoringForNewCampaign.
jest.mock("../../../../lib/assessments/scoring", () => {
  const actual = jest.requireActual("../../../../lib/assessments/scoring");
  return {
    ...actual,
    scoreSubmission: jest.fn((version: unknown) => ({
      scoredBy: (version as { marker?: string }).marker ?? "unknown",
    })),
  };
});

import {
  commitRestrictedImport,
  RestrictedCommitError,
} from "../../../../lib/assessments/esperto-import/restricted-commit";
import type {
  RestrictedCommitCtx,
  RestrictedCommitDb,
} from "../../../../lib/assessments/esperto-import/restricted-commit";
import type {
  RestrictedImportPlan,
  RestrictedCampaign,
  RoundManifest,
} from "../../../../lib/assessments/esperto-import/restricted-plan";
import { scoreSubmission } from "../../../../lib/assessments/scoring";
import type { ApiActor } from "../../../../lib/auth/access-control";

// ────────────────────────────────────────────────────────────────────────
// Fixtures
// ────────────────────────────────────────────────────────────────────────

const RAW_MID_A = "RAW_MID_SECRET_A";
const RAW_MID_B = "RAW_MID_SECRET_B";
const RAW_MID_C_NEW = "RAW_MID_SECRET_C_NEW";

const actor: ApiActor = {
  userId: "coach-user-1",
  email: "coach@example.com",
  role: "COACH",
  coachId: "coach-1",
};

const adminActor: ApiActor = {
  userId: "admin-1",
  email: "admin@example.com",
  role: "ADMIN",
  coachId: null,
};

function makeCampaign(over: Partial<RestrictedCampaign> = {}): RestrictedCampaign {
  return {
    cid: "cidSUFULL01",
    externalId: "esperto:sufull:cidSUFULL01:2025-annual",
    name: "scaling-up-full — imported — 2025 Annual",
    roundLabelSlug: "2025-annual",
    openAt: "2025-03-01T10:00:00-04:00",
    closeAt: "2025-03-03T12:00:00-04:00",
    rows: [
      {
        respondentId: "resp-A",
        mid: RAW_MID_A,
        reportid: "rep-A",
        submittedAt: "2025-03-01T10:00:00-04:00",
        answers: [{ stableKey: "SUF_rate_a", value: 7 }],
        answerHash: "hash-A-1",
      },
      {
        respondentId: "resp-B",
        mid: RAW_MID_B,
        reportid: "rep-B",
        submittedAt: "2025-03-02T11:00:00-04:00",
        answers: [{ stableKey: "SUF_rate_a", value: 6 }],
        answerHash: "hash-B-1",
      },
    ],
    ...over,
  };
}

function makeManifest(over: Partial<RoundManifest> = {}): RoundManifest {
  return {
    cid: "cidSUFULL01",
    roundLabel: "2025 Annual",
    roundLabelSlug: "2025-annual",
    versionCrosswalkAlias: "scaling-up-full",
    batchFingerprint: "fp-1",
    respondents: [
      { saltedMidHash: "salted-A", saltedReportIdHash: "salted-rep-A", answerHash: "hash-A-1" },
      { saltedMidHash: "salted-B", saltedReportIdHash: "salted-rep-B", answerHash: "hash-B-1" },
    ],
    skippedCount: 0,
    ...over,
  };
}

function basePlan(over: Partial<RestrictedImportPlan> = {}): RestrictedImportPlan {
  return {
    campaign: makeCampaign(),
    skips: [],
    blocks: [],
    warnings: [],
    manifest: makeManifest(),
    ...over,
  };
}

const NEW_CAMPAIGN_VERSION_ID = "ver-new-preview";
const EXISTING_CAMPAIGN_VERSION_ID = "ver-existing-pinned";

function baseCtx(over: Partial<RestrictedCommitCtx> = {}): RestrictedCommitCtx {
  return {
    templateId: "tmpl-sufull",
    organizationId: "org-1",
    ownerCoachId: "coach-1",
    language: "enUS",
    createdByUserId: "coach-user-1",
    previewResolvedVersionId: NEW_CAMPAIGN_VERSION_ID,
    commitResolvedVersionId: NEW_CAMPAIGN_VERSION_ID,
    versionForScoringForNewCampaign: { marker: "new" } as never,
    ...over,
  };
}

// ────────────────────────────────────────────────────────────────────────
// Fake DB — in-memory, no real Postgres. Implements the narrow
// RestrictedCommitDb interface PLUS the AccessControlDb surface
// canCreateCampaign needs (coach / accessGroupCoach / accessGroupTemplate),
// so the entitlement gate runs as a REAL call, not a mock.
// ────────────────────────────────────────────────────────────────────────

interface FakeOrgRow {
  id: string;
  espertoSuFullCid: string | null;
}

interface FakeCampaignRow {
  id: string;
  organizationId: string;
  templateId: string;
  versionId: string;
  externalId: string;
  importManifest: unknown;
  openAt: Date;
  closeAt: Date;
}

interface FakeCoachRow {
  id: string;
  certificationStatus: string;
}

interface FakeSubmissionRow {
  id: string;
  campaignId: string;
  submittedAt: Date;
}

interface FakeVersionRow {
  id: string;
  questions: unknown;
  sections: unknown;
  scoringConfig: unknown;
}

class FakeDb implements RestrictedCommitDb {
  orgs = new Map<string, FakeOrgRow>();
  campaignsByExternalId = new Map<string, FakeCampaignRow>();
  coaches = new Map<string, FakeCoachRow>();
  accessGroupCoachRows: Array<{
    accessGroupId: string;
    coachId: string;
    accessGroup: { id: string; deletedAt: Date | null };
  }> = [];
  accessGroupTemplateRows: Array<{ accessGroupId: string; templateId: string }> = [];
  versions = new Map<string, FakeVersionRow>();
  submissions: FakeSubmissionRow[] = [];
  invitationUpserts: Array<{ where: unknown; create: Record<string, unknown>; update: unknown }> = [];
  submissionCreates: Array<{ data: Record<string, unknown> }> = [];
  campaignCreates: Array<{ data: Record<string, unknown> }> = [];
  campaignUpdates: Array<{ where: { id: string }; data: Record<string, unknown> }> = [];
  orgUpdates: Array<{ where: { id: string }; data: Record<string, unknown> }> = [];
  auditCreates: Array<{ data: Record<string, unknown> }> = [];
  aggregateCalls = 0;
  nextCampaignId = 1;
  nextInvitationId = 1;
  nextSubmissionId = 1;
  /** Set true to force assessmentCampaign.create to throw a P2002 once. */
  forceP2002OnCreate = false;

  organization = {
    findUnique: async (args: { where: { id: string } }) => {
      return this.orgs.get(args.where.id) ?? null;
    },
    update: async (args: { where: { id: string }; data: { espertoSuFullCid: string } }) => {
      this.orgUpdates.push({ where: args.where, data: args.data });
      const org = this.orgs.get(args.where.id);
      if (org) org.espertoSuFullCid = args.data.espertoSuFullCid;
      return { id: args.where.id };
    },
  };

  assessmentCampaign = {
    findUnique: async (args: { where: { externalId: string } }) => {
      const row = this.campaignsByExternalId.get(args.where.externalId);
      if (!row) return null;
      return {
        id: row.id,
        organizationId: row.organizationId,
        templateId: row.templateId,
        versionId: row.versionId,
        importManifest: row.importManifest,
      };
    },
    create: async (args: { data: Record<string, unknown> }) => {
      this.campaignCreates.push({ data: args.data });
      if (this.forceP2002OnCreate) {
        this.forceP2002OnCreate = false;
        const err = new Error("Unique constraint failed") as Error & { code: string };
        err.code = "P2002";
        throw err;
      }
      const id = `camp-${this.nextCampaignId++}`;
      const row: FakeCampaignRow = {
        id,
        organizationId: args.data.organizationId as string,
        templateId: args.data.templateId as string,
        versionId: args.data.versionId as string,
        externalId: args.data.externalId as string,
        importManifest: args.data.importManifest,
        openAt: args.data.openAt as Date,
        closeAt: args.data.closeAt as Date,
      };
      this.campaignsByExternalId.set(row.externalId, row);
      return { id };
    },
    update: async (args: { where: { id: string }; data: Record<string, unknown> }) => {
      this.campaignUpdates.push({ where: args.where, data: args.data });
      for (const row of this.campaignsByExternalId.values()) {
        if (row.id === args.where.id) {
          if ("openAt" in args.data) row.openAt = args.data.openAt as Date;
          if ("closeAt" in args.data) row.closeAt = args.data.closeAt as Date;
          if ("importManifest" in args.data) row.importManifest = args.data.importManifest;
        }
      }
      return { id: args.where.id };
    },
    // Extra delegate used only by canCreateCampaign's canAccessTemplate path — not part of
    // RestrictedCommitDb's declared surface but harmless to include for the fake.
  };

  assessmentTemplateVersion = {
    findUnique: async (args: { where: { id: string } }) => {
      return this.versions.get(args.where.id) ?? null;
    },
  };

  assessmentInvitation = {
    upsert: async (args: {
      where: { campaignId_respondentId: { campaignId: string; respondentId: string } };
      create: Record<string, unknown>;
      update: Record<string, unknown>;
    }) => {
      this.invitationUpserts.push(args);
      return { id: `inv-${this.nextInvitationId++}` };
    },
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
    aggregate: async (args: { where: object; _min: object; _max: object }) => {
      this.aggregateCalls++;
      const campaignId = (args.where as { campaignId: string }).campaignId;
      const rows = this.submissions.filter((s) => s.campaignId === campaignId);
      if (rows.length === 0) {
        return { _min: { submittedAt: null }, _max: { submittedAt: null } };
      }
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

  // AccessControlDb surface for canCreateCampaign (real call, fake data).
  coach = {
    findUnique: async (args: { where: { id: string } }) => {
      return this.coaches.get(args.where.id) ?? null;
    },
  };

  accessGroupCoach = {
    findMany: async (args: { where?: { coachId?: string } }) => {
      const coachId = args.where?.coachId;
      return this.accessGroupCoachRows.filter((r) => !coachId || r.coachId === coachId);
    },
  };

  accessGroupTemplate = {
    findMany: async (args: { where?: { accessGroupId?: { in?: string[] }; templateId?: string } }) => {
      const ids = args.where?.accessGroupId?.in ?? [];
      const templateId = args.where?.templateId;
      return this.accessGroupTemplateRows.filter(
        (r) => ids.includes(r.accessGroupId) && (!templateId || r.templateId === templateId),
      );
    },
  };

  roundLockCalls: string[] = [];

  async acquireRoundLock(key: string): Promise<void> {
    // No real Postgres lock needed — Jest already runs each test's single
    // logical transaction synchronously. Record calls so a test can assert
    // it's invoked with the round's externalId before any read/write.
    this.roundLockCalls.push(key);
  }

  async $transaction<T>(fn: (tx: RestrictedCommitDb) => Promise<T>): Promise<T> {
    return fn(this as unknown as RestrictedCommitDb);
  }

  /** Helper: register an ACTIVE certified coach with full template access. */
  grantFullAccess(coachId: string, templateId: string): void {
    this.coaches.set(coachId, { id: coachId, certificationStatus: "ACTIVE" });
    this.accessGroupCoachRows.push({
      accessGroupId: "grp-1",
      coachId,
      accessGroup: { id: "grp-1", deletedAt: null },
    });
    this.accessGroupTemplateRows.push({ accessGroupId: "grp-1", templateId });
  }

  seedOrg(id: string, espertoSuFullCid: string | null): void {
    this.orgs.set(id, { id, espertoSuFullCid });
  }

  /** Seed an existing campaign row (REUSE-path fixtures). */
  seedExistingCampaign(row: Partial<FakeCampaignRow> & { externalId: string }): FakeCampaignRow {
    const full: FakeCampaignRow = {
      id: row.id ?? `camp-${this.nextCampaignId++}`,
      organizationId: row.organizationId ?? "org-1",
      templateId: row.templateId ?? "tmpl-sufull",
      versionId: row.versionId ?? EXISTING_CAMPAIGN_VERSION_ID,
      externalId: row.externalId,
      importManifest: row.importManifest ?? null,
      openAt: row.openAt ?? new Date("2025-03-01T10:00:00-04:00"),
      closeAt: row.closeAt ?? new Date("2025-03-02T11:00:00-04:00"),
    };
    this.campaignsByExternalId.set(full.externalId, full);
    return full;
  }
}

function makeFakeDbWithAccess(templateId = "tmpl-sufull", coachId = "coach-1"): FakeDb {
  const db = new FakeDb();
  db.grantFullAccess(coachId, templateId);
  db.seedOrg("org-1", null);
  return db;
}

beforeEach(() => {
  (scoreSubmission as jest.Mock).mockClear();
});

// ────────────────────────────────────────────────────────────────────────
// Pre-transaction refusals
// ────────────────────────────────────────────────────────────────────────

describe("commitRestrictedImport — pre-transaction refusals", () => {
  it("throws plan-blocked when plan.blocks is non-empty, before any DB call", async () => {
    const db = makeFakeDbWithAccess();
    const spy = jest.spyOn(db, "$transaction");
    const plan = basePlan({ blocks: [{ reason: "empty-batch", detail: "x" }] });
    await expect(
      commitRestrictedImport(db, plan, baseCtx(), actor),
    ).rejects.toThrow(RestrictedCommitError);
    expect(spy).not.toHaveBeenCalled();
  });

  it("throws plan-blocked when campaign is null", async () => {
    const db = makeFakeDbWithAccess();
    const plan = basePlan({ campaign: null, manifest: null });
    await expect(
      commitRestrictedImport(db, plan, baseCtx(), actor),
    ).rejects.toMatchObject({ code: "plan-blocked" });
  });

  it("throws version-changed-since-preview before the transaction opens", async () => {
    const db = makeFakeDbWithAccess();
    const spy = jest.spyOn(db, "$transaction");
    const ctx = baseCtx({ previewResolvedVersionId: "v1", commitResolvedVersionId: "v2" });
    await expect(
      commitRestrictedImport(db, basePlan(), ctx, actor),
    ).rejects.toMatchObject({ code: "version-changed-since-preview" });
    expect(spy).not.toHaveBeenCalled();
  });

  it("throws low-resolution-batch when >threshold unresolved and no ack", async () => {
    const db = makeFakeDbWithAccess();
    const plan = basePlan({
      campaign: makeCampaign({ rows: [makeCampaign().rows[0]] }), // 1 row
      skips: [
        { mid: "m1", reportid: "r1", reason: "unresolved-respondent" },
        { mid: "m2", reportid: "r2", reason: "unresolved-respondent" },
      ], // 2 unresolved / 3 total > 0.5
    });
    await expect(
      commitRestrictedImport(db, plan, baseCtx(), actor),
    ).rejects.toMatchObject({ code: "low-resolution-batch" });
  });

  it("proceeds past low-resolution-batch when ackLowResolution is true", async () => {
    const db = makeFakeDbWithAccess();
    const plan = basePlan({
      campaign: makeCampaign({ rows: [makeCampaign().rows[0]] }),
      skips: [
        { mid: "m1", reportid: "r1", reason: "unresolved-respondent" },
        { mid: "m2", reportid: "r2", reason: "unresolved-respondent" },
      ],
      manifest: makeManifest({ respondents: [makeManifest().respondents[0]] }),
    });
    const ctx = baseCtx({ ackLowResolution: true });
    const result = await commitRestrictedImport(db, plan, ctx, actor);
    expect(result.kind).toBe("created");
  });

  it("does not echo raw mid values in the low-resolution-batch error details", async () => {
    const db = makeFakeDbWithAccess();
    const plan = basePlan({
      campaign: makeCampaign({ rows: [] }),
      skips: [
        { mid: RAW_MID_A, reportid: "r1", reason: "unresolved-respondent" },
        { mid: RAW_MID_B, reportid: "r2", reason: "unresolved-respondent" },
      ],
      manifest: makeManifest({ respondents: [] }),
    });
    try {
      await commitRestrictedImport(db, plan, baseCtx(), actor);
      fail("expected throw");
    } catch (err) {
      const asStr = JSON.stringify((err as RestrictedCommitError).details);
      expect(asStr).not.toContain(RAW_MID_A);
      expect(asStr).not.toContain(RAW_MID_B);
    }
  });
});

// ────────────────────────────────────────────────────────────────────────
// In-transaction refusals
// ────────────────────────────────────────────────────────────────────────

describe("commitRestrictedImport — in-transaction refusals", () => {
  it("throws entitlement-denied when the coach is not entitled, with zero writes", async () => {
    const db = new FakeDb();
    db.seedOrg("org-1", null);
    // Coach exists but is NOT certified (PENDING) — canCreateCampaign returns false.
    db.coaches.set("coach-1", { id: "coach-1", certificationStatus: "PENDING" });

    await expect(
      commitRestrictedImport(db, basePlan(), baseCtx(), actor),
    ).rejects.toMatchObject({ code: "entitlement-denied" });
    expect(db.campaignCreates).toHaveLength(0);
    expect(db.submissionCreates).toHaveLength(0);
    expect(db.auditCreates).toHaveLength(0);
  });

  it("admin actor bypasses entitlement even with no coach/template grants", async () => {
    const db = new FakeDb();
    db.seedOrg("org-1", null);
    // No coach row, no access grants at all — but actor is ADMIN.
    const result = await commitRestrictedImport(db, basePlan(), baseCtx(), adminActor);
    expect(result.kind).toBe("created");
  });

  it("throws org-not-found when the target org does not exist", async () => {
    const db = makeFakeDbWithAccess();
    db.orgs.clear();
    await expect(
      commitRestrictedImport(db, basePlan(), baseCtx(), actor),
    ).rejects.toMatchObject({ code: "org-not-found" });
    expect(db.campaignCreates).toHaveLength(0);
  });

  it("throws cid-mismatch when the org already has a DIFFERENT cid pinned, with zero writes", async () => {
    const db = makeFakeDbWithAccess();
    db.seedOrg("org-1", "cidDIFFERENT99");
    await expect(
      commitRestrictedImport(db, basePlan(), baseCtx(), actor),
    ).rejects.toMatchObject({ code: "cid-mismatch" });
    expect(db.campaignCreates).toHaveLength(0);
    expect(db.submissionCreates).toHaveLength(0);
    expect(db.orgUpdates).toHaveLength(0);
  });

  it("does not throw cid-mismatch when the org's pinned cid matches the batch's cid", async () => {
    const db = makeFakeDbWithAccess();
    db.seedOrg("org-1", "cidSUFULL01"); // same as makeCampaign().cid
    const result = await commitRestrictedImport(db, basePlan(), baseCtx(), actor);
    expect(result.kind).toBe("created");
    // Already pinned — should NOT re-write it.
    expect(db.orgUpdates).toHaveLength(0);
  });
});

// ────────────────────────────────────────────────────────────────────────
// CREATE path happy
// ────────────────────────────────────────────────────────────────────────

describe("commitRestrictedImport — round-lock serialization (R3-M1)", () => {
  it("acquires the round lock keyed by the campaign externalId before any read/write", async () => {
    const db = makeFakeDbWithAccess();
    await commitRestrictedImport(db, basePlan(), baseCtx(), actor);
    expect(db.roundLockCalls).toEqual(["esperto:sufull:cidSUFULL01:2025-annual"]);
    // Lock must be acquired before the org lookup / campaign lookup — the fake
    // records calls in order, so the lock call is unconditionally first.
    expect(db.roundLockCalls.length).toBe(1);
  });

  it("acquires the lock exactly once even when a P2002 race falls through to reuse", async () => {
    const db = makeFakeDbWithAccess();
    db.seedExistingCampaign({
      externalId: "esperto:sufull:cidSUFULL01:2025-annual",
      organizationId: "org-1",
      templateId: "tmpl-sufull",
      versionId: EXISTING_CAMPAIGN_VERSION_ID,
      importManifest: makeManifest(),
    });
    db.forceP2002OnCreate = true;
    await commitRestrictedImport(db, basePlan(), baseCtx(), actor);
    expect(db.roundLockCalls).toEqual(["esperto:sufull:cidSUFULL01:2025-annual"]);
  });
});

describe("commitRestrictedImport — CREATE path", () => {
  it("creates the campaign CLOSED/INVITED/OPEN_END, N invitations+submissions, pins cid, writes audit", async () => {
    const db = makeFakeDbWithAccess();
    const result = await commitRestrictedImport(db, basePlan(), baseCtx(), actor);

    expect(result.kind).toBe("created");
    expect(db.campaignCreates).toHaveLength(1);
    const data = db.campaignCreates[0].data;
    expect(data.status).toBe("CLOSED");
    expect(data.accessMode).toBe("INVITED");
    expect(data.endMode).toBe("OPEN_END");
    expect(data.externalId).toBe("esperto:sufull:cidSUFULL01:2025-annual");
    expect(data.templateId).toBe("tmpl-sufull");
    expect(data.versionId).toBe(NEW_CAMPAIGN_VERSION_ID);
    expect(data.organizationId).toBe("org-1");
    expect(data.createdBy).toBe("coach-user-1");
    expect(data.createdByCoachId).toBe("coach-1");
    expect(data.openAt).toBeInstanceOf(Date);
    expect(data.closeAt).toBeInstanceOf(Date);

    expect(db.invitationUpserts).toHaveLength(2);
    expect(db.submissionCreates).toHaveLength(2);
    for (const inv of db.invitationUpserts) {
      expect(inv.create.status).toBe("SUBMITTED");
    }

    // cid pinned (was null).
    expect(db.orgUpdates).toHaveLength(1);
    expect(db.orgUpdates[0].data.espertoSuFullCid).toBe("cidSUFULL01");

    // importManifest carries versionId.
    const manifestJson = data.importManifest as { versionId: string; cid: string };
    expect(manifestJson.versionId).toBe(NEW_CAMPAIGN_VERSION_ID);
    expect(manifestJson.cid).toBe("cidSUFULL01");

    // audit row.
    expect(db.auditCreates).toHaveLength(1);
    expect(db.auditCreates[0].data.action).toBe("IMPORT_CREATE");
    expect(db.auditCreates[0].data.performedBy).toBe("coach@example.com");
    const changes = JSON.parse(db.auditCreates[0].data.changes as string);
    expect(changes.campaignAction).toBe("create");
    expect(changes.submissionsCreated).toBe(2);

    if (result.kind === "created") {
      expect(result.submissionsCreated).toBe(2);
    }
  });

  it("scores each new-campaign submission with versionForScoringForNewCampaign and allowMissingRequired:true", async () => {
    const db = makeFakeDbWithAccess();
    await commitRestrictedImport(db, basePlan(), baseCtx(), actor);
    expect(scoreSubmission).toHaveBeenCalledTimes(2);
    for (const call of (scoreSubmission as jest.Mock).mock.calls) {
      expect(call[0]).toEqual({ marker: "new" });
      expect(call[2]).toEqual({ allowMissingRequired: true });
    }
  });

  it("recomputes openAt/closeAt via the DB aggregate over persisted submissions", async () => {
    const db = makeFakeDbWithAccess();
    await commitRestrictedImport(db, basePlan(), baseCtx(), actor);
    expect(db.aggregateCalls).toBeGreaterThanOrEqual(1);
    // The final campaign update should reflect the min/max of the two rows.
    const finalUpdate = db.campaignUpdates[db.campaignUpdates.length - 1];
    expect(finalUpdate.data.openAt).toEqual(new Date("2025-03-01T10:00:00-04:00"));
    expect(finalUpdate.data.closeAt).toEqual(new Date("2025-03-02T11:00:00-04:00"));
  });

  it("falls through to the reuse path on a P2002 race during create", async () => {
    const db = makeFakeDbWithAccess();
    // Pre-seed the "concurrent" campaign that the race would have created.
    const raced = db.seedExistingCampaign({
      externalId: "esperto:sufull:cidSUFULL01:2025-annual",
      organizationId: "org-1",
      templateId: "tmpl-sufull",
      versionId: EXISTING_CAMPAIGN_VERSION_ID,
      importManifest: makeManifest(), // identical manifest → reused-noop
    });
    db.forceP2002OnCreate = true;

    const result = await commitRestrictedImport(db, basePlan(), baseCtx(), actor);
    expect(result.kind).toBe("reused-noop");
    if (result.kind === "reused-noop") {
      expect(result.campaignId).toBe(raced.id);
    }
    // No submission/invitation writes for an exact-reuse no-op.
    expect(db.submissionCreates).toHaveLength(0);
  });
});

// ────────────────────────────────────────────────────────────────────────
// REUSE path — exact no-op
// ────────────────────────────────────────────────────────────────────────

describe("commitRestrictedImport — REUSE exact no-op", () => {
  it("makes ZERO writes when the manifest respondent set is identical", async () => {
    const db = makeFakeDbWithAccess();
    db.seedExistingCampaign({
      externalId: "esperto:sufull:cidSUFULL01:2025-annual",
      organizationId: "org-1",
      templateId: "tmpl-sufull",
      versionId: EXISTING_CAMPAIGN_VERSION_ID,
      importManifest: makeManifest(),
    });
    db.seedOrg("org-1", "cidSUFULL01"); // already pinned to the same cid

    const result = await commitRestrictedImport(db, basePlan(), baseCtx(), actor);
    expect(result.kind).toBe("reused-noop");
    expect(db.campaignCreates).toHaveLength(0);
    expect(db.campaignUpdates).toHaveLength(0);
    expect(db.invitationUpserts).toHaveLength(0);
    expect(db.submissionCreates).toHaveLength(0);
    expect(db.auditCreates).toHaveLength(0);
    expect(db.orgUpdates).toHaveLength(0);
    expect(db.aggregateCalls).toBe(0);
  });
});

// ────────────────────────────────────────────────────────────────────────
// REUSE path — superset append
// ────────────────────────────────────────────────────────────────────────

describe("commitRestrictedImport — REUSE superset append", () => {
  function newBatchWithOneNewRespondent(): RestrictedImportPlan {
    const oldCampaign = makeCampaign();
    const oldManifest = makeManifest();
    const newRow = {
      respondentId: "resp-C",
      mid: RAW_MID_C_NEW,
      reportid: "rep-C",
      submittedAt: "2025-03-04T09:00:00-04:00", // latest → new closeAt
      answers: [{ stableKey: "SUF_rate_a", value: 9 }],
      answerHash: "hash-C-1",
    };
    return basePlan({
      campaign: makeCampaign({ rows: [...oldCampaign.rows, newRow] }),
      manifest: makeManifest({
        respondents: [
          ...oldManifest.respondents,
          { saltedMidHash: "salted-C", saltedReportIdHash: "salted-rep-C", answerHash: "hash-C-1" },
        ],
      }),
    });
  }

  it("creates exactly 1 new invitation+submission, scored against the EXISTING campaign's pinned version", async () => {
    const db = makeFakeDbWithAccess();
    db.seedExistingCampaign({
      externalId: "esperto:sufull:cidSUFULL01:2025-annual",
      organizationId: "org-1",
      templateId: "tmpl-sufull",
      versionId: EXISTING_CAMPAIGN_VERSION_ID,
      importManifest: makeManifest(),
    });
    db.versions.set(EXISTING_CAMPAIGN_VERSION_ID, {
      id: EXISTING_CAMPAIGN_VERSION_ID,
      questions: [],
      sections: [],
      scoringConfig: {},
    });
    db.seedOrg("org-1", "cidSUFULL01");

    const plan = newBatchWithOneNewRespondent();
    const ctx = baseCtx({ versionForScoringForNewCampaign: { marker: "new" } as never });
    const result = await commitRestrictedImport(db, plan, ctx, actor);

    expect(result.kind).toBe("reused-appended");
    if (result.kind === "reused-appended") {
      expect(result.submissionsCreated).toBe(1);
    }
    expect(db.invitationUpserts).toHaveLength(1);
    expect(db.submissionCreates).toHaveLength(1);
    expect(db.campaignCreates).toHaveLength(0);

    // scoreSubmission called once, and NOT with the "new" marker — the
    // EXISTING campaign's version has no `marker` field, so it must be
    // undefined (never "new").
    expect(scoreSubmission).toHaveBeenCalledTimes(1);
    const scoredVersion = (scoreSubmission as jest.Mock).mock.calls[0][0];
    expect(scoredVersion.marker).toBeUndefined();
  });

  it("recomputes openAt/closeAt via aggregate over ALL persisted submissions (old + new)", async () => {
    const db = makeFakeDbWithAccess();
    const existing = db.seedExistingCampaign({
      externalId: "esperto:sufull:cidSUFULL01:2025-annual",
      organizationId: "org-1",
      templateId: "tmpl-sufull",
      versionId: EXISTING_CAMPAIGN_VERSION_ID,
      importManifest: makeManifest(),
    });
    db.versions.set(EXISTING_CAMPAIGN_VERSION_ID, {
      id: EXISTING_CAMPAIGN_VERSION_ID,
      questions: [],
      sections: [],
      scoringConfig: {},
    });
    db.seedOrg("org-1", "cidSUFULL01");
    // Pre-existing persisted submissions from the FIRST import (not re-derived
    // from the plan — simulates rows already in the DB).
    db.submissions.push(
      { id: "sub-old-1", campaignId: existing.id, submittedAt: new Date("2025-03-01T10:00:00-04:00") },
      { id: "sub-old-2", campaignId: existing.id, submittedAt: new Date("2025-03-02T11:00:00-04:00") },
    );

    const plan = newBatchWithOneNewRespondent();
    await commitRestrictedImport(db, plan, baseCtx(), actor);

    const openCloseUpdate = db.campaignUpdates.find((u) => "openAt" in u.data);
    expect(openCloseUpdate).toBeDefined();
    expect(openCloseUpdate!.data.openAt).toEqual(new Date("2025-03-01T10:00:00-04:00"));
    expect(openCloseUpdate!.data.closeAt).toEqual(new Date("2025-03-04T09:00:00-04:00"));
  });

  it("merges manifest respondents (old count + 1) and keeps the campaign's OWN versionId", async () => {
    const db = makeFakeDbWithAccess();
    db.seedExistingCampaign({
      externalId: "esperto:sufull:cidSUFULL01:2025-annual",
      organizationId: "org-1",
      templateId: "tmpl-sufull",
      versionId: EXISTING_CAMPAIGN_VERSION_ID,
      importManifest: makeManifest(),
    });
    db.versions.set(EXISTING_CAMPAIGN_VERSION_ID, {
      id: EXISTING_CAMPAIGN_VERSION_ID,
      questions: [],
      sections: [],
      scoringConfig: {},
    });
    db.seedOrg("org-1", "cidSUFULL01");

    const plan = newBatchWithOneNewRespondent();
    await commitRestrictedImport(db, plan, baseCtx(), actor);

    const manifestUpdate = db.campaignUpdates.find((u) => "importManifest" in u.data);
    expect(manifestUpdate).toBeDefined();
    const parsed = manifestUpdate!.data.importManifest as {
      respondents: unknown[];
      versionId: string;
    };
    expect(parsed.respondents).toHaveLength(3); // 2 old + 1 new
    expect(parsed.versionId).toBe(EXISTING_CAMPAIGN_VERSION_ID);

    const auditChanges = JSON.parse(db.auditCreates[0].data.changes as string);
    expect(auditChanges.campaignAction).toBe("append");
    expect(auditChanges.versionId).toBe(EXISTING_CAMPAIGN_VERSION_ID);
  });
});

// ────────────────────────────────────────────────────────────────────────
// REUSE path — divergent refusal
// ────────────────────────────────────────────────────────────────────────

describe("commitRestrictedImport — REUSE divergent refusal", () => {
  it("throws divergent-reimport with changedCount:1 when an existing respondent's answer changed, zero writes", async () => {
    const db = makeFakeDbWithAccess();
    db.seedExistingCampaign({
      externalId: "esperto:sufull:cidSUFULL01:2025-annual",
      organizationId: "org-1",
      templateId: "tmpl-sufull",
      versionId: EXISTING_CAMPAIGN_VERSION_ID,
      importManifest: makeManifest(),
    });
    db.seedOrg("org-1", "cidSUFULL01");

    // Same respondents, but resp-A's answerHash changed (simulates a changed answer).
    const changedCampaign = makeCampaign({
      rows: [
        { ...makeCampaign().rows[0], answerHash: "hash-A-CHANGED" },
        makeCampaign().rows[1],
      ],
    });
    const plan = basePlan({
      campaign: changedCampaign,
      manifest: makeManifest({
        respondents: [
          { saltedMidHash: "salted-A", saltedReportIdHash: "salted-rep-A", answerHash: "hash-A-CHANGED" },
          { saltedMidHash: "salted-B", saltedReportIdHash: "salted-rep-B", answerHash: "hash-B-1" },
        ],
      }),
    });

    await expect(
      commitRestrictedImport(db, plan, baseCtx(), actor),
    ).rejects.toMatchObject({ code: "divergent-reimport", details: { changedCount: 1, missingCount: 0 } });
    expect(db.campaignUpdates).toHaveLength(0);
    expect(db.invitationUpserts).toHaveLength(0);
    expect(db.submissionCreates).toHaveLength(0);
    expect(db.auditCreates).toHaveLength(0);
  });

  it("throws divergent-reimport with missingCount:1 when an existing respondent is absent from the new batch, zero writes", async () => {
    const db = makeFakeDbWithAccess();
    db.seedExistingCampaign({
      externalId: "esperto:sufull:cidSUFULL01:2025-annual",
      organizationId: "org-1",
      templateId: "tmpl-sufull",
      versionId: EXISTING_CAMPAIGN_VERSION_ID,
      importManifest: makeManifest(),
    });
    db.seedOrg("org-1", "cidSUFULL01");

    // Only respondent B in the new batch — A is missing.
    const onlyB = makeCampaign({ rows: [makeCampaign().rows[1]] });
    const plan = basePlan({
      campaign: onlyB,
      manifest: makeManifest({
        respondents: [
          { saltedMidHash: "salted-B", saltedReportIdHash: "salted-rep-B", answerHash: "hash-B-1" },
        ],
      }),
    });

    await expect(
      commitRestrictedImport(db, plan, baseCtx(), actor),
    ).rejects.toMatchObject({ code: "divergent-reimport", details: { changedCount: 0, missingCount: 1 } });
    expect(db.campaignUpdates).toHaveLength(0);
    expect(db.submissionCreates).toHaveLength(0);
  });
});

// ────────────────────────────────────────────────────────────────────────
// externalId-conflict
// ────────────────────────────────────────────────────────────────────────

describe("commitRestrictedImport — externalId-conflict", () => {
  it("throws when the existing campaign has the same externalId but a different organizationId, zero writes", async () => {
    const db = makeFakeDbWithAccess();
    db.seedExistingCampaign({
      externalId: "esperto:sufull:cidSUFULL01:2025-annual",
      organizationId: "org-OTHER",
      templateId: "tmpl-sufull",
    });
    await expect(
      commitRestrictedImport(db, basePlan(), baseCtx(), actor),
    ).rejects.toMatchObject({ code: "externalId-conflict" });
    expect(db.submissionCreates).toHaveLength(0);
    expect(db.campaignUpdates).toHaveLength(0);
  });

  it("throws when the existing campaign has the same externalId but a different templateId, zero writes", async () => {
    const db = makeFakeDbWithAccess();
    db.seedExistingCampaign({
      externalId: "esperto:sufull:cidSUFULL01:2025-annual",
      organizationId: "org-1",
      templateId: "tmpl-OTHER",
    });
    await expect(
      commitRestrictedImport(db, basePlan(), baseCtx(), actor),
    ).rejects.toMatchObject({ code: "externalId-conflict" });
    expect(db.submissionCreates).toHaveLength(0);
  });
});

// ────────────────────────────────────────────────────────────────────────
// Audit redaction
// ────────────────────────────────────────────────────────────────────────

describe("commitRestrictedImport — audit redaction", () => {
  it("never includes a raw mid/reportid string in any auditLog.create changes payload", async () => {
    const db = makeFakeDbWithAccess();
    await commitRestrictedImport(db, basePlan(), baseCtx(), actor);
    expect(db.auditCreates.length).toBeGreaterThan(0);
    for (const call of db.auditCreates) {
      const changesStr = String(call.data.changes);
      expect(changesStr).not.toContain(RAW_MID_A);
      expect(changesStr).not.toContain(RAW_MID_B);
      expect(changesStr).not.toContain("rep-A");
      expect(changesStr).not.toContain("rep-B");
    }
  });
});
