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

jest.mock("@/lib/smtp-transport", () => {
  const sendEmailViaSMTP = jest.fn().mockResolvedValue(undefined);
  return {
    sendEmailViaSMTP,
    prepareEmailViaSMTP: jest.fn((options) => ({
      send: () => sendEmailViaSMTP(options),
    })),
  };
});

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

import {
  prepareAssessmentInvitationEmail,
  sendWorkshopDateChangeEmail,
} from "@/services/notifications";
import { db } from "@/lib/db";
import {
  prepareEmailViaSMTP,
  sendEmailViaSMTP,
} from "@/lib/smtp-transport";
import { generateIcsContent, buildLocationString } from "@/lib/ics-generator";

// Typed mock aliases for easy use in tests
const mockFindMany = db.registration.findMany as jest.Mock;
const mockSendEmailViaSMTP = sendEmailViaSMTP as jest.Mock;
const mockPrepareEmailViaSMTP = prepareEmailViaSMTP as jest.Mock;
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
    void _unused;
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
    void _unused;
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

describe("sendAssessmentInvitationEmail — custom HTML render selection (#220)", () => {
  const ORIGINAL_FLAG = process.env.WAVE_D_CUSTOM_HTML_EMAIL_ENABLED;
  const ORIGINAL_BRANDED_CUSTOM_HTML =
    process.env.ASSESSMENT_INVITE_BRANDED_CUSTOM_HTML_ENABLED;
  const ORIGINAL_BRANDED = process.env.ASSESSMENT_INVITE_BRANDED;

  const baseData = () => ({
    invitation: { id: "inv1", expiresAt: new Date("2026-07-01T00:00:00Z") },
    respondent: { id: "r1", firstName: "Jane", lastName: "Doe", email: "jane@example.com" },
    campaign: { id: "c1", name: "Q1 Alignment", alias: "abc", closeAt: null as Date | null },
    template: {
      alias: "five-dysfunctions",
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
    delete process.env.WAVE_D_CUSTOM_HTML_EMAIL_ENABLED;
    delete process.env.ASSESSMENT_INVITE_BRANDED_CUSTOM_HTML_ENABLED;
  });

  it("prepares the complete rendered email before exposing the provider handoff", async () => {
    const prepared = prepareAssessmentInvitationEmail({
      ...baseData(),
      redactErrors: true,
      coalesceVerification: true,
    });

    expect(mockPrepareEmailViaSMTP).toHaveBeenCalledTimes(1);
    const preparedOptions = mockPrepareEmailViaSMTP.mock.calls[0][0];
    expect(preparedOptions).toEqual(
      expect.objectContaining({
        to: "jane@example.com",
        subject: "Take Q1 Alignment",
        redactErrors: true,
        html: expect.stringContaining(
          "https://app.test/org-survey/abc#t=SECRET"
        ),
      })
    );
    expect(mockSendEmailViaSMTP).not.toHaveBeenCalled();

    await prepared.send();

    expect(mockSendEmailViaSMTP).toHaveBeenCalledWith(preparedOptions);
  });

  it("leaves delivery-error telemetry unchanged without the J65 handoff opt-in", () => {
    prepareAssessmentInvitationEmail(baseData());

    expect(mockPrepareEmailViaSMTP).toHaveBeenLastCalledWith(
      expect.not.objectContaining({
        redactErrors: expect.anything(),
        coalesceVerification: expect.anything(),
      })
    );
  });

  // This catches a regression where the notification chokepoint lets legacy
  // full-replacement policy bypass the universal platform-owned shell.
  it("wraps universal custom HTML in the platform shell without the GH #220 flag", async () => {
    setEnvFlag("WAVE_D_CUSTOM_HTML_EMAIL_ENABLED", true);

    const prepared = prepareAssessmentInvitationEmail({
      ...baseData(),
      chrome: "universalBanner",
      coachByline: {
        mode: "image_name",
        coachName: "Pat Coach",
        coachImageUrl: "https://cdn.test/pat.png",
      },
      invitationBodyHtml: "<p>Custom-only body</p>",
    });
    await prepared.send();

    const options = mockSendEmailViaSMTP.mock.calls[0][0];
    expect(options.html).toContain("Custom-only body");
    expect(options.html).toContain("cid:sulogo");
    expect(options.html).toContain("Your coach");
    expect(options.html).toContain("Pat Coach");
    expect(options.html).toContain("Start the assessment");
    expect(options.html).toContain("https://app.test/org-survey/abc#t=SECRET");
    expect(options.html).toContain("&mdash; Scaling Up Platform");
    expect(options.telemetry.metadata).toMatchObject({
      customHtmlMode: "branded_body",
      coachBylineMode: "image_name",
    });
  });

  it("renders a universal name-only byline without an image", async () => {
    const prepared = prepareAssessmentInvitationEmail({
      ...baseData(),
      chrome: "universalBanner",
      coachByline: { mode: "name_only", coachName: "Avery Coach" },
    });
    await prepared.send();

    const options = mockSendEmailViaSMTP.mock.calls[0][0];
    expect(options.html).toContain("Your coach");
    expect(options.html).toContain("Avery Coach");
    expect(options.html).not.toContain("https://cdn.test/");
    expect(options.telemetry.metadata.coachBylineMode).toBe("name_only");
  });

  it("omits the universal coach byline for Scaling Up-only invitations", async () => {
    const prepared = prepareAssessmentInvitationEmail({
      ...baseData(),
      chrome: "universalBanner",
      coachByline: { mode: "scaling_up_only" },
    });
    await prepared.send();

    const options = mockSendEmailViaSMTP.mock.calls[0][0];
    expect(options.html).toContain("cid:sulogo");
    expect(options.html).not.toContain("Your coach");
    expect(options.text).not.toContain("Coach:");
    expect(options.telemetry.metadata.coachBylineMode).toBe("scaling_up_only");
  });

  it("keeps an empty sanitized universal custom fragment inside a usable shell", async () => {
    setEnvFlag("WAVE_D_CUSTOM_HTML_EMAIL_ENABLED", true);
    const prepared = prepareAssessmentInvitationEmail({
      ...baseData(),
      chrome: "universalBanner",
      coachByline: { mode: "scaling_up_only" },
      invitationBodyHtml: '<script>alert(1)</script><iframe src="https://evil.test"></iframe>',
    });
    await prepared.send();

    const options = mockSendEmailViaSMTP.mock.calls[0][0];
    expect(options.html).toContain("cid:sulogo");
    expect(options.html).toContain("Start the assessment");
    expect(options.html).toContain("https://app.test/org-survey/abc#t=SECRET");
    expect(options.html).not.toContain("alert(1)");
  });

  it("escapes universal custom-HTML token values before composing the shell", async () => {
    setEnvFlag("WAVE_D_CUSTOM_HTML_EMAIL_ENABLED", true);
    const prepared = prepareAssessmentInvitationEmail({
      ...baseData(),
      chrome: "universalBanner",
      coachByline: { mode: "name_only", coachName: "Pat <Coach>" },
      respondent: {
        id: "r1",
        firstName: '<img src=x onerror="alert(1)">',
        lastName: "Doe",
        email: "jane@example.com",
      },
      invitationBodyHtml: "<p>Hello {{respondentFirstName}}</p>",
    });
    await prepared.send();

    const html = mockSendEmailViaSMTP.mock.calls[0][0].html;
    expect(html).toContain("Pat &lt;Coach&gt;");
    expect(html).toContain('Hello &lt;img src=x onerror="alert(1)"&gt;');
    expect(html).not.toContain('<img src=x onerror="alert(1)">');
  });

  it("never selects full replacement for tokenless universal custom HTML", async () => {
    setEnvFlag("WAVE_D_CUSTOM_HTML_EMAIL_ENABLED", true);
    const prepared = prepareAssessmentInvitationEmail({
      ...baseData(),
      chrome: "universalBanner",
      coachByline: { mode: "scaling_up_only" },
      invitationBodyHtml: "<p>Tokenless custom body</p>",
    });
    await prepared.send();

    const options = mockSendEmailViaSMTP.mock.calls[0][0];
    expect(options.html).toContain("cid:sulogo");
    expect(options.attachments).toEqual(
      expect.arrayContaining([expect.objectContaining({ cid: "sulogo" })]),
    );
    expect(options.telemetry.metadata.customHtmlMode).toBe("branded_body");
  });

  it("uses the same universal text structure for Markdown and custom HTML bodies", async () => {
    const universalInput = {
      chrome: "universalBanner" as const,
      coachByline: { mode: "name_only" as const, coachName: "Pat Coach" },
    };
    const markdownPrepared = prepareAssessmentInvitationEmail({
      ...baseData(),
      ...universalInput,
      template: {
        ...baseData().template,
        invitationBodyMarkdown: "Shared body",
      },
    });
    await markdownPrepared.send();
    const markdownText = mockSendEmailViaSMTP.mock.calls[0][0].text;

    mockSendEmailViaSMTP.mockClear();
    setEnvFlag("WAVE_D_CUSTOM_HTML_EMAIL_ENABLED", true);
    const customPrepared = prepareAssessmentInvitationEmail({
      ...baseData(),
      ...universalInput,
      invitationBodyHtml: "<p>Shared body</p>",
    });
    await customPrepared.send();

    expect(mockSendEmailViaSMTP.mock.calls[0][0].text).toBe(markdownText);
  });

  it("propagates SMTP failures from universal custom-HTML delivery", async () => {
    setEnvFlag("WAVE_D_CUSTOM_HTML_EMAIL_ENABLED", true);
    mockSendEmailViaSMTP.mockRejectedValueOnce(new Error("smtp unavailable"));

    const prepared = prepareAssessmentInvitationEmail({
      ...baseData(),
      chrome: "universalBanner",
      coachByline: { mode: "scaling_up_only" },
      invitationBodyHtml: "<p>Custom-only body</p>",
    });

    await expect(prepared.send()).rejects.toThrow("smtp unavailable");
  });

  afterAll(() => {
    if (ORIGINAL_FLAG === undefined) delete process.env.WAVE_D_CUSTOM_HTML_EMAIL_ENABLED;
    else process.env.WAVE_D_CUSTOM_HTML_EMAIL_ENABLED = ORIGINAL_FLAG;
    if (ORIGINAL_BRANDED === undefined) delete process.env.ASSESSMENT_INVITE_BRANDED;
    else process.env.ASSESSMENT_INVITE_BRANDED = ORIGINAL_BRANDED;
    if (ORIGINAL_BRANDED_CUSTOM_HTML === undefined) {
      delete process.env.ASSESSMENT_INVITE_BRANDED_CUSTOM_HTML_ENABLED;
    } else {
      process.env.ASSESSMENT_INVITE_BRANDED_CUSTOM_HTML_ENABLED =
        ORIGINAL_BRANDED_CUSTOM_HTML;
    }
  });

  function setEnvFlag(name: string, enabled: boolean): void {
    if (enabled) process.env[name] = "1";
    else delete process.env[name];
  }

  it.each([
    ["wave D off", false, false, "<p>{{invitationUrl}}</p>", "branded"],
    ["empty HTML", true, true, "   ", "branded"],
    ["legacy token body", true, false, "<p>{{invitationUrl}}</p>", "full_replace"],
    ["rollback tokenless body", true, false, "<p>Coach body</p>", "branded_fallback"],
    ["branded token body", true, true, "<p>{{invitationUrl}}</p>", "branded_body"],
    ["branded tokenless body", true, true, "<p>Coach body</p>", "branded_body"],
  ] as const)(
    "%s selects the expected mode",
    async (_label, waveD, brandedMode, invitationBodyHtml, expected) => {
      setEnvFlag("WAVE_D_CUSTOM_HTML_EMAIL_ENABLED", waveD);
      setEnvFlag("ASSESSMENT_INVITE_BRANDED_CUSTOM_HTML_ENABLED", brandedMode);
      await sendAssessmentInvitationEmail({
        ...baseData(),
        invitationBodyHtml,
      });
      const options = mockSendEmailViaSMTP.mock.calls[0][0];

      if (expected === "full_replace") {
        expect(options.html).not.toContain("cid:sulogo");
        expect(options.attachments ?? []).toHaveLength(0);
        expect(options.telemetry.metadata).toMatchObject({
          renderer: "custom_html",
          bodySource: "custom_html",
          customHtmlMode: "full_replace",
        });
      } else if (expected === "branded_body") {
        expect(options.html).toContain("cid:sulogo");
        expect(options.html).toContain("Start the assessment");
        expect(options.attachments).toEqual(
          expect.arrayContaining([expect.objectContaining({ cid: "sulogo" })]),
        );
        expect(options.telemetry.metadata).toMatchObject({
          renderer: "custom_html",
          bodySource: "custom_html",
          customHtmlMode: "branded_body",
        });
      } else {
        expect(options.html).toContain("cid:sulogo");
        expect(options.telemetry.metadata.renderer).toBe("branded");
      }
    },
  );

  it("uses the compatibility full-replacement mode for legacy URL-token HTML", async () => {
    setEnvFlag("WAVE_D_CUSTOM_HTML_EMAIL_ENABLED", true);
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
    expect(args.html).not.toContain("cid:sulogo");
    // No CID logo attachment on the full-HTML path.
    expect(args.attachments ?? []).toHaveLength(0);
  });

  it("subject ALWAYS comes from invitationSubject — including branded-body HTML", async () => {
    setEnvFlag("WAVE_D_CUSTOM_HTML_EMAIL_ENABLED", true);
    setEnvFlag("ASSESSMENT_INVITE_BRANDED_CUSTOM_HTML_ENABLED", true);
    await sendAssessmentInvitationEmail({
      ...baseData(),
      invitationBodyHtml: '<p>{{invitationUrl}}</p>',
    });
    const args = mockSendEmailViaSMTP.mock.calls[0][0];
    expect(args.subject).toBe("Take Q1 Alignment");
    // The credential never leaks into the subject.
    expect(args.subject).not.toContain("#t=");
  });

  it("sanitizes dangerous custom markup and post-interpolation PII markup in branded-body mode", async () => {
    setEnvFlag("WAVE_D_CUSTOM_HTML_EMAIL_ENABLED", true);
    setEnvFlag("ASSESSMENT_INVITE_BRANDED_CUSTOM_HTML_ENABLED", true);
    await sendAssessmentInvitationEmail({
      ...baseData(),
      respondent: { id: "r1", firstName: '<script>alert(1)</script>', lastName: "Doe", email: "x@y.z" },
      invitationBodyHtml: '<script>alert(1)</script><iframe src="https://evil.test"></iframe><p onclick="alert(1)" style="position:fixed;behavior:url(x)">Hi {{respondentFirstName}} {{invitationUrl}}</p>',
    });
    const args = mockSendEmailViaSMTP.mock.calls[0][0];
    expect(args.html).not.toContain("<script>");
    expect(args.html).not.toContain("alert(1)</script>");
    expect(args.html).not.toContain("iframe");
    expect(args.html).not.toContain("onclick");
    expect(args.html).not.toContain("position:fixed");
    expect(args.html).toContain("cid:sulogo");
  });

  it("flag OFF → invitationBodyHtml ignored, branded shell used", async () => {
    setEnvFlag("WAVE_D_CUSTOM_HTML_EMAIL_ENABLED", false);
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
    setEnvFlag("WAVE_D_CUSTOM_HTML_EMAIL_ENABLED", true);
    await sendAssessmentInvitationEmail({ ...baseData(), invitationBodyHtml: null });
    const args = mockSendEmailViaSMTP.mock.calls[0][0];
    expect(args.html).toContain("Start the assessment"); // shell CTA present
    expect((args.attachments ?? []).length).toBeGreaterThan(0);
  });

  it("pin #2 — a stored &#123;&#123;invitationUrl&#125;&#125; stays inert (no resurrected token)", async () => {
    setEnvFlag("WAVE_D_CUSTOM_HTML_EMAIL_ENABLED", true);
    await sendAssessmentInvitationEmail({
      ...baseData(),
      invitationBodyHtml: '<p>&#123;&#123;invitationUrl&#125;&#125; {{invitationUrl}}</p>',
    });
    const args = mockSendEmailViaSMTP.mock.calls[0][0];
    // The live credential appears exactly once (from the real token only).
    expect(args.html.split("#t=SECRET").length - 1).toBe(1);
  });

  it("falls back to the authored branded body without recording custom HTML PII", async () => {
    setEnvFlag("WAVE_D_CUSTOM_HTML_EMAIL_ENABLED", true);
    await sendAssessmentInvitationEmail({
      ...baseData(),
      invitationBodyHtml: "<p>Coach body</p>",
    });

    const fallback = mockSendEmailViaSMTP.mock.calls[0][0];
    expect(fallback.html).toContain("Hi Jane");
    expect(fallback.html).not.toContain("Coach body");
    expect(fallback.telemetry.metadata).toMatchObject({
      renderer: "branded",
      bodySource: "authored",
      customHtmlFallbackReason:
        "branded_mode_disabled_missing_url_token",
    });
    expect(JSON.stringify(fallback.telemetry.metadata)).not.toContain("#t=");
    expect(JSON.stringify(fallback.telemetry.metadata)).not.toContain("Coach body");
  });

  it("keeps an empty sanitized fragment inside the branded shell", async () => {
    setEnvFlag("WAVE_D_CUSTOM_HTML_EMAIL_ENABLED", true);
    setEnvFlag("ASSESSMENT_INVITE_BRANDED_CUSTOM_HTML_ENABLED", true);
    await sendAssessmentInvitationEmail({
      ...baseData(),
      invitationBodyHtml: '<script>alert(1)</script><iframe src="https://evil.test"></iframe>',
    });

    const args = mockSendEmailViaSMTP.mock.calls[0][0];
    expect(args.html).toContain("cid:sulogo");
    expect(args.html).toContain("Start the assessment");
    expect(args.html).not.toContain("alert(1)");
    expect(args.text).toBe(
      "Scaling Up Platform\nCoach: Pat Coach\n\nStart the assessment: https://app.test/org-survey/abc#t=SECRET",
    );
  });

  it("preserves duplicate authored URLs and adds the platform CTA in branded-body mode", async () => {
    setEnvFlag("WAVE_D_CUSTOM_HTML_EMAIL_ENABLED", true);
    setEnvFlag("ASSESSMENT_INVITE_BRANDED_CUSTOM_HTML_ENABLED", true);
    await sendAssessmentInvitationEmail({
      ...baseData(),
      invitationBodyHtml:
        '<p><a href="{{invitationUrl}}">First</a> <a href="{{invitationUrl}}">Second</a></p>',
    });

    const args = mockSendEmailViaSMTP.mock.calls[0][0];
    expect(args.html).toContain("First");
    expect(args.html).toContain("Second");
    expect(args.html).toContain("Start the assessment");
    expect(args.html.match(/#t=SECRET/g)).toHaveLength(4);
  });

  it("uses the Wave-P coach image only when its URL is safe", async () => {
    setEnvFlag("WAVE_D_CUSTOM_HTML_EMAIL_ENABLED", true);
    setEnvFlag("ASSESSMENT_INVITE_BRANDED_CUSTOM_HTML_ENABLED", true);
    await sendAssessmentInvitationEmail({
      ...baseData(),
      chrome: "waveP",
      coachLogoUrl: "https://images.example/coach.png",
      invitationBodyHtml: "<p>Coach body</p>",
    });
    expect(mockSendEmailViaSMTP.mock.calls[0][0].html).toContain(
      'src="https://images.example/coach.png"',
    );

    mockSendEmailViaSMTP.mockClear();
    await sendAssessmentInvitationEmail({
      ...baseData(),
      chrome: "waveP",
      coachLogoUrl: "javascript:alert(1)",
      invitationBodyHtml: "<p>Coach body</p>",
    });
    expect(mockSendEmailViaSMTP.mock.calls[0][0].html).not.toContain("javascript:");
  });

  it("adds the survey link to branded-body plain text when custom HTML only uses it as an href", async () => {
    setEnvFlag("WAVE_D_CUSTOM_HTML_EMAIL_ENABLED", true);
    setEnvFlag("ASSESSMENT_INVITE_BRANDED_CUSTOM_HTML_ENABLED", true);
    await sendAssessmentInvitationEmail({
      ...baseData(),
      invitationBodyHtml: '<a href="{{invitationUrl}}">Open assessment</a>',
    });

    const args = mockSendEmailViaSMTP.mock.calls[0][0];
    expect(args.text).toBe(
      "Scaling Up Platform\nCoach: Pat Coach\n\nOpen assessment\n\nStart the assessment: https://app.test/org-survey/abc#t=SECRET",
    );
  });

  it("adds the optional Coach line to branded-body plain text", async () => {
    setEnvFlag("WAVE_D_CUSTOM_HTML_EMAIL_ENABLED", true);
    setEnvFlag("ASSESSMENT_INVITE_BRANDED_CUSTOM_HTML_ENABLED", true);
    await sendAssessmentInvitationEmail({
      ...baseData(),
      coachName: "  Avery Coach  ",
      invitationBodyHtml: "<p>Coach body</p>",
    });

    expect(mockSendEmailViaSMTP.mock.calls[0][0].text).toContain("Coach: Avery Coach");
  });

  it("keeps ASSESSMENT_INVITE_BRANDED=0 on the legacy renderer even when both custom HTML flags are enabled", async () => {
    process.env.ASSESSMENT_INVITE_BRANDED = "0";
    setEnvFlag("WAVE_D_CUSTOM_HTML_EMAIL_ENABLED", true);
    setEnvFlag("ASSESSMENT_INVITE_BRANDED_CUSTOM_HTML_ENABLED", true);
    await sendAssessmentInvitationEmail({
      ...baseData(),
      invitationBodyHtml: "<p>Custom-only body</p>",
    });

    const args = mockSendEmailViaSMTP.mock.calls[0][0];
    expect(args.html).toContain("Hi Jane");
    expect(args.html).not.toContain("Custom-only body");
    expect(args.telemetry.metadata.renderer).toBe("legacy");
  });

  it("propagates SMTP failures from branded-body delivery", async () => {
    setEnvFlag("WAVE_D_CUSTOM_HTML_EMAIL_ENABLED", true);
    setEnvFlag("ASSESSMENT_INVITE_BRANDED_CUSTOM_HTML_ENABLED", true);
    mockSendEmailViaSMTP.mockRejectedValueOnce(new Error("smtp unavailable"));

    await expect(
      sendAssessmentInvitationEmail({
        ...baseData(),
        invitationBodyHtml: "<p>Coach body</p>",
      }),
    ).rejects.toThrow("smtp unavailable");
  });
});

// ===========================================================================
// sendAssessmentInvitationEmail — default body/subject at the send chokepoint
// (Wave G) + legacy subject hardening + send telemetry
// ===========================================================================

// A distinctive phrase from DEFAULT_INVITATION_BODY (lib/assessments/invitation-defaults.ts).
// Apostrophe-free substring so it matches in both the HTML-escaped body
// ("You&#039;ve been invited to complete") and the unescaped plain-text body.
const DEFAULT_BODY_PHRASE = "been invited to complete";
const DEFAULT_SUBJECT = "Your Scaling Up assessment invitation";
const DEFAULT_VERSION = "wave-g-1";

describe("sendAssessmentInvitationEmail — default body/subject + telemetry (Wave G)", () => {
  const ORIGINAL_FLAG = process.env.WAVE_D_CUSTOM_HTML_EMAIL_ENABLED;
  const ORIGINAL_BRANDED = process.env.ASSESSMENT_INVITE_BRANDED;

  // baseData with BLANK subject + body so defaults kick in.
  const blankData = () => ({
    invitation: { id: "inv1", expiresAt: new Date("2026-07-01T00:00:00Z") },
    respondent: { id: "r1", firstName: "Jane", lastName: "Doe", email: "jane@example.com" },
    campaign: { id: "c1", name: "Q1 Alignment", alias: "abc", closeAt: null as Date | null },
    template: {
      alias: "five-dysfunctions",
      invitationSubject: "",
      invitationBodyMarkdown: "   ", // whitespace-only — must be treated as blank
    },
    organizationName: "Acme Corp",
    coachName: "Pat Coach",
    templateName: "Five Dysfunctions",
    rawToken: "SECRET",
    baseUrl: "https://app.test",
  });

  beforeEach(() => {
    mockSendEmailViaSMTP.mockClear();
    delete process.env.ASSESSMENT_INVITE_BRANDED; // branded path on by default
    delete process.env.WAVE_D_CUSTOM_HTML_EMAIL_ENABLED;
  });

  afterEach(() => {
    if (ORIGINAL_FLAG === undefined) delete process.env.WAVE_D_CUSTOM_HTML_EMAIL_ENABLED;
    else process.env.WAVE_D_CUSTOM_HTML_EMAIL_ENABLED = ORIGINAL_FLAG;
    if (ORIGINAL_BRANDED === undefined) delete process.env.ASSESSMENT_INVITE_BRANDED;
    else process.env.ASSESSMENT_INVITE_BRANDED = ORIGINAL_BRANDED;
  });

  it("1. branded + blank subject & body → defaults fill in + telemetry says default", async () => {
    await sendAssessmentInvitationEmail(blankData());
    const args = mockSendEmailViaSMTP.mock.calls[0][0];
    expect(args.subject).toBe(DEFAULT_SUBJECT);
    // The default body's distinctive phrase appears in the rendered HTML and text.
    expect(args.html).toContain(DEFAULT_BODY_PHRASE);
    expect(args.text).toContain(DEFAULT_BODY_PHRASE);
    expect(args.telemetry.metadata).toMatchObject({
      renderer: "branded",
      subjectSource: "default",
      bodySource: "default",
      defaultVersion: DEFAULT_VERSION,
    });
  });

  it("2. branded + authored subject & body → defaults NOT used", async () => {
    await sendAssessmentInvitationEmail({
      ...blankData(),
      template: {
        alias: "five-dysfunctions",
        invitationSubject: "Take {{campaignName}}",
        invitationBodyMarkdown: "Hello {{respondentFirstName}}, please begin.",
      },
    });
    const args = mockSendEmailViaSMTP.mock.calls[0][0];
    expect(args.subject).toBe("Take Q1 Alignment");
    expect(args.subject).not.toBe(DEFAULT_SUBJECT);
    expect(args.html).toContain("Hello Jane, please begin.");
    expect(args.html).not.toContain(DEFAULT_BODY_PHRASE);
    expect(args.telemetry.metadata).toMatchObject({
      renderer: "branded",
      subjectSource: "authored",
      bodySource: "authored",
      defaultVersion: null,
    });
  });

  it("3. legacy (ASSESSMENT_INVITE_BRANDED=0) + blank → default subject + body with resolved org/template tokens", async () => {
    process.env.ASSESSMENT_INVITE_BRANDED = "0";
    await sendAssessmentInvitationEmail(blankData());
    const args = mockSendEmailViaSMTP.mock.calls[0][0];
    expect(args.subject).toBe(DEFAULT_SUBJECT);
    expect(args.html).toContain(DEFAULT_BODY_PHRASE);
    // The default body interpolates {{templateName}} + {{organizationName}} —
    // the OLD legacy substitute() didn't know those tokens.
    expect(args.html).toContain("Five Dysfunctions");
    expect(args.html).toContain("Acme Corp");
    expect(args.telemetry.metadata).toMatchObject({
      type: "assessment_invitation_legacy",
      renderer: "legacy",
      subjectSource: "default",
      bodySource: "default",
      defaultVersion: DEFAULT_VERSION,
    });
  });

  it("4. legacy + authored subject with raw CR/LF + url token → renderSubject strips the credential and control chars", async () => {
    process.env.ASSESSMENT_INVITE_BRANDED = "0";
    await sendAssessmentInvitationEmail({
      ...blankData(),
      template: {
        alias: "five-dysfunctions",
        invitationSubject: "Hi {{invitationUrl}}\r\ninjected",
        invitationBodyMarkdown: "body",
      },
    });
    const args = mockSendEmailViaSMTP.mock.calls[0][0];
    // The header-injection / credential leak is closed by renderSubject.
    expect(args.subject).not.toContain("#t=");
    expect(args.subject).not.toContain("\r");
    expect(args.subject).not.toContain("\n");
    expect(args.subject).not.toContain("https://app.test");
  });

  it("5. custom-HTML + blank subject → subject defaulted, body is the full HTML (not the default body)", async () => {
    process.env.WAVE_D_CUSTOM_HTML_EMAIL_ENABLED = "1";
    await sendAssessmentInvitationEmail({
      ...blankData(),
      invitationBodyHtml: '<h1>Custom</h1><p>Hi {{respondentFirstName}}</p><a href="{{invitationUrl}}">Start</a>',
    });
    const args = mockSendEmailViaSMTP.mock.calls[0][0];
    expect(args.subject).toBe(DEFAULT_SUBJECT);
    // The full HTML is the body — the default body phrase is ABSENT.
    expect(args.html).toContain("<h1>Custom</h1>");
    expect(args.html).not.toContain(DEFAULT_BODY_PHRASE);
    expect(args.telemetry.metadata).toMatchObject({
      renderer: "custom_html",
      bodySource: "custom_html",
      subjectSource: "default",
      defaultVersion: DEFAULT_VERSION,
    });
  });

  it("legacy threads coachName into HTML and plain text", async () => {
    process.env.ASSESSMENT_INVITE_BRANDED = "0";
    await sendAssessmentInvitationEmail({
      ...blankData(),
      template: {
        invitationSubject: "Assessment from {{coachName}}",
        invitationBodyMarkdown: "{{coachName}} has invited you.",
      },
    });

    const args = mockSendEmailViaSMTP.mock.calls[0][0];
    expect(args.subject).toBe("Assessment from Pat Coach");
    expect(args.html).toContain("Pat Coach has invited you.");
    expect(args.text).toContain("Pat Coach has invited you.");
  });

  it("legacy uses the established neutral Coach fallback", async () => {
    process.env.ASSESSMENT_INVITE_BRANDED = "0";
    await sendAssessmentInvitationEmail({
      ...blankData(),
      coachName: null,
      template: {
        invitationSubject: "Your assessment",
        invitationBodyMarkdown: "{{coachName}} has invited you.",
      },
    });

    const args = mockSendEmailViaSMTP.mock.calls[0][0];
    expect(args.html).toContain("your coach has invited you.");
    expect(args.text).toContain("your coach has invited you.");
  });

  it("legacy sends multipart text and one canonical visible fallback", async () => {
    process.env.ASSESSMENT_INVITE_BRANDED = "0";
    await sendAssessmentInvitationEmail({
      ...blankData(),
      template: {
        invitationSubject: "Your assessment",
        invitationBodyMarkdown:
          "Hi {{respondentFirstName}}\n\n[Start now]({{invitationUrl}})",
      },
    });

    const args = mockSendEmailViaSMTP.mock.calls[0][0];
    const invitationUrl = "https://app.test/org-survey/abc#t=SECRET";

    expect(args.html).toContain("background-color:#1D4ED8");
    expect(args.html).toContain("If the button doesn't work, paste this into your browser:");
    expect(args.html).toContain(`<span style="word-break:break-all;color:#6b7280;">${invitationUrl}</span>`);
    expect(args.text).toBe(`Hi Jane\n\nStart the assessment: ${invitationUrl}`);
    expect(args.text.match(/#t=SECRET/g)).toHaveLength(1);
    expect(args.attachments ?? []).toHaveLength(0);
    expect(args.telemetry.metadata).toMatchObject({
      type: "assessment_invitation_legacy",
      renderer: "legacy",
      subjectSource: "authored",
      bodySource: "authored",
      defaultVersion: null,
    });
  });

  it("legacy escapes the generated URL in its href and visible fallback", async () => {
    process.env.ASSESSMENT_INVITE_BRANDED = "0";
    await sendAssessmentInvitationEmail({
      ...blankData(),
      baseUrl: 'https://app.test/\"><script>alert(1)</script>',
    });

    const args = mockSendEmailViaSMTP.mock.calls[0][0];
    const escapedInvitationUrl =
      "https://app.test/&quot;&gt;&lt;script&gt;alert(1)&lt;/script&gt;/org-survey/abc#t=SECRET";

    expect({
      href: args.html.includes(`<a href="${escapedInvitationUrl}"`),
      visibleFallback: args.html.includes(
        `<span style="word-break:break-all;color:#6b7280;">${escapedInvitationUrl}</span>`,
      ),
    }).toEqual({
      href: true,
      visibleFallback: true,
    });
    expect(args.html).not.toContain("<script>");
    expect(args.html).not.toContain('\"><script');
  });

  it("branded rendering remains multipart with its CID attachment", async () => {
    await sendAssessmentInvitationEmail(blankData());

    const args = mockSendEmailViaSMTP.mock.calls[0][0];
    expect(args.html).toContain("cid:sulogo");
    expect(args.text).toContain("Start the assessment:");
    expect(args.attachments).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ cid: "sulogo", filename: "su-logo.png" }),
      ]),
    );
    expect(args.telemetry.metadata.renderer).toBe("branded");
  });
});
