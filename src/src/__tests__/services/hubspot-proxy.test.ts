/**
 * BUG-MAY11-2 / Wave 8-A regression: hubspotClient Proxy must bind chained
 * SDK calls to the real Client instance.
 *
 * Old Proxy passed `receiver` (the Proxy) to `Reflect.get`, so HubSpot Client
 * getters that touched `this` resolved with `this === proxy === {}`. The chain
 * `client.crm.contacts.searchApi.doSearch` worked shape-wise but the
 * resulting calls bound `this` to the wrong object.
 *
 * These tests use a mock Client class whose `crm` is a lazy-caching getter
 * returning a nested chain. The nested API method asserts that `parent` is a
 * real Client instance — which only holds when the Proxy returns the real
 * client through chained reads (not the proxy itself).
 */

class MockNestedApi {
  constructor(private readonly parent: MockClient) {}
  async doSearch(req: unknown) {
    if (!(this.parent instanceof MockClient)) {
      throw new TypeError(
        "doSearch invoked with wrong parent binding (Proxy receiver bug)",
      );
    }
    return { results: [{ id: "1", parentToken: this.parent.token }], _req: req };
  }
}

class MockClient {
  token: string;
  // Lazy cache lives on `this` — buggy Proxy would write it to the wrong
  // target via Reflect.get with receiver, which is exactly the kind of
  // regression we are guarding.
  private _crm?: { contacts: { searchApi: MockNestedApi } };
  constructor(opts: { accessToken: string }) {
    this.token = opts.accessToken;
  }
  get crm() {
    if (!this._crm) {
      this._crm = { contacts: { searchApi: new MockNestedApi(this) } };
    }
    return this._crm;
  }
}

jest.mock("@hubspot/api-client", () => ({
  Client: MockClient,
  FilterOperatorEnum: { Eq: "EQ" },
}));

describe("hubspotClient Proxy (Wave 8-A)", () => {
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

  it("binds nested SDK chain calls to the real Client (this !== proxy)", async () => {
    const { hubspotClient } = load();
    // The mock asserts `parent instanceof MockClient`. With the receiver bug
    // `parent` is the Proxy and the assertion throws.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = await (hubspotClient as any).crm.contacts.searchApi.doSearch({ q: 1 });
    expect(result.results[0].parentToken).toBe("pat-test");
  });

  it("returns identity-stable references for chained getters", () => {
    const { hubspotClient } = load();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const a = (hubspotClient as any).crm;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const b = (hubspotClient as any).crm;
    expect(a).toBe(b);
    expect(a.contacts.searchApi.doSearch).toBe(b.contacts.searchApi.doSearch);
  });
});
