#!/usr/bin/env node

import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";

import { PDFParse } from "pdf-parse";

function usage(message) {
  if (message) process.stderr.write(`${message}\n\n`);
  process.stderr.write(
    "Usage: node scripts/verify-summary-report-artifacts.mjs <pdf> " +
      "--expect-text <txt> --min-pages <n> --max-pages <n> --sha256 <hex>\n",
  );
  process.exitCode = 2;
}

function parseInteger(value, flag) {
  const number = Number(value);
  if (!Number.isInteger(number) || number < 1) {
    throw new Error(`${flag} must be a positive integer`);
  }
  return number;
}

function parseArgs(argv) {
  const [pdfPath, ...rest] = argv;
  if (!pdfPath || pdfPath.startsWith("--")) {
    throw new Error("A PDF path is required");
  }

  const values = new Map();
  for (let index = 0; index < rest.length; index += 2) {
    const flag = rest[index];
    const value = rest[index + 1];
    if (!flag?.startsWith("--") || value == null || value.startsWith("--")) {
      throw new Error(`Missing value for ${flag ?? "argument"}`);
    }
    if (values.has(flag)) throw new Error(`Duplicate option: ${flag}`);
    values.set(flag, value);
  }

  const supported = new Set([
    "--expect-text",
    "--min-pages",
    "--max-pages",
    "--sha256",
  ]);
  for (const flag of values.keys()) {
    if (!supported.has(flag)) throw new Error(`Unknown option: ${flag}`);
  }
  for (const flag of supported) {
    if (!values.has(flag)) throw new Error(`Required option missing: ${flag}`);
  }

  const minPages = parseInteger(values.get("--min-pages"), "--min-pages");
  const maxPages = parseInteger(values.get("--max-pages"), "--max-pages");
  if (minPages > maxPages) {
    throw new Error("--min-pages cannot exceed --max-pages");
  }

  const expectedSha256 = values.get("--sha256").toLowerCase();
  if (!/^[a-f0-9]{64}$/.test(expectedSha256)) {
    throw new Error("--sha256 must be exactly 64 hexadecimal characters");
  }

  return {
    pdfPath,
    expectText: values.get("--expect-text"),
    minPages,
    maxPages,
    expectedSha256,
  };
}

async function main() {
  let options;
  try {
    options = parseArgs(process.argv.slice(2));
  } catch (error) {
    usage(error instanceof Error ? error.message : String(error));
    return;
  }

  const bytes = await readFile(options.pdfPath);
  const actualSha256 = createHash("sha256").update(bytes).digest("hex");
  if (actualSha256 !== options.expectedSha256) {
    throw new Error(
      `SHA-256 mismatch: expected ${options.expectedSha256}, got ${actualSha256}`,
    );
  }

  const parser = new PDFParse({ data: bytes });
  try {
    const text = await parser.getText();
    const info = await parser.getInfo({ parsePageInfo: true });
    if (!text.text.includes(options.expectText)) {
      throw new Error(`Expected text not found: ${options.expectText}`);
    }
    if (info.total < options.minPages || info.total > options.maxPages) {
      throw new Error(
        `Page count ${info.total} outside ${options.minPages}-${options.maxPages}`,
      );
    }
    if (!Array.isArray(info.pages) || info.pages.length !== info.total) {
      throw new Error("Per-page metadata count does not match total pages");
    }

    process.stdout.write(
      `${JSON.stringify({
        ok: true,
        path: options.pdfPath,
        pages: info.total,
        sha256: actualSha256,
        title: info.info?.Title ?? null,
        expectedText: options.expectText,
      })}\n`,
    );
  } finally {
    await parser.destroy();
  }
}

await main();
