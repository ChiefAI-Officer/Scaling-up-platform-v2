/**
 * Shared CSV helpers — single source of truth for CSV escape policy
 * across all CSV exports (Round 15 Wave 1).
 *
 * Policy:
 *   - RFC 4180: every cell wrapped in double quotes, internal quotes doubled
 *   - Line terminator: \r\n between rows, plus a trailing \r\n after the last row
 *   - CSV injection protection: cells starting with =, +, -, @, \t, or \r
 *     are prefixed with a single quote so spreadsheets won't evaluate them
 *   - null / undefined → "" (bare empty string, no surrounding quotes)
 */

// CSV injection protection: cells starting with these get a leading single quote
const CSV_INJECTION_CHARS = /^[=+\-@\t\r]/;

export function escapeCsvCell(value: unknown): string {
  if (value === null || value === undefined) return "";
  const str = String(value);
  const needsEscape = CSV_INJECTION_CHARS.test(str);
  const safe = needsEscape ? `'${str}` : str;
  // RFC 4180: always quote; double internal quotes
  return `"${safe.replace(/"/g, '""')}"`;
}

export function rowsToCsv(
  headers: string[],
  rows: Array<Array<unknown>>
): string {
  const headerLine = headers.map(escapeCsvCell).join(",");
  const bodyLines = rows.map((row) => row.map(escapeCsvCell).join(","));
  return [headerLine, ...bodyLines].join("\r\n") + "\r\n";
}
