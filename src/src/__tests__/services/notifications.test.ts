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

jest.mock("@/lib/utils", () => ({
  formatDate: jest.fn().mockReturnValue("May 1, 2026"),
  formatCurrency: jest.fn(),
  generateSlug: jest.fn(),
  getWorkshopStatusLabel: jest.fn(),
}));

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
    expect(firstCall.attachments[0].contentType).toBe("text/calendar");

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
});
