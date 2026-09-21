import { renderMemberSignInEmail } from "@/lib/members/sign-in-email";

const base = {
  firstName: "Sam",
  rawToken: "raw-token-secret",
  appUrl: "https://platform.scalingup.com",
  issuedAt: new Date("2026-09-21T12:00:00Z"),
};

describe("renderMemberSignInEmail", () => {
  it.each([
    ["SELF", new Date("2026-09-21T13:00:00Z"), "1 hour"],
    ["COACH", new Date("2026-09-22T12:00:00Z"), "24 hours"],
  ])("uses one template with the stored %s expiry", (_issuer, expiresAt, duration) => {
    const email = renderMemberSignInEmail({ ...base, expiresAt });
    expect(email.subject).toBe("Your Scaling Up sign-in link");
    expect(email.html).toContain("Scaling Up assessments and reports");
    expect(email.html).toContain(duration);
    expect(email.html).toContain("UTC");
    expect(email.html).toContain("Didn't ask for this?");
    expect(email.html).toContain('alt="Scaling Up"');
    expect(email.html).not.toMatch(/coach logo|Coached by/i);
  });

  it("puts the credential only in the HTML link href and never as bare text", () => {
    const email = renderMemberSignInEmail({
      ...base,
      expiresAt: new Date("2026-09-21T13:00:00Z"),
    });
    expect(email.html).toContain(
      '<a href="https://platform.scalingup.com/member/sign-in?t=raw-token-secret"',
    );
    expect(email.html.match(/raw-token-secret/g)).toHaveLength(1);
    expect(email.text).not.toContain("raw-token-secret");
    expect(email.text).not.toContain("https://platform.scalingup.com/member/sign-in");
  });

  it("is visibly distinct from an assessment invitation", () => {
    const email = renderMemberSignInEmail({
      ...base,
      expiresAt: new Date("2026-09-21T13:00:00Z"),
    });
    expect(email.html).not.toContain("Start the assessment");
    expect(email.html).not.toContain("invited you");
    expect(email.html).toContain("View my reports");
  });
});
