/* eslint-disable @typescript-eslint/no-require-imports */
const { resolve } = require("node:path");

const DISPOSABLE_SENTINEL_ID = /^report-style-e2e-sentinel-[A-Za-z0-9_-]{20,}$/;
const DISPOSABLE_SENTINEL_VALUE = /^report-style-e2e-disposable:[A-Za-z0-9_-]{32,}$/;

function invalidDatabaseContract() {
  return new Error("Report-style E2E database contract is invalid.");
}

function validateDatabaseEnvironment(env) {
  const fixtureUrl = env.E2E_REPORT_STYLES_DATABASE_URL;
  const applicationUrl = env.DATABASE_URL;
  const sentinelId = env.E2E_REPORT_STYLES_DISPOSABLE_SENTINEL_ID;
  const sentinelValue = env.E2E_REPORT_STYLES_DISPOSABLE_SENTINEL_VALUE;

  if (
    !fixtureUrl
    || !applicationUrl
    || fixtureUrl !== applicationUrl
    || !sentinelId
    || !DISPOSABLE_SENTINEL_ID.test(sentinelId)
    || !sentinelValue
    || !DISPOSABLE_SENTINEL_VALUE.test(sentinelValue)
  ) {
    throw invalidDatabaseContract();
  }

  return { databaseUrl: fixtureUrl, sentinelId, sentinelValue };
}

async function assertDisposableReportStyleDatabase({ env, createClient }) {
  const { databaseUrl, sentinelId, sentinelValue } = validateDatabaseEnvironment(env);
  const client = createClient(databaseUrl);
  let sentinel;

  try {
    sentinel = await client.organization.findUnique({
      where: { id: sentinelId },
      select: { id: true, name: true, deletedAt: true },
    });
  } catch {
    throw new Error("Disposable report-style E2E database sentinel could not be verified.");
  } finally {
    await client.$disconnect().catch(() => undefined);
  }

  if (
    sentinel?.id !== sentinelId
    || sentinel.name !== sentinelValue
    || sentinel.deletedAt !== null
  ) {
    throw new Error("Disposable report-style E2E database sentinel was not found.");
  }
}

function childEnvironment(env) {
  const inherited = Object.fromEntries(
    Object.entries(env).filter((entry) => typeof entry[1] === "string"),
  );
  inherited.DATABASE_URL = env.E2E_REPORT_STYLES_DATABASE_URL || "";
  return inherited;
}

function createReportStyleWebServer(env) {
  if (env.PLAYWRIGHT_SKIP_WEBSERVER === "1") return undefined;

  // Report-style acceptance is opt-in. Do not impose its disposable fixture
  // contract on the repository's unrelated Playwright suites.
  if (!env.E2E_REPORT_STYLES_DATABASE_URL) {
    return {
      command: "npm run dev",
      url: "http://localhost:3000",
      reuseExistingServer: !env.CI,
      timeout: 120 * 1000,
    };
  }

  return {
    command: "node scripts/start-report-style-e2e.mjs",
    url: "http://localhost:3000",
    reuseExistingServer: false,
    timeout: 5 * 60 * 1000,
    env: childEnvironment(env),
  };
}

function productionServerCommands({ cwd, execPath, platform }) {
  return {
    build: {
      command: platform === "win32" ? "npm.cmd" : "npm",
      args: ["run", "build"],
    },
    start: {
      command: execPath,
      args: [resolve(cwd, "node_modules/next/dist/bin/next"), "start"],
    },
  };
}

async function runReportStyleE2eServer({
  env,
  createClient,
  runBuild,
  startProductionServer,
}) {
  await assertDisposableReportStyleDatabase({ env, createClient });
  const productionEnvironment = { ...env, NODE_ENV: "production" };
  await runBuild(productionEnvironment);
  await startProductionServer(productionEnvironment);
}

function expectedRaceReportStyle(patchStatus) {
  if (patchStatus === 200) return "MODERN_DASHBOARD";
  if (patchStatus === 409) return "CLASSIC";
  throw new Error("Unexpected report-style PATCH status.");
}

module.exports = {
  assertDisposableReportStyleDatabase,
  createReportStyleWebServer,
  expectedRaceReportStyle,
  productionServerCommands,
  runReportStyleE2eServer,
};
