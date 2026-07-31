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
        expect(sql).toContain('CREATE TABLE "assessment_invitation_tokens"');
        expect(sql).toContain("CREATE UNIQUE INDEX");
        expect(sql).toContain('"invitationId"');
        expect(sql).toMatch(/ON DELETE CASCADE/);
        expect(sql).toMatch(/INSERT INTO "assessment_invitation_tokens"/);
        expect(sql).toMatch(/FROM "assessment_invitations"/);
        expect(sql).not.toMatch(/rawToken/i);
    });
});
