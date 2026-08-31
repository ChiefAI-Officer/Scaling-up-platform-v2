import {
  LIVE_ALIAS,
  PromotionInvariantError,
  RETIRED_ALIAS,
  SOURCE_CAMPAIGN_ID,
  SOURCE_VERSION_ID,
  SUCCESSOR_CAMPAIGN_ID,
  TARGET_VERSION_ID,
  buildPromotionPlan,
  parsePromotionArgs,
  validateWriteAuthorization,
  type PromotionInput,
} from "@/lib/scripts/promote-sunhub-quick-quiz-core";
import {
  applyPromotion,
  inspectCompletedPromotion,
  loadPromotionInput,
  quiescePromotion,
  type DbClient,
} from "@/lib/scripts/promote-sunhub-quick-quiz-runner";
import {
  databaseHostFromUrl,
  formatPromotionOutcome,
  runPromotionCli,
} from "../../../scripts/promote-sunhub-quick-quiz";
import { execFileSync } from "node:child_process";

const SOURCE_UPDATED_AT = new Date("2026-08-31T01:00:00.000Z");
const QUIESCED_AT = new Date("2026-08-31T01:05:00.000Z");
const DRAINED_AT = new Date("2026-08-31T01:20:00.000Z");

function writeArgs(
  mode: "quiesce" | "apply" = "quiesce",
  expectedUpdatedAt: Date = SOURCE_UPDATED_AT,
) {
  return parsePromotionArgs([
    `--${mode}`,
    "--i-know-this-is-prod",
    "--expect-database-host",
    "db.production.internal",
    "--expect-source-updated-at",
    expectedUpdatedAt.toISOString(),
    "--expect-submissions",
    "12",
  ]);
}

function input(overrides: Partial<PromotionInput> = {}): PromotionInput {
  const args = overrides.args ?? writeArgs();
  return {
    args,
    sourceCampaign: {
      id: SOURCE_CAMPAIGN_ID,
      templateId: "template-sunhub",
      versionId: SOURCE_VERSION_ID,
      language: "en",
      alias: LIVE_ALIAS,
      status: args.mode === "apply" ? "CLOSED" : "ACTIVE",
      accessMode: "PUBLIC",
      deletedAt: null,
      updatedAt: args.mode === "apply" ? QUIESCED_AT : SOURCE_UPDATED_AT,
      submissionCount: 12,
      name: "SunHub quick quiz",
      description: "Eight questions",
      publicConfig: { landing: "sunhub" },
      invitedWelcomeSnapshot: null,
      openAt: new Date("2026-01-01T00:00:00.000Z"),
      endMode: "OPEN_END",
      closeAt: null,
      notifyAdminOnSubmit: true,
      invitationSubject: null,
      invitationBodyMarkdown: null,
      sendResultsToRespondent: false,
      notifyCoachOnCompletion: false,
      showResultsOnScreen: true,
      reportStyle: "CLASSIC",
      reportStyleSource: "TEMPLATE_DEFAULT",
      reportStyleLockedAt: null,
      invitationBodyHtml: null,
      customSlides: [{ title: "Welcome" }],
      createdBy: "admin-1",
      createdByCoachId: null,
    },
    template: {
      id: "template-sunhub",
      alias: "sunhub-quick-quiz",
      deletedAt: null,
      disabledAt: null,
      deliveryType: "PUBLIC_MARKETING_QUIZ",
    },
    sourceVersion: {
      id: SOURCE_VERSION_ID,
      templateId: "template-sunhub",
      language: "en",
      publishedAt: new Date("2026-08-01T00:00:00.000Z"),
      questions: [{ key: "q1", text: "Question" }],
      sections: [{ key: "s1", questionKeys: ["q1"] }],
      scoringConfig: { ranges: [{ min: 0, max: 100 }] },
      reportConfig: { reportHtml: { schemaVersion: 1, introductionHtml: null, conclusionHtml: null } },
    },
    targetVersion: {
      id: TARGET_VERSION_ID,
      templateId: "template-sunhub",
      language: "en",
      publishedAt: new Date("2026-08-30T00:00:00.000Z"),
      questions: [{ text: "Question", key: "q1" }],
      sections: [{ questionKeys: ["q1"], key: "s1" }],
      scoringConfig: { ranges: [{ max: 100, min: 0 }] },
      reportConfig: {
        reportHtml: {
          schemaVersion: 1,
          introductionHtml: "<p>Welcome</p>",
          conclusionHtml: "<p>Book a call</p>",
        },
      },
    },
    latestPublishedVersionId: TARGET_VERSION_ID,
    retiredAliasOccupied: false,
    expected: {
      sourceUpdatedAt: args.mode === "apply" ? QUIESCED_AT.toISOString() : SOURCE_UPDATED_AT.toISOString(),
      submissionCount: 12,
    },
    now: args.mode === "apply" ? DRAINED_AT : SOURCE_UPDATED_AT,
    ...overrides,
  };
}

function expectInvariant(
  mutate: (value: PromotionInput) => PromotionInput,
  field: string,
) {
  expect(() => buildPromotionPlan(mutate(input()))).toThrow(PromotionInvariantError);
  try {
    buildPromotionPlan(mutate(input()));
  } catch (error) {
    expect(error).toMatchObject({ field });
  }
}

describe("promote SunHub quick quiz core", () => {
  it("defaults to a read-only dry-run", () => {
    expect(parsePromotionArgs([])).toEqual({ mode: "dry-run", hasProductionAcknowledgement: false });
  });

  it("requires complete, mutually exclusive write arguments", () => {
    expect(() => parsePromotionArgs(["--quiesce", "--apply"])).toThrow("mode");
    expect(() => parsePromotionArgs(["--quiesce", "--quiesce"])).toThrow("mode");
    expect(() => parsePromotionArgs(["--quiesce"])).toThrow("expect-database-host");
    expect(() => parsePromotionArgs(["--apply", "--expect-database-host", "db", "--expect-source-updated-at", "not-a-date", "--expect-submissions", "12"])).toThrow("expect-source-updated-at");
    expect(() => parsePromotionArgs(["--apply", "--expect-database-host", "db", "--expect-source-updated-at", "2026-08-31T01:00:00Z", "--expect-submissions", "12"])).toThrow("expect-source-updated-at");
    expect(() => parsePromotionArgs(["--quiesce", "--expect-database-host", "db", "--expect-source-updated-at", SOURCE_UPDATED_AT.toISOString(), "--expect-submissions", "1.5"])).toThrow("expect-submissions");
  });

  it("builds the deterministic quiesce manifest and allow-listed successor fields", () => {
    const plan = buildPromotionPlan(input());

    expect(RETIRED_ALIAS).toBe("sunhub-quick-quiz-retired-v1");
    expect(plan).toEqual({
      mode: "quiesce",
      sourceCas: {
        id: SOURCE_CAMPAIGN_ID,
        versionId: SOURCE_VERSION_ID,
        alias: LIVE_ALIAS,
        status: "ACTIVE",
        deletedAt: null,
        updatedAt: SOURCE_UPDATED_AT.toISOString(),
        submissionCount: 12,
      },
      successor: {
        id: "item7-sunhub-quick-quiz-v7-successor",
        templateId: "template-sunhub",
        language: "en",
        alias: LIVE_ALIAS,
        versionId: TARGET_VERSION_ID,
        name: "SunHub quick quiz",
        description: "Eight questions",
        status: "ACTIVE",
        accessMode: "PUBLIC",
        publicConfig: { landing: "sunhub" },
        openAt: new Date("2026-01-01T00:00:00.000Z"),
        endMode: "OPEN_END",
        closeAt: null,
        notifyAdminOnSubmit: true,
        sendResultsToRespondent: false,
        notifyCoachOnCompletion: false,
        showResultsOnScreen: true,
        reportStyle: "CLASSIC",
        reportStyleSource: "TEMPLATE_DEFAULT",
        reportStyleLockedAt: null,
        customSlides: [{ title: "Welcome" }],
        createdBy: "admin-1",
        createdByCoachId: null,
      },
      manifest: {
        schemaVersion: 1,
        operation: "sunhub-quick-quiz-successor-promotion",
        mode: "quiesce",
        source: { campaignId: SOURCE_CAMPAIGN_ID, templateId: "template-sunhub", versionId: SOURCE_VERSION_ID, alias: LIVE_ALIAS },
        target: { versionId: TARGET_VERSION_ID, templateId: "template-sunhub", language: "en" },
        successor: { id: "item7-sunhub-quick-quiz-v7-successor", alias: LIVE_ALIAS, versionId: TARGET_VERSION_ID, templateId: "template-sunhub" },
        expected: { sourceUpdatedAt: SOURCE_UPDATED_AT.toISOString(), submissionCount: 12 },
        audit: {
          action: "PUBLIC_CAMPAIGN_SUCCESSOR_QUIESCE",
          payload: {
            schemaVersion: 1,
            source: {
              id: SOURCE_CAMPAIGN_ID,
              versionId: SOURCE_VERSION_ID,
              alias: LIVE_ALIAS,
              status: "ACTIVE",
              deletedAt: null,
              updatedAt: SOURCE_UPDATED_AT.toISOString(),
              submissionCount: 12,
            },
            targetVersionId: TARGET_VERSION_ID,
            successor: {
              id: "item7-sunhub-quick-quiz-v7-successor",
              templateId: "template-sunhub",
              versionId: TARGET_VERSION_ID,
              language: "en",
              alias: LIVE_ALIAS,
              name: "SunHub quick quiz",
              description: "Eight questions",
              status: "ACTIVE",
              accessMode: "PUBLIC",
              publicConfig: { landing: "sunhub" },
              openAt: new Date("2026-01-01T00:00:00.000Z"),
              endMode: "OPEN_END",
              closeAt: null,
              notifyAdminOnSubmit: true,
              sendResultsToRespondent: false,
              notifyCoachOnCompletion: false,
              showResultsOnScreen: true,
              reportStyle: "CLASSIC",
              reportStyleSource: "TEMPLATE_DEFAULT",
              reportStyleLockedAt: null,
              customSlides: [{ title: "Welcome" }],
              createdBy: "admin-1",
              createdByCoachId: null,
            },
            retiredAlias: RETIRED_ALIAS,
          },
        },
      },
    });
  });

  it("requires an explicit acknowledgement and exact connected host for writes", () => {
    const args = writeArgs();
    expect(() => validateWriteAuthorization({ ...args, hasProductionAcknowledgement: false }, "db.production.internal")).toThrow("i-know-this-is-prod");
    expect(() => validateWriteAuthorization(args, "localhost")).toThrow("expect-database-host");
    expect(() => validateWriteAuthorization(args, "db.production.internal")).not.toThrow();
  });

  const invariantCases: Array<[string, (value: PromotionInput) => PromotionInput, string]> = [
    ["source campaign id", (value: PromotionInput) => ({ ...value, sourceCampaign: { ...value.sourceCampaign, id: "wrong" } }), "sourceCampaign.id"],
    ["source version id", (value: PromotionInput) => ({ ...value, sourceCampaign: { ...value.sourceCampaign, versionId: "wrong" } }), "sourceCampaign.versionId"],
    ["template relationship", (value: PromotionInput) => ({ ...value, sourceVersion: { ...value.sourceVersion, templateId: "wrong" } }), "sourceVersion.templateId"],
    ["language", (value: PromotionInput) => ({ ...value, targetVersion: { ...value.targetVersion, language: "fr" } }), "targetVersion.language"],
    ["source status", (value: PromotionInput) => ({ ...value, sourceCampaign: { ...value.sourceCampaign, status: "CLOSED" as const } }), "sourceCampaign.status"],
    ["public access", (value: PromotionInput) => ({ ...value, sourceCampaign: { ...value.sourceCampaign, accessMode: "INVITED" } }), "sourceCampaign.accessMode"],
    ["deleted template", (value: PromotionInput) => ({ ...value, template: { ...value.template, deletedAt: SOURCE_UPDATED_AT } }), "template.deletedAt"],
    ["disabled template", (value: PromotionInput) => ({ ...value, template: { ...value.template, disabledAt: SOURCE_UPDATED_AT } }), "template.disabledAt"],
    ["delivery type", (value: PromotionInput) => ({ ...value, template: { ...value.template, deliveryType: "INVITED_ASSESSMENT" } }), "template.deliveryType"],
    ["retired alias", (value: PromotionInput) => ({ ...value, retiredAliasOccupied: true }), "retiredAlias"],
    ["latest target", (value: PromotionInput) => ({ ...value, latestPublishedVersionId: "other" }), "latestPublishedVersionId"],
    ["published target", (value: PromotionInput) => ({ ...value, targetVersion: { ...value.targetVersion, publishedAt: null } }), "targetVersion.publishedAt"],
    ["safe introduction", (value: PromotionInput) => ({ ...value, targetVersion: { ...value.targetVersion, reportConfig: { reportHtml: { schemaVersion: 1, introductionHtml: "<script>bad</script>", conclusionHtml: "<p>Book a call</p>" } } } }), "targetVersion.reportConfig.reportHtml.introductionHtml"],
    ["missing conclusion", (value: PromotionInput) => ({ ...value, targetVersion: { ...value.targetVersion, reportConfig: { reportHtml: { schemaVersion: 1, introductionHtml: "<p>Welcome</p>", conclusionHtml: null } } } }), "targetVersion.reportConfig.reportHtml.conclusionHtml"],
    ["questions", (value: PromotionInput) => ({ ...value, targetVersion: { ...value.targetVersion, questions: [] } }), "targetVersion.questions"],
    ["sections", (value: PromotionInput) => ({ ...value, targetVersion: { ...value.targetVersion, sections: [] } }), "targetVersion.sections"],
    ["scoring", (value: PromotionInput) => ({ ...value, targetVersion: { ...value.targetVersion, scoringConfig: {} } }), "targetVersion.scoringConfig"],
    ["source updated at", (value: PromotionInput) => ({ ...value, expected: { ...value.expected, sourceUpdatedAt: "2026-08-31T00:00:00.000Z" } }), "sourceCampaign.updatedAt"],
    ["submission count", (value: PromotionInput) => ({ ...value, expected: { ...value.expected, submissionCount: 11 } }), "sourceCampaign.submissionCount"],
  ];

  it.each(invariantCases)("rejects invariant drift in %s", (_name, mutate, field) => {
    expectInvariant(mutate, field);
  });

  it("requires the complete drain before apply", () => {
    const args = writeArgs("apply", QUIESCED_AT);
    expectInvariant(
      (value) => input({
        ...value,
        args,
        sourceCampaign: { ...value.sourceCampaign, status: "CLOSED", updatedAt: QUIESCED_AT },
        expected: { ...value.expected, sourceUpdatedAt: QUIESCED_AT.toISOString() },
        now: new Date("2026-08-31T01:19:59.999Z"),
      }),
      "sourceCampaign.updatedAt",
    );
    expect(buildPromotionPlan(input({
      args,
      sourceCampaign: { ...input().sourceCampaign, status: "CLOSED", updatedAt: QUIESCED_AT },
      expected: { sourceUpdatedAt: QUIESCED_AT.toISOString(), submissionCount: 12 },
    }))).toEqual({
      mode: "apply",
      sourceCas: {
        id: SOURCE_CAMPAIGN_ID,
        versionId: SOURCE_VERSION_ID,
        alias: LIVE_ALIAS,
        status: "CLOSED",
        deletedAt: null,
        updatedAt: QUIESCED_AT.toISOString(),
        submissionCount: 12,
      },
      successor: {
        id: "item7-sunhub-quick-quiz-v7-successor",
        templateId: "template-sunhub",
        versionId: TARGET_VERSION_ID,
        language: "en",
        alias: LIVE_ALIAS,
        name: "SunHub quick quiz",
        description: "Eight questions",
        status: "ACTIVE",
        accessMode: "PUBLIC",
        publicConfig: { landing: "sunhub" },
        openAt: new Date("2026-01-01T00:00:00.000Z"),
        endMode: "OPEN_END",
        closeAt: null,
        notifyAdminOnSubmit: true,
        sendResultsToRespondent: false,
        notifyCoachOnCompletion: false,
        showResultsOnScreen: true,
        reportStyle: "CLASSIC",
        reportStyleSource: "TEMPLATE_DEFAULT",
        reportStyleLockedAt: null,
        customSlides: [{ title: "Welcome" }],
        createdBy: "admin-1",
        createdByCoachId: null,
      },
      manifest: {
        schemaVersion: 1,
        operation: "sunhub-quick-quiz-successor-promotion",
        mode: "apply",
        source: { campaignId: SOURCE_CAMPAIGN_ID, templateId: "template-sunhub", versionId: SOURCE_VERSION_ID, alias: LIVE_ALIAS },
        target: { versionId: TARGET_VERSION_ID, templateId: "template-sunhub", language: "en" },
        successor: { id: "item7-sunhub-quick-quiz-v7-successor", alias: LIVE_ALIAS, versionId: TARGET_VERSION_ID, templateId: "template-sunhub" },
        expected: { sourceUpdatedAt: QUIESCED_AT.toISOString(), submissionCount: 12 },
        audit: {
          action: "PUBLIC_CAMPAIGN_SUCCESSOR_PROMOTION",
          payload: {
            schemaVersion: 1,
            source: {
              id: SOURCE_CAMPAIGN_ID,
              versionId: SOURCE_VERSION_ID,
              alias: LIVE_ALIAS,
              status: "CLOSED",
              deletedAt: null,
              updatedAt: QUIESCED_AT.toISOString(),
              submissionCount: 12,
            },
            targetVersionId: TARGET_VERSION_ID,
            successor: {
              id: "item7-sunhub-quick-quiz-v7-successor",
              templateId: "template-sunhub",
              versionId: TARGET_VERSION_ID,
              language: "en",
              alias: LIVE_ALIAS,
              name: "SunHub quick quiz",
              description: "Eight questions",
              status: "ACTIVE",
              accessMode: "PUBLIC",
              publicConfig: { landing: "sunhub" },
              openAt: new Date("2026-01-01T00:00:00.000Z"),
              endMode: "OPEN_END",
              closeAt: null,
              notifyAdminOnSubmit: true,
              sendResultsToRespondent: false,
              notifyCoachOnCompletion: false,
              showResultsOnScreen: true,
              reportStyle: "CLASSIC",
              reportStyleSource: "TEMPLATE_DEFAULT",
              reportStyleLockedAt: null,
              customSlides: [{ title: "Welcome" }],
              createdBy: "admin-1",
              createdByCoachId: null,
            },
            retiredAlias: RETIRED_ALIAS,
          },
        },
      },
    });
  });
});

type RunnerState = {
  source: Record<string, unknown>;
  successor: Record<string, unknown> | null;
  quiesceReceipts: Array<Record<string, unknown>>;
  promotionReceipts: Array<Record<string, unknown>>;
  retiredAliasOwnerId: string | null;
};

function applyInput(): PromotionInput {
  const args = writeArgs("apply", QUIESCED_AT);
  return input({
    args,
    sourceCampaign: { ...input().sourceCampaign, status: "CLOSED", updatedAt: QUIESCED_AT },
    expected: { sourceUpdatedAt: QUIESCED_AT.toISOString(), submissionCount: 12 },
    now: DRAINED_AT,
  });
}

function runnerState(value: PromotionInput = input()): RunnerState {
  const { submissionCount, ...source } = value.sourceCampaign;
  return {
    source: { ...source, _count: { submissions: submissionCount } },
    successor: null,
    quiesceReceipts: [],
    promotionReceipts: [],
    retiredAliasOwnerId: null,
  };
}

function auditReceipt(plan: ReturnType<typeof buildPromotionPlan>, operator = "operator@example.com") {
  return {
    entityType: "AssessmentCampaign",
    entityId: SOURCE_CAMPAIGN_ID,
    action: plan.manifest.audit.action,
    performedBy: operator,
    changes: JSON.stringify(plan.manifest.audit.payload),
  };
}

function persistedSuccessor(plan: ReturnType<typeof buildPromotionPlan>) {
  return {
    ...plan.successor,
    inviteTiming: "IMMEDIATELY",
    organizationId: null,
    externalId: null,
    invitedWelcomeSnapshot: null,
    invitationSubject: null,
    invitationBodyMarkdown: null,
    invitationBodyHtml: null,
    inviteSendStartedAt: null,
    inviteSendHeartbeatAt: null,
    invitesSentAt: null,
    importManifest: null,
    deletedAt: null,
    _count: {
      participants: 0,
      invitations: 0,
      submissions: 0,
      summaryReports: 0,
    },
  };
}

function runnerDb(state: RunnerState, value: PromotionInput = input()) {
  const findCampaign = async (args: { where: { id?: string; alias?: string } }) => {
    if (args.where.id === SOURCE_CAMPAIGN_ID) return state.source;
    if (args.where.id === "item7-sunhub-quick-quiz-v7-successor") return state.successor;
    if (args.where.alias === RETIRED_ALIAS) {
      return state.retiredAliasOwnerId ? { id: state.retiredAliasOwnerId } : null;
    }
    return null;
  };
  const findVersion = async (args: { where: { id: string } }) =>
    args.where.id === SOURCE_VERSION_ID ? value.sourceVersion : value.targetVersion;
  const findReceipts = async (args: { where: { action: string } }) =>
    args.where.action === "PUBLIC_CAMPAIGN_SUCCESSOR_QUIESCE"
      ? state.quiesceReceipts
      : state.promotionReceipts;

  const assessmentCampaignFindUnique = jest.fn(findCampaign);
  const assessmentCampaignUpdateMany = jest.fn().mockResolvedValue({ count: 1 });
  const assessmentCampaignCreate = jest.fn().mockResolvedValue({ id: "item7-sunhub-quick-quiz-v7-successor" });
  const auditLogFindMany = jest.fn(findReceipts);
  const auditLogCreate = jest.fn().mockResolvedValue({});
  const executeRaw = jest.fn().mockResolvedValue(1);
  const tx = {
    assessmentCampaign: {
      findUnique: assessmentCampaignFindUnique,
      updateMany: assessmentCampaignUpdateMany,
      create: assessmentCampaignCreate,
    },
    assessmentTemplate: {
      findUnique: jest.fn().mockResolvedValue(value.template),
    },
    assessmentTemplateVersion: {
      findUnique: jest.fn(findVersion),
      findFirst: jest.fn().mockResolvedValue({ id: value.latestPublishedVersionId }),
    },
    auditLog: {
      findMany: auditLogFindMany,
      create: auditLogCreate,
    },
    $executeRaw: executeRaw,
  };
  const transaction = jest.fn(async (
    callback: (client: typeof tx) => unknown,
    options?: { isolationLevel: "Serializable" },
  ) => {
    void options;
    return callback(tx);
  });
  const rootWriteForbidden = jest.fn(async () => {
    throw new Error("root write forbidden: transaction-bound write required");
  });
  const root = {
    assessmentCampaign: {
      findUnique: jest.fn(findCampaign),
      updateMany: rootWriteForbidden,
      create: rootWriteForbidden,
    },
    assessmentTemplate: {
      findUnique: jest.fn().mockResolvedValue(value.template),
    },
    assessmentTemplateVersion: {
      findUnique: jest.fn(findVersion),
      findFirst: jest.fn().mockResolvedValue({ id: value.latestPublishedVersionId }),
    },
    auditLog: {
      findMany: jest.fn(findReceipts),
      create: rootWriteForbidden,
    },
    $executeRaw: rootWriteForbidden,
    $transaction: transaction,
  };
  return {
    db: root as unknown as DbClient,
    root,
    tx,
    transaction,
  };
}

describe("promote SunHub quick quiz runner", () => {
  it("loads the dry-run snapshot through read-only queries", async () => {
    const args = parsePromotionArgs([]);
    const value = input({ args });
    const state = runnerState(value);
    const { db, root, tx, transaction } = runnerDb(state, value);

    await expect(loadPromotionInput(db, {
      args,
      now: value.now,
    })).resolves.toEqual(value);

    expect(transaction).not.toHaveBeenCalled();
    expect(root.assessmentCampaign.updateMany).not.toHaveBeenCalled();
    expect(root.assessmentCampaign.create).not.toHaveBeenCalled();
    expect(root.auditLog.create).not.toHaveBeenCalled();
    expect(root.$executeRaw).not.toHaveBeenCalled();
    expect(tx.assessmentCampaign.updateMany).not.toHaveBeenCalled();
    expect(tx.assessmentCampaign.create).not.toHaveBeenCalled();
    expect(tx.auditLog.create).not.toHaveBeenCalled();
    expect(tx.$executeRaw).not.toHaveBeenCalled();
  });

  it("quiesces ACTIVE to CLOSED with one exact CAS and an atomic receipt while retaining the live alias", async () => {
    const value = input();
    const plan = buildPromotionPlan(value);
    const { db, root, tx, transaction } = runnerDb(runnerState(value), value);

    await expect(quiescePromotion(db, plan, "operator@example.com")).resolves.toEqual({
      status: "quiesced",
    });

    expect(transaction).toHaveBeenCalledTimes(1);
    expect(tx.assessmentCampaign.updateMany).toHaveBeenCalledTimes(1);
    expect(tx.assessmentCampaign.updateMany).toHaveBeenCalledWith({
      where: {
        id: SOURCE_CAMPAIGN_ID,
        versionId: SOURCE_VERSION_ID,
        alias: LIVE_ALIAS,
        status: "ACTIVE",
        deletedAt: null,
        updatedAt: SOURCE_UPDATED_AT,
      },
      data: { status: "CLOSED" },
    });
    expect(tx.auditLog.create).toHaveBeenCalledWith({ data: auditReceipt(plan) });
    expect(tx.assessmentCampaign.create).not.toHaveBeenCalled();
    expect(tx.$executeRaw).not.toHaveBeenCalled();
    expect(root.assessmentCampaign.updateMany).not.toHaveBeenCalled();
    expect(root.assessmentCampaign.create).not.toHaveBeenCalled();
    expect(root.auditLog.create).not.toHaveBeenCalled();
    expect(root.$executeRaw).not.toHaveBeenCalled();
  });

  it("aborts quiescence when its exact CAS matches zero rows", async () => {
    const value = input();
    const plan = buildPromotionPlan(value);
    const { db, tx } = runnerDb(runnerState(value), value);
    tx.assessmentCampaign.updateMany.mockResolvedValueOnce({ count: 0 });

    await expect(quiescePromotion(db, plan, "operator@example.com")).rejects.toThrow("CAS");
    expect(tx.auditLog.create).not.toHaveBeenCalled();
  });

  it("applies in one Serializable transaction with a count-protected source CAS, allow-listed successor, and receipt", async () => {
    const value = applyInput();
    const plan = buildPromotionPlan(value);
    const { db, root, tx, transaction } = runnerDb(runnerState(value), value);

    await expect(applyPromotion(db, plan, "operator@example.com")).resolves.toEqual({
      status: "applied",
      successorCampaignId: "item7-sunhub-quick-quiz-v7-successor",
    });

    expect(transaction).toHaveBeenCalledTimes(1);
    expect(transaction.mock.calls[0][1]).toEqual({ isolationLevel: "Serializable" });
    expect(tx.assessmentCampaign.findUnique).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: SOURCE_CAMPAIGN_ID },
    }));
    expect(tx.assessmentTemplate.findUnique).toHaveBeenCalled();
    expect(tx.assessmentTemplateVersion.findUnique).toHaveBeenCalledTimes(2);
    expect(tx.assessmentTemplateVersion.findFirst).toHaveBeenCalled();

    expect(tx.$executeRaw).toHaveBeenCalledTimes(1);
    const [sqlParts, ...casValues] = tx.$executeRaw.mock.calls[0];
    expect(Array.from(sqlParts).join("?")).toContain("COUNT(*)");
    expect(casValues).toEqual([
      RETIRED_ALIAS,
      SOURCE_CAMPAIGN_ID,
      SOURCE_VERSION_ID,
      LIVE_ALIAS,
      "CLOSED",
      QUIESCED_AT,
      12,
    ]);
    expect(tx.assessmentCampaign.create).toHaveBeenCalledWith({ data: plan.successor });
    expect(tx.auditLog.create).toHaveBeenCalledWith({ data: auditReceipt(plan) });
    expect(root.assessmentCampaign.updateMany).not.toHaveBeenCalled();
    expect(root.assessmentCampaign.create).not.toHaveBeenCalled();
    expect(root.auditLog.create).not.toHaveBeenCalled();
    expect(root.$executeRaw).not.toHaveBeenCalled();
  });

  it("revalidates planner invariants inside apply and writes nothing on drift", async () => {
    const value = applyInput();
    const plan = buildPromotionPlan(value);
    const drifted = { ...value, targetVersion: { ...value.targetVersion, scoringConfig: {} } };
    const { db, tx } = runnerDb(runnerState(value), drifted);

    await expect(applyPromotion(db, plan, "operator@example.com")).rejects.toMatchObject({
      field: "targetVersion.scoringConfig",
    });
    expect(tx.$executeRaw).not.toHaveBeenCalled();
    expect(tx.assessmentCampaign.create).not.toHaveBeenCalled();
    expect(tx.auditLog.create).not.toHaveBeenCalled();
  });

  it("aborts apply when the source alias/count CAS matches zero rows", async () => {
    const value = applyInput();
    const plan = buildPromotionPlan(value);
    const { db, tx } = runnerDb(runnerState(value), value);
    tx.$executeRaw.mockResolvedValueOnce(0);

    await expect(applyPromotion(db, plan, "operator@example.com")).rejects.toThrow("CAS");
    expect(tx.assessmentCampaign.create).not.toHaveBeenCalled();
    expect(tx.auditLog.create).not.toHaveBeenCalled();
  });

  it("returns idempotent for a complete deterministic apply manifest without writes", async () => {
    const value = applyInput();
    const plan = buildPromotionPlan(value);
    const state = runnerState(value);
    state.source = {
      ...state.source,
      alias: RETIRED_ALIAS,
      status: "CLOSED",
      updatedAt: DRAINED_AT,
    };
    state.successor = persistedSuccessor(plan);
    state.retiredAliasOwnerId = SOURCE_CAMPAIGN_ID;
    state.promotionReceipts = [auditReceipt(plan)];
    const { db, tx } = runnerDb(state, value);

    await expect(applyPromotion(db, plan, "retry@example.com")).resolves.toEqual({
      status: "idempotent",
      successorCampaignId: "item7-sunhub-quick-quiz-v7-successor",
    });
    expect(tx.$executeRaw).not.toHaveBeenCalled();
    expect(tx.assessmentCampaign.create).not.toHaveBeenCalled();
    expect(tx.auditLog.create).not.toHaveBeenCalled();
  });

  it.each([
    ["missing receipt", (state: RunnerState) => {
      state.promotionReceipts = [];
    }],
    ["conflicting receipt", (state: RunnerState, plan: ReturnType<typeof buildPromotionPlan>) => {
      state.promotionReceipts = [{ ...auditReceipt(plan), changes: "{}" }];
    }],
    ["conflicting successor", (state: RunnerState) => {
      state.successor = { ...state.successor, versionId: SOURCE_VERSION_ID };
    }],
    ["non-empty successor relations", (state: RunnerState) => {
      state.successor = { ...state.successor, _count: { participants: 0, invitations: 0, submissions: 1, summaryReports: 0 } };
    }],
    ["non-default successor invite timing", (state: RunnerState) => {
      state.successor = { ...state.successor, inviteTiming: "ON_OPEN" };
    }],
  ])("rejects partial or conflicting idempotency state: %s", async (_name, mutate) => {
    const value = applyInput();
    const plan = buildPromotionPlan(value);
    const state = runnerState(value);
    state.source = { ...state.source, alias: RETIRED_ALIAS, status: "CLOSED", updatedAt: DRAINED_AT };
    state.successor = persistedSuccessor(plan);
    state.retiredAliasOwnerId = SOURCE_CAMPAIGN_ID;
    state.promotionReceipts = [auditReceipt(plan)];
    mutate(state, plan);
    const { db, tx } = runnerDb(state, value);

    await expect(applyPromotion(db, plan, "operator@example.com")).rejects.toThrow("idempotency");
    expect(tx.$executeRaw).not.toHaveBeenCalled();
    expect(tx.assessmentCampaign.create).not.toHaveBeenCalled();
    expect(tx.auditLog.create).not.toHaveBeenCalled();
  });

  it("returns idempotent for a complete quiescence receipt without changing the live alias", async () => {
    const value = input();
    const plan = buildPromotionPlan(value);
    const state = runnerState(value);
    state.source = { ...state.source, status: "CLOSED", updatedAt: QUIESCED_AT };
    state.quiesceReceipts = [auditReceipt(plan)];
    const { db, tx } = runnerDb(state, value);

    await expect(quiescePromotion(db, plan, "retry@example.com")).resolves.toEqual({
      status: "idempotent",
    });
    expect(tx.assessmentCampaign.updateMany).not.toHaveBeenCalled();
    expect(tx.auditLog.create).not.toHaveBeenCalled();
  });

  it.each([
    ["quiesce", (db: DbClient, plan: ReturnType<typeof buildPromotionPlan>, operator: string) =>
      quiescePromotion(db, plan, operator), input()],
    ["apply", (db: DbClient, plan: ReturnType<typeof buildPromotionPlan>, operator: string) =>
      applyPromotion(db, plan, operator), applyInput()],
  ])("rejects an empty %s operator before opening a transaction", async (_name, run, value) => {
    const plan = buildPromotionPlan(value);
    const { db, root, tx, transaction } = runnerDb(runnerState(value), value);

    await expect(run(db, plan, "  \t ")).rejects.toThrow("operator");
    expect(transaction).not.toHaveBeenCalled();
    expect(root.assessmentCampaign.updateMany).not.toHaveBeenCalled();
    expect(root.assessmentCampaign.create).not.toHaveBeenCalled();
    expect(root.auditLog.create).not.toHaveBeenCalled();
    expect(root.$executeRaw).not.toHaveBeenCalled();
    expect(tx.assessmentCampaign.updateMany).not.toHaveBeenCalled();
    expect(tx.assessmentCampaign.create).not.toHaveBeenCalled();
    expect(tx.auditLog.create).not.toHaveBeenCalled();
    expect(tx.$executeRaw).not.toHaveBeenCalled();
  });
});

describe("promote SunHub quick quiz CLI policy", () => {
  function shellArguments(command: string): string[] {
    const output = execFileSync("/bin/sh", ["-c", `set -- ${command}; for value do printf '%s\\n' "$value"; done`], {
      encoding: "utf8",
    });
    return output.trimEnd().split("\n");
  }

  function cliDependencies(db: DbClient, now = DRAINED_AT) {
    const lines: string[] = [];
    return {
      lines,
      dependencies: {
        createDb: () => db,
        databaseUrl: "postgresql://operator:password@db.production.internal:5432/platform",
        now: () => now,
        write: (line: string) => lines.push(line),
      },
    };
  }

  it("defaults to a read-only dry-run and never reaches a write seam", async () => {
    const value = input({ args: parsePromotionArgs([]) });
    const { db, root, tx, transaction } = runnerDb(runnerState(value), value);
    const { dependencies, lines } = cliDependencies(db);

    await expect(runPromotionCli([], dependencies)).resolves.toEqual({ state: "ready-to-quiesce" });

    expect(lines.join("\n")).toContain("--dry-run --operator '<REQUIRED_NONBLANK_OPERATOR_IDENTITY>'");
    expect(transaction).not.toHaveBeenCalled();
    expect(root.assessmentCampaign.updateMany).not.toHaveBeenCalled();
    expect(root.assessmentCampaign.create).not.toHaveBeenCalled();
    expect(root.auditLog.create).not.toHaveBeenCalled();
    expect(root.$executeRaw).not.toHaveBeenCalled();
    expect(tx.assessmentCampaign.updateMany).not.toHaveBeenCalled();
    expect(tx.assessmentCampaign.create).not.toHaveBeenCalled();
    expect(tx.auditLog.create).not.toHaveBeenCalled();
    expect(tx.$executeRaw).not.toHaveBeenCalled();
  });

  it("rejects a write before connecting unless every exact CAS argument is supplied", async () => {
    const { db } = runnerDb(runnerState());
    const createDb = jest.fn(() => db);

    await expect(runPromotionCli(["--quiesce"], {
      createDb,
      databaseUrl: "postgresql://operator:password@db.production.internal:5432/platform",
    })).rejects.toThrow("expect-database-host");
    expect(createDb).not.toHaveBeenCalled();
  });

  it("blocks every write without the unconditional acknowledgement", async () => {
    const value = input();
    const { db, transaction } = runnerDb(runnerState(value), value);
    const args = [
      "--quiesce",
      "--expect-database-host", "db.production.internal",
      "--expect-source-updated-at", SOURCE_UPDATED_AT.toISOString(),
      "--expect-submissions", "12",
      "--operator", "operator@example.com",
    ];

    await expect(runPromotionCli(args, cliDependencies(db).dependencies)).rejects.toThrow("i-know-this-is-prod");
    expect(transaction).not.toHaveBeenCalled();
  });

  it("requires a nonblank operator identity before constructing a write client", async () => {
    const { db } = runnerDb(runnerState());
    const createDb = jest.fn(() => db);

    await expect(runPromotionCli([
      "--quiesce", "--i-know-this-is-prod",
      "--expect-database-host", "db.production.internal",
      "--expect-source-updated-at", SOURCE_UPDATED_AT.toISOString(),
      "--expect-submissions", "12",
      "--operator", "   ",
    ], {
      createDb,
      databaseUrl: "postgresql://operator:password@db.production.internal:5432/platform",
    })).rejects.toThrow("operator");
    expect(createDb).not.toHaveBeenCalled();
  });

  it("blocks a write when the expected host differs from DATABASE_URL regardless of provider", async () => {
    const value = input();
    const { db, transaction } = runnerDb(runnerState(value), value);

    await expect(runPromotionCli([
      "--quiesce", "--i-know-this-is-prod",
      "--expect-database-host", "db.production.internal",
      "--expect-source-updated-at", SOURCE_UPDATED_AT.toISOString(),
      "--expect-submissions", "12",
      "--operator", "operator@example.com",
    ], {
      ...cliDependencies(db).dependencies,
      databaseUrl: "postgresql://operator:password@another-provider.example:5432/platform",
    })).rejects.toThrow("expect-database-host");
    expect(transaction).not.toHaveBeenCalled();
  });

  it("prints a shell-safe read-only rerun, not a write command, without an operator", () => {
    const plan = buildPromotionPlan(input({ args: parsePromotionArgs([]) }));
    const output = formatPromotionOutcome(plan, "db.production.internal", DRAINED_AT).join("\n");

    expect(output).not.toContain("--quiesce");
    expect(output).not.toContain("--i-know-this-is-prod");
    expect(output).toContain("--dry-run --operator '<REQUIRED_NONBLANK_OPERATOR_IDENTITY>'");
    expect(shellArguments(output.split("\n").at(-1) ?? "")).toEqual([
      "npx", "tsx", "scripts/promote-sunhub-quick-quiz.ts", "--dry-run", "--operator", "<REQUIRED_NONBLANK_OPERATOR_IDENTITY>",
    ]);
  });

  it("prints a wait without an apply command until CLOSED has drained for 15 minutes", () => {
    const value = input({
      args: parsePromotionArgs([]),
      sourceCampaign: { ...input().sourceCampaign, status: "CLOSED", updatedAt: QUIESCED_AT },
      expected: { sourceUpdatedAt: QUIESCED_AT.toISOString(), submissionCount: 12 },
    });
    const plan = buildPromotionPlan(value);
    const output = formatPromotionOutcome(plan, "db.production.internal", new Date("2026-08-31T01:19:59.999Z")).join("\n");

    expect(output).toContain("Wait");
    expect(output).not.toContain("--apply");
  });

  it("quotes every dynamic write argument through /bin/sh without executing payload", () => {
    const value = input({
      args: parsePromotionArgs([]),
      sourceCampaign: { ...input().sourceCampaign, status: "CLOSED", updatedAt: QUIESCED_AT },
      expected: { sourceUpdatedAt: QUIESCED_AT.toISOString(), submissionCount: 12 },
    });
    const plan = buildPromotionPlan(value);
    const adversarialPlan = {
      ...plan,
      sourceCas: {
        ...plan.sourceCas,
        updatedAt: "2026-08-31T01:05:00.000Z;$(not-executed)",
        submissionCount: 12 as number,
      },
    };
    const command = formatPromotionOutcome(
      adversarialPlan,
      "db.example.test;$(not-executed)",
      DRAINED_AT,
      "O'Malley; $(not-executed) spaced",
    ).at(-1) ?? "";

    expect(shellArguments(command)).toEqual([
      "npx", "tsx", "scripts/promote-sunhub-quick-quiz.ts", "--apply", "--i-know-this-is-prod",
      "--expect-database-host", "db.example.test;$(not-executed)",
      "--expect-source-updated-at", "2026-08-31T01:05:00.000Z;$(not-executed)",
      "--expect-submissions", "12",
      "--operator", "O'Malley; $(not-executed) spaced",
    ]);
  });

  it.each([
    "postgresql://operator:password@db.production.internal:5432/platform",
    "postgres://operator:password@db-2.production.internal/platform",
  ])("accepts a conservative PostgreSQL hostname: %s", (url) => {
    expect(databaseHostFromUrl(url)).toMatch(/^[a-z0-9.-]+$/);
  });

  it.each([
    "postgresql://operator:password@db$(bad).example/platform",
    "postgresql://operator:password@db;bad.example/platform",
    "postgresql://operator:password@db bad.example/platform",
    "postgresql://operator:password@db..bad.example/platform",
    "postgresql://operator:password@-db.example/platform",
    "postgresql://operator:password@db-.example/platform",
  ])("rejects a non-DNS DATABASE_URL hostname before client construction: %s", async (url) => {
    const createDb = jest.fn();
    await expect(runPromotionCli([], { createDb, databaseUrl: url })).rejects.toThrow("hostname");
    expect(createDb).not.toHaveBeenCalled();
  });

  it("reports only the exact retired source and active successor state as complete", async () => {
    const value = applyInput();
    const plan = buildPromotionPlan(value);
    const state = runnerState(value);
    state.source = { ...state.source, alias: RETIRED_ALIAS, status: "CLOSED" };
    state.successor = persistedSuccessor(plan);
    state.retiredAliasOwnerId = SOURCE_CAMPAIGN_ID;
    state.promotionReceipts = [auditReceipt(plan)];
    const { db, transaction } = runnerDb(state, value);
    const { dependencies, lines } = cliDependencies(db);

    await expect(runPromotionCli([], dependencies)).resolves.toEqual({ state: "complete" });
    expect(lines.join("\n")).toContain("promotion is complete");
    expect(lines.join("\n")).toContain(SUCCESSOR_CAMPAIGN_ID);
    expect(transaction).not.toHaveBeenCalled();
  });

  it.each([
    ["missing receipt", (state: RunnerState) => { state.promotionReceipts = []; }],
    ["non-default invite timing", (state: RunnerState) => { state.successor = { ...state.successor, inviteTiming: "ON_OPEN" }; }],
    ["non-zero successor relation", (state: RunnerState) => { state.successor = { ...state.successor, _count: { participants: 0, invitations: 0, submissions: 1, summaryReports: 0 } }; }],
    ["source field drift", (state: RunnerState) => { state.source = { ...state.source, name: "drift" }; }],
    ["successor field drift", (state: RunnerState) => { state.successor = { ...state.successor, versionId: SOURCE_VERSION_ID }; }],
  ])("does not report a partial completed promotion: %s", async (_name, mutate) => {
    const value = applyInput();
    const plan = buildPromotionPlan(value);
    const state = runnerState(value);
    state.source = { ...state.source, alias: RETIRED_ALIAS, status: "CLOSED" };
    state.successor = persistedSuccessor(plan);
    state.retiredAliasOwnerId = SOURCE_CAMPAIGN_ID;
    state.promotionReceipts = [auditReceipt(plan)];
    mutate(state);
    const { db } = runnerDb(state, value);
    const loaded = await loadPromotionInput(db, { args: parsePromotionArgs([]) });

    await expect(inspectCompletedPromotion(db, loaded)).rejects.toThrow("idempotency.apply");
  });
});
