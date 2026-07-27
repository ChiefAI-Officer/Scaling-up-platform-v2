/**
 * LVA invitation-email copy (Jeff #61).
 *
 * The invitation body is TEMPLATE-row data (factory default lives in the seed;
 * the live prod row is corrected by scripts/patch-lva-invitation-copy.ts). This
 * asserts the seed's factory default matches Jeff's #61 asks so a future
 * re-seed can't regress it: lead with the coach, drop the mid-email raw URL.
 */
import { buildLvaContent } from "../../../prisma/seed-lva-assessment";

describe("LVA seed — invitation email copy (Jeff #61)", () => {
  const content = buildLvaContent();
  const body = content.invitationBodyMarkdown;

  it("leads with the coach, not the company", () => {
    expect(body).toContain("{{coachName}} has invited you");
    expect(body).not.toContain("{{organizationName}}");
  });

  it("drops the mid-email raw invitation URL (button + bottom fallback cover it)", () => {
    expect(body).not.toContain("{{invitationUrl}}");
  });

  it("uses the button lead-in copy", () => {
    expect(body).toContain("Click the button below to begin.");
    expect(body).not.toContain("Click the link below to begin:");
  });

  it("leaves the invitation SUBJECT unchanged (Jeff #61 is body-only)", () => {
    // Positive guard — body-only scope was previously proven only by omission.
    expect(content.invitationSubject).toBe("You're invited: Leadership Vision Alignment Assessment");
  });
});
