import { execFileSync, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const scratch = mkdtempSync(join(tmpdir(), "summary-artifact-verifier-"));
const artifactPath = join(scratch, "proof.pdf");
const verifierPath = join(
  process.cwd(),
  "scripts",
  "verify-summary-report-artifacts.mjs",
);

beforeAll(() => {
  const createScript = `
    import React from "react";
    import { writeFileSync } from "node:fs";
    import { Document, Page, Text, renderToBuffer } from "@react-pdf/renderer";

    const document = React.createElement(
      Document,
      { title: "Verifier Contract Proof" },
      React.createElement(
        Page,
        { size: "A4" },
        React.createElement(Text, null, "summary-verifier-proof"),
      ),
    );
    writeFileSync(process.argv[1], await renderToBuffer(document));
  `;
  execFileSync(
    process.execPath,
    ["--input-type=module", "--eval", createScript, artifactPath],
    { cwd: process.cwd() },
  );
});

afterAll(() => {
  rmSync(scratch, { recursive: true, force: true });
});

function checksum(): string {
  return createHash("sha256").update(readFileSync(artifactPath)).digest("hex");
}

function runVerifier(args: string[]) {
  return spawnSync(process.execPath, [verifierPath, ...args], {
    cwd: process.cwd(),
    encoding: "utf8",
  });
}

function validArgs(): string[] {
  return [
    artifactPath,
    "--expect-text",
    "summary-verifier-proof",
    "--min-pages",
    "1",
    "--max-pages",
    "1",
    "--sha256",
    checksum(),
  ];
}

describe("summary report artifact verifier CLI", () => {
  it("accepts a matching PDF signature, text, page range, metadata, and checksum", () => {
    const result = runVerifier(validArgs());

    expect(result.status).toBe(0);
    expect(result.stderr).toBe("");
    expect(JSON.parse(result.stdout)).toEqual({
      ok: true,
      path: artifactPath,
      pages: 1,
      sha256: checksum(),
      title: "Verifier Contract Proof",
      expectedText: "summary-verifier-proof",
    });
  });

  it.each([
    ["checksum mismatch", ["--sha256", "0".repeat(64)], "SHA-256 mismatch"],
    [
      "missing text",
      ["--expect-text", "not-in-pdf"],
      "Expected text not found",
    ],
    [
      "page range",
      ["--min-pages", "2", "--max-pages", "2"],
      "Page count 1 outside 2-2",
    ],
  ])("rejects %s", (_label, replacement, expectedError) => {
    const args = validArgs();
    for (let index = 0; index < replacement.length; index += 2) {
      const flagIndex = args.indexOf(replacement[index]);
      args[flagIndex + 1] = replacement[index + 1];
    }
    const result = runVerifier(args);

    expect(result.status).toBe(1);
    expect(result.stderr).toContain(expectedError);
  });

  it.each([
    ["duplicate option", "Duplicate option: --expect-text"],
    ["unknown option", "Unknown option: --unknown"],
  ])("rejects %s before parsing the artifact", (label, expectedError) => {
    const args =
      label === "duplicate option"
        ? [artifactPath, "--expect-text", "one", "--expect-text", "two"]
        : [...validArgs(), "--unknown", "value"];
    const result = runVerifier(args);

    expect(result.status).toBe(2);
    expect(result.stderr).toContain(expectedError);
    expect(result.stderr).toContain("Usage:");
  });
});
