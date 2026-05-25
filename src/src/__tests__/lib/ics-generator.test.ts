import {
  buildGoogleCalendarUrl,
  buildIcsDescription,
  buildLocationString,
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

  it("parses minutes from eventTime range (HH:MM - HH:MM) for DTSTART/DTEND", () => {
    // June 15 2026 is EDT (UTC-4); 14:30 EDT = 18:30 UTC; 16:00 EDT = 20:00 UTC
    const content = generateIcsContent({
      ...baseData,
      eventTime: "14:30 - 16:00",
      durationHours: 1.5,
    });
    expect(content).toContain("DTSTART:20260615T183000Z");
    expect(content).toContain("DTEND:20260615T200000Z");
  });

  it("buildGoogleCalendarUrl parses minutes from eventTime range", () => {
    // June 15 2026 is EDT (UTC-4); 14:30 EDT = 18:30 UTC
    const url = buildGoogleCalendarUrl({
      ...baseData,
      eventTime: "14:30 - 16:00",
      durationHours: 1.5,
    });
    const parsed = new URL(url);
    const dates = parsed.searchParams.get("dates");
    expect(dates).not.toBeNull();
    const [startSegment] = (dates ?? "").split("/");
    expect(startSegment).toBe("20260615T183000Z");
  });

  it("handles zero-minute eventTime range (regression)", () => {
    // June 15 2026 is EDT (UTC-4); 09:00 EDT = 13:00 UTC; 17:00 EDT = 21:00 UTC
    const content = generateIcsContent({
      ...baseData,
      eventTime: "09:00 - 17:00",
      durationHours: 8,
    });
    expect(content).toContain("DTSTART:20260615T130000Z");
    expect(content).toContain("DTEND:20260615T210000Z");
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

describe("buildLocationString — virtual workshops (Gmail Directions button fix)", () => {
  // BUG-MAY12: Gmail renders a "Directions" button at the top of inbox calendar
  // previews whenever the ICS LOCATION field is set. For VIRTUAL workshops the
  // location is a meeting URL, so "Directions" is useless. Return "" so
  // generateIcsContent + buildGoogleCalendarUrl OMIT the LOCATION field.
  it("returns empty string for VIRTUAL workshops (no Gmail Directions button)", () => {
    expect(
      buildLocationString({
        format: "VIRTUAL",
        virtualLink: "https://zoom.us/j/x",
      })
    ).toBe("");
  });

  it("returns empty string for VIRTUAL even when virtualLink is null/empty", () => {
    expect(buildLocationString({ format: "VIRTUAL" })).toBe("");
    expect(buildLocationString({ format: "VIRTUAL", virtualLink: null })).toBe("");
  });

  it("IN_PERSON still produces venue + address (regression)", () => {
    expect(
      buildLocationString({
        format: "IN_PERSON",
        venueName: "Marriott",
        venueAddress: '{"city":"Austin"}',
      })
    ).toBe("Marriott, Austin");
  });
});

describe("buildIcsDescription", () => {
  it("appends join link for VIRTUAL with description", () => {
    expect(
      buildIcsDescription({
        description: "Workshop on X",
        format: "VIRTUAL",
        virtualLink: "https://zoom.us/j/x",
      })
    ).toBe("Workshop on X\n\nJoin online: https://zoom.us/j/x");
  });

  it("returns just the join line for VIRTUAL with no description", () => {
    expect(
      buildIcsDescription({
        description: null,
        format: "VIRTUAL",
        virtualLink: "https://zoom.us/j/x",
      })
    ).toBe("Join online: https://zoom.us/j/x");
  });

  it("returns description unchanged for IN_PERSON (no join line appended)", () => {
    expect(
      buildIcsDescription({
        description: "Foo",
        format: "IN_PERSON",
        virtualLink: null,
      })
    ).toBe("Foo");
  });

  it("appends join link for HYBRID with virtualLink", () => {
    expect(
      buildIcsDescription({
        description: "Hybrid event",
        format: "HYBRID",
        virtualLink: "https://meet.example.com/abc",
      })
    ).toBe("Hybrid event\n\nJoin online: https://meet.example.com/abc");
  });

  it("returns empty string for VIRTUAL with no description and no link", () => {
    expect(
      buildIcsDescription({
        description: null,
        format: "VIRTUAL",
        virtualLink: null,
      })
    ).toBe("");
  });
});

describe("generateIcsContent — UTC absolute datetime (CST/PST offset fix)", () => {
  it("emits DTSTART as UTC Z-suffix datetime, not TZID floating (Chicago workshop)", () => {
    // June 15 2026 is CDT (UTC-5); 9 AM CDT = 14:00 UTC
    const content = generateIcsContent({
      uid: "test-cst@example.com",
      title: "Chicago Workshop",
      eventDate: new Date("2026-06-15T00:00:00.000Z"),
      eventTime: "09:00",
      timezone: "America/Chicago",
      durationHours: 8,
    });
    expect(content).toContain("DTSTART:20260615T140000Z");
    expect(content).toContain("DTEND:20260615T220000Z");
    expect(content).not.toContain("DTSTART;TZID=");
    expect(content).not.toContain("DTEND;TZID=");
  });

  it("emits DTSTART as UTC Z-suffix datetime, not TZID floating (Los Angeles workshop)", () => {
    // June 15 2026 is PDT (UTC-7); 9 AM PDT = 16:00 UTC; 9 AM + 8h = 17:00 PDT = 00:00 UTC next day
    const content = generateIcsContent({
      uid: "test-pst@example.com",
      title: "LA Workshop",
      eventDate: new Date("2026-06-15T00:00:00.000Z"),
      eventTime: "09:00",
      timezone: "America/Los_Angeles",
      durationHours: 8,
    });
    expect(content).toContain("DTSTART:20260615T160000Z");
    expect(content).toContain("DTEND:20260616T000000Z");
    expect(content).not.toContain("DTSTART;TZID=");
  });
});

describe("generateIcsContent — Gmail Directions button regression", () => {
  const baseEventDate = new Date("2026-06-15T00:00:00.000Z");

  it("VIRTUAL: omits LOCATION line, puts join link in DESCRIPTION", () => {
    const workshop = {
      description: "Quarterly leadership virtual session",
      format: "VIRTUAL",
      virtualLink: "https://zoom.us/j/123456",
    } as const;
    const content = generateIcsContent({
      uid: "wsv@example.com",
      title: "Virtual Workshop",
      description: buildIcsDescription(workshop),
      eventDate: baseEventDate,
      eventTime: "10:00 - 12:00",
      timezone: "America/New_York",
      durationHours: 2,
      location: buildLocationString(workshop),
    });
    expect(content).not.toMatch(/^LOCATION:/m);
    expect(content).not.toContain("LOCATION:");
    expect(content).toContain(
      "DESCRIPTION:Quarterly leadership virtual session\\n\\nJoin online: https://zoom.us/j/123456"
    );
  });

  it("IN_PERSON: still emits LOCATION line (regression)", () => {
    const workshop = {
      description: "In-person session",
      format: "IN_PERSON",
      venueName: "Marriott",
      venueAddress: '{"city":"Austin"}',
      virtualLink: null,
    } as const;
    const content = generateIcsContent({
      uid: "wsp@example.com",
      title: "In-Person Workshop",
      description: buildIcsDescription(workshop),
      eventDate: baseEventDate,
      eventTime: "09:00 - 17:00",
      timezone: "America/Chicago",
      durationHours: 8,
      location: buildLocationString(workshop),
    });
    expect(content).toContain("LOCATION:Marriott\\, Austin");
  });
});
