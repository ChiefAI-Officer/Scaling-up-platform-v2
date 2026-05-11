/**
 * ENH-MAY6-11: composeRegistrationConfirmationEmail helper.
 *
 * Single composer shared by free (sendRegistrationNotification) and paid
 * (sendPaidRegistrationNotificationStrict) registration paths so both
 * pick up admin overrides uniformly.
 *
 * Round 2 M3: token values HTML-escaped before insertion to prevent XSS /
 * link injection from registrant-controlled fields (firstName, company,
 * workshopTitle).
 *
 * Round 3 H1: TRANSACTIONAL_EMAIL_OVERRIDES_ENABLED kill switch — when set
 * to anything other than "true", composer returns hardcoded fallback verbatim
 * regardless of DB row. Lets ops flip back to trusted defaults without DB edit.
 */

jest.mock("@/lib/db", () => ({
  db: {
    transactionalEmailTemplate: {
      findUnique: jest.fn(),
    },
  },
}));

import { db } from "@/lib/db";
import { composeRegistrationConfirmationEmail } from "@/lib/notifications/transactional-email-template";

const fixtureContext = {
  workshopTitle: "Scaling Up Master Class",
  coachName: "Lynne Verdun",
  registrantName: "Gabriel Test",
  registrantEmail: "gabriel@chiefaiofficer.com",
};

describe("composeRegistrationConfirmationEmail (ENH-MAY6-11)", () => {
  const ORIGINAL_FLAG = process.env.TRANSACTIONAL_EMAIL_OVERRIDES_ENABLED;

  beforeEach(() => {
    jest.clearAllMocks();
    process.env.TRANSACTIONAL_EMAIL_OVERRIDES_ENABLED = "true";
  });

  afterEach(() => {
    if (ORIGINAL_FLAG === undefined) {
      delete process.env.TRANSACTIONAL_EMAIL_OVERRIDES_ENABLED;
    } else {
      process.env.TRANSACTIONAL_EMAIL_OVERRIDES_ENABLED = ORIGINAL_FLAG;
    }
  });

  it("falls back to hardcoded HTML when no DB row exists", async () => {
    (db.transactionalEmailTemplate.findUnique as jest.Mock).mockResolvedValue(null);
    const { subject, html } = await composeRegistrationConfirmationEmail(fixtureContext);
    expect(subject).toContain("You're Registered");
    expect(html).toContain("Hi Gabriel Test");
    expect(html).toContain("Scaling Up Master Class");
  });

  it("uses DB row when present and interpolates tokens", async () => {
    (db.transactionalEmailTemplate.findUnique as jest.Mock).mockResolvedValue({
      emailType: "REGISTRATION_CONFIRMATION",
      subject: "Welcome to {{workshopTitle}}, {{registrantName}}",
      body: "<p>Hi {{registrantName}}, thanks for joining {{workshopTitle}} with {{coachName}}.</p>",
      version: 3,
    });
    const { subject, html } = await composeRegistrationConfirmationEmail(fixtureContext);
    expect(subject).toBe("Welcome to Scaling Up Master Class, Gabriel Test");
    expect(html).toBe(
      "<p>Hi Gabriel Test, thanks for joining Scaling Up Master Class with Lynne Verdun.</p>",
    );
  });

  it("HTML-escapes token values to prevent injection (Round 2 M3)", async () => {
    (db.transactionalEmailTemplate.findUnique as jest.Mock).mockResolvedValue({
      emailType: "REGISTRATION_CONFIRMATION",
      subject: "Hi {{registrantName}}",
      body: "<p>Hi {{registrantName}} from {{workshopTitle}}</p>",
      version: 1,
    });
    const { subject, html } = await composeRegistrationConfirmationEmail({
      ...fixtureContext,
      registrantName: '<script>alert(1)</script>',
      workshopTitle: '<a href="https://evil.com">click</a>',
    });
    expect(html).not.toContain("<script>");
    expect(html).not.toContain('<a href="https://evil.com">');
    expect(html).toContain("&lt;script&gt;");
    expect(html).toContain("&lt;a href=");
    // Subject is also escaped so a malicious display name can't smuggle markup
    // into mail clients that render limited HTML in subject previews.
    expect(subject).not.toContain("<script>");
  });

  it("kill switch: when TRANSACTIONAL_EMAIL_OVERRIDES_ENABLED != 'true', falls back to hardcoded HTML even if DB row exists", async () => {
    process.env.TRANSACTIONAL_EMAIL_OVERRIDES_ENABLED = "false";
    (db.transactionalEmailTemplate.findUnique as jest.Mock).mockResolvedValue({
      emailType: "REGISTRATION_CONFIRMATION",
      subject: "CUSTOM SUBJECT",
      body: "<p>CUSTOM BODY</p>",
      version: 1,
    });
    const { subject, html } = await composeRegistrationConfirmationEmail(fixtureContext);
    expect(subject).not.toBe("CUSTOM SUBJECT");
    expect(subject).toContain("You're Registered");
    expect(html).toContain("Hi Gabriel Test");
    // DB should NOT be queried when flag is off
    expect(db.transactionalEmailTemplate.findUnique).not.toHaveBeenCalled();
  });
});
