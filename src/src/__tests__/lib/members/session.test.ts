jest.mock("next/headers", () => ({ cookies: jest.fn() }));
jest.mock("next/navigation", () => ({ redirect: jest.fn() }));
jest.mock("iron-session", () => ({ getIronSession: jest.fn() }));

import {
  buildMemberSessionOptions,
  MEMBER_SESSION_TTL_SECONDS,
  toMemberSessionPayload,
} from "@/lib/members/session";

describe("member session", () => {
  afterEach(() => delete process.env.MEMBER_SESSION_SECRET);

  it("uses an isolated, path-scoped, 24-hour sealed cookie", () => {
    process.env.MEMBER_SESSION_SECRET = "member-test-secret-at-least-thirty-two-characters";
    expect(buildMemberSessionOptions()).toEqual({
      cookieName: "member-session",
      password: process.env.MEMBER_SESSION_SECRET,
      ttl: MEMBER_SESSION_TTL_SECONDS,
      cookieOptions: {
        httpOnly: true,
        secure: true,
        sameSite: "strict",
        path: "/member",
        maxAge: MEMBER_SESSION_TTL_SECONDS - 5 * 60,
      },
    });
  });

  it("fails closed when its dedicated secret is absent", () => {
    expect(() => buildMemberSessionOptions()).toThrow("MEMBER_SESSION_SECRET");
  });

  it("stores identity only, never resolved grants", () => {
    expect(toMemberSessionPayload("PERSON@Example.com", new Date("2026-09-21T12:00:00Z"))).toEqual({
      normalizedEmail: "person@example.com",
      issuedAt: "2026-09-21T12:00:00.000Z",
    });
  });
});
