import {
  classifyGlobalRateLimit,
  enforceGlobalApiRateLimit,
  GlobalRateLimits,
} from "@/lib/global-rate-limit";

describe("classifyGlobalRateLimit", () => {
  it("classifies sensitive auth routes", () => {
    expect(classifyGlobalRateLimit("/api/auth/forgot-password", "POST")).toBe("auth");
    expect(classifyGlobalRateLimit("/api/auth/reset-password", "POST")).toBe("auth");
    expect(classifyGlobalRateLimit("/api/auth/change-password", "POST")).toBe("auth");
    expect(classifyGlobalRateLimit("/api/auth/coach-signup", "POST")).toBe("auth");
  });

  it("classifies registration and checkout mutation routes", () => {
    expect(classifyGlobalRateLimit("/api/registrations", "POST")).toBe("registration");
    expect(classifyGlobalRateLimit("/api/checkout", "POST")).toBe("registration");
    expect(classifyGlobalRateLimit("/api/workshops/ws-1/register", "POST")).toBe("registration");
    expect(classifyGlobalRateLimit("/api/surveys/s-1/submit", "POST")).toBe("registration");
  });

  it("classifies webhook and inngest routes", () => {
    expect(classifyGlobalRateLimit("/api/webhooks/stripe", "POST")).toBe("webhook");
    expect(classifyGlobalRateLimit("/api/inngest", "POST")).toBe("webhook");
    expect(classifyGlobalRateLimit("/api/inngest", "GET")).toBe("webhook");
  });

  it("classifies workflow trigger paths", () => {
    expect(classifyGlobalRateLimit("/api/workflows/wf-1/executions", "GET")).toBe("workflow");
    expect(classifyGlobalRateLimit("/api/workflows/wf-1/assign", "POST")).toBe("workflow");
    expect(classifyGlobalRateLimit("/api/workshops/ws-1/status", "PATCH")).toBe("workflow");
    expect(classifyGlobalRateLimit("/api/approvals/ap-1/respond", "POST")).toBe("workflow");
  });

  it("does not classify non-sensitive or non-mutation paths", () => {
    expect(classifyGlobalRateLimit("/api/coaches", "GET")).toBeNull();
    expect(classifyGlobalRateLimit("/api/auth/forgot-password", "GET")).toBeNull();
    expect(classifyGlobalRateLimit("/dashboard", "GET")).toBeNull();
  });
});

describe("enforceGlobalApiRateLimit", () => {
  it("enforces limits and blocks when exceeded", () => {
    const now = Date.now();
    const identifier = "test-ip-auth";
    const max = GlobalRateLimits.auth.maxRequests;

    for (let i = 0; i < max; i += 1) {
      const result = enforceGlobalApiRateLimit({
        pathname: "/api/auth/forgot-password",
        method: "POST",
        identifier,
        now,
      });
      expect(result.enforced).toBe(true);
      expect(result.allowed).toBe(true);
      expect(result.className).toBe("auth");
    }

    const blocked = enforceGlobalApiRateLimit({
      pathname: "/api/auth/forgot-password",
      method: "POST",
      identifier,
      now,
    });
    expect(blocked.enforced).toBe(true);
    expect(blocked.allowed).toBe(false);
    expect(blocked.headers["Retry-After"]).toBeDefined();
  });

  it("resets counters after interval expires", () => {
    const baseNow = Date.now();
    const identifier = "test-ip-registration";
    const max = GlobalRateLimits.registration.maxRequests;

    for (let i = 0; i < max; i += 1) {
      enforceGlobalApiRateLimit({
        pathname: "/api/checkout",
        method: "POST",
        identifier,
        now: baseNow,
      });
    }

    const blocked = enforceGlobalApiRateLimit({
      pathname: "/api/checkout",
      method: "POST",
      identifier,
      now: baseNow,
    });
    expect(blocked.allowed).toBe(false);

    const allowedAfterWindow = enforceGlobalApiRateLimit({
      pathname: "/api/checkout",
      method: "POST",
      identifier,
      now: baseNow + GlobalRateLimits.registration.intervalMs + 1,
    });
    expect(allowedAfterWindow.allowed).toBe(true);
  });
});
