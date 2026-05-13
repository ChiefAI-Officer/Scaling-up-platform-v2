/**
 * ICS Calendar File Generator (JV-18)
 * Generates .ics calendar events from workshop data.
 * No external dependency needed — ICS is a simple text format.
 */

export interface IcsEventData {
  uid: string;
  title: string;
  description?: string | null;
  eventDate: Date;
  eventTime?: string | null; // "09:00", "14:30" etc.
  timezone: string;
  durationHours: number;
  location?: string | null;
  url?: string | null;
  organizer?: { name: string; email: string } | null;
  method?: "PUBLISH" | "REQUEST";
}

/**
 * Parse a workshop duration string into hours.
 * Falls back to 2h (a typical virtual workshop) when the string is absent or
 * unrecognised.  Explicit numeric prefix takes priority over keyword matching.
 */
export function parseDurationHours(duration: string | null | undefined): number {
  if (!duration) return 2;
  const lower = duration.toLowerCase().trim();
  // Numeric prefix: "2 hours", "3 hours", "4.5 hours", etc.
  const hoursMatch = lower.match(/^(\d+(?:\.\d+)?)\s*hours?/);
  if (hoursMatch) return parseFloat(hoursMatch[1]);
  // Legacy seed strings: "8hr", "4hr", "virtual-2hr", "2-hour"
  if (lower.includes("8hr")) return 8;
  if (lower.includes("4hr")) return 4;
  if (lower.includes("2hr") || lower.includes("2-hour")) return 2;
  // Keyword descriptors
  if (lower.includes("full")) return 8;
  if (lower.includes("half")) return 4;
  return 2; // safe default (short workshop)
}

/**
 * Derive the event duration in hours from the workshop's eventTime range
 * ("HH:MM - HH:MM" or "HH:MM – HH:MM") when available.
 * Falls back to parseDurationHours(duration) for legacy/unstructured strings.
 */
export function parseDurationHoursFromEvent(
  duration: string | null | undefined,
  eventTime: string | null | undefined,
): number {
  if (eventTime) {
    // Matches both hyphen (-) and en-dash (–) separators
    const rangeMatch = eventTime.match(
      /^(\d{1,2}):(\d{2})\s*[-–]\s*(\d{1,2}):(\d{2})/
    );
    if (rangeMatch) {
      const startMins =
        parseInt(rangeMatch[1]) * 60 + parseInt(rangeMatch[2]);
      const endMins =
        parseInt(rangeMatch[3]) * 60 + parseInt(rangeMatch[4]);
      if (endMins > startMins) return (endMins - startMins) / 60;
    }
  }
  return parseDurationHours(duration);
}

/**
 * Build a location string from workshop venue data.
 */
export function buildLocationString(workshop: {
  format: string;
  venueName?: string | null;
  venueAddress?: string | null;
  virtualLink?: string | null;
  virtualPlatform?: string | null;
}): string {
  if (workshop.format === "VIRTUAL") {
    return workshop.virtualLink || "Virtual Workshop";
  }

  const parts: string[] = [];
  if (workshop.venueName) parts.push(workshop.venueName);

  if (workshop.venueAddress) {
    try {
      const addr = JSON.parse(workshop.venueAddress) as {
        street?: string;
        city?: string;
        state?: string;
        zip?: string;
      };
      const addrParts = [addr.street, addr.city, addr.state, addr.zip]
        .filter(Boolean)
        .join(", ");
      if (addrParts) parts.push(addrParts);
    } catch {
      // venueAddress is not JSON — use as-is
      parts.push(workshop.venueAddress);
    }
  }

  if (workshop.format === "HYBRID" && workshop.virtualLink) {
    parts.push(`Online: ${workshop.virtualLink}`);
  }

  return parts.join(", ") || "Location TBD";
}

/**
 * Escape special characters per RFC 5545.
 */
function escapeIcsText(text: string): string {
  return text
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\n/g, "\\n");
}

/**
 * Format a Date to ICS datetime format (YYYYMMDDTHHMMSS).
 */
function formatIcsDate(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return (
    `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}T` +
    `${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}`
  );
}

/**
 * Generate a UTC timestamp for DTSTAMP.
 */
function formatIcsUtcNow(): string {
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return (
    `${now.getUTCFullYear()}${pad(now.getUTCMonth() + 1)}${pad(now.getUTCDate())}T` +
    `${pad(now.getUTCHours())}${pad(now.getUTCMinutes())}${pad(now.getUTCSeconds())}Z`
  );
}

/**
 * Generate ICS calendar content for a workshop event.
 */
export function generateIcsContent(event: IcsEventData): string {
  // Build start date from eventDate + eventTime
  const start = new Date(event.eventDate);
  if (event.eventTime) {
    const [hours, minutes] = event.eventTime.split(":").map(Number);
    if (!isNaN(hours)) start.setHours(hours);
    if (!isNaN(minutes)) start.setMinutes(minutes);
  } else {
    start.setHours(9, 0, 0, 0); // Default 9 AM
  }

  // Build end date
  const end = new Date(start.getTime() + event.durationHours * 60 * 60 * 1000);

  const lines: string[] = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Scaling Up//Workshop Platform//EN",
    "CALSCALE:GREGORIAN",
    `METHOD:${event.method ?? "PUBLISH"}`,
    "BEGIN:VEVENT",
    `UID:${event.uid}`,
    `DTSTAMP:${formatIcsUtcNow()}`,
    "SEQUENCE:0",
    `DTSTART;TZID=${event.timezone}:${formatIcsDate(start)}`,
    `DTEND;TZID=${event.timezone}:${formatIcsDate(end)}`,
    `SUMMARY:${escapeIcsText(event.title)}`,
  ];

  if (event.description) {
    lines.push(`DESCRIPTION:${escapeIcsText(event.description)}`);
  }

  if (event.location) {
    lines.push(`LOCATION:${escapeIcsText(event.location)}`);
  }

  if (event.url) {
    lines.push(`URL:${event.url}`);
  }

  if (event.organizer) {
    lines.push(
      `ORGANIZER;CN=${escapeIcsText(event.organizer.name)}:mailto:${event.organizer.email}`
    );
  }

  // Reminder 1 day before
  lines.push(
    "BEGIN:VALARM",
    "TRIGGER:-P1D",
    "ACTION:DISPLAY",
    `DESCRIPTION:Reminder: ${escapeIcsText(event.title)} is tomorrow`,
    "END:VALARM"
  );

  lines.push("END:VEVENT", "END:VCALENDAR");

  return lines.join("\r\n");
}

/**
 * Build a Google Calendar URL for a workshop event.
 */
export function buildGoogleCalendarUrl(event: IcsEventData): string {
  const start = new Date(event.eventDate);
  if (event.eventTime) {
    const [hours, minutes] = event.eventTime.split(":").map(Number);
    if (!isNaN(hours)) start.setHours(hours);
    if (!isNaN(minutes)) start.setMinutes(minutes);
  } else {
    start.setHours(9, 0, 0, 0);
  }

  const end = new Date(start.getTime() + event.durationHours * 60 * 60 * 1000);

  // Google Calendar uses YYYYMMDDTHHMMSS format (no timezone — uses ctz param)
  const fmt = (d: Date) => formatIcsDate(d);

  const params = new URLSearchParams({
    action: "TEMPLATE",
    text: event.title,
    dates: `${fmt(start)}/${fmt(end)}`,
    ctz: event.timezone,
  });

  if (event.description) params.set("details", event.description);
  if (event.location) params.set("location", event.location);

  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}
