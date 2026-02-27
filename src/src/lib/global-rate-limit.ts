/**
 * Global API rate limiting for middleware (Edge-safe).
 *
 * This module intentionally avoids Node-only dependencies (e.g., ioredis)
 * because Next.js middleware runs on the Edge runtime.
 */

export type GlobalRateLimitClass = "auth" | "registration" | "workflow" | "webhook";

interface GlobalRateLimitConfig {
  intervalMs: number;
  maxRequests: number;
}

interface GlobalRateLimitEntry {
  count: number;
  resetAt: number;
}

interface GlobalRateLimitInput {
  pathname: string;
  method: string;
  identifier: string;
  now?: number;
}

interface GlobalRateLimitResult {
  enforced: boolean;
  allowed: boolean;
  className?: GlobalRateLimitClass;
  headers: Record<string, string>;
}

const MUTATION_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);

export const GlobalRateLimits: Record<GlobalRateLimitClass, GlobalRateLimitConfig> = {
  auth: {
    intervalMs: 60_000,
    maxRequests: 10,
  },
  registration: {
    intervalMs: 60_000,
    maxRequests: 20,
  },
  workflow: {
    intervalMs: 60_000,
    maxRequests: 30,
  },
  webhook: {
    intervalMs: 60_000,
    maxRequests: 1_200,
  },
};

const globalStore = globalThis as unknown as {
  middlewareRateLimitStore?: Map<string, GlobalRateLimitEntry>;
  middlewareRateLimitCleanupStarted?: boolean;
};

const rateLimitStore = globalStore.middlewareRateLimitStore ?? new Map<string, GlobalRateLimitEntry>();
if (!globalStore.middlewareRateLimitStore) {
  globalStore.middlewareRateLimitStore = rateLimitStore;
}

if (!globalStore.middlewareRateLimitCleanupStarted && typeof setInterval !== "undefined") {
  const interval = setInterval(() => {
    const now = Date.now();
    for (const [key, entry] of rateLimitStore.entries()) {
      if (entry.resetAt < now) {
        rateLimitStore.delete(key);
      }
    }
  }, 60_000);

  if (typeof interval.unref === "function") {
    interval.unref();
  }

  globalStore.middlewareRateLimitCleanupStarted = true;
}

function normalizePathname(pathname: string): string {
  if (!pathname) return "/";
  if (pathname.length > 1 && pathname.endsWith("/")) {
    return pathname.slice(0, -1);
  }
  return pathname;
}

function isAuthSensitivePath(pathname: string): boolean {
  return (
    pathname === "/api/auth/forgot-password" ||
    pathname === "/api/auth/reset-password" ||
    pathname === "/api/auth/change-password" ||
    pathname === "/api/auth/coach-signup" ||
    pathname === "/api/auth/callback/credentials" ||
    pathname === "/api/auth/signin/credentials"
  );
}

function isRegistrationPath(pathname: string): boolean {
  return (
    pathname === "/api/registrations" ||
    pathname === "/api/checkout" ||
    /^\/api\/registrations\/[^/]+\/removal-request$/.test(pathname) ||
    /^\/api\/workshops\/[^/]+\/register$/.test(pathname) ||
    /^\/api\/surveys\/[^/]+\/submit$/.test(pathname)
  );
}

function isWebhookPath(pathname: string): boolean {
  return pathname.startsWith("/api/webhooks/") || pathname.startsWith("/api/inngest");
}

function isWorkflowTriggerPath(pathname: string): boolean {
  return (
    /^\/api\/workflows\/[^/]+\/executions$/.test(pathname) ||
    /^\/api\/workflows\/[^/]+\/assign$/.test(pathname) ||
    /^\/api\/workshops\/[^/]+\/status$/.test(pathname) ||
    /^\/api\/approvals\/[^/]+\/respond$/.test(pathname) ||
    pathname === "/api/surveys/assign"
  );
}

export function classifyGlobalRateLimit(pathname: string, method: string): GlobalRateLimitClass | null {
  const normalizedPath = normalizePathname(pathname);
  const normalizedMethod = method.toUpperCase();

  if (!normalizedPath.startsWith("/api/")) {
    return null;
  }

  if (isWebhookPath(normalizedPath)) {
    return "webhook";
  }

  if (isAuthSensitivePath(normalizedPath) && MUTATION_METHODS.has(normalizedMethod)) {
    return "auth";
  }

  if (isRegistrationPath(normalizedPath) && MUTATION_METHODS.has(normalizedMethod)) {
    return "registration";
  }

  if (isWorkflowTriggerPath(normalizedPath)) {
    return "workflow";
  }

  return null;
}

export function getRequestIdentifierFromHeaders(headers: Headers): string {
  const forwarded = headers.get("x-forwarded-for");
  if (forwarded) {
    return forwarded.split(",")[0].trim();
  }

  const cfConnectingIp = headers.get("cf-connecting-ip");
  if (cfConnectingIp) {
    return cfConnectingIp.trim();
  }

  const realIp = headers.get("x-real-ip");
  if (realIp) {
    return realIp.trim();
  }

  return "unknown";
}

export function enforceGlobalApiRateLimit(input: GlobalRateLimitInput): GlobalRateLimitResult {
  const className = classifyGlobalRateLimit(input.pathname, input.method);
  if (!className) {
    return { enforced: false, allowed: true, headers: {} };
  }

  const config = GlobalRateLimits[className];
  const now = input.now ?? Date.now();
  const key = `${className}:${input.identifier}`;
  const existing = rateLimitStore.get(key);

  if (!existing || existing.resetAt < now) {
    const entry: GlobalRateLimitEntry = {
      count: 1,
      resetAt: now + config.intervalMs,
    };
    rateLimitStore.set(key, entry);
    return {
      enforced: true,
      allowed: true,
      className,
      headers: {
        "X-RateLimit-Class": className,
        "X-RateLimit-Limit": String(config.maxRequests),
        "X-RateLimit-Remaining": String(config.maxRequests - 1),
        "X-RateLimit-Reset": String(entry.resetAt),
      },
    };
  }

  if (existing.count >= config.maxRequests) {
    const retryAfterSeconds = Math.max(1, Math.ceil((existing.resetAt - now) / 1000));
    return {
      enforced: true,
      allowed: false,
      className,
      headers: {
        "X-RateLimit-Class": className,
        "X-RateLimit-Limit": String(config.maxRequests),
        "X-RateLimit-Remaining": "0",
        "X-RateLimit-Reset": String(existing.resetAt),
        "Retry-After": String(retryAfterSeconds),
      },
    };
  }

  existing.count += 1;
  rateLimitStore.set(key, existing);

  return {
    enforced: true,
    allowed: true,
    className,
    headers: {
      "X-RateLimit-Class": className,
      "X-RateLimit-Limit": String(config.maxRequests),
      "X-RateLimit-Remaining": String(Math.max(0, config.maxRequests - existing.count)),
      "X-RateLimit-Reset": String(existing.resetAt),
    },
  };
}

