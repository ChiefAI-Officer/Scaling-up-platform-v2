jest.mock("@/lib/db", () => ({
  db: {
    user: {
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

import { db } from "@/lib/db";
import { sendEmailViaSMTP } from "@/lib/smtp-transport";
import {
  sendApprovalRequest,
  sendApprovalCoachRespondedEmail,
  sendCustomPriceChangeEmail,
  sendCounterOfferAcceptedEmail,
  sendCoachDeclinedCounterEmail,
  sendEnrichedApprovalRequest,
  sendPaidRegistrationNotificationStrict,
  sendRegistrationNotification,
  sendEscalation,
  sendWorkshopCompletionSummary,
  sendWorkshopRequestedEmail,
} from "@/services/notifications";

const mockFindUsers = db.user.findMany as jest.Mock;
const mockSendEmail = sendEmailViaSMTP as jest.Mock;

describe("admin alert notification fan-out", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    delete process.env.TEAMS_WEBHOOK_URL;
    mockFindUsers.mockResolvedValue([
      { email: "admin-one@example.com" },
      { email: "staff-two@example.com" },
    ]);
    mockSendEmail.mockResolvedValue(undefined);
  });

  it("sends an approval request separately to every resolved admin/staff recipient with telemetry", async () => {
    await sendApprovalRequest({
      id: "approval-1",
      type: "CUSTOM_PRICING",
      coachName: "Casey Coach",
      details: "Requested a custom price",
      requestedAt: new Date("2026-09-11T12:00:00Z"),
      amount: 125000,
    });

    expect(mockSendEmail).toHaveBeenCalledTimes(2);
    expect(mockSendEmail.mock.calls.map(([email]) => email.to)).toEqual([
      "admin-one@example.com",
      "staff-two@example.com",
    ]);
    for (const [email] of mockSendEmail.mock.calls) {
      expect(email.subject).toContain("[ACTION REQUIRED]");
      expect(email.telemetry).toMatchObject({
        recipientRole: "STAFF",
        metadata: {
          type: "approval_request",
          approvalId: "approval-1",
        },
      });
    }
  });

  it("does not send alerts to system or soft-deleted admin/staff accounts", async () => {
    const accounts = [
      {
        email: "live-admin@example.com",
        role: "ADMIN",
        deletedAt: null,
        passwordHash: "activated-hash",
      },
      {
        email: "system-seed@scalingup.platform",
        role: "STAFF",
        deletedAt: null,
        passwordHash: null,
      },
      {
        email: "gabriel+waveq-drill@chiefaiofficer.com",
        role: "ADMIN",
        deletedAt: new Date("2026-07-03T00:00:00Z"),
        passwordHash: "activated-hash",
      },
    ] as const;

    mockFindUsers.mockImplementation(async ({ where }) => {
      expect(where).toEqual({
        role: { in: ["ADMIN", "STAFF"] },
        deletedAt: null,
        passwordHash: { not: null },
      });

      return accounts
        .filter((account) =>
          where.role.in.includes(account.role) &&
          account.deletedAt === where.deletedAt &&
          account.passwordHash !== where.passwordHash.not,
        )
        .map(({ email }) => ({ email }));
    });

    await sendApprovalRequest({
      id: "approval-people-only",
      type: "CUSTOM_PRICING",
      coachName: "Casey Coach",
      details: "Requested a custom price",
      requestedAt: new Date("2026-09-11T12:00:00Z"),
    });

    expect(mockSendEmail.mock.calls.map(([email]) => email.to)).toEqual([
      "live-admin@example.com",
    ]);
    expect(mockSendEmail).not.toHaveBeenCalledWith(
      expect.objectContaining({ to: "system-seed@scalingup.platform" }),
    );
    expect(mockSendEmail).not.toHaveBeenCalledWith(
      expect.objectContaining({ to: "gabriel+waveq-drill@chiefaiofficer.com" }),
    );
  });

  it("sends an enriched approval request to every admin/staff recipient with telemetry", async () => {
    await sendEnrichedApprovalRequest({
      approvalId: "approval-2",
      type: "WORKSHOP_REQUEST",
      coachName: "Casey Coach",
      coachEmail: "casey@example.com",
      details: "New workshop",
      requestedAt: new Date("2026-09-11T12:00:00Z"),
    });

    expect(mockSendEmail.mock.calls.map(([email]) => email.to)).toEqual([
      "admin-one@example.com",
      "staff-two@example.com",
    ]);
    for (const [email] of mockSendEmail.mock.calls) {
      expect(email.subject).toContain("[ACTION REQUIRED]");
      expect(email.telemetry).toMatchObject({
        recipientRole: "STAFF",
        metadata: {
          type: "enriched_approval_request",
          approvalId: "approval-2",
        },
      });
    }
  });

  it("fans out the admin copy of a workshop request while sending one coach copy", async () => {
    await sendWorkshopRequestedEmail({
      coachEmail: "casey@example.com",
      coachName: "Casey Coach",
      workshopTitle: "Scaling Up",
      workshopId: "workshop-1",
    });

    expect(mockSendEmail.mock.calls.map(([email]) => email.to)).toEqual([
      "admin-one@example.com",
      "staff-two@example.com",
      "casey@example.com",
    ]);
  });

  it("fans out the admin copy of a registration while sending one coach and attendee copy", async () => {
    await sendRegistrationNotification({
      workshopId: "workshop-1",
      workshopTitle: "Scaling Up",
      workshopCode: "SU-1",
      coachEmail: "casey@example.com",
      coachName: "Casey Coach",
      registrantName: "Riley Registrant",
      registrantEmail: "riley@example.com",
      icsAttachment: { filename: "workshop.ics", content: "BEGIN:VCALENDAR" },
    });

    expect(mockSendEmail.mock.calls.map(([email]) => email.to)).toEqual([
      "admin-one@example.com",
      "staff-two@example.com",
      "casey@example.com",
      "riley@example.com",
    ]);
  });

  it("sends a workshop completion summary to every admin/staff recipient", async () => {
    await sendWorkshopCompletionSummary({
      workshopId: "workshop-1",
      workshopTitle: "Scaling Up",
      workshopCode: "SU-1",
      eventDate: "2026-09-11T12:00:00Z",
      coachName: "Casey Coach",
      totalRegistrations: 0,
      attended: 0,
      paidCount: 0,
      freeCount: 0,
      totalRevenueCents: 0,
      attendees: [],
    });

    expect(mockSendEmail.mock.calls.map(([email]) => email.to)).toEqual([
      "admin-one@example.com",
      "staff-two@example.com",
    ]);
  });

  it("fans out the strict paid-registration admin copy without duplicating coach or attendee copies", async () => {
    await sendPaidRegistrationNotificationStrict({
      workshopId: "workshop-1",
      workshopTitle: "Scaling Up",
      workshopCode: "SU-1",
      coachEmail: "casey@example.com",
      coachName: "Casey Coach",
      registrantName: "Riley Registrant",
      registrantEmail: "riley@example.com",
      icsAttachment: { filename: "workshop.ics", content: "BEGIN:VCALENDAR" },
    });

    expect(mockSendEmail.mock.calls.map(([email]) => email.to)).toEqual([
      "admin-one@example.com",
      "staff-two@example.com",
      "casey@example.com",
      "riley@example.com",
    ]);
  });

  it("resolves recipients for a custom-price alert when no explicit override is supplied", async () => {
    await sendCustomPriceChangeEmail({
      coachName: "Casey Coach",
      workshopTitle: "Scaling Up",
      workshopCode: "SU-1",
      workshopId: "workshop-1",
      oldPriceCents: 100000,
      newPriceCents: 125000,
    });

    expect(mockSendEmail.mock.calls.map(([email]) => email.to)).toEqual([
      "admin-one@example.com",
      "staff-two@example.com",
    ]);
  });

  it("resolves recipients for a coach-response alert when no explicit override is supplied", async () => {
    await sendApprovalCoachRespondedEmail({
      coachName: "Casey Coach",
      workshopTitle: "Scaling Up",
      approvalId: "approval-3",
      coachResponse: "Here are the requested details.",
    });

    expect(mockSendEmail.mock.calls.map(([email]) => email.to)).toEqual([
      "admin-one@example.com",
      "staff-two@example.com",
    ]);
  });

  it("resolves recipients when a coach accepts a counter-offer", async () => {
    await sendCounterOfferAcceptedEmail({
      coachName: "Casey Coach",
      workshopTitle: "Scaling Up",
      approvalId: "approval-4",
      acceptedPriceCents: 110000,
    });

    expect(mockSendEmail.mock.calls.map(([email]) => email.to)).toEqual([
      "admin-one@example.com",
      "staff-two@example.com",
    ]);
  });

  it("resolves recipients when a coach declines a counter-offer", async () => {
    await sendCoachDeclinedCounterEmail({
      coachName: "Casey Coach",
      workshopTitle: "Scaling Up",
      approvalId: "approval-5",
    });

    expect(mockSendEmail.mock.calls.map(([email]) => email.to)).toEqual([
      "admin-one@example.com",
      "staff-two@example.com",
    ]);
  });

  it("keeps escalation on its explicit address and records delivery telemetry", async () => {
    await sendEscalation(
      {
        id: "approval-6",
        type: "CUSTOM_PRICING",
        coachName: "Casey Coach",
        details: "Still pending",
        requestedAt: new Date("2026-09-10T12:00:00Z"),
      },
      "escalations@example.com",
    );

    expect(mockFindUsers).not.toHaveBeenCalled();
    expect(mockSendEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        to: "escalations@example.com",
        subject: expect.stringContaining("[ESCALATION]"),
        telemetry: expect.objectContaining({
          recipientRole: "STAFF",
          metadata: expect.objectContaining({
            type: "approval_escalation",
            approvalId: "approval-6",
          }),
        }),
      }),
    );
  });

  it("continues best-effort fan-out after one admin delivery fails", async () => {
    const errorSpy = jest.spyOn(console, "error").mockImplementation(() => undefined);
    mockSendEmail
      .mockRejectedValueOnce(new Error("bad recipient"))
      .mockResolvedValueOnce(undefined);

    await expect(
      sendApprovalRequest({
        id: "approval-7",
        type: "DATE_CHANGE",
        coachName: "Casey Coach",
        details: "Move the date",
        requestedAt: new Date("2026-09-11T12:00:00Z"),
      }),
    ).resolves.toBeUndefined();

    expect(mockSendEmail.mock.calls.map(([email]) => email.to)).toEqual([
      "admin-one@example.com",
      "staff-two@example.com",
    ]);
    expect(errorSpy).toHaveBeenCalled();
    errorSpy.mockRestore();
  });

  it("does not break the calling flow when every best-effort admin delivery fails", async () => {
    const errorSpy = jest.spyOn(console, "error").mockImplementation(() => undefined);
    mockSendEmail.mockRejectedValue(new Error("SMTP unavailable"));

    await expect(
      sendApprovalRequest({
        id: "approval-8",
        type: "CANCELLATION",
        coachName: "Casey Coach",
        details: "Cancel the workshop",
        requestedAt: new Date("2026-09-11T12:00:00Z"),
      }),
    ).resolves.toBeUndefined();

    expect(mockSendEmail).toHaveBeenCalledTimes(2);
    expect(errorSpy).toHaveBeenCalledTimes(2);
    errorSpy.mockRestore();
  });

  it("attempts every strict delivery before propagating failure for retry", async () => {
    mockSendEmail
      .mockRejectedValueOnce(new Error("temporary SMTP failure"))
      .mockResolvedValueOnce(undefined);

    await expect(
      sendPaidRegistrationNotificationStrict({
        workshopId: "workshop-1",
        workshopTitle: "Scaling Up",
        workshopCode: "SU-1",
        coachEmail: "casey@example.com",
        coachName: "Casey Coach",
        registrantName: "Riley Registrant",
        registrantEmail: "riley@example.com",
        icsAttachment: { filename: "workshop.ics", content: "BEGIN:VCALENDAR" },
      }),
    ).rejects.toThrow("temporary SMTP failure");

    expect(mockSendEmail.mock.calls.map(([email]) => email.to)).toEqual([
      "admin-one@example.com",
      "staff-two@example.com",
      "casey@example.com",
      "riley@example.com",
    ]);
  });

  it("uses a normalized explicit recipient override without resolving the default audience", async () => {
    await sendCustomPriceChangeEmail({
      adminEmail: " Override@Example.com ",
      coachName: "Casey Coach",
      workshopTitle: "Scaling Up",
      workshopCode: "SU-1",
      workshopId: "workshop-1",
      oldPriceCents: 100000,
      newPriceCents: 125000,
    });

    expect(mockFindUsers).not.toHaveBeenCalled();
    expect(mockSendEmail.mock.calls.map(([email]) => email.to)).toEqual([
      "override@example.com",
    ]);
  });
});
