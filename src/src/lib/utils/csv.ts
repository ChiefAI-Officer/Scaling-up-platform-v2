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

/**
 * Cell input types accepted by the CSV emitter.
 *
 * Round 15 Wave 5 narrowed the input type from `unknown` to this union — every
 * call site in the repo passes one of these primitives (or a Date that's been
 * pre-stringified). Date is NOT pre-formatted by this helper: stringify with
 * `.toISOString()` (or your preferred format) BEFORE passing, otherwise you
 * get the locale-dependent output of `String(date)`.
 */
export type CsvCellInput =
  | string
  | number
  | boolean
  | bigint
  | Date
  | null
  | undefined;

export function escapeCsvCell(value: CsvCellInput): string {
  if (value === null || value === undefined) return "";
  const str = String(value);
  const needsEscape = CSV_INJECTION_CHARS.test(str);
  const safe = needsEscape ? `'${str}` : str;
  // RFC 4180: always quote; double internal quotes
  return `"${safe.replace(/"/g, '""')}"`;
}

export function rowsToCsv(
  headers: string[],
  rows: Array<Array<CsvCellInput>>
): string {
  const headerLine = headers.map(escapeCsvCell).join(",");
  const bodyLines = rows.map((row) => row.map(escapeCsvCell).join(","));
  return [headerLine, ...bodyLines].join("\r\n") + "\r\n";
}
