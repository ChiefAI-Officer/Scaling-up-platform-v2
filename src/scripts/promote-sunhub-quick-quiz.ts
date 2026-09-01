/**
 * Guarded two-phase successor operation for the SunHub quick quiz.
 *
 * The default invocation is a read-only dry-run. This file deliberately does
 * not load dotenv: the operator supplies credentials through the runtime,
 * e.g. `npx tsx --env-file=/absolute/path/.env scripts/...`.
 *
 * `require.main === module` is the established executable guard for this
 * CommonJS-compatible tsx script. All Prisma construction remains inside
 * `main`, so importing the formatter or injected runner in CI never connects.
 */

import {
  DRAIN_WINDOW_MS,
  LIVE_ALIAS,
  RETIRED_ALIAS,
  SOURCE_CAMPAIGN_ID,
  SOURCE_VERSION_ID,
  SUCCESSOR_CAMPAIGN_ID,
  TARGET_VERSION_ID,
  buildPromotionPlan,
  parsePromotionArgs,
  validateWriteAuthorization,
  type PromotionArgs,
  type PromotionPlan,
} from "@/lib/scripts/promote-sunhub-quick-quiz-core";
import {
  applyPromotion,
  inspectCompletedPromotion,
  loadPromotionInput,
  quiescePromotion,
  type DbClient,
  type PromotionJsonDatabaseNull,
} from "@/lib/scripts/promote-sunhub-quick-quiz-runner";

const COMMAND = "npx tsx scripts/promote-sunhub-quick-quiz.ts";
const OPERATOR_PLACEHOLDER = "<REQUIRED_NONBLANK_OPERATOR_IDENTITY>";

export type PromotionCliDependencies = {
  /** Constructed only after parsing and every write guard has passed. */
  createDb: () => DbClient | Promise<DbClient>;
  /** Explicit runtime credential input; this module never loads an env file. */
  databaseUrl: string | undefined;
  now?: () => Date;
  write?: (line: string) => void;
  disconnect?: (db: DbClient) => Promise<void>;
  /** Resolved lazily only on apply; the runner has no runtime Prisma import. */
  getJsonDatabaseNull?: () => PromotionJsonDatabaseNull | Promise<PromotionJsonDatabaseNull>;
};

export type PromotionCliResult = {
  state: "ready-to-quiesce" | "waiting-for-drain" | "ready-to-apply" | "complete" | "quiesced" | "applied";
};

type CliInvocation = {
  args: PromotionArgs;
  operator?: string;
};

/** Parse the URL with the platform parser; never parse credentials by slicing. */
export function databaseHostFromUrl(databaseUrl: string | undefined): string {
  if (!databaseUrl) throw new Error("DATABASE_URL is required and must be supplied by the runtime environment.");

  let url: URL;
  try {
    url = new URL(databaseUrl);
  } catch {
    throw new Error("DATABASE_URL hostname must be a valid conservative DNS hostname.");
  }
  if ((url.protocol !== "postgres:" && url.protocol !== "postgresql:") || url.hostname === "") {
    throw new Error("DATABASE_URL hostname must be a valid conservative DNS hostname.");
  }
  const hostname = url.hostname;
  const label = "[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?";
  const conservativeDnsHostname = new RegExp(`^(?=.{1,253}$)(?:${label})(?:\\.${label})*$`, "i");
  if (!conservativeDnsHostname.test(hostname)) {
    throw new Error("DATABASE_URL hostname must be a valid conservative DNS hostname.");
  }
  return hostname;
}

/** Separate the CLI-only operator identity before the pure core parses its flags. */
export function parsePromotionCliArgs(argv: string[]): CliInvocation {
  const promotionArgv: string[] = [];
  let operator: string | undefined;

  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];
    if (value !== "--operator") {
      promotionArgv.push(value);
      continue;
    }
    if (operator !== undefined) throw new Error("--operator must be specified at most once.");
    const identity = argv[index + 1];
    if (!identity || identity.startsWith("--")) throw new Error("--operator requires a nonblank value.");
    operator = identity;
    index += 1;
  }

  return { args: parsePromotionArgs(promotionArgv), ...(operator === undefined ? {} : { operator }) };
}

function requireOperator(operator: string | undefined): string {
  if (!operator || operator.trim() === "" || operator === OPERATOR_PLACEHOLDER) {
    throw new Error("--operator must be a nonblank operator identity for every write.");
  }
  return operator;
}

function shellQuote(value: string): string {
  return `'${value.replace(/'/g, "'\"'\"'")}'`;
}

function writeCommand(mode: "quiesce" | "apply", plan: PromotionPlan, host: string, operator?: string): string {
  const identity = requireOperator(operator);
  return [
    COMMAND,
    `--${mode}`,
    "--i-know-this-is-prod",
    "--expect-database-host", shellQuote(host),
    "--expect-source-updated-at", shellQuote(plan.sourceCas.updatedAt),
    "--expect-submissions", shellQuote(String(plan.sourceCas.submissionCount)),
    "--operator", shellQuote(identity),
  ].join(" ");
}

function readOnlyRerunCommand(): string {
  return `${COMMAND} --dry-run --operator ${shellQuote(OPERATOR_PLACEHOLDER)}`;
}

/** Format the fully verified dry-run state without doing any I/O. */
export function formatPromotionOutcome(plan: PromotionPlan, host: string, now: Date, operator?: string): string[] {
  const lines = [
    "SunHub quick-quiz successor promotion: verified read-only dry-run.",
    `Connected database host: ${host}`,
    `Source campaign: ${plan.sourceCas.id} (${plan.sourceCas.status}, ${plan.sourceCas.alias}, ${plan.sourceCas.versionId}).`,
    `Target version: ${TARGET_VERSION_ID}; verified submission count: ${plan.sourceCas.submissionCount}.`,
    `Verified source updatedAt: ${plan.sourceCas.updatedAt}.`,
  ];

  if (plan.sourceCas.status === "ACTIVE") {
    if (!operator || operator.trim() === "" || operator === OPERATOR_PLACEHOLDER) {
      lines.push("Source is ACTIVE. A truthful complete write command requires a real operator identity. Re-run this read-only command after replacing the quoted placeholder:");
      lines.push(readOnlyRerunCommand());
      return lines;
    }
    lines.push("Source is ACTIVE. Run this exact quiesce command only after separate Production authorization:");
    lines.push(writeCommand("quiesce", plan, host, operator));
    return lines;
  }

  const drainedAt = new Date(plan.sourceCas.updatedAt).getTime() + DRAIN_WINDOW_MS;
  const remainingMs = drainedAt - now.getTime();
  if (remainingMs > 0) {
    lines.push(`Source is CLOSED. Wait ${Math.ceil(remainingMs / 1_000)} more seconds before re-running this dry-run; no apply command is available yet.`);
    return lines;
  }

  if (!operator || operator.trim() === "" || operator === OPERATOR_PLACEHOLDER) {
    lines.push("Source is CLOSED and drained. A truthful complete write command requires a real operator identity. Re-run this read-only command after replacing the quoted placeholder:");
    lines.push(readOnlyRerunCommand());
    return lines;
  }
  lines.push("Source is CLOSED and has drained for at least 15 minutes. Run this exact apply command only after separate Production authorization:");
  lines.push(writeCommand("apply", plan, host, operator));
  return lines;
}

function output(write: (line: string) => void, lines: string[]): void {
  for (const line of lines) write(line);
}

/**
 * Execute the operator-facing flow through injected dependencies. Dry-run only
 * uses loader reads; the two runner write functions are unreachable until
 * parsing, acknowledgement, exact URL-host, and nonblank-operator guards pass.
 */
export async function runPromotionCli(
  argv: string[],
  dependencies: PromotionCliDependencies,
): Promise<PromotionCliResult> {
  const invocation = parsePromotionCliArgs(argv);
  const host = databaseHostFromUrl(dependencies.databaseUrl);
  if (invocation.args.mode !== "dry-run") {
    validateWriteAuthorization(invocation.args, host);
    requireOperator(invocation.operator);
  }

  const db = await dependencies.createDb();
  const write = dependencies.write ?? ((line: string) => process.stdout.write(`${line}\n`));
  const now = dependencies.now?.() ?? new Date();
  try {
    const input = await loadPromotionInput(db, { args: invocation.args, now });
    const completion = await inspectCompletedPromotion(db, input);
    if (completion) {
      output(write, [
        "SunHub quick-quiz successor promotion is complete.",
        `Retired source: ${SOURCE_CAMPAIGN_ID} (${SOURCE_VERSION_ID}, CLOSED, ${RETIRED_ALIAS}).`,
        `Active successor: ${SUCCESSOR_CAMPAIGN_ID} (${TARGET_VERSION_ID}, ACTIVE, ${LIVE_ALIAS}).`,
      ]);
      return { state: "complete" };
    }

    const plan = buildPromotionPlan(input);
    if (plan.mode === "dry-run") {
      output(write, formatPromotionOutcome(plan, host, now, invocation.operator));
      if (plan.sourceCas.status === "ACTIVE") return { state: "ready-to-quiesce" };
      if (now.getTime() - new Date(plan.sourceCas.updatedAt).getTime() < DRAIN_WINDOW_MS) {
        return { state: "waiting-for-drain" };
      }
      return { state: "ready-to-apply" };
    }

    const operator = requireOperator(invocation.operator);
    if (plan.mode === "quiesce") {
      const result = await quiescePromotion(db, plan, operator);
      output(write, [`Quiesce ${result.status}. Re-run the read-only dry-run after the 15-minute drain.`]);
      return { state: "quiesced" };
    }

    if (!dependencies.getJsonDatabaseNull) {
      throw new Error("A database JSON-null sentinel is required for apply.");
    }
    const result = await applyPromotion(
      db,
      plan,
      operator,
      await dependencies.getJsonDatabaseNull(),
    );
    output(write, [`Apply ${result.status}; successor campaign: ${result.successorCampaignId}.`]);
    return { state: "applied" };
  } finally {
    await dependencies.disconnect?.(db);
  }
}

async function main(): Promise<void> {
  let prisma: { $disconnect(): Promise<void> } | undefined;
  let databaseJsonNull: PromotionJsonDatabaseNull | undefined;
  await runPromotionCli(process.argv.slice(2), {
    createDb: async () => {
      const { Prisma, PrismaClient } = await import("@prisma/client");
      prisma = new PrismaClient();
      databaseJsonNull = Prisma.DbNull;
      return prisma as unknown as DbClient;
    },
    databaseUrl: process.env.DATABASE_URL,
    disconnect: async () => prisma?.$disconnect(),
    getJsonDatabaseNull: () => {
      if (!databaseJsonNull) {
        throw new Error("Database JSON-null sentinel was requested before client construction.");
      }
      return databaseJsonNull;
    },
  });
}

if (require.main === module) {
  void main().catch((error: unknown) => {
    const message = error instanceof Error ? error.message : "Unknown promotion failure.";
    process.stderr.write(`SunHub quick-quiz promotion failed: ${message}\n`);
    process.exitCode = 1;
  });
}
