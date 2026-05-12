/**
 * Wave 8-A blast-radius control: per-instance LRU cache for
 * lookupHubSpotContact results so a thundering herd from a Vercel cold start
 * can't multiply HubSpot load and admin coach pages stay fast on retries.
 */

import type { HubSpotLookupResult } from "@/services/hubspot";

describe("hubspot-lookup-cache (Wave 8-A)", () => {
  function load() {
    jest.resetModules();
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    return require("@/services/hubspot-lookup-cache") as typeof import("@/services/hubspot-lookup-cache");
  }

  const sample: HubSpotLookupResult = { kind: "not_found" };

  it("returns undefined on a cache miss", () => {
    const { getCachedLookup } = load();
    expect(getCachedLookup("missing@example.com")).toBeUndefined();
  });

  it("returns the stored result on a cache hit before TTL elapses", () => {
    const { getCachedLookup, setCachedLookup } = load();
    setCachedLookup("a@example.com", sample, Date.now() + 60_000);
    expect(getCachedLookup("a@example.com")).toEqual(sample);
  });

  it("returns undefined when the entry has expired (TTL)", () => {
    const { getCachedLookup, setCachedLookup } = load();
    setCachedLookup("b@example.com", sample, Date.now() - 1);
    expect(getCachedLookup("b@example.com")).toBeUndefined();
  });

  it("evicts the oldest entry when the cap is exceeded (LRU)", () => {
    const { getCachedLookup, setCachedLookup, _setMaxEntriesForTesting } = load();
    _setMaxEntriesForTesting(3);
    setCachedLookup("a@x", { kind: "not_found" }, Date.now() + 60_000);
    setCachedLookup("b@x", { kind: "not_found" }, Date.now() + 60_000);
    setCachedLookup("c@x", { kind: "not_found" }, Date.now() + 60_000);
    setCachedLookup("d@x", { kind: "not_found" }, Date.now() + 60_000);
    expect(getCachedLookup("a@x")).toBeUndefined();
    expect(getCachedLookup("d@x")).toEqual({ kind: "not_found" });
  });

  it("normalizes email keys (case-insensitive, trimmed)", () => {
    const { getCachedLookup, setCachedLookup } = load();
    setCachedLookup("  Coach@Example.COM ", sample, Date.now() + 60_000);
    expect(getCachedLookup("coach@example.com")).toEqual(sample);
  });
});
