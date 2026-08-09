import {
  publicCampaignCreateError,
  publicCampaignScheduleLabel,
  publicCampaignStatusLabel,
  publicCampaignUrl,
  type PublicCampaignViewModel,
} from "@/lib/assessments/public-campaign-ui";

const now = new Date("2026-08-10T00:00:00.000Z");
const format = (value: Date) => value.toISOString().slice(0, 10);

function schedule(
  overrides: Partial<Pick<PublicCampaignViewModel, "status" | "openAt" | "closeAt">> = {},
) {
  return {
    status: "DRAFT" as const,
    openAt: "2026-08-09T00:00:00.000Z",
    closeAt: null,
    ...overrides,
  };
}

describe("public campaign UI language", () => {
  it.each([
    ["DRAFT", "Draft"],
    ["ACTIVE", "Live"],
    ["CLOSED", "Closed"],
  ] as const)("maps %s to %s (catches a status-label regression)", (status, label) => {
    expect(publicCampaignStatusLabel(status)).toBe(label);
  });

  it("creates a complete, encoded public URL (catches alias path encoding loss)", () => {
    expect(publicCampaignUrl("https://platformtest.scalingup.com/", "quick check"))
      .toBe("https://platformtest.scalingup.com/quiz/quick%20check");
  });

  it("describes a due draft without an end date (catches draft publication-state regression)", () => {
    expect(publicCampaignScheduleLabel(schedule(), now, format))
      .toBe("Opens when published · No end date");
  });

  it("describes a future draft without an end date (catches future draft date regression)", () => {
    expect(publicCampaignScheduleLabel(
      schedule({ openAt: "2026-08-11T00:00:00.000Z" }),
      now,
      format,
    )).toBe("Opens 2026-08-11 · No end date");
  });

  it("describes an open live campaign without an end date (catches live open-ended regression)", () => {
    expect(publicCampaignScheduleLabel(
      schedule({ status: "ACTIVE" }),
      now,
      format,
    )).toBe("Open now · No end date");
  });

  it("describes a future live campaign (catches live future-date regression)", () => {
    expect(publicCampaignScheduleLabel(
      schedule({
        status: "ACTIVE",
        openAt: "2026-08-11T00:00:00.000Z",
        closeAt: "2026-08-20T00:00:00.000Z",
      }),
      now,
      format,
    )).toBe("Opens 2026-08-11");
  });

  it("describes an open live campaign with an end date (catches close-date omission)", () => {
    expect(publicCampaignScheduleLabel(
      schedule({
        status: "ACTIVE",
        closeAt: "2026-08-20T00:00:00.000Z",
      }),
      now,
      format,
    )).toBe("Open until 2026-08-20");
  });

  it("describes a closed campaign with its close date (catches closed-date omission)", () => {
    expect(publicCampaignScheduleLabel(
      schedule({
        status: "CLOSED",
        closeAt: "2026-08-09T00:00:00.000Z",
      }),
      now,
      format,
    )).toBe("Closed 2026-08-09");
  });

  it("describes a closed campaign without a close date (catches null-close fallback regression)", () => {
    expect(publicCampaignScheduleLabel(
      schedule({ status: "CLOSED" }),
      now,
      format,
    )).toBe("Closed");
  });

  it.each([
    [422, "TEMPLATE_VERSION_NOT_PUBLISHED"],
    [409, "TEMPLATE_DISABLED"],
  ])("returns the approved eligibility message for known error %s (catches eligibility-message regression)", (status, error) => {
    expect(publicCampaignCreateError(status, error))
      .toBe("Publish this assessment before creating a campaign.");
  });

  it("hides unknown create error details (catches raw-error interpolation)", () => {
    expect(publicCampaignCreateError(500, "Internal server error"))
      .toBe("We couldn't create this campaign. Check the details and try again.");
  });
});
