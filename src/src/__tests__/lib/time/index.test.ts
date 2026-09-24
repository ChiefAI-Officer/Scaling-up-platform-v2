import {
  formatInZone,
  fromInstant,
  toInstant,
  zoneLabel,
} from "@/lib/time";

describe("timezone boundary", () => {
  it("converts a Sydney wall-clock deadline to its UTC instant", () => {
    expect(
      toInstant("2026-10-16T17:00", "Australia/Sydney").toISOString(),
    ).toBe("2026-10-16T06:00:00.000Z");
  });

  it("handles the New York spring DST boundary in both directions", () => {
    expect(
      toInstant("2026-03-08T01:30", "America/New_York").toISOString(),
    ).toBe("2026-03-08T06:30:00.000Z");
    expect(
      toInstant("2026-03-08T03:30", "America/New_York").toISOString(),
    ).toBe("2026-03-08T07:30:00.000Z");
    expect(
      fromInstant(new Date("2026-03-08T07:30:00.000Z"), "America/New_York"),
    ).toBe("2026-03-08T03:30");
  });

  it("rejects a nonexistent wall-clock time in the spring DST gap", () => {
    expect(() =>
      toInstant("2026-03-08T02:30", "America/New_York"),
    ).toThrow(/does not exist/i);
  });

  it("uses the earlier offset for a duplicated fall-back wall-clock time", () => {
    expect(
      toInstant("2026-11-01T01:30", "America/New_York").toISOString(),
    ).toBe("2026-11-01T05:30:00.000Z");
  });

  it("preserves a non-hour offset", () => {
    expect(
      toInstant("2026-10-16T17:00", "Asia/Kolkata").toISOString(),
    ).toBe("2026-10-16T11:30:00.000Z");
  });

  it("labels and formats using the offset at the supplied date", () => {
    const winter = new Date("2026-01-16T06:00:00.000Z");
    const summer = new Date("2026-10-16T06:00:00.000Z");

    expect(zoneLabel("Australia/Sydney", winter)).toContain("UTC+11");
    expect(zoneLabel("Australia/Sydney", summer)).toContain("AEDT");
    expect(formatInZone(summer, "Australia/Sydney", "dateTime")).toBe(
      "Friday 16 October 2026, 5:00 PM AEDT",
    );
    expect(formatInZone(summer, "Australia/Sydney", "date")).toBe(
      "Fri 16 October 2026 AEDT",
    );
  });
});
