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

/**
 * Parse a CSV text body into an array of string-row arrays. Handles:
 *   - double-quoted fields (with embedded "" → ")
 *   - embedded commas inside quoted fields
 *   - embedded newlines inside quoted fields
 *   - CRLF and LF line terminators
 *
 * Note: leading-single-quote injection prefixes (added by `escapeCsvCell`
 * on write) are NOT stripped here — round-trip is intentionally lossless.
 * Strip them at the call site if you need to.
 */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let current: string[] = [];
  let field = "";
  let inQuotes = false;
  let i = 0;
  while (i < text.length) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i += 2;
          continue;
        }
        inQuotes = false;
        i += 1;
        continue;
      }
      field += ch;
      i += 1;
      continue;
    }
    if (ch === '"') {
      inQuotes = true;
      i += 1;
      continue;
    }
    if (ch === ",") {
      current.push(field);
      field = "";
      i += 1;
      continue;
    }
    if (ch === "\r") {
      // swallow CR; LF (or end) will close the row
      i += 1;
      continue;
    }
    if (ch === "\n") {
      current.push(field);
      rows.push(current);
      current = [];
      field = "";
      i += 1;
      continue;
    }
    field += ch;
    i += 1;
  }
  // Flush final row only if it has content (avoid emitting a phantom empty
  // row when the file ends with a trailing newline).
  if (field.length > 0 || current.length > 0) {
    current.push(field);
    rows.push(current);
  }
  return rows;
}
