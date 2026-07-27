/**
 * Five Dysfunctions invitation-email copy (Jeff #80).
 *
 * The invitation body is TEMPLATE-row data (factory default lives in the seed;
 * the live prod row is corrected by scripts/patch-five-dysfunctions-invitation-copy.ts).
 * This asserts the seed's factory default matches Jeff's #80 asks so a future
 * re-seed can't regress it. Mirrors the LVA #61 / Rockefeller #69 drift-guards.
 *
 * Jeff #80 ask (3) — the suspected "duplicate link" — is a NO-OP guardrail on the
 * BRANDED renderer (the only path prod uses today): `dropRedundantCta` strips any
 * standalone markdown-link line whose URL equals the invitation URL, and both
 * {{assessmentUrl}} and {{invitationUrl}} resolve to it, so the old copy rendered
 * zero body anchors there. It IS a real fix on the legacy renderer
 * (`sendLegacyInvitationEmail`, reached only via the dormant
 * ASSESSMENT_INVITE_BRANDED=0 kill switch), which has no `dropRedundantCta` and
 * did print the URL — GH #217. The two renderer tests below pin both halves of
 * that asymmetry rather than assuming either.
 *
 * Jeff #80 is body-only — the subject assertion is a POSITIVE guard.
 */
import { buildFiveDysfunctionsContent } from "../../../prisma/seed-five-dysfunctions";
import {
  EXPECTED_CURRENT_BODY,
  NEW_BODY,
} from "../../../scripts/patch-five-dysfunctions-invitation-copy";
import {
  buildTokenValues,
  interpolateTokens,
  renderHtmlBody,
} from "../../lib/assessments/invitation-email";

const INVITATION_URL = "https://app.test/org-survey/abc#t=SECRET";
const vars = {
  respondent: { firstName: "Ann", lastName: "Lee", email: "ann@example.com" },
  organizationName: "Acme",
  campaignName: "Acme 2026",
  templateName: "The Five Dysfunctions of a Team — Team Assessment",
  coachName: "Jane Doe",
  invitationUrl: INVITATION_URL,
  closeAt: null,
};

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

  it("ask 3 was already a NO-OP on the BRANDED renderer — the old inline CTA produced no body link", () => {
    // Jeff #80 (3) was hedged ("likely… worth confirming"). On the branded path —
    // the only one prod uses — it does not reproduce: dropRedundantCta strips a
    // standalone markdown-link line pointing at the invitation URL, so the real
    // pre-patch prod body rendered zero body anchors, same as the new one.
    // Rendering EXPECTED_CURRENT_BODY (not a hand-written stand-in) keeps this
    // anchored to the copy that actually shipped.
    const oldHtml = renderHtmlBody(EXPECTED_CURRENT_BODY, vars);
    const newHtml = renderHtmlBody(body, vars);

    expect(oldHtml).not.toContain("<a href=");
    expect(oldHtml).not.toContain(INVITATION_URL);
    expect(newHtml).not.toContain("<a href=");
    expect(newHtml).not.toContain(INVITATION_URL);
  });

  it("…but NOT on the legacy renderer, which has no dropRedundantCta (GH #217)", () => {
    // sendLegacyInvitationEmail (ASSESSMENT_INVITE_BRANDED=0, dormant in prod)
    // pipes the body through interpolate → escape → paragraph-wrap only. The old
    // copy really did print the URL there, so removing it from source is a real
    // fix on that path — this pins the asymmetry the comments now claim.
    const legacyOld = interpolateTokens(EXPECTED_CURRENT_BODY, buildTokenValues(vars));
    const legacyNew = interpolateTokens(body, buildTokenValues(vars));

    expect(legacyOld).toContain(INVITATION_URL);
    expect(legacyNew).not.toContain(INVITATION_URL);
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
