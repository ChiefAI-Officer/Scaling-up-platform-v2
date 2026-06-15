/**
 * Wave D (Spec 17) — additive migration text/AST verification.
 *
 * This suite reads `prisma/schema.prisma` and the hand-written
 * `migration.sql` as PLAIN TEXT and asserts structure. It NEVER opens a
 * database connection (no PrismaClient, no $queryRaw) — the DATABASE_URL on
 * this machine may point at production and two prior wipes happened here.
 *
 * What it guards:
 *   - The new `AssessmentInviteTiming` enum exists with both values.
 *   - Every new AssessmentCampaign column is declared on that model.
 *   - Every new AssessmentTemplate approval-binding column is declared.
 *   - `AssessmentCampaignStatus` does NOT contain `SCHEDULED` — "Scheduled"
 *     is a DERIVED app-state, never a stored enum value. This assertion is a
 *     guard: it fails loudly if anyone ever adds SCHEDULED to the enum.
 *   - migration.sql contains the legacy backfill UPDATE and the partial
 *     composite due-unsent index.
 */

import { readFileSync } from "fs";
import path from "path";

const REPO_ROOT = process.cwd();
const SCHEMA_PATH = path.join(REPO_ROOT, "prisma", "schema.prisma");
const MIGRATION_PATH = path.join(
    REPO_ROOT,
    "prisma",
    "migrations",
    "20260615000000_add_wave_d_campaign_setup",
    "migration.sql",
);

const schema = readFileSync(SCHEMA_PATH, "utf8");

/**
 * Extract the body (between the first `{` and its matching `}`) of a named
 * `model`/`enum` block from the schema text. Brace-counting so nested braces
 * in field attributes don't end the block early.
 */
function extractBlock(source: string, kind: string, name: string): string {
    const header = new RegExp(`${kind}\\s+${name}\\s*\\{`);
    const match = source.match(header);
    if (!match || match.index === undefined) {
        throw new Error(`Could not find ${kind} ${name} in schema.prisma`);
    }
    let depth = 0;
    const start = match.index + match[0].length - 1; // at the opening brace
    for (let i = start; i < source.length; i++) {
        const ch = source[i];
        if (ch === "{") depth++;
        else if (ch === "}") {
            depth--;
            if (depth === 0) return source.slice(start + 1, i);
        }
    }
    throw new Error(`Unterminated ${kind} ${name} block in schema.prisma`);
}

describe("Wave D additive migration — schema.prisma", () => {
    describe("AssessmentInviteTiming enum", () => {
        const enumBody = extractBlock(schema, "enum", "AssessmentInviteTiming");

        it("declares the enum with the IMMEDIATELY value", () => {
            expect(enumBody).toMatch(/^\s*IMMEDIATELY\s*$/m);
        });

        it("declares the enum with the ON_OPEN value", () => {
            expect(enumBody).toMatch(/^\s*ON_OPEN\s*$/m);
        });
    });

    describe("AssessmentCampaignStatus enum — SCHEDULED guard", () => {
        const enumBody = extractBlock(
            schema,
            "enum",
            "AssessmentCampaignStatus",
        );

        it("does NOT contain a SCHEDULED value (derived state, never stored)", () => {
            expect(enumBody).not.toMatch(/\bSCHEDULED\b/);
        });

        it("still has the existing DRAFT / ACTIVE / CLOSED values", () => {
            expect(enumBody).toMatch(/\bDRAFT\b/);
            expect(enumBody).toMatch(/\bACTIVE\b/);
            expect(enumBody).toMatch(/\bCLOSED\b/);
        });
    });

    describe("AssessmentCampaign new columns", () => {
        const model = extractBlock(schema, "model", "AssessmentCampaign");

        it("deletedAt DateTime?", () => {
            expect(model).toMatch(/^\s*deletedAt\s+DateTime\?/m);
        });

        it("inviteTiming AssessmentInviteTiming @default(IMMEDIATELY)", () => {
            expect(model).toMatch(
                /^\s*inviteTiming\s+AssessmentInviteTiming\s+@default\(IMMEDIATELY\)/m,
            );
        });

        it("inviteSendStartedAt DateTime? (CAS claim)", () => {
            expect(model).toMatch(/^\s*inviteSendStartedAt\s+DateTime\?/m);
        });

        it("inviteSendHeartbeatAt DateTime? (lease heartbeat)", () => {
            expect(model).toMatch(/^\s*inviteSendHeartbeatAt\s+DateTime\?/m);
        });

        it("invitesSentAt DateTime? (completion marker)", () => {
            expect(model).toMatch(/^\s*invitesSentAt\s+DateTime\?/m);
        });

        it("sendResultsToRespondent Boolean @default(false)", () => {
            expect(model).toMatch(
                /^\s*sendResultsToRespondent\s+Boolean\s+@default\(false\)/m,
            );
        });

        it("notifyCoachOnCompletion Boolean @default(false)", () => {
            expect(model).toMatch(
                /^\s*notifyCoachOnCompletion\s+Boolean\s+@default\(false\)/m,
            );
        });

        it("invitationBodyHtml String?", () => {
            expect(model).toMatch(/^\s*invitationBodyHtml\s+String\?/m);
        });
    });

    describe("AssessmentTemplate new approval-binding columns", () => {
        const model = extractBlock(schema, "model", "AssessmentTemplate");

        it("resultsEmailContentApprovedHash String?", () => {
            expect(model).toMatch(
                /^\s*resultsEmailContentApprovedHash\s+String\?/m,
            );
        });

        it("resultsEmailContentApprovedAt DateTime?", () => {
            expect(model).toMatch(
                /^\s*resultsEmailContentApprovedAt\s+DateTime\?/m,
            );
        });

        it("resultsEmailContentApprovedBy String?", () => {
            expect(model).toMatch(
                /^\s*resultsEmailContentApprovedBy\s+String\?/m,
            );
        });
    });
});

describe("Wave D additive migration — migration.sql", () => {
    const sql = readFileSync(MIGRATION_PATH, "utf8");
    // Executable SQL only (strip `-- ...` comment lines) so the SCHEDULED
    // guard checks real statements, not prose in the header comment.
    const executableSql = sql
        .split("\n")
        .filter((line) => !line.trimStart().startsWith("--"))
        .join("\n");

    it("creates the AssessmentInviteTiming enum type with both values", () => {
        expect(sql).toMatch(
            /CREATE TYPE "AssessmentInviteTiming" AS ENUM \('IMMEDIATELY',\s*'ON_OPEN'\)/,
        );
    });

    it("adds the new columns to assessment_campaigns", () => {
        expect(sql).toMatch(/ADD COLUMN "deletedAt" TIMESTAMP\(3\)/);
        expect(sql).toMatch(
            /ADD COLUMN "inviteTiming" "AssessmentInviteTiming" NOT NULL DEFAULT 'IMMEDIATELY'/,
        );
        expect(sql).toMatch(/ADD COLUMN "inviteSendStartedAt" TIMESTAMP\(3\)/);
        expect(sql).toMatch(
            /ADD COLUMN "inviteSendHeartbeatAt" TIMESTAMP\(3\)/,
        );
        expect(sql).toMatch(/ADD COLUMN "invitesSentAt" TIMESTAMP\(3\)/);
        expect(sql).toMatch(
            /ADD COLUMN "sendResultsToRespondent" BOOLEAN NOT NULL DEFAULT false/,
        );
        expect(sql).toMatch(
            /ADD COLUMN "notifyCoachOnCompletion" BOOLEAN NOT NULL DEFAULT false/,
        );
        expect(sql).toMatch(/ADD COLUMN "invitationBodyHtml" TEXT/);
    });

    it("adds the approval-binding columns to assessment_templates", () => {
        expect(sql).toMatch(
            /ADD COLUMN "resultsEmailContentApprovedHash" TEXT/,
        );
        expect(sql).toMatch(
            /ADD COLUMN "resultsEmailContentApprovedAt" TIMESTAMP\(3\)/,
        );
        expect(sql).toMatch(/ADD COLUMN "resultsEmailContentApprovedBy" TEXT/);
    });

    it("backfills invitesSentAt from createdAt for legacy campaigns", () => {
        expect(sql).toMatch(
            /UPDATE "assessment_campaigns"\s+SET "invitesSentAt" = COALESCE\("invitesSentAt",\s*"createdAt"\)\s+WHERE "invitesSentAt" IS NULL/,
        );
    });

    it("creates the partial composite due-unsent index", () => {
        expect(sql).toMatch(
            /CREATE INDEX "idx_campaign_due_unsent"\s+ON "assessment_campaigns" \("openAt"\)\s+WHERE "invitesSentAt" IS NULL AND "inviteSendStartedAt" IS NULL AND "deletedAt" IS NULL/,
        );
    });

    it("does NOT add a SCHEDULED value to AssessmentCampaignStatus", () => {
        expect(executableSql).not.toMatch(
            /ALTER TYPE "AssessmentCampaignStatus"/,
        );
        expect(executableSql).not.toMatch(/'SCHEDULED'/);
    });
});
