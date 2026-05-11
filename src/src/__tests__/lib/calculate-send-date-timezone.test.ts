/**
 * BUG-MAY6-3: calculateSendDate must honor the workshop's timezone when
 * applying sendTimeOfDay (e.g., "09:00"). Pre-fix the timezone parameter was
 * declared but never used; sendDate.setHours(9, 0, 0, 0) on a UTC server set
 * UTC 09:00, not 09:00 in the workshop's local zone. The post-event coach
 * survey ("1 day after at 9 AM") consequently fired at 4–5 AM Eastern.
 */

import { calculateSendDate } from "@/lib/workflows/workflow-service";

describe("calculateSendDate timezone — BUG-MAY6-3", () => {
  it("EDT (UTC-4): 1 day after a May event at sendTimeOfDay='09:00' America/New_York returns 13:00 UTC", () => {
    // Event May 6 4 PM ET = 20:00 UTC. +1 day → May 7 at 09:00 ET = 13:00 UTC.
    const eventDate = new Date("2026-05-06T20:00:00.000Z");

    const result = calculateSendDate(eventDate, 1, null, "09:00", "America/New_York");

    expect(result.toISOString()).toBe("2026-05-07T13:00:00.000Z");
  });

  it("EST (UTC-5, no DST): 1 day after a December event at sendTimeOfDay='09:00' America/New_York returns 14:00 UTC", () => {
    // Event Dec 1 1 PM ET = 18:00 UTC. +1 day → Dec 2 at 09:00 ET = 14:00 UTC.
    const eventDate = new Date("2026-12-01T18:00:00.000Z");

    const result = calculateSendDate(eventDate, 1, null, "09:00", "America/New_York");

    expect(result.toISOString()).toBe("2026-12-02T14:00:00.000Z");
  });

  it("PST (UTC-8): 30 days after at sendTimeOfDay='09:00' America/Los_Angeles returns 17:00 UTC", () => {
    const eventDate = new Date("2026-12-01T18:00:00.000Z");

    const result = calculateSendDate(eventDate, 30, null, "09:00", "America/Los_Angeles");

    expect(result.toISOString()).toBe("2026-12-31T17:00:00.000Z");
  });

  it("UTC timezone: sendTimeOfDay='09:00' returns 09:00 UTC", () => {
    const eventDate = new Date("2026-05-06T20:00:00.000Z");

    const result = calculateSendDate(eventDate, 1, null, "09:00", "UTC");

    expect(result.toISOString()).toBe("2026-05-07T09:00:00.000Z");
  });

  it("offsetHours path is unaffected by timezone (subtracts absolute hours from event moment)", () => {
    // 2 hours before 4 PM ET (= 20:00 UTC) = 18:00 UTC, regardless of timezone parameter.
    const eventDate = new Date("2026-05-06T20:00:00.000Z");

    const result = calculateSendDate(eventDate, 0, -2, null, "America/New_York");

    expect(result.toISOString()).toBe("2026-05-06T18:00:00.000Z");
  });
});
