/**
 * Wave 8-A / Codex round-2 LOW 1: verify the Proxy preserves the real
 * `@hubspot/api-client` Client shape — the nested getter chain
 * `crm.contacts.searchApi.doSearch` must resolve to a callable through the
 * Proxy, and references must be identity-stable across reads so callers can
 * store or compare them.
 *
 * No HTTP layer is stubbed — we only verify the SDK getter chain survives the
 * Proxy. Live HTTP behavior is verified post-deploy with the hardened probe.
 */

describe("hubspotClient real SDK shape (Wave 8-A)", () => {
  const ORIGINAL_TOKEN = process.env.HUBSPOT_ACCESS_TOKEN;

  beforeEach(() => {
    jest.resetModules();
    process.env.HUBSPOT_ACCESS_TOKEN = "pat-test";
  });

  afterEach(() => {
    if (ORIGINAL_TOKEN === undefined) {
      delete process.env.HUBSPOT_ACCESS_TOKEN;
    } else {
      process.env.HUBSPOT_ACCESS_TOKEN = ORIGINAL_TOKEN;
    }
  });

  function load() {
    jest.resetModules();
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    return require("@/services/hubspot") as typeof import("@/services/hubspot");
  }

  it("exposes the real SDK chain crm.contacts.searchApi.doSearch as a function", () => {
    const { hubspotClient } = load();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const chain = (hubspotClient as any).crm?.contacts?.searchApi?.doSearch;
    expect(typeof chain).toBe("function");
  });

  it("returns identity-stable references for crm and the chained doSearch", () => {
    const { hubspotClient } = load();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const c1 = (hubspotClient as any).crm;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const c2 = (hubspotClient as any).crm;
    expect(c1).toBe(c2);
    expect(c1.contacts.searchApi.doSearch).toBe(c2.contacts.searchApi.doSearch);
  });
});
