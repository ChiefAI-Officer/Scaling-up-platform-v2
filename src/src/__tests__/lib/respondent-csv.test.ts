/**
 * Assessment v7.6 — Task M parser unit tests.
 */

import {
  parseRespondentCsv,
  splitName,
  MAX_ROWS,
} from "@/lib/assessments/respondent-csv";

describe("parseRespondentCsv — happy path", () => {
  it("parses minimal name,email header", () => {
    const csv = `name,email
Alice Example,alice@example.com
Bob Tester,bob@example.com`;
    const res = parseRespondentCsv(csv);
    expect(res.errors).toEqual([]);
    expect(res.rows).toEqual([
      { name: "Alice Example", email: "alice@example.com", teamPath: [] },
      { name: "Bob Tester", email: "bob@example.com", teamPath: [] },
    ]);
  });

  it("is case-insensitive on header tokens", () => {
    const csv = `Name,EMAIL,Team
Alice,alice@example.com,Marketing/Brand`;
    const res = parseRespondentCsv(csv);
    expect(res.errors).toEqual([]);
    expect(res.rows[0]).toEqual({
      name: "Alice",
      email: "alice@example.com",
      teamPath: ["Marketing", "Brand"],
    });
  });

  it("lowercases the email and trims surrounding whitespace", () => {
    const csv = `name,email
Alice,  Alice@Example.COM  `;
    const res = parseRespondentCsv(csv);
    expect(res.rows[0].email).toBe("alice@example.com");
  });

  it("treats team as optional and returns [] when missing or empty", () => {
    const csv = `name,email,team
Alice,alice@example.com,
Bob,bob@example.com,Marketing`;
    const res = parseRespondentCsv(csv);
    expect(res.rows[0].teamPath).toEqual([]);
    expect(res.rows[1].teamPath).toEqual(["Marketing"]);
  });

  it("strips leading and trailing slashes on team paths", () => {
    const csv = `name,email,team
Alice,alice@example.com,/Marketing/Growth/
Bob,bob@example.com,Marketing/Growth`;
    const res = parseRespondentCsv(csv);
    expect(res.rows[0].teamPath).toEqual(["Marketing", "Growth"]);
    expect(res.rows[1].teamPath).toEqual(["Marketing", "Growth"]);
  });

  it("trims each segment in a team path", () => {
    const csv = `name,email,team
Alice,alice@example.com, Marketing / Growth / Brand `;
    const res = parseRespondentCsv(csv);
    expect(res.rows[0].teamPath).toEqual(["Marketing", "Growth", "Brand"]);
  });
});

describe("parseRespondentCsv — header errors", () => {
  it("rejects when both required headers are missing", () => {
    const csv = `foo,bar
Alice,alice@example.com`;
    const res = parseRespondentCsv(csv);
    expect(res.rows).toEqual([]);
    expect(res.errors).toHaveLength(1);
    expect(res.errors[0].row).toBe(1);
    expect(res.errors[0].reason).toMatch(/header/i);
  });

  it("rejects when only one of the two required headers is present", () => {
    const csv = `name,foo
Alice,alice@example.com`;
    const res = parseRespondentCsv(csv);
    expect(res.rows).toEqual([]);
    expect(res.errors).toHaveLength(1);
  });

  it("returns an error for empty input", () => {
    const res = parseRespondentCsv("");
    expect(res.rows).toEqual([]);
    expect(res.errors).toHaveLength(1);
    expect(res.errors[0].reason).toMatch(/empty/i);
  });
});

describe("parseRespondentCsv — row errors", () => {
  it("rejects rows with invalid emails", () => {
    const csv = `name,email
Alice,not-an-email`;
    const res = parseRespondentCsv(csv);
    expect(res.rows).toEqual([]);
    expect(res.errors).toEqual([
      { row: 2, reason: "email is not a valid email address" },
    ]);
  });

  it("rejects rows with empty name", () => {
    const csv = `name,email
,alice@example.com`;
    const res = parseRespondentCsv(csv);
    expect(res.rows).toEqual([]);
    expect(res.errors).toEqual([{ row: 2, reason: "name is required" }]);
  });

  it("rejects team paths with empty segments between non-empty ones", () => {
    const csv = `name,email,team
Alice,alice@example.com,Marketing//Brand`;
    const res = parseRespondentCsv(csv);
    expect(res.rows).toEqual([]);
    expect(res.errors).toHaveLength(1);
    expect(res.errors[0].reason).toMatch(/empty segment/);
  });

  it("silently ignores fully-empty trailing rows (common from CSV writers)", () => {
    const csv = `name,email
Alice,alice@example.com
,,
`;
    const res = parseRespondentCsv(csv);
    expect(res.errors).toEqual([]);
    expect(res.rows).toHaveLength(1);
  });
});

describe("parseRespondentCsv — quoting", () => {
  it("handles embedded commas in quoted fields", () => {
    const csv = `name,email
"Smith, Alice",alice@example.com`;
    const res = parseRespondentCsv(csv);
    expect(res.errors).toEqual([]);
    expect(res.rows[0].name).toBe("Smith, Alice");
  });

  it("handles doubled-quote escaping inside quoted fields", () => {
    const csv = `name,email
"She said ""hi""",alice@example.com`;
    const res = parseRespondentCsv(csv);
    expect(res.errors).toEqual([]);
    expect(res.rows[0].name).toBe('She said "hi"');
  });

  it("handles embedded newlines inside quoted fields", () => {
    const csv = `name,email\n"Multi\nLine",alice@example.com`;
    const res = parseRespondentCsv(csv);
    expect(res.errors).toEqual([]);
    expect(res.rows[0].name).toBe("Multi\nLine");
  });
});

describe("parseRespondentCsv — dedupe within file", () => {
  it("keeps the FIRST occurrence and reports the second as a duplicate", () => {
    const csv = `name,email
Alice,alice@example.com
Alice Two,ALICE@example.com`;
    const res = parseRespondentCsv(csv);
    expect(res.rows).toEqual([
      { name: "Alice", email: "alice@example.com", teamPath: [] },
    ]);
    expect(res.errors).toHaveLength(1);
    expect(res.errors[0].row).toBe(3);
    expect(res.errors[0].reason).toMatch(/duplicate/i);
  });
});

describe("parseRespondentCsv — row cap", () => {
  it(`truncates at ${MAX_ROWS} rows and emits one error per truncated row`, () => {
    const lines: string[] = ["name,email"];
    for (let i = 1; i <= MAX_ROWS + 1; i++) {
      lines.push(`Row ${i},row${i}@example.com`);
    }
    const csv = lines.join("\n");
    const res = parseRespondentCsv(csv);
    expect(res.rows).toHaveLength(MAX_ROWS);
    expect(res.errors).toHaveLength(1);
    expect(res.errors[0].row).toBe(MAX_ROWS + 2); // header(1) + MAX_ROWS data rows + 1 = MAX+2
    expect(res.errors[0].reason).toMatch(/exceeds 500-row limit/);
  });
});

describe("parseRespondentCsv — injection-prefix tolerance", () => {
  it("strips leading single-quote added by escapeCsvCell on round-trip", () => {
    const csv = `name,email\n"'Alice","'alice@example.com"`;
    const res = parseRespondentCsv(csv);
    expect(res.errors).toEqual([]);
    expect(res.rows[0]).toEqual({
      name: "Alice",
      email: "alice@example.com",
      teamPath: [],
    });
  });
});

describe("splitName", () => {
  it("splits on the first space", () => {
    expect(splitName("Alice Example")).toEqual({
      firstName: "Alice",
      lastName: "Example",
    });
    expect(splitName("Mary Jane Watson")).toEqual({
      firstName: "Mary",
      lastName: "Jane Watson",
    });
  });

  it("returns em-dash for single-token names (schema requires non-empty lastName)", () => {
    expect(splitName("Cher")).toEqual({ firstName: "Cher", lastName: "—" });
  });

  it("trims and collapses trailing whitespace", () => {
    expect(splitName("  Alice  Example  ")).toEqual({
      firstName: "Alice",
      lastName: "Example",
    });
  });
});
