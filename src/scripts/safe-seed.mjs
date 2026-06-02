#!/usr/bin/env node
/**
 * safe-seed.mjs
 *
 * Guard wrapper for assessment seed scripts. Mirrors the design of
 * safe-prisma.mjs: blocks execution against a Neon/prod DATABASE_URL unless
 * `--i-know-this-is-prod` is explicitly passed AND (if
 * ASSESSMENT_PROD_EXPECTED_HOST is set) the connected host matches it.
 *
 * Also enforces the inverse: a "dev dry-run" (no override flag) is blocked
 * when the configured DATABASE_URL IS the prod host, so a local .env that
 * happens to point at prod cannot silently trigger a seed run.
 *
 * Decision matrix:
 *
 *   DATABASE_URL host | --i-know-this-is-prod | ASSESSMENT_PROD_EXPECTED_HOST | Result
 *   ──────────────────┼───────────────────────┼───────────────────────────────┼───────────────────────────────────────────
 *   Neon/prod         | absent                | any                           | BLOCKED — add flag
 *   Neon/prod         | present               | unset                         | ALLOWED (flag alone sufficient)
 *   Neon/prod         | present               | set, matches actual host      | ALLOWED
 *   Neon/prod         | present               | set, does NOT match           | BLOCKED — host mismatch (wrong DB)
 *   dev host          | absent                | unset                         | ALLOWED (normal dev path)
 *   dev host          | absent                | set, matches actual host      | BLOCKED — dev run against expected-prod host
 *   dev host          | absent                | set, does NOT match           | ALLOWED (dev .env pointing elsewhere)
 *   dev host          | present               | any                           | ALLOWED (operator explicitly overriding)
 *
 * Usage (wired via package.json):
 *   node scripts/safe-seed.mjs all
 *   node scripts/safe-seed.mjs all --i-know-this-is-prod
 *   node scripts/safe-seed.mjs rockefeller
 *   node scripts/safe-seed.mjs qsp-v1 --i-know-this-is-prod
 *
 * This script is also invoked internally by run-assessment-seeds.mjs so the
 * guard applies to every seed execution in the ordered runner.
 *
 * Env:
 *   SAFE_SEED_DRY_RUN=1   Print resolved command instead of executing (for tests).
 *   DATABASE_URL           Standard Prisma connection URL.
 *   ASSESSMENT_PROD_EXPECTED_HOST  Optional fingerprint; see db-fingerprint.ts.
 *
 * Exit codes:
 *   0  Guard passed (or dry-run).
 *   1  Guard rejected (prod/host mismatch) or seed execution failed.
 */

import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));

export const OVERRIDE_FLAG = "--i-know-this-is-prod";

// Seed alias → relative path from the scripts/ directory.
// Order here is informational only — run-assessment-seeds.mjs enforces order.
const SEED_MAP = {
  rockefeller: "../prisma/seed-rockefeller-assessment.ts",
  "qsp-v1": "../prisma/seed-qsp-v1-assessment.ts",
  "qsp-v2": "../prisma/seed-qsp-v2-assessment.ts",
  lva: "../prisma/seed-lva-assessment.ts",
  "scaling-up-full": "../prisma/seed-scaling-up-full-assessment.ts",
};

const ALL_ALIASES = Object.keys(SEED_MAP);

// ─── Pure host-check helpers ─────────────────────────────────────────────
//
// Canonical TypeScript source: src/lib/scripts/safe-seed-guard.ts
// (imported by Jest tests). The functions below are duplicated here as plain
// JS because this .mjs script runs under `node` (not `tsx`) and cannot
// import TypeScript modules. Any logic change MUST be mirrored in both files.

/**
 * Parse the hostname from a DATABASE_URL / PostgreSQL connection string.
 * Returns an empty string if the URL is falsy or unparseable.
 */
export function parseHost(url) {
  if (!url) return "";
  const noProto = url.replace(/^[a-z]+:\/\//i, "");
  const afterAt = noProto.includes("@") ? noProto.split("@")[1] : noProto;
  const hostPort = (afterAt ?? "").split("/")[0];
  return hostPort.split(":")[0] ?? "";
}

/**
 * Return true when the URL looks like a Neon/production host.
 * Mirrors the heuristic in safe-prisma.mjs.
 */
export function looksLikeProd(url) {
  return /neon\.tech|neon\.dev/i.test(url ?? "");
}

/**
 * Core guard logic — pure function, no I/O, returns a decision object.
 *
 * Decision matrix (see safe-seed-guard.ts for full table):
 *   prod host + no flag     → BLOCKED
 *   prod host + flag + no expectedHost → ALLOWED
 *   prod host + flag + matching expectedHost → ALLOWED
 *   prod host + flag + mismatched expectedHost → BLOCKED
 *   dev host + no flag + no expectedHost → ALLOWED
 *   dev host + no flag + expectedHost matches → BLOCKED (dev .env on prod)
 *   dev host + no flag + expectedHost mismatch → ALLOWED
 *   dev host + flag → ALLOWED
 *
 * @param {object} opts
 * @param {string}  opts.url               DATABASE_URL value.
 * @param {string|undefined} opts.expectedHost  ASSESSMENT_PROD_EXPECTED_HOST value.
 * @param {boolean} opts.hasOverride        Whether OVERRIDE_FLAG is present.
 * @returns {{ allowed: boolean; reason?: string }}
 */
export function checkGuard({ url, expectedHost, hasOverride }) {
  const actualHost = parseHost(url);
  const isProd = looksLikeProd(url);

  if (isProd) {
    // Prod host requires the override flag.
    if (!hasOverride) {
      return {
        allowed: false,
        reason:
          `DATABASE_URL points at a Neon/prod host ("${actualHost}"). ` +
          `Refusing to seed without explicit confirmation.\n` +
          `Re-run with: node scripts/safe-seed.mjs <target> ${OVERRIDE_FLAG}`,
      };
    }

    // Override present — if ASSESSMENT_PROD_EXPECTED_HOST is set, enforce it.
    if (expectedHost) {
      if (actualHost !== expectedHost) {
        return {
          allowed: false,
          reason:
            `Host fingerprint MISMATCH.\n` +
            `  expected (ASSESSMENT_PROD_EXPECTED_HOST): ${expectedHost}\n` +
            `  actual (from DATABASE_URL):               ${actualHost}\n` +
            `This looks like the wrong database. Aborting seed.`,
        };
      }
    }

    return { allowed: true };
  }

  // Dev host path.
  if (!hasOverride && expectedHost && actualHost === expectedHost) {
    // A dev invocation (no override) where the DATABASE_URL host MATCHES the
    // expected prod host — the local .env must be pointing at prod.
    return {
      allowed: false,
      reason:
        `BLOCKED — dev dry-run: DATABASE_URL host ("${actualHost}") matches ` +
        `ASSESSMENT_PROD_EXPECTED_HOST. This .env is pointed at production.\n` +
        `If you intended a prod seed, add: ${OVERRIDE_FLAG}`,
    };
  }

  return { allowed: true };
}

// ─── main ────────────────────────────────────────────────────────────────

function main() {
  const rawArgs = process.argv.slice(2);
  const hasOverride = rawArgs.includes(OVERRIDE_FLAG);
  // Strip the override flag — do NOT forward it to tsx/the seed scripts.
  const seedArgs = rawArgs.filter((a) => a !== OVERRIDE_FLAG);

  const target = seedArgs[0];
  if (!target) {
    console.error("Usage: node scripts/safe-seed.mjs <alias|all> [--i-know-this-is-prod]");
    console.error(`  aliases: ${ALL_ALIASES.join(", ")}, all`);
    process.exit(1);
  }

  if (target !== "all" && !SEED_MAP[target]) {
    console.error(`Unknown seed alias: "${target}"`);
    console.error(`  known: ${ALL_ALIASES.join(", ")}, all`);
    process.exit(1);
  }

  const url = process.env.DATABASE_URL ?? "";
  const expectedHost = process.env.ASSESSMENT_PROD_EXPECTED_HOST;

  const decision = checkGuard({ url, expectedHost, hasOverride });

  if (!decision.allowed) {
    console.error(`\n BLOCKED — safe-seed guard refused.\n`);
    console.error(`  ${decision.reason}\n`);
    process.exit(1);
  }

  // Guard passed. Resolve the seed script(s) to run.
  const aliases = target === "all" ? ALL_ALIASES : [target];

  if (process.env.SAFE_SEED_DRY_RUN === "1") {
    for (const alias of aliases) {
      const rel = SEED_MAP[alias];
      const abs = resolve(__dirname, rel);
      console.log(`WOULD RUN: npx tsx ${abs}`);
    }
    process.exit(0);
  }

  for (const alias of aliases) {
    const rel = SEED_MAP[alias];
    const abs = resolve(__dirname, rel);
    console.log(`\n Seeding: ${alias} (${abs})\n`);
    const result = spawnSync("npx", ["tsx", abs], {
      stdio: "inherit",
      env: process.env,
    });
    if (result.error) {
      console.error(`\n Seed "${alias}" failed: ${result.error.message}`);
      process.exit(1);
    }
    if (result.status !== 0) {
      console.error(`\n Seed "${alias}" exited with code ${result.status}`);
      process.exit(result.status ?? 1);
    }
  }

  process.exit(0);
}

main();
