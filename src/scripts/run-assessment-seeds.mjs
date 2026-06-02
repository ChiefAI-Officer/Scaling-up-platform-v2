#!/usr/bin/env node
/**
 * run-assessment-seeds.mjs
 *
 * Ordered runner for the 5 assessment seed scripts.
 *
 * Order:
 *   1. rockefeller
 *   2. qsp-v1
 *   3. qsp-v2
 *   4. lva
 *   5. scaling-up-full
 *
 * Each seed is invoked via `safe-seed.mjs` so the guard applies to every
 * execution. Any `--i-know-this-is-prod` flag is forwarded transparently.
 *
 * Behavior:
 *   - STOP-ON-ERROR: if a seed exits non-zero, the runner aborts immediately
 *     and writes a partial run-log (marking the failed seed + remaining as
 *     "skipped").
 *   - Writes a JSON run-log to `<run-log-dir>/<seedRunId>.json`.
 *     Default run-log-dir: ./seed-run-logs/ relative to the scripts/ directory.
 *     Override with env var SEED_RUN_LOG_DIR.
 *
 * Run-log shape:
 *   {
 *     seedRunId: string,          // timestamp-based e.g. "2026-06-02T00-00-00-000Z"
 *     startedAt: string,          // ISO timestamp
 *     completedAt: string,        // ISO timestamp (even on failure)
 *     overallStatus: "ok" | "failed" | "partial",
 *     results: Array<{
 *       alias: string,
 *       status: "ok" | "failed" | "skipped",
 *       versionNumber?: number,
 *       contentHash?: string,
 *       action?: string,          // "created" | "noop"
 *       exitCode?: number,
 *       errorMessage?: string,
 *     }>
 *   }
 *
 * Usage:
 *   node scripts/run-assessment-seeds.mjs
 *   node scripts/run-assessment-seeds.mjs --i-know-this-is-prod
 *
 * Env:
 *   DATABASE_URL              Standard Prisma connection URL.
 *   ASSESSMENT_PROD_EXPECTED_HOST  Optional fingerprint (forwarded to safe-seed).
 *   SEED_RUN_LOG_DIR          Override run-log output directory.
 *   SAFE_SEED_DRY_RUN=1       Dry-run: print would-run commands, no actual seeds.
 */

import { spawnSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));

const SEED_ALIASES = [
  "rockefeller",
  "qsp-v1",
  "qsp-v2",
  "lva",
  "scaling-up-full",
];

const OVERRIDE_FLAG = "--i-know-this-is-prod";

/**
 * Generate a filesystem-safe seedRunId from the current timestamp.
 * Example: "2026-06-02T00-00-00-000Z"
 */
function makeSeedRunId() {
  return new Date()
    .toISOString()
    .replace(/:/g, "-")
    .replace(/\./g, "-");
}

/**
 * Parse the last JSON line from a seed script's stdout.
 * Seeds emit a single JSON object as their last stdout line.
 * Returns null if no valid JSON line is found.
 */
function parseLastJsonLine(stdout) {
  if (!stdout) return null;
  const lines = stdout.trim().split("\n").reverse();
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed.startsWith("{")) continue;
    try {
      return JSON.parse(trimmed);
    } catch {
      // not valid JSON, keep looking
    }
  }
  return null;
}

function main() {
  const rawArgs = process.argv.slice(2);
  const hasOverride = rawArgs.includes(OVERRIDE_FLAG);

  const safeSeedScript = resolve(__dirname, "safe-seed.mjs");
  const runLogDir =
    process.env.SEED_RUN_LOG_DIR ?? resolve(__dirname, "../seed-run-logs");
  const seedRunId = makeSeedRunId();
  const startedAt = new Date().toISOString();

  // Ensure the run-log directory exists.
  mkdirSync(runLogDir, { recursive: true });

  const results = [];
  let aborted = false;
  let failedAlias = null;

  for (const alias of SEED_ALIASES) {
    if (aborted) {
      results.push({ alias, status: "skipped" });
      continue;
    }

    // Single source of truth for the spawn args, used by BOTH the dry-run
    // display and the actual spawnSync below — so they can never diverge.
    const seedArgs = [safeSeedScript, alias, ...(hasOverride ? [OVERRIDE_FLAG] : [])];

    if (process.env.SAFE_SEED_DRY_RUN === "1") {
      console.log(`WOULD RUN: node ${seedArgs.join(" ")}`);
      results.push({ alias, status: "ok", action: "dry-run" });
      continue;
    }

    console.log(`\n[run-assessment-seeds] Starting seed: ${alias}\n`);

    const result = spawnSync(
      "node",
      seedArgs,
      {
        stdio: ["inherit", "pipe", "inherit"],
        env: process.env,
        encoding: "utf-8",
      }
    );

    // Forward seed stdout to the console regardless of success/failure.
    if (result.stdout) process.stdout.write(result.stdout);

    if (result.error) {
      console.error(
        `\n[run-assessment-seeds] Seed "${alias}" spawn error: ${result.error.message}`
      );
      results.push({
        alias,
        status: "failed",
        exitCode: 1,
        errorMessage: result.error.message,
      });
      aborted = true;
      failedAlias = alias;
      continue;
    }

    if (result.status !== 0) {
      console.error(
        `\n[run-assessment-seeds] Seed "${alias}" exited with code ${result.status}`
      );
      results.push({
        alias,
        status: "failed",
        exitCode: result.status ?? 1,
      });
      aborted = true;
      failedAlias = alias;
      continue;
    }

    // Parse the seed's JSON output to extract manifest data.
    const seedJson = parseLastJsonLine(result.stdout);
    results.push({
      alias,
      status: "ok",
      action: seedJson?.action ?? null,
      versionNumber: seedJson?.versionNumber ?? null,
      contentHash: seedJson?.contentHash ?? null,
    });

    console.log(
      `[run-assessment-seeds] ${alias} completed (action=${seedJson?.action ?? "unknown"}, v${seedJson?.versionNumber ?? "?"}).`
    );
  }

  const completedAt = new Date().toISOString();
  const overallStatus = aborted
    ? results.some((r) => r.status === "ok")
      ? "partial"
      : "failed"
    : "ok";

  const runLog = {
    seedRunId,
    startedAt,
    completedAt,
    overallStatus,
    results,
  };

  const logPath = resolve(runLogDir, `${seedRunId}.json`);
  writeFileSync(logPath, JSON.stringify(runLog, null, 2) + "\n", "utf-8");
  console.log(`\n[run-assessment-seeds] Run log written: ${logPath}`);

  if (aborted) {
    console.error(
      `\n[run-assessment-seeds] ABORTED after failure in "${failedAlias}". ` +
        `Subsequent seeds were skipped. Check the run log for details.`
    );
    process.exit(1);
  }

  console.log(
    `\n[run-assessment-seeds] All ${SEED_ALIASES.length} seeds completed successfully.`
  );
  process.exit(0);
}

main();
