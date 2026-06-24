jest.mock("next/server", () => ({
  NextResponse: {
    json: (body: unknown, init?: ResponseInit) =>
      new Response(JSON.stringify(body), {
        status: init?.status || 200,
        headers: init?.headers,
      }),
  },
}));

jest.mock("@/lib/rate-limit", () => ({
  withRateLimit: jest.fn(),
  RateLimits: { auth: {}, standard: {} },
}));

jest.mock("@/lib/db", () => ({
  db: {
    adminInvite: { findUnique: jest.fn() },
    user: { findUnique: jest.fn() },
    $transaction: jest.fn(),
  },
}));

import { POST } from "@/app/api/auth/accept-invite/route";
import { withRateLimit } from "@/lib/rate-limit";
import { db } from "@/lib/db";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const req = (body: unknown) => ({ json: async () => body }) as any;

describe("POST /api/auth/accept-invite — rate limited (audit PR-1)", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (withRateLimit as jest.Mock).mockResolvedValue({ allowed: true, headers: {} });
  });

  it("returns 429 when the rate limit is exceeded, before touching the DB", async () => {
    (withRateLimit as jest.Mock).mockResolvedValue({
      allowed: false,
      headers: { "Retry-After": "60" },
    });

    const res = await POST(
      req({ email: "x@y.com", token: "abcd", name: "X", password: "secretpass1" })
    );

    expect(res.status).toBe(429);
    expect(db.adminInvite.findUnique).not.toHaveBeenCalled();
  });

  it("passes through to request handling when under the limit (not 429)", async () => {
    (withRateLimit as jest.Mock).mockResolvedValue({ allowed: true, headers: {} });

    // Invalid body -> the handler reaches schema validation and returns 400,
    // proving the rate-limit guard let the request through.
    const res = await POST(req({}));

    expect(res.status).not.toBe(429);
  });
});
