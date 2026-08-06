import { buildCeoReportSessionOptions } from "@/lib/assessments/ceo-report-access-cookie";

describe("CEO report cookie runtime", () => {
  const originalSecret = process.env.ASSESSMENT_REPORT_ACCESS_SECRET;

  beforeEach(() => {
    process.env.ASSESSMENT_REPORT_ACCESS_SECRET = "e2e-report-access-secret-that-is-long-enough";
  });

  afterAll(() => {
    if (originalSecret === undefined) delete process.env.ASSESSMENT_REPORT_ACCESS_SECRET;
    else process.env.ASSESSMENT_REPORT_ACCESS_SECRET = originalSecret;
  });

  it("loads the real iron-session Node runtime under Jest", () => {
    expect(buildCeoReportSessionOptions("campaign-id", "respondent-id")).toMatchObject({
      cookieName: "assessment-report-self",
      ttl: 30 * 24 * 60 * 60,
      cookieOptions: {
        httpOnly: true,
        secure: true,
        sameSite: "strict",
        path: "/assessments/campaign-id/respondents/respondent-id/report",
      },
    });
  });
});
