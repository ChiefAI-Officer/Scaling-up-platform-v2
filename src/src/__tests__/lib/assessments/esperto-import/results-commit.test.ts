/**
 * Esperto historical import — results commit (THE writer) unit tests.
 *
 * Spec ref: docs/specs/v7.6/12-esperto-historical-import.md §6.2–6.4; plan 12a
 * step 8, S1–S4, §23 (audit inside tx); ADR-0006.
 *
 * commitResultsImport runs ONE db.$transaction PER campaign. These tests mock
 * the tx client and assert:
 *   - the campaign is created CLOSED/INVITED with the namespaced externalId +
 *     createdBy/createdByCoachId + pinned versionId/language;
 *   - participant + invitation are create-only upserts;
 *   - the invitation is born SUBMITTED and NO email-send is ever invoked
 *     (there is no send delegate on the tx — assert by surface);
 *   - the submission is created with scoreSubmission's result
 *     (scoreSubmission is called with allowMissingRequired:true);
 *   - the single-CEO guard sets isCEO for exactly one CEO-family respondent,
 *     and none when 0 or >1 are CEO-family;
 *   - an existing submission for the invitation is SKIPPED (create-only re-import);
 *   - an externalId that resolves to a different org/template throws;
 *   - a plan with blocks throws BEFORE any write;
 *   - NO delete / deleteMany / updateMany is ever called.
 */

// scoreSubmission is mocked so the commit logic is tested in isolation; a spy
// lets us assert the allowMissingRequired option flows through.
jest.mock("../../../../lib/assessments/scoring", () => {
  const actual = jest.requireActual("../../../../lib/assessments/scoring");
  return {
    ...actual,
    scoreSubmission: jest.fn(() => ({ scored: true })),
  };
});

import {
  commitResultsImport,
  ResultsCommitError,
} from "../../../../lib/assessments/esperto-import/results-commit";
import type {
  ResultsImportPlan,
  ResultsCampaign,
} from "../../../../lib/assessments/esperto-import/results-plan";
import { scoreSubmission } from "../../../../lib/assessments/scoring";

const actor = { userId: "admin-1", email: "admin@example.com" };

const ctx = {
  templateId: "tmpl-1",
  versionId: "ver-1",
  versionForScoring: {
    questions: [],
    sections: [],
    scoringConfig: {},
  } as never,
  organizationId: "org-1",
  ownerCoachId: "coach-1",
  language: "enUS",
  createdByUserId: "admin-1",
};

interface MockTx {
  assessmentCampaign: { findUnique: jest.Mock; findFirst: jest.Mock; create: jest.Mock };
  orgRespondent: { findMany: jest.Mock };
  assessmentCampaignParticipant: { upsert: jest.Mock; delete: jest.Mock; deleteMany: jest.Mock; updateMany: jest.Mock };
  assessmentInvitation: { upsert: jest.Mock; delete: jest.Mock; deleteMany: jest.Mock; updateMany: jest.Mock };
  assessmentSubmission: { findUnique: jest.Mock; create: jest.Mock; delete: jest.Mock; deleteMany: jest.Mock; updateMany: jest.Mock };
  auditLog: { create: jest.Mock };
}

function makeTx(overrides: Partial<MockTx> = {}): MockTx {
  return {
    assessmentCampaign: {
      findUnique: jest.fn().mockResolvedValue(null),
      findFirst: jest.fn().mockResolvedValue(null),
      create: jest.fn().mockImplementation(({ data }) =>
        Promise.resolve({ id: "camp-new", ...data }),
      ),
    },
    orgRespondent: { findMany: jest.fn().mockResolvedValue([]) },
    assessmentCampaignParticipant: {
      upsert: jest.fn().mockResolvedValue({ id: "part-1" }),
      delete: jest.fn(),
      deleteMany: jest.fn(),
      updateMany: jest.fn(),
    },
    assessmentInvitation: {
      upsert: jest.fn().mockImplementation(({ where }) =>
        Promise.resolve({ id: `inv-${where.campaignId_respondentId.respondentId}` }),
      ),
      delete: jest.fn(),
      deleteMany: jest.fn(),
      updateMany: jest.fn(),
    },
    assessmentSubmission: {
      findUnique: jest.fn().mockResolvedValue(null),
      create: jest.fn().mockResolvedValue({ id: "sub-1" }),
      delete: jest.fn(),
      deleteMany: jest.fn(),
      updateMany: jest.fn(),
    },
    auditLog: { create: jest.fn().mockResolvedValue({ id: "audit-1" }) },
    ...overrides,
  };
}

/** A db stub whose $transaction simply invokes the callback with `tx`. */
function makeDb(tx: MockTx) {
  return {
    $transaction: jest.fn(async (cb: (t: MockTx) => Promise<unknown>) => cb(tx)),
  };
}

function makeCampaign(over: Partial<ResultsCampaign> = {}): ResultsCampaign {
  return {
    espertoCampaignId: "BDvhuDORxZ",
    externalId: "esperto:BDvhuDORxZ",
    name: "qsp-v2 — imported — BDvhuDORxZ",
    openAt: "2026-06-04T15:53:27-04:00",
    closeAt: "2026-06-04T15:58:38-04:00",
    rows: [
      {
        respondentId: "resp-0",
        memberid: "MxRWB1GIwu",
        submittedAt: "2026-06-04T15:53:27-04:00",
        answers: [{ stableKey: "P1_overall_rating", value: 6 }],
      },
    ],
    ...over,
  };
}

function basePlan(over: Partial<ResultsImportPlan> = {}): ResultsImportPlan {
  return {
    campaigns: [makeCampaign()],
    skips: [],
    blocks: [],
    ...over,
  };
}

beforeEach(() => {
  (scoreSubmission as jest.Mock).mockClear();
  (scoreSubmission as jest.Mock).mockReturnValue({ scored: true });
});

describe("commitResultsImport — campaign create", () => {
  it("creates the campaign CLOSED/INVITED with the namespaced externalId + pinned version + createdBy", async () => {
    const tx = makeTx();
    const db = makeDb(tx);
    const res = await commitResultsImport(db as never, basePlan(), ctx, actor);

    expect(tx.assessmentCampaign.create).toHaveBeenCalledTimes(1);
    const data = tx.assessmentCampaign.create.mock.calls[0][0].data;
    expect(data.status).toBe("CLOSED");
    expect(data.accessMode).toBe("INVITED");
    expect(data.endMode).toBe("OPEN_END");
    expect(data.externalId).toBe("esperto:BDvhuDORxZ");
    expect(data.templateId).toBe("tmpl-1");
    expect(data.versionId).toBe("ver-1");
    expect(data.organizationId).toBe("org-1");
    expect(data.language).toBe("enUS");
    expect(data.createdBy).toBe("admin-1");
    expect(data.createdByCoachId).toBe("coach-1");
    expect(data.name).toContain("BDvhuDORxZ");
    // openAt/closeAt are Date instances derived from the plan strings.
    expect(data.openAt).toBeInstanceOf(Date);
    expect(data.closeAt).toBeInstanceOf(Date);

    expect(res.campaigns[0].campaignAction).toBe("create");
    expect(res.campaigns[0].campaignId).toBe("camp-new");
  });

  it("reuses an existing campaign with the same externalId when org+template match", async () => {
    const tx = makeTx({
      assessmentCampaign: {
        findUnique: jest
          .fn()
          .mockResolvedValue({ id: "camp-existing", organizationId: "org-1", templateId: "tmpl-1" }),
        findFirst: jest.fn().mockResolvedValue(null),
        create: jest.fn(),
      },
    });
    const db = makeDb(tx);
    const res = await commitResultsImport(db as never, basePlan(), ctx, actor);
    expect(tx.assessmentCampaign.create).not.toHaveBeenCalled();
    expect(res.campaigns[0].campaignAction).toBe("reuse");
    expect(res.campaigns[0].campaignId).toBe("camp-existing");
  });

  it("throws externalId-conflict when the existing campaign belongs to a different org/template", async () => {
    const tx = makeTx({
      assessmentCampaign: {
        findUnique: jest
          .fn()
          .mockResolvedValue({ id: "camp-other", organizationId: "org-OTHER", templateId: "tmpl-1" }),
        findFirst: jest.fn().mockResolvedValue(null),
        create: jest.fn(),
      },
    });
    const db = makeDb(tx);
    await expect(
      commitResultsImport(db as never, basePlan(), ctx, actor),
    ).rejects.toThrow(ResultsCommitError);
    expect(tx.assessmentSubmission.create).not.toHaveBeenCalled();
  });
});

describe("commitResultsImport — full chain", () => {
  it("upserts participant + invitation (SUBMITTED) and creates the scored submission", async () => {
    const tx = makeTx();
    const db = makeDb(tx);
    const res = await commitResultsImport(db as never, basePlan(), ctx, actor);

    expect(tx.assessmentCampaignParticipant.upsert).toHaveBeenCalledTimes(1);
    const partArgs = tx.assessmentCampaignParticipant.upsert.mock.calls[0][0];
    expect(partArgs.create.teamPathAtAdd).toEqual([]);
    expect(partArgs.create.teamLabelsAtAdd).toEqual([]);
    expect(partArgs.update).toEqual({});

    expect(tx.assessmentInvitation.upsert).toHaveBeenCalledTimes(1);
    const invArgs = tx.assessmentInvitation.upsert.mock.calls[0][0];
    expect(invArgs.create.status).toBe("SUBMITTED");
    expect(invArgs.create.sentAt).toBeInstanceOf(Date);
    expect(invArgs.create.submittedAt).toBeInstanceOf(Date);
    expect(invArgs.create.expiresAt).toBeInstanceOf(Date);
    expect(typeof invArgs.create.tokenHash).toBe("string");
    expect((invArgs.create.tokenHash as string).length).toBe(64);
    expect(invArgs.update).toEqual({});

    expect(tx.assessmentSubmission.create).toHaveBeenCalledTimes(1);
    const subData = tx.assessmentSubmission.create.mock.calls[0][0].data;
    expect(subData.invitationId).toBe("inv-resp-0");
    expect(subData.result).toEqual({ scored: true });
    expect(subData.submittedAt).toBeInstanceOf(Date);

    expect(res.campaigns[0].participantsCreated).toBe(1);
    expect(res.campaigns[0].invitationsCreated).toBe(1);
    expect(res.campaigns[0].submissionsCreated).toBe(1);
  });

  it("calls scoreSubmission with allowMissingRequired:true", async () => {
    const tx = makeTx();
    const db = makeDb(tx);
    await commitResultsImport(db as never, basePlan(), ctx, actor);
    expect(scoreSubmission).toHaveBeenCalledTimes(1);
    const [, answers, options] = (scoreSubmission as jest.Mock).mock.calls[0];
    expect(options).toEqual({ allowMissingRequired: true });
    expect(answers).toEqual([{ stableKey: "P1_overall_rating", value: 6 }]);
  });

  it("skips the submission (create-only) when one already exists for the invitation", async () => {
    const tx = makeTx({
      assessmentSubmission: {
        findUnique: jest.fn().mockResolvedValue({ id: "sub-existing" }),
        create: jest.fn(),
        delete: jest.fn(),
        deleteMany: jest.fn(),
        updateMany: jest.fn(),
      },
    });
    const db = makeDb(tx);
    const res = await commitResultsImport(db as never, basePlan(), ctx, actor);
    expect(tx.assessmentSubmission.create).not.toHaveBeenCalled();
    expect(scoreSubmission).not.toHaveBeenCalled();
    expect(res.campaigns[0].submissionsCreated).toBe(0);
    expect(res.campaigns[0].submissionsSkipped).toBe(1);
  });

  it("never invokes an email-send: the tx has no send surface and no invitation flips to SENT", async () => {
    const tx = makeTx();
    const db = makeDb(tx);
    await commitResultsImport(db as never, basePlan(), ctx, actor);
    // The only invitation write is the create-only upsert born SUBMITTED.
    const invArgs = tx.assessmentInvitation.upsert.mock.calls[0][0];
    expect(invArgs.create.status).toBe("SUBMITTED");
    // No update path that could re-trigger a send.
    expect(invArgs.update).toEqual({});
  });
});

describe("commitResultsImport — single-CEO guard", () => {
  const twoRowCampaign = makeCampaign({
    rows: [
      {
        respondentId: "resp-0",
        memberid: "M0",
        submittedAt: "2026-06-04T15:53:27-04:00",
        answers: [{ stableKey: "k", value: 5 }],
      },
      {
        respondentId: "resp-1",
        memberid: "M1",
        submittedAt: "2026-06-04T15:55:53-04:00",
        answers: [{ stableKey: "k", value: 5 }],
      },
    ],
  });

  it("sets isCEO=true for the SINGLE CEO-family respondent", async () => {
    const tx = makeTx({
      orgRespondent: {
        findMany: jest.fn().mockResolvedValue([
          { id: "resp-0", roleType: "ceofounder" },
          { id: "resp-1", roleType: "employee" },
        ]),
      },
    });
    const db = makeDb(tx);
    await commitResultsImport(
      db as never,
      basePlan({ campaigns: [twoRowCampaign] }),
      ctx,
      actor,
    );
    const calls = tx.assessmentCampaignParticipant.upsert.mock.calls;
    const byResp = new Map(
      calls.map((c) => [c[0].where.campaignId_respondentId.respondentId, c[0].create.isCEO]),
    );
    expect(byResp.get("resp-0")).toBe(true);
    expect(byResp.get("resp-1")).toBe(false);
  });

  it("sets NO CEO when TWO respondents are CEO-family (ambiguous)", async () => {
    const tx = makeTx({
      orgRespondent: {
        findMany: jest.fn().mockResolvedValue([
          { id: "resp-0", roleType: "ceofounderwithteam" },
          { id: "resp-1", roleType: "ceofounderalone" },
        ]),
      },
    });
    const db = makeDb(tx);
    await commitResultsImport(
      db as never,
      basePlan({ campaigns: [twoRowCampaign] }),
      ctx,
      actor,
    );
    const calls = tx.assessmentCampaignParticipant.upsert.mock.calls;
    for (const c of calls) {
      expect(c[0].create.isCEO).toBe(false);
    }
  });
});

describe("commitResultsImport — audit + safety", () => {
  it("writes exactly one EspertoResultsImport audit row per campaign, inside the tx", async () => {
    const tx = makeTx();
    const db = makeDb(tx);
    await commitResultsImport(db as never, basePlan(), ctx, actor);

    expect(tx.auditLog.create).toHaveBeenCalledTimes(1);
    const auditArgs = tx.auditLog.create.mock.calls[0][0].data;
    expect(auditArgs.entityType).toBe("EspertoResultsImport");
    expect(auditArgs.action).toBe("IMPORT");
    expect(auditArgs.performedBy).toBe("admin@example.com");
    expect(auditArgs.entityId).toBe("camp-new");
    const changes = JSON.parse(auditArgs.changes);
    expect(changes.externalId).toBe("esperto:BDvhuDORxZ");
    expect(changes.submissionsCreated).toBe(1);
    expect(changes.source).toBe("esperto-report");
  });

  it("throws BEFORE any write when the plan carries blocks", async () => {
    const tx = makeTx();
    const db = makeDb(tx);
    const plan = basePlan({
      blocks: [{ reason: "crosswalk-not-locked", detail: "qsp-v2" }],
    });
    await expect(
      commitResultsImport(db as never, plan, ctx, actor),
    ).rejects.toThrow(ResultsCommitError);
    expect(db.$transaction).not.toHaveBeenCalled();
    expect(tx.assessmentCampaign.create).not.toHaveBeenCalled();
  });

  it("NEVER calls delete / deleteMany / updateMany on any model", async () => {
    const tx = makeTx();
    const db = makeDb(tx);
    await commitResultsImport(db as never, basePlan(), ctx, actor);
    for (const model of [
      tx.assessmentCampaignParticipant,
      tx.assessmentInvitation,
      tx.assessmentSubmission,
    ]) {
      expect(model.delete).not.toHaveBeenCalled();
      expect(model.deleteMany).not.toHaveBeenCalled();
      expect(model.updateMany).not.toHaveBeenCalled();
    }
  });

  it("commits each campaign in its OWN transaction", async () => {
    const tx = makeTx();
    const db = makeDb(tx);
    const plan = basePlan({
      campaigns: [
        makeCampaign({ espertoCampaignId: "C1", externalId: "esperto:C1" }),
        makeCampaign({ espertoCampaignId: "C2", externalId: "esperto:C2" }),
      ],
    });
    const res = await commitResultsImport(db as never, plan, ctx, actor);
    expect(db.$transaction).toHaveBeenCalledTimes(2);
    expect(res.campaigns).toHaveLength(2);
  });
});
