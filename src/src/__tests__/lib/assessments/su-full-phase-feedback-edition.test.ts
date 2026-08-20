import { buildScalingUpFullContent } from "../../../../prisma/seed-scaling-up-full-assessment";
import {
  createScalingUpFullPhaseFeedbackDraft,
  publishScalingUpFullPhaseFeedbackDraft,
  type PhaseFeedbackEditionDb,
} from "@/lib/assessments/su-full-phase-feedback-edition";
import { buildPhaseRecommendations } from "@/lib/assessments/su-full-phase-feedback-catalogue";
import { computeTemplateContentHash } from "@/lib/assessments/template-content-hash";

type Question = Record<string, unknown> & {
  stableKey: string;
  sortOrder: number;
  type: string;
  recommendations?: unknown[];
  phaseRecommendations?: unknown[];
};

type Version = {
  id: string;
  templateId: string;
  versionNumber: number;
  language: string;
  questions: Question[];
  sections: unknown;
  scoringConfig: unknown;
  reportConfig: unknown;
  contentHash: string;
  publishedAt: Date | null;
  publishedBy: string | null;
  archivedAt: Date | null;
};

type AuditRow = {
  entityType: string;
  entityId: string;
  action: string;
  performedBy: string | null;
  changes: string;
  timestamp: Date;
};

const PHASE_BOUNDARIES = [
  { phase: 1, name: "Pioneering", minFte: 1, maxFte: 8 },
  { phase: 2, name: "Organization", minFte: 9, maxFte: 25 },
  { phase: 3, name: "Management", minFte: 26, maxFte: 50 },
  { phase: 4, name: "Delegation", minFte: 51, maxFte: 150 },
  { phase: 5, name: "Standardization", minFte: 151, maxFte: null },
] as const;

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function transactionConflict(code: "P2034" | "40001" = "P2034"): Error {
  return Object.assign(new Error("Transaction serialization conflict"), { code });
}

function contentHash(
  template: { invitationSubject: string; invitationBodyMarkdown: string },
  version: Pick<Version, "questions" | "sections" | "scoringConfig" | "reportConfig">,
): string {
  return computeTemplateContentHash({
    questions: version.questions,
    sections: version.sections,
    scoringConfig: version.scoringConfig,
    reportConfig: version.reportConfig,
    invitationSubject: template.invitationSubject,
    invitationBodyMarkdown: template.invitationBodyMarkdown,
  });
}

function phaseQuestions(questions: Question[]): Question[] {
  return clone(questions).map((question) =>
    question.type === "SLIDER_LIKERT"
      ? {
          ...question,
          phaseRecommendations: buildPhaseRecommendations(question.stableKey),
        }
      : question,
  );
}

function makeDb(options: {
  templateAlias?: string;
  activeLanguage?: string;
  activePublishedAt?: Date | null;
  activeArchivedAt?: Date | null;
  activeMutate?: (version: Version) => void;
  activeStoredHash?: string;
  latest?: "active" | "archived" | "matching-draft" | "unrelated-draft";
  draftMutate?: (version: Version) => void;
  draftPublished?: boolean;
  includeDraftReceipt?: boolean;
  includePublishReceipt?: boolean;
  actorRole?: string;
  actorMissing?: boolean;
  actorDeletedAt?: Date | null;
  draftPublishedBy?: string | null;
  draftArchivedAt?: Date | null;
  publishCount?: number;
} = {}) {
  const seed = buildScalingUpFullContent();
  const template = {
    id: "template-su-full",
    alias: options.templateAlias ?? "scaling-up-full",
    invitationSubject: seed.invitationSubject,
    invitationBodyMarkdown: seed.invitationBodyMarkdown,
  };
  const active: Version = {
    id: "version-4",
    templateId: template.id,
    versionNumber: 4,
    language: options.activeLanguage ?? "enUS",
    questions: clone(seed.questions) as Question[],
    sections: clone(seed.sections),
    scoringConfig: clone(seed.scoringConfig),
    reportConfig: clone(seed.reportConfig),
    contentHash: "",
    publishedAt:
      options.activePublishedAt === undefined
        ? new Date("2026-08-18T10:00:00.000Z")
        : options.activePublishedAt,
    publishedBy: "prior-admin",
    archivedAt: options.activeArchivedAt ?? null,
  };
  options.activeMutate?.(active);
  active.contentHash = options.activeStoredHash ?? contentHash(template, active);

  const desiredQuestions = phaseQuestions(active.questions);
  const desiredHash = computeTemplateContentHash({
    questions: desiredQuestions,
    sections: active.sections,
    scoringConfig: active.scoringConfig,
    reportConfig: active.reportConfig,
    invitationSubject: template.invitationSubject,
    invitationBodyMarkdown: template.invitationBodyMarkdown,
  });
  const draft: Version = {
    ...clone(active),
    id: "version-5",
    versionNumber: 5,
    questions: desiredQuestions,
    contentHash: desiredHash,
    publishedAt: options.draftPublished
      ? new Date("2026-08-20T10:00:00.000Z")
      : null,
    publishedBy:
      options.draftPublishedBy === undefined
        ? options.draftPublished
          ? "admin-user"
          : null
        : options.draftPublishedBy,
    archivedAt: options.draftArchivedAt ?? null,
  };
  options.draftMutate?.(draft);

  const archived: Version = {
    ...clone(active),
    id: "version-6-archived",
    versionNumber: 6,
    publishedAt: new Date("2026-08-19T10:00:00.000Z"),
    archivedAt: new Date("2026-08-20T09:00:00.000Z"),
  };
  const unrelatedDraft: Version = {
    ...clone(active),
    id: "version-5-unrelated",
    versionNumber: 5,
    contentHash: "unrelated-draft-hash",
    publishedAt: null,
    publishedBy: null,
  };

  const versions: Version[] = [active];
  if (options.latest === "archived") versions.push(archived);
  if (options.latest === "matching-draft" || options.draftPublished) {
    versions.push(draft);
  }
  if (options.latest === "unrelated-draft") versions.push(unrelatedDraft);

  const draftReceipt = {
    sourceId: "2026-08-20.esperto-five-phase-v1",
    templateId: template.id,
    templateAlias: "scaling-up-full",
    language: "enUS",
    sourceVersionId: active.id,
    sourceVersionNumber: active.versionNumber,
    sourcePublishedAt: active.publishedAt?.toISOString() ?? null,
    sourcePublishedBy: active.publishedBy,
    sourceArchivedAt: active.archivedAt?.toISOString() ?? null,
    beforeContentHash: active.contentHash,
    afterContentHash: desiredHash,
    questionCount: 61,
    phaseBandRecordCount: 1220,
    phaseBoundaries: PHASE_BOUNDARIES,
    historicRowsMutated: false,
    draftVersionId: draft.id,
    draftVersionNumber: draft.versionNumber,
    draftPublishedAt: null,
    draftPublishedBy: null,
    draftArchivedAt: null,
    createdByEmail: "creator@example.com",
    createdByUserId: "creator@example.com-user",
  };
  const audits: AuditRow[] = [];
  if (options.includeDraftReceipt || options.latest === "matching-draft" || options.draftPublished) {
    audits.push({
      entityType: "AssessmentTemplateVersion",
      entityId: draft.id,
      action: "SU_FULL_PHASE_FEEDBACK_DRAFT_CREATED",
      performedBy: "creator@example.com",
      changes: JSON.stringify(draftReceipt),
      timestamp: new Date("2026-08-20T09:30:00.000Z"),
    });
  }
  if (options.includePublishReceipt) {
    audits.push({
      entityType: "AssessmentTemplateVersion",
      entityId: draft.id,
      action: "SU_FULL_PHASE_FEEDBACK_DRAFT_PUBLISHED",
      performedBy: "admin@example.com",
      changes: JSON.stringify({
        ...draftReceipt,
        draftVersionId: draft.id,
        draftVersionNumber: draft.versionNumber,
        finalPublishedAt: draft.publishedAt?.toISOString(),
        finalPublishedBy: draft.publishedBy,
        finalArchivedAt: draft.archivedAt?.toISOString() ?? null,
        publishedByEmail: "admin@example.com",
        publishedByUserId: "admin-user",
        draftRowsPublished: 1,
        campaignRowsRepinned: 0,
      }),
      timestamp: new Date("2026-08-20T10:00:00.000Z"),
    });
  }

  const tx = {
    user: {
      findUnique: jest.fn(
        ({ where }: { where: { email: string } }) =>
          Promise.resolve(
            options.actorMissing
              ? null
              : {
                  id:
                    where.email === "admin@example.com"
                      ? "admin-user"
                      : `${where.email}-user`,
                  email: where.email,
                  role: options.actorRole ?? "ADMIN",
                  deletedAt: options.actorDeletedAt ?? null,
                },
          ),
      ),
    },
    assessmentTemplate: {
      findFirst: jest.fn().mockResolvedValue(template),
    },
    assessmentTemplateVersion: {
      findFirst: jest.fn(({ where }: { where: Record<string, unknown> }) => {
        if (typeof where.id === "string") {
          return Promise.resolve(versions.find((version) => version.id === where.id) ?? null);
        }
        if (where.publishedAt) {
          return Promise.resolve(
            [...versions]
              .filter(
                (version) =>
                  version.publishedAt !== null && version.archivedAt === null,
              )
              .sort((a, b) => b.versionNumber - a.versionNumber)[0] ?? null,
          );
        }
        return Promise.resolve(
          [...versions].sort((a, b) => b.versionNumber - a.versionNumber)[0] ?? null,
        );
      }),
      create: jest.fn(({ data }: { data: Record<string, unknown> }) => {
        const created = {
          ...(data as unknown as Version),
          id: "version-created",
        };
        versions.push(created);
        return Promise.resolve({
          id: created.id,
          versionNumber: created.versionNumber,
        });
      }),
      updateMany: jest.fn().mockImplementation(
        ({ data }: { data: { publishedAt: Date; publishedBy: string } }) => {
          if ((options.publishCount ?? 1) === 1) {
            draft.publishedAt = data.publishedAt;
            draft.publishedBy = data.publishedBy;
          }
          return Promise.resolve({ count: options.publishCount ?? 1 });
        },
      ),
    },
    assessmentCampaign: {
      updateMany: jest.fn(),
    },
    auditLog: {
      findFirst: jest.fn(
        ({ where }: { where: { entityId: string; action: string } }) =>
          Promise.resolve(
            [...audits]
              .reverse()
              .find(
                (audit) =>
                  audit.entityId === where.entityId && audit.action === where.action,
              ) ?? null,
          ),
      ),
      create: jest.fn(({ data }: { data: Omit<AuditRow, "timestamp"> }) => {
        audits.push({ ...data, timestamp: new Date("2026-08-20T09:45:00.000Z") });
        return Promise.resolve({});
      }),
    },
  };
  const db = {
    $transaction: jest.fn(async (fn: (inner: typeof tx) => unknown) => fn(tx)),
  };

  return {
    db: db as unknown as PhaseFeedbackEditionDb,
    tx,
    template,
    active,
    draft,
    versions,
    desiredHash,
    draftReceipt,
    audits,
  };
}

describe("createScalingUpFullPhaseFeedbackDraft", () => {
  it("clones the exact active published English edition into an audited forward-only draft", async () => {
    const { db, tx, active, template, desiredHash } = makeDb({ latest: "archived" });

    const result = await createScalingUpFullPhaseFeedbackDraft(
      db,
      " Creator@Example.com ",
    );

    expect(result).toMatchObject({
      action: "created",
      templateId: template.id,
      sourceVersionId: active.id,
      sourceVersionNumber: 4,
      draftVersionId: "version-created",
      draftVersionNumber: 7,
      sourceId: "2026-08-20.esperto-five-phase-v1",
      beforeContentHash: active.contentHash,
      afterContentHash: desiredHash,
      questionCount: 61,
      phaseBandRecordCount: 1220,
      phaseBoundaries: PHASE_BOUNDARIES,
      historicRowsMutated: false,
      createdByEmail: "creator@example.com",
      createdByUserId: "creator@example.com-user",
    });
    expect(db.$transaction).toHaveBeenCalledWith(expect.any(Function), {
      isolationLevel: "Serializable",
      maxWait: 10_000,
      timeout: 55_000,
    });
    expect(tx.assessmentTemplateVersion.create).toHaveBeenCalledTimes(1);
    const created = tx.assessmentTemplateVersion.create.mock.calls[0][0].data as Version;
    expect(created).toMatchObject({
      templateId: template.id,
      versionNumber: 7,
      language: "enUS",
      sections: active.sections,
      scoringConfig: active.scoringConfig,
      reportConfig: active.reportConfig,
      contentHash: desiredHash,
      publishedAt: null,
      publishedBy: null,
    });
    expect(created.questions.filter((q) => q.type === "SLIDER_LIKERT")).toHaveLength(61);
    expect(created.questions[0].recommendations).toEqual(active.questions[0].recommendations);
    expect(created.questions[0].phaseRecommendations).toEqual(
      buildPhaseRecommendations("Q01"),
    );
    expect(active.questions[0].phaseRecommendations).toBeUndefined();
    expect(tx.auditLog.create).toHaveBeenCalledTimes(1);
    const audit = tx.auditLog.create.mock.calls[0][0].data;
    expect(audit).toMatchObject({
      entityType: "AssessmentTemplateVersion",
      entityId: "version-created",
      action: "SU_FULL_PHASE_FEEDBACK_DRAFT_CREATED",
      performedBy: "creator@example.com",
    });
    expect(JSON.parse(audit.changes)).toEqual(
      expect.objectContaining({
        sourceId: "2026-08-20.esperto-five-phase-v1",
        templateId: template.id,
        templateAlias: "scaling-up-full",
        language: "enUS",
        sourceVersionId: active.id,
        sourcePublishedAt: "2026-08-18T10:00:00.000Z",
        sourcePublishedBy: "prior-admin",
        sourceArchivedAt: null,
        beforeContentHash: active.contentHash,
        afterContentHash: desiredHash,
        questionCount: 61,
        phaseBandRecordCount: 1220,
        phaseBoundaries: PHASE_BOUNDARIES,
        historicRowsMutated: false,
        draftVersionId: "version-created",
        draftVersionNumber: 7,
        draftPublishedAt: null,
        draftPublishedBy: null,
        draftArchivedAt: null,
        createdByEmail: "creator@example.com",
        createdByUserId: "creator@example.com-user",
      }),
    );
    expect(tx.assessmentTemplateVersion.updateMany).not.toHaveBeenCalled();
    expect(tx.assessmentCampaign.updateMany).not.toHaveBeenCalled();
  });

  it("retries the whole Serializable creation transaction once after P2034", async () => {
    const ctx = makeDb({ latest: "archived" });
    const transaction = ctx.db.$transaction as jest.Mock;
    const initialVersionCount = ctx.versions.length;
    const initialAuditCount = ctx.audits.length;
    transaction
      .mockReset()
      .mockImplementationOnce(
        async (fn: (inner: typeof ctx.tx) => Promise<unknown>) => {
          await fn(ctx.tx);
          ctx.versions.splice(initialVersionCount);
          ctx.audits.splice(initialAuditCount);
          throw transactionConflict("P2034");
        },
      )
      .mockImplementationOnce(
        (fn: (inner: typeof ctx.tx) => Promise<unknown>) => fn(ctx.tx),
      );

    const result = await createScalingUpFullPhaseFeedbackDraft(
      ctx.db,
      "creator@example.com",
    );

    expect(result.action).toBe("created");
    expect(transaction).toHaveBeenCalledTimes(2);
    expect(ctx.tx.user.findUnique).toHaveBeenCalledTimes(2);
    expect(ctx.tx.assessmentTemplate.findFirst).toHaveBeenCalledTimes(2);
    expect(ctx.audits).toHaveLength(1);
    for (const call of transaction.mock.calls) {
      expect(call[1]).toEqual({
        isolationLevel: "Serializable",
        maxWait: 10_000,
        timeout: 55_000,
      });
    }
  });

  it("does not retry a semantic creation validation failure", async () => {
    const ctx = makeDb({ actorRole: "COACH" });

    await expect(
      createScalingUpFullPhaseFeedbackDraft(ctx.db, "creator@example.com"),
    ).rejects.toThrow(/privileged actor/i);
    expect(ctx.db.$transaction).toHaveBeenCalledTimes(1);
  });

  it("is idempotent only for the exact audited draft", async () => {
    const { db, tx, draft } = makeDb({ latest: "matching-draft" });

    const result = await createScalingUpFullPhaseFeedbackDraft(
      db,
      "creator@example.com",
    );

    expect(result).toMatchObject({
      action: "noop",
      draftVersionId: draft.id,
      draftVersionNumber: draft.versionNumber,
      afterContentHash: draft.contentHash,
    });
    expect(tx.assessmentTemplateVersion.create).not.toHaveBeenCalled();
    expect(tx.assessmentTemplateVersion.updateMany).not.toHaveBeenCalled();
    expect(tx.auditLog.create).not.toHaveBeenCalled();
    expect(tx.auditLog.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        select: { changes: true, performedBy: true },
      }),
    );
  });

  it("does not misreport an already-published phase-aware edition as an idempotent draft", async () => {
    const ctx = makeDb();
    ctx.active.questions = phaseQuestions(ctx.active.questions);
    ctx.active.contentHash = contentHash(ctx.template, ctx.active);

    await expect(
      createScalingUpFullPhaseFeedbackDraft(ctx.db, "creator@example.com"),
    ).rejects.toThrow(/already published|no unpublished draft/i);
    expect(ctx.tx.assessmentTemplateVersion.create).not.toHaveBeenCalled();
    expect(ctx.tx.auditLog.create).not.toHaveBeenCalled();
  });

  it.each([
    ["draft identity", (receipt: Record<string, unknown>) => { receipt.draftVersionId = "other-draft"; }],
    ["missing template identity", (receipt: Record<string, unknown>) => { delete receipt.templateId; }],
    ["template identity", (receipt: Record<string, unknown>) => { receipt.templateId = "other-template"; }],
    ["template alias", (receipt: Record<string, unknown>) => { receipt.templateAlias = "other-alias"; }],
    ["language", (receipt: Record<string, unknown>) => { receipt.language = "nlNL"; }],
    ["missing source lifecycle state", (receipt: Record<string, unknown>) => { delete receipt.sourcePublishedAt; }],
    ["source lifecycle state", (receipt: Record<string, unknown>) => { receipt.sourcePublishedBy = "other-publisher"; }],
    ["missing draft creation state", (receipt: Record<string, unknown>) => { delete receipt.draftArchivedAt; }],
    ["draft creation state", (receipt: Record<string, unknown>) => { receipt.draftArchivedAt = "2026-08-20T08:00:00.000Z"; }],
    ["record count", (receipt: Record<string, unknown>) => { receipt.phaseBandRecordCount = 1219; }],
    ["phase boundaries", (receipt: Record<string, unknown>) => { receipt.phaseBoundaries = PHASE_BOUNDARIES.slice(0, 4); }],
  ])("refuses idempotence when the draft receipt has a wrong %s", async (_label, mutate) => {
    const ctx = makeDb({ latest: "matching-draft" });
    const receipt = JSON.parse(ctx.audits[0].changes) as Record<string, unknown>;
    mutate(receipt);
    ctx.audits[0].changes = JSON.stringify(receipt);

    await expect(
      createScalingUpFullPhaseFeedbackDraft(ctx.db, "creator@example.com"),
    ).rejects.toThrow(/audit receipt/i);
    expect(ctx.tx.assessmentTemplateVersion.create).not.toHaveBeenCalled();
  });

  it.each([
    ["null durable audit actor", (ctx: ReturnType<typeof makeDb>) => { ctx.audits[0].performedBy = null; }],
    ["creator email mismatch", (ctx: ReturnType<typeof makeDb>) => {
      const receipt = JSON.parse(ctx.audits[0].changes) as Record<string, unknown>;
      receipt.createdByEmail = "tampered@example.com";
      ctx.audits[0].changes = JSON.stringify(receipt);
    }],
    ["creator user-ID tampering", (ctx: ReturnType<typeof makeDb>) => {
      const receipt = JSON.parse(ctx.audits[0].changes) as Record<string, unknown>;
      receipt.createdByUserId = "tampered-user";
      ctx.audits[0].changes = JSON.stringify(receipt);
    }],
  ])("refuses idempotent creation with %s", async (_label, mutate) => {
    const ctx = makeDb({ latest: "matching-draft" });
    mutate(ctx);

    await expect(
      createScalingUpFullPhaseFeedbackDraft(ctx.db, "creator@example.com"),
    ).rejects.toThrow(/draft audit receipt|creator/i);
    expect(ctx.tx.assessmentTemplateVersion.create).not.toHaveBeenCalled();
  });

  it("refuses to supersede an unrelated unpublished draft", async () => {
    const { db, tx } = makeDb({ latest: "unrelated-draft" });

    await expect(
      createScalingUpFullPhaseFeedbackDraft(db, "creator@example.com"),
    ).rejects.toThrow(/unpublished draft/i);
    expect(tx.assessmentTemplateVersion.create).not.toHaveBeenCalled();
    expect(tx.auditLog.create).not.toHaveBeenCalled();
  });

  it.each([
    ["pre-populated publishedBy", { draftPublishedBy: "unexpected-user" }],
    ["archivedAt", { draftArchivedAt: new Date("2026-08-20T08:00:00.000Z") }],
  ])("refuses idempotent creation for a draft with %s", async (_label, state) => {
    const { db, tx } = makeDb({ latest: "matching-draft", ...state });

    await expect(
      createScalingUpFullPhaseFeedbackDraft(db, "creator@example.com"),
    ).rejects.toThrow(/exact unpublished draft state/i);
    expect(tx.assessmentTemplateVersion.create).not.toHaveBeenCalled();
    expect(tx.auditLog.create).not.toHaveBeenCalled();
  });

  it("requires an actor email before opening a transaction", async () => {
    const { db } = makeDb();

    await expect(createScalingUpFullPhaseFeedbackDraft(db, "  ")).rejects.toThrow(
      /actor email/i,
    );
    expect(db.$transaction).not.toHaveBeenCalled();
  });

  it.each([
    ["unknown", { actorMissing: true }],
    ["inactive", { actorDeletedAt: new Date("2026-08-20T08:00:00.000Z") }],
    ["unprivileged", { actorRole: "COACH" }],
  ])("rejects an %s draft-creation actor", async (_label, options) => {
    const { db, tx } = makeDb(options);

    await expect(
      createScalingUpFullPhaseFeedbackDraft(db, "spoofed@example.com"),
    ).rejects.toThrow(/privileged actor/i);
    expect(tx.assessmentTemplateVersion.create).not.toHaveBeenCalled();
    expect(tx.auditLog.create).not.toHaveBeenCalled();
  });

  it("refuses a non-SU-Full template even if the database adapter returns it", async () => {
    const { db, tx } = makeDb({ templateAlias: "scaling-up-quick" });

    await expect(
      createScalingUpFullPhaseFeedbackDraft(db, "creator@example.com"),
    ).rejects.toThrow(/scaling-up-full/i);
    expect(tx.assessmentTemplateVersion.create).not.toHaveBeenCalled();
  });

  it("refuses a non-English active source", async () => {
    const { db, tx } = makeDb({ activeLanguage: "nlNL" });

    await expect(
      createScalingUpFullPhaseFeedbackDraft(db, "creator@example.com"),
    ).rejects.toThrow(/enUS/i);
    expect(tx.assessmentTemplateVersion.create).not.toHaveBeenCalled();
  });

  it.each([
    ["unpublished", { activePublishedAt: null }],
    ["archived", { activeArchivedAt: new Date("2026-08-20T08:00:00.000Z") }],
  ])("refuses an adapter result that is %s instead of active-published", async (_label, options) => {
    const { db, tx } = makeDb(options);

    await expect(
      createScalingUpFullPhaseFeedbackDraft(db, "creator@example.com"),
    ).rejects.toThrow(/active published/i);
    expect(tx.assessmentTemplateVersion.create).not.toHaveBeenCalled();
  });

  it("refuses a source whose canonical scored-question order changed", async () => {
    const { db, tx } = makeDb({
      activeMutate(version) {
        [version.questions[0], version.questions[1]] = [
          version.questions[1],
          version.questions[0],
        ];
      },
    });

    await expect(
      createScalingUpFullPhaseFeedbackDraft(db, "creator@example.com"),
    ).rejects.toThrow(/canonical.*order/i);
    expect(tx.assessmentTemplateVersion.create).not.toHaveBeenCalled();
  });

  it("refuses a source with a scored key absent from the audited catalogue", async () => {
    const { db, tx, active, template } = makeDb();
    active.questions[30].stableKey = "Q62";
    active.contentHash = contentHash(template, active);

    await expect(
      createScalingUpFullPhaseFeedbackDraft(db, "creator@example.com"),
    ).rejects.toThrow(/canonical.*Q62|Q62.*canonical/i);
    expect(tx.assessmentTemplateVersion.create).not.toHaveBeenCalled();
  });

  it.each([
    ["invitation", (ctx: ReturnType<typeof makeDb>) => { ctx.template.invitationSubject += " changed"; }],
    ["report config", (ctx: ReturnType<typeof makeDb>) => { ctx.active.reportConfig = { changed: true }; }],
    ["scoring config", (ctx: ReturnType<typeof makeDb>) => { ctx.active.scoringConfig = { changed: true }; }],
  ])("refuses a source whose %s changed without its content hash", async (_label, mutate) => {
    const ctx = makeDb();
    mutate(ctx);

    await expect(
      createScalingUpFullPhaseFeedbackDraft(ctx.db, "creator@example.com"),
    ).rejects.toThrow(/content hash/i);
    expect(ctx.tx.assessmentTemplateVersion.create).not.toHaveBeenCalled();
  });
});

describe("publishScalingUpFullPhaseFeedbackDraft", () => {
  it("publishes only the exact audited draft and writes a transactional receipt without repinning campaigns", async () => {
    const { db, tx, active, draft } = makeDb({
      latest: "matching-draft",
      includeDraftReceipt: true,
    });

    const result = await publishScalingUpFullPhaseFeedbackDraft(
      db,
      draft.id,
      " Admin@Example.com ",
    );

    expect(result).toMatchObject({
      action: "published",
      templateId: active.templateId,
      draftVersionId: draft.id,
      draftVersionNumber: 5,
      sourceVersionId: active.id,
      sourceId: "2026-08-20.esperto-five-phase-v1",
      beforeContentHash: active.contentHash,
      afterContentHash: draft.contentHash,
      questionCount: 61,
      phaseBandRecordCount: 1220,
      phaseBoundaries: PHASE_BOUNDARIES,
      historicRowsMutated: false,
      campaignRowsRepinned: 0,
      publishedBy: "admin@example.com",
      createdByEmail: "creator@example.com",
      createdByUserId: "creator@example.com-user",
    });
    expect(db.$transaction).toHaveBeenCalledWith(expect.any(Function), {
      isolationLevel: "Serializable",
      maxWait: 10_000,
      timeout: 55_000,
    });
    expect(tx.assessmentTemplateVersion.updateMany).toHaveBeenCalledWith({
      where: {
        id: draft.id,
        templateId: active.templateId,
        versionNumber: draft.versionNumber,
        language: "enUS",
        contentHash: draft.contentHash,
        publishedAt: null,
        publishedBy: null,
        archivedAt: null,
      },
      data: {
        publishedAt: expect.any(Date),
        publishedBy: "admin-user",
      },
    });
    expect(tx.assessmentCampaign.updateMany).not.toHaveBeenCalled();
    expect(tx.auditLog.create).toHaveBeenCalledTimes(1);
    const audit = tx.auditLog.create.mock.calls[0][0].data;
    expect(audit).toMatchObject({
      entityType: "AssessmentTemplateVersion",
      entityId: draft.id,
      action: "SU_FULL_PHASE_FEEDBACK_DRAFT_PUBLISHED",
      performedBy: "admin@example.com",
    });
    expect(JSON.parse(audit.changes)).toEqual(
      expect.objectContaining({
        templateId: active.templateId,
        templateAlias: "scaling-up-full",
        language: "enUS",
        sourceVersionId: active.id,
        sourcePublishedAt: "2026-08-18T10:00:00.000Z",
        sourcePublishedBy: "prior-admin",
        sourceArchivedAt: null,
        beforeContentHash: active.contentHash,
        afterContentHash: draft.contentHash,
        questionCount: 61,
        phaseBandRecordCount: 1220,
        phaseBoundaries: PHASE_BOUNDARIES,
        historicRowsMutated: false,
        draftPublishedAt: null,
        draftPublishedBy: null,
        draftArchivedAt: null,
        finalPublishedAt: expect.any(String),
        finalPublishedBy: "admin-user",
        finalArchivedAt: null,
        createdByEmail: "creator@example.com",
        createdByUserId: "creator@example.com-user",
        publishedByEmail: "admin@example.com",
        publishedByUserId: "admin-user",
        draftRowsPublished: 1,
        campaignRowsRepinned: 0,
      }),
    );
  });

  it("requires an actor email before opening a transaction", async () => {
    const { db, draft } = makeDb({ latest: "matching-draft" });

    await expect(
      publishScalingUpFullPhaseFeedbackDraft(db, draft.id, "  "),
    ).rejects.toThrow(/actor email/i);
    expect(db.$transaction).not.toHaveBeenCalled();
  });

  it("requires an active privileged actor", async () => {
    const { db, tx, draft } = makeDb({
      latest: "matching-draft",
      actorRole: "COACH",
    });

    await expect(
      publishScalingUpFullPhaseFeedbackDraft(db, draft.id, "admin@example.com"),
    ).rejects.toThrow(/privileged actor/i);
    expect(tx.assessmentTemplateVersion.updateMany).not.toHaveBeenCalled();
  });

  it.each([
    ["pre-populated publishedBy", { draftPublishedBy: "unexpected-user" }],
    ["archivedAt", { draftArchivedAt: new Date("2026-08-20T08:00:00.000Z") }],
  ])("refuses to publish a draft with %s", async (_label, state) => {
    const { db, tx, draft } = makeDb({
      latest: "matching-draft",
      includeDraftReceipt: true,
      ...state,
    });

    await expect(
      publishScalingUpFullPhaseFeedbackDraft(db, draft.id, "admin@example.com"),
    ).rejects.toThrow(/exact unpublished draft state/i);
    expect(tx.assessmentTemplateVersion.updateMany).not.toHaveBeenCalled();
    expect(tx.auditLog.create).not.toHaveBeenCalled();
  });

  it("refuses a stale predecessor when another active edition superseded the receipt source", async () => {
    const ctx = makeDb({ latest: "matching-draft", includeDraftReceipt: true });
    ctx.versions.push({
      ...clone(ctx.active),
      id: "version-6-new-active",
      versionNumber: 6,
      publishedAt: new Date("2026-08-20T08:00:00.000Z"),
    });

    await expect(
      publishScalingUpFullPhaseFeedbackDraft(
        ctx.db,
        ctx.draft.id,
        "admin@example.com",
      ),
    ).rejects.toThrow(/stale.*active|active.*predecessor/i);
    expect(ctx.tx.assessmentTemplateVersion.updateMany).not.toHaveBeenCalled();
  });

  it.each([
    ["null durable creation-audit actor", (ctx: ReturnType<typeof makeDb>) => { ctx.audits[0].performedBy = null; }],
    ["creation-receipt email mismatch", (ctx: ReturnType<typeof makeDb>) => {
      const receipt = JSON.parse(ctx.audits[0].changes) as Record<string, unknown>;
      receipt.createdByEmail = "tampered@example.com";
      ctx.audits[0].changes = JSON.stringify(receipt);
    }],
    ["creation-receipt user-ID tampering", (ctx: ReturnType<typeof makeDb>) => {
      const receipt = JSON.parse(ctx.audits[0].changes) as Record<string, unknown>;
      receipt.createdByUserId = "tampered-user";
      ctx.audits[0].changes = JSON.stringify(receipt);
    }],
  ])("refuses publication with %s", async (_label, mutate) => {
    const ctx = makeDb({ latest: "matching-draft", includeDraftReceipt: true });
    mutate(ctx);

    await expect(
      publishScalingUpFullPhaseFeedbackDraft(
        ctx.db,
        ctx.draft.id,
        "admin@example.com",
      ),
    ).rejects.toThrow(/draft audit receipt|creator/i);
    expect(ctx.tx.assessmentTemplateVersion.updateMany).not.toHaveBeenCalled();
  });

  it("retries the whole transaction and rejects a predecessor that became stale", async () => {
    const ctx = makeDb({ latest: "matching-draft", includeDraftReceipt: true });
    const transaction = ctx.db.$transaction as jest.Mock;
    const originalPublishedAt = ctx.draft.publishedAt;
    const originalPublishedBy = ctx.draft.publishedBy;
    const initialAuditCount = ctx.audits.length;
    transaction
      .mockReset()
      .mockImplementationOnce(
        async (fn: (inner: typeof ctx.tx) => Promise<unknown>) => {
          await fn(ctx.tx);
          ctx.draft.publishedAt = originalPublishedAt;
          ctx.draft.publishedBy = originalPublishedBy;
          ctx.audits.splice(initialAuditCount);
          ctx.versions.push({
            ...clone(ctx.active),
            id: "version-6-concurrent",
            versionNumber: 6,
            publishedAt: new Date("2026-08-20T11:00:00.000Z"),
          });
          throw transactionConflict("P2034");
        },
      )
      .mockImplementationOnce(
        (fn: (inner: typeof ctx.tx) => Promise<unknown>) => fn(ctx.tx),
      );

    await expect(
      publishScalingUpFullPhaseFeedbackDraft(
        ctx.db,
        ctx.draft.id,
        "admin@example.com",
      ),
    ).rejects.toThrow(/stale active predecessor/i);
    expect(transaction).toHaveBeenCalledTimes(2);
    expect(ctx.tx.user.findUnique).toHaveBeenCalledTimes(4);
    expect(ctx.tx.assessmentTemplate.findFirst).toHaveBeenCalledTimes(2);
    expect(ctx.tx.assessmentTemplateVersion.findFirst).toHaveBeenCalledTimes(6);
    expect(ctx.tx.auditLog.findFirst).toHaveBeenCalledTimes(2);
    for (const call of transaction.mock.calls) {
      expect(call[1]).toEqual({
        isolationLevel: "Serializable",
        maxWait: 10_000,
        timeout: 55_000,
      });
    }
    expect(ctx.draft.publishedAt).toBeNull();
    expect(
      ctx.audits.some(
        (audit) => audit.action === "SU_FULL_PHASE_FEEDBACK_DRAFT_PUBLISHED",
      ),
    ).toBe(false);
  });

  it("exhausts the bounded retry after two PostgreSQL 40001 conflicts", async () => {
    const ctx = makeDb({ latest: "matching-draft", includeDraftReceipt: true });
    const transaction = ctx.db.$transaction as jest.Mock;
    transaction.mockReset().mockRejectedValue(transactionConflict("40001"));

    await expect(
      publishScalingUpFullPhaseFeedbackDraft(
        ctx.db,
        ctx.draft.id,
        "admin@example.com",
      ),
    ).rejects.toMatchObject({ code: "40001" });
    expect(transaction).toHaveBeenCalledTimes(2);
  });

  it.each([
    ["missing template identity", (receipt: Record<string, unknown>) => { delete receipt.templateId; }],
    ["wrong template identity", (receipt: Record<string, unknown>) => { receipt.templateId = "other-template"; }],
    ["missing source lifecycle state", (receipt: Record<string, unknown>) => { delete receipt.sourcePublishedAt; }],
    ["wrong source lifecycle state", (receipt: Record<string, unknown>) => { receipt.sourcePublishedAt = "2026-08-17T10:00:00.000Z"; }],
    ["missing draft creation state", (receipt: Record<string, unknown>) => { delete receipt.draftPublishedAt; }],
    ["wrong draft creation state", (receipt: Record<string, unknown>) => { receipt.draftPublishedBy = "unexpected-user"; }],
  ])("refuses to publish when the draft receipt has %s", async (_label, mutate) => {
    const ctx = makeDb({ latest: "matching-draft", includeDraftReceipt: true });
    const receipt = JSON.parse(ctx.audits[0].changes) as Record<string, unknown>;
    mutate(receipt);
    ctx.audits[0].changes = JSON.stringify(receipt);

    await expect(
      publishScalingUpFullPhaseFeedbackDraft(
        ctx.db,
        ctx.draft.id,
        "admin@example.com",
      ),
    ).rejects.toThrow(/draft audit receipt/i);
    expect(ctx.tx.assessmentTemplateVersion.updateMany).not.toHaveBeenCalled();
  });

  it.each([
    ["missing phase", (version: Version) => { version.questions[0].phaseRecommendations = (version.questions[0].phaseRecommendations as unknown[]).slice(0, 4); }],
    ["wrong range", (version: Version) => { ((version.questions[0].phaseRecommendations as Array<{ bands: Array<{ maxScore: number }> }>)[0].bands[0]).maxScore = 3; }],
    ["wrong record count", (version: Version) => { (version.questions[0].phaseRecommendations as Array<{ bands: unknown[] }>)[0].bands.pop(); }],
  ])("refuses an audited draft with %s", async (_label, mutate) => {
    const ctx = makeDb({ latest: "matching-draft", includeDraftReceipt: true });
    mutate(ctx.draft);

    await expect(
      publishScalingUpFullPhaseFeedbackDraft(
        ctx.db,
        ctx.draft.id,
        "admin@example.com",
      ),
    ).rejects.toThrow(/phase|catalogue|content hash/i);
    expect(ctx.tx.assessmentTemplateVersion.updateMany).not.toHaveBeenCalled();
  });

  it("revalidates canonical scored-question order at publish time", async () => {
    const ctx = makeDb({ latest: "matching-draft", includeDraftReceipt: true });
    [ctx.draft.questions[0], ctx.draft.questions[1]] = [
      ctx.draft.questions[1],
      ctx.draft.questions[0],
    ];

    await expect(
      publishScalingUpFullPhaseFeedbackDraft(
        ctx.db,
        ctx.draft.id,
        "admin@example.com",
      ),
    ).rejects.toThrow(/canonical.*order/i);
    expect(ctx.tx.assessmentTemplateVersion.updateMany).not.toHaveBeenCalled();
  });

  it.each([
    ["invitation", (ctx: ReturnType<typeof makeDb>) => { ctx.template.invitationBodyMarkdown += " changed"; }],
    ["report config", (ctx: ReturnType<typeof makeDb>) => { ctx.draft.reportConfig = { changed: true }; }],
    ["scoring config", (ctx: ReturnType<typeof makeDb>) => { ctx.draft.scoringConfig = { changed: true }; }],
  ])("refuses a draft whose %s changed after its receipt", async (_label, mutate) => {
    const ctx = makeDb({ latest: "matching-draft", includeDraftReceipt: true });
    mutate(ctx);

    await expect(
      publishScalingUpFullPhaseFeedbackDraft(
        ctx.db,
        ctx.draft.id,
        "admin@example.com",
      ),
    ).rejects.toThrow(/content hash/i);
    expect(ctx.tx.assessmentTemplateVersion.updateMany).not.toHaveBeenCalled();
  });

  it("is an immutable idempotent no-op for the exact already-published edition with both receipts", async () => {
    const { db, tx, draft } = makeDb({
      latest: "matching-draft",
      draftPublished: true,
      includeDraftReceipt: true,
      includePublishReceipt: true,
    });

    const result = await publishScalingUpFullPhaseFeedbackDraft(
      db,
      draft.id,
      "admin@example.com",
    );

    expect(result.action).toBe("noop");
    expect(tx.assessmentTemplateVersion.updateMany).not.toHaveBeenCalled();
    expect(tx.assessmentCampaign.updateMany).not.toHaveBeenCalled();
    expect(tx.auditLog.create).not.toHaveBeenCalled();
  });

  it("attributes an already-published retry to the original receipt publisher", async () => {
    const { db, draft } = makeDb({
      latest: "matching-draft",
      draftPublished: true,
      includeDraftReceipt: true,
      includePublishReceipt: true,
    });

    const result = await publishScalingUpFullPhaseFeedbackDraft(
      db,
      draft.id,
      "retry-admin@example.com",
    );

    expect(result).toMatchObject({
      action: "noop",
      publishedBy: "admin@example.com",
    });
  });

  it("refuses coherent predecessor tampering across both receipts", async () => {
    const ctx = makeDb({
      latest: "matching-draft",
      draftPublished: true,
      includeDraftReceipt: true,
      includePublishReceipt: true,
    });
    for (const audit of ctx.audits) {
      const receipt = JSON.parse(audit.changes) as Record<string, unknown>;
      receipt.sourceVersionId = "forged-predecessor";
      receipt.sourceVersionNumber = 99;
      receipt.beforeContentHash = "forged-content-hash";
      receipt.sourcePublishedAt = "2026-08-17T10:00:00.000Z";
      receipt.sourcePublishedBy = "forged-user";
      receipt.sourceArchivedAt = null;
      audit.changes = JSON.stringify(receipt);
    }

    await expect(
      publishScalingUpFullPhaseFeedbackDraft(
        ctx.db,
        ctx.draft.id,
        "admin@example.com",
      ),
    ).rejects.toThrow(/predecessor|audit receipt/i);
    expect(ctx.tx.assessmentTemplateVersion.updateMany).not.toHaveBeenCalled();
  });

  it("refuses coherent receipts that relabel the published draft as its own predecessor", async () => {
    const ctx = makeDb({
      latest: "matching-draft",
      draftPublished: true,
      includeDraftReceipt: true,
      includePublishReceipt: true,
    });
    for (const audit of ctx.audits) {
      const receipt = JSON.parse(audit.changes) as Record<string, unknown>;
      receipt.sourceVersionId = ctx.draft.id;
      receipt.sourceVersionNumber = ctx.draft.versionNumber;
      receipt.beforeContentHash = ctx.draft.contentHash;
      receipt.sourcePublishedAt = ctx.draft.publishedAt?.toISOString();
      receipt.sourcePublishedBy = ctx.draft.publishedBy;
      receipt.sourceArchivedAt = null;
      audit.changes = JSON.stringify(receipt);
    }

    await expect(
      publishScalingUpFullPhaseFeedbackDraft(
        ctx.db,
        ctx.draft.id,
        "admin@example.com",
      ),
    ).rejects.toThrow(/predecessor/i);
    expect(ctx.tx.assessmentTemplateVersion.updateMany).not.toHaveBeenCalled();
  });

  it("refuses publisher-email tampering that disagrees with the durable audit actor", async () => {
    const ctx = makeDb({
      latest: "matching-draft",
      draftPublished: true,
      includeDraftReceipt: true,
      includePublishReceipt: true,
    });
    const publishAudit = ctx.audits.find(
      (audit) => audit.action === "SU_FULL_PHASE_FEEDBACK_DRAFT_PUBLISHED",
    )!;
    const receipt = JSON.parse(publishAudit.changes) as Record<string, unknown>;
    receipt.publishedByEmail = "tampered@example.com";
    publishAudit.changes = JSON.stringify(receipt);

    await expect(
      publishScalingUpFullPhaseFeedbackDraft(
        ctx.db,
        ctx.draft.id,
        "retry-admin@example.com",
      ),
    ).rejects.toThrow(/publish audit receipt/i);
    expect(ctx.tx.assessmentTemplateVersion.updateMany).not.toHaveBeenCalled();
  });

  it.each([
    ["missing template identity", (receipt: Record<string, unknown>) => { delete receipt.templateId; }],
    ["wrong template identity", (receipt: Record<string, unknown>) => { receipt.templateId = "other-template"; }],
    ["missing source lifecycle state", (receipt: Record<string, unknown>) => { delete receipt.sourcePublishedBy; }],
    ["wrong source lifecycle state", (receipt: Record<string, unknown>) => { receipt.sourceArchivedAt = "2026-08-19T10:00:00.000Z"; }],
    ["missing draft creation state", (receipt: Record<string, unknown>) => { delete receipt.draftPublishedAt; }],
    ["wrong draft creation state", (receipt: Record<string, unknown>) => { receipt.draftPublishedAt = "2026-08-19T10:00:00.000Z"; }],
    ["missing final publish state", (receipt: Record<string, unknown>) => { delete receipt.finalPublishedAt; }],
    ["wrong final publish state", (receipt: Record<string, unknown>) => { receipt.finalArchivedAt = "2026-08-21T10:00:00.000Z"; }],
  ])("refuses an already-published edition whose publish receipt has %s", async (_label, mutate) => {
    const ctx = makeDb({
      latest: "matching-draft",
      draftPublished: true,
      includeDraftReceipt: true,
      includePublishReceipt: true,
    });
    const publishAudit = ctx.audits.find(
      (audit) => audit.action === "SU_FULL_PHASE_FEEDBACK_DRAFT_PUBLISHED",
    )!;
    const receipt = JSON.parse(publishAudit.changes) as Record<string, unknown>;
    mutate(receipt);
    publishAudit.changes = JSON.stringify(receipt);

    await expect(
      publishScalingUpFullPhaseFeedbackDraft(
        ctx.db,
        ctx.draft.id,
        "admin@example.com",
      ),
    ).rejects.toThrow(/publish audit receipt/i);
    expect(ctx.tx.assessmentTemplateVersion.updateMany).not.toHaveBeenCalled();
  });

  it("refuses an already-published edition whose publish receipt has stale counts or boundaries", async () => {
    const ctx = makeDb({
      latest: "matching-draft",
      draftPublished: true,
      includeDraftReceipt: true,
      includePublishReceipt: true,
    });
    const publishAudit = ctx.audits.find(
      (audit) => audit.action === "SU_FULL_PHASE_FEEDBACK_DRAFT_PUBLISHED",
    )!;
    const receipt = JSON.parse(publishAudit.changes) as Record<string, unknown>;
    receipt.phaseBandRecordCount = 1219;
    receipt.phaseBoundaries = PHASE_BOUNDARIES.slice(0, 4);
    publishAudit.changes = JSON.stringify(receipt);

    await expect(
      publishScalingUpFullPhaseFeedbackDraft(
        ctx.db,
        ctx.draft.id,
        "admin@example.com",
      ),
    ).rejects.toThrow(/publish audit receipt/i);
    expect(ctx.tx.assessmentTemplateVersion.updateMany).not.toHaveBeenCalled();
  });

  it("refuses to treat an existing published row without its publish receipt as a draft", async () => {
    const { db, tx, draft } = makeDb({
      latest: "matching-draft",
      draftPublished: true,
      includeDraftReceipt: true,
      includePublishReceipt: false,
    });

    await expect(
      publishScalingUpFullPhaseFeedbackDraft(db, draft.id, "admin@example.com"),
    ).rejects.toThrow(/publish audit receipt/i);
    expect(tx.assessmentTemplateVersion.updateMany).not.toHaveBeenCalled();
  });

  it("fails closed when the draft changes between validation and the publish CAS", async () => {
    const { db, tx, draft } = makeDb({
      latest: "matching-draft",
      includeDraftReceipt: true,
      publishCount: 0,
    });

    await expect(
      publishScalingUpFullPhaseFeedbackDraft(db, draft.id, "admin@example.com"),
    ).rejects.toThrow(/changed before publish/i);
    expect(tx.auditLog.create).not.toHaveBeenCalled();
    expect(tx.assessmentCampaign.updateMany).not.toHaveBeenCalled();
  });

  it("refuses a draft outside the SU-Full English edition boundary", async () => {
    const ctx = makeDb({ latest: "matching-draft", includeDraftReceipt: true });
    ctx.draft.language = "nlNL";

    await expect(
      publishScalingUpFullPhaseFeedbackDraft(
        ctx.db,
        ctx.draft.id,
        "admin@example.com",
      ),
    ).rejects.toThrow(/enUS|not found/i);
    expect(ctx.tx.assessmentTemplateVersion.updateMany).not.toHaveBeenCalled();
  });
});
