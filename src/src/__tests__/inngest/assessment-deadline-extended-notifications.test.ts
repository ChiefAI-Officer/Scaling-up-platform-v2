jest.mock("@/lib/db", () => ({
  db: {
    assessmentCampaign: { findUnique: jest.fn() },
    assessmentInvitation: { findMany: jest.fn() },
  },
}));

// eslint-disable-next-line no-var
var capturedHandler: (input: {
  event: { data: Record<string, unknown> };
  step: { run: jest.Mock };
}) => Promise<unknown>;
jest.mock("@/inngest/client", () => ({
  inngest: {
    createFunction: jest.fn(
      (_config: unknown, _trigger: unknown, handler: typeof capturedHandler) => {
        capturedHandler = handler;
        return handler;
      },
    ),
  },
}));

jest.mock("@/services/notifications", () => ({
  sendCampaignDeadlineExtendedEmail: jest.fn().mockResolvedValue(undefined),
}));

import { db } from "@/lib/db";
import { sendCampaignDeadlineExtendedEmail } from "@/services/notifications";
import "@/inngest/functions/assessment-deadline-extended-notifications";

const step = {
  run: jest.fn(async (_name: string, fn: () => Promise<unknown>) => fn()),
};

describe("assessment deadline extension notifications", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    process.env.WAVE_TZ_ZONE_PICKER_ENABLED = "1";
    delete process.env.WAVE_TZ_ZONE_PICKER_KILL;
    (db.assessmentCampaign.findUnique as jest.Mock).mockResolvedValue({
      id: "campaign-1",
      name: "Campaign",
      closeAt: new Date("2026-11-01T06:00:00.000Z"),
      timezone: "America/New_York",
    });
    (db.assessmentInvitation.findMany as jest.Mock).mockResolvedValue([
      { id: "original", respondent: { email: "original@example.test", firstName: "Original" } },
    ]);
  });

  afterEach(() => {
    delete process.env.WAVE_TZ_ZONE_PICKER_ENABLED;
    delete process.env.WAVE_TZ_ZONE_PICKER_KILL;
  });

  it("queries and notifies only the invitation IDs frozen at extension time", async () => {
    const result = await capturedHandler({
      event: {
        data: {
          campaignId: "campaign-1",
          closeAt: "2026-11-01T06:00:00.000Z",
          invitationIds: ["original"],
        },
      },
      step,
    });

    expect(db.assessmentInvitation.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ id: { in: ["original"] } }),
    }));
    expect(sendCampaignDeadlineExtendedEmail).toHaveBeenCalledWith(expect.objectContaining({
      to: "original@example.test",
    }));
    expect(result).toEqual({ notified: 1 });
  });
});
