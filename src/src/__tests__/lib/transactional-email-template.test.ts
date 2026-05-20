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

describe("composeRegistrationConfirmationEmail — location block (Wave 13-A)", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Use hardcoded path (kill switch off) so no DB call needed
    process.env.TRANSACTIONAL_EMAIL_OVERRIDES_ENABLED = "false";
  });

  afterEach(() => {
    delete process.env.TRANSACTIONAL_EMAIL_OVERRIDES_ENABLED;
  });

  it("VIRTUAL + virtualLink → join link rendered, NO Get Directions in html", async () => {
    const { html } = await composeRegistrationConfirmationEmail({
      ...fixtureContext,
      format: "VIRTUAL",
      virtualLink: "https://zoom.us/j/123456789",
    });
    expect(html).toContain("Join online");
    expect(html).toContain("https://zoom.us/j/123456789");
    expect(html).not.toContain("Get Directions");
    expect(html).not.toContain("maps.google");
  });

  it("IN_PERSON + venueName/venueAddress → venue shown and Get Directions link present", async () => {
    const { html } = await composeRegistrationConfirmationEmail({
      ...fixtureContext,
      format: "IN_PERSON",
      venueName: "Marriott Downtown",
      venueAddress: '{"street":"123 Main St","city":"New York","state":"NY","zip":"10001"}',
    });
    expect(html).toContain("Marriott Downtown");
    expect(html).toContain("Get Directions");
    expect(html).toContain("google.com/maps");
  });

  it("no format field → no extra location block rendered (backwards compat)", async () => {
    const { html } = await composeRegistrationConfirmationEmail({
      ...fixtureContext,
      // format intentionally omitted
    });
    expect(html).not.toContain("Join online");
    expect(html).not.toContain("Get Directions");
    // Core content still present
    expect(html).toContain("You're confirmed for");
    expect(html).toContain("See you there");
  });
});

describe("composeRegistrationConfirmationEmail — DB-template path appends location block", () => {
  const ORIGINAL_FLAG = process.env.TRANSACTIONAL_EMAIL_OVERRIDES_ENABLED;

  beforeEach(() => {
    jest.clearAllMocks();
    process.env.TRANSACTIONAL_EMAIL_OVERRIDES_ENABLED = "true";
    (db.transactionalEmailTemplate.findUnique as jest.Mock).mockResolvedValue({
      emailType: "REGISTRATION_CONFIRMATION",
      subject: "You're Registered: {{workshopTitle}}",
      body: "<p>Hi {{registrantName}}, thanks for joining {{workshopTitle}}.</p>",
      version: 1,
    });
  });

  afterEach(() => {
    if (ORIGINAL_FLAG === undefined) {
      delete process.env.TRANSACTIONAL_EMAIL_OVERRIDES_ENABLED;
    } else {
      process.env.TRANSACTIONAL_EMAIL_OVERRIDES_ENABLED = ORIGINAL_FLAG;
    }
  });

  it("VIRTUAL + virtualLink → custom body followed by <hr> + Join online link", async () => {
    const { subject, html } = await composeRegistrationConfirmationEmail({
      ...fixtureContext,
      format: "VIRTUAL",
      virtualLink: "https://zoom.us/j/123456789",
    });
    // Custom body interpolated
    expect(html).toContain("thanks for joining Scaling Up Master Class");
    // Location block appended after the body
    expect(html).toContain("<hr>");
    expect(html).toContain("Join online");
    expect(html).toContain("https://zoom.us/j/123456789");
    // hr must come AFTER the interpolated body, BEFORE the location block
    const hrIdx = html.indexOf("<hr>");
    expect(html.indexOf("thanks for joining")).toBeLessThan(hrIdx);
    expect(hrIdx).toBeLessThan(html.indexOf("Join online"));
    // Subject is NOT modified — no location info smuggled into it
    expect(subject).toBe("You're Registered: Scaling Up Master Class");
    expect(subject).not.toContain("zoom.us");
    expect(subject).not.toContain("Join online");
  });

  it("VIRTUAL + no virtualLink → custom body + generic 'join details shared by coach' note", async () => {
    const { html } = await composeRegistrationConfirmationEmail({
      ...fixtureContext,
      format: "VIRTUAL",
      virtualLink: null,
    });
    expect(html).toContain("thanks for joining");
    expect(html).toContain("<hr>");
    expect(html).toContain("This is a virtual workshop");
    expect(html).toContain("Join details will be shared by the coach");
  });

  it("IN_PERSON + venue → custom body + venue name + Get Directions link", async () => {
    const { html } = await composeRegistrationConfirmationEmail({
      ...fixtureContext,
      format: "IN_PERSON",
      venueName: "Marriott Downtown",
      venueAddress: '{"street":"123 Main St","city":"New York","state":"NY","zip":"10001"}',
    });
    expect(html).toContain("thanks for joining");
    expect(html).toContain("<hr>");
    expect(html).toContain("Marriott Downtown");
    expect(html).toContain("Get Directions");
    expect(html).toContain("google.com/maps");
  });

  it("no format set → no <hr> and no location block appended (backwards compat)", async () => {
    const { html } = await composeRegistrationConfirmationEmail({
      ...fixtureContext,
      // format intentionally omitted
    });
    expect(html).toBe("<p>Hi Gabriel Test, thanks for joining Scaling Up Master Class.</p>");
    expect(html).not.toContain("<hr>");
    expect(html).not.toContain("Join online");
    expect(html).not.toContain("Get Directions");
  });
});
