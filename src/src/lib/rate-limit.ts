/**
 * Rate limiting utility for API routes
 * Uses Redis in production for distributed rate limiting across serverless instances.
 * Falls back to in-memory store for development only.
 */

import Redis from "ioredis";

export interface RateLimitConfig {
  interval: number; // Time window in milliseconds
  maxRequests: number; // Max requests per interval
}

interface RateLimitEntry {
  count: number;
  resetAt: number;
}

// Redis client singleton for production
let redisClient: Redis | null = null;

function getRedisClient(): Redis | null {
  if (redisClient) return redisClient;
  
  const redisUrl = process.env.REDIS_URL || process.env.KV_URL;
  if (!redisUrl) {
    console.warn("⚠️ REDIS_URL not set - using in-memory rate limiting (NOT suitable for production)");
    return null;
  }
  
  try {
    redisClient = new Redis(redisUrl, {
      maxRetriesPerRequest: 3,
      lazyConnect: true,
    });
    
    redisClient.on("error", (err) => {
      console.error("Redis rate limit error:", err);
    });
    
    return redisClient;
  } catch (error) {
    console.error("Failed to initialize Redis client:", error);
    return null;
  }
}

// In-memory store for development fallback only
const rateLimitStore = new Map<string, RateLimitEntry>();

const globalForRateLimit = globalThis as unknown as {
  rateLimitCleanupIntervalStarted?: boolean;
};

// Clean up expired entries periodically (only for in-memory)
if (typeof setInterval !== "undefined" && !globalForRateLimit.rateLimitCleanupIntervalStarted) {
  const interval = setInterval(() => {
    const now = Date.now();
    for (const [key, entry] of rateLimitStore.entries()) {
      if (entry.resetAt < now) {
        rateLimitStore.delete(key);
      }
    }
  }, 60000); // Clean up every minute

  // Avoid keeping Node alive just for this interval.
  if (typeof interval.unref === "function") {
    interval.unref();
  }

  globalForRateLimit.rateLimitCleanupIntervalStarted = true;
}

export interface RateLimitResult {
  success: boolean;
  remaining: number;
  resetAt: number;
  retryAfter?: number;
}

export interface DualRateLimitInput {
  campaignKey: string;
  emailKey: string;
  intervalMs: number;
  campaignMax: number;
  emailMax: number;
}

/**
 * Atomically admits a public submission against both campaign+IP and
 * campaign+email budgets. Callers pass only HMAC-derived identifiers.
 * Unlike the general limiter, unavailability is surfaced so Public leads can
 * enter its explicitly bounded HELD fallback instead of failing open.
 */
export async function checkDistributedDualRateLimit(
  input: DualRateLimitInput,
): Promise<RateLimitResult> {
  const redis = getRedisClient();
  if (!redis) throw new Error("DISTRIBUTED_LIMITER_UNAVAILABLE");
  const now = Date.now();
  const script = `
    local campaign = redis.call("INCR", KEYS[1])
    if campaign == 1 then redis.call("PEXPIRE", KEYS[1], ARGV[1]) end
    local email = redis.call("INCR", KEYS[2])
    if email == 1 then redis.call("PEXPIRE", KEYS[2], ARGV[1]) end
    if campaign > tonumber(ARGV[2]) or email > tonumber(ARGV[3]) then
      return {0, campaign, email}
    end
    return {1, campaign, email}
  `;
  const result = (await redis.eval(
    script,
    2,
    `public-submit:campaign:${input.campaignKey}`,
    `public-submit:email:${input.emailKey}`,
    input.intervalMs,
    input.campaignMax,
    input.emailMax,
  )) as [number, number, number];
  const allowed = result[0] === 1;
  return {
    success: allowed,
    remaining: Math.max(
      0,
      Math.min(
        input.campaignMax - result[1],
        input.emailMax - result[2],
      ),
    ),
    resetAt: now + input.intervalMs,
    ...(allowed
      ? {}
      : { retryAfter: Math.ceil(input.intervalMs / 1000) }),
  };
}

/**
 * Check rate limit using Redis (production) or in-memory (development)
 */
export async function checkRateLimitAsync(
  identifier: string,
  config: RateLimitConfig
): Promise<RateLimitResult> {
  const redis = getRedisClient();
  
  if (redis) {
    return checkRateLimitRedis(redis, identifier, config);
  }
  
  // Fallback to synchronous in-memory check
  return checkRateLimit(identifier, config);
}

/**
 * Redis-backed rate limiting using sliding window
 */
async function checkRateLimitRedis(
  redis: Redis,
  identifier: string,
  config: RateLimitConfig
): Promise<RateLimitResult> {
  const now = Date.now();
  const key = `ratelimit:${identifier}`;
  const windowMs = config.interval;
  
  try {
    // Use Redis pipeline for atomic operations
    const pipeline = redis.pipeline();
    
    // Add current timestamp to sorted set
    pipeline.zadd(key, now.toString(), `${now}-${Math.random()}`);
    
    // Remove old entries outside the window
    pipeline.zremrangebyscore(key, 0, now - windowMs);
    
    // Count requests in current window
    pipeline.zcard(key);
    
    // Set expiry on the key
    pipeline.pexpire(key, windowMs);
    
    const results = await pipeline.exec();
    
    if (!results) {
      throw new Error("Redis pipeline returned null");
    }
    
    const count = results[2]?.[1] as number || 0;
    const resetAt = now + windowMs;
    
    if (count > config.maxRequests) {
      return {
        success: false,
        remaining: 0,
        resetAt,
        retryAfter: Math.ceil(windowMs / 1000),
      };
    }
    
    return {
      success: true,
      remaining: Math.max(0, config.maxRequests - count),
      resetAt,
    };
  } catch (error) {
    console.error("Redis rate limit error, falling back to allow:", error);
    // On Redis error, allow the request (fail open) but log
    return {
      success: true,
      remaining: config.maxRequests,
      resetAt: now + config.interval,
    };
  }
}

/**
 * Synchronous in-memory rate limit check (development only)
 * @param identifier - Unique identifier (e.g., IP address, user ID)
 * @param config - Rate limit configuration
 * @returns Rate limit check result
 */
export function checkRateLimit(
  identifier: string,
  config: RateLimitConfig
): RateLimitResult {
  const now = Date.now();
  const key = identifier;

  let entry = rateLimitStore.get(key);

  // If no entry exists or it has expired, create a new one
  if (!entry || entry.resetAt < now) {
    entry = {
      count: 1,
      resetAt: now + config.interval,
    };
    rateLimitStore.set(key, entry);

    return {
      success: true,
      remaining: config.maxRequests - 1,
      resetAt: entry.resetAt,
    };
  }

  // Check if limit exceeded
  if (entry.count >= config.maxRequests) {
    return {
      success: false,
      remaining: 0,
      resetAt: entry.resetAt,
      retryAfter: Math.ceil((entry.resetAt - now) / 1000),
    };
  }

  // Increment counter
  entry.count += 1;
  rateLimitStore.set(key, entry);

  return {
    success: true,
    remaining: config.maxRequests - entry.count,
    resetAt: entry.resetAt,
  };
}

// Predefined rate limit configurations
export const RateLimits = {
  // Standard API endpoints - 100 requests per minute
  standard: {
    interval: 60 * 1000,
    maxRequests: 100,
  },
  // Authentication endpoints - 10 requests per minute
  auth: {
    interval: 60 * 1000,
    maxRequests: 10,
  },
  // Registration endpoints - 20 requests per minute
  registration: {
    interval: 60 * 1000,
    maxRequests: 20,
  },
  // Webhook endpoints - 1000 requests per minute
  webhook: {
    interval: 60 * 1000,
    maxRequests: 1000,
  },
  // Search/listing endpoints - 60 requests per minute
  search: {
    interval: 60 * 1000,
    maxRequests: 60,
  },
};

/**
 * Get client identifier from request
 * Uses X-Forwarded-For header if behind proxy, otherwise falls back to a default
 */
export function getClientIdentifier(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) {
    return forwarded.split(",")[0].trim();
  }

  const realIp = request.headers.get("x-real-ip");
  if (realIp) {
    return realIp;
  }

  // Fallback for local development
  return "localhost";
}

/**
 * Helper to apply rate limiting in API routes
 */
export async function withRateLimit(
  request: Request,
  config: RateLimitConfig = RateLimits.standard
): Promise<{ allowed: boolean; headers: Record<string, string> }> {
  const identifier = getClientIdentifier(request);
  const result = await checkRateLimitAsync(identifier, config);
  
  const headers: Record<string, string> = {
    "X-RateLimit-Limit": config.maxRequests.toString(),
    "X-RateLimit-Remaining": result.remaining.toString(),
    "X-RateLimit-Reset": result.resetAt.toString(),
  };
  
  if (!result.success && result.retryAfter) {
    headers["Retry-After"] = result.retryAfter.toString();
  }
  
  return {
    allowed: result.success,
    headers,
  };
}
