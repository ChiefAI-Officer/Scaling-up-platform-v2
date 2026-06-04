/**
 * formatTimeWithZone appends a DST-aware short timezone abbreviation (e.g. "CDT")
 * to a workshop's free-form eventTime string, derived from the workshop's IANA
 * timezone evaluated on the event's UTC calendar date.
 *
 * PARSER-INDEPENDENT: it does NOT parse eventTime. It computes the abbreviation
 * from a noon-UTC instant on the event's UTC calendar date — far enough past the
 * 2 AM DST transition that the abbreviation is correct for all 9 Americas/Pacific
 * zones regardless of the actual (unparsed) wall-clock time.
 */

import { formatTimeWithZone, formatZoneAbbrev } from "@/lib/utils";

describe("formatTimeWithZone", () => {
  it("appends CST for America/Chicago on a winter (non-DST) date", () => {
    const result = formatTimeWithZone("9:00 AM", new Date("2026-01-15T00:00:00.000Z"), "America/Chicago");
    expect(result).toBe("9:00 AM CST");
  });

  it("DST spring-forward: Chicago on 2026-03-08 is CDT (not CST)", () => {
    // 2026-03-08 is the US spring-forward day; noon UTC = 06:00 CST -> already CDT after 2 AM transition
    const result = formatTimeWithZone("16:00 - 18:00", new Date("2026-03-08T00:00:00.000Z"), "America/Chicago");
    expect(result).toBe("16:00 - 18:00 CDT");
  });

  it("DST spring-forward: Los Angeles on 2026-03-08 is PDT", () => {
    const result = formatTimeWithZone("10:00 AM", new Date("2026-03-08T00:00:00.000Z"), "America/Los_Angeles");
    expect(result).toBe("10:00 AM PDT");
  });

  it("DST fall-back: Chicago on 2026-11-01 is CST", () => {
    const result = formatTimeWithZone("9:00 AM", new Date("2026-11-01T00:00:00.000Z"), "America/Chicago");
    expect(result).toBe("9:00 AM CST");
  });

  it("America/Phoenix is MST regardless of date (no DST)", () => {
    expect(formatTimeWithZone("9:00 AM", new Date("2026-07-15T00:00:00.000Z"), "America/Phoenix")).toBe("9:00 AM MST");
    expect(formatTimeWithZone("9:00 AM", new Date("2026-01-15T00:00:00.000Z"), "America/Phoenix")).toBe("9:00 AM MST");
  });

  it("Pacific/Honolulu is HST", () => {
    expect(formatTimeWithZone("2:00 PM", new Date("2026-06-01T00:00:00.000Z"), "Pacific/Honolulu")).toBe("2:00 PM HST");
  });

  it("preserves the '9:00 AM' eventTime format", () => {
    expect(formatTimeWithZone("9:00 AM", new Date("2026-06-15T00:00:00.000Z"), "America/Chicago")).toBe("9:00 AM CDT");
  });

  it("preserves the '16:00 - 18:00' range eventTime format", () => {
    expect(formatTimeWithZone("16:00 - 18:00", new Date("2026-06-15T00:00:00.000Z"), "America/Chicago")).toBe("16:00 - 18:00 CDT");
  });

  it("accepts a string eventDate (not just a Date object)", () => {
    expect(formatTimeWithZone("9:00 AM", "2026-06-15T00:00:00.000Z", "America/Chicago")).toBe("9:00 AM CDT");
  });

  it("returns empty eventTime unchanged with no zone (no crash)", () => {
    expect(formatTimeWithZone("", new Date("2026-06-15T00:00:00.000Z"), "America/Chicago")).toBe("");
  });

  it("returns 'TBD' unchanged with no zone (case-insensitive)", () => {
    expect(formatTimeWithZone("TBD", new Date("2026-06-15T00:00:00.000Z"), "America/Chicago")).toBe("TBD");
    expect(formatTimeWithZone("tbd", new Date("2026-06-15T00:00:00.000Z"), "America/Chicago")).toBe("tbd");
  });

  it("returns null eventTime as 'TBD' with no zone", () => {
    expect(formatTimeWithZone(null, new Date("2026-06-15T00:00:00.000Z"), "America/Chicago")).toBe("TBD");
  });

  it("returns undefined eventTime as 'TBD' with no zone", () => {
    expect(formatTimeWithZone(undefined, new Date("2026-06-15T00:00:00.000Z"), "America/Chicago")).toBe("TBD");
  });

  it("returns the time unchanged when timezone is missing/empty (no zone)", () => {
    expect(formatTimeWithZone("9:00 AM", new Date("2026-06-15T00:00:00.000Z"), null)).toBe("9:00 AM");
    expect(formatTimeWithZone("9:00 AM", new Date("2026-06-15T00:00:00.000Z"), "")).toBe("9:00 AM");
    expect(formatTimeWithZone("9:00 AM", new Date("2026-06-15T00:00:00.000Z"), undefined)).toBe("9:00 AM");
  });

  it("invalid IANA timezone returns the time unchanged and does NOT throw", () => {
    expect(() =>
      formatTimeWithZone("9:00 AM", new Date("2026-06-15T00:00:00.000Z"), "Not/AZone"),
    ).not.toThrow();
    expect(formatTimeWithZone("9:00 AM", new Date("2026-06-15T00:00:00.000Z"), "Not/AZone")).toBe("9:00 AM");
  });

  it("invalid eventDate returns the time unchanged and does NOT throw", () => {
    expect(() => formatTimeWithZone("9:00 AM", "not-a-date", "America/Chicago")).not.toThrow();
    expect(formatTimeWithZone("9:00 AM", "not-a-date", "America/Chicago")).toBe("9:00 AM");
  });
});

describe("formatZoneAbbrev", () => {
  it("returns just the abbreviation for a valid zone/date", () => {
    expect(formatZoneAbbrev(new Date("2026-06-15T00:00:00.000Z"), "America/Chicago")).toBe("CDT");
    expect(formatZoneAbbrev(new Date("2026-01-15T00:00:00.000Z"), "America/Chicago")).toBe("CST");
  });

  it("returns empty string for missing timezone", () => {
    expect(formatZoneAbbrev(new Date("2026-06-15T00:00:00.000Z"), null)).toBe("");
    expect(formatZoneAbbrev(new Date("2026-06-15T00:00:00.000Z"), "")).toBe("");
  });

  it("returns empty string for an invalid timezone (no throw)", () => {
    expect(() => formatZoneAbbrev(new Date("2026-06-15T00:00:00.000Z"), "Not/AZone")).not.toThrow();
    expect(formatZoneAbbrev(new Date("2026-06-15T00:00:00.000Z"), "Not/AZone")).toBe("");
  });
});
