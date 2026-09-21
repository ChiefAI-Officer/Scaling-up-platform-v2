import type { NextRequest } from "next/server";

const mockActor = jest.fn();
const mockCanManage = jest.fn();
const mockEnabled = jest.fn();
const mockRateLimit = jest.fn();
const mockSendLink = jest.fn();
const mockFindCampaign = jest.fn();

jest.mock("next/server", () => ({
  NextResponse: {
    json: (body: unknown, init?: { status?: number; headers?: Record<string, string> }) => ({
      status: init?.status ?? 200,
      headers: init?.headers ?? {},
      json: async () => body,
    }),
  },
}));
jest.mock("@/lib/auth/authorization", () => ({ getApiActor: () => mockActor() }));
jest.mock("@/lib/assessments/access-control", () => ({
  asAccessDb: (value: unknown) => value,
  canManageCampaign: (...args: unknown[]) => mockCanManage(...args),
}));
jest.mock("@/lib/members/flags", () => ({
  isMemberPortalEnabled: () => mockEnabled(),
}));
jest.mock("@/lib/rate-limit", () => ({
  RateLimits: { memberPortalCoachSend: { interval: 60_000, maxRequests: 100 } },
  withRateLimit: (...args: unknown[]) => mockRateLimit(...args),
}));
jest.mock("@/lib/members/send-sign-in-link", () => ({
  sendMemberSignInLink: (...args: unknown[]) => mockSendLink(...args),
}));
jest.mock("@/lib/db", () => ({
  db: { assessmentCampaign: { findFirst: (...args: unknown[]) => mockFindCampaign(...args) } },
}));

import { POST } from "@/app/api/assessment-campaigns/[id]/member-links/route";

function request(body: unknown = {}) {
  return new Request(
    "http://localhost/api/assessment-campaigns/campaign-1/member-links",
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    },
  ) as unknown as NextRequest;
}

function campaign(count = 2) {
  return {
    id: "campaign-1",
    participants: Array.from({ length: count }, (_, index) => ({
      respondentId: `respondent-${index + 1}`,
      respondent: {
        id: `respondent-${index + 1}`,
        email: `member-${index + 1}@example.com`,
      },
    })),
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  mockEnabled.mockReturnValue(true);
  mockActor.mockResolvedValue({ userId: "user-1", role: "COACH", coachId: "coach-1" });
  mockCanManage.mockResolvedValue(true);
  mockRateLimit.mockResolvedValue({ allowed: true, headers: {} });
  mockFindCampaign.mockResolvedValue(campaign());
  mockSendLink.mockResolvedValue({ issued: true });
});

describe("POST campaign member links", () => {
  it("bulk sends a 24-hour coach link to every live respondent without disclosing credentials", async () => {
    mockFindCampaign.mockResolvedValue(campaign(30));

    const response = await POST(request(), { params: Promise.resolve({ id: "campaign-1" }) });
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual({ success: true, data: { sent: 30, skipped: 0 } });
    expect(JSON.stringify(body)).not.toMatch(/token|link|session|email/i);
    expect(mockSendLink).toHaveBeenCalledTimes(30);
    expect(mockSendLink).toHaveBeenNthCalledWith(
      1,
      expect.anything(),
      expect.objectContaining({
        email: "member-1@example.com",
        via: "COACH",
        byUserId: "user-1",
        campaignId: "campaign-1",
      }),
    );
    expect(mockRateLimit).toHaveBeenCalledWith(
      expect.anything(),
      { interval: 60_000, maxRequests: 100 },
    );
  });

  it("sends to exactly one requested campaign respondent, completed or not", async () => {
    const response = await POST(request({ respondentIds: ["respondent-2"] }), {
      params: Promise.resolve({ id: "campaign-1" }),
    });

    expect(response.status).toBe(200);
    expect(mockSendLink).toHaveBeenCalledTimes(1);
    expect(mockSendLink).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ email: "member-2@example.com", via: "COACH" }),
    );
  });

  it("fails closed before lookup or send when disabled, unauthenticated, or unauthorized", async () => {
    mockEnabled.mockReturnValue(false);
    let response = await POST(request(), { params: Promise.resolve({ id: "campaign-1" }) });
    expect(response.status).toBe(404);
    expect(mockFindCampaign).not.toHaveBeenCalled();
    expect(mockSendLink).not.toHaveBeenCalled();

    mockEnabled.mockReturnValue(true);
    mockActor.mockResolvedValue(null);
    response = await POST(request(), { params: Promise.resolve({ id: "campaign-1" }) });
    expect(response.status).toBe(401);

    mockActor.mockResolvedValue({ userId: "user-1", role: "COACH", coachId: "coach-1" });
    mockCanManage.mockResolvedValue(false);
    response = await POST(request(), { params: Promise.resolve({ id: "campaign-1" }) });
    expect(response.status).toBe(404);
    expect(mockSendLink).not.toHaveBeenCalled();
  });

  it("queries only live roster rows and never sends to a non-participant", async () => {
    mockFindCampaign.mockResolvedValue(campaign(1));

    const response = await POST(
      request({ respondentIds: ["respondent-2", "not-on-campaign"] }),
      { params: Promise.resolve({ id: "campaign-1" }) },
    );

    expect(response.status).toBe(400);
    expect(mockSendLink).not.toHaveBeenCalled();
    expect(mockFindCampaign).toHaveBeenCalledWith(
      expect.objectContaining({
        select: expect.objectContaining({
          participants: expect.objectContaining({
            where: {
              respondent: { deletedAt: null, organization: { deletedAt: null } },
            },
          }),
        }),
      }),
    );
  });
});
