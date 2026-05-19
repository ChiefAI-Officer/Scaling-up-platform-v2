/**
 * Assessments admin dashboard stats — Phase A IA refactor.
 *
 * Covers:
 *   - Shape of the returned object (the 3 expected counters)
 *   - Each counter resolves from the correct delegate / filter
 *   - Submissions MTD uses the first instant of the current UTC month
 *   - Templates "published" counter requires at least one published version
 */

jest.mock("@/lib/db", () => ({
  db: {
    assessmentCampaign: { count: jest.fn() },
    assessmentTemplate: { count: jest.fn() },
    assessmentSubmission: { count: jest.fn() },
  },
}));

import { db } from "@/lib/db";
import { getAssessmentsDashboardStats } from "@/lib/assessments/dashboard-stats";

const mockCampaign = db.assessmentCampaign.count as jest.Mock;
const mockTemplate = db.assessmentTemplate.count as jest.Mock;
const mockSubmission = db.assessmentSubmission.count as jest.Mock;

beforeEach(() => {
  jest.clearAllMocks();
  mockCampaign.mockResolvedValue(0);
  mockTemplate.mockResolvedValue(0);
  mockSubmission.mockResolvedValue(0);
});

describe("getAssessmentsDashboardStats", () => {
  it("returns the three documented counters", async () => {
    mockCampaign.mockResolvedValue(7);
    mockTemplate.mockResolvedValue(5);
    mockSubmission.mockResolvedValue(144);

    const stats = await getAssessmentsDashboardStats();
    expect(stats).toEqual({
      activeCampaigns: 7,
      templatesPublished: 5,
      submissionsMTD: 144,
    });
  });

  it("activeCampaigns filters by status === ACTIVE", async () => {
    await getAssessmentsDashboardStats();
    expect(mockCampaign).toHaveBeenCalledTimes(1);
    expect(mockCampaign).toHaveBeenCalledWith({
      where: { status: "ACTIVE" },
    });
  });

  it("templatesPublished requires at least one published version + excludes soft-deleted templates", async () => {
    await getAssessmentsDashboardStats();
    expect(mockTemplate).toHaveBeenCalledTimes(1);
    expect(mockTemplate).toHaveBeenCalledWith({
      where: {
        deletedAt: null,
        versions: { some: { publishedAt: { not: null } } },
      },
    });
  });

  it("submissionsMTD uses the first instant of the current UTC month", async () => {
    // Mid-month date: Feb 17 2026 14:30 UTC.
    const now = new Date(Date.UTC(2026, 1, 17, 14, 30, 0));
    await getAssessmentsDashboardStats(now);

    const expectedMonthStart = new Date(Date.UTC(2026, 1, 1, 0, 0, 0));
    expect(mockSubmission).toHaveBeenCalledTimes(1);
    expect(mockSubmission).toHaveBeenCalledWith({
      where: { submittedAt: { gte: expectedMonthStart } },
    });
  });

  it("dispatches the three counters in parallel (Promise.all shape)", async () => {
    // Coarse check: every delegate is called exactly once per invocation.
    await getAssessmentsDashboardStats();
    expect(mockCampaign).toHaveBeenCalledTimes(1);
    expect(mockTemplate).toHaveBeenCalledTimes(1);
    expect(mockSubmission).toHaveBeenCalledTimes(1);
  });
});
