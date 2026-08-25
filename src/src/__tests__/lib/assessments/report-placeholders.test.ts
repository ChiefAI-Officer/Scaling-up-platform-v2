import {
  REPORT_PLACEHOLDERS,
  reportPlaceholderIssue,
  unsupportedReportPlaceholders,
} from "@/lib/assessments/report-placeholders";

describe("report placeholder contract", () => {
  it("publishes only the three approved individual-report fields", () => {
    expect(REPORT_PLACEHOLDERS.map((field) => field.token)).toEqual([
      "{{respondentFirstName}}",
      "{{respondentName}}",
      "{{companyName}}",
    ]);
    expect(REPORT_PLACEHOLDERS.map((field) => field.label)).toEqual([
      "First name",
      "Full name",
      "Company name",
    ]);
  });

  it("returns each unsupported token once in source order", () => {
    expect(
      unsupportedReportPlaceholders(
        "<p>{{first_name}} {{respondentName}} {{first_name}} {{coachName}}</p>",
      ),
    ).toEqual([
      "{{first_name}}",
      "{{coachName}}",
    ]);
  });

  it("treats placeholder spelling and casing as exact", () => {
    expect(
      unsupportedReportPlaceholders(
        "{{ respondentName }} {{RespondentName}} {{companyName}}",
      ),
    ).toEqual([
      "{{ respondentName }}",
      "{{RespondentName}}",
    ]);
  });

  it("builds a field-specific authoring error", () => {
    expect(
      reportPlaceholderIssue(
        "<p>{{coachName}} and {{assessmentName}}</p>",
        "Welcome section",
      ),
    ).toBe(
      "Welcome section contains unsupported placeholders {{coachName}} and {{assessmentName}}. Use {{respondentFirstName}}, {{respondentName}}, or {{companyName}}.",
    );
    expect(
      reportPlaceholderIssue(
        "<p>{{respondentFirstName}} {{respondentName}} {{companyName}}</p>",
        "Welcome section",
      ),
    ).toBeNull();
  });
});
