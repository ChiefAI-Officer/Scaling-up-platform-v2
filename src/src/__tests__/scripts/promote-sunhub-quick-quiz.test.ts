import {
  LIVE_ALIAS,
  PromotionInvariantError,
  RETIRED_ALIAS,
  SOURCE_CAMPAIGN_ID,
  SOURCE_VERSION_ID,
  TARGET_VERSION_ID,
  buildPromotionPlan,
  parsePromotionArgs,
  validateWriteAuthorization,
  type PromotionInput,
} from "@/lib/scripts/promote-sunhub-quick-quiz-core";

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
    expect(() => parsePromotionArgs(["--quiesce", "--expect-database-host", "db", "--expect-source-updated-at", SOURCE_UPDATED_AT.toISOString(), "--expect-submissions", "1.5"])).toThrow("expect-submissions");
  });

  it("builds the deterministic quiesce manifest and allow-listed successor fields", () => {
    const plan = buildPromotionPlan(input());

    expect(RETIRED_ALIAS).toBe("sunhub-quick-quiz-retired-v1");
    expect(plan.manifest).toMatchObject({
      schemaVersion: 1,
      source: { campaignId: SOURCE_CAMPAIGN_ID, versionId: SOURCE_VERSION_ID, alias: LIVE_ALIAS },
      target: { versionId: TARGET_VERSION_ID },
      successor: {
        id: "item7-sunhub-quick-quiz-v7-successor",
        alias: LIVE_ALIAS,
        versionId: TARGET_VERSION_ID,
      },
      expected: { sourceUpdatedAt: SOURCE_UPDATED_AT.toISOString(), submissionCount: 12 },
      audit: { action: "PUBLIC_CAMPAIGN_SUCCESSOR_QUIESCE" },
    });
    expect(plan.successor).toMatchObject({
      templateId: "template-sunhub",
      language: "en",
      name: "SunHub quick quiz",
      customSlides: [{ title: "Welcome" }],
    });
    expect(plan.sourceCas).toEqual({
      id: SOURCE_CAMPAIGN_ID,
      versionId: SOURCE_VERSION_ID,
      alias: LIVE_ALIAS,
      status: "ACTIVE",
      deletedAt: null,
      updatedAt: SOURCE_UPDATED_AT.toISOString(),
      submissionCount: 12,
    });
  });

  it("requires an explicit acknowledgement and exact connected host for writes", () => {
    const args = writeArgs();
    expect(() => validateWriteAuthorization({ ...args, hasProductionAcknowledgement: false }, "db.production.internal")).toThrow("i-know-this-is-prod");
    expect(() => validateWriteAuthorization(args, "localhost")).toThrow("expect-database-host");
    expect(() => validateWriteAuthorization(args, "db.production.internal")).not.toThrow();
  });

  it.each([
    ["source campaign id", (value: PromotionInput) => ({ ...value, sourceCampaign: { ...value.sourceCampaign, id: "wrong" } }), "sourceCampaign.id"],
    ["source version id", (value: PromotionInput) => ({ ...value, sourceCampaign: { ...value.sourceCampaign, versionId: "wrong" } }), "sourceCampaign.versionId"],
    ["template relationship", (value: PromotionInput) => ({ ...value, sourceVersion: { ...value.sourceVersion, templateId: "wrong" } }), "sourceVersion.templateId"],
    ["language", (value: PromotionInput) => ({ ...value, targetVersion: { ...value.targetVersion, language: "fr" } }), "targetVersion.language"],
    ["source status", (value: PromotionInput) => ({ ...value, sourceCampaign: { ...value.sourceCampaign, status: "CLOSED" } }), "sourceCampaign.status"],
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
  ])("rejects invariant drift in %s", (_name, mutate, field) => {
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
    }))).toMatchObject({
      manifest: { audit: { action: "PUBLIC_CAMPAIGN_SUCCESSOR_PROMOTION" } },
    });
  });
});
