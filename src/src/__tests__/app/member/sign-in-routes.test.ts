const mockEnabled = jest.fn(() => true);
const mockRateLimit = jest.fn();
const mockSendLink = jest.fn();
const mockRedeem = jest.fn();
const mockResolveIdentity = jest.fn();
const mockSave = jest.fn();
const mockDestroy = jest.fn();
const mockAudit = jest.fn();

jest.mock("@/lib/db", () => ({ db: {} }));
jest.mock("@/lib/members/flags", () => ({ isMemberPortalEnabled: () => mockEnabled() }));
jest.mock("@/lib/rate-limit", () => ({
  RateLimits: { auth: { interval: 60_000, maxRequests: 10 } },
  checkRateLimitAsync: (...args: unknown[]) => mockRateLimit(...args),
}));
jest.mock("@/lib/members/send-sign-in-link", () => ({
  sendMemberSignInLink: (...args: unknown[]) => mockSendLink(...args),
}));
jest.mock("@/lib/members/sign-in-token", () => ({
  redeemMemberSignInToken: (...args: unknown[]) => mockRedeem(...args),
}));
jest.mock("@/lib/members/identity", () => ({
  normalizeMemberEmail: (value: string) => value.trim().toLowerCase(),
  resolveMemberIdentity: (...args: unknown[]) => mockResolveIdentity(...args),
}));
jest.mock("@/lib/members/session", () => ({
  getMemberSession: async () => ({ save: mockSave, destroy: mockDestroy }),
  toMemberSessionPayload: (email: string, issuedAt: Date) => ({
    normalizedEmail: email,
    issuedAt: issuedAt.toISOString(),
  }),
}));
jest.mock("@/lib/audit", () => ({ logAuditStrict: (...args: unknown[]) => mockAudit(...args) }));

import { POST as requestLink } from "@/app/(member)/member/sign-in/request/route";
import { POST as exchangeLink } from "@/app/(member)/member/sign-in/exchange/route";
import { POST as signOut } from "@/app/(member)/member/sign-out/route";

function formRequest(path: string, values: Record<string, string>): Request {
  return {
    url: `https://platform.example${path}`,
    headers: new Headers({ "x-forwarded-for": "203.0.113.4" }),
    text: async () => new URLSearchParams(values).toString(),
  } as Request;
}

describe("member sign-in routes", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockEnabled.mockReturnValue(true);
    mockRateLimit.mockResolvedValue({ success: true, remaining: 9, resetAt: Date.now() + 60_000 });
    mockSendLink.mockResolvedValue({ issued: true });
    mockResolveIdentity.mockResolvedValue({ normalizedEmail: "member@example.com", members: [{}] });
    mockSave.mockResolvedValue(undefined);
    mockAudit.mockResolvedValue(undefined);
  });

  it("returns an identical response for issued, unknown, and throttled requests", async () => {
    const issued = await requestLink(formRequest("/member/sign-in/request", { email: "member@example.com" }));
    mockSendLink.mockResolvedValueOnce({ issued: false });
    const unknown = await requestLink(formRequest("/member/sign-in/request", { email: "unknown@example.com" }));
    mockRateLimit.mockResolvedValueOnce({ success: false }).mockResolvedValueOnce({ success: false });
    const throttled = await requestLink(formRequest("/member/sign-in/request", { email: "blocked@example.com" }));

    for (const response of [issued, unknown, throttled]) {
      expect(response.status).toBe(303);
    }
  });

  it("rate-limits both address and IP using hashes and the auth policy", async () => {
    await requestLink(formRequest("/member/sign-in/request", { email: "member@example.com" }));
    expect(mockRateLimit).toHaveBeenCalledTimes(2);
    for (const [key, config] of mockRateLimit.mock.calls) {
      expect(key).not.toContain("member@example.com");
      expect(key).not.toContain("203.0.113.4");
      expect(config).toEqual({ interval: 60_000, maxRequests: 10 });
    }
  });

  it("redeems only on POST, saves the identity-only session, and never echoes the token", async () => {
    mockRedeem.mockResolvedValue({
      tokenId: "token-1",
      normalizedEmail: "member@example.com",
      redeemedAt: new Date("2026-09-21T12:00:00Z"),
    });
    const response = await exchangeLink(
      formRequest("/member/sign-in/exchange", { token: "a-valid-token-with-enough-length" }),
    );
    expect(response.status).toBe(303);
    expect(mockSave).toHaveBeenCalledTimes(1);
    expect(mockAudit).toHaveBeenCalledWith(expect.objectContaining({ action: "MEMBER_LINK_REDEEMED" }));
  });

  it("makes every invalid exchange indistinguishable", async () => {
    mockRedeem.mockResolvedValue(null);
    const response = await exchangeLink(
      formRequest("/member/sign-in/exchange", { token: "expired-token-with-enough-length" }),
    );
    expect(response.status).toBe(303);
    expect(mockSave).not.toHaveBeenCalled();
  });

  it("destroys a present or empty session on sign-out and 404s all handlers flag-off", async () => {
    const response = await signOut(formRequest("/member/sign-out", {}));
    expect(mockDestroy).toHaveBeenCalledTimes(1);
    expect(response.status).toBe(303);

    mockEnabled.mockReturnValue(false);
    await expect(requestLink(formRequest("/member/sign-in/request", { email: "x@example.com" }))).resolves.toMatchObject({ status: 404 });
    await expect(exchangeLink(formRequest("/member/sign-in/exchange", { token: "long-enough-token-value" }))).resolves.toMatchObject({ status: 404 });
    await expect(signOut(formRequest("/member/sign-out", {}))).resolves.toMatchObject({ status: 404 });
  });
});
