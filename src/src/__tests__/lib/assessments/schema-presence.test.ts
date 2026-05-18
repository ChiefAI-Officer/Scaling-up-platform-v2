/**
 * Assessment Tool v1 (v7.6) — Schema presence test.
 *
 * Asserts that the Prisma client exposes runtime delegates for every new
 * model in the v7.6 foundation slice. This is a compile-time + runtime guard:
 * if a model is removed from schema.prisma or renamed, this suite fails fast
 * before any feature code is touched.
 *
 * v7.6 deltas vs v7.5:
 *   - Removed: organizationMembership, templateAccessGrant (models dropped)
 *   - Added:   accessGroup, accessGroupCoach, accessGroupTemplate,
 *              organizationOwnershipEvent
 *   - Column presence assertions added for Organization.ownerCoachId and
 *     AssessmentCampaign.createdByCoachId via Prisma's runtime DMMF.
 *
 * Companion: ./migration-verification.test.ts asserts the actual database
 * objects (partial indexes, GIN index, immutability trigger) exist.
 */

import { PrismaClient, Prisma } from "@prisma/client";

describe("Assessment v7.6 schema presence", () => {
    const db = new PrismaClient();

    afterAll(async () => {
        await db.$disconnect();
    });

    const requiredDelegates: string[] = [
        "organization",
        "orgTeam",
        "orgRespondent",
        "assessmentTemplate",
        "assessmentTemplateVersion",
        "assessmentCampaign",
        "assessmentCampaignParticipant",
        "assessmentInvitation",
        "assessmentSubmission",
        "accessGroup",
        "accessGroupCoach",
        "accessGroupTemplate",
        "organizationOwnershipEvent",
    ];

    for (const key of requiredDelegates) {
        it(`exposes ${key} delegate`, () => {
            const delegate = (db as unknown as Record<string, unknown>)[key];
            expect(delegate).toBeDefined();
            expect(typeof (delegate as { findFirst?: unknown }).findFirst).toBe(
                "function",
            );
        });
    }

    describe("v7.6 columns on existing assessment models", () => {
        function findField(modelName: string, fieldName: string) {
            const model = Prisma.dmmf.datamodel.models.find(
                (m) => m.name === modelName,
            );
            expect(model).toBeDefined();
            const field = model!.fields.find((f) => f.name === fieldName);
            expect(field).toBeDefined();
            return field!;
        }

        it("Organization.ownerCoachId exists and is required", () => {
            const field = findField("Organization", "ownerCoachId");
            expect(field.type).toBe("String");
            expect(field.isRequired).toBe(true);
        });

        it("AssessmentCampaign.createdByCoachId exists and is nullable", () => {
            const field = findField(
                "AssessmentCampaign",
                "createdByCoachId",
            );
            expect(field.type).toBe("String");
            expect(field.isRequired).toBe(false);
        });
    });
});
