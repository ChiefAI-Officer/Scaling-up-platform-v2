/**
 * Tests for calculateSendDate() in workflow-service.ts
 *
 * Covers the hour-interval scheduling fix:
 * - hours offset with null sendTimeOfDay produces correct time relative to event
 * - days offset with sendTimeOfDay="09:00" still uses fixed time (existing behavior)
 * - hours offset with sendTimeOfDay set — sendTimeOfDay should be IGNORED (the fix)
 */

import { calculateSendDate } from "@/lib/workflows/workflow-service";

describe("calculateSendDate", () => {
  // Fixed event date: 2026-06-15 at 14:00:00 UTC
  const eventDate = new Date("2026-06-15T14:00:00Z");

  // ---- Days offset (existing behavior) ----

  it("days offset with no sendTimeOfDay returns eventDate + offsetDays", () => {
    const result = calculateSendDate(eventDate, -1);
    expect(result.getTime()).toBe(new Date("2026-06-14T14:00:00Z").getTime());
  });

  it("days offset with sendTimeOfDay='09:00' overrides time to 09:00", () => {
    const result = calculateSendDate(eventDate, -1, null, "09:00");
    // Should be June 14 at 09:00 (local time — setHours uses local)
    const expected = new Date("2026-06-14T14:00:00Z");
    expected.setDate(expected.getDate()); // June 14
    // Re-derive: eventDate - 1 day = June 14 14:00 UTC, then setHours(9,0,0,0) in local
    const manualExpected = new Date(eventDate);
    manualExpected.setDate(manualExpected.getDate() - 1);
    manualExpected.setHours(9, 0, 0, 0);
    expect(result.getTime()).toBe(manualExpected.getTime());
  });

  it("days offset of 0 (day of event) returns same date", () => {
    const result = calculateSendDate(eventDate, 0);
    expect(result.getTime()).toBe(eventDate.getTime());
  });

  it("positive days offset returns future date", () => {
    const result = calculateSendDate(eventDate, 7);
    const expected = new Date(eventDate);
    expected.setDate(expected.getDate() + 7);
    expect(result.getTime()).toBe(expected.getTime());
  });

  // ---- Hours offset (new behavior) ----

  it("hours offset with null sendTimeOfDay produces correct time relative to event", () => {
    // 3 hours before event: 14:00 - 3 = 11:00
    const result = calculateSendDate(eventDate, 0, -3, null);
    const expected = new Date(eventDate);
    expected.setHours(expected.getHours() - 3);
    expect(result.getTime()).toBe(expected.getTime());
  });

  it("hours offset with undefined sendTimeOfDay produces correct time relative to event", () => {
    // 2 hours after event: 14:00 + 2 = 16:00
    const result = calculateSendDate(eventDate, 0, 2, undefined);
    const expected = new Date(eventDate);
    expected.setHours(expected.getHours() + 2);
    expect(result.getTime()).toBe(expected.getTime());
  });

  it("hours offset with sendTimeOfDay set — sendTimeOfDay should be IGNORED", () => {
    // BUG FIX: When offsetHours is set, sendTimeOfDay must NOT overwrite the hour calculation
    // 3 hours before 14:00 = 11:00, even if sendTimeOfDay says "09:00"
    const result = calculateSendDate(eventDate, 0, -3, "09:00");
    const expected = new Date(eventDate);
    expected.setHours(expected.getHours() - 3);
    expect(result.getTime()).toBe(expected.getTime());
  });

  it("positive hours offset ignores sendTimeOfDay", () => {
    // 6 hours after 14:00 = 20:00, even if sendTimeOfDay says "09:00"
    const result = calculateSendDate(eventDate, 0, 6, "09:00");
    const expected = new Date(eventDate);
    expected.setHours(expected.getHours() + 6);
    expect(result.getTime()).toBe(expected.getTime());
  });

  it("hours offset of -12 correctly shifts time", () => {
    // 12 hours before 14:00 = 02:00
    const result = calculateSendDate(eventDate, 0, -12, null);
    const expected = new Date(eventDate);
    expected.setHours(expected.getHours() - 12);
    expect(result.getTime()).toBe(expected.getTime());
  });

  // ---- Edge cases ----

  it("zero offsetHours with sendTimeOfDay still applies sendTimeOfDay", () => {
    // offsetHours=0 is falsy, so sendTimeOfDay should still be applied
    const result = calculateSendDate(eventDate, 0, 0, "09:00");
    const expected = new Date(eventDate);
    expected.setHours(9, 0, 0, 0);
    expect(result.getTime()).toBe(expected.getTime());
  });

  it("null offsetHours with sendTimeOfDay applies sendTimeOfDay", () => {
    const result = calculateSendDate(eventDate, 1, null, "10:30");
    const expected = new Date(eventDate);
    expected.setDate(expected.getDate() + 1);
    expected.setHours(10, 30, 0, 0);
    expect(result.getTime()).toBe(expected.getTime());
  });
});
