/**
 * Push .env to Vercel Production + Preview
 *
 * Uses the Vercel REST API (not the CLI) to upsert env vars to both
 * production and preview environments. The CLI does not support adding
 * to "all preview branches" in non-interactive/machine mode (Vercel CLI
 * v50 bug: always returns action_required:git_branch_required).
 *
 * Usage: node scripts/push-env-to-vercel.mjs
 */

import { readFileSync } from "fs";
import { join } from "path";
import { homedir } from "os";

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

function getVercelToken() {
  // Also check VERCEL_TOKEN env var first (CI/explicit override)
  if (process.env.VERCEL_TOKEN) return process.env.VERCEL_TOKEN;

  const candidates = [
    join(homedir(), ".local", "share", "com.vercel.cli", "auth.json"),
    join(homedir(), ".vercel", "auth.json"),
    // Windows-specific path
    join(process.env.APPDATA ?? "", "com.vercel.cli", "auth.json"),
    join(process.env.APPDATA ?? "", "com.vercel.cli", "Data", "auth.json"),
    join(process.env.LOCALAPPDATA ?? "", "com.vercel.cli", "auth.json"),
    join(process.env.LOCALAPPDATA ?? "", "com.vercel.cli", "Data", "auth.json"),
  ];
  for (const p of candidates) {
    try {
      const data = JSON.parse(readFileSync(p, "utf-8"));
      if (process.env.DEBUG_ENV) console.log(`  [auth] found file: ${p}, keys: ${JSON.stringify(Object.keys(data))}`);
      // Format: { "<teamId>": { "token": "..." } } or { "token": "..." }
      const token = data.token ?? Object.values(data)[0]?.token;
      if (token) return token;
    } catch (e) {
      if (process.env.DEBUG_ENV) console.log(`  [auth] ${p}: ${e.code || e.message}`);
    }
  }
  return null;
}

async function upsertEnvVar(token, teamId, projectId, key, value) {
  // First: try to delete existing entries for this key (ignore errors)
  // GET existing env vars to find the IDs
  const listRes = await fetch(
    `https://api.vercel.com/v9/projects/${projectId}/env?teamId=${teamId}`,
    { headers: { Authorization: `Bearer ${token}` } }
  );
  if (listRes.ok) {
    const { envs = [] } = await listRes.json();
    const existing = envs.filter((e) => e.key === key);
    for (const env of existing) {
      await fetch(
        `https://api.vercel.com/v9/projects/${projectId}/env/${env.id}?teamId=${teamId}`,
        { method: "DELETE", headers: { Authorization: `Bearer ${token}` } }
      );
    }
  }

  // Create new entry targeting both production and preview
  const res = await fetch(
    `https://api.vercel.com/v10/projects/${projectId}/env?teamId=${teamId}`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        key,
        value,
        type: "encrypted",
        target: ["production", "preview"],
      }),
    }
  );

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`HTTP ${res.status}: ${body.slice(0, 200)}`);
  }

  return await res.json();
}

async function main() {
  console.log("=== Pushing .env to Vercel Production + Preview (API) ===\n");

  // Load project IDs from .vercel/project.json
  let projectId, teamId;
  try {
    const proj = JSON.parse(readFileSync(".vercel/project.json", "utf-8"));
    projectId = proj.projectId;
    teamId = proj.orgId;
  } catch {
    console.error("ERROR: .vercel/project.json not found — run 'npx vercel link' first");
    process.exit(1);
  }

  // Get auth token
  const token = getVercelToken();
  if (!token) {
    console.error("ERROR: No Vercel auth token found — run 'npx vercel login' first");
    process.exit(1);
  }

  const vars = parseEnvFile(".env");
  let count = 0;
  let errors = 0;

  for (const { key, value: localValue } of vars) {
    const value = OVERRIDES[key] ?? localValue;
    const isOverride = key in OVERRIDES;

    const display = isOverride
      ? `OVERRIDE → ${value}`
      : value.length > 50
        ? `${value.slice(0, 25)}...${value.slice(-15)}`
        : value;

    process.stdout.write(`  [${key}] ${display} ... `);

    if (!value) {
      console.log("SKIPPED (empty value)");
      continue;
    }

    try {
      await upsertEnvVar(token, teamId, projectId, key, value);
      console.log("OK");
      count++;
    } catch (e) {
      console.log(`FAILED (${e.message})`);
      errors++;
    }
  }

  console.log(`\n=== Done ===`);
  console.log(`  Pushed: ${count} vars to [production, preview]`);
  console.log(`  Errors: ${errors}`);
  console.log(`\nNext: Redeploy to apply → npx vercel --prod`);
}

main();
