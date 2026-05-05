/**
 * BUG-MAY4-1a: resolveEventStartMoment combines Workshop.eventDate (midnight UTC)
 * with Workshop.eventTime (free-form string like "16:00 - 18:00") and
 * Workshop.timezone (IANA like "America/New_York") into a real Date pointing
 * at the actual moment the event starts.
 *
 * Without this, calculateSendDate(eventDate, offsetHours) computes scheduledFor
 * from midnight UTC and lands ~20 hours before the actual event start time
 * for a 4 PM EDT workshop.
 */

import { resolveEventStartMoment } from "@/lib/workflows/resolve-event-start-moment";
import { calculateSendDate } from "@/lib/workflows/workflow-service";

describe("resolveEventStartMoment — BUG-MAY4-1a", () => {
  it("Jeff's exact failing case: midnight UTC + '16:00 - 18:00' + 'America/New_York' resolves to 4 PM EDT (May 4 20:00 UTC)", () => {
    const workshop = {
      eventDate: new Date("2026-05-04T00:00:00.000Z"),
      eventTime: "16:00 - 18:00",
      timezone: "America/New_York",
    };

    const result = resolveEventStartMoment(workshop);

    // 4 PM EDT on May 4, 2026 = 20:00 UTC (EDT = UTC-4 in May)
    expect(result.toISOString()).toBe("2026-05-04T20:00:00.000Z");
  });

  it("non-DST winter: '09:00' + 'America/Los_Angeles' on Dec 1 resolves to 17:00 UTC (PST = UTC-8)", () => {
    const workshop = {
      eventDate: new Date("2026-12-01T00:00:00.000Z"),
      eventTime: "09:00",
      timezone: "America/Los_Angeles",
    };

    const result = resolveEventStartMoment(workshop);

    expect(result.toISOString()).toBe("2026-12-01T17:00:00.000Z");
  });

  it("missing eventTime → falls back to eventDate as stored (no time-of-day shift)", () => {
    const eventDate = new Date("2026-05-04T00:00:00.000Z");
    const workshop = {
      eventDate,
      eventTime: null,
      timezone: "America/New_York",
    };

    const result = resolveEventStartMoment(workshop);

    expect(result.toISOString()).toBe(eventDate.toISOString());
  });

  it("malformed eventTime ('TBD') → falls back to eventDate as stored", () => {
    const eventDate = new Date("2026-05-04T00:00:00.000Z");
    const workshop = {
      eventDate,
      eventTime: "TBD",
      timezone: "America/New_York",
    };

    const result = resolveEventStartMoment(workshop);

    expect(result.toISOString()).toBe(eventDate.toISOString());
  });

  it("missing timezone → treats wall-clock as UTC", () => {
    const workshop = {
      eventDate: new Date("2026-05-04T00:00:00.000Z"),
      eventTime: "16:00",
      timezone: null,
    };

    const result = resolveEventStartMoment(workshop);

    // 16:00 UTC on the event day
    expect(result.toISOString()).toBe("2026-05-04T16:00:00.000Z");
  });

  it("DST spring-forward day: 10:00 EDT on March 8 2026 resolves correctly (spring forward at 02:00 local)", () => {
    // March 8 2026 in America/New_York: DST starts at 02:00 local. After 02:00 → EDT (UTC-4).
    const workshop = {
      eventDate: new Date("2026-03-08T00:00:00.000Z"),
      eventTime: "10:00",
      timezone: "America/New_York",
    };

    const result = resolveEventStartMoment(workshop);

    // 10:00 EDT = 14:00 UTC (DST active)
    expect(result.toISOString()).toBe("2026-03-08T14:00:00.000Z");
  });

  it("integration with calculateSendDate: Jeff's exact prod failure case now produces 3 PM EDT, not 23:00 UTC the day before", () => {
    // Jeff's prod row from WS-2026-QN5H:
    //   eventDate = 2026-05-04T00:00:00Z (midnight UTC May 4)
    //   eventTime = "16:00 - 18:00"
    //   timezone = "America/New_York"
    //   step.offsetHours = -1 (1 hour before)
    //
    // BEFORE this fix: calculateSendDate(midnight UTC, 0, -1) → 2026-05-03T23:00:00Z
    //                  (20 hours before actual event start)
    // AFTER this fix:  resolveEventStartMoment first → 2026-05-04T20:00:00Z (4 PM EDT)
    //                  then calculateSendDate(20:00 UTC, 0, -1) → 2026-05-04T19:00:00Z (3 PM EDT)
    const startMoment = resolveEventStartMoment({
      eventDate: new Date("2026-05-04T00:00:00.000Z"),
      eventTime: "16:00 - 18:00",
      timezone: "America/New_York",
    });

    const scheduledFor = calculateSendDate(startMoment, 0, -1, null, "America/New_York");

    expect(scheduledFor.toISOString()).toBe("2026-05-04T19:00:00.000Z");
  });
});
