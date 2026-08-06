/* eslint-disable @typescript-eslint/no-require-imports */
const { resolve } = require("node:path");

const DISPOSABLE_SENTINEL_ID = /^report-style-e2e-sentinel-[A-Za-z0-9_-]{20,}$/;
const DISPOSABLE_SENTINEL_VALUE = /^report-style-e2e-disposable:[A-Za-z0-9_-]{32,}$/;
const REPORT_COMPARISON_SENTINEL_ID = /^report-comparison-e2e-sentinel-[A-Za-z0-9_-]{20,}$/;
const REPORT_COMPARISON_SENTINEL_VALUE = /^report-comparison-e2e-disposable:[A-Za-z0-9_-]{32,}$/;

const REPORT_STYLE_LANE = {
  databaseKey: "E2E_REPORT_STYLES_DATABASE_URL",
  sentinelIdKey: "E2E_REPORT_STYLES_DISPOSABLE_SENTINEL_ID",
  sentinelValueKey: "E2E_REPORT_STYLES_DISPOSABLE_SENTINEL_VALUE",
  sentinelIdPattern: DISPOSABLE_SENTINEL_ID,
  sentinelValuePattern: DISPOSABLE_SENTINEL_VALUE,
  invalidMessage: "Report-style E2E database contract is invalid.",
  missingMessage: "Disposable report-style E2E database sentinel was not found.",
};

const REPORT_COMPARISON_LANE = {
  databaseKey: "E2E_REPORT_COMPARISON_DATABASE_URL",
  sentinelIdKey: "E2E_REPORT_COMPARISON_DISPOSABLE_SENTINEL_ID",
  sentinelValueKey: "E2E_REPORT_COMPARISON_DISPOSABLE_SENTINEL_VALUE",
  sentinelIdPattern: REPORT_COMPARISON_SENTINEL_ID,
  sentinelValuePattern: REPORT_COMPARISON_SENTINEL_VALUE,
  invalidMessage: "Report-comparison E2E database contract is invalid.",
  missingMessage: "Disposable report-comparison E2E database sentinel was not found.",
};

function invalidDatabaseContract() {
  return new Error("Report-style E2E database contract is invalid.");
}

function activeFixtureLane(env) {
  const style = Boolean(env.E2E_REPORT_STYLES_DATABASE_URL);
  const comparison = Boolean(env.E2E_REPORT_COMPARISON_DATABASE_URL);
  if (style && comparison) {
    throw new Error("Only one managed assessment report E2E fixture lane may be configured.");
  }
  if (comparison) return REPORT_COMPARISON_LANE;
  if (style) return REPORT_STYLE_LANE;
  return null;
}

function validateFixtureDatabaseEnvironment(env, lane) {
  const fixtureUrl = env[lane.databaseKey];
  const applicationUrl = env.DATABASE_URL;
  const sentinelId = env[lane.sentinelIdKey];
  const sentinelValue = env[lane.sentinelValueKey];
  if (
    !fixtureUrl
    || !applicationUrl
    || fixtureUrl !== applicationUrl
    || !sentinelId
    || !lane.sentinelIdPattern.test(sentinelId)
    || !sentinelValue
    || !lane.sentinelValuePattern.test(sentinelValue)
  ) throw new Error(lane.invalidMessage);
  return { databaseUrl: fixtureUrl, sentinelId, sentinelValue };
}

async function assertDisposableReportStyleDatabase({ env, createClient }) {
  return assertDisposableFixtureDatabase({ env, createClient, lane: REPORT_STYLE_LANE });
}

async function assertDisposableReportComparisonDatabase({ env, createClient }) {
  return assertDisposableFixtureDatabase({ env, createClient, lane: REPORT_COMPARISON_LANE });
}

async function assertDisposableFixtureDatabase({ env, createClient, lane }) {
  const { databaseUrl, sentinelId, sentinelValue } = validateFixtureDatabaseEnvironment(env, lane);
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
    throw new Error(lane.missingMessage);
  }
}

function childEnvironment(env) {
  const inherited = Object.fromEntries(
    Object.entries(env).filter((entry) => typeof entry[1] === "string"),
  );
  const lane = activeFixtureLane(env);
  inherited.DATABASE_URL = lane ? env[lane.databaseKey] || "" : "";
  return inherited;
}

function createAssessmentReportE2eWebServer(env) {
  if (env.PLAYWRIGHT_SKIP_WEBSERVER === "1") return undefined;

  // Report-style acceptance is opt-in. Do not impose its disposable fixture
  // contract on the repository's unrelated Playwright suites.
  if (!activeFixtureLane(env)) {
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

function createReportStyleWebServer(env) {
  return createAssessmentReportE2eWebServer(env);
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
  await runAssessmentReportE2eServer({ env, createClient, runBuild, startProductionServer });
}

async function runAssessmentReportE2eServer({
  env,
  createClient,
  runBuild,
  startProductionServer,
}) {
  const lane = activeFixtureLane(env);
  if (!lane) throw invalidDatabaseContract();
  await assertDisposableFixtureDatabase({ env, createClient, lane });
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
  createAssessmentReportE2eWebServer,
  assertDisposableReportComparisonDatabase,
  assertDisposableReportStyleDatabase,
  createReportStyleWebServer,
  expectedRaceReportStyle,
  productionServerCommands,
  runAssessmentReportE2eServer,
  runReportStyleE2eServer,
};
