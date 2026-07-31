import { readFileSync } from "fs";
import path from "path";

const MIGRATION_PATH = path.join(
    process.cwd(),
    "prisma",
    "migrations",
    "20260731110000_add_stable_invitation_tokens",
    "migration.sql",
);

describe("stable invitation tokens migration", () => {
    it("creates token history and backfills existing invitations without raw tokens", () => {
        const sql = readFileSync(MIGRATION_PATH, "utf8");

        expect(sql).toContain('CREATE TYPE "AssessmentInvitationTokenSource"');
        expect(sql).toContain(
            'CREATE TYPE "AssessmentInvitationTokenDeliveryState"',
        );
        expect(sql).toMatch(
            /AssessmentInvitationTokenDeliveryState" AS ENUM \('STAGED', 'SENT', 'UNCERTAIN', 'REJECTED'\)/,
        );
        expect(sql).toContain('CREATE TABLE "assessment_invitation_tokens"');
        expect(sql).toMatch(
            /"previousTokenHash" TEXT,\s+"previousExpiresAt" TIMESTAMP\(3\),/,
        );
        expect(sql).toContain("CREATE UNIQUE INDEX");
        expect(sql).toContain('"invitationId"');
        expect(sql).toMatch(/ON DELETE CASCADE\s+ON UPDATE CASCADE/);
        expect(sql).toMatch(/INSERT INTO "assessment_invitation_tokens"/);
        expect(sql).toMatch(/FROM "assessment_invitations"/);
        expect(sql).not.toMatch(/rawToken/i);
    });

    it("backfills one legacy-current token with faithful delivery evidence", () => {
        const sql = readFileSync(MIGRATION_PATH, "utf8");

        expect(sql).toMatch(
            /'legacy_' \|\| "id"[\s\S]*?"tokenHash"[\s\S]*?'LEGACY_CURRENT'::"AssessmentInvitationTokenSource"/,
        );
        expect(sql).toMatch(
            /WHEN "status" IN \('SENT', 'VIEWED', 'SUBMITTED'\)\s+THEN 'SENT'::"AssessmentInvitationTokenDeliveryState"\s+ELSE 'UNCERTAIN'::"AssessmentInvitationTokenDeliveryState"/,
        );
        expect(sql).toMatch(
            /"sentAt",\s+"createdAt",\s+COALESCE\("sentAt", "createdAt"\)/,
        );
        expect(sql).toMatch(
            /CREATE UNIQUE INDEX "assessment_invitation_tokens_tokenHash_key"\s+ON "assessment_invitation_tokens"\("tokenHash"\)/,
        );
        expect(sql).toMatch(
            /CREATE INDEX "assessment_invitation_tokens_invitationId_previousTokenHash_idx"\s+ON "assessment_invitation_tokens"\("invitationId", "previousTokenHash"\)/,
        );
    });
});
