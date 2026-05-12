/**
 * Wave 8-A blast-radius control: per-serverless-instance LRU+TTL cache for
 * `lookupHubSpotContact` results.
 *
 * Once the Proxy fix lights up real HubSpot calls, every admin coach page
 * render becomes a live HubSpot dependency. This cache prevents a thundering
 * herd from a Vercel cold start and serves stale-but-fast on retries within
 * the TTL window. Per-instance is intentional — global cache coordination
 * would need Redis and isn't worth the complexity for the load profile.
 */

import type { HubSpotLookupResult } from "./hubspot";

interface CacheEntry {
  result: HubSpotLookupResult;
  expiresAt: number;
}

let MAX_ENTRIES = 500;
const cache = new Map<string, CacheEntry>();

function normalizeKey(email: string): string {
  return email.trim().toLowerCase();
}

export function getCachedLookup(email: string): HubSpotLookupResult | undefined {
  const key = normalizeKey(email);
  const entry = cache.get(key);
  if (!entry) return undefined;
  if (entry.expiresAt <= Date.now()) {
    cache.delete(key);
    return undefined;
  }
  // Touch for LRU recency.
  cache.delete(key);
  cache.set(key, entry);
  return entry.result;
}

export function setCachedLookup(
  email: string,
  result: HubSpotLookupResult,
  expiresAt: number,
): void {
  const key = normalizeKey(email);
  if (cache.has(key)) cache.delete(key);
  cache.set(key, { result, expiresAt });
  while (cache.size > MAX_ENTRIES) {
    const oldestKey = cache.keys().next().value;
    if (oldestKey === undefined) break;
    cache.delete(oldestKey);
  }
}

export function clearLookupCacheForTesting(): void {
  cache.clear();
}

export function _setMaxEntriesForTesting(n: number): void {
  MAX_ENTRIES = n;
}
