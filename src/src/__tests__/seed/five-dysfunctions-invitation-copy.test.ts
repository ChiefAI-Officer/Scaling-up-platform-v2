/**
 * Five Dysfunctions invitation-email copy (Jeff #80).
 *
 * The invitation body is TEMPLATE-row data (factory default lives in the seed;
 * the live prod row is corrected by scripts/patch-five-dysfunctions-invitation-copy.ts).
 * This asserts the seed's factory default matches Jeff's #80 asks so a future
 * re-seed can't regress it. Mirrors the LVA #61 / Rockefeller #69 drift-guards.
 *
 * Jeff #80 ask (3) — the "duplicate link" — is a MARKDOWN link here, not a raw
 * URL: `[Take the Assessment]({{assessmentUrl}})` rendered above the shell's own
 * "Start the assessment" button AND its bottom fallback URL (three links). Both
 * URL tokens resolve to the same invitation URL (buildTokenValues maps
 * assessmenturl and invitationurl to it), so the guard covers both spellings.
 *
 * Jeff #80 is body-only — the subject assertion is a POSITIVE guard.
 */
import { buildFiveDysfunctionsContent } from "../../../prisma/seed-five-dysfunctions";
import { NEW_BODY } from "../../../scripts/patch-five-dysfunctions-invitation-copy";

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

  it("drops the duplicate inline link (button + bottom fallback cover it)", () => {
    expect(body).not.toContain("{{assessmentUrl}}");
    expect(body).not.toContain("{{invitationUrl}}");
    expect(body).not.toContain("[Take the Assessment]");
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
