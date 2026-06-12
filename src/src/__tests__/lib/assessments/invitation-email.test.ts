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

import {
  renderSubject,
  renderTextBody,
  renderHtmlBody,
} from "@/lib/assessments/invitation-email";

describe("renderSubject — allowlist excludes credentials", () => {
  const v = baseVars;
  it("resolves safe tokens", () => {
    expect(renderSubject("Invite: {{organization_name}}", v)).toBe("Invite: Acme Corp");
  });
  it("strips url/email tokens and never leaks the token", () => {
    const s = renderSubject("Go {{assessmentUrl}} {{respondentEmail}}", v);
    expect(s).not.toContain("#t=");
    expect(s).not.toContain("jane@example.com");
    expect(s).not.toContain("https://");
  });
  it("strips control chars / newlines (header-injection safe)", () => {
    const s = renderSubject("Hi\r\nBcc: evil@x.com {{firstName}}", v);
    expect(s).not.toMatch(/[\r\n]/);
  });
});

describe("renderHtmlBody — escaping + safe markdown + link policy + CTA normalize", () => {
  it("escapes attacker-influenced values", () => {
    const v = { ...baseVars, respondent: { firstName: "<script>alert(1)</script>", lastName: "X", email: "e@e.com" } };
    const html = renderHtmlBody("Hi {{firstName}}", v);
    expect(html).not.toContain("<script>");
    expect(html).toContain("&lt;script&gt;");
  });
  it("renders bold and safe links", () => {
    const html = renderHtmlBody("See **bold** and [docs](https://scalingup.com/x)", baseVars);
    expect(html).toContain("<strong>bold</strong>");
    expect(html).toContain('<a href="https://scalingup.com/x"');
    expect(html).toContain(">docs</a>");
  });
  it("rejects dangerous link schemes (renders text only)", () => {
    const html = renderHtmlBody("[click](javascript:alert(1)) and [x](data:text/html,1)", baseVars);
    expect(html).not.toContain("javascript:");
    expect(html).not.toContain("data:");
    expect(html).toContain("click");
  });
  it("drops a redundant CTA line pointing at the invitation URL", () => {
    const html = renderHtmlBody("Hi\n\n[Take the Assessment]({{assessmentUrl}})\n\nThanks", baseVars);
    expect(html).not.toContain("Take the Assessment");
    expect(html).toContain("Hi");
    expect(html).toContain("Thanks");
  });
  it("never emits a literal token", () => {
    expect(renderHtmlBody("Hi {{firstName}} {{bogus}}", baseVars)).not.toContain("{{");
  });
});

describe("renderTextBody — plain text twin", () => {
  it("is plain text with the URL spelled out and no markdown/HTML", () => {
    const txt = renderTextBody("Hi {{firstName}}\n\n**bold** [docs](https://scalingup.com/x)", baseVars);
    expect(txt).not.toContain("<");
    expect(txt).not.toContain("**");
    expect(txt).toContain("Jane");
    expect(txt).toContain("Start the assessment: " + baseVars.invitationUrl);
  });
});
