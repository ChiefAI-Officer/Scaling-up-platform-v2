import { GET } from "@/app/api/assessment-campaigns/[id]/summary-reports/self-comparison-candidates/route";
import { getApiActor } from "@/lib/auth/authorization";
import { resolveSummaryReportingState } from "@/lib/assessments/summary-reports/flags";
import { checkSummaryReportRateLimit } from "@/lib/assessments/summary-reports/http";
import { listAuthorizedSelfComparisonCandidates } from "@/lib/assessments/summary-reports/self-comparison-access";

jest.mock("@/lib/db", () => ({ db: {} }));
jest.mock("@/lib/auth/authorization", () => ({ getApiActor: jest.fn() }));
jest.mock("@/lib/assessments/summary-reports/flags", () => ({ resolveSummaryReportingState: jest.fn() }));
jest.mock("@/lib/assessments/summary-reports/self-comparison-access", () => ({
  listAuthorizedSelfComparisonCandidates: jest.fn(),
}));
jest.mock("@/lib/assessments/summary-reports/http", () => {
  const actual = jest.requireActual("@/lib/assessments/summary-reports/http");
  return { ...actual, checkSummaryReportRateLimit: jest.fn() };
});

const actor = { userId: "user-1", email: "coach@example.com", role: "COACH" as const, coachId: "coach-1" };

beforeEach(() => {
  jest.mocked(resolveSummaryReportingState).mockReturnValue({ enabled: true, killed: false });
  jest.mocked(getApiActor).mockResolvedValue(actor);
  jest.mocked(checkSummaryReportRateLimit).mockResolvedValue({ headers: { "X-RateLimit-Limit": "60" } });
  jest.mocked(listAuthorizedSelfComparisonCandidates).mockReset();
});

function request(query = "focusSubmissionId=focus-1") {
  return GET(new Request(`https://example.test/api/assessment-campaigns/campaign-1/summary-reports/self-comparison-candidates?${query}`), {
    params: Promise.resolve({ id: "campaign-1" }),
  });
}

test.each([
  ["service outcome", async () => ({ kind: "unavailable" as const })],
  ["thrown dependency error", async () => { throw new Error("database unavailable"); }],
])("returns the same safe 503 for a %s", async (_case, implementation) => {
  jest.mocked(listAuthorizedSelfComparisonCandidates).mockImplementation(implementation);

  const response = await request();

  expect(response.status).toBe(503);
  await expect(response.json()).resolves.toEqual({ error: "Self Comparison candidates are temporarily unavailable." });
  expect(response.headers.get("Cache-Control")).toBe("private, no-store");
  expect(response.headers.get("X-RateLimit-Limit")).toBe("60");
});

test("uses the documented focusSubmissionId query seam", async () => {
  jest.mocked(listAuthorizedSelfComparisonCandidates).mockResolvedValue({
    kind: "ok",
    focus: { campaignId: "campaign-1", submissionId: "focus-1", respondentId: "person-1", submittedAt: new Date() },
    candidates: [],
    bounded: false,
  });

  expect((await request()).status).toBe(200);
  expect(listAuthorizedSelfComparisonCandidates).toHaveBeenCalledWith({}, actor, {
    destinationCampaignId: "campaign-1",
    focusSubmissionId: "focus-1",
  });
  expect((await request("focus=focus-1")).status).toBe(400);
});
