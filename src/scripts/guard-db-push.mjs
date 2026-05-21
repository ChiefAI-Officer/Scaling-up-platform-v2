#!/usr/bin/env node
/**
 * guard-db-push.mjs
 *
 * Blocks `prisma db push` against production-looking DATABASE_URLs.
 * `db push` skips the migrations table and can drop data on schema
 * divergence — too dangerous to run against a Neon prod URL without
 * explicit operator override.
 *
 * Override: pass `--i-know-this-is-prod` to bypass.
 *   npm run db:push -- --i-know-this-is-prod
 */

const url = process.env.DATABASE_URL ?? "";
const override = process.argv.includes("--i-know-this-is-prod");

const looksLikeProd = /neon\.tech|neon\.dev/i.test(url);

if (looksLikeProd && !override) {
  console.error(
    "❌ db:push BLOCKED — DATABASE_URL points at a Neon host (likely production).",
  );
  console.error(
    "   prisma db push skips the migrations table and can drop columns/data on schema divergence.",
  );
  console.error("");
  console.error("   For prod, use:   npm run db:migrate       (creates + applies a migration)");
  console.error("   To override:     npm run db:push -- --i-know-this-is-prod");
  process.exit(1);
}

process.exit(0);
