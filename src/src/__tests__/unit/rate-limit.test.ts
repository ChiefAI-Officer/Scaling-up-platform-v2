/**
 * Unit tests for rate limiting utilities
 */

import { checkRateLimit, RateLimits, getClientIdentifier } from "@/lib/rate-limit";

describe("checkRateLimit", () => {
  beforeEach(() => {
    // Clear rate limit store between tests by using unique identifiers
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it("should allow first request within limit", () => {
    const result = checkRateLimit("test-user-1", {
      interval: 60000,
      maxRequests: 10,
    });

    expect(result.success).toBe(true);
    expect(result.remaining).toBe(9);
  });

  it("should decrement remaining count on subsequent requests", () => {
    const identifier = "test-user-2";
    const config = { interval: 60000, maxRequests: 10 };

    const result1 = checkRateLimit(identifier, config);
    expect(result1.remaining).toBe(9);

    const result2 = checkRateLimit(identifier, config);
    expect(result2.remaining).toBe(8);

    const result3 = checkRateLimit(identifier, config);
    expect(result3.remaining).toBe(7);
  });

  it("should block requests when limit exceeded", () => {
    const identifier = "test-user-3";
    const config = { interval: 60000, maxRequests: 3 };

    // Use up all requests
    checkRateLimit(identifier, config);
    checkRateLimit(identifier, config);
    checkRateLimit(identifier, config);

    // This should be blocked
    const result = checkRateLimit(identifier, config);
    expect(result.success).toBe(false);
    expect(result.remaining).toBe(0);
    expect(result.retryAfter).toBeDefined();
  });

  it("should reset after interval expires", () => {
    const identifier = "test-user-4";
    const config = { interval: 60000, maxRequests: 2 };

    // Use up all requests
    checkRateLimit(identifier, config);
    checkRateLimit(identifier, config);

    // Should be blocked
    expect(checkRateLimit(identifier, config).success).toBe(false);

    // Advance time past the interval
    jest.advanceTimersByTime(61000);

    // Should be allowed again
    const result = checkRateLimit(identifier, config);
    expect(result.success).toBe(true);
    expect(result.remaining).toBe(1);
  });

  it("should track different identifiers separately", () => {
    const config = { interval: 60000, maxRequests: 2 };

    // User A uses up their limit
    checkRateLimit("user-a", config);
    checkRateLimit("user-a", config);
    expect(checkRateLimit("user-a", config).success).toBe(false);

    // User B should still have their full limit
    const resultB = checkRateLimit("user-b", config);
    expect(resultB.success).toBe(true);
    expect(resultB.remaining).toBe(1);
  });

  it("should return correct retryAfter value", () => {
    const identifier = "test-user-5";
    const config = { interval: 60000, maxRequests: 1 };

    checkRateLimit(identifier, config);

    // Advance time by 30 seconds
    jest.advanceTimersByTime(30000);

    const result = checkRateLimit(identifier, config);
    expect(result.success).toBe(false);
    // Should be approximately 30 seconds remaining
    expect(result.retryAfter).toBeLessThanOrEqual(31);
    expect(result.retryAfter).toBeGreaterThanOrEqual(29);
  });
});

describe("RateLimits presets", () => {
  it("should have standard rate limit config", () => {
    expect(RateLimits.standard).toEqual({
      interval: 60000,
      maxRequests: 100,
    });
  });

  it("should have auth rate limit config (more restrictive)", () => {
    expect(RateLimits.auth).toEqual({
      interval: 60000,
      maxRequests: 10,
    });
  });

  it("should have registration rate limit config", () => {
    expect(RateLimits.registration).toEqual({
      interval: 60000,
      maxRequests: 20,
    });
  });

  it("should have webhook rate limit config (more permissive)", () => {
    expect(RateLimits.webhook).toEqual({
      interval: 60000,
      maxRequests: 1000,
    });
  });

  it("should have search rate limit config", () => {
    expect(RateLimits.search).toEqual({
      interval: 60000,
      maxRequests: 60,
    });
  });
});

describe("getClientIdentifier", () => {
  it("should extract IP from x-forwarded-for header", () => {
    const request = new Request("http://localhost/api/test", {
      headers: {
        "x-forwarded-for": "192.168.1.1, 10.0.0.1",
      },
    });

    const identifier = getClientIdentifier(request);
    expect(identifier).toBe("192.168.1.1");
  });

  it("should extract IP from x-real-ip header", () => {
    const request = new Request("http://localhost/api/test", {
      headers: {
        "x-real-ip": "192.168.1.2",
      },
    });

    const identifier = getClientIdentifier(request);
    expect(identifier).toBe("192.168.1.2");
  });

  it("should prefer x-forwarded-for over x-real-ip", () => {
    const request = new Request("http://localhost/api/test", {
      headers: {
        "x-forwarded-for": "192.168.1.1",
        "x-real-ip": "192.168.1.2",
      },
    });

    const identifier = getClientIdentifier(request);
    expect(identifier).toBe("192.168.1.1");
  });

  it("should return localhost when no headers present", () => {
    const request = new Request("http://localhost/api/test");

    const identifier = getClientIdentifier(request);
    expect(identifier).toBe("localhost");
  });
});
