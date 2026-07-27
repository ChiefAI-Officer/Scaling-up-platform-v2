/**
 * Rockefeller invitation-email copy (Jeff #69).
 *
 * The invitation body is TEMPLATE-row data (factory default lives in the seed;
 * the live prod row is corrected by scripts/patch-rockefeller-invitation-copy.ts).
 * This asserts the seed's factory default matches Jeff's #69 asks so a future
 * re-seed can't regress it: lead with the coach, hardcode the assessment name,
 * drop the duplicate above-button raw URL. Mirrors the LVA #61 drift-guard.
 *
 * Jeff #69 is body-only — the subject line is deliberately left unchanged, so
 * these assertions read the body (invitationBodyMarkdown) only.
 */
import { buildRockefellerContent } from "../../../prisma/seed-rockefeller-assessment";

describe("Rockefeller seed — invitation email copy (Jeff #69)", () => {
  const body = buildRockefellerContent().invitationBodyMarkdown;

  it("leads with the coach, not the company", () => {
    expect(body).toContain("{{coachName}} has invited you");
    expect(body).not.toContain("{{organizationName}}");
  });

  it("hardcodes the assessment name (not the {{templateName}} token)", () => {
    expect(body).toContain("complete the Rockefeller Habits");
    expect(body).not.toContain("{{templateName}}");
  });

  it("drops the duplicate above-button raw invitation URL (button + bottom fallback cover it)", () => {
    expect(body).not.toContain("{{invitationUrl}}");
  });

  it("uses the button lead-in copy", () => {
    expect(body).toContain("Click the button below to begin.");
    expect(body).not.toContain("Click the link below to begin:");
  });
});
