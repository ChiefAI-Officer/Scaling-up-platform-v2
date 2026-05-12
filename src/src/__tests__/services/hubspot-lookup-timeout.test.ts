/**
 * Wave 8-A blast-radius control: lookupHubSpotContact must abort after 8s and
 * return { kind: "error", reason: "timeout" } so the admin coach page renders
 * the error state instead of hanging on a slow HubSpot call. The
 * https.Agent.timeout configured on the SDK client is socket-idle-only and
 * does not abort a long request — we need an AbortController in-app.
 */

const mockDoSearch = jest.fn();

jest.mock("@hubspot/api-client", () => ({
  Client: jest.fn().mockImplementation(() => ({
    crm: {
      contacts: {
        searchApi: { doSearch: mockDoSearch },
      },
    },
  })),
  FilterOperatorEnum: { Eq: "EQ" },
}));

describe("lookupHubSpotContact timeout + cache + kill switch (Wave 8-A)", () => {
  const ORIGINAL_TOKEN = process.env.HUBSPOT_ACCESS_TOKEN;
  const ORIGINAL_FLAG = process.env.HUBSPOT_SIDE_CARD_ENABLED;

  beforeEach(() => {
    jest.resetModules();
    mockDoSearch.mockReset();
    process.env.HUBSPOT_ACCESS_TOKEN = "pat-test";
    process.env.HUBSPOT_SIDE_CARD_ENABLED = "true";
  });

  afterEach(() => {
    if (ORIGINAL_TOKEN === undefined) delete process.env.HUBSPOT_ACCESS_TOKEN;
    else process.env.HUBSPOT_ACCESS_TOKEN = ORIGINAL_TOKEN;
    if (ORIGINAL_FLAG === undefined) delete process.env.HUBSPOT_SIDE_CARD_ENABLED;
    else process.env.HUBSPOT_SIDE_CARD_ENABLED = ORIGINAL_FLAG;
    jest.useRealTimers();
  });

  function load() {
    jest.resetModules();
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    return require("@/services/hubspot") as typeof import("@/services/hubspot");
  }

  it('returns { kind: "unconfigured" } when HUBSPOT_SIDE_CARD_ENABLED is "false"', async () => {
    process.env.HUBSPOT_SIDE_CARD_ENABLED = "false";
    const { lookupHubSpotContact } = load();
    const result = await lookupHubSpotContact("coach@example.com");
    expect(result).toEqual({ kind: "unconfigured" });
    expect(mockDoSearch).not.toHaveBeenCalled();
  });

  it('returns { kind: "error", reason: "timeout" } when the SDK aborts', async () => {
    mockDoSearch.mockImplementation((_req, opts?: { signal?: AbortSignal }) => {
      return new Promise((_resolve, reject) => {
        opts?.signal?.addEventListener("abort", () => {
          const err: { name: string; message: string; code?: string } = {
            name: "AbortError",
            message: "aborted",
            code: "ABORT_ERR",
          };
          reject(err);
        });
      });
    });
    jest.useFakeTimers();
    const consoleSpy = jest.spyOn(console, "error").mockImplementation(() => {});
    const { lookupHubSpotContact } = load();
    const promise = lookupHubSpotContact("timeout@example.com");
    await jest.advanceTimersByTimeAsync(9_000);
    const result = await promise;
    expect(result.kind).toBe("error");
    if (result.kind === "error") {
      expect(result.reason).toBe("timeout");
    }
    consoleSpy.mockRestore();
  });

  it("returns cached result on second call within TTL (no second SDK call)", async () => {
    mockDoSearch.mockResolvedValue({ results: [] });
    const { lookupHubSpotContact } = load();
    const r1 = await lookupHubSpotContact("cache@example.com");
    expect(r1).toEqual({ kind: "not_found" });
    const r2 = await lookupHubSpotContact("cache@example.com");
    expect(r2).toEqual({ kind: "not_found" });
    expect(mockDoSearch).toHaveBeenCalledTimes(1);
  });

  it("emits a structured no-PII log line with kind, durationMs, cacheHit", async () => {
    mockDoSearch.mockResolvedValue({ results: [] });
    const consoleSpy = jest.spyOn(console, "info").mockImplementation(() => {});
    const { lookupHubSpotContact } = load();
    await lookupHubSpotContact("pii@example.com");
    const joined = consoleSpy.mock.calls.flat().map((v) => String(v ?? "")).join(" ");
    expect(joined).toMatch(/\[hubspot\.lookup\]/);
    expect(joined).toMatch(/kind=not_found/);
    expect(joined).toMatch(/durationMs=\d+/);
    expect(joined).toMatch(/cacheHit=(true|false)/);
    expect(joined).not.toContain("pii@example.com");
    consoleSpy.mockRestore();
  });
});
