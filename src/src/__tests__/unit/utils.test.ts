/**
 * Unit tests for utility functions
 */

import {
  cn,
  formatDate,
  formatEventDate,
  formatCurrency,
  generateSlug,
  getWorkshopStatusLabel,
  parseJsonField,
  formatVenueAddress,
  type VenueAddress,
} from "@/lib/utils";

describe("cn (class name merger)", () => {
  it("should merge class names", () => {
    const result = cn("foo", "bar");
    expect(result).toBe("foo bar");
  });

  it("should handle conditional classes", () => {
    const result = cn("base", true && "active", false && "hidden");
    expect(result).toBe("base active");
  });

  it("should handle undefined and null", () => {
    const result = cn("base", undefined, null, "end");
    expect(result).toBe("base end");
  });

  it("should merge tailwind classes correctly", () => {
    const result = cn("px-4 py-2", "px-6");
    expect(result).toBe("py-2 px-6");
  });
});

describe("formatDate", () => {
  it("should format date string correctly", () => {
    const result = formatDate("2025-03-15T12:00:00Z");
    expect(result).toMatch(/Mar(ch)?\s+15,?\s+2025/);
  });

  it("should format Date object correctly", () => {
    const date = new Date("2025-03-15T12:00:00Z");
    const result = formatDate(date);
    expect(result).toMatch(/Mar(ch)?\s+15,?\s+2025/);
  });

  it("should handle invalid date", () => {
    const result = formatDate("invalid");
    expect(result).toBe("Invalid Date");
  });
});

describe("formatEventDate", () => {
  it("formats July 1 UTC midnight as Jul 1, not Jun 30", () => {
    const result = formatEventDate(new Date("2026-07-01T00:00:00.000Z"));
    expect(result).toContain("Jul");
    expect(result).toContain("1");
    expect(result).not.toContain("Jun");
  });

  it("formats string dates correctly", () => {
    const result = formatEventDate("2026-07-01T00:00:00.000Z");
    expect(result).toContain("Jul");
  });

  it("returns Invalid Date for bad input", () => {
    expect(formatEventDate("not-a-date")).toBe("Invalid Date");
  });
});

describe("formatCurrency", () => {
  it("should format cents to dollars", () => {
    const result = formatCurrency(49900);
    expect(result).toBe("$499.00");
  });

  it("should format zero", () => {
    const result = formatCurrency(0);
    expect(result).toBe("$0.00");
  });

  it("should handle cents", () => {
    const result = formatCurrency(99);
    expect(result).toBe("$0.99");
  });

  it("should format large amounts", () => {
    const result = formatCurrency(1234567);
    expect(result).toBe("$12,345.67");
  });
});

describe("generateSlug", () => {
  it("should convert title to slug", () => {
    const result = generateSlug("AI Workshop - Chicago March 2025");
    expect(result).toBe("ai-workshop-chicago-march-2025");
  });

  it("should handle special characters", () => {
    const result = generateSlug("Hello & Goodbye!");
    expect(result).toBe("hello-goodbye");
  });

  it("should handle multiple spaces", () => {
    const result = generateSlug("Multiple   Spaces   Here");
    expect(result).toBe("multiple-spaces-here");
  });

  it("should handle leading/trailing spaces", () => {
    const result = generateSlug("  Trim Me  ");
    expect(result).toBe("trim-me");
  });

  it("should handle numbers", () => {
    const result = generateSlug("Workshop 2025");
    expect(result).toBe("workshop-2025");
  });
});

describe("getWorkshopStatusLabel", () => {
  it("should return human-readable labels for all statuses", () => {
    expect(getWorkshopStatusLabel("INFO_REQUESTED")).toBe("Info Requested");
    expect(getWorkshopStatusLabel("AWAITING_APPROVAL")).toBe("Awaiting Approval");
    expect(getWorkshopStatusLabel("PRE_EVENT")).toBe("Pre-Event");
    expect(getWorkshopStatusLabel("POST_EVENT")).toBe("Post-Event");
    expect(getWorkshopStatusLabel("COMPLETED")).toBe("Completed");
    expect(getWorkshopStatusLabel("CANCELED")).toBe("Canceled");
  });

  it("should return original status for unknown status", () => {
    expect(getWorkshopStatusLabel("UNKNOWN")).toBe("UNKNOWN");
  });
});

describe("parseJsonField", () => {
  it("should parse valid JSON string", () => {
    const json = JSON.stringify({ foo: "bar" });
    const result = parseJsonField<{ foo: string }>(json);
    expect(result).toEqual({ foo: "bar" });
  });

  it("should return null for null input", () => {
    const result = parseJsonField(null);
    expect(result).toBeNull();
  });

  it("should return null for undefined input", () => {
    const result = parseJsonField(undefined);
    expect(result).toBeNull();
  });

  it("should return null for invalid JSON", () => {
    const result = parseJsonField("not valid json");
    expect(result).toBeNull();
  });

  it("should return null for empty string", () => {
    const result = parseJsonField("");
    expect(result).toBeNull();
  });

  it("should parse array JSON", () => {
    const json = JSON.stringify([1, 2, 3]);
    const result = parseJsonField<number[]>(json);
    expect(result).toEqual([1, 2, 3]);
  });
});

describe("formatVenueAddress", () => {
  it("should format complete address", () => {
    const address: VenueAddress = {
      street: "540 N Michigan Ave",
      city: "Chicago",
      state: "IL",
      zip: "60611",
    };
    const json = JSON.stringify(address);
    const result = formatVenueAddress(json);
    expect(result).toBe("540 N Michigan Ave, Chicago, IL 60611");
  });

  it("should format address without street", () => {
    const address: VenueAddress = {
      city: "Chicago",
      state: "IL",
      zip: "60611",
    };
    const json = JSON.stringify(address);
    const result = formatVenueAddress(json);
    expect(result).toBe("Chicago, IL 60611");
  });

  it("should format address with only city and state", () => {
    const address: VenueAddress = {
      city: "Chicago",
      state: "IL",
    };
    const json = JSON.stringify(address);
    const result = formatVenueAddress(json);
    expect(result).toBe("Chicago, IL");
  });

  it("should return empty string for null input", () => {
    const result = formatVenueAddress(null);
    expect(result).toBe("");
  });

  it("should return empty string for invalid JSON", () => {
    const result = formatVenueAddress("not json");
    expect(result).toBe("");
  });

  it("should handle address with only zip", () => {
    const address: VenueAddress = {
      zip: "60611",
    };
    const json = JSON.stringify(address);
    const result = formatVenueAddress(json);
    expect(result).toBe("60611");
  });
});
