import {
  buildTokenValues,
  interpolateTokens,
  type InvitationVars,
} from "@/lib/assessments/invitation-email";

const baseVars: InvitationVars = {
  respondent: { firstName: "Jane", lastName: "Doe", email: "jane@example.com" },
  organizationName: "Acme Corp",
  campaignName: "Q1 Alignment",
  templateName: "Five Dysfunctions",
  coachName: "Pat Coach",
  invitationUrl: "https://app.test/org-survey/abc#t=SECRET",
  closeAt: new Date("2026-07-01T00:00:00Z"),
};

describe("interpolateTokens — aliases + conventions", () => {
  const values = () => buildTokenValues(baseVars);

  it("resolves camelCase and snake_case for the same token", () => {
    expect(interpolateTokens("{{organizationName}}", values())).toBe("Acme Corp");
    expect(interpolateTokens("{{organization_name}}", values())).toBe("Acme Corp");
  });

  it("resolves firstName and respondentFirstName aliases", () => {
    expect(interpolateTokens("{{firstName}}", values())).toBe("Jane");
    expect(interpolateTokens("{{respondentFirstName}}", values())).toBe("Jane");
  });

  it("resolves assessmentUrl and invitationUrl to the same URL", () => {
    expect(interpolateTokens("{{assessmentUrl}}", values())).toBe(baseVars.invitationUrl);
    expect(interpolateTokens("{{invitationUrl}}", values())).toBe(baseVars.invitationUrl);
  });

  it("resolves templateName", () => {
    expect(interpolateTokens("{{templateName}}", values())).toBe("Five Dysfunctions");
  });

  it("applies neutral fallbacks for empty known tokens", () => {
    const v = buildTokenValues({ ...baseVars, organizationName: null, coachName: null, closeAt: null });
    expect(interpolateTokens("{{organization_name}}", v)).toBe("your organization");
    expect(interpolateTokens("{{coach_name}}", v)).toBe("your coach");
    expect(interpolateTokens("{{closeAt}}", v)).toBe("ongoing");
    expect(interpolateTokens("{{firstName}}", buildTokenValues({ ...baseVars, respondent: { firstName: "", lastName: "", email: "" } }))).toBe("there");
  });

  it("strips unknown tokens", () => {
    expect(interpolateTokens("a {{bogusToken}} b", values())).toBe("a  b");
    expect(interpolateTokens("{{respondentFirstName}}", values())).not.toContain("{{");
  });
});
