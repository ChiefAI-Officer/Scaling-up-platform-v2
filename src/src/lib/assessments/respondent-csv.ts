/**
 * Assessment v7.6 — Task M.
 *
 * Parse a CSV file of respondents into typed rows for bulk-import:
 *   - Required headers: `name,email[,team]` (case-insensitive)
 *   - `team` column is parsed as a `/`-delimited path
 *     (e.g. "Marketing/Growth/Brand")
 *   - Dedupe on lowercased email within the file — keep FIRST occurrence
 *   - Cap at 500 rows; rows past the cap return as errors only
 *
 * Pure function, no I/O — safe to call client-side for live preview.
 */

import { z } from "zod";
import { parseCsv } from "@/lib/utils/csv";

export type ParsedRow = {
  name: string;
  email: string;
  teamPath: string[];
};

export type ParseError = {
  row: number; // 1-indexed against the source file (1 = header)
  reason: string;
};

export type ParseResult = {
  rows: ParsedRow[];
  errors: ParseError[];
};

export const MAX_ROWS = 500;

const emailSchema = z.string().trim().email();

const HEADER_REQUIRED = ["name", "email"] as const;
const HEADER_OPTIONAL_TEAM = "team";

function stripInjectionPrefix(s: string): string {
  // `escapeCsvCell` may prepend a single quote to defend against spreadsheet
  // formula injection; strip it on read so round-trips are clean.
  if (s.startsWith("'")) return s.slice(1);
  return s;
}

function normalizeHeader(s: string): string {
  return stripInjectionPrefix(s).trim().toLowerCase();
}

function parseTeamPath(raw: string): { ok: true; path: string[] } | { ok: false; reason: string } {
  const trimmed = raw.trim();
  if (trimmed.length === 0) return { ok: true, path: [] };
  // Trim leading/trailing slashes — they're treated as no-ops.
  const cleaned = trimmed.replace(/^\/+|\/+$/g, "");
  if (cleaned.length === 0) return { ok: true, path: [] };
  const segments = cleaned.split("/").map((s) => s.trim());
  // Reject empty segments BETWEEN non-empty ones ("A//B").
  for (let i = 0; i < segments.length; i++) {
    if (segments[i].length === 0) {
      return {
        ok: false,
        reason: `team path has an empty segment at position ${i + 1}`,
      };
    }
  }
  return { ok: true, path: segments };
}

export function parseRespondentCsv(csvText: string): ParseResult {
  const errors: ParseError[] = [];
  const rows: ParsedRow[] = [];

  if (typeof csvText !== "string" || csvText.trim().length === 0) {
    return {
      rows,
      errors: [{ row: 1, reason: "CSV is empty" }],
    };
  }

  const raw = parseCsv(csvText);
  if (raw.length === 0) {
    return {
      rows,
      errors: [{ row: 1, reason: "CSV is empty" }],
    };
  }

  // Header validation.
  const header = raw[0].map(normalizeHeader);
  const nameIdx = header.indexOf(HEADER_REQUIRED[0]);
  const emailIdx = header.indexOf(HEADER_REQUIRED[1]);
  const teamIdx = header.indexOf(HEADER_OPTIONAL_TEAM);

  if (nameIdx === -1 || emailIdx === -1) {
    return {
      rows,
      errors: [
        {
          row: 1,
          reason:
            'CSV must have a header row with columns "name", "email" (and optional "team")',
        },
      ],
    };
  }

  const seenEmails = new Set<string>();

  // Body rows start at index 1.
  // Cap at MAX_ROWS data rows.
  const bodyEnd = Math.min(raw.length, MAX_ROWS + 1);
  for (let i = 1; i < bodyEnd; i++) {
    const sourceRowNumber = i + 1; // 1-indexed for humans
    const cells = raw[i];

    // Allow a fully-empty trailing row to be ignored silently.
    const allEmpty = cells.every((c) => c.trim() === "");
    if (allEmpty) continue;

    const rawName = stripInjectionPrefix(cells[nameIdx] ?? "").trim();
    const rawEmail = stripInjectionPrefix(cells[emailIdx] ?? "").trim();

    if (rawName.length === 0) {
      errors.push({
        row: sourceRowNumber,
        reason: "name is required",
      });
      continue;
    }

    const emailValidation = emailSchema.safeParse(rawEmail);
    if (!emailValidation.success) {
      errors.push({
        row: sourceRowNumber,
        reason: "email is not a valid email address",
      });
      continue;
    }
    const email = emailValidation.data.toLowerCase();

    if (seenEmails.has(email)) {
      errors.push({
        row: sourceRowNumber,
        reason: `duplicate email "${email}" — earlier row in the file wins`,
      });
      continue;
    }

    let teamPath: string[] = [];
    if (teamIdx !== -1) {
      const rawTeam = stripInjectionPrefix(cells[teamIdx] ?? "");
      const teamResult = parseTeamPath(rawTeam);
      if (!teamResult.ok) {
        errors.push({ row: sourceRowNumber, reason: teamResult.reason });
        continue;
      }
      teamPath = teamResult.path;
    }

    seenEmails.add(email);
    rows.push({ name: rawName, email, teamPath });
  }

  // Truncation errors for rows past the cap.
  if (raw.length > MAX_ROWS + 1) {
    for (let i = MAX_ROWS + 1; i < raw.length; i++) {
      errors.push({
        row: i + 1,
        reason: `file exceeds ${MAX_ROWS}-row limit (truncated at ${MAX_ROWS})`,
      });
    }
  }

  return { rows, errors };
}

/**
 * Split a "name" field into firstName + lastName for the OrgRespondent
 * model (which stores split names). First whitespace token → firstName;
 * the remainder → lastName (or "—" if there's only one token, since
 * lastName is non-nullable in the schema).
 */
export function splitName(name: string): { firstName: string; lastName: string } {
  const trimmed = name.trim();
  const idx = trimmed.indexOf(" ");
  if (idx === -1) {
    return { firstName: trimmed, lastName: "—" };
  }
  return {
    firstName: trimmed.slice(0, idx),
    lastName: trimmed.slice(idx + 1).trim() || "—",
  };
}
