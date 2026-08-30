import type { ApiActor } from "@/lib/auth/access-control";

jest.mock("next/server", () => ({
  NextResponse: {
    json: (body: unknown, init?: ResponseInit) => {
      const headers = Object.fromEntries(
        new Headers(init?.headers).entries(),
      );
      return new Response(JSON.stringify(body), {
        status: init?.status ?? 200,
        headers,
      });
    },
  },
}));

const mockGetApiActor = jest.fn<Promise<ApiActor | null>, []>();
const mockEnabled = jest.fn<boolean, []>();
const mockRateLimit = jest.fn();
const mockRemove = jest.fn();

jest.mock("@/lib/auth/authorization", () => ({
  getApiActor: () => mockGetApiActor(),
}));

jest.mock("@/lib/assessments/wave-83-flags", () => ({
  isReferredResultsEnabled: () => mockEnabled(),
}));

jest.mock("@/lib/rate-limit", () => ({
  checkRateLimitStrict: (...args: unknown[]) => mockRateLimit(...args),
}));

jest.mock("@/lib/assessments/referred-results-removal", () => ({
  removeReferredResult: (...args: unknown[]) => mockRemove(...args),
}));

jest.mock("@/lib/db", () => ({
  db: { marker: "database" },
}));

import { DELETE } from "@/app/api/assessments/referred-results/[submissionId]/route";

const actor: ApiActor = {
  userId: "user-1",
  email: "coach@example.com",
  role: "COACH",
  coachId: "coach-1",
};

function request() {
  return new Request(
    "https://platform.example/api/assessments/referred-results/sub-1",
    {
      method: "DELETE",
      headers: {
        "x-request-id": "request-1",
        "x-forwarded-for": "203.0.113.8, 10.0.0.1",
        "user-agent": "test-agent",
      },
    },
  ) as Parameters<typeof DELETE>[0];
}

function context(submissionId = "sub-1") {
  return { params: Promise.resolve({ submissionId }) };
}

beforeEach(() => {
  jest.clearAllMocks();
  mockGetApiActor.mockResolvedValue(actor);
  mockEnabled.mockReturnValue(true);
  mockRateLimit.mockResolvedValue({
    success: true,
    remaining: 9,
    resetAt: 123456,
  });
  mockRemove.mockResolvedValue("removed");
});

describe("DELETE /api/assessments/referred-results/[submissionId]", () => {
  it("authenticates before checking capability or rate limits", async () => {
    mockGetApiActor.mockResolvedValue(null);

    const response = await DELETE(request(), context());

    expect(response.status).toBe(401);
    expect(mockEnabled).not.toHaveBeenCalled();
    expect(mockRateLimit).not.toHaveBeenCalled();
    expect(mockRemove).not.toHaveBeenCalled();
  });

  it("returns a dark 404 when Referred Results is disabled", async () => {
    mockEnabled.mockReturnValue(false);

    const response = await DELETE(request(), context());

    expect(response.status).toBe(404);
    expect(mockRateLimit).not.toHaveBeenCalled();
    expect(mockRemove).not.toHaveBeenCalled();
  });

  it("rejects non-Coach actors before rate limiting", async () => {
    mockGetApiActor.mockResolvedValue({ ...actor, role: "STAFF" });

    const response = await DELETE(request(), context());

    expect(response.status).toBe(403);
    expect(mockRateLimit).not.toHaveBeenCalled();
  });

  it.each(["", "space id", "../sub-1", "x".repeat(192)])(
    "rejects the invalid submission id %p",
    async (submissionId) => {
      const response = await DELETE(request(), context(submissionId));

      expect(response.status).toBe(400);
      expect(mockRateLimit).not.toHaveBeenCalled();
      expect(mockRemove).not.toHaveBeenCalled();
    },
  );

  it("fails closed when the distributed mutation limiter is unavailable", async () => {
    const error = new Error("redis unavailable");
    const consoleError = jest
      .spyOn(console, "error")
      .mockImplementation(() => undefined);
    mockRateLimit.mockRejectedValue(error);

    const response = await DELETE(request(), context());

    expect(response.status).toBe(503);
    expect(mockRemove).not.toHaveBeenCalled();
    expect(consoleError).toHaveBeenCalledWith(
      "Referred-results removal limiter unavailable:",
      error,
    );
    consoleError.mockRestore();
  });

  it("returns 429 and strict rate headers when the Coach limit is exhausted", async () => {
    mockRateLimit.mockResolvedValue({
      success: false,
      remaining: 0,
      resetAt: 123456,
      retryAfter: 42,
    });

    const response = await DELETE(request(), context());

    expect(response.status).toBe(429);
    expect(response.headers.get("x-ratelimit-limit")).toBe("10");
    expect(response.headers.get("x-ratelimit-remaining")).toBe("0");
    expect(response.headers.get("retry-after")).toBe("42");
    expect(mockRemove).not.toHaveBeenCalled();
  });

  it.each([
    ["not-found", 404],
    ["forbidden", 403],
  ])("maps the %s domain outcome to %i", async (outcome, status) => {
    mockRemove.mockResolvedValue(outcome);

    const response = await DELETE(request(), context());

    expect(response.status).toBe(status);
    expect(response.headers.get("cache-control")).toBe("no-store, private");
  });

  it("removes through the domain service with bounded request context", async () => {
    const response = await DELETE(request(), context());
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual({ success: true });
    expect(response.headers.get("cache-control")).toBe("no-store, private");
    expect(response.headers.get("x-request-id")).toBe("request-1");
    expect(mockRateLimit).toHaveBeenCalledWith(
      "referred-results-delete:coach-1",
      { interval: 60_000, maxRequests: 10 },
    );
    expect(mockRemove).toHaveBeenCalledWith(
      { marker: "database" },
      actor,
      "sub-1",
      expect.objectContaining({
        requestId: "request-1",
        ipAddress: "203.0.113.8",
        userAgent: "test-agent",
        now: expect.any(Date),
      }),
    );
  });

  it("returns a retryable 503 when the atomic mutation fails", async () => {
    const error = new Error("audit unavailable");
    const consoleError = jest
      .spyOn(console, "error")
      .mockImplementation(() => undefined);
    mockRemove.mockRejectedValue(error);

    const response = await DELETE(request(), context());

    expect(response.status).toBe(503);
    expect(response.headers.get("x-ratelimit-remaining")).toBe("9");
    expect(consoleError).toHaveBeenCalledWith(
      "Failed to remove referred result:",
      error,
    );
    consoleError.mockRestore();
  });
});
