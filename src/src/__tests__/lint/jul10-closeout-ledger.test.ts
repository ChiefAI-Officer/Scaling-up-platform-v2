import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";

const LEDGER_PATH = resolve(
  process.cwd(),
  "../docs/agents/jul10-feedback-closeout.md",
);

const EXPECTED_ROWS = [
  30, 32, 33, 35, 37, 39, 40, 41, 42, 43, 44, 45, 46, 47, 48, 49,
  50, 51, 52, 53, 54, 55, 56, 57, 58, 59, 60, 61, 62, 63, 64, 65,
  66, 67, 68, 69, 70, 71, 72, 73, 74, 75, 76, 77, 78, 79, 80, 81,
  83, 84, 85, 86, 87,
] as const;

type LedgerStatus = "DONE" | "PARTIAL" | "NEEDS DECISION";

interface LedgerRow {
  number: number;
  status: LedgerStatus;
  evidence: string;
  resumeGate: string;
}

function parseLedger(markdown: string): LedgerRow[] {
  const start = markdown.indexOf("<!-- JUL10_LEDGER_START -->");
  const end = markdown.indexOf("<!-- JUL10_LEDGER_END -->");
  expect(start).toBeGreaterThanOrEqual(0);
  expect(end).toBeGreaterThan(start);

  return markdown
    .slice(start, end)
    .split("\n")
    .flatMap((line) => {
      const match = line.match(
        /^\| #(\d+) \| [^|]+ \| [^|]+ \| (DONE|PARTIAL|NEEDS DECISION) \| ([^|]+) \| [^|]+ \| ([^|]+) \| [^|]+ \|$/,
      );
      if (!match) return [];
      return [
        {
          number: Number(match[1]),
          status: match[2] as LedgerStatus,
          evidence: match[3].trim(),
          resumeGate: match[4].trim(),
        },
      ];
    });
}

describe("July 10 feedback closeout ledger", () => {
  const markdown = readFileSync(LEDGER_PATH, "utf8");
  const rows = parseLedger(markdown);

  it("tracks all 53 canonical rows exactly once, including page-boundary row #57", () => {
    expect(rows.map((row) => row.number)).toEqual(EXPECTED_ROWS);
    expect(new Set(rows.map((row) => row.number)).size).toBe(53);
    expect(rows.some((row) => row.number === 57)).toBe(true);
  });

  it("records the evidence-backed 43 done / 4 partial / 6 decision state", () => {
    const tally = rows.reduce<Record<LedgerStatus, number>>(
      (counts, row) => {
        counts[row.status] += 1;
        return counts;
      },
      { DONE: 0, PARTIAL: 0, "NEEDS DECISION": 0 },
    );

    expect(tally).toEqual({ DONE: 43, PARTIAL: 4, "NEEDS DECISION": 6 });
  });

  it("links evidence for every completed row", () => {
    for (const row of rows.filter((candidate) => candidate.status === "DONE")) {
      expect(row.evidence).toMatch(/^\[[^\]]+\]\([^\)]+\)$/);
    }
  });

  it("names an exact resume gate for every unresolved row", () => {
    for (const row of rows.filter((candidate) => candidate.status !== "DONE")) {
      expect(row.resumeGate).not.toBe("None");
      expect(row.resumeGate.length).toBeGreaterThan(20);
    }
  });

  it("declares the tracked ledger authoritative over scratch overlays", () => {
    expect(markdown).toContain(
      "This tracked ledger is authoritative; generated PDFs and `tmp/` files are derivatives.",
    );
  });
  it("drives the artifact generator from the tracked ledger", () => {
    const result = spawnSync(
      "python3",
      ["scripts/build-jul10-closeout-artifacts.py", "--check"],
      {
        cwd: process.cwd(),
        encoding: "utf8",
      },
    );

    expect(result.status).toBe(0);
    expect(result.stdout).toContain(
      "53 rows: 43 DONE / 4 PARTIAL / 6 NEEDS DECISION",
    );
  });
});
