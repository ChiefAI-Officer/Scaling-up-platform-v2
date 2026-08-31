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
  type PromotionInput,
  type PromotionPlan,
} from "@/lib/scripts/promote-sunhub-quick-quiz-core";
import {
  applyPromotion,
  loadPromotionInput,
  quiescePromotion,
  type DbClient,
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
};

export type PromotionCliResult = {
  state: "ready-to-quiesce" | "waiting-for-drain" | "ready-to-apply" | "complete" | "quiesced" | "applied";
};

type CliInvocation = {
  args: PromotionArgs;
  operator?: string;
};

type CompletionCampaign = {
  id: string;
  templateId: string;
  versionId: string;
  language: string;
  alias: string;
  status: string;
  deletedAt: Date | string | null;
};

/** Parse the URL with the platform parser; never parse credentials by slicing. */
export function databaseHostFromUrl(databaseUrl: string | undefined): string {
  if (!databaseUrl) throw new Error("DATABASE_URL is required and must be supplied by the runtime environment.");

  let url: URL;
  try {
    url = new URL(databaseUrl);
  } catch {
    throw new Error("DATABASE_URL must be a valid PostgreSQL connection URL.");
  }
  if ((url.protocol !== "postgres:" && url.protocol !== "postgresql:") || url.hostname === "") {
    throw new Error("DATABASE_URL must be a PostgreSQL connection URL with a hostname.");
  }
  return url.hostname;
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
  if (!operator || operator.trim() === "") throw new Error("--operator must be a nonblank operator identity for every write.");
  return operator;
}

function shellQuote(value: string): string {
  return `'${value.replace(/'/g, "'\\\"'\\\"'")}'`;
}

function writeCommand(mode: "quiesce" | "apply", plan: PromotionPlan, host: string, operator?: string): string {
  const identity = operator === undefined ? OPERATOR_PLACEHOLDER : shellQuote(operator);
  return [
    COMMAND,
    `--${mode}`,
    "--i-know-this-is-prod",
    "--expect-database-host", host,
    "--expect-source-updated-at", plan.sourceCas.updatedAt,
    "--expect-submissions", String(plan.sourceCas.submissionCount),
    "--operator", identity,
  ].join(" ");
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

  lines.push("Source is CLOSED and has drained for at least 15 minutes. Run this exact apply command only after separate Production authorization:");
  lines.push(writeCommand("apply", plan, host, operator));
  return lines;
}

function completionMatches(input: PromotionInput, successor: CompletionCampaign | null): boolean {
  const source = input.sourceCampaign;
  return (
    source.id === SOURCE_CAMPAIGN_ID &&
    source.versionId === SOURCE_VERSION_ID &&
    source.alias === RETIRED_ALIAS &&
    source.status === "CLOSED" &&
    source.deletedAt === null &&
    successor?.id === SUCCESSOR_CAMPAIGN_ID &&
    successor.templateId === source.templateId &&
    successor.versionId === TARGET_VERSION_ID &&
    successor.language === source.language &&
    successor.alias === LIVE_ALIAS &&
    successor.status === "ACTIVE" &&
    successor.deletedAt === null
  );
}

async function loadCompletionSuccessor(db: DbClient): Promise<CompletionCampaign | null> {
  return db.assessmentCampaign.findUnique({
    where: { id: SUCCESSOR_CAMPAIGN_ID },
    select: {
      id: true,
      templateId: true,
      versionId: true,
      language: true,
      alias: true,
      status: true,
      deletedAt: true,
    },
  }) as Promise<CompletionCampaign | null>;
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
    const successor = await loadCompletionSuccessor(db);
    if (completionMatches(input, successor)) {
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

    const result = await applyPromotion(db, plan, operator);
    output(write, [`Apply ${result.status}; successor campaign: ${result.successorCampaignId}.`]);
    return { state: "applied" };
  } finally {
    await dependencies.disconnect?.(db);
  }
}

async function main(): Promise<void> {
  const { PrismaClient } = await import("@prisma/client");
  const prisma = new PrismaClient();
  await runPromotionCli(process.argv.slice(2), {
    createDb: () => prisma as unknown as DbClient,
    databaseUrl: process.env.DATABASE_URL,
    disconnect: async () => prisma.$disconnect(),
  });
}

if (require.main === module) {
  void main().catch((error: unknown) => {
    const message = error instanceof Error ? error.message : "Unknown promotion failure.";
    process.stderr.write(`SunHub quick-quiz promotion failed: ${message}\n`);
    process.exitCode = 1;
  });
}
