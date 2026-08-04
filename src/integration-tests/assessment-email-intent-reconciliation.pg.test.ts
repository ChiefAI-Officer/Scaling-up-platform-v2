/**
 * Real PostgreSQL proofs for the assessment-email delivery-intent ledger.
 *
 * These tests intentionally do not run against the normal Jest database. They
 * create one random schema inside an explicitly supplied TEST_DATABASE_URL,
 * reproduce only the mapped pre-migration tables used by reconciliation, and
 * apply the exact checked-in intent migration. Every state transition then
 * runs through the production reconciler with real Prisma transactions and
 * real PostgreSQL raw-query values.
 *
 * Safety contract (shared with the other PostgreSQL integration suites):
 * - TEST_DATABASE_URL must be explicitly supplied;
 * - ASSESSMENT_EMAIL_LEASE_TEST_ALLOW must equal "isolated-schema"; and
 * - TEST_DATABASE_URL must differ from DATABASE_URL.
 */

import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import { Prisma, PrismaClient } from "@prisma/client";
import {
  INTENT_RENDERER_CONTRACT_VERSION,
  INTENT_SNAPSHOT_SCHEMA_VERSION,
  assessmentEmailIntentPayloadHash,
  type AuthorizationSnapshotV1,
  type ContentProvenanceV1,
} from "../src/lib/assessments/assessment-email-delivery-intents";
import type { ReconcilerDeps } from "../src/lib/assessments/assessment-email-intent-reconciler";
import {
  issueIntentReviewToken,
  verifyIntentReviewToken,
} from "../src/lib/assessments/assessment-email-intent-review-token";
import type { OperatorDeps } from "../src/lib/assessments/assessment-email-intent-operator";
import { resultsEmailContentHash } from "../src/lib/assessments/results-email-approval";

// The real reconciler imports @/lib/db for its production dependency factory.
// This suite injects both real schema-scoped clients itself, so that singleton
// is intentionally unused. The lazy factory also makes an import-before-safety-
// validation regression fail with a test-specific error before lib/db can
// construct a client from DATABASE_URL.
jest.mock("@/lib/db", () => {
  if (
    !process.env.TEST_DATABASE_URL ||
    process.env.ASSESSMENT_EMAIL_LEASE_TEST_ALLOW !== "isolated-schema" ||
    process.env.TEST_DATABASE_URL === process.env.DATABASE_URL
  ) {
    throw new Error(
      "Unsafe reconciler import before PostgreSQL test validation",
    );
  }
  return { db: {} };
});

type ReconcilerModule =
  typeof import("../src/lib/assessments/assessment-email-intent-reconciler");
let reconcileAssessmentEmailIntents: ReconcilerModule["reconcileAssessmentEmailIntents"];
let productionAssessmentEmailIntentReconcilerDeps: ReconcilerModule["productionAssessmentEmailIntentReconcilerDeps"];
type OperatorModule =
  typeof import("../src/lib/assessments/assessment-email-intent-operator");
let loadHeldIntentDetail: OperatorModule["loadHeldIntentDetail"];
let releaseHeldIntent: OperatorModule["releaseHeldIntent"];
type HeldIntentDetail = Awaited<
  ReturnType<OperatorModule["loadHeldIntentDetail"]>
>;

function requireReleaseDetail(
  detail: HeldIntentDetail,
): Extract<HeldIntentDetail, { kind: "RELEASE_OR_CANCEL" }> {
  expect(detail.kind).toBe("RELEASE_OR_CANCEL");
  if (detail.kind !== "RELEASE_OR_CANCEL") {
    throw new Error(`Expected releasable detail, received ${detail.kind}.`);
  }
  return detail;
}

const destructiveOptIn =
  process.env.ASSESSMENT_EMAIL_LEASE_TEST_ALLOW === "isolated-schema";
const testDatabaseUrl = process.env.TEST_DATABASE_URL;
const schemaName =
  `assessment_email_intent_${randomUUID().replaceAll("-", "")}`;
const intentMigrationPath = path.resolve(
  process.cwd(),
  "prisma/migrations/20260803140000_add_assessment_email_delivery_intents/migration.sql",
);

const dueAt = new Date("2000-01-01T00:00:00.000Z");
const expiresAt = new Date("2099-01-01T00:00:00.000Z");
const reconcileNow = new Date("2026-08-03T05:00:00.000Z");
const invitationExpiresAt = new Date("2099-01-01T00:00:00.000Z");
const resultsSubject = "Your assessment results";
const resultsMarkdown = "Your frozen assessment result is ready.";
const approvedContentHash = resultsEmailContentHash(
  resultsSubject,
  resultsMarkdown,
);
const phase2Fingerprint = "a".repeat(64);
const operatorReviewTokenSecret =
  "postgres-operator-review-token-secret-at-least-32-characters";

function scopedDatabaseUrl(baseUrl: string): string {
  const url = new URL(baseUrl);
  url.searchParams.set("schema", schemaName);
  return url.toString();
}

type Deferred<T> = {
  promise: Promise<T>;
  resolve(value: T): void;
  reject(error: unknown): void;
};

function deferred<T>(): Deferred<T> {
  let resolvePromise!: (value: T) => void;
  let rejectPromise!: (error: unknown) => void;
  let settled = false;
  const promise = new Promise<T>((resolve, reject) => {
    resolvePromise = resolve;
    rejectPromise = reject;
  });
  return {
    promise,
    resolve: (value) => {
      if (settled) return;
      settled = true;
      resolvePromise(value);
    },
    reject: (error) => {
      if (settled) return;
      settled = true;
      rejectPromise(error);
    },
  };
}

async function bounded<T>(
  operation: Promise<T>,
  label: string,
  timeoutMs = 15_000,
): Promise<T> {
  let timeout: ReturnType<typeof setTimeout> | undefined;
  const guard = new Promise<never>((_, reject) => {
    timeout = setTimeout(
      () => reject(new Error(`Timed out waiting for ${label}`)),
      timeoutMs,
    );
  });
  try {
    return await Promise.race([operation, guard]);
  } finally {
    if (timeout) clearTimeout(timeout);
  }
}

type ReconcilerTestOptions = {
  paused?: boolean;
  isolationLevel?: Prisma.TransactionIsolationLevel;
  beforeTransactionWork?: (tx: Prisma.TransactionClient) => Promise<void>;
  beforeAuthorizationLoad?: () => Promise<void>;
  onTransactionStarted?: (pid: number) => void;
  observeQuery?: (query: Prisma.Sql) => void;
};

function observedTransaction(
  tx: Prisma.TransactionClient,
  observeQuery: ((query: Prisma.Sql) => void) | undefined,
): Prisma.TransactionClient {
  if (!observeQuery) return tx;
  return new Proxy(tx, {
    get(target, property) {
      if (property === "$queryRaw") {
        return (query: Prisma.Sql) => {
          observeQuery(query);
          return target.$queryRaw(query);
        };
      }
      const value = Reflect.get(target, property, target);
      return typeof value === "function" ? value.bind(target) : value;
    },
  });
}

function reconcilerDeps(
  client: PrismaClient,
  options: ReconcilerTestOptions = {},
): ReconcilerDeps {
  const production = productionAssessmentEmailIntentReconcilerDeps();
  return {
    now: () => reconcileNow,
    isPaused: () => options.paused ?? false,
    logger: {
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
    },
    prisma: client as unknown as ReconcilerDeps["prisma"],
    loadCurrentAuthorizationFacts: async (tx, intent, snapshot) => {
      await options.beforeAuthorizationLoad?.();
      return production.loadCurrentAuthorizationFacts(tx, intent, snapshot);
    },
    runOneTransaction: (work) =>
      client.$transaction(
        async (tx) => {
          const pidRows = await tx.$queryRaw<Array<{ pid: number }>>(
            Prisma.sql`SELECT pg_backend_pid()::int AS "pid"`,
          );
          options.onTransactionStarted?.(pidRows[0].pid);
          await options.beforeTransactionWork?.(tx);
          return work(
            observedTransaction(tx, options.observeQuery) as never,
          );
        },
        {
          timeout: 15_000,
          ...(options.isolationLevel
            ? { isolationLevel: options.isolationLevel }
            : {}),
        },
      ),
  };
}

type OperatorTestOptions = {
  paused?: boolean;
  beforeTransactionWork?: (tx: Prisma.TransactionClient) => Promise<void>;
  beforeAuthorizationLoad?: () => Promise<void>;
  onTransactionStarted?: (pid: number) => void;
  observeQuery?: (query: Prisma.Sql) => void;
};

function operatorDeps(
  client: PrismaClient,
  options: OperatorTestOptions = {},
): OperatorDeps {
  const production = productionAssessmentEmailIntentReconcilerDeps();
  return {
    now: () => reconcileNow,
    isPaused: () => options.paused ?? false,
    runTransaction: (work, transactionOptions) =>
      client.$transaction(
        async (tx) => {
          options.onTransactionStarted?.(await backendPid(tx));
          await options.beforeTransactionWork?.(tx);
          return work(
            observedTransaction(tx, options.observeQuery) as never,
          );
        },
        {
          timeout: transactionOptions.timeout,
          ...(transactionOptions.isolationLevel
            ? { isolationLevel: transactionOptions.isolationLevel }
            : {}),
        },
      ),
    loadCurrentAuthorizationFacts: async (tx, intent, snapshot) => {
      await options.beforeAuthorizationLoad?.();
      return production.loadCurrentAuthorizationFacts(
        tx as never,
        intent as never,
        snapshot,
      );
    },
    reviewTokens: {
      issue: (claims, now) =>
        issueIntentReviewToken(claims, {
          now,
          secret: operatorReviewTokenSecret,
        }),
      verify: (token, expected, now) =>
        verifyIntentReviewToken(token, expected, {
          now,
          secret: operatorReviewTokenSecret,
        }),
    },
  };
}

function sqlText(query: Prisma.Sql): string {
  return query.strings.join(" ");
}

type IntentRole = "RESPONDENT" | "OWNING_COACH";

function authorizationSnapshot(role: IntentRole): AuthorizationSnapshotV1 {
  const common = {
    campaignId: "campaign-1",
    invitationId: "invitation-1",
    respondentId: "respondent-1",
    templateId: "template-1",
    templateAlias: "rockefeller-habits",
    versionId: "version-1",
    accessMode: "INVITED" as const,
    campaignStatus: "ACTIVE",
    campaignDeleted: false,
    invitationStatus: "SUBMITTED" as const,
    invitationRevoked: false,
    closeAt: null,
    invitationExpiresAt: invitationExpiresAt.toISOString(),
    recipientRole: role,
    emailType:
      role === "RESPONDENT"
        ? ("ASSESSMENT_RESULTS" as const)
        : ("COACH_COMPLETION" as const),
    phase2Fingerprint,
  };

  return role === "RESPONDENT"
    ? {
        schemaVersion: 1,
        common,
        respondentResults: {
          canonicalRecipientMailbox: "respondent@example.com",
          sendResultsToRespondent: true,
          featureKey: "WAVE_D_RESULTS_EMAIL_ENABLED",
          featureEnabled: true,
          approved: true,
          approvedContentHash,
        },
      }
    : {
        schemaVersion: 1,
        common,
        coachCompletion: {
          canonicalRecipientMailbox: "coach@example.com",
          notifyCoachOnCompletion: true,
          featureKey: "WAVE_D_COACH_NOTIFY_ENABLED",
          featureEnabled: true,
          coachId: "coach-1",
        },
      };
}

function contentProvenance(role: IntentRole): ContentProvenanceV1 {
  return {
    schemaVersion: 1,
    templateId: "template-1",
    versionId: "version-1",
    templateAlias: "rockefeller-habits",
    reportType:
      role === "RESPONDENT" ? "RESPONDENT_RESULTS" : "COACH_COMPLETION",
    approvalHash: role === "RESPONDENT" ? approvedContentHash : null,
    rendererContractVersion: 1,
    sourceCommit: "postgres-integration-proof",
    renderInputHash: "b".repeat(64),
  };
}

function frozenPayload(role: IntentRole): {
  recipientEmail: string;
  recipientRole: IntentRole;
  emailType: "ASSESSMENT_RESULTS" | "COACH_COMPLETION";
  subject: string;
  bodyHtml: string;
  payloadHash: string;
} {
  const recipientEmail =
    role === "RESPONDENT"
      ? "respondent@example.com"
      : "coach@example.com";
  const emailType =
    role === "RESPONDENT"
      ? ("ASSESSMENT_RESULTS" as const)
      : ("COACH_COMPLETION" as const);
  const subject =
    role === "RESPONDENT"
      ? "Frozen respondent result"
      : "Frozen coach completion";
  const bodyHtml =
    role === "RESPONDENT"
      ? "<p>Exact respondent bytes</p>"
      : "<p>Exact coach bytes</p>";
  return {
    recipientEmail,
    recipientRole: role,
    emailType,
    subject,
    bodyHtml,
    payloadHash: assessmentEmailIntentPayloadHash({
      snapshotSchemaVersion: INTENT_SNAPSHOT_SCHEMA_VERSION,
      recipientRole: role,
      emailType,
      recipientEmail,
      subject,
      bodyHtml,
    }),
  };
}

type SeedGraphOptions = {
  includeSubmission?: boolean;
  invitationStatus?: "PENDING" | "SUBMITTED";
};

async function seedAuthorizationGraph(
  db: PrismaClient,
  options: SeedGraphOptions = {},
): Promise<void> {
  const invitationStatus = options.invitationStatus ?? "SUBMITTED";
  await db.$executeRaw(Prisma.sql`
    INSERT INTO "coaches" ("id", "email")
    VALUES ('coach-1', 'coach@example.com')
  `);
  await db.$executeRaw(Prisma.sql`
    INSERT INTO "org_respondents" ("id", "email")
    VALUES ('respondent-1', 'respondent@example.com')
  `);
  await db.$executeRaw(Prisma.sql`
    INSERT INTO "assessment_templates" (
      "id", "alias", "resultsEmailContentApproved",
      "resultsEmailContentApprovedHash", "resultsEmailSubject",
      "resultsEmailBodyMarkdown"
    ) VALUES (
      'template-1', 'rockefeller-habits', true,
      ${approvedContentHash}, ${resultsSubject}, ${resultsMarkdown}
    )
  `);
  await db.$executeRaw(Prisma.sql`
    INSERT INTO "assessment_template_versions" ("id", "templateId")
    VALUES ('version-1', 'template-1')
  `);
  await db.$executeRaw(Prisma.sql`
    INSERT INTO "assessment_campaigns" (
      "id", "templateId", "versionId", "accessMode", "status",
      "deletedAt", "closeAt", "sendResultsToRespondent",
      "notifyCoachOnCompletion", "createdByCoachId"
    ) VALUES (
      'campaign-1', 'template-1', 'version-1', 'INVITED', 'ACTIVE',
      NULL, NULL, true, true, 'coach-1'
    )
  `);
  await db.$executeRaw(Prisma.sql`
    INSERT INTO "assessment_invitations" (
      "id", "campaignId", "respondentId", "status", "revokedAt",
      "expiresAt", "submittedAt"
    ) VALUES (
      'invitation-1', 'campaign-1', 'respondent-1',
      ${invitationStatus}, NULL, ${invitationExpiresAt},
      ${invitationStatus === "SUBMITTED" ? reconcileNow : null}
    )
  `);

  if (options.includeSubmission ?? true) {
    await db.$executeRaw(Prisma.sql`
      INSERT INTO "assessment_submissions" (
        "id", "campaignId", "respondentId", "invitationId",
        "answers", "result"
      ) VALUES (
        'submission-1', 'campaign-1', 'respondent-1', 'invitation-1',
        '[]'::jsonb, '{}'::jsonb
      )
    `);
  }
}

type SeedIntentOptions = {
  id?: string;
  role?: IntentRole;
  status?: "PENDING" | "HELD";
  intentExpiresAt?: Date;
  nextAttemptAt?: Date;
  attempts?: number;
};

async function seedIntent(
  db: PrismaClient,
  options: SeedIntentOptions = {},
): Promise<void> {
  const role = options.role ?? "RESPONDENT";
  const payload = frozenPayload(role);
  await db.assessmentEmailDeliveryIntent.create({
    data: {
      id: options.id ?? "intent-1",
      submissionId: "submission-1",
      campaignId: "campaign-1",
      invitationId: "invitation-1",
      respondentId: "respondent-1",
      ...payload,
      snapshotSchemaVersion: INTENT_SNAPSHOT_SCHEMA_VERSION,
      rendererContractVersion: INTENT_RENDERER_CONTRACT_VERSION,
      authorizationSnapshot:
        authorizationSnapshot(role) as unknown as Prisma.InputJsonValue,
      contentProvenance:
        contentProvenance(role) as unknown as Prisma.InputJsonValue,
      status: options.status ?? "PENDING",
      attempts: options.attempts ?? 0,
      nextAttemptAt: options.nextAttemptAt ?? dueAt,
      expiresAt: options.intentExpiresAt ?? expiresAt,
    },
    select: { id: true },
  });
}

async function seedOutbox(
  db: PrismaClient,
  status: "PENDING" | "SENDING" | "SENT" | "FAILED" | "CANCELLED",
  role: IntentRole = "RESPONDENT",
): Promise<string> {
  const payload = frozenPayload(role);
  const row = await db.assessmentEmailOutbox.create({
    data: {
      id: `outbox-${status.toLowerCase()}-${role.toLowerCase()}`,
      submissionId: "submission-1",
      recipientEmail: payload.recipientEmail,
      recipientRole: role,
      emailType: payload.emailType,
      subject: payload.subject,
      bodyHtml: payload.bodyHtml,
      status,
      authorizationProvenance:
        authorizationSnapshot(role) as unknown as Prisma.InputJsonValue,
      contentProvenance:
        contentProvenance(role) as unknown as Prisma.InputJsonValue,
    },
    select: { id: true },
  });
  return row.id;
}

async function readIntent(
  db: PrismaClient,
  id = "intent-1",
): Promise<Record<string, unknown>> {
  const rows = await db.$queryRaw<Array<Record<string, unknown>>>(Prisma.sql`
    SELECT *
    FROM "assessment_email_delivery_intents"
    WHERE "id" = ${id}
  `);
  if (!rows[0]) throw new Error(`Missing intent ${id}`);
  return rows[0];
}

async function countOutboxRows(
  db: PrismaClient,
  submissionId: string,
  recipientRole: string,
): Promise<number> {
  const rows = await db.$queryRaw<Array<{ count: number }>>(Prisma.sql`
    SELECT COUNT(*)::int AS "count"
    FROM "assessment_email_outbox"
    WHERE "submissionId" = ${submissionId}
      AND "recipientRole" = ${recipientRole}
  `);
  return rows[0].count;
}

async function countIntentAudits(
  db: PrismaClient,
  intentId: string,
  action: string,
): Promise<number> {
  const rows = await db.$queryRaw<Array<{ count: number }>>(Prisma.sql`
    SELECT COUNT(*)::int AS "count"
    FROM "audit_logs"
    WHERE "entityId" = ${intentId}
      AND "action" = ${action}
  `);
  return rows[0].count;
}

async function backendPid(db: Prisma.TransactionClient): Promise<number> {
  const rows = await db.$queryRaw<Array<{ pid: number }>>(
    Prisma.sql`SELECT pg_backend_pid()::int AS "pid"`,
  );
  return rows[0].pid;
}

async function waitForBackendLock(
  admin: PrismaClient,
  pid: number,
): Promise<void> {
  await bounded(
    (async () => {
      while (true) {
        const rows = await admin.$queryRaw<Array<{ blocked: boolean }>>(
          Prisma.sql`
            SELECT EXISTS (
              SELECT 1
              FROM pg_stat_activity
              WHERE "pid" = ${pid}
                AND "wait_event_type" = 'Lock'
            ) AS "blocked"
          `,
        );
        if (rows[0].blocked) return;
        await new Promise<void>((resolve) => setImmediate(resolve));
      }
    })(),
    `backend ${pid} to wait on a PostgreSQL lock`,
    5_000,
  );
}

describe("assessment email intent reconciliation on PostgreSQL", () => {
  let admin: PrismaClient;
  let eventDb: PrismaClient;
  let cronDb: PrismaClient;
  let originalResultsFlag: string | undefined;
  let originalCoachFlag: string | undefined;

  beforeAll(async () => {
    if (!testDatabaseUrl || !destructiveOptIn) {
      throw new Error(
        "Set TEST_DATABASE_URL and ASSESSMENT_EMAIL_LEASE_TEST_ALLOW=isolated-schema",
      );
    }
    if (testDatabaseUrl === process.env.DATABASE_URL) {
      throw new Error("TEST_DATABASE_URL must not equal DATABASE_URL");
    }

    // Import only after every destructive-safety precondition has passed.
    // @/lib/db is stubbed above because this suite supplies the two real,
    // isolated-schema clients through the reconciler's public dependency seam.
    const reconcilerModule =
      await import("../src/lib/assessments/assessment-email-intent-reconciler");
    reconcileAssessmentEmailIntents =
      reconcilerModule.reconcileAssessmentEmailIntents;
    productionAssessmentEmailIntentReconcilerDeps =
      reconcilerModule.productionAssessmentEmailIntentReconcilerDeps;
    const operatorModule =
      await import("../src/lib/assessments/assessment-email-intent-operator");
    loadHeldIntentDetail = operatorModule.loadHeldIntentDetail;
    releaseHeldIntent = operatorModule.releaseHeldIntent;

    originalResultsFlag = process.env.WAVE_D_RESULTS_EMAIL_ENABLED;
    originalCoachFlag = process.env.WAVE_D_COACH_NOTIFY_ENABLED;
    process.env.WAVE_D_RESULTS_EMAIL_ENABLED = "true";
    process.env.WAVE_D_COACH_NOTIFY_ENABLED = "true";

    admin = new PrismaClient({
      datasources: { db: { url: testDatabaseUrl } },
    });
    eventDb = new PrismaClient({
      datasources: { db: { url: scopedDatabaseUrl(testDatabaseUrl) } },
    });
    cronDb = new PrismaClient({
      datasources: { db: { url: scopedDatabaseUrl(testDatabaseUrl) } },
    });

    await admin.$executeRawUnsafe(`CREATE SCHEMA "${schemaName}"`);

    const preMigrationStatements = [
      `
        CREATE TABLE "coaches" (
          "id" TEXT PRIMARY KEY,
          "email" TEXT NOT NULL UNIQUE
        )
      `,
      `
        CREATE TABLE "org_respondents" (
          "id" TEXT PRIMARY KEY,
          "email" TEXT NOT NULL
        )
      `,
      `
        CREATE TABLE "assessment_templates" (
          "id" TEXT PRIMARY KEY,
          "alias" TEXT NOT NULL UNIQUE,
          "resultsEmailContentApproved" BOOLEAN NOT NULL DEFAULT false,
          "resultsEmailContentApprovedHash" TEXT,
          "resultsEmailSubject" TEXT,
          "resultsEmailBodyMarkdown" TEXT
        )
      `,
      `
        CREATE TABLE "assessment_template_versions" (
          "id" TEXT PRIMARY KEY,
          "templateId" TEXT NOT NULL
        )
      `,
      `
        CREATE TABLE "assessment_campaigns" (
          "id" TEXT PRIMARY KEY,
          "templateId" TEXT NOT NULL,
          "versionId" TEXT NOT NULL,
          "accessMode" TEXT NOT NULL,
          "status" TEXT NOT NULL,
          "deletedAt" TIMESTAMP(3),
          "closeAt" TIMESTAMP(3),
          "sendResultsToRespondent" BOOLEAN NOT NULL DEFAULT false,
          "notifyCoachOnCompletion" BOOLEAN NOT NULL DEFAULT false,
          "createdByCoachId" TEXT
        )
      `,
      `
        CREATE TABLE "assessment_invitations" (
          "id" TEXT PRIMARY KEY,
          "campaignId" TEXT NOT NULL,
          "respondentId" TEXT NOT NULL,
          "status" TEXT NOT NULL,
          "revokedAt" TIMESTAMP(3),
          "expiresAt" TIMESTAMP(3) NOT NULL,
          "submittedAt" TIMESTAMP(3)
        )
      `,
      `
        CREATE TABLE "assessment_submissions" (
          "id" TEXT PRIMARY KEY,
          "campaignId" TEXT NOT NULL,
          "respondentId" TEXT,
          "invitationId" TEXT UNIQUE,
          "submittedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
          "answers" JSONB NOT NULL,
          "result" JSONB NOT NULL
        )
      `,
      `
        CREATE TABLE "assessment_email_outbox" (
          "id" TEXT PRIMARY KEY,
          "submissionId" TEXT NOT NULL,
          "recipientEmail" TEXT NOT NULL,
          "recipientRole" TEXT NOT NULL,
          "emailType" TEXT NOT NULL,
          "subject" TEXT NOT NULL,
          "bodyHtml" TEXT NOT NULL,
          "status" TEXT NOT NULL DEFAULT 'PENDING',
          "attempts" INTEGER NOT NULL DEFAULT 0,
          "lastError" TEXT,
          "sentAt" TIMESTAMP(3),
          "nextAttemptAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
          "leaseToken" TEXT,
          "leaseExpiresAt" TIMESTAMP(3),
          "cancelledAt" TIMESTAMP(3),
          "cancelReason" TEXT,
          "featureKey" TEXT,
          "authorizationProvenance" JSONB,
          "contentProvenance" JSONB,
          "sendFenceGeneration" INTEGER NOT NULL DEFAULT 0,
          "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
          "updatedAt" TIMESTAMP(3) NOT NULL,
          CONSTRAINT "assessment_email_outbox_submissionId_recipientRole_key"
            UNIQUE ("submissionId", "recipientRole")
        )
      `,
      `
        CREATE TABLE "audit_logs" (
          "id" TEXT PRIMARY KEY,
          "entityType" TEXT NOT NULL,
          "entityId" TEXT NOT NULL,
          "action" TEXT NOT NULL,
          "performedBy" TEXT,
          "changes" TEXT NOT NULL,
          "ipAddress" TEXT,
          "userAgent" TEXT,
          "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
          CONSTRAINT "audit_logs_test_failure"
            CHECK ("entityId" NOT LIKE 'audit-fail-%'),
          CONSTRAINT "audit_logs_operator_release_test_failure"
            CHECK (
              "entityId" NOT LIKE 'operator-audit-fail-%'
              OR "action" <> 'ASSESSMENT_EMAIL_INTENT_RELEASED'
            )
        )
      `,
      `
        CREATE TABLE "serialization_probe" (
          "id" TEXT PRIMARY KEY,
          "value" INTEGER NOT NULL
        )
      `,
    ];
    for (const statement of preMigrationStatements) {
      await eventDb.$executeRawUnsafe(statement);
    }

    // Apply the checked-in artifact itself. Do not restate or emulate it here.
    const migrationStatements = readFileSync(intentMigrationPath, "utf8")
      .split(";")
      .map((statement) => statement.trim())
      .filter(Boolean);
    for (const statement of migrationStatements) {
      await eventDb.$executeRawUnsafe(statement);
    }
  });

  afterAll(async () => {
    await Promise.allSettled([eventDb?.$disconnect(), cronDb?.$disconnect()]);
    if (admin) {
      await admin.$executeRawUnsafe(
        `DROP SCHEMA IF EXISTS "${schemaName}" CASCADE`,
      );
      await admin.$disconnect();
    }

    if (originalResultsFlag === undefined) {
      delete process.env.WAVE_D_RESULTS_EMAIL_ENABLED;
    } else {
      process.env.WAVE_D_RESULTS_EMAIL_ENABLED = originalResultsFlag;
    }
    if (originalCoachFlag === undefined) {
      delete process.env.WAVE_D_COACH_NOTIFY_ENABLED;
    } else {
      process.env.WAVE_D_COACH_NOTIFY_ENABLED = originalCoachFlag;
    }
  });

  beforeEach(async () => {
    await eventDb.$executeRawUnsafe(`
      TRUNCATE
        "assessment_email_delivery_intents",
        "assessment_email_outbox",
        "audit_logs",
        "assessment_submissions",
        "assessment_invitations",
        "assessment_campaigns",
        "assessment_template_versions",
        "assessment_templates",
        "org_respondents",
        "coaches",
        "serialization_probe"
      CASCADE
    `);
  });

  it("rolls back submission when a required second intent insert fails", async () => {
    await seedAuthorizationGraph(eventDb, {
      includeSubmission: false,
      invitationStatus: "PENDING",
    });
    const respondentPayload = frozenPayload("RESPONDENT");
    const coachPayload = frozenPayload("OWNING_COACH");
    let transitionObservedInsideTransaction = false;

    const submission = eventDb.$transaction(async (tx) => {
      await tx.assessmentSubmission.create({
        data: {
          id: "submission-1",
          campaignId: "campaign-1",
          respondentId: "respondent-1",
          invitationId: "invitation-1",
          answers: [],
          result: {},
        },
        select: { id: true },
      });
      await tx.assessmentEmailDeliveryIntent.create({
        data: {
          id: "required-intent",
          submissionId: "submission-1",
          campaignId: "campaign-1",
          invitationId: "invitation-1",
          respondentId: "respondent-1",
          ...respondentPayload,
          authorizationSnapshot:
            authorizationSnapshot("RESPONDENT") as unknown as Prisma.InputJsonValue,
          contentProvenance:
            contentProvenance("RESPONDENT") as unknown as Prisma.InputJsonValue,
          expiresAt,
        },
        select: { id: true },
      });
      // This proof deliberately moves the invitation transition ahead of the
      // injected second-write failure. The production route transitions after
      // all intent writes; the reordered fixture exists specifically to prove
      // that an already-executed transition rolls back with both earlier rows.
      const transitionedInvitation = await tx.assessmentInvitation.update({
        where: { id: "invitation-1" },
        data: { status: "SUBMITTED", submittedAt: reconcileNow },
        select: { status: true, submittedAt: true },
      });
      expect(transitionedInvitation).toEqual({
        status: "SUBMITTED",
        submittedAt: reconcileNow,
      });
      transitionObservedInsideTransaction = true;

      // A distinct required recipient role reaches PostgreSQL but fails on the
      // duplicated primary-key identity. The executed invitation transition,
      // first intent, and submission must not survive the aborted transaction.
      await tx.assessmentEmailDeliveryIntent.create({
        data: {
          id: "required-intent",
          submissionId: "submission-1",
          campaignId: "campaign-1",
          invitationId: "invitation-1",
          respondentId: "respondent-1",
          ...coachPayload,
          authorizationSnapshot:
            authorizationSnapshot("OWNING_COACH") as unknown as Prisma.InputJsonValue,
          contentProvenance:
            contentProvenance("OWNING_COACH") as unknown as Prisma.InputJsonValue,
          expiresAt,
        },
        select: { id: true },
      });
    });

    await expect(submission).rejects.toMatchObject({ code: "P2002" });
    expect(transitionObservedInsideTransaction).toBe(true);

    const counts = await eventDb.$queryRaw<
      Array<{ submissions: number; intents: number }>
    >(Prisma.sql`
      SELECT
        (SELECT COUNT(*)::int FROM "assessment_submissions") AS "submissions",
        (SELECT COUNT(*)::int FROM "assessment_email_delivery_intents")
          AS "intents"
    `);
    const invitations = await eventDb.$queryRaw<
      Array<{ status: string; submittedAt: Date | null }>
    >(Prisma.sql`
      SELECT "status", "submittedAt"
      FROM "assessment_invitations"
      WHERE "id" = 'invitation-1'
    `);

    expect(counts[0]).toEqual({ submissions: 0, intents: 0 });
    expect(invitations).toEqual([
      { status: "PENDING", submittedAt: null },
    ]);
  });

  it("uses SKIP LOCKED so a reachable event/cron contention has one owner", async () => {
    await seedAuthorizationGraph(eventDb);
    await seedIntent(eventDb);
    const eventOwnsLockedIntent = deferred<void>();
    const releaseEvent = deferred<void>();
    const eventOperation = reconcileAssessmentEmailIntents(
      reconcilerDeps(eventDb, {
        beforeAuthorizationLoad: async () => {
          // This seam runs only after candidate FOR UPDATE and the complete
          // authoritative lock chain. Hold that reachable PENDING owner while
          // cron proves it skips, rather than waits on, the same intent.
          eventOwnsLockedIntent.resolve();
          await releaseEvent.promise;
        },
      }),
      { kind: "submission", submissionId: "submission-1", maxRows: 10 },
    );
    let eventResult:
      | Awaited<ReturnType<typeof reconcileAssessmentEmailIntents>>
      | undefined;
    let cronResult:
      | Awaited<ReturnType<typeof reconcileAssessmentEmailIntents>>
      | undefined;
    try {
      await bounded(eventOwnsLockedIntent.promise, "event candidate ownership");
      cronResult = await bounded(
        reconcileAssessmentEmailIntents(reconcilerDeps(cronDb), {
          kind: "scheduled",
          maxRows: 50,
        }),
        "cron SKIP LOCKED result",
      );
      expect(cronResult).toEqual(
        expect.objectContaining({
          handedOff: 0,
          held: 0,
          expired: 0,
          existingOutboxWon: 0,
        }),
      );
      releaseEvent.resolve();
      eventResult = await bounded(eventOperation, "event handoff owner");
    } finally {
      releaseEvent.resolve();
      await Promise.allSettled([eventOperation]);
    }
    if (!eventResult || !cronResult) {
      throw new Error("Expected both automatic reconciliation results.");
    }

    expect(eventResult.handedOff + cronResult.handedOff).toBe(1);
    expect(
      eventResult.existingOutboxWon + cronResult.existingOutboxWon,
    ).toBe(0);
    expect(
      await countOutboxRows(eventDb, "submission-1", "RESPONDENT"),
    ).toBe(1);
    expect(await readIntent(eventDb, "intent-1")).toEqual(
      expect.objectContaining({
        status: "HANDED_OFF",
        recipientEmail: null,
        subject: null,
        bodyHtml: null,
      }),
    );
    expect(
      await countIntentAudits(
        eventDb,
        "intent-1",
        "ASSESSMENT_EMAIL_INTENT_HANDED_OFF",
      ),
    ).toBe(1);
  });

  it("proves the HELD/PENDING state partition prevents automatic/release same-row contention", async () => {
    await seedAuthorizationGraph(eventDb);
    await seedIntent(eventDb, { status: "HELD" });
    const detail = requireReleaseDetail(
      await loadHeldIntentDetail(operatorDeps(eventDb), {
        intentId: "intent-1",
        actor: { userId: "operator-1" },
      }),
    );

    // An unexpired HELD row is outside the automatic PENDING candidate
    // partition, so there is deliberately no race to claim here.
    const automaticResult = await reconcileAssessmentEmailIntents(
      reconcilerDeps(cronDb),
      { kind: "scheduled", maxRows: 50 },
    );
    const releaseResult = await releaseHeldIntent(
      operatorDeps(eventDb),
      {
        intentId: "intent-1",
        actor: { userId: "operator-1" },
        expectedVersion: 0,
        reasonCode: "DRIFT_REVIEWED_SEND_FROZEN",
        reviewToken: detail.reviewToken,
      },
    );

    expect(automaticResult).toEqual(
      expect.objectContaining({
        handedOff: 0,
        held: 0,
        expired: 0,
        existingOutboxWon: 0,
      }),
    );
    expect(releaseResult).toEqual({
      intentId: "intent-1",
      status: "HANDED_OFF",
      version: 1,
      outboxId: expect.any(String),
      existingOutboxWon: false,
    });
    expect(await countOutboxRows(eventDb, "submission-1", "RESPONDENT")).toBe(
      1,
    );
    expect(await readIntent(eventDb)).toEqual(
      expect.objectContaining({
        status: "HANDED_OFF",
        version: 1,
        recipientEmail: null,
        subject: null,
        bodyHtml: null,
      }),
    );
    expect(
      await countIntentAudits(
        eventDb,
        "intent-1",
        "ASSESSMENT_EMAIL_INTENT_HANDED_OFF",
      ),
    ).toBe(0);
    expect(
      await countIntentAudits(
        eventDb,
        "intent-1",
        "ASSESSMENT_EMAIL_INTENT_RELEASED",
      ),
    ).toBe(1);
    expect(
      await countIntentAudits(
        eventDb,
        "intent-1",
        "ASSESSMENT_EMAIL_INTENT_DETAIL_VIEWED",
      ),
    ).toBe(1);
  });

  it("holds every operator authoritative lock before a relevant mutation proceeds", async () => {
    await seedAuthorizationGraph(eventDb);
    await seedIntent(eventDb, { status: "HELD" });
    const detail = requireReleaseDetail(
      await loadHeldIntentDetail(operatorDeps(eventDb), {
        intentId: "intent-1",
        actor: { userId: "operator-1" },
      }),
    );
    const releaseHasLocks = deferred<void>();
    const continueRelease = deferred<void>();
    const release = releaseHeldIntent(
      operatorDeps(eventDb, {
        beforeAuthorizationLoad: async () => {
          releaseHasLocks.resolve();
          await continueRelease.promise;
        },
      }),
      {
        intentId: "intent-1",
        actor: { userId: "operator-1" },
        expectedVersion: 0,
        reasonCode: "DRIFT_REVIEWED_SEND_FROZEN",
        reviewToken: detail.reviewToken,
      },
    );
    const mutationPid = deferred<number>();
    let mutation: Promise<void> | undefined;
    const [releaseResult] = await (async () => {
      try {
        await bounded(
          releaseHasLocks.promise,
          "operator authoritative locks",
        );
        mutation = cronDb.$transaction(async (tx) => {
          mutationPid.resolve(await backendPid(tx));
          await tx.$executeRaw(Prisma.sql`
            UPDATE "assessment_campaigns"
            SET "sendResultsToRespondent" = false
            WHERE "id" = 'campaign-1'
          `);
        });
        await waitForBackendLock(
          admin,
          await bounded(mutationPid.promise, "operator mutation backend PID"),
        );
        continueRelease.resolve();
        return await bounded(
          Promise.all([release, mutation]),
          "operator-first mutation ordering",
        );
      } finally {
        continueRelease.resolve();
        await Promise.allSettled([
          release,
          ...(mutation ? [mutation] : []),
        ]);
      }
    })();
    const campaign = await eventDb.$queryRaw<
      Array<{ sendResultsToRespondent: boolean }>
    >(Prisma.sql`
      SELECT "sendResultsToRespondent"
      FROM "assessment_campaigns"
      WHERE "id" = 'campaign-1'
    `);

    expect(releaseResult).toEqual(
      expect.objectContaining({
        status: "HANDED_OFF",
        existingOutboxWon: false,
      }),
    );
    expect(campaign).toEqual([{ sendResultsToRespondent: false }]);
    expect(await countOutboxRows(eventDb, "submission-1", "RESPONDENT")).toBe(
      1,
    );
  });

  it("executes automatic and operator PostgreSQL locks in the same complete physical-table order", async () => {
    await seedAuthorizationGraph(eventDb);
    await seedIntent(eventDb, { role: "OWNING_COACH" });
    const automaticQueries: Prisma.Sql[] = [];

    const automaticResult = await reconcileAssessmentEmailIntents(
      reconcilerDeps(eventDb, {
        observeQuery: (query) => automaticQueries.push(query),
      }),
      { kind: "submission", submissionId: "submission-1", maxRows: 10 },
    );
    expect(automaticResult.handedOff).toBe(1);

    await eventDb.$executeRaw(Prisma.sql`
      DELETE FROM "assessment_email_outbox"
      WHERE "submissionId" = 'submission-1'
    `);
    await eventDb.$executeRaw(Prisma.sql`
      DELETE FROM "audit_logs"
      WHERE "entityId" = 'intent-1'
    `);
    await eventDb.$executeRaw(Prisma.sql`
      DELETE FROM "assessment_email_delivery_intents"
      WHERE "id" = 'intent-1'
    `);
    await seedIntent(eventDb, {
      role: "OWNING_COACH",
      status: "HELD",
    });
    const detail = requireReleaseDetail(
      await loadHeldIntentDetail(operatorDeps(eventDb), {
        intentId: "intent-1",
        actor: { userId: "operator-1" },
      }),
    );
    const operatorQueries: Prisma.Sql[] = [];

    const releaseResult = await releaseHeldIntent(
      operatorDeps(eventDb, {
        observeQuery: (query) => operatorQueries.push(query),
      }),
      {
        intentId: "intent-1",
        actor: { userId: "operator-1" },
        expectedVersion: 0,
        reasonCode: "DRIFT_REVIEWED_SEND_FROZEN",
        reviewToken: detail.reviewToken,
      },
    );
    expect(releaseResult.status).toBe("HANDED_OFF");

    const expectedTables = [
      '"assessment_email_delivery_intents"',
      '"assessment_submissions"',
      '"assessment_campaigns"',
      '"assessment_invitations"',
      '"org_respondents"',
      '"assessment_templates"',
      '"assessment_template_versions"',
      '"coaches"',
      '"assessment_email_outbox"',
    ];
    const lockIndexes = (queries: Prisma.Sql[]) => {
      const texts = queries.map(sqlText);
      return expectedTables.map((table) =>
        texts.findIndex(
          (text) =>
            text.includes(table) &&
            (text.includes("FOR UPDATE") || text.includes("FOR SHARE")),
        ),
      );
    };
    const automaticOrder = lockIndexes(automaticQueries);
    const operatorOrder = lockIndexes(operatorQueries);

    expect(automaticOrder.every((index) => index >= 0)).toBe(true);
    expect(operatorOrder.every((index) => index >= 0)).toBe(true);
    expect(automaticOrder).toEqual(
      [...automaticOrder].sort((left, right) => left - right),
    );
    expect(operatorOrder).toEqual(
      [...operatorOrder].sort((left, right) => left - right),
    );
  });

  it("rejects release after a reviewed authoritative fact changes", async () => {
    await seedAuthorizationGraph(eventDb);
    await seedIntent(eventDb, { status: "HELD" });
    const detail = requireReleaseDetail(
      await loadHeldIntentDetail(operatorDeps(eventDb), {
        intentId: "intent-1",
        actor: { userId: "operator-1" },
      }),
    );
    const mutationLocked = deferred<void>();
    const continueMutation = deferred<void>();
    const mutation = cronDb.$transaction(async (tx) => {
      await tx.$queryRaw(Prisma.sql`
        SELECT "id"
        FROM "assessment_campaigns"
        WHERE "id" = 'campaign-1'
        FOR UPDATE
      `);
      await tx.$executeRaw(Prisma.sql`
        UPDATE "assessment_campaigns"
        SET "sendResultsToRespondent" = false
        WHERE "id" = 'campaign-1'
      `);
      mutationLocked.resolve();
      await continueMutation.promise;
    });
    const releasePid = deferred<number>();
    let release: ReturnType<typeof releaseHeldIntent> | undefined;

    try {
      await bounded(
        mutationLocked.promise,
        "reviewed-fact mutation lock",
      );
      release = releaseHeldIntent(
        operatorDeps(eventDb, {
          onTransactionStarted: (pid) => releasePid.resolve(pid),
        }),
        {
          intentId: "intent-1",
          actor: { userId: "operator-1" },
          expectedVersion: 0,
          reasonCode: "DRIFT_REVIEWED_SEND_FROZEN",
          reviewToken: detail.reviewToken,
        },
      );
      await waitForBackendLock(
        admin,
        await bounded(releasePid.promise, "stale-review release backend PID"),
      );
      continueMutation.resolve();
      await expect(
        bounded(release, "stale reviewed-fact rejection"),
      ).rejects.toMatchObject({
        code: "REVIEW_CONTEXT_CHANGED",
      });
      await bounded(mutation, "reviewed-fact mutation commit");
    } finally {
      continueMutation.resolve();
      await Promise.allSettled([
        mutation,
        ...(release ? [release] : []),
      ]);
    }
    expect(await countOutboxRows(eventDb, "submission-1", "RESPONDENT")).toBe(
      0,
    );
    expect(await readIntent(eventDb)).toEqual(
      expect.objectContaining({
        status: "HELD",
        version: 0,
        recipientEmail: "respondent@example.com",
        subject: "Frozen respondent result",
        bodyHtml: "<p>Exact respondent bytes</p>",
      }),
    );
    expect(
      await countIntentAudits(
        eventDb,
        "intent-1",
        "ASSESSMENT_EMAIL_INTENT_RELEASED",
      ),
    ).toBe(0);
  });

  it("adopts an existing outbox during release without mutating the winner", async () => {
    await seedAuthorizationGraph(eventDb);
    await seedIntent(eventDb, { status: "HELD" });
    const outboxId = await seedOutbox(eventDb, "SENT");
    const before = await eventDb.$queryRaw<
      Array<Record<string, unknown>>
    >(Prisma.sql`
      SELECT *
      FROM "assessment_email_outbox"
      WHERE "id" = ${outboxId}
    `);
    const detail = requireReleaseDetail(
      await loadHeldIntentDetail(operatorDeps(eventDb), {
        intentId: "intent-1",
        actor: { userId: "operator-1" },
      }),
    );

    const result = await releaseHeldIntent(operatorDeps(eventDb), {
      intentId: "intent-1",
      actor: { userId: "operator-1" },
      expectedVersion: 0,
      reasonCode: "DRIFT_REVIEWED_SEND_FROZEN",
      reviewToken: detail.reviewToken,
    });
    const after = await eventDb.$queryRaw<
      Array<Record<string, unknown>>
    >(Prisma.sql`
      SELECT *
      FROM "assessment_email_outbox"
      WHERE "id" = ${outboxId}
    `);

    expect(result).toEqual({
      intentId: "intent-1",
      status: "HANDED_OFF",
      version: 1,
      outboxId,
      existingOutboxWon: true,
    });
    expect(after).toEqual(before);
    expect(await readIntent(eventDb)).toEqual(
      expect.objectContaining({
        status: "HANDED_OFF",
        handedOffOutboxId: outboxId,
        recipientEmail: null,
        subject: null,
        bodyHtml: null,
      }),
    );
  });

  it("rolls back operator outbox creation, release resolution, and purge when release audit fails", async () => {
    await seedAuthorizationGraph(eventDb);
    await seedIntent(eventDb, {
      id: "operator-audit-fail-release",
      status: "HELD",
    });
    const detail = requireReleaseDetail(
      await loadHeldIntentDetail(operatorDeps(eventDb), {
        intentId: "operator-audit-fail-release",
        actor: { userId: "operator-1" },
      }),
    );
    const before = await readIntent(
      eventDb,
      "operator-audit-fail-release",
    );

    const release = releaseHeldIntent(operatorDeps(eventDb), {
      intentId: "operator-audit-fail-release",
      actor: { userId: "operator-1" },
      expectedVersion: 0,
      reasonCode: "DRIFT_REVIEWED_SEND_FROZEN",
      reviewToken: detail.reviewToken,
    });

    await expect(release).rejects.toMatchObject({ code: "AUDIT_FAILED" });
    expect(await countOutboxRows(eventDb, "submission-1", "RESPONDENT")).toBe(
      0,
    );
    expect(
      await readIntent(eventDb, "operator-audit-fail-release"),
    ).toEqual(before);
    expect(
      await countIntentAudits(
        eventDb,
        "operator-audit-fail-release",
        "ASSESSMENT_EMAIL_INTENT_RELEASED",
      ),
    ).toBe(0);
    expect(
      await countIntentAudits(
        eventDb,
        "operator-audit-fail-release",
        "ASSESSMENT_EMAIL_INTENT_DETAIL_VIEWED",
      ),
    ).toBe(1);
  });

  it("deserializes JSONB and timestamps while locking the mapped owning Coach row", async () => {
    await seedAuthorizationGraph(eventDb);
    await seedIntent(eventDb, { role: "OWNING_COACH" });

    const result = await reconcileAssessmentEmailIntents(
      reconcilerDeps(eventDb),
      { kind: "submission", submissionId: "submission-1", maxRows: 10 },
    );

    expect(result).toEqual(
      expect.objectContaining({
        handedOff: 1,
        held: 0,
        retried: 0,
      }),
    );
    const outbox = await eventDb.$queryRaw<
      Array<{
        recipientEmail: string;
        recipientRole: string;
        emailType: string;
        subject: string;
        bodyHtml: string;
      }>
    >(Prisma.sql`
      SELECT
        "recipientEmail", "recipientRole", "emailType", "subject", "bodyHtml"
      FROM "assessment_email_outbox"
      WHERE "submissionId" = 'submission-1'
        AND "recipientRole" = 'OWNING_COACH'
    `);
    expect(outbox).toEqual([
      {
        recipientEmail: "coach@example.com",
        recipientRole: "OWNING_COACH",
        emailType: "COACH_COMPLETION",
        subject: "Frozen coach completion",
        bodyHtml: "<p>Exact coach bytes</p>",
      },
    ]);
    expect(
      await countIntentAudits(
        eventDb,
        "intent-1",
        "ASSESSMENT_EMAIL_INTENT_HANDED_OFF",
      ),
    ).toBe(1);
  });

  it("observes drift when a relevant mutation locks first", async () => {
    await seedAuthorizationGraph(eventDb);
    await seedIntent(eventDb);
    const mutationLocked = deferred<number>();
    const releaseMutation = deferred<void>();

    const mutation = cronDb.$transaction(async (tx) => {
      const pid = await backendPid(tx);
      await tx.$queryRaw(Prisma.sql`
        SELECT "id"
        FROM "assessment_campaigns"
        WHERE "id" = 'campaign-1'
        FOR UPDATE
      `);
      await tx.$executeRaw(Prisma.sql`
        UPDATE "assessment_campaigns"
        SET "sendResultsToRespondent" = false
        WHERE "id" = 'campaign-1'
      `);
      mutationLocked.resolve(pid);
      await releaseMutation.promise;
    });
    const reconcilePid = deferred<number>();
    let reconciliation:
      | ReturnType<typeof reconcileAssessmentEmailIntents>
      | undefined;
    const [result] = await (async () => {
      try {
        await bounded(
          mutationLocked.promise,
          "mutation to hold campaign lock",
        );
        reconciliation = reconcileAssessmentEmailIntents(
          reconcilerDeps(eventDb, {
            onTransactionStarted: (pid) => reconcilePid.resolve(pid),
          }),
          {
            kind: "submission",
            submissionId: "submission-1",
            maxRows: 10,
          },
        );
        await waitForBackendLock(
          admin,
          await bounded(reconcilePid.promise, "reconciler backend PID"),
        );
        releaseMutation.resolve();
        return await bounded(
          Promise.all([reconciliation, mutation]),
          "drift mutation and reconciliation",
        );
      } finally {
        releaseMutation.resolve();
        await Promise.allSettled([
          mutation,
          ...(reconciliation ? [reconciliation] : []),
        ]);
      }
    })();

    expect(result).toEqual(
      expect.objectContaining({ handedOff: 0, held: 1 }),
    );
    expect(await countOutboxRows(eventDb, "submission-1", "RESPONDENT")).toBe(
      0,
    );
    expect(await readIntent(eventDb)).toEqual(
      expect.objectContaining({
        status: "HELD",
        holdReason: "FEATURE_DISABLED",
      }),
    );
  });

  it("finishes a handoff lock before a relevant mutation proceeds", async () => {
    await seedAuthorizationGraph(eventDb);
    await seedIntent(eventDb);
    const handoffHasLocks = deferred<void>();
    const releaseHandoff = deferred<void>();

    const reconciliation = reconcileAssessmentEmailIntents(
      reconcilerDeps(eventDb, {
        beforeAuthorizationLoad: async () => {
          handoffHasLocks.resolve();
          await releaseHandoff.promise;
        },
      }),
      { kind: "submission", submissionId: "submission-1", maxRows: 10 },
    );
    const mutationPid = deferred<number>();
    let mutation: Promise<void> | undefined;
    const [result] = await (async () => {
      try {
        await bounded(
          handoffHasLocks.promise,
          "handoff authoritative locks",
        );
        mutation = cronDb.$transaction(async (tx) => {
          mutationPid.resolve(await backendPid(tx));
          await tx.$executeRaw(Prisma.sql`
            UPDATE "assessment_campaigns"
            SET "sendResultsToRespondent" = false
            WHERE "id" = 'campaign-1'
          `);
        });
        await waitForBackendLock(
          admin,
          await bounded(mutationPid.promise, "mutation backend PID"),
        );
        releaseHandoff.resolve();
        return await bounded(
          Promise.all([reconciliation, mutation]),
          "handoff-first mutation ordering",
        );
      } finally {
        releaseHandoff.resolve();
        await Promise.allSettled([
          reconciliation,
          ...(mutation ? [mutation] : []),
        ]);
      }
    })();
    const campaign = await eventDb.$queryRaw<
      Array<{ sendResultsToRespondent: boolean }>
    >(Prisma.sql`
      SELECT "sendResultsToRespondent"
      FROM "assessment_campaigns"
      WHERE "id" = 'campaign-1'
    `);

    expect(result).toEqual(
      expect.objectContaining({ handedOff: 1, held: 0 }),
    );
    expect(campaign).toEqual([{ sendResultsToRespondent: false }]);
    expect(await countOutboxRows(eventDb, "submission-1", "RESPONDENT")).toBe(
      1,
    );
    expect(await readIntent(eventDb)).toEqual(
      expect.objectContaining({ status: "HANDED_OFF" }),
    );
  });

  it.each(["PENDING", "SENDING", "SENT", "FAILED", "CANCELLED"] as const)(
    "leaves an existing %s outbox winner unchanged",
    async (status) => {
      await seedAuthorizationGraph(eventDb);
      await seedIntent(eventDb);
      const outboxId = await seedOutbox(eventDb, status);
      const before = await eventDb.$queryRaw<
        Array<Record<string, unknown>>
      >(Prisma.sql`
        SELECT *
        FROM "assessment_email_outbox"
        WHERE "id" = ${outboxId}
      `);

      const result = await reconcileAssessmentEmailIntents(
        reconcilerDeps(eventDb),
        { kind: "submission", submissionId: "submission-1", maxRows: 10 },
      );
      const after = await eventDb.$queryRaw<
        Array<Record<string, unknown>>
      >(Prisma.sql`
        SELECT *
        FROM "assessment_email_outbox"
        WHERE "id" = ${outboxId}
      `);

      expect(result).toEqual(
        expect.objectContaining({
          handedOff: 1,
          existingOutboxWon: 1,
        }),
      );
      expect(after).toEqual(before);
      expect(await readIntent(eventDb)).toEqual(
        expect.objectContaining({
          status: "HANDED_OFF",
          handedOffOutboxId: outboxId,
          recipientEmail: null,
          subject: null,
          bodyHtml: null,
          resolutionReasonCode: "EXISTING_OUTBOX_WON",
        }),
      );
      expect(
        await countIntentAudits(
          eventDb,
          "intent-1",
          "ASSESSMENT_EMAIL_INTENT_HANDED_OFF",
        ),
      ).toBe(1);
    },
  );

  it("adopts an existing outbox and database-nulls corrupt JSON payload evidence", async () => {
    await seedAuthorizationGraph(eventDb);
    await seedIntent(eventDb);
    await eventDb.$executeRaw(Prisma.sql`
      UPDATE "assessment_email_delivery_intents"
      SET
        "authorizationSnapshot" = '{"schemaVersion":999}'::jsonb,
        "contentProvenance" = '{"schemaVersion":999}'::jsonb
      WHERE "id" = 'intent-1'
    `);
    const outboxId = await seedOutbox(eventDb, "SENT");

    const result = await reconcileAssessmentEmailIntents(
      reconcilerDeps(eventDb),
      { kind: "submission", submissionId: "submission-1", maxRows: 10 },
    );
    const intent = await readIntent(eventDb);

    expect(result).toEqual(
      expect.objectContaining({
        handedOff: 1,
        existingOutboxWon: 1,
        retried: 0,
      }),
    );
    expect(intent).toEqual(
      expect.objectContaining({
        status: "HANDED_OFF",
        handedOffOutboxId: outboxId,
        recipientEmail: null,
        subject: null,
        bodyHtml: null,
        authorizationSnapshot: null,
        contentProvenance: null,
      }),
    );
  });

  it("rolls back outbox creation when the required handoff audit fails", async () => {
    await seedAuthorizationGraph(eventDb);
    await seedIntent(eventDb, { id: "audit-fail-create" });
    const before = await readIntent(eventDb, "audit-fail-create");

    const result = await reconcileAssessmentEmailIntents(
      reconcilerDeps(eventDb),
      { kind: "submission", submissionId: "submission-1", maxRows: 10 },
    );
    const after = await readIntent(eventDb, "audit-fail-create");

    expect(result).toEqual(
      expect.objectContaining({
        handedOff: 0,
        retried: 1,
      }),
    );
    expect(await countOutboxRows(eventDb, "submission-1", "RESPONDENT")).toBe(
      0,
    );
    expect(after).toEqual(
      expect.objectContaining({
        status: "PENDING",
        attempts: 1,
        version: before.version,
        recipientEmail: before.recipientEmail,
        subject: before.subject,
        bodyHtml: before.bodyHtml,
        authorizationSnapshot: before.authorizationSnapshot,
        contentProvenance: before.contentProvenance,
      }),
    );
    expect(
      await countIntentAudits(
        eventDb,
        "audit-fail-create",
        "ASSESSMENT_EMAIL_INTENT_HANDED_OFF",
      ),
    ).toBe(0);
  });

  it("rolls back existing-outbox resolution and payload purge when its audit fails", async () => {
    await seedAuthorizationGraph(eventDb);
    await seedIntent(eventDb, { id: "audit-fail-resolution" });
    const outboxId = await seedOutbox(eventDb, "SENT");
    const before = await readIntent(eventDb, "audit-fail-resolution");

    const result = await reconcileAssessmentEmailIntents(
      reconcilerDeps(eventDb),
      { kind: "submission", submissionId: "submission-1", maxRows: 10 },
    );
    const after = await readIntent(eventDb, "audit-fail-resolution");

    expect(result).toEqual(
      expect.objectContaining({
        handedOff: 0,
        existingOutboxWon: 0,
        retried: 1,
      }),
    );
    expect(after).toEqual(
      expect.objectContaining({
        status: "PENDING",
        attempts: 1,
        version: before.version,
        handedOffOutboxId: null,
        resolvedAt: null,
        recipientEmail: before.recipientEmail,
        subject: before.subject,
        bodyHtml: before.bodyHtml,
        authorizationSnapshot: before.authorizationSnapshot,
        contentProvenance: before.contentProvenance,
      }),
    );
    const outbox = await eventDb.$queryRaw<
      Array<{ id: string; status: string }>
    >(Prisma.sql`
      SELECT "id", "status"
      FROM "assessment_email_outbox"
      WHERE "id" = ${outboxId}
    `);
    expect(outbox).toEqual([{ id: outboxId, status: "SENT" }]);
  });

  it("enforces unique intent and outbox identities", async () => {
    await seedAuthorizationGraph(eventDb);
    await seedIntent(eventDb);
    const duplicateIntent = seedIntent(eventDb, { id: "intent-duplicate" });

    await expect(duplicateIntent).rejects.toMatchObject({ code: "P2002" });
    await seedOutbox(eventDb, "PENDING");
    const duplicateOutbox = eventDb.assessmentEmailOutbox.create({
      data: {
        id: "outbox-duplicate",
        submissionId: "submission-1",
        recipientEmail: "other@example.com",
        recipientRole: "RESPONDENT",
        emailType: "ASSESSMENT_RESULTS",
        subject: "Different",
        bodyHtml: "<p>Different</p>",
      },
      select: { id: true },
    });
    await expect(duplicateOutbox).rejects.toMatchObject({ code: "P2002" });

    expect(
      await countOutboxRows(eventDb, "submission-1", "RESPONDENT"),
    ).toBe(1);
    const intents = await eventDb.$queryRaw<Array<{ count: number }>>(
      Prisma.sql`
        SELECT COUNT(*)::int AS "count"
        FROM "assessment_email_delivery_intents"
        WHERE "submissionId" = 'submission-1'
          AND "recipientRole" = 'RESPONDENT'
      `,
    );
    expect(intents[0].count).toBe(1);
  });

  it("expires and purges atomically while assessment sends are paused", async () => {
    await seedAuthorizationGraph(eventDb);
    await seedIntent(eventDb, {
      status: "HELD",
      intentExpiresAt: dueAt,
    });

    const result = await reconcileAssessmentEmailIntents(
      reconcilerDeps(eventDb, { paused: true }),
      { kind: "scheduled", maxRows: 50 },
    );
    const intent = await readIntent(eventDb);

    expect(result).toEqual(
      expect.objectContaining({
        expired: 1,
        handedOff: 0,
        retried: 0,
      }),
    );
    expect(intent).toEqual(
      expect.objectContaining({
        status: "EXPIRED",
        recipientEmail: null,
        subject: null,
        bodyHtml: null,
        resolvedBy: "assessment-email-intent-reconciler",
        resolutionReasonCode: "INTENT_EXPIRED",
      }),
    );
    expect(intent.authorizationSnapshot).not.toEqual(
      authorizationSnapshot("RESPONDENT"),
    );
    expect(await countOutboxRows(eventDb, "submission-1", "RESPONDENT")).toBe(
      0,
    );
    expect(
      await countIntentAudits(
        eventDb,
        "intent-1",
        "ASSESSMENT_EMAIL_INTENT_EXPIRED",
      ),
    ).toBe(1);
  });

  it("uses PostgreSQL time to expire a paused candidate when the app clock trails", async () => {
    await seedAuthorizationGraph(eventDb);
    const clockRows = await eventDb.$queryRaw<
      Array<{ databaseExpiredButApplicationLive: Date }>
    >(Prisma.sql`
      SELECT
        (
          statement_timestamp() AT TIME ZONE 'UTC' - interval '1 minute'
        ) AS "databaseExpiredButApplicationLive"
    `);
    const databaseExpiredButApplicationLive =
      clockRows[0].databaseExpiredButApplicationLive;
    expect(databaseExpiredButApplicationLive.getTime()).toBeGreaterThan(
      reconcileNow.getTime(),
    );
    await seedIntent(eventDb, {
      intentExpiresAt: databaseExpiredButApplicationLive,
    });

    const result = await reconcileAssessmentEmailIntents(
      reconcilerDeps(eventDb, { paused: true }),
      { kind: "scheduled", maxRows: 50 },
    );

    expect(result).toEqual(
      expect.objectContaining({
        expired: 1,
        handedOff: 0,
        existingOutboxWon: 0,
        retried: 0,
      }),
    );
    expect(await countOutboxRows(eventDb, "submission-1", "RESPONDENT")).toBe(
      0,
    );
    expect(await readIntent(eventDb)).toEqual(
      expect.objectContaining({
        status: "EXPIRED",
        recipientEmail: null,
        subject: null,
        bodyHtml: null,
      }),
    );
  });

  it("expires corrupt JSON evidence with real Prisma database-null writes", async () => {
    await seedAuthorizationGraph(eventDb);
    await seedIntent(eventDb, {
      status: "HELD",
      intentExpiresAt: dueAt,
    });
    await eventDb.$executeRaw(Prisma.sql`
      UPDATE "assessment_email_delivery_intents"
      SET
        "authorizationSnapshot" = '{"schemaVersion":999}'::jsonb,
        "contentProvenance" = '{"schemaVersion":999}'::jsonb
      WHERE "id" = 'intent-1'
    `);

    const result = await reconcileAssessmentEmailIntents(
      reconcilerDeps(eventDb, { paused: true }),
      { kind: "scheduled", maxRows: 50 },
    );
    const intent = await readIntent(eventDb);

    expect(result).toEqual(
      expect.objectContaining({
        expired: 1,
        handedOff: 0,
        retried: 0,
      }),
    );
    expect(intent).toEqual(
      expect.objectContaining({
        status: "EXPIRED",
        recipientEmail: null,
        subject: null,
        bodyHtml: null,
        authorizationSnapshot: null,
        contentProvenance: null,
      }),
    );
  });

  it("retains retryable work after the real PostgreSQL lock timeout", async () => {
    await seedAuthorizationGraph(eventDb);
    await seedIntent(eventDb);
    const submissionLocked = deferred<void>();
    const releaseSubmission = deferred<void>();

    const locker = cronDb.$transaction(async (tx) => {
      await tx.$queryRaw(Prisma.sql`
        SELECT "id"
        FROM "assessment_submissions"
        WHERE "id" = 'submission-1'
        FOR UPDATE
      `);
      submissionLocked.resolve();
      await releaseSubmission.promise;
    });
    let reconciliation:
      | ReturnType<typeof reconcileAssessmentEmailIntents>
      | undefined;
    const result = await (async () => {
      try {
        await bounded(submissionLocked.promise, "submission lock");
        reconciliation = reconcileAssessmentEmailIntents(
          reconcilerDeps(eventDb),
          {
            kind: "submission",
            submissionId: "submission-1",
            maxRows: 10,
          },
        );
        return await bounded(
          reconciliation,
          "PostgreSQL lock_timeout classification",
        );
      } finally {
        releaseSubmission.resolve();
        await Promise.allSettled([
          locker,
          ...(reconciliation ? [reconciliation] : []),
        ]);
      }
    })();

    expect(result).toEqual(
      expect.objectContaining({
        handedOff: 0,
        retried: 1,
      }),
    );
    expect(await readIntent(eventDb)).toEqual(
      expect.objectContaining({
        status: "PENDING",
        attempts: 1,
        version: 0,
        lastErrorClass: "PRISMA_P2010",
        recipientEmail: "respondent@example.com",
        subject: "Frozen respondent result",
        bodyHtml: "<p>Exact respondent bytes</p>",
      }),
    );
    expect(await countOutboxRows(eventDb, "submission-1", "RESPONDENT")).toBe(
      0,
    );
  });

  it("retains retryable work after a real serialization failure", async () => {
    await seedAuthorizationGraph(eventDb);
    await seedIntent(eventDb);
    await eventDb.$executeRaw(Prisma.sql`
      INSERT INTO "serialization_probe" ("id", "value")
      VALUES ('probe-1', 0)
    `);
    const reconcilerRead = deferred<void>();
    const conflictingCommit = deferred<void>();
    let transactionNumber = 0;

    const reconciliation = reconcileAssessmentEmailIntents(
      reconcilerDeps(eventDb, {
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
        beforeTransactionWork: async (tx) => {
          transactionNumber += 1;
          if (transactionNumber !== 1) return;
          await tx.$queryRaw(Prisma.sql`
            SELECT "value"
            FROM "serialization_probe"
            WHERE "id" = 'probe-1'
          `);
          reconcilerRead.resolve();
          await conflictingCommit.promise;
        },
      }),
      { kind: "submission", submissionId: "submission-1", maxRows: 10 },
    );
    let conflictingOperation: Promise<void> | undefined;
    const result = await (async () => {
      try {
        await bounded(
          reconcilerRead.promise,
          "Serializable reconciler read",
        );
        conflictingOperation = cronDb.$transaction(
          async (tx) => {
            await tx.$queryRaw(Prisma.sql`
              SELECT COUNT(*)
              FROM "assessment_email_outbox"
              WHERE "submissionId" = 'submission-1'
                AND "recipientRole" = 'RESPONDENT'
            `);
            await tx.$executeRaw(Prisma.sql`
              UPDATE "serialization_probe"
              SET "value" = "value" + 1
              WHERE "id" = 'probe-1'
            `);
          },
          { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
        );
        await conflictingOperation;
        conflictingCommit.resolve();
        return await bounded(
          reconciliation,
          "Serializable read/write dependency cycle",
        );
      } finally {
        conflictingCommit.resolve();
        await Promise.allSettled([
          reconciliation,
          ...(conflictingOperation ? [conflictingOperation] : []),
        ]);
      }
    })();
    const intent = await readIntent(eventDb);

    expect(result).toEqual(
      expect.objectContaining({
        handedOff: 0,
        retried: 1,
      }),
    );
    expect(intent).toEqual(
      expect.objectContaining({
        status: "PENDING",
        attempts: 1,
        version: 0,
        lastErrorClass: "PRISMA_P2034",
        recipientEmail: "respondent@example.com",
        subject: "Frozen respondent result",
        bodyHtml: "<p>Exact respondent bytes</p>",
      }),
    );
    expect(await countOutboxRows(eventDb, "submission-1", "RESPONDENT")).toBe(
      0,
    );
    expect(
      await countIntentAudits(
        eventDb,
        "intent-1",
        "ASSESSMENT_EMAIL_INTENT_HANDED_OFF",
      ),
    ).toBe(0);
  });
});
