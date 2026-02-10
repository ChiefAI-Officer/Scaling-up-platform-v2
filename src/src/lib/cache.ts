/**
 * Caching utility with Redis support
 * Falls back to in-memory cache when Redis is unavailable
 */

import Redis from "ioredis";
import { logger } from "./logger";

// Cache configuration
const CACHE_PREFIX = "sup:"; // Scaling Up Platform prefix
const DEFAULT_TTL = 300; // 5 minutes in seconds

// Create Redis client if configured
let redisClient: Redis | null = null;

function getRedisClient(): Redis | null {
  if (redisClient) return redisClient;

  const redisUrl = process.env.REDIS_URL;
  if (!redisUrl || redisUrl === "redis://localhost:6379") {
    // Skip Redis in development without Redis
    logger.debug("Redis not configured, using in-memory cache");
    return null;
  }

  try {
    redisClient = new Redis(redisUrl, {
      maxRetriesPerRequest: 3,
      retryStrategy: (times) => {
        if (times > 3) {
          logger.warn("Redis connection failed, falling back to in-memory cache");
          return null;
        }
        return Math.min(times * 100, 3000);
      },
    });

    redisClient.on("error", (err) => {
      logger.error("Redis error", err);
    });

    redisClient.on("connect", () => {
      logger.info("Redis connected");
    });

    return redisClient;
  } catch (error) {
    logger.error("Failed to create Redis client", error as Error);
    return null;
  }
}

// In-memory cache fallback
const memoryCache = new Map<string, { value: string; expiresAt: number }>();

// Clean up expired entries periodically
const cleanupInterval = setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of memoryCache.entries()) {
    if (entry.expiresAt < now) {
      memoryCache.delete(key);
    }
  }
}, 60000); // Clean every minute

if (typeof cleanupInterval.unref === "function") {
  cleanupInterval.unref();
}

/**
 * Cache interface
 */
export interface CacheOptions {
  ttl?: number; // Time to live in seconds
  tags?: string[]; // Cache tags for invalidation
}

/**
 * Set a value in the cache
 */
export async function cacheSet(
  key: string,
  value: unknown,
  options: CacheOptions = {}
): Promise<void> {
  const { ttl = DEFAULT_TTL } = options;
  const cacheKey = CACHE_PREFIX + key;
  const serialized = JSON.stringify(value);

  const redis = getRedisClient();
  if (redis) {
    try {
      await redis.setex(cacheKey, ttl, serialized);
      logger.debug(`Cache SET: ${key}`, { ttl });
    } catch (error) {
      logger.error("Cache SET failed", error as Error, { key });
      // Fall through to memory cache
      memoryCache.set(cacheKey, {
        value: serialized,
        expiresAt: Date.now() + ttl * 1000,
      });
    }
  } else {
    memoryCache.set(cacheKey, {
      value: serialized,
      expiresAt: Date.now() + ttl * 1000,
    });
  }
}

/**
 * Get a value from the cache
 */
export async function cacheGet<T>(key: string): Promise<T | null> {
  const cacheKey = CACHE_PREFIX + key;

  const redis = getRedisClient();
  if (redis) {
    try {
      const value = await redis.get(cacheKey);
      if (value) {
        logger.debug(`Cache HIT: ${key}`);
        return JSON.parse(value) as T;
      }
      logger.debug(`Cache MISS: ${key}`);
      return null;
    } catch (error) {
      logger.error("Cache GET failed", error as Error, { key });
      // Fall through to memory cache
    }
  }

  // Check memory cache
  const entry = memoryCache.get(cacheKey);
  if (entry && entry.expiresAt > Date.now()) {
    logger.debug(`Cache HIT (memory): ${key}`);
    return JSON.parse(entry.value) as T;
  }

  if (entry) {
    memoryCache.delete(cacheKey);
  }

  logger.debug(`Cache MISS: ${key}`);
  return null;
}

/**
 * Delete a value from the cache
 */
export async function cacheDelete(key: string): Promise<void> {
  const cacheKey = CACHE_PREFIX + key;

  const redis = getRedisClient();
  if (redis) {
    try {
      await redis.del(cacheKey);
    } catch (error) {
      logger.error("Cache DELETE failed", error as Error, { key });
    }
  }

  memoryCache.delete(cacheKey);
  logger.debug(`Cache DELETE: ${key}`);
}

/**
 * Delete all values matching a pattern
 */
export async function cacheDeletePattern(pattern: string): Promise<void> {
  const cachePattern = CACHE_PREFIX + pattern;

  const redis = getRedisClient();
  if (redis) {
    try {
      const keys = await redis.keys(cachePattern);
      if (keys.length > 0) {
        await redis.del(...keys);
        logger.debug(`Cache DELETE pattern: ${pattern}`, { count: keys.length });
      }
    } catch (error) {
      logger.error("Cache DELETE pattern failed", error as Error, { pattern });
    }
  }

  // Clear matching keys from memory cache
  const regex = new RegExp("^" + cachePattern.replace(/\*/g, ".*") + "$");
  for (const key of memoryCache.keys()) {
    if (regex.test(key)) {
      memoryCache.delete(key);
    }
  }
}

/**
 * Cache wrapper - get from cache or fetch and cache
 */
export async function cached<T>(
  key: string,
  fetcher: () => Promise<T>,
  options: CacheOptions = {}
): Promise<T> {
  // Try to get from cache
  const cachedValue = await cacheGet<T>(key);
  if (cachedValue !== null) {
    return cachedValue;
  }

  // Fetch and cache
  const value = await fetcher();
  await cacheSet(key, value, options);
  return value;
}

// Cache key generators for common patterns
export const CacheKeys = {
  workshop: (id: string) => `workshop:${id}`,
  workshopList: (params: string) => `workshops:list:${params}`,
  workshopBySlug: (slug: string) => `workshop:slug:${slug}`,
  coach: (id: string) => `coach:${id}`,
  coachList: () => "coaches:list",
  coachCertifications: (coachId: string) => `coach:${coachId}:certifications`,
  workshopTypes: () => "workshop-types:list",
  dashboardMetrics: () => "dashboard:metrics",
  registrations: (workshopId: string) => `workshop:${workshopId}:registrations`,
};

// Cache invalidation helpers
export const CacheInvalidation = {
  async workshopUpdated(id: string): Promise<void> {
    await cacheDelete(CacheKeys.workshop(id));
    await cacheDeletePattern("workshops:list:*");
    await cacheDelete(CacheKeys.dashboardMetrics());
  },

  async coachUpdated(id: string): Promise<void> {
    await cacheDelete(CacheKeys.coach(id));
    await cacheDelete(CacheKeys.coachList());
    await cacheDelete(CacheKeys.coachCertifications(id));
  },

  async registrationCreated(workshopId: string): Promise<void> {
    await cacheDelete(CacheKeys.registrations(workshopId));
    await cacheDelete(CacheKeys.workshop(workshopId));
    await cacheDelete(CacheKeys.dashboardMetrics());
  },
};
