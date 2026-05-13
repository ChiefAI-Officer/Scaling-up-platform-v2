/**
 * Unit Tests: Shared CSV helpers
 * Round 15 Wave 1 — locks the single CSV escape policy used by both
 * /api/registrations/export and the upcoming survey-responses CSV export.
 */

import { escapeCsvCell, rowsToCsv } from "@/lib/utils/csv";

describe("escapeCsvCell", () => {
  it("wraps every cell in double quotes and doubles internal quotes", () => {
    expect(escapeCsvCell("hello")).toBe('"hello"');
    expect(escapeCsvCell('she said "hi"')).toBe('"she said ""hi"""');
    expect(escapeCsvCell("plain,comma")).toBe('"plain,comma"');
    expect(escapeCsvCell("line\nbreak")).toBe('"line\nbreak"');
  });

  it("prepends a single quote to cells starting with CSV-injection chars", () => {
    // All 6 chars in the regex: = + - @ \t \r
    expect(escapeCsvCell("=SUM(A1)")).toBe('"\'=SUM(A1)"');
    expect(escapeCsvCell("+1234")).toBe('"\'+1234"');
    expect(escapeCsvCell("-NEG")).toBe('"\'-NEG"');
    expect(escapeCsvCell("@user")).toBe('"\'@user"');
    expect(escapeCsvCell("\tTAB")).toBe('"\'\tTAB"');
    expect(escapeCsvCell("\rCR")).toBe('"\'\rCR"');
  });

  it("returns empty string for null and undefined", () => {
    expect(escapeCsvCell(null)).toBe("");
    expect(escapeCsvCell(undefined)).toBe("");
  });

  it("stringifies Date values via String() (generic, not Date-aware)", () => {
    const d = new Date("2026-05-13T12:34:56.000Z");
    const result = escapeCsvCell(d);
    // The helper is intentionally generic — it does whatever String(date) does.
    // We don't assert the exact format; we just assert the result contains
    // the same string form String(d) produces, surrounded by quotes.
    expect(result).toBe(`"${String(d)}"`);
  });
});

describe("rowsToCsv", () => {
  it("uses RFC 4180 \\r\\n line endings AND adds a trailing \\r\\n", () => {
    const csv = rowsToCsv(
      ["Name", "Email"],
      [
        ["Alice", "alice@example.com"],
        ["Bob", "bob@example.com"],
      ]
    );
    expect(csv).toBe(
      '"Name","Email"\r\n' +
        '"Alice","alice@example.com"\r\n' +
        '"Bob","bob@example.com"\r\n'
    );
    // Explicit trailing newline check
    expect(csv.endsWith("\r\n")).toBe(true);
  });

  it("produces output that reparses correctly with a simple manual reparser", () => {
    const headers = ["First Name", "Notes"];
    const rows: Array<Array<unknown>> = [
      ["Alice", 'has "quotes" inside'],
      ["Bob,Jr", "plain"],
      ["=evil", "injection attempt"],
      [null, undefined],
    ];
    const csv = rowsToCsv(headers, rows);

    // Manual RFC 4180 reparser (handles only what rowsToCsv emits: every
    // cell is wrapped in "..." with "" for escaped quotes).
    function parse(input: string): string[][] {
      // Trim trailing \r\n so split doesn't yield a bogus empty record.
      const trimmed = input.endsWith("\r\n")
        ? input.slice(0, -2)
        : input;
      const out: string[][] = [];
      let row: string[] = [];
      let cell = "";
      let inQuotes = false;
      for (let i = 0; i < trimmed.length; i++) {
        const ch = trimmed[i];
        if (inQuotes) {
          if (ch === '"') {
            if (trimmed[i + 1] === '"') {
              cell += '"';
              i++;
            } else {
              inQuotes = false;
            }
          } else {
            cell += ch;
          }
        } else {
          if (ch === '"') {
            inQuotes = true;
          } else if (ch === ",") {
            row.push(cell);
            cell = "";
          } else if (ch === "\r" && trimmed[i + 1] === "\n") {
            row.push(cell);
            out.push(row);
            row = [];
            cell = "";
            i++;
          } else {
            cell += ch;
          }
        }
      }
      row.push(cell);
      out.push(row);
      return out;
    }

    const parsed = parse(csv);
    expect(parsed[0]).toEqual(["First Name", "Notes"]);
    expect(parsed[1]).toEqual(["Alice", 'has "quotes" inside']);
    expect(parsed[2]).toEqual(["Bob,Jr", "plain"]);
    // Injection-prefix char gets a leading single quote
    expect(parsed[3]).toEqual(["'=evil", "injection attempt"]);
    // null/undefined → empty string (bare "" cell, reparses to "")
    expect(parsed[4]).toEqual(["", ""]);
  });
});
