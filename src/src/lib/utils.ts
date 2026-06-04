import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function getRegistrationDisplayStatus(status: string, paymentStatus: string): string {
  if (paymentStatus === "PENDING" && status !== "CANCELLED") return "Awaiting Payment";
  return status;
}

export function formatCurrency(cents: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(cents / 100);
}

/**
 * BUG-05 (May 4 2026): renamed from `formatDate` to `formatTimestamp` to make the
 * UTC-vs-zoned semantic visible at every call site. Use this for createdAt /
 * respondedAt / scheduledFor — anything where the user's local timezone is correct.
 * For event dates (workshop scheduling), use `formatEventDateUTC` instead.
 */
export function formatTimestamp(date: Date | string): string {
  try {
    const d = new Date(date);
    if (isNaN(d.getTime())) {
      return "Invalid Date";
    }
    return new Intl.DateTimeFormat("en-US", {
      dateStyle: "medium",
    }).format(d);
  } catch {
    return "Invalid Date";
  }
}

/**
 * BUG-05 (May 4 2026): renamed from `formatEventDate`. Use UTC so a workshop
 * scheduled "Oct 1, 2026" reads identically across timezones (no off-by-one).
 */
export function formatEventDateUTC(date: Date | string): string {
  try {
    const d = new Date(date);
    if (isNaN(d.getTime())) return "Invalid Date";
    return new Intl.DateTimeFormat("en-US", {
      dateStyle: "medium",
      timeZone: "UTC",
    }).format(d);
  } catch {
    return "Invalid Date";
  }
}

/** BUG-05 (May 4 2026): renamed from `formatDateTime`. Zoned (local) — for timestamps with time. */
export function formatTimestampDateTime(date: Date | string): string {
  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(date));
}

/**
 * Returns the DST-aware short timezone abbreviation (e.g. "CDT", "CST", "MST", "HST")
 * for an IANA timezone evaluated on a workshop's UTC calendar date.
 *
 * PARSER-INDEPENDENT: it derives the abbreviation from a noon-UTC instant on the
 * event's UTC calendar date. `Workshop.eventDate` is stored as midnight UTC of the
 * event day, so its UTC components ARE the event day; noon UTC maps to 02:00–08:00
 * local across all 9 Americas/Pacific zones (same calendar date, safely past the
 * 2 AM DST transition), so the abbreviation is DST-correct without parsing eventTime.
 *
 * MUST NEVER THROW (it runs in SSR render): returns "" on any error
 * (invalid IANA -> RangeError, invalid date, etc.).
 */
export function formatZoneAbbrev(eventDate: Date | string, timezone: string | null | undefined): string {
  if (!timezone) return "";
  try {
    const d = new Date(eventDate);
    if (isNaN(d.getTime())) return "";
    const noon = new Date(
      Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 12, 0, 0),
    );
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone: timezone,
      timeZoneName: "short",
    }).formatToParts(noon);
    const zonePart = parts.find((p) => p.type === "timeZoneName");
    return zonePart?.value ?? "";
  } catch {
    return "";
  }
}

/**
 * Appends a DST-aware short timezone abbreviation to a workshop's free-form
 * `eventTime` string (e.g. "9:00 AM" -> "9:00 AM CDT"). See `formatZoneAbbrev`
 * for how the abbreviation is derived (parser-independent, never throws).
 *
 * - Empty / "TBD" (case-insensitive) eventTime is returned as-is with NO zone.
 * - null / undefined eventTime is returned as "TBD" with NO zone.
 * - Missing timezone (or a zone that yields no abbreviation) returns the time
 *   unchanged with NO zone.
 */
export function formatTimeWithZone(
  eventTime: string | null | undefined,
  eventDate: Date | string,
  timezone: string | null | undefined,
): string {
  const time = (eventTime ?? "TBD").trim();
  if (time === "" || time.toLowerCase() === "tbd") {
    return time === "" ? "" : eventTime ?? "TBD";
  }
  const abbr = formatZoneAbbrev(eventDate, timezone);
  return abbr ? `${time} ${abbr}` : time;
}

export function generateSlug(title: string, id?: string): string {
  const baseSlug = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");

  return id ? `${baseSlug}-${id.slice(0, 8)}` : baseSlug;
}

// JV-02: Jeff Verdun's 6 workshop stages
export function getWorkshopStatusColor(status: string): string {
  const colors: Record<string, string> = {
    INFO_REQUESTED: "bg-status-requested/10 text-status-requested",
    AWAITING_APPROVAL: "bg-status-awaiting/10 text-status-awaiting",
    PRE_EVENT: "bg-status-active/10 text-status-active",
    POST_EVENT: "bg-status-post/10 text-status-post",
    COMPLETED: "bg-muted text-status-completed",
    DENIED: "bg-destructive/10 text-destructive",
    CANCELED: "bg-status-canceled/10 text-status-canceled",
  };
  return colors[status] || "bg-muted text-muted-foreground";
}

export function getWorkshopStatusLabel(status: string): string {
  const labels: Record<string, string> = {
    REQUESTED: "Approval Pending",
    INFO_REQUESTED: "Info Requested",
    AWAITING_APPROVAL: "Approval Pending",
    PRE_EVENT: "Pre-Event",
    POST_EVENT: "Post-Event",
    COMPLETED: "Completed",
    DENIED: "Denied",
    CANCELED: "Canceled",
  };
  return labels[status] || status;
}

export function getWorkshopStatusExplanation(status: string): string {
  const explanations: Record<string, string> = {
    REQUESTED: "Submitted — awaiting admin review",
    AWAITING_APPROVAL: "Under review by admin team",
    INFO_REQUESTED: "Admin requested changes — respond below",
    PRE_EVENT: "Approved — workshop pages are live",
    POST_EVENT: "Event concluded — collecting feedback",
    COMPLETED: "All follow-up complete",
    DENIED: "Your workshop was denied — submit a new request to run a similar event",
    CANCELED: "Workshop canceled",
  };
  return explanations[status] || "";
}

// Helper to parse JSON fields stored as strings (for SQLite compatibility)
export function parseJsonField<T>(value: string | null | undefined): T | null {
  if (!value) return null;
  try {
    return JSON.parse(value) as T;
  } catch {
    return null;
  }
}

export interface VenueAddress {
  street?: string;
  city?: string;
  state?: string;
  zip?: string;
  country?: string;
}

export function formatVenueAddress(addressJson: string | null | undefined): string {
  const address = parseJsonField<VenueAddress>(addressJson);
  if (!address) return "";

  const parts: string[] = [];
  if (address.street) parts.push(address.street);
  if (address.city) parts.push(address.city);
  if (address.state && address.zip) {
    parts.push(`${address.state} ${address.zip}`);
  } else if (address.state) {
    parts.push(address.state);
  } else if (address.zip) {
    parts.push(address.zip);
  }

  return parts.join(", ");
}
