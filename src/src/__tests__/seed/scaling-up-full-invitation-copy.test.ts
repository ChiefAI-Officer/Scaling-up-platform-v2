/**
 * Scaling Up Full invitation-email copy (Jeff #76).
 *
 * The invitation body is TEMPLATE-row data (factory default lives in the seed;
 * the live prod row is corrected by scripts/patch-scaling-up-full-invitation-copy.ts).
 * This asserts the seed's factory default matches Jeff's #76 asks so a future
 * re-seed can't regress it: lead with the coach, drop the duplicate above-button
 * raw URL. Mirrors the LVA #61 / Rockefeller #69 drift-guards.
 *
 * Jeff #76 is body-only — the subject line is deliberately left unchanged, so
 * the subject assertion below is a POSITIVE guard (not proof-by-omission).
 *
 * Unlike Rockefeller #69, the assessment name is NOT hardcoded here:
 * {{templateName}} renders "Scaling Up Full Assessment", which already reads as
 * the assessment name Jeff asked for.
 */
import { buildScalingUpFullContent } from "../../../prisma/seed-scaling-up-full-assessment";
import { NEW_BODY } from "../../../scripts/patch-scaling-up-full-invitation-copy";

describe("Scaling Up Full seed — invitation email copy (Jeff #76)", () => {
  const content = buildScalingUpFullContent();
  const body = content.invitationBodyMarkdown;

  it("leads with the coach, not the company", () => {
    expect(body).toContain("{{coachName}} has invited you");
    expect(body).not.toContain("{{organizationName}}");
  });

  it("names the assessment via {{templateName}} (renders 'Scaling Up Full Assessment')", () => {
    expect(body).toContain("complete the {{templateName}}");
  });

  it("drops the duplicate above-button raw invitation URL (button + bottom fallback cover it)", () => {
    expect(body).not.toContain("{{invitationUrl}}");
  });

  it("uses the button lead-in copy", () => {
    expect(body).toContain("Click the button below to begin.");
    expect(body).not.toContain("Click the link below to begin:");
  });

  it("leaves the invitation SUBJECT unchanged (Jeff #76 is body-only)", () => {
    expect(content.invitationSubject).toBe(
      "You're invited to take the {{templateName}} survey for {{organizationName}}",
    );
  });

  it("the prod-row patch script's NEW_BODY stays byte-identical to the seed (no seed↔script drift)", () => {
    // The live prod row is corrected by scripts/patch-scaling-up-full-invitation-copy.ts;
    // if the seed and the script drift, the CAS would silently no-op in prod.
    expect(NEW_BODY).toBe(body);
  });
});
