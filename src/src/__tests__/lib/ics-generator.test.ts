import {
  generateIcsContent,
  IcsEventData,
  parseDurationHours,
  parseDurationHoursFromEvent,
} from "@/lib/ics-generator";

describe("ics-generator", () => {
  const baseData: IcsEventData = {
    uid: "test-uid@example.com",
    title: "Test Workshop",
    eventDate: new Date("2026-06-15T00:00:00.000Z"),
    timezone: "America/New_York",
    durationHours: 8,
  };

  it("includes METHOD:REQUEST when method is REQUEST", () => {
    const content = generateIcsContent({ ...baseData, method: "REQUEST" });
    expect(content).toContain("METHOD:REQUEST");
    expect(content).not.toContain("METHOD:PUBLISH");
  });

  it("defaults to METHOD:PUBLISH when method is omitted", () => {
    const content = generateIcsContent(baseData);
    expect(content).toContain("METHOD:PUBLISH");
  });

  it("always emits SEQUENCE:0 regardless of method", () => {
    const withPublish = generateIcsContent(baseData);
    const withRequest = generateIcsContent({ ...baseData, method: "REQUEST" });
    expect(withPublish).toContain("SEQUENCE:0");
    expect(withRequest).toContain("SEQUENCE:0");
  });
});

describe("parseDurationHours", () => {
  it('parses "2 hours" → 2', () => {
    expect(parseDurationHours("2 hours")).toBe(2);
  });

  it('parses "3 hours" → 3', () => {
    expect(parseDurationHours("3 hours")).toBe(3);
  });

  it("returns 2 for null (safe default)", () => {
    expect(parseDurationHours(null)).toBe(2);
  });

  it('parses "full-day" → 8', () => {
    expect(parseDurationHours("full-day")).toBe(8);
  });

  it('parses "8hr" → 8 (seed-real-data compat)', () => {
    expect(parseDurationHours("8hr")).toBe(8);
  });

  it('parses "4hr" → 4 (seed-real-data compat)', () => {
    expect(parseDurationHours("4hr")).toBe(4);
  });

  it('parses "virtual-2hr" → 2', () => {
    expect(parseDurationHours("virtual-2hr")).toBe(2);
  });
});

describe("parseDurationHoursFromEvent", () => {
  it("derives 2h from eventTime range HH:MM - HH:MM (hyphen)", () => {
    expect(parseDurationHoursFromEvent(null, "14:00 - 16:00")).toBe(2);
  });

  it("falls back to parseDurationHours when eventTime is null", () => {
    expect(parseDurationHoursFromEvent("2 hours", null)).toBe(2);
  });

  it("derives 8h from eventTime range with en-dash", () => {
    expect(parseDurationHoursFromEvent(null, "09:00 – 17:00")).toBe(8);
  });

  it("prefers eventTime range over duration string", () => {
    // eventTime says 2h; duration string says 4h — eventTime wins
    expect(parseDurationHoursFromEvent("half-day", "10:00 - 12:00")).toBe(2);
  });
});
