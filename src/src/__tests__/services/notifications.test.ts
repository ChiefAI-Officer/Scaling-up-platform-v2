/**
 * Unit tests for sendWorkshopDateChangeEmail
 *
 * Tests:
 * - Sends emails only to FREE and COMPLETED registrants
 * - Sends no emails when no confirmed registrants
 * - Generates ICS with METHOD:REQUEST
 */

// ---------------------------------------------------------------------------
// Mocks — jest.mock() is hoisted so factory functions must not reference
// module-level const variables declared after the mock call.
// ---------------------------------------------------------------------------

jest.mock("@/lib/db", () => ({
  db: {
    registration: {
      findMany: jest.fn(),
    },
  },
}));

jest.mock("@/lib/smtp-transport", () => ({
  sendEmailViaSMTP: jest.fn().mockResolvedValue(undefined),
}));

jest.mock("@/lib/ics-generator", () => ({
  generateIcsContent: jest.fn().mockReturnValue("BEGIN:VCALENDAR\nEND:VCALENDAR"),
  buildLocationString: jest.fn().mockReturnValue("Test Venue"),
}));

jest.mock("@/lib/utils", () => {
  const actual = jest.requireActual("@/lib/utils");
  return {
    formatTimestamp: jest.fn().mockReturnValue("May 1, 2026"),
    formatEventDateUTC: jest.fn().mockReturnValue("Oct 1, 2026"),
    formatCurrency: jest.fn(),
    generateSlug: jest.fn(),
    getWorkshopStatusLabel: jest.fn(),
    // Real DST-aware zone helpers — used by the date-change email body.
    formatTimeWithZone: actual.formatTimeWithZone,
    formatZoneAbbrev: actual.formatZoneAbbrev,
  };
});

// ---------------------------------------------------------------------------
// Imports (after mocks — Jest hoists mock() calls above these)
// ---------------------------------------------------------------------------

import { sendWorkshopDateChangeEmail } from "@/services/notifications";
import { db } from "@/lib/db";
import { sendEmailViaSMTP } from "@/lib/smtp-transport";
import { generateIcsContent, buildLocationString } from "@/lib/ics-generator";

// Typed mock aliases for easy use in tests
const mockFindMany = db.registration.findMany as jest.Mock;
const mockSendEmailViaSMTP = sendEmailViaSMTP as jest.Mock;
const mockGenerateIcsContent = generateIcsContent as jest.Mock;
const mockBuildLocationString = buildLocationString as jest.Mock;

// ---------------------------------------------------------------------------
// Shared test data
// ---------------------------------------------------------------------------

const baseParams = {
  workshopId: "ws-123",
  workshopTitle: "Scaling Up Workshop",
  workshopCode: "WS-2026-AB12",
  coachName: "Jane Coach",
  coachEmail: "jane@example.com",
  eventDate: new Date("2026-05-01T09:00:00Z"),
  eventTime: "09:00",
  timezone: "America/New_York",
  workshopFormat: "IN_PERSON",
  venueName: "Grand Hotel",
  venueAddress: null,
  virtualLink: null,
  durationHours: 8,
  landingPageUrl: "https://example.com/workshop/scaling-up",
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("sendWorkshopDateChangeEmail", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGenerateIcsContent.mockReturnValue("BEGIN:VCALENDAR\nEND:VCALENDAR");
    mockBuildLocationString.mockReturnValue("Test Venue");
    mockSendEmailViaSMTP.mockResolvedValue(undefined);
  });

  it("sends emails only to FREE and COMPLETED registrants", async () => {
    mockFindMany.mockResolvedValue([
      { email: "alice@example.com", firstName: "Alice", lastName: "Smith" },
      { email: "bob@example.com", firstName: "Bob", lastName: "Jones" },
    ]);

    await sendWorkshopDateChangeEmail(baseParams);

    // db queried with correct payment status filter
    expect(mockFindMany).toHaveBeenCalledWith({
      where: {
        workshopId: "ws-123",
        paymentStatus: { in: ["FREE", "COMPLETED"] },
      },
      select: { email: true, firstName: true, lastName: true },
    });

    // One email per registrant
    expect(mockSendEmailViaSMTP).toHaveBeenCalledTimes(2);

    const firstCall = mockSendEmailViaSMTP.mock.calls[0][0];
    expect(firstCall.to).toBe("alice@example.com");
    expect(firstCall.subject).toBe("Workshop date updated: Scaling Up Workshop");
    expect(firstCall.attachments).toHaveLength(1);
    expect(firstCall.attachments[0].filename).toBe("WS-2026-AB12-updated.ics");
    expect(firstCall.attachments[0].contentType).toBe("text/calendar; method=REQUEST");

    const secondCall = mockSendEmailViaSMTP.mock.calls[1][0];
    expect(secondCall.to).toBe("bob@example.com");
  });

  it("sends no emails when no confirmed registrants", async () => {
    mockFindMany.mockResolvedValue([]);

    await sendWorkshopDateChangeEmail(baseParams);

    expect(mockFindMany).toHaveBeenCalledTimes(1);
    expect(mockSendEmailViaSMTP).not.toHaveBeenCalled();
  });

  it("generates ICS with METHOD:REQUEST", async () => {
    mockFindMany.mockResolvedValue([
      { email: "carol@example.com", firstName: "Carol", lastName: "Davis" },
    ]);

    await sendWorkshopDateChangeEmail({
      ...baseParams,
      workshopId: "ws-123",
    });

    expect(mockGenerateIcsContent).toHaveBeenCalledWith(
      expect.objectContaining({
        uid: "workshop-ws-123@scaling-up-platform.com",
        method: "REQUEST",
      })
    );

    expect(mockSendEmailViaSMTP).toHaveBeenCalledTimes(1);
    const callArgs = mockSendEmailViaSMTP.mock.calls[0][0];
    expect(callArgs.attachments[0].content).toBe("BEGIN:VCALENDAR\nEND:VCALENDAR");
  });

  it("dispatches ICS attachment with METHOD:REQUEST content-type to each registrant", async () => {
    mockFindMany.mockResolvedValue([
      { email: "a@example.com", firstName: "Alice", lastName: "A" },
    ]);
    mockGenerateIcsContent.mockReturnValue(
      "BEGIN:VCALENDAR\r\nMETHOD:REQUEST\r\nEND:VCALENDAR"
    );

    await sendWorkshopDateChangeEmail(baseParams);

    expect(mockSendEmailViaSMTP).toHaveBeenCalledTimes(1);
    const call = mockSendEmailViaSMTP.mock.calls[0][0];
    expect(call.attachments).toHaveLength(1);
    expect(call.attachments[0]).toMatchObject({
      filename: expect.stringMatching(/\.ics$/),
      content: expect.stringContaining("METHOD:REQUEST"),
      contentType: "text/calendar; method=REQUEST",
    });
  });

  it("uses IN_PERSON as default format when workshopFormat is null", async () => {
    mockFindMany.mockResolvedValue([
      { email: "dave@example.com", firstName: "Dave", lastName: "Lee" },
    ]);

    await sendWorkshopDateChangeEmail({
      ...baseParams,
      workshopFormat: null,
    });

    expect(mockBuildLocationString).toHaveBeenCalledWith(
      expect.objectContaining({ format: "IN_PERSON" })
    );
  });

  it("uses UTC as default timezone when timezone is null", async () => {
    mockFindMany.mockResolvedValue([
      { email: "eve@example.com", firstName: "Eve", lastName: "Moore" },
    ]);

    await sendWorkshopDateChangeEmail({
      ...baseParams,
      timezone: null,
    });

    expect(mockGenerateIcsContent).toHaveBeenCalledWith(
      expect.objectContaining({ timezone: "UTC" })
    );
  });

  it("uses 8 as default durationHours when not provided", async () => {
    mockFindMany.mockResolvedValue([
      { email: "frank@example.com", firstName: "Frank", lastName: "White" },
    ]);

    const { durationHours: _unused, ...paramsWithoutDuration } = baseParams;
    await sendWorkshopDateChangeEmail(paramsWithoutDuration);

    expect(mockGenerateIcsContent).toHaveBeenCalledWith(
      expect.objectContaining({ durationHours: 8 })
    );
  });

  it("omits landing page link from email body when landingPageUrl is not provided", async () => {
    mockFindMany.mockResolvedValue([
      { email: "grace@example.com", firstName: "Grace", lastName: "Taylor" },
    ]);

    const { landingPageUrl: _unused, ...paramsWithoutUrl } = baseParams;
    await sendWorkshopDateChangeEmail(paramsWithoutUrl);

    const callArgs = mockSendEmailViaSMTP.mock.calls[0][0];
    expect(callArgs.html).not.toContain("View workshop details");
  });

  it("appends the DST-aware zone abbreviation to the event time in the body", async () => {
    mockFindMany.mockResolvedValue([
      { email: "henry@example.com", firstName: "Henry", lastName: "Ford" },
    ]);

    // baseParams: eventDate 2026-05-01 (EDT), eventTime "09:00", America/New_York
    await sendWorkshopDateChangeEmail(baseParams);

    const callArgs = mockSendEmailViaSMTP.mock.calls[0][0];
    expect(callArgs.html).toMatch(/at 09:00 (EDT|EST)/);
  });
});

// ===========================================================================
// sendAssessmentInvitationEmail — full-HTML override (#20)
// ===========================================================================
import { sendAssessmentInvitationEmail } from "@/services/notifications";

describe("sendAssessmentInvitationEmail — full-HTML override (#20)", () => {
  const ORIGINAL_FLAG = process.env.WAVE_D_CUSTOM_HTML_EMAIL_ENABLED;
  const ORIGINAL_BRANDED = process.env.ASSESSMENT_INVITE_BRANDED;

  const baseData = () => ({
    invitation: { id: "inv1", expiresAt: new Date("2026-07-01T00:00:00Z") },
    respondent: { id: "r1", firstName: "Jane", lastName: "Doe", email: "jane@example.com" },
    campaign: { id: "c1", name: "Q1 Alignment", alias: "abc", closeAt: null as Date | null },
    template: {
      invitationSubject: "Take {{campaignName}}",
      invitationBodyMarkdown: "Hi {{respondentFirstName}}",
    },
    organizationName: "Acme Corp",
    coachName: "Pat Coach",
    templateName: "Five Dysfunctions",
    rawToken: "SECRET",
    baseUrl: "https://app.test",
  });

  beforeEach(() => {
    mockSendEmailViaSMTP.mockClear();
    delete process.env.ASSESSMENT_INVITE_BRANDED; // branded path on
  });

  afterAll(() => {
    if (ORIGINAL_FLAG === undefined) delete process.env.WAVE_D_CUSTOM_HTML_EMAIL_ENABLED;
    else process.env.WAVE_D_CUSTOM_HTML_EMAIL_ENABLED = ORIGINAL_FLAG;
    if (ORIGINAL_BRANDED === undefined) delete process.env.ASSESSMENT_INVITE_BRANDED;
    else process.env.ASSESSMENT_INVITE_BRANDED = ORIGINAL_BRANDED;
  });

  it("flag ON + invitationBodyHtml set → sanitized-interpolated HTML is the WHOLE email (no shell)", async () => {
    process.env.WAVE_D_CUSTOM_HTML_EMAIL_ENABLED = "1";
    await sendAssessmentInvitationEmail({
      ...baseData(),
      invitationBodyHtml:
        '<h1>Custom</h1><p>Hi {{respondentFirstName}}</p><a href="{{invitationUrl}}">Start</a>',
    });
    const args = mockSendEmailViaSMTP.mock.calls[0][0];
    expect(args.html).toContain("<h1>Custom</h1>");
    expect(args.html).toContain("Jane");
    expect(args.html).toContain("https://app.test/org-survey/abc#t=SECRET");
    // No branded shell markers.
    expect(args.html).not.toContain("Start the assessment"); // shell CTA text
    expect(args.html).not.toContain("cid:su-logo");
    // No CID logo attachment on the full-HTML path.
    expect(args.attachments ?? []).toHaveLength(0);
  });

  it("subject ALWAYS comes from invitationSubject — even on the full-HTML path", async () => {
    process.env.WAVE_D_CUSTOM_HTML_EMAIL_ENABLED = "1";
    await sendAssessmentInvitationEmail({
      ...baseData(),
      invitationBodyHtml: '<p>{{invitationUrl}}</p>',
    });
    const args = mockSendEmailViaSMTP.mock.calls[0][0];
    expect(args.subject).toBe("Take Q1 Alignment");
    // The credential never leaks into the subject.
    expect(args.subject).not.toContain("#t=");
  });

  it("a PII token value with <script> is neutralized by the post-interpolation sanitize", async () => {
    process.env.WAVE_D_CUSTOM_HTML_EMAIL_ENABLED = "1";
    await sendAssessmentInvitationEmail({
      ...baseData(),
      respondent: { id: "r1", firstName: '<script>alert(1)</script>', lastName: "Doe", email: "x@y.z" },
      invitationBodyHtml: '<p>Hi {{respondentFirstName}} {{invitationUrl}}</p>',
    });
    const args = mockSendEmailViaSMTP.mock.calls[0][0];
    expect(args.html).not.toContain("<script>");
    expect(args.html).not.toContain("alert(1)</script>");
  });

  it("flag OFF → invitationBodyHtml ignored, branded shell used", async () => {
    delete process.env.WAVE_D_CUSTOM_HTML_EMAIL_ENABLED;
    await sendAssessmentInvitationEmail({
      ...baseData(),
      invitationBodyHtml: '<h1>Custom</h1><p>{{invitationUrl}}</p>',
    });
    const args = mockSendEmailViaSMTP.mock.calls[0][0];
    expect(args.html).not.toContain("<h1>Custom</h1>");
    expect(args.html).toContain("Start the assessment"); // shell CTA present
    expect((args.attachments ?? []).length).toBeGreaterThan(0); // CID logo present
  });

  it("markdown-only (no HTML) → branded shell", async () => {
    process.env.WAVE_D_CUSTOM_HTML_EMAIL_ENABLED = "1";
    await sendAssessmentInvitationEmail({ ...baseData(), invitationBodyHtml: null });
    const args = mockSendEmailViaSMTP.mock.calls[0][0];
    expect(args.html).toContain("Start the assessment"); // shell CTA present
    expect((args.attachments ?? []).length).toBeGreaterThan(0);
  });

  it("pin #2 — a stored &#123;&#123;invitationUrl&#125;&#125; stays inert (no resurrected token)", async () => {
    process.env.WAVE_D_CUSTOM_HTML_EMAIL_ENABLED = "1";
    await sendAssessmentInvitationEmail({
      ...baseData(),
      invitationBodyHtml: '<p>&#123;&#123;invitationUrl&#125;&#125; {{invitationUrl}}</p>',
    });
    const args = mockSendEmailViaSMTP.mock.calls[0][0];
    // The live credential appears exactly once (from the real token only).
    expect(args.html.split("#t=SECRET").length - 1).toBe(1);
  });
});
