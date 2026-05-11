/**
 * Q-MAY6-2 + Round 2 M5: discriminated lookup for HubSpot side card on admin
 * coach detail page.
 *
 * Returns `{ kind: "unconfigured" | "not_found" | "error" | "found" }` instead
 * of a null-collapsed result so the side card can render a distinct state per
 * outcome (auth failures shouldn't show as "Not found"). Error logging is
 * sanitized — no email, body, or headers in the structured log payload.
 *
 * Round 1 M7 also addressed: drops `hs_lead_status` from the property request
 * (HubSpot accounts can strip optional properties → PROPERTY_DOESNT_EXIST
 * fails the whole search). Only stock properties requested.
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

describe("lookupHubSpotContact (Q-MAY6-2)", () => {
  const ORIGINAL_TOKEN = process.env.HUBSPOT_ACCESS_TOKEN;
  const ORIGINAL_PORTAL = process.env.HUBSPOT_PORTAL_ID;

  beforeEach(() => {
    jest.resetModules();
    mockDoSearch.mockReset();
  });

  afterEach(() => {
    if (ORIGINAL_TOKEN === undefined) {
      delete process.env.HUBSPOT_ACCESS_TOKEN;
    } else {
      process.env.HUBSPOT_ACCESS_TOKEN = ORIGINAL_TOKEN;
    }
    if (ORIGINAL_PORTAL === undefined) {
      delete process.env.HUBSPOT_PORTAL_ID;
    } else {
      process.env.HUBSPOT_PORTAL_ID = ORIGINAL_PORTAL;
    }
  });

  function load() {
    jest.resetModules();
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    return require("@/services/hubspot") as typeof import("@/services/hubspot");
  }

  it('returns { kind: "unconfigured" } when HUBSPOT_ACCESS_TOKEN is unset', async () => {
    delete process.env.HUBSPOT_ACCESS_TOKEN;
    const { lookupHubSpotContact } = load();
    const result = await lookupHubSpotContact("coach@example.com");
    expect(result).toEqual({ kind: "unconfigured" });
    expect(mockDoSearch).not.toHaveBeenCalled();
  });

  it('returns { kind: "not_found" } when search returns zero results', async () => {
    process.env.HUBSPOT_ACCESS_TOKEN = "pat-test";
    mockDoSearch.mockResolvedValue({ results: [] });
    const { lookupHubSpotContact } = load();
    const result = await lookupHubSpotContact("coach@example.com");
    expect(result).toEqual({ kind: "not_found" });
  });

  it('returns { kind: "found", contact } when search returns a contact', async () => {
    process.env.HUBSPOT_ACCESS_TOKEN = "pat-test";
    mockDoSearch.mockResolvedValue({
      results: [
        {
          id: "12345",
          properties: {
            email: "coach@example.com",
            firstname: "Lynne",
            lastname: "Verdun",
            lifecyclestage: "customer",
            lastmodifieddate: "2026-05-10T12:00:00.000Z",
          },
        },
      ],
    });
    const { lookupHubSpotContact } = load();
    const result = await lookupHubSpotContact("coach@example.com");
    expect(result.kind).toBe("found");
    if (result.kind === "found") {
      expect(result.contact.id).toBe("12345");
      expect(result.contact.properties.lifecyclestage).toBe("customer");
    }
  });

  it('requests lifecyclestage and lastmodifieddate; does NOT request hs_lead_status (Round 1 M7)', async () => {
    process.env.HUBSPOT_ACCESS_TOKEN = "pat-test";
    mockDoSearch.mockResolvedValue({ results: [] });
    const { lookupHubSpotContact } = load();
    await lookupHubSpotContact("coach@example.com");

    expect(mockDoSearch).toHaveBeenCalledTimes(1);
    const arg = mockDoSearch.mock.calls[0][0];
    expect(arg.properties).toContain("lifecyclestage");
    expect(arg.properties).toContain("lastmodifieddate");
    expect(arg.properties).not.toContain("hs_lead_status");
  });

  it('returns { kind: "error", status } on PROPERTY_DOESNT_EXIST without leaking PII', async () => {
    process.env.HUBSPOT_ACCESS_TOKEN = "pat-test";
    const consoleSpy = jest.spyOn(console, "error").mockImplementation(() => {});
    mockDoSearch.mockRejectedValue({
      code: 400,
      body: { category: "VALIDATION_ERROR", message: "PROPERTY_DOESNT_EXIST" },
    });

    const { lookupHubSpotContact } = load();
    const result = await lookupHubSpotContact("coach@example.com");

    expect(result.kind).toBe("error");
    if (result.kind === "error") {
      expect(result.status).toBe(400);
    }

    // Sanitized log: must NOT include the searched email, raw body, or full error object
    const allLogs = consoleSpy.mock.calls.flat().map((v) => JSON.stringify(v ?? ""));
    const joined = allLogs.join(" ");
    expect(joined).not.toContain("coach@example.com");
    consoleSpy.mockRestore();
  });

  it('returns { kind: "error", status } on auth/rate-limit error without leaking PII', async () => {
    process.env.HUBSPOT_ACCESS_TOKEN = "pat-test";
    const consoleSpy = jest.spyOn(console, "error").mockImplementation(() => {});
    mockDoSearch.mockRejectedValue({ code: 429, message: "rate limited" });

    const { lookupHubSpotContact } = load();
    const result = await lookupHubSpotContact("attendee@example.com");

    expect(result.kind).toBe("error");
    if (result.kind === "error") {
      expect(result.status).toBe(429);
    }

    const joined = consoleSpy.mock.calls.flat().map((v) => JSON.stringify(v ?? "")).join(" ");
    expect(joined).not.toContain("attendee@example.com");
    consoleSpy.mockRestore();
  });
});

describe("getHubSpotPortalId (Q-MAY6-2)", () => {
  const ORIGINAL = process.env.HUBSPOT_PORTAL_ID;

  afterEach(() => {
    if (ORIGINAL === undefined) {
      delete process.env.HUBSPOT_PORTAL_ID;
    } else {
      process.env.HUBSPOT_PORTAL_ID = ORIGINAL;
    }
  });

  function load() {
    jest.resetModules();
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    return require("@/services/hubspot") as typeof import("@/services/hubspot");
  }

  it("returns the env var value when set", () => {
    process.env.HUBSPOT_PORTAL_ID = "12345";
    const { getHubSpotPortalId } = load();
    expect(getHubSpotPortalId()).toBe("12345");
  });

  it("returns null when env var is unset", () => {
    delete process.env.HUBSPOT_PORTAL_ID;
    const { getHubSpotPortalId } = load();
    expect(getHubSpotPortalId()).toBeNull();
  });
});
