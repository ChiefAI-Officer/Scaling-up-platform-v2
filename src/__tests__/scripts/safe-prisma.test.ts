/**
 * Tests for the unified destructive-command guard (scripts/safe-prisma.mjs).
 *
 * Black-box: runs the CLI via execFileSync (no shell — internal args only)
 * with a controlled DATABASE_URL and SAFE_PRISMA_DRY_RUN=1 so the wrapper
 * prints what it *would* run instead of actually spawning prisma. Checks
 * exit code + stdout/stderr.
 *
 * The guard exists because `prisma migrate reset` / `migrate dev` / `db push`
 * against the production (Neon) DATABASE_URL is how the platform was wiped.
 * `migrate deploy` is NOT destructive and must always pass through.
 */

import { execFileSync } from "node:child_process";
import { join } from "node:path";

const SCRIPT_PATH = join(__dirname, "..", "..", "scripts", "safe-prisma.mjs");

const NEON_URL =
  "postgresql://user:pass@ep-falling-sound-aiilz991-pooler.c-4.us-east-1.aws.neon.tech/neondb?sslmode=require";
const LOCAL_URL = "postgresql://user:pass@localhost:5432/devdb";

interface RunResult {
  stdout: string;
  stderr: string;
  exitCode: number;
}

function run(args: string[], databaseUrl: string | undefined): RunResult {
  const env: NodeJS.ProcessEnv = {
    ...process.env,
    SAFE_PRISMA_DRY_RUN: "1",
  };
  if (databaseUrl === undefined) {
    delete env.DATABASE_URL;
  } else {
    env.DATABASE_URL = databaseUrl;
  }
  try {
    const stdout = execFileSync("node", [SCRIPT_PATH, ...args], {
      encoding: "utf-8",
      stdio: ["ignore", "pipe", "pipe"],
      env,
    });
    return { stdout, stderr: "", exitCode: 0 };
  } catch (err) {
    const e = err as { status?: number; stdout?: Buffer | string; stderr?: Buffer | string };
    return {
      stdout: typeof e.stdout === "string" ? e.stdout : e.stdout?.toString() ?? "",
      stderr: typeof e.stderr === "string" ? e.stderr : e.stderr?.toString() ?? "",
      exitCode: e.status ?? -1,
    };
  }
}

describe("safe-prisma guard", () => {
  test("BLOCKS `migrate reset` against a Neon (prod) host", () => {
    const r = run(["migrate", "reset"], NEON_URL);
    expect(r.exitCode).toBe(1);
    expect(r.stderr).toMatch(/BLOCKED/i);
  });

  test("BLOCKS `migrate dev` against a Neon (prod) host", () => {
    const r = run(["migrate", "dev"], NEON_URL);
    expect(r.exitCode).toBe(1);
    expect(r.stderr).toMatch(/BLOCKED/i);
  });

  test("BLOCKS `db push` against a Neon (prod) host", () => {
    const r = run(["db", "push"], NEON_URL);
    expect(r.exitCode).toBe(1);
    expect(r.stderr).toMatch(/BLOCKED/i);
  });

  test("ALLOWS `migrate reset` against a local host", () => {
    const r = run(["migrate", "reset"], LOCAL_URL);
    expect(r.exitCode).toBe(0);
    expect(r.stdout).toMatch(/WOULD RUN: prisma migrate reset/);
  });

  test("ALLOWS a destructive command against Neon WITH the override flag, and STRIPS the flag", () => {
    const r = run(["migrate", "reset", "--i-know-this-is-prod"], NEON_URL);
    expect(r.exitCode).toBe(0);
    expect(r.stdout).toMatch(/WOULD RUN: prisma migrate reset/);
    // The override flag is consumed by the wrapper — it must NOT be forwarded to prisma.
    expect(r.stdout).not.toMatch(/--i-know-this-is-prod/);
  });

  test("ALWAYS allows non-destructive `migrate deploy` even against Neon (it cannot wipe)", () => {
    const r = run(["migrate", "deploy"], NEON_URL);
    expect(r.exitCode).toBe(0);
    expect(r.stdout).toMatch(/WOULD RUN: prisma migrate deploy/);
  });

  test("ALLOWS destructive command when DATABASE_URL is unset (no prod URL to protect)", () => {
    const r = run(["migrate", "reset"], undefined);
    expect(r.exitCode).toBe(0);
    expect(r.stdout).toMatch(/WOULD RUN: prisma migrate reset/);
  });

  test("forwards extra prisma args through unchanged", () => {
    const r = run(["migrate", "dev", "--name", "add_widget"], LOCAL_URL);
    expect(r.exitCode).toBe(0);
    expect(r.stdout).toMatch(/WOULD RUN: prisma migrate dev --name add_widget/);
  });
});
