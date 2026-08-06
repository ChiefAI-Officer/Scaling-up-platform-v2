import { spawn } from "node:child_process";
import { PrismaClient } from "@prisma/client";
import reportStyleE2eContract from "./report-style-e2e-server-contract.cjs";
import { provisionReportComparisonFixture } from "./provision-report-comparison-e2e.mjs";

const { productionServerCommands, runAssessmentReportE2eServer } = reportStyleE2eContract;

function runCommand(command, args, env, { inheritOutput = false, forwardSignals = false } = {}) {
  return new Promise((resolveCommand, rejectCommand) => {
    const child = spawn(command, args, {
      env,
      stdio: inheritOutput ? "inherit" : "ignore",
    });
    const forward = (signal) => child.kill(signal);
    const signals = ["SIGINT", "SIGTERM"];

    if (forwardSignals) {
      for (const signal of signals) process.on(signal, forward);
    }

    child.once("error", () => rejectCommand(new Error("Report-style E2E command failed to start.")));
    child.once("exit", (code, signal) => {
      if (forwardSignals) {
        for (const forwardedSignal of signals) process.off(forwardedSignal, forward);
      }
      if (code === 0 || signal) resolveCommand();
      else rejectCommand(new Error("Report-style E2E command failed."));
    });
  });
}

const commands = productionServerCommands({
  cwd: process.cwd(),
  execPath: process.execPath,
  platform: process.platform,
});

try {
  if (process.env.E2E_REPORT_COMPARISON_DATABASE_URL) {
    const fixture = await provisionReportComparisonFixture({
      env: process.env,
      createClient: (databaseUrl) => new PrismaClient({ datasourceUrl: databaseUrl, log: [] }),
    });
    process.env.ADMIN_EMAIL = fixture.adminEmail;
    process.env.WAVE_RC_REPORT_COMPARISON_ENABLED = "1";
  }
  await runAssessmentReportE2eServer({
    env: process.env,
    createClient: (databaseUrl) => new PrismaClient({ datasourceUrl: databaseUrl, log: [] }),
    runBuild: (env) => runCommand(commands.build.command, commands.build.args, env),
    startProductionServer: (env) => runCommand(
      commands.start.command,
      commands.start.args,
      env,
      { inheritOutput: true, forwardSignals: true },
    ),
  });
} catch {
  console.error("Assessment report E2E server startup was refused.");
  process.exitCode = 1;
}
