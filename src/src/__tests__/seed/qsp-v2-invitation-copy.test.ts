/**
 * QSP v2 invitation-email copy — seed↔prod alignment (Jeff #76).
 *
 * Jeff #76 reported QSP's invite as showing "[Company] has invited you...".
 * State-check (2026-07-27) against the live prod row disproved that as a
 * template-row problem: qsp-v2's live invitationBodyMarkdown is already
 * coach-forward (the 2026-07-03 Wave-P fix is intact). What Jeff saw was a
 * CAMPAIGN-level `invitationBodyHtml` override on "2026 QSP Q2" — that path
 * replaces the branded shell entirely (no coach logo, no coach name), and it is
 * not reachable by a template-row patch. Evidenced, not inferred: prod
 * EMAIL_DELIVERY telemetry records 4 renderer="custom_html" invitation sends on
 * 2026-07-10 (the day of Jeff's report), all from that campaign. It was
 * soft-deleted 2026-07-24; the override-bypass gap is tracked in GH issue #220.
 *
 * So QSP gets NO prod write here. The only real defect was SEED DRIFT: the seed
 * still carried the pre-Wave-P copy ("{{organizationName}} has invited you..."
 * plus a raw {{invitationUrl}}), so re-seeding a fresh environment would have
 * reintroduced exactly the copy Jeff complained about. This guard pins the seed
 * to the live prod copy, byte-for-byte.
 */
import { buildQspV2Content } from "../../../prisma/seed-qsp-v2-assessment";

/** Byte-exact copy of the live prod qsp-v2 template row (read 2026-07-27). */
const LIVE_PROD_BODY = `Hi {{respondentFirstName}},

You've been invited by {{coachName}} to complete the {{templateName}} for {{organizationName}}.

It takes just a few minutes, and there are no right or wrong answers — your honest perspective is what makes the results useful. Your responses are confidential.

Click the button below to begin.`;

describe("QSP v2 seed — invitation email copy (Jeff #76, seed alignment only)", () => {
  const content = buildQspV2Content();
  const body = content.invitationBodyMarkdown;

  it("matches the live prod template row byte-for-byte (no seed↔prod drift)", () => {
    expect(body).toBe(LIVE_PROD_BODY);
  });

  it("is coach-forward — the company never leads the sentence", () => {
    expect(body).toContain("{{coachName}}");
    expect(body).not.toContain("{{organizationName}} has invited you");
  });

  it("carries no duplicate raw invitation URL (button + bottom fallback cover it)", () => {
    expect(body).not.toContain("{{invitationUrl}}");
    expect(body).not.toContain("{{assessmentUrl}}");
    expect(body).not.toContain("Click the link below to begin:");
  });

  it("leaves the invitation SUBJECT unchanged", () => {
    expect(content.invitationSubject).toBe("Please complete your Quarterly Session Prep");
  });
});
