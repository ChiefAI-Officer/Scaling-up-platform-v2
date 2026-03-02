/**
 * Push .env to Vercel Production
 *
 * Reads local .env, applies production overrides, pushes each var to Vercel.
 * Usage: node scripts/push-env-to-vercel.mjs
 */

import { readFileSync } from "fs";
import { execSync } from "child_process";

const PROD_URL = "https://scaling-up-platform-v2.vercel.app";

// Production overrides (different from local .env)
const OVERRIDES = {
  NEXTAUTH_URL: PROD_URL,
  APP_URL: PROD_URL,
  LANDING_PAGE_BASE_URL: `${PROD_URL}/workshops`,
  DEMO_MODE: "false",
};

// Vars managed by Vercel or set automatically — don't touch
const SKIP = new Set(["BLOB_READ_WRITE_TOKEN", "NODE_ENV"]);

function parseEnvFile(filePath) {
  const content = readFileSync(filePath, "utf-8");
  const vars = [];

  for (const line of content.split("\n")) {
    const trimmed = line.trim();
    // Skip comments and empty lines
    if (!trimmed || trimmed.startsWith("#")) continue;

    const match = trimmed.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)/);
    if (!match) continue;

    const key = match[1];
    let value = match[2].trim();

    // Strip inline comments FIRST (  # comment) — before quote stripping
    const commentIdx = value.indexOf("  #");
    if (commentIdx !== -1) {
      value = value.slice(0, commentIdx).trim();
    }

    // Strip surrounding quotes
    if ((value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }

    if (key && !SKIP.has(key)) {
      vars.push({ key, value });
    }
  }

  return vars;
}

function run(cmd, input) {
  try {
    return execSync(cmd, {
      encoding: "utf-8",
      stdio: ["pipe", "pipe", "pipe"],
      ...(input !== undefined ? { input } : {}),
    });
  } catch {
    return null;
  }
}

async function main() {
  console.log("=== Pushing .env to Vercel Production ===\n");

  const vars = parseEnvFile(".env");
  let count = 0;
  let errors = 0;

  for (const { key, value: localValue } of vars) {
    // Apply override if exists
    const value = OVERRIDES[key] ?? localValue;
    const isOverride = key in OVERRIDES;

    const display = isOverride
      ? `OVERRIDE → ${value}`
      : value.length > 50
        ? `${value.slice(0, 25)}...${value.slice(-15)}`
        : value;

    process.stdout.write(`  [${key}] ${display} ... `);

    // Remove existing (ignore errors)
    run(`npx vercel env rm ${key} production`, "y\n");

    // Add new value (use input option to bypass Windows cmd.exe echo quoting)
    const result = run(`npx vercel env add ${key} production`, value);

    if (result !== null) {
      console.log("OK");
      count++;
    } else {
      console.log("FAILED");
      errors++;
    }
  }

  console.log(`\n=== Done ===`);
  console.log(`  Pushed: ${count}`);
  console.log(`  Errors: ${errors}`);
  console.log(`\nNext: Redeploy to apply → npx vercel --prod`);
}

main();
