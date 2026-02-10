import fs from "node:fs";
import path from "node:path";

interface HitlTask {
  scenario: string;
  task: string;
  startedAt: string;
  completedAt?: string;
  completed: boolean;
  notes?: string;
}

interface HitlSessionLog {
  sessionName?: string;
  sessionDate: string;
  evaluator: string;
  environment?: string;
  tasks: HitlTask[];
}

function parseArgs(argv: string[]) {
  let input = "";
  let output = "";

  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === "--input" && argv[i + 1]) {
      input = argv[i + 1];
      i += 1;
    } else if (argv[i] === "--output" && argv[i + 1]) {
      output = argv[i + 1];
      i += 1;
    }
  }

  return { input, output };
}

function toMs(value: string): number {
  const ms = Date.parse(value);
  if (Number.isNaN(ms)) {
    throw new Error(`Invalid date: ${value}`);
  }
  return ms;
}

function buildMarkdownReport(log: HitlSessionLog): string {
  const totalTasks = log.tasks.length;
  const completedTasks = log.tasks.filter((task) => task.completed).length;
  const completionRate =
    totalTasks > 0 ? ((completedTasks / totalTasks) * 100).toFixed(1) : "0.0";

  const completedDurations = log.tasks
    .filter((task) => task.completed && task.completedAt)
    .map((task) => Math.max(0, toMs(task.completedAt as string) - toMs(task.startedAt)));

  const totalDurationMs = completedDurations.reduce((sum, value) => sum + value, 0);
  const avgTaskDurationSeconds =
    completedDurations.length > 0
      ? Math.round(totalDurationMs / completedDurations.length / 1000)
      : 0;

  const scenarioStats = new Map<
    string,
    { total: number; completed: number; durationsMs: number[] }
  >();

  for (const task of log.tasks) {
    const entry = scenarioStats.get(task.scenario) || {
      total: 0,
      completed: 0,
      durationsMs: [],
    };
    entry.total += 1;

    if (task.completed && task.completedAt) {
      entry.completed += 1;
      entry.durationsMs.push(
        Math.max(0, toMs(task.completedAt) - toMs(task.startedAt))
      );
    }

    scenarioStats.set(task.scenario, entry);
  }

  const scenarioRows = Array.from(scenarioStats.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([scenario, stats]) => {
      const averageSeconds =
        stats.durationsMs.length > 0
          ? Math.round(
              stats.durationsMs.reduce((sum, value) => sum + value, 0) /
                stats.durationsMs.length /
                1000
            )
          : 0;
      const scenarioCompletion =
        stats.total > 0 ? ((stats.completed / stats.total) * 100).toFixed(1) : "0.0";

      return `| ${scenario} | ${stats.completed}/${stats.total} | ${scenarioCompletion}% | ${averageSeconds}s |`;
    })
    .join("\n");

  const taskRows = log.tasks
    .map((task) => {
      const durationSeconds =
        task.completed && task.completedAt
          ? Math.round((toMs(task.completedAt) - toMs(task.startedAt)) / 1000)
          : "-";
      return `| ${task.scenario} | ${task.task} | ${
        task.completed ? "Yes" : "No"
      } | ${durationSeconds} | ${task.notes || ""} |`;
    })
    .join("\n");

  return `# HITL Baseline Report

## Session Metadata
- Session: ${log.sessionName || "Unnamed HITL Session"}
- Date: ${log.sessionDate}
- Evaluator: ${log.evaluator}
- Environment: ${log.environment || "Not specified"}

## Summary Metrics
- Total tasks: ${totalTasks}
- Completed tasks: ${completedTasks}
- Task completion rate: ${completionRate}%
- Average completed task duration: ${avgTaskDurationSeconds}s

## Scenario Summary
| Scenario | Completed/Total | Completion Rate | Avg Duration |
|---|---:|---:|---:|
${scenarioRows || "| - | 0/0 | 0.0% | 0s |"}

## Task-Level Detail
| Scenario | Task | Completed | Duration (s) | Notes |
|---|---|---|---:|---|
${taskRows || "| - | - | - | - | - |"}
`;
}

function main() {
  const { input, output } = parseArgs(process.argv.slice(2));
  if (!input) {
    throw new Error("Missing required --input <path> argument");
  }

  const inputPath = path.resolve(process.cwd(), input);
  const raw = fs.readFileSync(inputPath, "utf-8");
  const log = JSON.parse(raw) as HitlSessionLog;

  if (!Array.isArray(log.tasks)) {
    throw new Error("Invalid input: tasks must be an array");
  }

  const markdown = buildMarkdownReport(log);

  if (output) {
    const outputPath = path.resolve(process.cwd(), output);
    fs.writeFileSync(outputPath, markdown, "utf-8");
    console.log(`HITL baseline report written to ${outputPath}`);
  } else {
    console.log(markdown);
  }
}

main();
