import { TZDate, tzOffset } from "@date-fns/tz";

export const DEFAULT_TIMEZONE = "America/New_York";

export const COMMON_ZONES = [
  "America/New_York",
  "America/Chicago",
  "America/Denver",
  "America/Los_Angeles",
  "America/Anchorage",
  "America/Phoenix",
  "Pacific/Honolulu",
  "America/Toronto",
  "America/Vancouver",
  "Europe/London",
  "Australia/Sydney",
  "Asia/Singapore",
  "Asia/Dubai",
  "Asia/Kolkata",
] as const;

const ZONE_SEARCH_ALIASES: Partial<Record<(typeof COMMON_ZONES)[number], string>> = {
  "America/New_York": "united states usa us",
  "America/Chicago": "united states usa us",
  "America/Denver": "united states usa us",
  "America/Los_Angeles": "united states usa us",
  "America/Anchorage": "united states usa us",
  "America/Phoenix": "united states usa us",
  "Pacific/Honolulu": "united states usa us",
  "America/Toronto": "canada ca",
  "America/Vancouver": "canada ca",
  "Europe/London": "united kingdom uk great britain",
  "Australia/Sydney": "australia au",
  "Asia/Singapore": "singapore sg",
  "Asia/Dubai": "united arab emirates uae ae",
  "Asia/Kolkata": "india in",
};

let cachedCountryNamesByZone: Map<string, string[]> | null = null;

/** Derive zone → country names from Intl/CLDR in small main-thread chunks. */
export function loadCountryNamesByZone(
  onProgress: (names: Map<string, string[]>) => void,
): () => void {
  if (cachedCountryNamesByZone) {
    onProgress(cachedCountryNamesByZone);
    return () => undefined;
  }
  const result = new Map<string, string[]>();
  const displayNames = new Intl.DisplayNames(["en"], { type: "region" });
  let first = 65;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let cancelled = false;
  const loadNextLetter = () => {
    if (cancelled) return;
    try {
      for (let second = 65; second <= 90; second += 1) {
        const code = String.fromCharCode(first, second);
        const locale = new Intl.Locale(`und-${code}`) as Intl.Locale & {
          timeZones?: readonly string[];
        };
        const zones = locale.timeZones ?? [];
        const countryName = displayNames.of(code);
        if (zones.length === 0 || !countryName || countryName === code || countryName === "Unknown Region") {
          continue;
        }
        for (const zone of zones) {
          result.set(zone, [...(result.get(zone) ?? []), countryName, code]);
        }
      }
      first += 1;
      if (first <= 90) {
        timer = setTimeout(loadNextLetter, 0);
      } else {
        cachedCountryNamesByZone = result;
        onProgress(new Map(result));
      }
    } catch {
      // Older runtimes retain city, region, IANA, offset, and pinned aliases.
    }
  };
  timer = setTimeout(loadNextLetter, 0);
  return () => {
    cancelled = true;
    if (timer) clearTimeout(timer);
  };
}

/** Flag-off compatibility catalogs. Keep all legacy zone literals centralized. */
export const LEGACY_NEW_WORKSHOP_ZONE_OPTIONS = [
  ["America/New_York", "Eastern Time (ET)"],
  ["America/Chicago", "Central Time (CT)"],
  ["America/Denver", "Mountain Time (MT)"],
  ["America/Los_Angeles", "Pacific Time (PT)"],
  ["America/Phoenix", "Arizona (no DST)"],
  ["Pacific/Honolulu", "Hawaii (HT)"],
] as const;

export const LEGACY_INLINE_WORKSHOP_ZONES = [
  "America/New_York", "America/Chicago", "America/Denver", "America/Los_Angeles",
  "America/Phoenix", "America/Anchorage", "Pacific/Honolulu", "America/Toronto",
  "America/Vancouver",
] as const;

export const LEGACY_RESUBMIT_ZONE_OPTIONS = [
  ["America/New_York", "Eastern (ET)"], ["America/Chicago", "Central (CT)"],
  ["America/Denver", "Mountain (MT)"], ["America/Los_Angeles", "Pacific (PT)"],
  ["America/Anchorage", "Alaska (AKT)"], ["Pacific/Honolulu", "Hawaii (HT)"],
  ["Europe/London", "London (GMT/BST)"], ["Europe/Paris", "Central Europe (CET)"],
  ["Australia/Sydney", "Sydney (AEDT)"],
] as const;

export interface TimeZoneOption {
  value: string;
  city: string;
  region: string;
  searchText: string;
}

export type TimeFormatStyle = "dateTime" | "shortDateTime" | "date";

const LOCAL_DATE_TIME_RE =
  /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?$/;

function assertValidZone(timeZone: string): void {
  try {
    new Intl.DateTimeFormat("en", { timeZone }).format(0);
  } catch {
    throw new RangeError(`Unsupported time zone: ${timeZone}`);
  }
}

export function isValidZone(timeZone: string): boolean {
  try {
    assertValidZone(timeZone);
    return true;
  } catch {
    return false;
  }
}

function localParts(localString: string): [number, number, number, number, number, number] {
  const match = LOCAL_DATE_TIME_RE.exec(localString);
  if (!match) {
    throw new RangeError(
      "Local date-time must use YYYY-MM-DDTHH:mm or YYYY-MM-DDTHH:mm:ss.",
    );
  }
  const [, year, month, day, hour, minute, second = "0"] = match;
  return [
    Number(year),
    Number(month) - 1,
    Number(day),
    Number(hour),
    Number(minute),
    Number(second),
  ];
}

function pad(value: number): string {
  return String(value).padStart(2, "0");
}

export function detectZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || DEFAULT_TIMEZONE;
  } catch {
    return DEFAULT_TIMEZONE;
  }
}

export function allZones(): TimeZoneOption[] {
  const supportedValuesOf = (
    Intl as typeof Intl & { supportedValuesOf?: (key: "timeZone") => string[] }
  ).supportedValuesOf;
  const zones = supportedValuesOf
    ? supportedValuesOf("timeZone")
    : [...COMMON_ZONES];

  return zones.map((value) => {
    const [region, ...locationParts] = value.split("/");
    const city = (locationParts.at(-1) ?? value).replaceAll("_", " ");
    const location = locationParts.join(" ").replaceAll("_", " ");
    return {
      value,
      city,
      region: region.replaceAll("_", " "),
      searchText: `${city} ${location} ${region} ${value} ${ZONE_SEARCH_ALIASES[value as (typeof COMMON_ZONES)[number]] ?? ""}`.toLowerCase(),
    };
  });
}

export function toInstant(
  localString: string,
  timeZone: string,
  options: { normalizeNonexistent?: boolean } = {},
): Date {
  assertValidZone(timeZone);
  const [year, month, day, hour, minute, second] = localParts(localString);
  const zoned = new TZDate(
    year,
    month,
    day,
    hour,
    minute,
    second,
    timeZone,
  );
  if (Number.isNaN(zoned.getTime())) {
    throw new RangeError("Invalid local date-time.");
  }
  const instant = new Date(zoned.getTime());
  // TZDate normalizes a spring-forward gap (02:30 → 03:30). Scheduling must
  // never silently change operator input, so require an exact round trip.
  // For duplicated fall-back times TZDate deterministically chooses the
  // earlier offset; the resolved preview exposes the chosen abbreviation.
  if (!options.normalizeNonexistent && fromInstant(instant, timeZone) !== localString.slice(0, 16)) {
    throw new RangeError("That local time does not exist in the selected time zone.");
  }
  return instant;
}

export function fromInstant(date: Date | string, timeZone: string): string {
  assertValidZone(timeZone);
  const instant = typeof date === "string" ? new Date(date) : date;
  if (Number.isNaN(instant.getTime())) {
    throw new RangeError("Invalid instant.");
  }
  const zoned = new TZDate(instant.getTime(), timeZone);
  return `${zoned.getFullYear()}-${pad(zoned.getMonth() + 1)}-${pad(
    zoned.getDate(),
  )}T${pad(zoned.getHours())}:${pad(zoned.getMinutes())}`;
}

function offsetLabel(timeZone: string, at: Date): string {
  const minutes = tzOffset(timeZone, at);
  const sign = minutes >= 0 ? "+" : "−";
  const absolute = Math.abs(minutes);
  const hours = Math.floor(absolute / 60);
  const remainder = absolute % 60;
  return `UTC${sign}${hours}${remainder ? `:${pad(remainder)}` : ""}`;
}

function cityLabel(timeZone: string): string {
  return (timeZone.split("/").at(-1) ?? timeZone).replaceAll("_", " ");
}

function abbreviationLocale(timeZone: string): string {
  if (timeZone.startsWith("Australia/")) return "en-AU";
  if (timeZone.startsWith("Europe/")) return "en-GB";
  if (timeZone === "Asia/Kolkata") return "en-IN";
  return "en-US";
}

function zoneAbbreviation(timeZone: string, at: Date): string {
  const parts = new Intl.DateTimeFormat(abbreviationLocale(timeZone), {
    timeZone,
    timeZoneName: "short",
  }).formatToParts(at);
  return parts.find((part) => part.type === "timeZoneName")?.value ?? timeZone;
}

export function zoneLabel(timeZone: string, at: Date = new Date()): string {
  assertValidZone(timeZone);
  return `${cityLabel(timeZone)} · ${offsetLabel(timeZone, at)} ${zoneAbbreviation(
    timeZone,
    at,
  )}`;
}

export function formatInZone(
  date: Date | string,
  timeZone: string,
  style: TimeFormatStyle = "dateTime",
): string {
  assertValidZone(timeZone);
  const instant = typeof date === "string" ? new Date(date) : date;
  if (Number.isNaN(instant.getTime())) {
    throw new RangeError("Invalid instant.");
  }

  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone,
    weekday: style === "dateTime" ? "long" : "short",
    day: "numeric",
    month: style === "date" ? "long" : style === "dateTime" ? "long" : "short",
    year: "numeric",
    ...(style === "date"
      ? {}
      : { hour: "numeric", minute: "2-digit", hour12: true }),
  }).formatToParts(instant);
  const get = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value ?? "";
  const datePart = `${get("weekday")} ${get("day")} ${get("month")} ${get("year")}`;
  if (style === "date") return `${datePart} ${zoneAbbreviation(timeZone, instant)}`;
  const dayPeriod = get("dayPeriod").toUpperCase();
  return `${datePart}, ${get("hour")}:${get("minute")} ${dayPeriod} ${zoneAbbreviation(
    timeZone,
    instant,
  )}`;
}
