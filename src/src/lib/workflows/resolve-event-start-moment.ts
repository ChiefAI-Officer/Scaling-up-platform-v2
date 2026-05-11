/**
 * BUG-MAY4-1a: Resolve a Workshop's actual start moment by combining its
 * stored eventDate (midnight UTC, date-only), eventTime (free-form string),
 * and timezone (IANA, e.g. "America/New_York").
 *
 * Why: Workshop.eventDate is stored as 00:00 UTC of the event day, with the
 * actual time-of-day kept separately as a string in eventTime ("16:00 - 18:00")
 * and the IANA zone in timezone. calculateSendDate previously did naive
 * arithmetic against midnight UTC, producing scheduledFor values 20+ hours
 * before the real event. This helper produces the true start moment as a Date
 * (UTC) so downstream code can offset against it correctly.
 */

export interface WorkshopStartMomentInput {
  eventDate: Date;
  eventTime?: string | null;
  timezone?: string | null;
}

export function resolveEventStartMoment(workshop: WorkshopStartMomentInput): Date {
  const startStr = parseStartTime(workshop.eventTime);
  if (!startStr) return new Date(workshop.eventDate);

  const { hour, minute } = startStr;

  const year = workshop.eventDate.getUTCFullYear();
  const month = workshop.eventDate.getUTCMonth() + 1; // 1-12
  const day = workshop.eventDate.getUTCDate();

  const tz = workshop.timezone || "UTC";

  return zonedWallClockToUtc(year, month, day, hour, minute, tz);
}

function parseStartTime(raw: string | null | undefined): { hour: number; minute: number } | null {
  if (!raw) return null;

  // "16:00 - 18:00" → "16:00"; "16:00" → "16:00"
  const startSegment = raw.split(/[-–—]/)[0]?.trim();
  if (!startSegment) return null;

  const match = startSegment.match(/^(\d{1,2}):(\d{2})$/);
  if (!match) return null;

  const hour = parseInt(match[1], 10);
  const minute = parseInt(match[2], 10);
  if (Number.isNaN(hour) || Number.isNaN(minute)) return null;
  if (hour < 0 || hour > 23 || minute < 0 || minute > 59) return null;

  return { hour, minute };
}

/**
 * BUG-MAY6-3: Given an existing UTC Date and a target wall-clock time
 * (hours/minutes) in an IANA timezone, return a new UTC Date whose local
 * time IN THAT TIMEZONE is the requested hour/minute on the same calendar
 * date the original Date represents in the timezone.
 *
 * Used by calculateSendDate to honor sendTimeOfDay (e.g., "09:00") relative
 * to the workshop's timezone instead of the server's local time.
 */
export function setWallClockInTimezone(
  date: Date,
  timezone: string,
  hour: number,
  minute: number,
): Date {
  // Extract the calendar Y-M-D in the target timezone (the date may differ
  // from the UTC date when the wall-clock time-of-day has been adjusted).
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const parts = Object.fromEntries(
    fmt.formatToParts(date).map((p) => [p.type, p.value])
  );
  const year = parseInt(parts.year, 10);
  const month = parseInt(parts.month, 10);
  const day = parseInt(parts.day, 10);

  return zonedWallClockToUtc(year, month, day, hour, minute, timezone);
}

/**
 * Given a wall-clock moment (year/month/day/hour/minute) in a specific IANA
 * timezone, return the corresponding UTC Date. Handles DST transitions via
 * Intl.DateTimeFormat (the platform's tzdata).
 */
function zonedWallClockToUtc(
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
  timezone: string
): Date {
  // First guess: treat the wall-clock as UTC.
  const guessUtc = Date.UTC(year, month - 1, day, hour, minute);

  // Ask Intl what wall-clock that UTC moment shows in the target timezone.
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
  const parts = Object.fromEntries(
    fmt.formatToParts(new Date(guessUtc)).map((p) => [p.type, p.value])
  );

  const tzYear = parseInt(parts.year, 10);
  const tzMonth = parseInt(parts.month, 10);
  const tzDay = parseInt(parts.day, 10);
  // Intl sometimes emits "24" for midnight; normalize.
  const tzHour = parseInt(parts.hour, 10) % 24;
  const tzMinute = parseInt(parts.minute, 10);

  const tzAsUtc = Date.UTC(tzYear, tzMonth - 1, tzDay, tzHour, tzMinute);

  // The difference is the timezone's offset for that moment.
  // Adjusting the guess by the offset lands at the true UTC for the wall-clock.
  const offset = guessUtc - tzAsUtc;
  return new Date(guessUtc + offset);
}
