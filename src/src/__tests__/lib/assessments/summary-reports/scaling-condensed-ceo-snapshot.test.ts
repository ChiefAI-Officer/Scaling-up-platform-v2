import { completeSuFullLandscapeReport } from "@/__tests__/fixtures/su-full-landscape";
import type { ApiActor } from "@/lib/auth/access-control";
import { getScalingCondensedCeoSnapshot } from "@/lib/assessments/summary-reports/scaling-condensed-ceo-snapshot";
import { buildTemplateContent } from "../../../../../prisma/seed-scaling-up-full-assessment";

const mockCanViewGroupReport = jest.fn();

jest.mock("@/lib/assessments/access-control", () => ({
  ...jest.requireActual("@/lib/assessments/access-control"),
  canViewGroupReport: (...args: unknown[]) => mockCanViewGroupReport(...args),
}));

const actor: ApiActor = {
  userId: "coach-user",
  email: "coach@example.com",
  role: "COACH",
  coachId: "coach-1",
};
const generatedAt = new Date("2026-08-30T00:00:00.000Z");
const enabledEnv = { SUMMARY_REPORTING_ENABLED: "1" } as NodeJS.ProcessEnv;

function snapshotDb() {
  const content = buildTemplateContent();
  const report = completeSuFullLandscapeReport();
  const campaign = {
    id: "campaign-1",
    name: "Annual Scaling Up",
    accessMode: "INVITED",
    organizationId: "org-1",
    templateId: "template-1",
    versionId: "version-1",
    language: "en",
    reportStyle: "CLASSIC",
    importManifest: null,
    organization: { id: "org-1", name: "Acme" },
    template: { id: "template-1", name: "Scaling Up Full", alias: "scaling-up-full" },
    version: {
      id: "version-1",
      templateId: "template-1",
      versionNumber: 6,
      language: "en",
      publishedAt: new Date("2026-08-01T00:00:00.000Z"),
      contentHash: "version-hash",
      reportConfig: null,
      sections: content.sections,
      questions: content.questions,
      scoringConfig: content.scoringConfig,
    },
    creatorCoach: {
      profileImage: "https://example.com/coach.png",
      firstName: "Casey",
      lastName: "Coach",
    },
  };
  const participant = {
    id: "participant-ceo",
    campaignId: "campaign-1",
    respondentId: "respondent-ceo",
    isCEO: true,
  };
  const submission = {
    id: "submission-ceo",
    campaignId: "campaign-1",
    respondentId: "respondent-ceo",
    submittedAt: report.submittedAt,
    answers: report.rawAnswers,
    result: report.result,
    respondent: {
      id: "respondent-ceo",
      firstName: "Ari",
      lastName: "Founder",
      email: "ari@example.com",
      jobTitle: "CEO",
      deletedAt: null,
    },
    invitation: {
      campaignId: "campaign-1",
      respondentId: "respondent-ceo",
      status: "SUBMITTED",
      revokedAt: null,
    },
  };
  const assessmentCampaign = { findFirst: jest.fn().mockResolvedValue(campaign) };
  const assessmentCampaignParticipant = { findFirst: jest.fn().mockResolvedValue(participant) };
  const assessmentSubmission = { findFirst: jest.fn().mockResolvedValue(submission) };
  const tx = {
    assessmentCampaign,
    assessmentCampaignParticipant,
    assessmentSubmission,
  };
  const db = {
    $transaction: jest.fn(async (callback: (value: typeof tx) => unknown) => callback(tx)),
  };
  return { db, tx, campaign, participant, submission };
}

beforeEach(() => {
  mockCanViewGroupReport.mockReset().mockResolvedValue(true);
});

test("resolves and freezes only the current campaign CEO", async () => {
  const test = snapshotDb();

  const result = await getScalingCondensedCeoSnapshot(
    test.db,
    actor,
    "campaign-1",
    generatedAt,
    enabledEnv,
  );

  expect(result.kind).toBe("ok");
  if (result.kind !== "ok") throw new Error("Expected CEO snapshot");
  expect(result.snapshot.model.groups.flatMap((group) => group.questions)).toHaveLength(61);
  expect(result.snapshot).toMatchObject({
    schemaVersion: 1,
    reportType: "SCALING_CONDENSED_CEO",
    generatedAt: generatedAt.toISOString(),
    destination: {
      campaignId: "campaign-1",
      campaignName: "Annual Scaling Up",
      assessmentName: "Scaling Up Full",
      companyName: "Acme",
      versionId: "version-1",
      versionLabel: "Version 6",
    },
    source: {
      participantId: "participant-ceo",
      submissionId: "submission-ceo",
      respondentName: "Ari Founder",
      submittedAt: test.submission.submittedAt.toISOString(),
    },
    provenance: {
      coachLogoUrl: "https://example.com/coach.png",
      coachName: "Casey Coach",
      versionContentHash: "version-hash",
      peer: result.snapshot.model.peerProvenance,
    },
  });
  expect(test.tx.assessmentCampaignParticipant.findFirst).toHaveBeenCalledWith(
    expect.objectContaining({ where: { campaignId: "campaign-1", isCEO: true } }),
  );
  expect(test.tx.assessmentSubmission.findFirst).toHaveBeenCalledWith(
    expect.objectContaining({
      where: expect.objectContaining({
        campaignId: "campaign-1",
        respondentId: "respondent-ceo",
      }),
    }),
  );
  expect(test.tx.assessmentSubmission).not.toHaveProperty("findMany");
  expect(test.db.$transaction).toHaveBeenCalledWith(
    expect.any(Function),
    {
      isolationLevel: "RepeatableRead",
      maxWait: 10_000,
      timeout: 15_000,
    },
  );
});

test.each([
  ["disabled", {}],
  ["killed", { SUMMARY_REPORTING_ENABLED: "1", SUMMARY_REPORTING_KILL: "1" }],
] as const)("stays dark when summary reporting is %s", async (_case, env) => {
  const test = snapshotDb();
  await expect(getScalingCondensedCeoSnapshot(test.db, actor, "campaign-1", generatedAt, env))
    .resolves.toEqual({ kind: "not-found" });
  expect(test.db.$transaction).not.toHaveBeenCalled();
});

test("stays dark when group-report authorization fails", async () => {
  const test = snapshotDb();
  mockCanViewGroupReport.mockResolvedValue(false);
  await expect(getScalingCondensedCeoSnapshot(test.db, actor, "campaign-1", generatedAt, enabledEnv))
    .resolves.toEqual({ kind: "not-found" });
  expect(test.tx.assessmentCampaignParticipant.findFirst).not.toHaveBeenCalled();
});

test.each([
  ["public", (test: ReturnType<typeof snapshotDb>) => { test.campaign.accessMode = "PUBLIC"; }],
  ["unsupported-template", (test: ReturnType<typeof snapshotDb>) => { test.campaign.template.alias = "other"; }],
  ["unpublished", (test: ReturnType<typeof snapshotDb>) => { test.campaign.version.publishedAt = null; }],
] as const)("returns a clean %s non-applicable result", async (reason, mutate) => {
  const test = snapshotDb();
  mutate(test);
  await expect(getScalingCondensedCeoSnapshot(test.db, actor, "campaign-1", generatedAt, enabledEnv))
    .resolves.toEqual({ kind: "not-applicable", reason });
  expect(test.tx.assessmentCampaignParticipant.findFirst).not.toHaveBeenCalled();
});

test("returns no-ceo without querying submissions", async () => {
  const test = snapshotDb();
  test.tx.assessmentCampaignParticipant.findFirst.mockResolvedValue(null);
  await expect(getScalingCondensedCeoSnapshot(test.db, actor, "campaign-1", generatedAt, enabledEnv))
    .resolves.toEqual({ kind: "unavailable", reason: "no-ceo" });
  expect(test.tx.assessmentSubmission.findFirst).not.toHaveBeenCalled();
});

test("returns ceo-not-submitted for a missing completed CEO row", async () => {
  const test = snapshotDb();
  test.tx.assessmentSubmission.findFirst.mockResolvedValue(null);
  await expect(getScalingCondensedCeoSnapshot(test.db, actor, "campaign-1", generatedAt, enabledEnv))
    .resolves.toEqual({ kind: "unavailable", reason: "ceo-not-submitted" });
});

test("returns source-incomplete rather than recomputing a missing score", async () => {
  const test = snapshotDb();
  test.submission.result.perQuestion.pop();
  await expect(getScalingCondensedCeoSnapshot(test.db, actor, "campaign-1", generatedAt, enabledEnv))
    .resolves.toEqual({ kind: "unavailable", reason: "source-incomplete" });
});
