#!/usr/bin/env node
/**
 * safe-prisma.mjs
 *
 * Single guard wrapper for the Prisma commands that can DESTROY production
 * data. The platform was wiped twice by running one of these against the
 * production (Neon) DATABASE_URL during a migration conflict:
 *
 *   - `prisma migrate reset`  — drops + recreates the schema (full nuke)
 *   - `prisma migrate dev`    — a dev-only command; prompts a reset on drift
 *   - `prisma db push`        — skips the migrations table; can drop columns/data
 *
 * This wrapper blocks those three against a Neon-host DATABASE_URL unless the
 * operator passes `--i-know-this-is-prod`. Crucially, the wrapper CONSUMES the
 * override flag itself and strips it before spawning prisma — the previous
 * `guard && prisma` composition was broken because `npm run <script> -- --flag`
 * appended the flag to prisma, not the guard, so the escape hatch never worked.
 *
 * `prisma migrate deploy`, `prisma generate`, and every other subcommand are
 * NOT destructive (migrate deploy only applies pending migrations and errors on
 * drift) and pass through unguarded.
 *
 * Usage (wired via package.json):
 *   node scripts/safe-prisma.mjs migrate reset
 *   node scripts/safe-prisma.mjs migrate dev --name add_widget
 *   node scripts/safe-prisma.mjs db push
 *   node scripts/safe-prisma.mjs db push --i-know-this-is-prod   (override)
 *
 * Env: SAFE_PRISMA_DRY_RUN=1 prints the resolved command instead of running it
 * (used by tests; never set in normal operation).
 */

import { spawnSync } from "node:child_process";

const OVERRIDE_FLAG = "--i-know-this-is-prod";

// Destructive prisma subcommands, matched on the first two argv tokens.
const DESTRUCTIVE = [
  ["migrate", "reset"],
  ["migrate", "dev"],
  ["db", "push"],
];

function isDestructive(args) {
  return DESTRUCTIVE.some(([a, b]) => args[0] === a && args[1] === b);
}

function looksLikeProd(url) {
  return /neon\.tech|neon\.dev/i.test(url ?? "");
}

function main() {
  const rawArgs = process.argv.slice(2);
  const hasOverride = rawArgs.includes(OVERRIDE_FLAG);
  // Strip the override flag so it is never forwarded to prisma.
  const prismaArgs = rawArgs.filter((a) => a !== OVERRIDE_FLAG);

  const url = process.env.DATABASE_URL ?? "";

  if (isDestructive(prismaArgs) && looksLikeProd(url) && !hasOverride) {
    const cmd = `prisma ${prismaArgs.join(" ")}`;
    console.error(
      `❌ BLOCKED — refusing to run \`${cmd}\` against a Neon host (likely production).`,
    );
    console.error(
      "   This command can destroy production data. The platform has been wiped this way before.",
    );
    console.error("");
    console.error(`   Target: ${url.replace(/:[^@]+@/, ":***@").slice(0, 80)}…`);
    console.error("");
    console.error("   If you are CERTAIN you want this against production, re-run with:");
    console.error(`     npm run <script> -- ${OVERRIDE_FLAG}`);
    console.error("   (better: take a snapshot + create a Neon restore branch first — see");
    console.error("    docs/runbooks/database-protection.md)");
    process.exit(1);
  }

  if (process.env.SAFE_PRISMA_DRY_RUN === "1") {
    console.log(`WOULD RUN: prisma ${prismaArgs.join(" ")}`);
    process.exit(0);
  }

  const result = spawnSync("prisma", prismaArgs, { stdio: "inherit" });
  if (result.error) {
    console.error(result.error.message);
    process.exit(1);
  }
  process.exit(result.status ?? 0);
}

main();
