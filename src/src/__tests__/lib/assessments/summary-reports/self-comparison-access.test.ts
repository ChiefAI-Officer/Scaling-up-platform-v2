import { canViewGroupReport } from "@/lib/assessments/access-control";
import { listSummarySelfComparisonCandidates, loadSummarySelfComparison } from "@/lib/assessments/report-comparison";
import {
  listAuthorizedSelfComparisonCandidates,
  loadAuthorizedSelfComparison,
} from "@/lib/assessments/summary-reports/self-comparison-access";

jest.mock("@/lib/assessments/access-control", () => ({
  asAccessDb: (value: unknown) => value,
  canViewGroupReport: jest.fn(),
}));
jest.mock("@/lib/assessments/report-comparison", () => ({
  asReportComparisonDb: (value: unknown) => value,
  listSummarySelfComparisonCandidates: jest.fn(),
  loadSummarySelfComparison: jest.fn(),
}));

const actor = { userId: "user-1", email: "coach@example.com", role: "COACH" as const, coachId: "coach-1" };
const input = { destinationCampaignId: "focus-campaign", focusSubmissionId: "focus-submission" };

function db(isCeo = true) {
  return {
    assessmentCampaign: { findFirst: jest.fn(async () => ({
      id: "focus-campaign", name: "Focus", accessMode: "INVITED", template: { alias: "scaling-up-full", name: "Scaling Up Full" }, version: { publishedAt: new Date() },
    })) },
    assessmentSubmission: { findFirst: jest.fn(async () => ({ id: "focus-submission", campaignId: "focus-campaign", respondentId: "person-1", submittedAt: new Date() })) },
    assessmentCampaignParticipant: { findFirst: jest.fn(async () => isCeo ? ({ id: "participant-1" }) : null) },
  };
}

beforeEach(() => {
  process.env.SUMMARY_REPORTING_ENABLED = "1";
  delete process.env.SUMMARY_REPORTING_KILL;
  jest.mocked(canViewGroupReport).mockResolvedValue(true);
  jest.mocked(listSummarySelfComparisonCandidates).mockReset();
  jest.mocked(loadSummarySelfComparison).mockReset();
});

afterEach(() => delete process.env.SUMMARY_REPORTING_ENABLED);

test("authorizes the Coach's designated CEO Focus without reloading discovery candidates", async () => {
  jest.mocked(listSummarySelfComparisonCandidates).mockResolvedValue({ kind: "ok", candidates: [
    { submissionId: "earlier-good", campaignId: "c1", campaignLabel: "Earlier", submittedAt: new Date(), versionId: "v1", versionNumber: 1, isImported: false },
  ], bounded: false });

  await expect(listAuthorizedSelfComparisonCandidates(db(), actor, input)).resolves.toMatchObject({
    kind: "ok", focus: { respondentId: "person-1" }, candidates: [{ submissionId: "earlier-good" }],
  });
  expect(loadSummarySelfComparison).not.toHaveBeenCalled();
});

test("preserves candidate-service unavailability for an enumeration-safe 503", async () => {
  jest.mocked(listSummarySelfComparisonCandidates).mockResolvedValue({ kind: "unavailable" });

  await expect(listAuthorizedSelfComparisonCandidates(db(), actor, input)).resolves.toEqual({
    kind: "unavailable",
  });
});

test.each([
  ["non-Coach", { ...actor, role: "ADMIN" as const }, db()],
  ["non-CEO Focus", actor, db(false)],
])("fails closed for %s", async (_case, testActor, database) => {
  await expect(listAuthorizedSelfComparisonCandidates(database, testActor, input)).resolves.toEqual({ kind: "not-found" });
});

test("loads one selected compatible Earlier report through the same envelope", async () => {
  jest.mocked(loadSummarySelfComparison).mockResolvedValue({ kind: "ok", model: compatibleModel() });
  await expect(loadAuthorizedSelfComparison(db(), actor, { ...input, earlierSubmissionId: "earlier-good" })).resolves.toMatchObject({
    kind: "ok", focus: { respondentId: "person-1" }, comparison: { coverage: { matchedQuestionCount: 61 } },
  });
});

function compatibleModel() {
  const value = { current: 6, previous: 5, delta: 1, status: "comparable" as const };
  const sections = ["S_PEOPLE_YE", "S_PEOPLE_CC", "S_STRATEGY", "S_EXEC_LT", "S_EXEC_OP", "S_EXEC_SM", "S_EXEC_SIT", "S_CASH", "S_YOU_LEAD", "S_YOU_IC"];
  return {
    baseline: { submissionId: "earlier-good", campaignId: "c1", campaignLabel: "Earlier", submittedAt: new Date(), versionId: "v1", versionNumber: 1, isImported: false },
    sameVersion: true, overall: value, domains: {}, sections: Object.fromEntries(sections.map((key) => [key, value])),
    questions: Object.fromEntries(Array.from({ length: 61 }, (_, index) => [`Q${String(index + 1).padStart(2, "0")}`, value])),
    coverage: { currentQuestionCount: 61, matchedQuestionCount: 61, unmatchedCurrentCount: 0, baselineOnlyCount: 0 },
  };
}
