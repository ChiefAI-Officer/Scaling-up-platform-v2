/**
 * Five Dysfunctions invitation-email copy (Jeff #80).
 *
 * The invitation body is TEMPLATE-row data (factory default lives in the seed;
 * the live prod row is corrected by scripts/patch-five-dysfunctions-invitation-copy.ts).
 * This asserts the seed's factory default matches Jeff's #80 asks so a future
 * re-seed can't regress it. Mirrors the LVA #61 / Rockefeller #69 drift-guards.
 *
 * Jeff #80 ask (3) — the suspected "duplicate link" — is a NO-OP guardrail, not
 * a fix. The old copy's `[Take the Assessment]({{assessmentUrl}})` line never
 * reached the inbox: `dropRedundantCta` strips any standalone markdown-link line
 * whose URL equals the invitation URL, and both {{assessmentUrl}} and
 * {{invitationUrl}} resolve to it. Removing it from source only makes the intent
 * explicit. The renderer test below proves the guardrail rather than assuming it.
 *
 * Jeff #80 is body-only — the subject assertion is a POSITIVE guard.
 */
import { buildFiveDysfunctionsContent } from "../../../prisma/seed-five-dysfunctions";
import { NEW_BODY } from "../../../scripts/patch-five-dysfunctions-invitation-copy";
import { renderHtmlBody } from "../../lib/assessments/invitation-email";

describe("Five Dysfunctions seed — invitation email copy (Jeff #80)", () => {
  const content = buildFiveDysfunctionsContent();
  const body = content.invitationBodyMarkdown;

  it("names the coach instead of the generic 'Your coach'", () => {
    expect(body).toContain("{{coachName}} has invited you");
    expect(body).not.toContain("Your coach has invited you");
  });

  it("hardcodes Jeff's assessment wording (not the clunky {{templateName}})", () => {
    // {{templateName}} renders "The Five Dysfunctions of a Team — Team Assessment";
    // Jeff #80 asks for "the Five Dysfunctions assessment".
    expect(body).toContain("complete the Five Dysfunctions assessment");
    expect(body).not.toContain("{{templateName}}");
  });

  it("carries no inline link in the copy (the shell supplies the button + fallback URL)", () => {
    expect(body).not.toContain("{{assessmentUrl}}");
    expect(body).not.toContain("{{invitationUrl}}");
    expect(body).not.toContain("[Take the Assessment]");
  });

  it("ask 3 was already a NO-OP at render — the old inline CTA produced no body link either", () => {
    // Jeff #80 (3) was hedged ("likely… worth confirming"). It does not reproduce:
    // dropRedundantCta strips a standalone markdown-link line pointing at the
    // invitation URL, so the OLD body rendered zero body anchors — same as the new
    // one. This pins that renderer behaviour so the claim can't silently rot.
    const invitationUrl = "https://app.test/org-survey/abc#t=SECRET";
    const vars = {
      respondent: { firstName: "Ann", lastName: "Lee", email: "ann@example.com" },
      organizationName: "Acme",
      campaignName: "Acme 2026",
      templateName: "The Five Dysfunctions of a Team — Team Assessment",
      coachName: "Jane Doe",
      invitationUrl,
      closeAt: null,
    };
    const OLD_BODY_WITH_INLINE_CTA = `Hi {{firstName}},

Your coach has invited you.

[Take the Assessment]({{assessmentUrl}})

Best,
Scaling Up`;

    const oldHtml = renderHtmlBody(OLD_BODY_WITH_INLINE_CTA, vars);
    const newHtml = renderHtmlBody(body, vars);

    expect(oldHtml).not.toContain("<a href=");
    expect(oldHtml).not.toContain(invitationUrl);
    expect(newHtml).not.toContain("<a href=");
    expect(newHtml).not.toContain(invitationUrl);
  });

  it("uses the button lead-in copy", () => {
    expect(body).toContain("Click the button below to begin.");
  });

  it("leaves the invitation SUBJECT unchanged (Jeff #80 is body-only)", () => {
    expect(content.invitationSubject).toBe("Your Five Dysfunctions Team Assessment is ready");
  });

  it("the prod-row patch script's NEW_BODY stays byte-identical to the seed (no seed↔script drift)", () => {
    expect(NEW_BODY).toBe(body);
  });
});
